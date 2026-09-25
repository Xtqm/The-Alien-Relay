'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const cors = require('cors');
const express = require('express');
const { Server } = require('socket.io');

const DEFAULT_ROOM_SETTINGS = Object.freeze({
  minPlayers: 5,
  maxPlayers: 12,
  nightDurationSeconds: 20,
  dayDurationSeconds: 90,
  votingDurationSeconds: 30,
  resolutionDurationSeconds: 6,
  reconnectGraceSeconds: 20,
  waitingRoomEnabled: false,
});

const PHASES = Object.freeze([
  'LOBBY',
  'NIGHT',
  'DAY',
  'VOTING',
  'RESOLUTION',
  'GAME_OVER',
]);

const ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizePlayerName(value) {
  if (typeof value !== 'string') {
    throw new Error('Enter a player name.');
  }

  const name = [...value.trim()].slice(0, 16).join('');
  if (!name) {
    throw new Error('Player names cannot be blank.');
  }
  return name;
}

function normalizeRoomCode(value) {
  if (typeof value !== 'string') {
    throw new Error('Enter a 4-character room code.');
  }

  const roomCode = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(roomCode)) {
    throw new Error('Room codes must contain exactly 4 letters or numbers.');
  }
  return roomCode;
}

function normalizeRoomSettings(settings, base = DEFAULT_ROOM_SETTINGS) {
  if (settings !== undefined && !isPlainObject(settings)) {
    throw new Error('Room settings must be an object.');
  }

  const next = { ...base };
  const input = settings || {};
  const integerSetting = (key, minimum, maximum) => {
    if (input[key] === undefined) return;
    if (!Number.isInteger(input[key]) || input[key] < minimum || input[key] > maximum) {
      throw new Error(`${key} must be a whole number from ${minimum} to ${maximum}.`);
    }
    next[key] = input[key];
  };

  // The hard player-count and grace-period rules are server-owned. Hosts can
  // tune the three play-phase timers while the room is still in the lobby.
  integerSetting('nightDurationSeconds', 15, 30);
  integerSetting('dayDurationSeconds', 45, 180);
  integerSetting('votingDurationSeconds', 15, 60);
  if (input.waitingRoomEnabled !== undefined) {
    if (typeof input.waitingRoomEnabled !== 'boolean') {
      throw new Error('waitingRoomEnabled must be a boolean.');
    }
    next.waitingRoomEnabled = input.waitingRoomEnabled;
  }
  return next;
}

function createRoomCode(rooms) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let roomCode = '';
    for (let index = 0; index < 4; index += 1) {
      roomCode += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
    }
    if (!rooms.has(roomCode)) return roomCode;
  }
  throw new Error('Could not allocate a room code. Please try again.');
}

function timingSafeTokenMatches(storedToken, suppliedToken) {
  if (typeof storedToken !== 'string' || typeof suppliedToken !== 'string') return false;
  const stored = Buffer.from(storedToken);
  const supplied = Buffer.from(suppliedToken);
  return stored.length === supplied.length && crypto.timingSafeEqual(stored, supplied);
}

function getPlayerBySocketId(room, socketId) {
  return Object.values(room.players).find((player) => player.socketId === socketId) || null;
}

function getClientSettings(room) {
  const settings = { ...room.settings };
  if (room.fastTestMode) {
    settings.nightDurationSeconds = 2;
    settings.dayDurationSeconds = 2;
    settings.votingDurationSeconds = 2;
    settings.resolutionDurationSeconds = 2;
  }
  return settings;
}

/**
 * Return only the state this connected player is allowed to know.
 * Internal player records, roles, session credentials, vote targets, and
 * relay-chain metadata are never copied into the public player list.
 */
function sanitizeStateForPlayer(room, socketId) {
  const self = getPlayerBySocketId(room, socketId);
  if (!self) return null;

  const target = self.role === 'ALIEN' && self.infectedTargetId
    ? room.players[self.infectedTargetId]
    : null;

  const state = {
    roomId: room.id,
    phase: room.phase,
    roundNumber: room.roundNumber,
    timer: room.timer,
    settings: getClientSettings(room),
    players: Object.values(room.players)
      .sort((left, right) => left.joinOrder - right.joinOrder)
      .map((player) => ({
        id: player.id,
        name: player.name,
        isHost: player.isHost,
        isAlive: player.isAlive,
        isDisconnected: player.isDisconnected,
        hasVoted: player.votedFor !== null,
      })),
    myPlayerId: self.id,
    myRole: self.role,
    myInfectedTarget: target ? { id: target.id, name: target.name } : null,
    canInfectTonight: self.id === room.latestAlienId
      && room.chainActive
      && room.phase === 'NIGHT'
      && self.isAlive,
    hasSubmittedInfection: self.id === room.latestAlienId
      && room.phase === 'NIGHT'
      && Boolean(room.pendingNightTargetId),
    lastExiled: room.lastExiledPlayerId
      ? (() => {
        const exiled = room.players[room.lastExiledPlayerId];
        if (!exiled) return null;
        return {
          id: exiled.id,
          name: exiled.name,
          role: room.lastExiledRole,
          voteCount: room.lastExiledVoteCount,
        };
      })()
      : null,
    winner: room.winner,
  };

  // Full role and relay history is intentionally revealed only after the game.
  if (room.phase === 'GAME_OVER') {
    const allPlayerRoles = Object.values(room.players)
      .sort((left, right) => left.joinOrder - right.joinOrder)
      .map((player) => ({
        id: player.id,
        name: player.name,
        role: player.role,
        isAlive: player.isAlive,
      }));
    const infectionChainHistory = room.infectionHistory.map((entry) => ({ ...entry }));
    state.finalReveal = {
      players: allPlayerRoles,
      chainHistory: infectionChainHistory,
      infectionChainHistory,
      alphaAlienId: room.alphaAlienId,
      chainActive: room.chainActive,
      crewExiled: room.crewExiled,
    };
    // These explicit reveal fields are sent only after GAME_OVER. Active-phase
    // state keeps both the full manifest and historical relay nodes sealed.
    state.allPlayerRoles = allPlayerRoles;
    state.infectionChainHistory = infectionChainHistory;
  }

  return state;
}

function countLivingFactions(room) {
  const livingPlayers = Object.values(room.players).filter((player) => player.isAlive);
  const livingAliens = livingPlayers.filter((player) => player.role === 'ALIEN').length;
  return {
    livingPlayers: livingPlayers.length,
    livingAliens,
    livingHumans: livingPlayers.length - livingAliens,
  };
}

function getWinner(room) {
  const { livingAliens, livingHumans } = countLivingFactions(room);
  if (livingAliens === 0) return 'HUMANS';
  if (livingAliens >= livingHumans) return 'ALIENS';
  return null;
}

function createRelayServer(options = {}) {
  const fastTestMode = options.fastTestMode === undefined
    ? /^(1|true|yes)$/i.test(process.env.FAST_TEST_MODE || '')
    : Boolean(options.fastTestMode);
  const rooms = new Map();
  const app = express();
  const httpServer = http.createServer(app);
  const configuredOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
    : '*';
  const clientDistPath = path.join(__dirname, 'client', 'dist');
  const clientDistExists = fs.existsSync(clientDistPath);
  const serveClient = process.env.NODE_ENV === 'production' || clientDistExists;

  app.use(cors({ origin: configuredOrigins }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (_request, response) => response.json({ status: 'ok' }));

  if (serveClient) {
    app.use(express.static(clientDistPath));
    // Express 5 requires a RegExp or named wildcard for catch-all routes.
    // Keep API and Socket.IO paths outside the client-side router fallback.
    app.get(/.*/, (request, response, next) => {
      const requestPath = request.path || '/';
      if (
        requestPath === '/socket.io'
        || requestPath.startsWith('/socket.io/')
        || requestPath === '/api'
        || requestPath.startsWith('/api/')
      ) return next();

      const indexPath = path.join(clientDistPath, 'index.html');
      if (!fs.existsSync(indexPath)) return next();
      return response.sendFile(indexPath);
    });
  } else {
    app.get('/', (_request, response) => {
      response.json({ service: 'the-relay', status: 'ok' });
    });
  }

  const io = new Server(httpServer, {
    cors: {
      origin: configuredOrigins,
      methods: ['GET', 'POST'],
    },
  });

  function getPhaseDuration(room, phase) {
    if (room.fastTestMode) return 2;
    if (phase === 'NIGHT') return room.settings.nightDurationSeconds;
    if (phase === 'DAY') return room.settings.dayDurationSeconds;
    if (phase === 'VOTING') return room.settings.votingDurationSeconds;
    if (phase === 'RESOLUTION') return room.settings.resolutionDurationSeconds;
    return 0;
  }

  function syncRoom(room) {
    for (const player of Object.values(room.players)) {
      if (!player.socketId) continue;
      const state = sanitizeStateForPlayer(room, player.socketId);
      if (state) io.to(player.socketId).emit('game:state_sync', state);
    }
  }

  function getPendingApplicantList(room) {
    return Object.values(room.pendingApplicants)
      .sort((left, right) => left.requestedAt - right.requestedAt)
      .map(({ id, name, requestedAt }) => ({ id, name, requestedAt }));
  }

  function syncPendingApplicants(room) {
    const host = room.players[room.hostId];
    if (!host?.socketId) return;
    io.to(host.socketId).emit('room:pending_list_sync', getPendingApplicantList(room));
  }

  function sendApplicantRejection(applicantId, message = 'Entry denied by outpost commander.') {
    const applicantSocket = io.sockets.sockets.get(applicantId);
    if (!applicantSocket) return;
    applicantSocket.data.pendingRoomId = null;
    applicantSocket.emit('room:rejected', { message });
    // Let the rejection packet flush before closing the temporary connection.
    setTimeout(() => {
      const connectedSocket = io.sockets.sockets.get(applicantId);
      if (connectedSocket) connectedSocket.disconnect(true);
    }, 100);
  }

  function rejectAllPendingApplicants(room, message) {
    for (const applicantId of Object.keys(room.pendingApplicants)) {
      delete room.pendingApplicants[applicantId];
      sendApplicantRejection(applicantId, message);
    }
    syncPendingApplicants(room);
  }

  function admitApplicant(room, applicantId) {
    const applicant = room.pendingApplicants[applicantId];
    if (!applicant) return false;

    delete room.pendingApplicants[applicantId];
    const applicantSocket = io.sockets.sockets.get(applicantId);
    if (!applicantSocket?.connected) {
      syncPendingApplicants(room);
      return false;
    }
    if (Object.keys(room.players).length >= room.settings.maxPlayers) {
      sendApplicantRejection(applicantId, 'The outpost roster is full. Entry was not authorized.');
      syncPendingApplicants(room);
      return false;
    }

    const player = {
      id: crypto.randomUUID(),
      sessionId: applicant.sessionId,
      socketId: null,
      name: applicant.name,
      isHost: false,
      isAlive: true,
      isDisconnected: false,
      hasPermanentlyLeft: false,
      role: 'HUMAN',
      infectedTargetId: null,
      votedFor: null,
      joinOrder: room.nextJoinOrder++,
    };
    room.players[player.id] = player;
    applicantSocket.data.pendingRoomId = null;
    const session = attachSocketToPlayer(applicantSocket, room, player);
    applicantSocket.emit('room:admit_success', { roomId: room.id, playerId: player.id });
    syncPendingApplicants(room);
    return session;
  }

  function announce(room, text, type = 'info') {
    io.to(room.id).emit('game:announcement', { text, type });
  }

  function clearPhaseTimers(room) {
    if (room.phaseTimeout) clearTimeout(room.phaseTimeout);
    if (room.phaseTick) clearInterval(room.phaseTick);
    room.phaseTimeout = null;
    room.phaseTick = null;
    room.phaseRunId += 1;
  }

  function addChainEvent(room, event) {
    room.infectionHistory.push({ ...event, at: new Date().toISOString() });
  }

  function finishGame(room, winner = getWinner(room)) {
    if (room.phase === 'GAME_OVER') return;
    clearPhaseTimers(room);
    for (const timeout of room.disconnectTimers.values()) clearTimeout(timeout);
    room.disconnectTimers.clear();
    room.winner = winner || 'HUMANS';
    room.phase = 'GAME_OVER';
    room.timer = 0;
    room.phaseEndsAt = null;
    room.pendingNightTargetId = null;
    announce(room, `${room.winner === 'HUMANS' ? 'The humans' : 'The aliens'} win. All roles are revealed.`, 'alert');
    syncRoom(room);
  }

  function applyPendingNightInfection(room) {
    const targetId = room.pendingNightTargetId;
    room.pendingNightTargetId = null;
    if (!targetId || !room.chainActive) return;

    const infector = room.players[room.latestAlienId];
    const target = room.players[targetId];
    if (!infector || !infector.isAlive || !target || !target.isAlive) {
      addChainEvent(room, {
        kind: 'FAILED',
        status: 'FAILED',
        reason: 'TARGET_UNAVAILABLE',
        round: room.roundNumber,
        infectorId: infector?.id || room.latestAlienId,
        targetId,
      });
      return;
    }

    if (target.role === 'ALIEN') {
      room.chainActive = false;
      addChainEvent(room, {
        kind: 'COLLISION',
        status: 'COLLISION',
        round: room.roundNumber,
        infectorId: infector.id,
        targetId: target.id,
      });
      announce(room, 'Dawn breaks over the base.', 'info');
      return;
    }

    target.role = 'ALIEN';
    infector.infectedTargetId = target.id;
    room.latestAlienId = target.id;
    addChainEvent(room, {
      kind: 'INFECTION',
      status: 'SUCCESS',
      round: room.roundNumber,
      infectorId: infector.id,
      targetId: target.id,
    });
    announce(room, 'Dawn breaks over the base.', 'info');
  }

  function resolveVotes(room) {
    const voteCounts = new Map();
    let skipVotes = 0;

    for (const voter of Object.values(room.players)) {
      if (!voter.isAlive || voter.votedFor === null) continue;
      if (voter.votedFor === 'SKIP') {
        skipVotes += 1;
        continue;
      }
      const target = room.players[voter.votedFor];
      if (!target || !target.isAlive) continue;
      voteCounts.set(target.id, (voteCounts.get(target.id) || 0) + 1);
    }

    const highestPlayerVotes = Math.max(0, ...voteCounts.values());
    const leaders = [...voteCounts.entries()]
      .filter(([, count]) => count === highestPlayerVotes);
    let exiled = null;

    // A strict, unique plurality must beat both every other player and SKIP.
    if (highestPlayerVotes > skipVotes && leaders.length === 1) {
      exiled = room.players[leaders[0][0]];
      exiled.isAlive = false;
      room.crewExiled += 1;
      room.lastExiledPlayerId = exiled.id;
      room.lastExiledRole = exiled.role;
      room.lastExiledVoteCount = highestPlayerVotes;
      if (exiled.id === room.latestAlienId) {
        room.chainActive = false;
      addChainEvent(room, {
        kind: 'CHAIN_BROKEN',
        status: 'FAILED',
        reason: 'LATEST_ALIEN_EXILED',
          round: room.roundNumber,
          playerId: exiled.id,
        });
      }
      announce(room, `${exiled.name} was exiled. They were ${exiled.role}.`, 'alert');
    } else {
      room.lastExiledPlayerId = null;
      room.lastExiledRole = null;
      room.lastExiledVoteCount = null;
      announce(room, 'No one was exiled: the vote was tied or SKIP prevailed.', 'info');
    }

    room.winner = getWinner(room);
    enterTimedPhase(room, 'RESOLUTION');
  }

  function onPhaseTimer(room, phaseRunId) {
    if (room.phaseRunId !== phaseRunId) return;

    room.timer = 0;
    if (room.phase === 'NIGHT') {
      // Infection is resolved only after the entire night duration has elapsed.
      applyPendingNightInfection(room);
      const winner = getWinner(room);
      if (winner) {
        finishGame(room, winner);
        return;
      }
      enterTimedPhase(room, 'DAY');
      announce(room, 'The day discussion has begun.', 'info');
      return;
    }

    if (room.phase === 'DAY') {
      enterTimedPhase(room, 'VOTING');
      announce(room, 'Voting is now open.', 'info');
      return;
    }

    if (room.phase === 'VOTING') {
      resolveVotes(room);
      return;
    }

    if (room.phase === 'RESOLUTION') {
      if (room.winner) {
        finishGame(room, room.winner);
        return;
      }
      room.roundNumber += 1;
      for (const player of Object.values(room.players)) player.votedFor = null;
      enterTimedPhase(room, 'NIGHT');
      announce(room, `Night ${room.roundNumber} has begun.`, 'info');
    }
  }

  function enterTimedPhase(room, phase) {
    clearPhaseTimers(room);
    room.phase = phase;
    room.timer = getPhaseDuration(room, phase);
    room.phaseEndsAt = Date.now() + room.timer * 1000;
    const phaseRunId = room.phaseRunId;
    syncRoom(room);

    room.phaseTick = setInterval(() => {
      if (room.phaseRunId !== phaseRunId) return;
      const remaining = Math.max(0, Math.ceil((room.phaseEndsAt - Date.now()) / 1000));
      if (remaining !== room.timer) {
        room.timer = remaining;
        syncRoom(room);
      }
    }, 1000);

    room.phaseTimeout = setTimeout(() => onPhaseTimer(room, phaseRunId), room.timer * 1000);
  }

  function beginNight(room) {
    room.pendingNightTargetId = null;
    enterTimedPhase(room, 'NIGHT');
    announce(room, `Night ${room.roundNumber} has begun.`, 'info');
  }

  function migrateHost(room) {
    const currentHost = room.players[room.hostId];
    if (currentHost?.socketId && io.sockets.sockets.get(currentHost.socketId)?.connected) return;
    const nextHost = Object.values(room.players)
      .filter((player) => (
        player.socketId
        && io.sockets.sockets.get(player.socketId)?.connected
        && (room.phase === 'GAME_OVER' || player.isAlive)
      ))
      .sort((left, right) => left.joinOrder - right.joinOrder)[0];
    if (currentHost) currentHost.isHost = false;
    if (nextHost) {
      room.hostId = nextHost.id;
      nextHost.isHost = true;
    } else {
      room.hostId = null;
    }
  }

  function assignHostRandomly(room, excludedPlayerId) {
    for (const player of Object.values(room.players)) player.isHost = false;
    room.hostId = null;
    const candidates = Object.values(room.players).filter((player) => (
      player.id !== excludedPlayerId
      && player.socketId
      && !player.isDisconnected
      && io.sockets.sockets.get(player.socketId)?.connected
    ));
    if (candidates.length === 0) return null;

    const nextHost = candidates[crypto.randomInt(candidates.length)];
    nextHost.isHost = true;
    room.hostId = nextHost.id;
    return nextHost;
  }

  function clearDisconnectTimer(room, playerId) {
    const timeout = room.disconnectTimers.get(playerId);
    if (timeout) clearTimeout(timeout);
    room.disconnectTimers.delete(playerId);
  }

  function destroyRoom(room, rejectionMessage = 'The outpost is no longer available. Entry was not authorized.') {
    clearPhaseTimers(room);
    for (const timeout of room.disconnectTimers.values()) clearTimeout(timeout);
    room.disconnectTimers.clear();
    rejectAllPendingApplicants(room, rejectionMessage);
    if (rooms.get(room.id) === room) rooms.delete(room.id);
  }

  function announceHostAppointment(room, nextHost) {
    if (nextHost) announce(room, `${nextHost.name} has been appointed Outpost Commander.`, 'info');
  }

  function leaveRoom(socket, room, player) {
    clearDisconnectTimer(room, player.id);
    socket.data.roomId = null;
    socket.data.playerId = null;
    socket.leave(room.id);

    if (room.phase === 'LOBBY') {
      const wasHost = room.hostId === player.id;
      if (wasHost) player.isHost = false;
      player.sessionId = null;
      player.socketId = null;
      player.isDisconnected = true;
      delete room.players[player.id];
      if (wasHost) {
        const nextHost = assignHostRandomly(room, player.id);
        announceHostAppointment(room, nextHost);
      }

      if (Object.keys(room.players).length === 0) {
        destroyRoom(room);
      } else {
        syncRoom(room);
        syncPendingApplicants(room);
      }
    } else if (room.phase === 'GAME_OVER') {
      const wasHost = room.hostId === player.id;
      player.sessionId = null;
      player.socketId = null;
      player.isDisconnected = true;
      player.hasPermanentlyLeft = true;
      if (wasHost) {
        const nextHost = assignHostRandomly(room, player.id);
        announceHostAppointment(room, nextHost);
      }

      if (Object.values(room.players).every((candidate) => candidate.hasPermanentlyLeft)) {
        destroyRoom(room);
      } else {
        syncRoom(room);
        syncPendingApplicants(room);
      }
    } else {
      const wasHost = room.hostId === player.id;
      player.sessionId = null;
      player.socketId = null;
      player.isDisconnected = true;
      player.isAlive = false;
      player.hasPermanentlyLeft = true;

      if (room.pendingNightTargetId === player.id) room.pendingNightTargetId = null;
      if (room.latestAlienId === player.id && room.chainActive) {
        room.chainActive = false;
        room.pendingNightTargetId = null;
        addChainEvent(room, {
          kind: 'CHAIN_BROKEN',
          status: 'FAILED',
          reason: 'LATEST_ALIEN_ABANDONED',
          round: room.roundNumber,
          playerId: player.id,
        });
        announce(room, 'Signal decay // the active relay tip has abandoned the outpost.', 'alert');
      }

      if (wasHost) {
        const nextHost = assignHostRandomly(room, player.id);
        announceHostAppointment(room, nextHost);
      }

      const canReturn = Object.values(room.players).some((candidate) => (
        candidate.id !== player.id && !candidate.hasPermanentlyLeft
      ));
      if (!canReturn) {
        destroyRoom(room);
      } else {
        const winner = getWinner(room);
        if (winner) {
          finishGame(room, winner);
        } else {
          syncRoom(room);
          if (room.phase === 'VOTING' && allLivingPlayersVoted(room)) resolveVotes(room);
        }
      }
    }

    socket.emit('room:left_success', { roomId: room.id });
    return { left: true };
  }

  function removeLobbyPlayer(room, player) {
    if (player.socketId) {
      const connectedSocket = io.sockets.sockets.get(player.socketId);
      if (connectedSocket) connectedSocket.leave(room.id);
    }
    delete room.players[player.id];
    if (room.hostId === player.id) {
      room.hostId = null;
      migrateHost(room);
    }
    if (Object.keys(room.players).length === 0) {
      rejectAllPendingApplicants(room, 'The outpost is no longer available. Entry was not authorized.');
      clearPhaseTimers(room);
      rooms.delete(room.id);
      return;
    }
    syncRoom(room);
    syncPendingApplicants(room);
  }

  function markDisconnected(room, player) {
    player.socketId = null;
    player.isDisconnected = true;
    if (room.phase === 'LOBBY') {
      removeLobbyPlayer(room, player);
      return;
    }

    // A terminal manifest is immutable. A reconnect can still restore this
    // player's view, but a post-game disconnect must not alter match results.
    if (room.phase === 'GAME_OVER') {
      migrateHost(room);
      syncRoom(room);
      return;
    }

    // The spear tip cannot transmit while disconnected, so the chain snaps at
    // disconnect time. The player still gets their grace period to reconnect.
    if (room.latestAlienId === player.id && room.chainActive) {
      room.chainActive = false;
      addChainEvent(room, {
        kind: 'CHAIN_BROKEN',
        status: 'FAILED',
        reason: 'LATEST_ALIEN_DISCONNECTED',
        round: room.roundNumber,
        playerId: player.id,
      });
      announce(room, 'Signal decay // the active relay tip has lost connection.', 'alert');
    }

    migrateHost(room);
    syncRoom(room);
    const timeout = setTimeout(() => {
      const currentRoom = rooms.get(room.id);
      const currentPlayer = currentRoom && currentRoom.players[player.id];
      if (!currentRoom || !currentPlayer || currentPlayer.socketId || !currentPlayer.isDisconnected) return;

      currentRoom.disconnectTimers.delete(player.id);
      currentPlayer.isAlive = false;
      addChainEvent(currentRoom, {
        kind: 'PLAYER_DISCONNECTED',
        status: 'FAILED',
        round: currentRoom.roundNumber,
        playerId: currentPlayer.id,
      });
      announce(currentRoom, `${currentPlayer.name} has left the game.`, 'alert');

      const winner = getWinner(currentRoom);
      if (winner) {
        finishGame(currentRoom, winner);
        return;
      }
      syncRoom(currentRoom);
      if (currentRoom.phase === 'VOTING' && allLivingPlayersVoted(currentRoom)) {
        resolveVotes(currentRoom);
      }
    }, room.settings.reconnectGraceSeconds * 1000);
    room.disconnectTimers.set(player.id, timeout);
  }

  function allLivingPlayersVoted(room) {
    const livingPlayers = Object.values(room.players).filter((player) => player.isAlive);
    return livingPlayers.length > 0 && livingPlayers.every((player) => player.votedFor !== null);
  }

  function attachSocketToPlayer(socket, room, player) {
    const previousSocketId = player.socketId;
    if (previousSocketId && previousSocketId !== socket.id) {
      const previousSocket = io.sockets.sockets.get(previousSocketId);
      if (previousSocket) previousSocket.disconnect(true);
    }

    const graceTimer = room.disconnectTimers.get(player.id);
    if (graceTimer) clearTimeout(graceTimer);
    room.disconnectTimers.delete(player.id);
    player.socketId = socket.id;
    player.isDisconnected = false;
    socket.data.roomId = room.id;
    socket.data.playerId = player.id;
    socket.join(room.id);
    migrateHost(room);

    const session = { roomId: room.id, playerId: player.id, sessionId: player.sessionId };
    socket.emit('room:session', session);
    syncRoom(room);
    syncPendingApplicants(room);
    return session;
  }

  function getAuthenticatedPlayer(socket) {
    const room = rooms.get(socket.data.roomId);
    const player = room && room.players[socket.data.playerId];
    if (!room || !player || player.socketId !== socket.id) {
      throw new Error('Join or reconnect to a room before taking that action.');
    }
    return { room, player };
  }

  function handle(socket, eventName, handler) {
    socket.on(eventName, (payload, acknowledge) => {
      try {
        const result = handler(payload === undefined ? {} : payload) || {};
        if (typeof acknowledge === 'function') acknowledge({ ok: true, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The action could not be completed.';
        socket.emit('room:error', { event: eventName, message });
        if (typeof acknowledge === 'function') acknowledge({ ok: false, message });
      }
    });
  }

  io.on('connection', (socket) => {
    handle(socket, 'room:create', (payload) => {
      if (!isPlainObject(payload)) throw new Error('Room creation details must be an object.');
      if (socket.data.roomId || socket.data.pendingRoomId) throw new Error('This connection is already in a room or airlock queue.');
      const name = sanitizePlayerName(payload.playerName);
      const roomId = createRoomCode(rooms);
      const room = {
        id: roomId,
        phase: 'LOBBY',
        roundNumber: 0,
        timer: 0,
        phaseEndsAt: null,
        phaseTimeout: null,
        phaseTick: null,
        phaseRunId: 0,
        chainActive: true,
        alphaAlienId: null,
        latestAlienId: null,
        hostId: null,
        players: Object.create(null),
        pendingApplicants: Object.create(null),
        lastExiledPlayerId: null,
        lastExiledRole: null,
        lastExiledVoteCount: null,
        winner: null,
        settings: normalizeRoomSettings(payload.settings),
        pendingNightTargetId: null,
        infectionHistory: [],
        crewExiled: 0,
        nextJoinOrder: 0,
        disconnectTimers: new Map(),
        fastTestMode,
      };
      const player = {
        id: crypto.randomUUID(),
        sessionId: crypto.randomBytes(32).toString('hex'),
        socketId: null,
        name,
        isHost: true,
        isAlive: true,
        isDisconnected: false,
        hasPermanentlyLeft: false,
        role: 'HUMAN',
        infectedTargetId: null,
        votedFor: null,
        joinOrder: room.nextJoinOrder++,
      };
      room.hostId = player.id;
      room.players[player.id] = player;
      rooms.set(roomId, room);
      const session = attachSocketToPlayer(socket, room, player);
      return { ...session };
    });

    handle(socket, 'room:join', (payload) => {
      if (!isPlainObject(payload)) throw new Error('Room join details must be an object.');
      if (socket.data.roomId || socket.data.pendingRoomId) throw new Error('This connection is already in a room or airlock queue.');
      const roomId = normalizeRoomCode(payload.roomId);
      const room = rooms.get(roomId);
      if (!room) throw new Error('That room does not exist.');
      if (room.phase !== 'LOBBY') throw new Error('This game has already started.');
      if (Object.keys(room.players).length >= room.settings.maxPlayers) throw new Error('That room is full.');

      const name = sanitizePlayerName(payload.playerName);
      if (room.settings.waitingRoomEnabled) {
        if (Object.keys(room.players).length + Object.keys(room.pendingApplicants).length >= room.settings.maxPlayers) {
          throw new Error('That room has no remaining admission slots.');
        }
        const applicant = {
          id: socket.id,
          name,
          requestedAt: Date.now(),
          sessionId: crypto.randomBytes(32).toString('hex'),
        };
        room.pendingApplicants[socket.id] = applicant;
        socket.data.pendingRoomId = room.id;
        socket.emit('room:join_pending', {
          roomId: room.id,
          applicantId: socket.id,
          tempSessionId: applicant.sessionId,
          requestedAt: applicant.requestedAt,
        });
        syncPendingApplicants(room);
        const host = room.players[room.hostId];
        if (host?.socketId) {
          io.to(host.socketId).emit('game:announcement', {
            text: `${name} is requesting airlock clearance.`,
            type: 'info',
          });
        }
        return { pending: true, roomId: room.id };
      }

      const player = {
        id: crypto.randomUUID(),
        sessionId: crypto.randomBytes(32).toString('hex'),
        socketId: null,
        name,
        isHost: false,
        isAlive: true,
        isDisconnected: false,
        hasPermanentlyLeft: false,
        role: 'HUMAN',
        infectedTargetId: null,
        votedFor: null,
        joinOrder: room.nextJoinOrder++,
      };
      room.players[player.id] = player;
      const session = attachSocketToPlayer(socket, room, player);
      return { ...session };
    });

    handle(socket, 'room:reconnect', (payload) => {
      if (!isPlainObject(payload)) throw new Error('Reconnect details must be an object.');
      if (socket.data.roomId || socket.data.pendingRoomId) throw new Error('This connection is already in a room or airlock queue.');
      const roomId = normalizeRoomCode(payload.roomId);
      const room = rooms.get(roomId);
      if (!room) throw new Error('That room no longer exists.');
      if (typeof payload.sessionId !== 'string') throw new Error('A valid session is required to reconnect.');
      const player = Object.values(room.players).find((candidate) => (
        timingSafeTokenMatches(candidate.sessionId, payload.sessionId)
      ));
      if (!player) throw new Error('That reconnect session is invalid or expired.');
      return attachSocketToPlayer(socket, room, player);
    });

    handle(socket, 'room:toggle_waiting_room', (payload) => {
      const { room, player } = getAuthenticatedPlayer(socket);
      if (room.phase !== 'LOBBY') throw new Error('The airlock protocol can only change in the lobby.');
      if (player.id !== room.hostId) throw new Error('Only the host can change the airlock protocol.');
      if (!isPlainObject(payload) || typeof payload.enabled !== 'boolean') {
        throw new Error('Choose whether the airlock waiting room is enabled.');
      }

      room.settings.waitingRoomEnabled = payload.enabled;
      if (!payload.enabled) {
        for (const applicantId of Object.keys(room.pendingApplicants)) {
          admitApplicant(room, applicantId);
        }
      }
      syncRoom(room);
      syncPendingApplicants(room);
      return { waitingRoomEnabled: room.settings.waitingRoomEnabled };
    });

    handle(socket, 'room:admit_applicant', (payload) => {
      const { room, player } = getAuthenticatedPlayer(socket);
      if (room.phase !== 'LOBBY') throw new Error('Applicants can only be admitted while the lobby is open.');
      if (player.id !== room.hostId) throw new Error('Only the host can admit applicants.');
      if (!isPlainObject(payload) || typeof payload.applicantId !== 'string') {
        throw new Error('Choose an applicant to admit.');
      }
      const session = admitApplicant(room, payload.applicantId);
      if (!session) throw new Error('That admission request is no longer available.');
      return { playerId: session.playerId };
    });

    handle(socket, 'room:reject_applicant', (payload) => {
      const { room, player } = getAuthenticatedPlayer(socket);
      if (room.phase !== 'LOBBY') throw new Error('Applicants can only be denied while the lobby is open.');
      if (player.id !== room.hostId) throw new Error('Only the host can deny applicants.');
      if (!isPlainObject(payload) || typeof payload.applicantId !== 'string') {
        throw new Error('Choose an applicant to deny.');
      }
      const applicant = room.pendingApplicants[payload.applicantId];
      if (!applicant) throw new Error('That admission request is no longer available.');
      delete room.pendingApplicants[payload.applicantId];
      sendApplicantRejection(applicant.id, 'Entry denied by outpost commander.');
      syncPendingApplicants(room);
      return {};
    });

    handle(socket, 'room:cancel_pending', () => {
      const room = rooms.get(socket.data.pendingRoomId);
      const applicant = room?.pendingApplicants[socket.id];
      if (!room || !applicant) {
        socket.data.pendingRoomId = null;
        return { cancelled: false };
      }
      delete room.pendingApplicants[socket.id];
      socket.data.pendingRoomId = null;
      syncPendingApplicants(room);
      const host = room.players[room.hostId];
      if (host?.socketId) {
        io.to(host.socketId).emit('game:announcement', {
          text: `${applicant.name} withdrew their airlock request.`,
          type: 'info',
        });
      }
      return { cancelled: true };
    });

    handle(socket, 'room:update_settings', (payload) => {
      const { room, player } = getAuthenticatedPlayer(socket);
      if (room.phase !== 'LOBBY') throw new Error('Room settings cannot change after the game starts.');
      if (player.id !== room.hostId) throw new Error('Only the host can change room settings.');
      if (!isPlainObject(payload)) throw new Error('Room settings must be an object.');
      room.settings = normalizeRoomSettings(payload.settings, room.settings);
      syncRoom(room);
      return { settings: getClientSettings(room) };
    });

    handle(socket, 'game:start', () => {
      const { room, player } = getAuthenticatedPlayer(socket);
      if (room.phase !== 'LOBBY') throw new Error('The game has already started.');
      if (player.id !== room.hostId) throw new Error('Only the host can start the game.');
      const players = Object.values(room.players).filter((candidate) => candidate.isAlive && candidate.socketId);
      if (players.length < room.settings.minPlayers) {
        throw new Error(`At least ${room.settings.minPlayers} connected players are required.`);
      }

      rejectAllPendingApplicants(room, 'The mission has begun. New admissions are closed.');

      const alpha = players[crypto.randomInt(players.length)];
      room.alphaAlienId = alpha.id;
      room.latestAlienId = alpha.id;
      room.chainActive = true;
      room.roundNumber = 1;
      alpha.role = 'ALIEN';
      addChainEvent(room, {
        kind: 'ALPHA',
        status: 'ALPHA',
        round: 1,
        playerId: alpha.id,
      });
      beginNight(room);
      return {};
    });

    handle(socket, 'room:play_again', () => {
      const { room, player } = getAuthenticatedPlayer(socket);
      if (room.phase !== 'GAME_OVER') throw new Error('A new mission can only begin after the current game ends.');
      if (player.id !== room.hostId) throw new Error('Only the host can initialize a new mission.');

      clearPhaseTimers(room);
      for (const timeout of room.disconnectTimers.values()) clearTimeout(timeout);
      room.disconnectTimers.clear();

      for (const candidate of Object.values(room.players)) {
        if (!candidate.socketId) {
          delete room.players[candidate.id];
          continue;
        }
        candidate.isAlive = true;
        candidate.isDisconnected = false;
        candidate.role = 'HUMAN';
        candidate.infectedTargetId = null;
        candidate.votedFor = null;
      }

      room.phase = 'LOBBY';
      room.roundNumber = 0;
      room.timer = 0;
      room.phaseEndsAt = null;
      room.chainActive = true;
      room.alphaAlienId = null;
      room.latestAlienId = null;
      room.pendingNightTargetId = null;
      room.lastExiledPlayerId = null;
      room.lastExiledRole = null;
      room.lastExiledVoteCount = null;
      room.winner = null;
      room.infectionHistory = [];
      room.crewExiled = 0;
      migrateHost(room);
      announce(room, 'Mission archive cleared. Crew assembly is open.', 'info');
      syncRoom(room);
      return {};
    });

    handle(socket, 'night:infect', (payload) => {
      const { room, player } = getAuthenticatedPlayer(socket);
      if (room.phase !== 'NIGHT') throw new Error('Infection can only be chosen during the night.');
      if (!player.isAlive) throw new Error('Eliminated players cannot infect anyone.');
      if (!room.chainActive || player.id !== room.latestAlienId) {
        throw new Error('You are not the active relay tip.');
      }
      if (room.pendingNightTargetId) throw new Error('An infection choice has already been submitted tonight.');
      if (!isPlainObject(payload) || typeof payload.targetPlayerId !== 'string') {
        throw new Error('Choose a player to infect.');
      }
      const target = room.players[payload.targetPlayerId];
      if (!target || !target.isAlive) throw new Error('Choose a living player in this room.');
      if (target.id === player.id) throw new Error('You cannot choose yourself as an infection target.');

      // This stays private and pending until night expiry. No state update or
      // phase transition reveals when the active alien made the choice.
      room.pendingNightTargetId = target.id;
      return {};
    });

    handle(socket, 'vote:cast', (payload) => {
      const { room, player } = getAuthenticatedPlayer(socket);
      if (room.phase !== 'VOTING') throw new Error('Votes can only be cast during voting.');
      if (!player.isAlive) throw new Error('Eliminated players cannot vote.');
      if (!isPlainObject(payload) || typeof payload.targetPlayerId !== 'string') {
        throw new Error('Choose a player or SKIP.');
      }

      const targetId = payload.targetPlayerId;
      if (targetId !== 'SKIP') {
        const target = room.players[targetId];
        if (!target || !target.isAlive) throw new Error('Choose a living player or SKIP.');
      }
      player.votedFor = targetId;
      syncRoom(room);
      if (allLivingPlayersVoted(room)) resolveVotes(room);
      return {};
    });

    handle(socket, 'room:leave', () => {
      const { room, player } = getAuthenticatedPlayer(socket);
      return leaveRoom(socket, room, player);
    });

    socket.on('disconnect', () => {
      const pendingRoom = rooms.get(socket.data.pendingRoomId);
      const pendingApplicant = pendingRoom?.pendingApplicants[socket.id];
      if (pendingRoom && pendingApplicant) {
        delete pendingRoom.pendingApplicants[socket.id];
        socket.data.pendingRoomId = null;
        syncPendingApplicants(pendingRoom);
        const host = pendingRoom.players[pendingRoom.hostId];
        if (host?.socketId) {
          io.to(host.socketId).emit('game:announcement', {
            text: `${pendingApplicant.name} withdrew their airlock request.`,
            type: 'info',
          });
        }
        return;
      }
      const room = rooms.get(socket.data.roomId);
      const player = room && room.players[socket.data.playerId];
      // A superseded connection must not mark the player's new connection offline.
      if (!room || !player || player.socketId !== socket.id) return;
      markDisconnected(room, player);
    });
  });

  function listen(port = Number(process.env.PORT || 3000), host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      const onError = (error) => reject(error);
      httpServer.once('error', onError);
      httpServer.listen(port, host, () => {
        httpServer.off('error', onError);
        resolve(httpServer.address());
      });
    });
  }

  function close() {
    const clearAllRoomTimers = () => {
      for (const room of rooms.values()) {
        clearPhaseTimers(room);
        for (const timeout of room.disconnectTimers.values()) clearTimeout(timeout);
        room.disconnectTimers.clear();
      }
    };

    clearAllRoomTimers();
    return new Promise((resolve) => io.close(() => {
      // Socket.IO can emit final disconnect callbacks while closing. Clear any
      // reconnect grace timers those callbacks created before returning.
      clearAllRoomTimers();
      resolve();
    }));
  }

  return { app, httpServer, io, rooms, fastTestMode, listen, close };
}

function startRelayServer() {
  const relayServer = createRelayServer();
  relayServer.listen().then((address) => {
    const port = typeof address === 'object' && address ? address.port : process.env.PORT || 3000;
    console.log(`The Relay server is listening on port ${port}.`);
  }).catch((error) => {
    console.error('The Relay server could not start:', error);
    process.exitCode = 1;
  });

  const shutdown = () => relayServer.close().finally(() => process.exit());
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return relayServer;
}

if (require.main === module) startRelayServer();

module.exports = {
  DEFAULT_ROOM_SETTINGS,
  PHASES,
  createRelayServer,
  getWinner,
  sanitizePlayerName,
  sanitizeStateForPlayer,
  startRelayServer,
};

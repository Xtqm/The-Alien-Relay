'use strict';

// This script starts an isolated in-memory server with two-second phases, then
// drives five real Socket.IO clients through airlock admission and two matches.
process.env.FAST_TEST_MODE = 'true';

const assert = require('node:assert/strict');
const { io: createSocketClient } = require('socket.io-client');
const { createRelayServer } = require('./server');

const PLAYER_NAMES = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery'];
const clients = [];
const auxiliaryClients = [];
const latestStates = new Map();
const loggedPhases = new Map();

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function emitWithAck(socket, eventName, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.emit(eventName, payload, (response) => {
      if (!response || response.ok !== true) {
        const error = new Error(response && response.message ? response.message : `${eventName} failed.`);
        error.code = response?.code || 'SERVER_REJECTED';
        if (Number.isFinite(response?.retryAfter)) error.retryAfter = response.retryAfter;
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}

function waitForState(client, predicate, timeoutMilliseconds = 8000) {
  const current = latestStates.get(client.name);
  if (current && predicate(current)) return Promise.resolve(current);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.socket.off('game:state_sync', onState);
      reject(new Error(`Timed out waiting for ${client.name}'s state.`));
    }, timeoutMilliseconds);

    function onState(state) {
      if (!predicate(state)) return;
      clearTimeout(timeout);
      client.socket.off('game:state_sync', onState);
      resolve(state);
    }

    client.socket.on('game:state_sync', onState);
  });
}

async function waitForAll(clientsToWaitFor, predicate) {
  return Promise.all(clientsToWaitFor.map((client) => waitForState(client, predicate)));
}

async function waitForCondition(predicate, message, timeoutMilliseconds = 2000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await delay(10);
  }
}

function logState(client, state) {
  const phaseKey = `${state.roundNumber}:${state.phase}`;
  if (loggedPhases.get(client.name) === phaseKey) return;
  loggedPhases.set(client.name, phaseKey);
  console.log(`[${client.name}] ${phaseKey}`);
}

function wireClient(client) {
  const { socket } = client;
  socket.on('room:session', (session) => { client.session = session; });
  socket.on('room:left_success', (info) => { client.leftSuccess = info; });
  socket.on('game:announcement', (announcement) => { client.announcements.push(announcement); });
  socket.on('room:join_pending', (info) => { client.joinPending = info; });
  socket.on('room:admit_success', (info) => { client.admitSuccess = info; });
  socket.on('room:rejected', (info) => { client.rejection = info; });
  socket.on('room:kicked', (info) => { client.kickedReason = info?.message || ''; });
  socket.on('room:pending_list_sync', (applicants) => { client.pendingApplicants = applicants; });
  socket.on('room:error', (error) => { client.roomErrors.push(error); });
  socket.on('game:state_sync', (state) => {
    latestStates.set(client.name, state);
    logState(client, state);
  });
}

async function createTestClient(serverUrl, name) {
  const socket = createSocket(serverUrl);
  const client = {
    name,
    socket,
    session: null,
    leftSuccess: null,
    announcements: [],
    joinPending: null,
    admitSuccess: null,
    rejection: null,
    kickedReason: '',
    pendingApplicants: [],
    roomErrors: [],
  };
  wireClient(client);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return client;
}

function createSocket(serverUrl) {
  return createSocketClient(serverUrl, {
    transports: ['websocket'],
    reconnection: false,
  });
}

async function verifyVoluntaryLeaves(serverUrl, server) {
  const trackedClient = async (name) => {
    const client = await createTestClient(serverUrl, name);
    auxiliaryClients.push(client);
    return client;
  };

  const regularHost = await trackedClient('LeaveHost');
  const regularLeaver = await trackedClient('LeaveCrew');
  const regularObserver = await trackedClient('LeaveObserver');
  const regularRoom = await emitWithAck(regularHost.socket, 'room:create', { playerName: regularHost.name });
  await emitWithAck(regularLeaver.socket, 'room:join', { roomId: regularRoom.roomId, playerName: regularLeaver.name });
  await emitWithAck(regularObserver.socket, 'room:join', { roomId: regularRoom.roomId, playerName: regularObserver.name });
  await waitForAll([regularHost, regularLeaver, regularObserver], (state) => state.phase === 'LOBBY');
  const oldRegularSession = { ...regularLeaver.session };
  await emitWithAck(regularLeaver.socket, 'room:leave');
  await waitForCondition(() => Boolean(regularLeaver.leftSuccess), 'A voluntary lobby departure was not acknowledged.');
  const regularHostState = await waitForState(regularHost, (state) => state.players.length === 2);
  assert.ok(!regularHostState.players.some((player) => player.id === oldRegularSession.playerId));
  assert.equal(server.rooms.get(regularRoom.roomId).players[oldRegularSession.playerId], undefined);
  assert.equal(server.rooms.get(regularRoom.roomId).disconnectTimers.size, 0, 'a voluntary lobby leave must not create a reconnect timer');

  const staleSessionClient = await trackedClient('StaleSession');
  await assert.rejects(
    emitWithAck(staleSessionClient.socket, 'room:reconnect', {
      roomId: regularRoom.roomId,
      sessionId: oldRegularSession.sessionId,
    }),
    /That reconnect session is invalid or expired\./,
    'a voluntarily departed seat must not be recoverable with its old session token',
  );

  const departingHost = await trackedClient('DepartingHost');
  const migrationCandidateA = await trackedClient('MigrationA');
  const migrationCandidateB = await trackedClient('MigrationB');
  const migrationRoom = await emitWithAck(departingHost.socket, 'room:create', { playerName: departingHost.name });
  await emitWithAck(migrationCandidateA.socket, 'room:join', { roomId: migrationRoom.roomId, playerName: migrationCandidateA.name });
  await emitWithAck(migrationCandidateB.socket, 'room:join', { roomId: migrationRoom.roomId, playerName: migrationCandidateB.name });
  await waitForAll([departingHost, migrationCandidateA, migrationCandidateB], (state) => state.phase === 'LOBBY');
  await emitWithAck(departingHost.socket, 'room:leave');
  const migrationStates = await waitForAll(
    [migrationCandidateA, migrationCandidateB],
    (state) => state.players.length === 2 && state.players.some((player) => player.isHost),
  );
  const migratedRoom = server.rooms.get(migrationRoom.roomId);
  assert.ok([migrationCandidateA.session.playerId, migrationCandidateB.session.playerId].includes(migratedRoom.hostId));
  assert.ok(migrationStates.some((state) => state.players.find((player) => player.id === state.myPlayerId)?.isHost));
  assert.ok(
    [...migrationCandidateA.announcements, ...migrationCandidateB.announcements]
      .some((announcement) => /has been appointed Outpost Commander\./.test(announcement.text)),
    'the new lobby host must be announced to the remaining crew',
  );

  const finalLobbyHost = await trackedClient('FinalLobbyHost');
  const finalLobby = await emitWithAck(finalLobbyHost.socket, 'room:create', { playerName: finalLobbyHost.name });
  await emitWithAck(finalLobbyHost.socket, 'room:leave');
  assert.equal(server.rooms.has(finalLobby.roomId), false, 'the last lobby departure must delete the room');

  const activeCrew = await Promise.all(['ActiveHost', 'ActiveB', 'ActiveC', 'ActiveD', 'ActiveE'].map(trackedClient));
  const activeCreated = await emitWithAck(activeCrew[0].socket, 'room:create', { playerName: activeCrew[0].name });
  for (const client of activeCrew.slice(1)) {
    await emitWithAck(client.socket, 'room:join', { roomId: activeCreated.roomId, playerName: client.name });
  }
  await waitForAll(activeCrew, (state) => state.phase === 'LOBBY');
  const activeRoom = server.rooms.get(activeCreated.roomId);
  activeRoom.fastTestMode = false;
  activeRoom.settings.nightDurationSeconds = 30;
  await emitWithAck(activeCrew[0].socket, 'game:start');
  await waitForAll(activeCrew, (state) => state.phase === 'NIGHT');

  const hostRecord = activeRoom.players[activeCrew[0].session.playerId];
  const tipClient = activeCrew.find((client) => client.session.playerId !== hostRecord.id);
  const tipRecord = activeRoom.players[tipClient.session.playerId];
  for (const player of Object.values(activeRoom.players)) player.role = 'HUMAN';
  tipRecord.role = 'ALIEN';
  activeRoom.alphaAlienId = tipRecord.id;
  activeRoom.latestAlienId = tipRecord.id;
  activeRoom.chainActive = true;

  await emitWithAck(activeCrew[0].socket, 'room:leave');
  assert.equal(hostRecord.isAlive, false, 'a host abandoning an active game must be eliminated immediately');
  assert.equal(hostRecord.isDisconnected, true);
  assert.equal(hostRecord.hasPermanentlyLeft, true);
  assert.equal(activeRoom.disconnectTimers.has(hostRecord.id), false, 'a voluntary active leave must skip reconnect grace');
  assert.ok(activeRoom.hostId && activeRoom.hostId !== hostRecord.id, 'an active departure must assign authority to a remaining player');
  assert.equal(activeRoom.phase, 'NIGHT', 'one departure must not prematurely resolve a still-playable match');

  await emitWithAck(tipClient.socket, 'room:leave');
  assert.equal(activeRoom.chainActive, false, 'a departing relay tip must sever the infection chain immediately');
  assert.ok(activeRoom.infectionHistory.some((entry) => entry.reason === 'LATEST_ALIEN_ABANDONED'));
  assert.equal(activeRoom.disconnectTimers.has(tipRecord.id), false);
  const activeSurvivors = activeCrew.filter((client) => client !== activeCrew[0] && client !== tipClient);
  const humanVictory = await waitForState(activeSurvivors[0], (state) => state.phase === 'GAME_OVER');
  assert.equal(humanVictory.winner, 'HUMANS', 'leaving as the last alien must resolve the match immediately');

  const replayHost = activeRoom.players[activeRoom.hostId];
  const replayHostClient = activeSurvivors.find((client) => client.session.playerId === replayHost.id);
  assert.ok(replayHostClient, 'the replacement host must remain connected and able to initialize a rematch');
  await emitWithAck(replayHostClient.socket, 'room:play_again');
  await waitForAll(activeSurvivors, (state) => state.phase === 'LOBBY' && state.players.length === 3);
  for (const client of activeSurvivors) await emitWithAck(client.socket, 'room:leave');
  assert.equal(server.rooms.has(activeCreated.roomId), false, 'the room must be deleted after every participant voluntarily leaves');
}

async function verifyHostKicks(serverUrl, server) {
  const trackedClient = async (name) => {
    const client = await createTestClient(serverUrl, name);
    auxiliaryClients.push(client);
    return client;
  };

  const lobbyHost = await trackedClient('KickHost');
  const lobbyTarget = await trackedClient('LobbyTarget');
  const lobbyObserver = await trackedClient('LobbyObserver');
  const lobbyCreated = await emitWithAck(lobbyHost.socket, 'room:create', { playerName: lobbyHost.name });
  await emitWithAck(lobbyTarget.socket, 'room:join', { roomId: lobbyCreated.roomId, playerName: lobbyTarget.name });
  await emitWithAck(lobbyObserver.socket, 'room:join', { roomId: lobbyCreated.roomId, playerName: lobbyObserver.name });
  await waitForAll([lobbyHost, lobbyTarget, lobbyObserver], (state) => state.phase === 'LOBBY');

  const lobbyTargetSession = { ...lobbyTarget.session };
  await assert.rejects(
    emitWithAck(lobbyTarget.socket, 'room:kick_player', { targetPlayerId: lobbyObserver.session.playerId }),
    /Unauthorized: Only the Outpost Commander can kick players\./,
    'non-hosts must not be able to kick players',
  );
  await assert.rejects(
    emitWithAck(lobbyHost.socket, 'room:kick_player', { targetPlayerId: lobbyHost.session.playerId }),
    /Invalid target player for dismissal\./,
    'the host must not be able to kick themselves',
  );
  await assert.rejects(
    emitWithAck(lobbyHost.socket, 'room:kick_player', { targetPlayerId: 'missing-player-id' }),
    /Invalid target player for dismissal\./,
    'the host must not be able to kick a nonexistent player',
  );

  await emitWithAck(lobbyHost.socket, 'room:kick_player', { targetPlayerId: lobbyTargetSession.playerId });
  await waitForCondition(() => Boolean(lobbyTarget.kickedReason), 'Lobby target did not receive a dismissal event.');
  assert.equal(lobbyTarget.kickedReason, 'You have been dismissed from the outpost by the Commander.');
  assert.equal(lobbyTarget.socket.connected, true, 'kicking must leave the connection ready for a future landing-screen action');
  assert.equal(server.rooms.get(lobbyCreated.roomId).players[lobbyTargetSession.playerId], undefined);
  assert.equal(lobbyTarget.session.sessionId, lobbyTargetSession.sessionId, 'the test retains only its local stale token');
  const lobbyHostState = await waitForState(lobbyHost, (state) => state.players.length === 2);
  assert.ok(!lobbyHostState.players.some((player) => player.id === lobbyTargetSession.playerId));
  await waitForCondition(
    () => lobbyHost.announcements.some((announcement) => (
      announcement.text === 'LobbyTarget was dismissed from the outpost by KickHost.'
    )),
    'Remaining lobby members did not receive the dismissal announcement.',
  );
  await assert.rejects(
    emitWithAck(lobbyTarget.socket, 'room:reconnect', {
      roomId: lobbyCreated.roomId,
      sessionId: lobbyTargetSession.sessionId,
    }),
    /That reconnect session is invalid or expired\./,
    'a lobby kick must invalidate the server-side reconnect token',
  );

  const activeCrew = await Promise.all(['KickCommander', 'TipCandidate', 'HumanTarget', 'KickCrewD', 'KickCrewE'].map(trackedClient));
  const activeCreated = await emitWithAck(activeCrew[0].socket, 'room:create', { playerName: activeCrew[0].name });
  for (const client of activeCrew.slice(1)) {
    await emitWithAck(client.socket, 'room:join', { roomId: activeCreated.roomId, playerName: client.name });
  }
  await waitForAll(activeCrew, (state) => state.phase === 'LOBBY');
  await emitWithAck(activeCrew[0].socket, 'game:start');
  await waitForAll(activeCrew, (state) => state.phase === 'NIGHT');

  const activeRoom = server.rooms.get(activeCreated.roomId);
  const tip = activeRoom.players[activeCrew[1].session.playerId];
  const humanTarget = activeRoom.players[activeCrew[2].session.playerId];
  for (const player of Object.values(activeRoom.players)) player.role = 'HUMAN';
  tip.role = 'ALIEN';
  activeRoom.alphaAlienId = tip.id;
  activeRoom.latestAlienId = tip.id;
  activeRoom.chainActive = true;
  const humanTargetSession = { ...activeCrew[2].session };

  await waitForAll(activeCrew, (state) => state.phase === 'DAY');
  await waitForAll(activeCrew, (state) => state.phase === 'VOTING');
  await emitWithAck(activeCrew[0].socket, 'room:kick_player', { targetPlayerId: humanTarget.id });
  await waitForCondition(() => Boolean(activeCrew[2].kickedReason), 'Active target did not receive a dismissal event.');
  assert.equal(activeCrew[2].kickedReason, 'You have been exiled from the outpost by the Commander.');
  assert.equal(humanTarget.isAlive, false, 'a kicked active player must be eliminated immediately');
  assert.equal(humanTarget.isDisconnected, true);
  assert.equal(humanTarget.hasPermanentlyLeft, true);
  assert.equal(humanTarget.sessionId, null, 'active kicks must invalidate reconnect credentials');
  assert.equal(humanTarget.socketId, null);
  assert.equal(activeRoom.phase, 'VOTING', 'a continuing match must retain its current phase timer');
  assert.equal(activeRoom.chainActive, true, 'kicking a human must leave the relay chain intact');

  const activeSurvivors = activeCrew.filter((client) => client !== activeCrew[2]);
  const updatedManifest = await waitForState(activeCrew[0], (state) => (
    state.phase === 'VOTING'
    && state.players.find((player) => player.id === humanTargetSession.playerId)?.isAlive === false
    && state.players.find((player) => player.id === humanTargetSession.playerId)?.isDisconnected === true
  ));
  assert.equal(updatedManifest.players.length, 5, 'active kicks retain an eliminated seat in the match manifest');
  await Promise.all(activeSurvivors.map((client) => emitWithAck(client.socket, 'vote:cast', { targetPlayerId: 'SKIP' })));
  await waitForAll(activeSurvivors, (state) => state.phase === 'RESOLUTION');
  await waitForAll(activeSurvivors, (state) => state.phase === 'NIGHT' && state.roundNumber === 2);

  const tipSession = { ...activeCrew[1].session };
  await emitWithAck(activeCrew[0].socket, 'room:kick_player', { targetPlayerId: tip.id });
  await waitForCondition(() => Boolean(activeCrew[1].kickedReason), 'Kicked relay tip did not receive a dismissal event.');
  assert.equal(activeRoom.chainActive, false, 'kicking the relay tip must sever the chain immediately');
  assert.ok(activeRoom.infectionHistory.some((entry) => entry.reason === 'LATEST_ALIEN_KICKED'));
  assert.equal(activeRoom.phase, 'GAME_OVER', 'removing the final living alien must trigger an immediate human victory');
  assert.equal(activeRoom.winner, 'HUMANS');
  assert.equal(tip.sessionId, null, 'the kicked relay tip must lose reconnect credentials');
  const activeFinal = await waitForState(activeCrew[0], (state) => state.phase === 'GAME_OVER');
  assert.equal(activeFinal.finalReveal.chainActive, false);
  assert.ok(activeFinal.infectionChainHistory.some((entry) => entry.reason === 'LATEST_ALIEN_KICKED'));
  await assert.rejects(
    emitWithAck(activeCrew[1].socket, 'room:reconnect', {
      roomId: activeCreated.roomId,
      sessionId: tipSession.sessionId,
    }),
    /That reconnect session is invalid or expired\./,
    'an active-match kick must not be recoverable by refreshing the browser',
  );
}

async function verifyLobbyHostTransfer(serverUrl, server) {
  const commander = await createTestClient(serverUrl, 'TransferHost');
  const candidate = await createTestClient(serverUrl, 'TransferCandidate');
  const observer = await createTestClient(serverUrl, 'TransferObserver');
  auxiliaryClients.push(commander, candidate, observer);

  const created = await emitWithAck(commander.socket, 'room:create', { playerName: commander.name });
  await emitWithAck(candidate.socket, 'room:join', { roomId: created.roomId, playerName: candidate.name });
  await emitWithAck(observer.socket, 'room:join', { roomId: created.roomId, playerName: observer.name });
  await waitForAll([commander, candidate, observer], (state) => state.phase === 'LOBBY');

  const candidateId = candidate.session.playerId;
  const observerId = observer.session.playerId;
  await assert.rejects(
    emitWithAck(candidate.socket, 'room:transfer_host', { targetPlayerId: observerId }),
    /Unauthorized: Only the Outpost Commander can transfer authority\./,
    'non-host players must not transfer command authority',
  );
  await assert.rejects(
    emitWithAck(commander.socket, 'room:transfer_host', { targetPlayerId: commander.session.playerId }),
    /Invalid player selected for commander promotion\./,
    'the host must not transfer authority to themselves',
  );
  await assert.rejects(
    emitWithAck(commander.socket, 'room:transfer_host', { targetPlayerId: 'missing-player-id' }),
    /Invalid player selected for commander promotion\./,
    'the host must not transfer authority to a nonexistent player',
  );

  await emitWithAck(commander.socket, 'room:transfer_host', { targetPlayerId: candidateId });
  await waitForAll([commander, candidate, observer], (state) => (
    state.phase === 'LOBBY'
    && state.players.find((player) => player.id === candidateId)?.isHost === true
    && state.players.find((player) => player.id === commander.session.playerId)?.isHost === false
  ));
  const room = server.rooms.get(created.roomId);
  assert.equal(room.hostId, candidateId, 'the room host reference must follow the commander transfer');
  assert.equal(room.players[commander.session.playerId].isHost, false);
  assert.equal(room.players[candidateId].isHost, true);
  await waitForCondition(
    () => commander.announcements.some((entry) => entry.text === `${room.players[candidateId].name} has been appointed Outpost Commander by ${room.players[commander.session.playerId].name}.`),
    'The commander appointment announcement was not broadcast.',
  );
  await assert.rejects(
    emitWithAck(commander.socket, 'room:transfer_host', { targetPlayerId: observerId }),
    /Unauthorized: Only the Outpost Commander can transfer authority\./,
    'a former host must lose transfer authority immediately',
  );

  for (const client of [commander, candidate, observer]) await emitWithAck(client.socket, 'room:leave');
}

async function verifyJoinRateLimit(serverUrl, server) {
  const client = await createTestClient(serverUrl, 'RateLimitProbe');
  auxiliaryClients.push(client);
  const missingRoomCodes = [];
  for (let index = 0; missingRoomCodes.length < 5; index += 1) {
    const roomCode = `Q${index.toString(36).toUpperCase().padStart(3, '0')}`;
    if (!server.rooms.has(roomCode)) missingRoomCodes.push(roomCode);
  }

  for (const [index, roomId] of missingRoomCodes.entries()) {
    const eventName = index % 2 === 0 ? 'room:join' : 'room:join_pending';
    await assert.rejects(
      emitWithAck(client.socket, eventName, { roomId, playerName: client.name }),
      /That room does not exist\./,
      `missing room attempt ${index + 1} should be rejected as a normal join failure`,
    );
  }

  let rateLimitError;
  try {
    await emitWithAck(client.socket, 'room:join', {
      roomId: 'Q999',
      playerName: client.name,
    });
    assert.fail('the sixth failed room lookup should be rate limited');
  } catch (error) {
    rateLimitError = error;
  }

  assert.equal(rateLimitError?.code, 'RATE_LIMITED');
  assert.ok(Number.isInteger(rateLimitError?.retryAfter) && rateLimitError.retryAfter > 0);
  await waitForCondition(
    () => client.roomErrors.some((error) => error.code === 'RATE_LIMITED'),
    'the locked-out join did not emit a RATE_LIMITED room:error payload',
  );
  const emittedError = client.roomErrors.find((error) => error.code === 'RATE_LIMITED');
  assert.equal(emittedError.message, 'Too many failed join attempts. System locked.');
  assert.ok(Number.isInteger(emittedError.retryAfter) && emittedError.retryAfter > 0);
}

async function run() {
  const server = createRelayServer({ fastTestMode: true });
  try {
    const address = await server.listen(0, '127.0.0.1');
    const serverUrl = `http://127.0.0.1:${address.port}`;

    for (const name of PLAYER_NAMES) clients.push(await createTestClient(serverUrl, name));

    const created = await emitWithAck(clients[0].socket, 'room:create', {
      playerName: clients[0].name,
    });
    const roomId = created.roomId;
    assert.match(roomId, /^[A-Z0-9]{4}$/);

    // Open entry remains the default: the first arrivals join without a queue.
    for (const client of clients.slice(1, 3)) {
      await emitWithAck(client.socket, 'room:join', {
        roomId,
        playerName: client.name,
      });
    }

    await waitForAll(clients.slice(0, 3), (state) => state.phase === 'LOBBY');
    assert.equal(latestStates.get(clients[0].name).settings.waitingRoomEnabled, false);
    await emitWithAck(clients[0].socket, 'room:toggle_waiting_room', { enabled: true });

    const firstRequest = await emitWithAck(clients[3].socket, 'room:join', {
      roomId,
      playerName: clients[3].name,
    });
    assert.equal(firstRequest.pending, true, 'new arrivals must queue while airlock security is enabled');
    await waitForCondition(() => Boolean(clients[3].joinPending), 'Applicant did not receive room:join_pending.');
    assert.ok(clients[3].joinPending, 'queued applicants must receive a waiting-room event');
    assert.equal(latestStates.has(clients[3].name), false, 'queued applicants must not receive the lobby roster');
    await waitForCondition(
      () => clients[0].pendingApplicants.some((applicant) => applicant.name === clients[3].name),
      'Host did not receive the pending applicant list.',
    );
    assert.equal(clients[0].pendingApplicants.some((applicant) => applicant.name === clients[3].name), true);
    assert.equal(clients[1].pendingApplicants.length, 0, 'only the host may receive applicant details');
    await assert.rejects(
      emitWithAck(clients[1].socket, 'room:toggle_waiting_room', { enabled: false }),
      /Only the host can change the airlock protocol\./,
      'non-host players must not change admission policy',
    );
    await assert.rejects(
      emitWithAck(clients[0].socket, 'game:start'),
      /At least 5 connected players are required\./,
      'a pending request must not count toward the launch minimum',
    );
    await emitWithAck(clients[0].socket, 'room:admit_applicant', { applicantId: clients[3].joinPending.applicantId });
    assert.ok(clients[3].admitSuccess, 'approved applicants must receive an admission event');
    await waitForAll(clients.slice(0, 4), (state) => state.phase === 'LOBBY');

    const autoAdmitted = await emitWithAck(clients[4].socket, 'room:join', {
      roomId,
      playerName: clients[4].name,
    });
    assert.equal(autoAdmitted.pending, true);
    await waitForCondition(() => Boolean(clients[4].joinPending), 'Second applicant did not receive room:join_pending.');
    assert.ok(clients[4].joinPending);
    // With four active crew, one pending applicant still cannot launch.
    await assert.rejects(
      emitWithAck(clients[0].socket, 'game:start'),
      /At least 5 connected players are required\./,
      'the active roster alone must satisfy the launch minimum',
    );
    await emitWithAck(clients[0].socket, 'room:toggle_waiting_room', { enabled: false });
    assert.ok(clients[4].admitSuccess, 'turning the airlock off must admit queued applicants');
    await waitForAll(clients, (state) => state.phase === 'LOBBY');
    assert.equal(latestStates.get(clients[0].name).players.length, PLAYER_NAMES.length);

    await emitWithAck(clients[0].socket, 'room:toggle_waiting_room', { enabled: true });
    const cancelledApplicant = await createTestClient(serverUrl, 'Fynn');
    auxiliaryClients.push(cancelledApplicant);
    const cancellationRequest = await emitWithAck(cancelledApplicant.socket, 'room:join', {
      roomId,
      playerName: cancelledApplicant.name,
    });
    assert.equal(cancellationRequest.pending, true);
    await waitForCondition(() => Boolean(cancelledApplicant.joinPending), 'Cancellation applicant was not queued.');
    const cancelled = await emitWithAck(cancelledApplicant.socket, 'room:cancel_pending');
    assert.equal(cancelled.cancelled, true);
    await waitForCondition(
      () => !clients[0].pendingApplicants.some((applicant) => applicant.name === cancelledApplicant.name),
      'Cancelled applicant remained in the host queue.',
    );

    const disconnectedApplicant = await createTestClient(serverUrl, 'Indigo');
    auxiliaryClients.push(disconnectedApplicant);
    const disconnectRequest = await emitWithAck(disconnectedApplicant.socket, 'room:join', {
      roomId,
      playerName: disconnectedApplicant.name,
    });
    assert.equal(disconnectRequest.pending, true);
    await waitForCondition(() => Boolean(disconnectedApplicant.joinPending), 'Disconnecting applicant was not queued.');
    await waitForCondition(
      () => clients[0].pendingApplicants.some((applicant) => applicant.name === disconnectedApplicant.name),
      'Host did not see the disconnecting applicant.',
    );
    disconnectedApplicant.socket.disconnect();
    await waitForCondition(
      () => !clients[0].pendingApplicants.some((applicant) => applicant.name === disconnectedApplicant.name),
      'Disconnected applicant remained in the host queue.',
    );
    assert.equal(clients[0].pendingApplicants.some((applicant) => applicant.name === cancelledApplicant.name), false);

    const deniedApplicant = await createTestClient(serverUrl, 'Gale');
    auxiliaryClients.push(deniedApplicant);
    const denialRequest = await emitWithAck(deniedApplicant.socket, 'room:join', {
      roomId,
      playerName: deniedApplicant.name,
    });
    assert.equal(denialRequest.pending, true);
    await waitForCondition(() => Boolean(deniedApplicant.joinPending), 'Denied applicant was not queued.');
    await emitWithAck(clients[0].socket, 'room:reject_applicant', {
      applicantId: deniedApplicant.joinPending.applicantId,
    });
    await waitForCondition(() => Boolean(deniedApplicant.rejection), 'Denied applicant did not receive a rejection reason.');
    assert.equal(deniedApplicant.rejection?.message, 'Entry denied by outpost commander.');
    await new Promise((resolve, reject) => {
      if (!deniedApplicant.socket.connected) return resolve();
      deniedApplicant.socket.once('disconnect', resolve);
      setTimeout(() => reject(new Error('Denied applicant connection was not closed.')), 1500);
    });

    const lateApplicant = await createTestClient(serverUrl, 'Harper');
    auxiliaryClients.push(lateApplicant);
    const lateRequest = await emitWithAck(lateApplicant.socket, 'room:join', {
      roomId,
      playerName: lateApplicant.name,
    });
    assert.equal(lateRequest.pending, true);
    await waitForCondition(() => Boolean(lateApplicant.joinPending), 'Late applicant was not queued.');

    await emitWithAck(clients[0].socket, 'game:start');
    await waitForAll(clients, (state) => state.phase === 'NIGHT');
    await waitForCondition(() => Boolean(lateApplicant.rejection), 'Pending applicant was not rejected at launch.');
    assert.equal(lateApplicant.rejection?.message, 'The mission has begun. New admissions are closed.');

    const alienClient = clients.find((client) => latestStates.get(client.name).myRole === 'ALIEN');
    assert.ok(alienClient, 'one player must receive the alpha alien role');
    assert.equal(latestStates.get(alienClient.name).canInfectTonight, true);
    const targetClient = clients.find((client) => client !== alienClient);
    const targetPlayerId = latestStates.get(targetClient.name).myPlayerId;

    await emitWithAck(alienClient.socket, 'night:infect', { targetPlayerId });
    await delay(300);
    assert.equal(latestStates.get(alienClient.name).phase, 'NIGHT', 'infection must not end night early');
    assert.equal(latestStates.get(targetClient.name).myRole, 'HUMAN', 'infection remains hidden until dawn');

    await waitForAll(clients, (state) => state.phase === 'DAY');
    assert.equal(latestStates.get(targetClient.name).myRole, 'ALIEN', 'the selected human becomes an alien at dawn');
    assert.equal(latestStates.get(alienClient.name).myInfectedTarget.id, targetPlayerId);
    assert.equal(latestStates.get(targetClient.name).myInfectedTarget, null, 'the victim must not learn who infected them');
    assert.equal(latestStates.get(alienClient.name).canInfectTonight, false);

    // The shared player list must not expose role properties to any perspective.
    for (const client of clients) {
      const state = latestStates.get(client.name);
      assert.ok(state.players.every((player) => !Object.hasOwn(player, 'role')));
      assert.equal(state.finalReveal, undefined);
      assert.equal(state.allPlayerRoles, undefined);
      assert.equal(state.infectionChainHistory, undefined);
    }

    await waitForAll(clients, (state) => state.phase === 'VOTING');
    for (const client of clients) {
      const state = latestStates.get(client.name);
      assert.equal(state.allPlayerRoles, undefined, 'full roles must stay sealed during voting');
      assert.equal(state.infectionChainHistory, undefined, 'relay history must stay sealed during voting');
    }
    const firstRoundExile = clients.find((client) => {
      const state = latestStates.get(client.name);
      const me = state.players.find((player) => player.id === state.myPlayerId);
      return state.myRole === 'HUMAN' && me?.isAlive;
    });
    assert.ok(firstRoundExile, 'a living human must be available to demonstrate 2v2 parity');
    const firstRoundExileId = latestStates.get(firstRoundExile.name).myPlayerId;
    await Promise.all(clients.map((client) => emitWithAck(client.socket, 'vote:cast', {
      targetPlayerId: firstRoundExileId,
    })));
    await waitForAll(clients, (state) => state.phase === 'RESOLUTION');
    const parityRoom = server.rooms.get(roomId);
    assert.equal(Object.values(parityRoom.players).filter((player) => player.isAlive && player.role === 'ALIEN').length, 2);
    assert.equal(Object.values(parityRoom.players).filter((player) => player.isAlive && player.role === 'HUMAN').length, 2);
    assert.equal(parityRoom.winner, null, '2 aliens versus 2 humans must not end the match');
    for (const client of clients) {
      const state = latestStates.get(client.name);
      assert.equal(state.allPlayerRoles, undefined, 'full roles must stay sealed during resolution');
      assert.equal(state.infectionChainHistory, undefined, 'relay history must stay sealed during resolution');
    }
    await waitForAll(clients, (state) => state.phase === 'NIGHT' && state.roundNumber === 2);

    // Reconnect one player with the issued session token and confirm that the
    // same player record is restored without creating a sixth player.
    const returningPlayer = clients.find((client) => !latestStates.get(client.name).canInfectTonight);
    assert.ok(returningPlayer, 'a non-tip crew member must be available for the reconnect check');
    const returningPlayerId = latestStates.get(returningPlayer.name).myPlayerId;
    const sessionId = returningPlayer.session && returningPlayer.session.sessionId;
    assert.ok(sessionId, 'the server must issue a reconnect session');
    returningPlayer.socket.disconnect();
    latestStates.delete(returningPlayer.name);

    const replacementSocket = createSocket(serverUrl);
    returningPlayer.socket = replacementSocket;
    wireClient(returningPlayer);
    await new Promise((resolve, reject) => {
      replacementSocket.once('connect', resolve);
      replacementSocket.once('connect_error', reject);
    });
    const reconnected = await emitWithAck(replacementSocket, 'room:reconnect', { roomId, sessionId });
    assert.equal(reconnected.playerId, returningPlayerId);
    const restoredState = await waitForState(
      returningPlayer,
      (state) => state.phase === 'NIGHT' && state.roundNumber === 2,
    );
    assert.equal(restoredState.myPlayerId, returningPlayerId);
    assert.equal(restoredState.players.find((player) => player.id === returningPlayerId).isDisconnected, false);

    // Let the active tip convert another human. Three aliens versus one human
    // must still continue because a living human remains.
    const activeTip = clients.find((client) => latestStates.get(client.name).canInfectTonight);
    assert.ok(activeTip, 'the newest alien must own the second relay transmission');
    const nextHuman = clients.find((client) => {
      const state = latestStates.get(client.name);
      const me = state.players.find((player) => player.id === state.myPlayerId);
      return state.myRole === 'HUMAN' && me?.isAlive;
    });
    assert.ok(nextHuman, 'a living human must be available as a second infection target');
    await emitWithAck(activeTip.socket, 'night:infect', {
      targetPlayerId: latestStates.get(nextHuman.name).myPlayerId,
    });
    await waitForAll(clients, (state) => state.phase === 'DAY' && state.roundNumber === 2);
    assert.equal(server.rooms.get(roomId).winner, null, 'the match must continue while any living human remains');
    await waitForAll(clients, (state) => state.phase === 'VOTING' && state.roundNumber === 2);
    const livingClients = clients.filter((client) => {
      const state = latestStates.get(client.name);
      const me = state.players.find((player) => player.id === state.myPlayerId);
      return me?.isAlive;
    });
    await Promise.all(livingClients.map((client) => emitWithAck(client.socket, 'vote:cast', {
      targetPlayerId: 'SKIP',
    })));
    await waitForAll(clients, (state) => state.phase === 'NIGHT' && state.roundNumber === 3);
    const finalTip = clients.find((client) => latestStates.get(client.name).canInfectTonight);
    const finalHuman = clients.find((client) => {
      const state = latestStates.get(client.name);
      const me = state.players.find((player) => player.id === state.myPlayerId);
      return state.myRole === 'HUMAN' && me?.isAlive;
    });
    assert.ok(finalTip && finalHuman, 'the final living human must be available to infect on Night 3');
    await emitWithAck(finalTip.socket, 'night:infect', {
      targetPlayerId: latestStates.get(finalHuman.name).myPlayerId,
    });
    await waitForAll(clients, (state) => state.phase === 'GAME_OVER');

    for (const client of clients) {
      const state = latestStates.get(client.name);
      assert.equal(state.winner, 'ALIENS', 'converting the final living human must end the match for the aliens');
      assert.equal(state.finalReveal.players.filter((player) => player.isAlive && player.role === 'HUMAN').length, 0);
      assert.equal(state.allPlayerRoles.length, PLAYER_NAMES.length, 'the final manifest must reveal every role');
      assert.equal(state.infectionChainHistory.filter((entry) => entry.status === 'SUCCESS').length, 3);
      assert.equal(state.finalReveal.chainActive, true, 'the complete relay chain must remain intact');
    }

    const formerHostId = latestStates.get(clients[0].name).myPlayerId;
    const appointedHostId = latestStates.get(clients[1].name).myPlayerId;
    await emitWithAck(clients[0].socket, 'room:transfer_host', { targetPlayerId: appointedHostId });
    await waitForAll(clients, (state) => (
      state.phase === 'GAME_OVER'
      && state.players.find((player) => player.id === appointedHostId)?.isHost === true
      && state.players.find((player) => player.id === formerHostId)?.isHost === false
    ));
    await waitForCondition(
      () => clients[0].announcements.some((entry) => entry.text === `${clients[1].name} has been appointed Outpost Commander by ${clients[0].name}.`),
      'The post-game commander appointment announcement was not broadcast.',
    );
    await assert.rejects(
      emitWithAck(clients[0].socket, 'room:play_again'),
      /Only the host can initialize a new mission\./,
      'the former host must not reset the room after authority is transferred',
    );
    await assert.rejects(
      emitWithAck(clients[0].socket, 'room:transfer_host', { targetPlayerId: latestStates.get(clients[2].name).myPlayerId }),
      /Unauthorized: Only the Outpost Commander can transfer authority\./,
      'the former host must not retain transfer authority after the mission',
    );

    const offlinePlayerId = latestStates.get(clients[2].name).myPlayerId;
    const offlineSession = { ...clients[2].session };
    clients[2].socket.disconnect();
    await waitForState(clients[1], (state) => (
      state.phase === 'GAME_OVER'
      && state.players.find((player) => player.id === offlinePlayerId)?.isDisconnected === true
    ));
    await assert.rejects(
      emitWithAck(clients[1].socket, 'room:transfer_host', { targetPlayerId: offlinePlayerId }),
      /Cannot transfer authority to a disconnected player\./,
      'authority must not be transferred to a disconnected crew member',
    );
    const restoredCrew = await createTestClient(serverUrl, clients[2].name);
    auxiliaryClients.push(restoredCrew);
    restoredCrew.session = await emitWithAck(restoredCrew.socket, 'room:reconnect', {
      roomId,
      sessionId: offlineSession.sessionId,
    });
    clients[2] = restoredCrew;
    await waitForState(restoredCrew, (state) => (
      state.phase === 'GAME_OVER'
      && state.players.find((player) => player.id === offlinePlayerId)?.isDisconnected === false
    ));

    await assert.rejects(
      emitWithAck(clients[0].socket, 'room:play_again'),
      /Only the host can initialize a new mission\./,
      'only the newly appointed host may initialize the rematch',
    );
    await emitWithAck(clients[1].socket, 'room:play_again');
    await waitForAll(clients, (state) => state.phase === 'LOBBY');
    for (const client of clients) {
      const state = latestStates.get(client.name);
      assert.equal(state.roundNumber, 0);
      assert.equal(state.winner, null);
      assert.equal(state.finalReveal, undefined, 'full reveals must be sealed again in the lobby');
      assert.equal(state.players.length, PLAYER_NAMES.length, 'connected crew must remain in the room');
      assert.equal(state.myRole, 'HUMAN');
    }

    // Exiling the final living alien must immediately award the humans a win.
    await emitWithAck(clients[1].socket, 'game:start');
    await waitForAll(clients, (state) => state.phase === 'NIGHT');
    await waitForAll(clients, (state) => state.phase === 'DAY');
    await waitForAll(clients, (state) => state.phase === 'VOTING');
    const finalAlienRoom = server.rooms.get(roomId);
    const alphaAlienId = finalAlienRoom.alphaAlienId;
    for (const player of Object.values(finalAlienRoom.players)) player.role = 'HUMAN';
    finalAlienRoom.players[alphaAlienId].role = 'ALIEN';
    const livingAliens = Object.values(finalAlienRoom.players).filter((player) => player.isAlive && player.role === 'ALIEN');
    assert.equal(livingAliens.length, 1, 'the final-alien scenario must have exactly one living alien before voting');
    assert.equal(livingAliens[0].id, alphaAlienId, 'the alpha alien must be the final living alien before voting');
    await Promise.all(clients.map((client) => emitWithAck(client.socket, 'vote:cast', {
      targetPlayerId: alphaAlienId,
    })));
    await waitForAll(clients, (state) => state.phase === 'RESOLUTION');
    assert.equal(server.rooms.get(roomId).winner, 'HUMANS', 'exiling the final alien must award a human victory');
    await waitForAll(clients, (state) => state.phase === 'GAME_OVER');
    for (const client of clients) {
      assert.equal(latestStates.get(client.name).winner, 'HUMANS');
    }
    await emitWithAck(clients[1].socket, 'room:play_again');
    await waitForAll(clients, (state) => state.phase === 'LOBBY');

    // A disconnected spear tip loses transmission authority immediately, while
    // its identity and chain history remain private during the active match.
    await emitWithAck(clients[1].socket, 'game:start');
    await waitForAll(clients, (state) => state.phase === 'NIGHT');
    const disconnectedTip = clients.find((client) => latestStates.get(client.name).canInfectTonight);
    assert.ok(disconnectedTip, 'a new match must assign an active relay tip');
    const disconnectedTipId = latestStates.get(disconnectedTip.name).myPlayerId;
    const activeRoom = server.rooms.get(roomId);
    activeRoom.settings.reconnectGraceSeconds = 0.05;
    disconnectedTip.socket.disconnect();
    const observerClient = clients.find((client) => client !== disconnectedTip);
    const observerState = await waitForState(observerClient, (state) => (
      state.phase === 'NIGHT'
      && state.players.find((player) => player.id === disconnectedTipId)?.isDisconnected
    ));
    assert.equal(activeRoom.chainActive, false, 'disconnecting the tip must sever the chain immediately');
    assert.ok(activeRoom.infectionHistory.some((entry) => entry.reason === 'LATEST_ALIEN_DISCONNECTED'));
    assert.equal(observerState.allPlayerRoles, undefined, 'active observers must not receive the final role reveal');
    assert.equal(observerState.infectionChainHistory, undefined, 'active observers must not receive relay history');
    assert.ok(observerState.players.every((player) => !Object.hasOwn(player, 'role')));
    const disconnectVictory = await waitForState(observerClient, (state) => state.phase === 'GAME_OVER');
    assert.equal(disconnectVictory.winner, 'HUMANS', 'the server must check victory when disconnect grace expires');
    assert.equal(disconnectVictory.finalReveal.chainActive, false);

    await verifyVoluntaryLeaves(serverUrl, server);
    await verifyLobbyHostTransfer(serverUrl, server);
    await verifyHostKicks(serverUrl, server);
    await verifyJoinRateLimit(serverUrl, server);

    console.log('Simulation passed: airlock admission, IP-based join rate limiting, lobby and post-game commander transfer, transfer security, connected-player validation, 2v2 parity, assimilation and exile victories, voluntary leave, host migration, lobby and active kicks, kick-session invalidation, relay-tip severance, reconnect grace, rematch authority, and the multiplayer cycle were verified.');
  } finally {
    for (const client of clients) client.socket.disconnect();
    for (const client of auxiliaryClients) client.socket.disconnect();
    await server.close();
  }
}

run().catch((error) => {
  console.error('Simulation failed:', error);
  process.exitCode = 1;
});

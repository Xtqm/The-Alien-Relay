'use strict';

// This script starts an isolated in-memory server with two-second phases, then
// drives five real Socket.IO clients through a complete match and rematch.
process.env.FAST_TEST_MODE = 'true';

const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const { createRelayServer } = require('./server');

const PLAYER_NAMES = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery'];
const clients = [];
const latestStates = new Map();
const loggedPhases = new Map();

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function emitWithAck(socket, eventName, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.emit(eventName, payload, (response) => {
      if (!response || response.ok !== true) {
        reject(new Error(response && response.message ? response.message : `${eventName} failed.`));
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

function logState(client, state) {
  const phaseKey = `${state.roundNumber}:${state.phase}`;
  if (loggedPhases.get(client.name) === phaseKey) return;
  loggedPhases.set(client.name, phaseKey);
  console.log(`[${client.name}] ${JSON.stringify(state)}`);
}

async function run() {
  const server = createRelayServer({ fastTestMode: true });
  try {
    const address = await server.listen(0, '127.0.0.1');
    const serverUrl = `http://127.0.0.1:${address.port}`;

    for (const name of PLAYER_NAMES) {
      const socket = createClient(serverUrl, {
        transports: ['websocket'],
        reconnection: false,
      });
      const client = { name, socket, session: null };
      clients.push(client);
      socket.on('room:session', (session) => { client.session = session; });
      socket.on('game:state_sync', (state) => {
        latestStates.set(name, state);
        logState(client, state);
      });
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
    }

    const created = await emitWithAck(clients[0].socket, 'room:create', {
      playerName: clients[0].name,
    });
    const roomId = created.roomId;
    assert.match(roomId, /^[A-Z0-9]{4}$/);

    for (const client of clients.slice(1)) {
      await emitWithAck(client.socket, 'room:join', {
        roomId,
        playerName: client.name,
      });
    }

    await waitForAll(clients, (state) => state.phase === 'LOBBY');
    await emitWithAck(clients[0].socket, 'game:start');
    await waitForAll(clients, (state) => state.phase === 'NIGHT');

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
    await Promise.all(clients.map((client) => emitWithAck(client.socket, 'vote:cast', {
      targetPlayerId: 'SKIP',
    })));
    await waitForAll(clients, (state) => state.phase === 'RESOLUTION');
    for (const client of clients) {
      const state = latestStates.get(client.name);
      assert.equal(state.allPlayerRoles, undefined, 'full roles must stay sealed during resolution');
      assert.equal(state.infectionChainHistory, undefined, 'relay history must stay sealed during resolution');
    }
    await waitForAll(clients, (state) => state.phase === 'NIGHT' && state.roundNumber === 2);

    // Reconnect one player with the issued session token and confirm that the
    // same player record is restored without creating a sixth player.
    const returningPlayer = clients[1];
    const returningPlayerId = latestStates.get(returningPlayer.name).myPlayerId;
    const sessionId = returningPlayer.session && returningPlayer.session.sessionId;
    assert.ok(sessionId, 'the server must issue a reconnect session');
    returningPlayer.socket.disconnect();
    latestStates.delete(returningPlayer.name);

    const replacementSocket = createClient(serverUrl, {
      transports: ['websocket'],
      reconnection: false,
    });
    returningPlayer.socket = replacementSocket;
    replacementSocket.on('room:session', (session) => { returningPlayer.session = session; });
    replacementSocket.on('game:state_sync', (state) => {
      latestStates.set(returningPlayer.name, state);
      logState(returningPlayer, state);
    });
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

    // Let the active tip convert one more human. That reaches alien parity and
    // ends the match during the second Night.
    const activeTip = clients.find((client) => latestStates.get(client.name).canInfectTonight);
    assert.ok(activeTip, 'the newest alien must own the second relay transmission');
    const nextHuman = clients.find((client) => (
      latestStates.get(client.name).myRole === 'HUMAN'
      && latestStates.get(client.name).players.find((player) => player.id === latestStates.get(client.name).myPlayerId)?.isAlive
    ));
    assert.ok(nextHuman, 'a living human must be available as a second infection target');
    await emitWithAck(activeTip.socket, 'night:infect', {
      targetPlayerId: latestStates.get(nextHuman.name).myPlayerId,
    });
    await waitForAll(clients, (state) => state.phase === 'GAME_OVER');

    for (const client of clients) {
      const state = latestStates.get(client.name);
      assert.equal(state.winner, 'ALIENS', 'reaching parity must end the match for the aliens');
      assert.equal(state.allPlayerRoles.length, PLAYER_NAMES.length, 'the final manifest must reveal every role');
      assert.equal(state.infectionChainHistory.filter((entry) => entry.status === 'SUCCESS').length, 2);
      assert.equal(state.finalReveal.chainActive, true, 'the complete relay chain must remain intact');
    }

    await assert.rejects(
      emitWithAck(clients[1].socket, 'room:play_again'),
      /Only the host can initialize a new mission\./,
      'non-host players must not be able to reset the room',
    );
    await emitWithAck(clients[0].socket, 'room:play_again');
    await waitForAll(clients, (state) => state.phase === 'LOBBY');
    for (const client of clients) {
      const state = latestStates.get(client.name);
      assert.equal(state.roundNumber, 0);
      assert.equal(state.winner, null);
      assert.equal(state.finalReveal, undefined, 'full reveals must be sealed again in the lobby');
      assert.equal(state.players.length, PLAYER_NAMES.length, 'connected crew must remain in the room');
      assert.equal(state.myRole, 'HUMAN');
    }

    // A disconnected spear tip loses transmission authority immediately, while
    // its identity and chain history remain private during the active match.
    await emitWithAck(clients[0].socket, 'game:start');
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

    console.log('Simulation passed: perspective sealing, relay progression, terminal role reveal, reconnect support, host-only rematch reset, immediate tip-disconnect severance, and disconnect-expiry victory checks were verified.');
  } finally {
    for (const client of clients) client.socket.disconnect();
    await server.close();
  }
}

run().catch((error) => {
  console.error('Simulation failed:', error);
  process.exitCode = 1;
});

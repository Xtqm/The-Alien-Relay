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
  socket.on('room:join_pending', (info) => { client.joinPending = info; });
  socket.on('room:admit_success', (info) => { client.admitSuccess = info; });
  socket.on('room:rejected', (info) => { client.rejection = info; });
  socket.on('room:pending_list_sync', (applicants) => { client.pendingApplicants = applicants; });
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
    joinPending: null,
    admitSuccess: null,
    rejection: null,
    pendingApplicants: [],
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

    console.log('Simulation passed: open entry, airlock queue/approval/denial/cancellation, launch minimum, admission closure at launch, reconnect bypass, perspective sealing, relay progression, rematch reset, and disconnect victory checks were verified.');
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

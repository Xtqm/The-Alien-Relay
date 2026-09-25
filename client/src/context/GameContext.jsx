import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const GameContext = createContext(null);
const SESSION_ID_KEY = 'sessionId';
const ROOM_ID_KEY = 'lastRoomId';
const PLAYER_ID_KEY = 'lastPlayerId';
const SERVER_URL = import.meta.env.VITE_SERVER_URL
  || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

function readSession() {
  try {
    return {
      sessionId: window.sessionStorage.getItem(SESSION_ID_KEY),
      roomId: window.sessionStorage.getItem(ROOM_ID_KEY),
      playerId: window.sessionStorage.getItem(PLAYER_ID_KEY),
    };
  } catch {
    return { sessionId: null, roomId: null, playerId: null };
  }
}

function saveSession(session) {
  if (!session?.sessionId || !session?.roomId) return;
  try {
    window.sessionStorage.setItem(SESSION_ID_KEY, session.sessionId);
    window.sessionStorage.setItem(ROOM_ID_KEY, session.roomId);
    if (session.playerId) window.sessionStorage.setItem(PLAYER_ID_KEY, session.playerId);
  } catch {
    // The live socket remains usable if the browser has disabled session storage.
  }
}

function clearSession() {
  try {
    window.sessionStorage.removeItem(SESSION_ID_KEY);
    window.sessionStorage.removeItem(ROOM_ID_KEY);
    window.sessionStorage.removeItem(PLAYER_ID_KEY);
  } catch {
    // Ignore unavailable storage; callers still return to the landing screen.
  }
}

function emitWithAck(socket, eventName, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('The outpost link is offline. Wait for it to reconnect and try again.'));
      return;
    }

    socket.timeout(7000).emit(eventName, payload, (timeoutError, response) => {
      if (timeoutError) {
        const error = new Error('The outpost did not respond. Check your connection and try again.');
        error.code = 'ACK_TIMEOUT';
        reject(error);
        return;
      }
      if (!response?.ok) {
        const error = new Error(response?.message || 'The action could not be completed.');
        error.code = response?.code || 'SERVER_REJECTED';
        if (Number.isFinite(response?.retryAfter)) error.retryAfter = response.retryAfter;
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}

export function GameProvider({ children }) {
  const [gameState, setGameState] = useState(null);
  const [isPendingAdmission, setIsPendingAdmission] = useState(false);
  const [pendingAdmissionInfo, setPendingAdmissionInfo] = useState(null);
  const [pendingApplicants, setPendingApplicants] = useState([]);
  const [rejectionNotice, setRejectionNotice] = useState('');
  const [kickedReason, setKickedReason] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [announcements, setAnnouncements] = useState([]);
  const [announcementLog, setAnnouncementLog] = useState([]);
  const [error, setError] = useState('');
  const [joinCooldownSeconds, setJoinCooldownSeconds] = useState(0);
  const socketRef = useRef(null);
  const connectingRef = useRef(false);
  const previousPhaseRef = useRef(null);
  const rejectedDisconnectRef = useRef(false);
  const pendingAdmissionRef = useRef(false);

  useEffect(() => {
    if (joinCooldownSeconds <= 0) return undefined;
    const countdown = window.setTimeout(() => {
      setJoinCooldownSeconds((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearTimeout(countdown);
  }, [joinCooldownSeconds]);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      auth: (callback) => callback({ sessionId: readSession().sessionId }),
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 1000,
      randomizationFactor: 0,
    });
    socketRef.current = socket;

    const onSession = (session) => saveSession(session);
    const onLeftSuccess = () => {
      pendingAdmissionRef.current = false;
      clearSession();
      previousPhaseRef.current = null;
      setGameState(null);
      setIsPendingAdmission(false);
      setPendingAdmissionInfo(null);
      setPendingApplicants([]);
      setRejectionNotice('');
      setKickedReason('');
      setAnnouncements([]);
      setAnnouncementLog([]);
      setError('');
    };
    const onJoinPending = (info) => {
      pendingAdmissionRef.current = true;
      clearSession();
      setGameState(null);
      setError('');
      setIsPendingAdmission(true);
      setPendingAdmissionInfo(info || null);
    };
    const onPendingList = (applicants) => {
      setPendingApplicants(Array.isArray(applicants) ? applicants : []);
    };
    const onAdmitSuccess = () => {
      pendingAdmissionRef.current = false;
      setIsPendingAdmission(false);
      setPendingAdmissionInfo(null);
      setPendingApplicants([]);
    };
    const onRejected = (payload) => {
      pendingAdmissionRef.current = false;
      clearSession();
      setGameState(null);
      setIsPendingAdmission(false);
      setPendingAdmissionInfo(null);
      setPendingApplicants([]);
      setRejectionNotice(payload?.message || 'Entry denied by outpost commander.');
      rejectedDisconnectRef.current = true;
    };
    const onKicked = (payload) => {
      pendingAdmissionRef.current = false;
      clearSession();
      previousPhaseRef.current = null;
      setGameState(null);
      setIsPendingAdmission(false);
      setPendingAdmissionInfo(null);
      setPendingApplicants([]);
      setRejectionNotice('');
      setKickedReason(payload?.message || 'You have been dismissed from the outpost by the Commander.');
      setAnnouncements([]);
      setAnnouncementLog([]);
      setError('');
    };
    const onState = (nextState) => {
      if (!nextState || typeof nextState !== 'object') return;
      if (previousPhaseRef.current === 'GAME_OVER' && nextState.phase === 'LOBBY') {
        setAnnouncements([]);
        setAnnouncementLog([]);
      }
      previousPhaseRef.current = nextState.phase;
      setGameState(nextState);
    };
    const onAnnouncement = (announcement) => {
      if (!announcement?.text) return;
      const item = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: announcement.text,
        type: announcement.type === 'alert' ? 'alert' : 'info',
        timestamp: Date.now(),
      };
      setAnnouncements((current) => [...current.slice(-5), item]);
      setAnnouncementLog((current) => [...current.slice(-59), item]);
      window.setTimeout(() => {
        setAnnouncements((current) => current.filter((entry) => entry.id !== item.id));
      }, 8000);
    };
    const onRoomError = (payload) => {
      if (payload?.code === 'RATE_LIMITED') {
        const retryAfter = Math.max(1, Math.ceil(Number(payload.retryAfter) || 0));
        setJoinCooldownSeconds((remaining) => Math.max(remaining, retryAfter));
        return;
      }
      if (payload?.message) setError(payload.message);
    };
    const onConnect = async () => {
      const saved = readSession();
      if (!saved.sessionId || !saved.roomId) {
        setConnectionStatus('connected');
        return;
      }
      if (connectingRef.current) return;
      connectingRef.current = true;
      setConnectionStatus('reconnecting');
      try {
        const response = await emitWithAck(socket, 'room:reconnect', {
          roomId: saved.roomId,
          sessionId: saved.sessionId,
        });
        saveSession(response);
        setError('');
        setConnectionStatus('connected');
      } catch (reconnectError) {
        if (reconnectError.code === 'SERVER_REJECTED') {
          clearSession();
          setGameState(null);
        }
        setError(reconnectError.message);
        setConnectionStatus('connected');
      } finally {
        connectingRef.current = false;
      }
    };
    const onDisconnect = () => {
      connectingRef.current = false;
      setConnectionStatus('disconnected');
      if (pendingAdmissionRef.current) {
        pendingAdmissionRef.current = false;
        setIsPendingAdmission(false);
        setPendingAdmissionInfo(null);
        setError('The airlock request ended when the connection dropped. Rejoin to request clearance.');
      }
      if (rejectedDisconnectRef.current) {
        rejectedDisconnectRef.current = false;
        window.setTimeout(() => {
          if (!socket.connected) socket.connect();
        }, 25);
      }
    };
    const onConnectError = () => setConnectionStatus('reconnecting');
    const onReconnectAttempt = () => setConnectionStatus('reconnecting');
    const onReconnectFailed = () => setConnectionStatus('disconnected');

    socket.on('room:session', onSession);
    socket.on('room:left_success', onLeftSuccess);
    socket.on('room:join_pending', onJoinPending);
    socket.on('room:pending_list_sync', onPendingList);
    socket.on('room:admit_success', onAdmitSuccess);
    socket.on('room:rejected', onRejected);
    socket.on('room:kicked', onKicked);
    socket.on('game:state_sync', onState);
    socket.on('game:announcement', onAnnouncement);
    socket.on('room:error', onRoomError);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.io.on('reconnect_failed', onReconnectFailed);
    socket.connect();

    return () => {
      socket.off('room:session', onSession);
      socket.off('room:left_success', onLeftSuccess);
      socket.off('room:join_pending', onJoinPending);
      socket.off('room:pending_list_sync', onPendingList);
      socket.off('room:admit_success', onAdmitSuccess);
      socket.off('room:rejected', onRejected);
      socket.off('room:kicked', onKicked);
      socket.off('game:state_sync', onState);
      socket.off('game:announcement', onAnnouncement);
      socket.off('room:error', onRoomError);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.io.off('reconnect_failed', onReconnectFailed);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const runAction = useCallback(async (eventName, payload) => {
    setError('');
    try {
      return await emitWithAck(socketRef.current, eventName, payload);
    } catch (actionError) {
      if (actionError.code === 'RATE_LIMITED') {
        const retryAfter = Math.max(1, Math.ceil(Number(actionError.retryAfter) || 0));
        setJoinCooldownSeconds((remaining) => Math.max(remaining, retryAfter));
      } else {
        setError(actionError.message);
      }
      throw actionError;
    }
  }, []);

  const createRoom = useCallback(async (playerName) => {
    pendingAdmissionRef.current = false;
    clearSession();
    setGameState(null);
    setIsPendingAdmission(false);
    setPendingAdmissionInfo(null);
    setPendingApplicants([]);
    setRejectionNotice('');
    setKickedReason('');
    setAnnouncements([]);
    setAnnouncementLog([]);
    const response = await runAction('room:create', { playerName });
    saveSession(response);
    return response;
  }, [runAction]);

  const joinRoom = useCallback(async (roomId, playerName) => {
    pendingAdmissionRef.current = false;
    clearSession();
    setGameState(null);
    setIsPendingAdmission(false);
    setPendingAdmissionInfo(null);
    setPendingApplicants([]);
    setRejectionNotice('');
    setKickedReason('');
    setAnnouncements([]);
    setAnnouncementLog([]);
    const response = await runAction('room:join', { roomId, playerName });
    if (!response.pending) saveSession(response);
    return response;
  }, [runAction]);

  const leaveRoom = useCallback(async () => {
    pendingAdmissionRef.current = false;
    clearSession();
    previousPhaseRef.current = null;
    setGameState(null);
    setIsPendingAdmission(false);
    setPendingAdmissionInfo(null);
    setPendingApplicants([]);
    setRejectionNotice('');
    setKickedReason('');
    setAnnouncements([]);
    setAnnouncementLog([]);
    setError('');

    try {
      return await emitWithAck(socketRef.current, 'room:leave');
    } catch (leaveError) {
      setError(leaveError.message);
      throw leaveError;
    }
  }, []);

  const startGame = useCallback(() => runAction('game:start'), [runAction]);
  const resetGame = useCallback(() => runAction('room:play_again'), [runAction]);
  const transferHost = useCallback((targetPlayerId) => (
    runAction('room:transfer_host', { targetPlayerId })
  ), [runAction]);
  const toggleWaitingRoom = useCallback((enabled) => (
    runAction('room:toggle_waiting_room', { enabled })
  ), [runAction]);
  const admitApplicant = useCallback((applicantId) => (
    runAction('room:admit_applicant', { applicantId })
  ), [runAction]);
  const rejectApplicant = useCallback((applicantId) => (
    runAction('room:reject_applicant', { applicantId })
  ), [runAction]);
  const kickPlayer = useCallback((targetPlayerId) => (
    runAction('room:kick_player', { targetPlayerId })
  ), [runAction]);
  const cancelPendingAdmission = useCallback(async () => {
    const response = await runAction('room:cancel_pending');
    if (response.cancelled) {
      pendingAdmissionRef.current = false;
      clearSession();
      setIsPendingAdmission(false);
      setPendingAdmissionInfo(null);
    }
    return response;
  }, [runAction]);
  const updateRoomSettings = useCallback((settings) => (
    runAction('room:update_settings', { settings })
  ), [runAction]);
  const infectPlayer = useCallback((targetPlayerId) => (
    runAction('night:infect', { targetPlayerId })
  ), [runAction]);
  const castVote = useCallback((targetPlayerIdOrSkip) => (
    runAction('vote:cast', { targetPlayerId: targetPlayerIdOrSkip })
  ), [runAction]);
  const dismissError = useCallback(() => setError(''), []);
  const dismissRejection = useCallback(() => setRejectionNotice(''), []);
  const dismissKicked = useCallback(() => setKickedReason(''), []);

  const value = useMemo(() => ({
    gameState,
    isPendingAdmission,
    pendingAdmissionInfo,
    pendingApplicants,
    rejectionNotice,
    kickedReason,
    connectionStatus,
    announcements,
    announcementLog,
    error,
    joinCooldownSeconds,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    resetGame,
    transferHost,
    toggleWaitingRoom,
    admitApplicant,
    rejectApplicant,
    kickPlayer,
    cancelPendingAdmission,
    updateRoomSettings,
    infectPlayer,
    castVote,
    dismissError,
    dismissRejection,
    dismissKicked,
  }), [gameState, isPendingAdmission, pendingAdmissionInfo, pendingApplicants, rejectionNotice, kickedReason, connectionStatus, announcements, announcementLog, error, joinCooldownSeconds, createRoom, joinRoom, leaveRoom, startGame, resetGame, transferHost, toggleWaitingRoom, admitApplicant, rejectApplicant, kickPlayer, cancelPendingAdmission, updateRoomSettings, infectPlayer, castVote, dismissError, dismissRejection, dismissKicked]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGameContext() {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGameContext must be used within GameProvider.');
  return context;
}

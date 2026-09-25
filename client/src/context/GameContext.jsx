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
        error.code = 'SERVER_REJECTED';
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}

export function GameProvider({ children }) {
  const [gameState, setGameState] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [announcements, setAnnouncements] = useState([]);
  const [announcementLog, setAnnouncementLog] = useState([]);
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const connectingRef = useRef(false);
  const previousPhaseRef = useRef(null);

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
    };
    const onConnectError = () => setConnectionStatus('reconnecting');
    const onReconnectAttempt = () => setConnectionStatus('reconnecting');
    const onReconnectFailed = () => setConnectionStatus('disconnected');

    socket.on('room:session', onSession);
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
      setError(actionError.message);
      throw actionError;
    }
  }, []);

  const createRoom = useCallback(async (playerName) => {
    clearSession();
    setGameState(null);
    setAnnouncements([]);
    setAnnouncementLog([]);
    const response = await runAction('room:create', { playerName });
    saveSession(response);
    return response;
  }, [runAction]);

  const joinRoom = useCallback(async (roomId, playerName) => {
    clearSession();
    setGameState(null);
    setAnnouncements([]);
    setAnnouncementLog([]);
    const response = await runAction('room:join', { roomId, playerName });
    saveSession(response);
    return response;
  }, [runAction]);

  const startGame = useCallback(() => runAction('game:start'), [runAction]);
  const resetGame = useCallback(() => runAction('room:play_again'), [runAction]);
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

  const value = useMemo(() => ({
    gameState,
    connectionStatus,
    announcements,
    announcementLog,
    error,
    createRoom,
    joinRoom,
    startGame,
    resetGame,
    updateRoomSettings,
    infectPlayer,
    castVote,
    dismissError,
  }), [gameState, connectionStatus, announcements, announcementLog, error, createRoom, joinRoom, startGame, resetGame, updateRoomSettings, infectPlayer, castVote, dismissError]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGameContext() {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGameContext must be used within GameProvider.');
  return context;
}

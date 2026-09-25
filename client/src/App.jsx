import { AlertCircle, X } from 'lucide-react';
import AnnouncementToast from './components/common/AnnouncementToast.jsx';
import Header from './components/common/Header.jsx';
import ActiveGameShell from './components/game/ActiveGameShell.jsx';
import LobbyView from './components/lobby/LobbyView.jsx';
import LandingView from './components/landing/LandingView.jsx';
import { useGame } from './hooks/useGame.js';

export default function App() {
  const { gameState, connectionStatus, announcements, error, dismissError, announcementLog } = useGame();
  const inRoom = Boolean(gameState?.roomId);

  return (
    <div className="app-shell min-h-screen bg-void text-slate-100">
      <AnnouncementToast announcements={announcements} />
      {inRoom && gameState.phase === 'LOBBY' && <Header gameState={gameState} connectionStatus={connectionStatus} />}
      {error && (
        <div role="alert" className="relative z-20 mx-auto mt-3 flex max-w-7xl items-start gap-2.5 px-4 sm:px-7 lg:px-10">
          <div className="flex w-full items-start gap-2.5 rounded border border-rose-300/20 bg-rose-300/[0.07] px-3.5 py-3 text-xs text-rose-100/90">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-200" />
            <span className="flex-1 leading-relaxed">{error}</span>
            <button onClick={dismissError} aria-label="Dismiss error" className="shrink-0 text-rose-200/65 transition hover:text-rose-100"><X size={15} /></button>
          </div>
        </div>
      )}

      {!gameState?.roomId ? (
        <>
          {!inRoom && <Header connectionStatus={connectionStatus} />}
          <LandingView connectionStatus={connectionStatus} />
        </>
      ) : gameState.phase === 'LOBBY' ? (
        <>
          <LobbyView gameState={gameState} />
          <footer className="mx-auto max-w-7xl px-4 pb-6 font-mono text-[8px] uppercase tracking-[0.15em] text-slate-700 sm:px-7 lg:px-10">EUROPA RESEARCH DIVISION <span className="mx-2">//</span> LOCAL CREW NETWORK</footer>
        </>
      ) : (
        <ActiveGameShell gameState={gameState} connectionStatus={connectionStatus} announcementLog={announcementLog} />
      )}
    </div>
  );
}


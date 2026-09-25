import { AlertCircle, X } from 'lucide-react';
import AnnouncementToast from './components/common/AnnouncementToast.jsx';
import Header from './components/common/Header.jsx';
import ActiveGameShell from './components/game/ActiveGameShell.jsx';
import LobbyView from './components/lobby/LobbyView.jsx';
import WaitingRoomView from './components/lobby/WaitingRoomView.jsx';
import LandingView from './components/landing/LandingView.jsx';
import { useGame } from './hooks/useGame.js';

export default function App() {
  const {
    gameState,
    isPendingAdmission,
    pendingAdmissionInfo,
    rejectionNotice,
    dismissRejection,
    connectionStatus,
    announcements,
    error,
    dismissError,
    announcementLog,
  } = useGame();
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
        isPendingAdmission ? (
          <WaitingRoomView connectionStatus={connectionStatus} admissionInfo={pendingAdmissionInfo} />
        ) : (
          <>
            {!inRoom && <Header connectionStatus={connectionStatus} />}
            <LandingView connectionStatus={connectionStatus} />
          </>
        )
      ) : gameState.phase === 'LOBBY' ? (
        <>
          <LobbyView gameState={gameState} />
          <footer className="mx-auto max-w-7xl px-4 pb-6 font-mono text-[8px] uppercase tracking-[0.15em] text-slate-700 sm:px-7 lg:px-10">EUROPA RESEARCH DIVISION <span className="mx-2">//</span> LOCAL CREW NETWORK</footer>
        </>
      ) : (
        <ActiveGameShell gameState={gameState} connectionStatus={connectionStatus} announcementLog={announcementLog} />
      )}

      {rejectionNotice && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section role="alertdialog" aria-modal="true" aria-labelledby="airlock-rejected-title" className="w-full max-w-md rounded-lg border border-rose-200/20 bg-[#0b0e13] p-6 shadow-[0_0_70px_rgba(251,113,133,0.12)]">
            <div className="font-mono text-[9px] uppercase tracking-[0.17em] text-rose-200/65">AIRLOCK // CLEARANCE DENIED</div>
            <h1 id="airlock-rejected-title" className="mt-2 font-display text-2xl text-slate-100">Entry was not authorized.</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{rejectionNotice}</p>
            <button type="button" onClick={dismissRejection} className="mt-6 flex h-11 w-full items-center justify-center rounded border border-rose-200/20 bg-rose-200/[0.07] font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-rose-100 transition hover:bg-rose-200/[0.12]">Return to access terminal</button>
          </section>
        </div>
      )}
    </div>
  );
}


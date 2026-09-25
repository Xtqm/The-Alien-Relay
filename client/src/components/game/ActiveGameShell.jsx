import { useEffect, useRef } from 'react';
import Header from '../common/Header.jsx';
import TimerBar from '../common/TimerBar.jsx';
import { Eye } from 'lucide-react';
import KickPlayerButton from './KickPlayerButton.jsx';
import DayView from './DayView.jsx';
import GameOverView from './GameOverView.jsx';
import NightView from './NightView.jsx';
import ResolutionView from './ResolutionView.jsx';
import VotingView from './VotingView.jsx';
import { useWakeLock } from '../../hooks/useWakeLock.js';
import { triggerHaptic } from '../../utils/haptics.js';

const PHASE_VIEWS = {
  NIGHT: NightView,
  DAY: DayView,
  VOTING: VotingView,
  RESOLUTION: ResolutionView,
  GAME_OVER: GameOverView,
};

export default function ActiveGameShell({ gameState, connectionStatus, announcementLog }) {
  const phase = gameState.phase;
  const previousPhaseRef = useRef(null);
  useWakeLock(phase !== 'LOBBY' && phase !== 'GAME_OVER');

  useEffect(() => {
    if ((phase === 'NIGHT' || phase === 'DAY') && previousPhaseRef.current !== phase) {
      triggerHaptic([40, 60, 40]);
    }
    previousPhaseRef.current = phase;
  }, [phase]);

  const PhaseView = PHASE_VIEWS[gameState.phase] || NightView;
  const currentPlayer = gameState.players.find((player) => player.id === gameState.myPlayerId);
  const isObserver = gameState.phase !== 'GAME_OVER' && currentPlayer && !currentPlayer.isAlive;
  const isHost = currentPlayer?.isHost === true;
  const showCommanderRoster = isHost && gameState.phase !== 'GAME_OVER' && (gameState.phase !== 'DAY' || isObserver);

  return (
    <div className="min-h-[100dvh] pb-[env(safe-area-inset-bottom)]">
      <div className="sticky top-0 z-30 bg-[#07090d]/95 backdrop-blur-md">
        <Header gameState={gameState} connectionStatus={connectionStatus} />
        {gameState.phase !== 'GAME_OVER' && (
          <div className="border-b border-white/[0.055]"><TimerBar gameState={gameState} /></div>
        )}
      </div>
      <main className={`mx-auto max-w-5xl px-4 pt-5 sm:px-7 sm:pt-8 lg:px-10 ${gameState.phase === 'VOTING' ? 'pb-[calc(env(safe-area-inset-bottom)+7rem)]' : 'pb-[calc(env(safe-area-inset-bottom)+4rem)]'}`}>
        <div className="mb-5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-slate-600">
          <span>OUTPOST 09 <span className="mx-1.5 text-slate-800">/</span> CYCLE {String(gameState.roundNumber).padStart(2, '0')}</span>
          <span>{gameState.players.filter((player) => player.isAlive).length} CREW LIFE SIGNS</span>
        </div>
        {isObserver && (
          <div role="status" className="observer-notice mb-4 flex items-start gap-3 rounded border border-sky-200/15 bg-sky-200/[0.035] px-4 py-3 text-sky-100/80">
            <Eye size={15} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em]">Observer mode // cognitive link only</div>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.09em] text-slate-400">You have been exiled — restricted from tribunal participation.</p>
            </div>
          </div>
        )}
        {showCommanderRoster && (
          <section className="mb-5 rounded-lg border border-rose-200/15 bg-rose-200/[0.025] p-4" aria-label="Commander crew moderation">
            <div className="mb-3 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-rose-100/65">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-200/70" /> COMMANDER // PERSONNEL ACTIONS
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {gameState.players.filter((player) => player.id !== gameState.myPlayerId).map((player) => (
                <div key={player.id} className="flex min-w-0 items-center gap-2 rounded border border-white/[0.055] bg-black/15 px-3 py-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${player.isAlive && !player.isDisconnected ? 'bg-signal/75' : 'bg-slate-600'}`} />
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{player.name}</span>
                  <span className="shrink-0 font-mono text-[7px] uppercase tracking-[0.06em] text-slate-600">{player.isDisconnected ? 'Offline' : player.isAlive ? 'Active' : 'Exiled'}</span>
                  <KickPlayerButton player={player} showLabel />
                </div>
              ))}
            </div>
          </section>
        )}
        <div className={isObserver ? 'observer-screen grayscale-[0.45] saturate-50' : ''} inert={isObserver || undefined}>
          <PhaseView gameState={gameState} announcementLog={announcementLog} />
        </div>
      </main>
    </div>
  );
}

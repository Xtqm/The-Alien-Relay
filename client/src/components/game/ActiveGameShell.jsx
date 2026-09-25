import Header from '../common/Header.jsx';
import TimerBar from '../common/TimerBar.jsx';
import { Eye } from 'lucide-react';
import DayView from './DayView.jsx';
import GameOverView from './GameOverView.jsx';
import NightView from './NightView.jsx';
import ResolutionView from './ResolutionView.jsx';
import VotingView from './VotingView.jsx';

const PHASE_VIEWS = {
  NIGHT: NightView,
  DAY: DayView,
  VOTING: VotingView,
  RESOLUTION: ResolutionView,
  GAME_OVER: GameOverView,
};

export default function ActiveGameShell({ gameState, connectionStatus, announcementLog }) {
  const PhaseView = PHASE_VIEWS[gameState.phase] || NightView;
  const currentPlayer = gameState.players.find((player) => player.id === gameState.myPlayerId);
  const isObserver = gameState.phase !== 'GAME_OVER' && currentPlayer && !currentPlayer.isAlive;

  return (
    <>
      <Header gameState={gameState} connectionStatus={connectionStatus} />
      {gameState.phase !== 'GAME_OVER' && (
        <div className="border-b border-white/[0.055]"><TimerBar gameState={gameState} /></div>
      )}
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-7 sm:px-7 sm:pt-10 lg:px-10">
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
        <div className={isObserver ? 'observer-screen grayscale-[0.45] saturate-50' : ''} inert={isObserver || undefined}>
          <PhaseView gameState={gameState} announcementLog={announcementLog} />
        </div>
      </main>
    </>
  );
}

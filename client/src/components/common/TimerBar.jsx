import { useEffect, useRef } from 'react';
import { Clock3 } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics.js';

function getDuration(gameState) {
  const settings = gameState?.settings || {};
  if (gameState?.phase === 'NIGHT') return settings.nightDurationSeconds || 20;
  if (gameState?.phase === 'DAY') return settings.dayDurationSeconds || 90;
  if (gameState?.phase === 'VOTING') return settings.votingDurationSeconds || 30;
  if (gameState?.phase === 'RESOLUTION') return settings.resolutionDurationSeconds || 6;
  return gameState?.timer || 1;
}

export default function TimerBar({ gameState }) {
  const duration = getDuration(gameState);
  const remaining = Math.max(0, Number(gameState?.timer) || 0);
  const progress = Math.min(100, Math.max(0, (remaining / duration) * 100));
  const urgent = remaining <= 10;
  const warning = remaining <= 25 && !urgent;
  const tone = urgent ? 'text-rose-300' : warning ? 'text-amber-200' : 'text-signal';
  const bar = urgent ? 'bg-rose-400' : warning ? 'bg-amber-300' : 'bg-signal';
  const previousTimer = useRef({ phase: gameState?.phase, remaining });

  useEffect(() => {
    const previous = previousTimer.current;
    if (previous.phase === gameState?.phase && previous.remaining > 10 && remaining <= 10) {
      triggerHaptic([80]);
    }
    previousTimer.current = { phase: gameState?.phase, remaining };
  }, [gameState?.phase, remaining]);

  return (
    <section className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3.5 sm:px-7 lg:px-10" aria-label="Phase countdown">
      <div className={`flex min-w-[93px] items-center gap-2 font-mono ${tone} ${urgent ? 'animate-signal-pulse' : ''}`}>
        <Clock3 size={14} />
        <span className="text-[11px] font-semibold tabular-nums">{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</span>
      </div>
      <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full transition-[width] duration-500 ${bar} ${urgent ? 'shadow-[0_0_12px_rgba(251,113,133,0.7)]' : ''}`} style={{ width: `${progress}%` }} />
      </div>
      <span className="hidden min-w-24 text-right font-mono text-[9px] uppercase tracking-[0.14em] text-slate-600 sm:block">PHASE CLOCK</span>
    </section>
  );
}

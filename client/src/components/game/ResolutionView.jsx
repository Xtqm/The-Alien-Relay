import { useEffect, useState } from 'react';
import { Clock3, DoorOpen, Fingerprint, Radio, ShieldAlert, Skull, Sparkles } from 'lucide-react';
import PhasePanel from './PhasePanel.jsx';

export default function ResolutionView({ gameState }) {
  const [revealed, setRevealed] = useState(false);
  const exiled = gameState.lastExiled;
  const remaining = Math.max(0, Number(gameState.timer) || 0);
  const duration = gameState.settings?.resolutionDurationSeconds || 6;
  const progress = Math.min(100, Math.max(0, (remaining / duration) * 100));
  const ending = Boolean(gameState.winner);

  useEffect(() => {
    const revealTimer = window.setTimeout(() => setRevealed(true), 420);
    return () => window.clearTimeout(revealTimer);
  }, [gameState.roundNumber, exiled?.id]);

  return (
    <PhasePanel
      eyebrow={`ROUND ${String(gameState.roundNumber).padStart(2, '0')} // TRIBUNAL VERDICT`}
      title={exiled ? 'A name has been called.' : 'The council could not agree.'}
      description={ending ? 'The faction balance is final. Stand by for the complete mission record.' : 'The tribunal is closing. The outpost is preparing to cycle back into darkness.'}
    >
      {exiled ? (
        <div className={`verdict-reveal mx-auto max-w-xl overflow-hidden rounded-lg border border-amber-100/20 bg-[radial-gradient(ellipse_at_50%_0%,rgba(251,191,36,0.09),transparent_65%),#090b0f] transition duration-700 ${revealed ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
          <div className="flex items-center justify-between border-b border-amber-100/10 px-4 py-3 font-mono text-[8px] uppercase tracking-[0.16em] text-amber-100/55 sm:px-6">
            <span className="flex items-center gap-2"><Radio size={12} /> AIRLOCK // PUBLIC RECORD</span><span>VERDICT 0{gameState.roundNumber}</span>
          </div>
          <div className="px-5 py-8 text-center sm:px-8 sm:py-10">
            <span className="mx-auto mb-4 flex h-[68px] w-[68px] items-center justify-center rounded-full border border-amber-100/20 bg-amber-100/[0.045] text-amber-100/75 shadow-[0_0_34px_rgba(251,191,36,0.08)]"><DoorOpen size={27} /></span>
            <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-amber-100/65">EXILED TO THE MARTIAN WASTES</div>
            <div className="mt-3 font-display text-3xl font-semibold tracking-wide text-slate-100 sm:text-4xl">{exiled.name}</div>
            <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-600">CREW MEMBER // AIRLOCK DEPLOYED</div>
            {Number.isInteger(exiled.voteCount) && (
              <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded border border-white/[0.08] bg-black/25 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-400"><Fingerprint size={12} className="text-amber-100/65" /> {exiled.voteCount} VOTE{exiled.voteCount === 1 ? '' : 'S'} FOR EXILE</div>
            )}
            <div className={`verdict-faction mt-6 inline-flex items-center gap-2 border px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] ${exiled.role === 'ALIEN' ? 'border-rose-200/30 bg-rose-200/[0.075] text-rose-100' : 'border-sky-200/20 bg-sky-200/[0.045] text-sky-100/80'} ${revealed ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
              {exiled.role === 'ALIEN' ? <Skull size={14} /> : <ShieldAlert size={14} />}
              FACTION: {exiled.role}
              {revealed && <Sparkles size={12} className="animate-pulse" />}
            </div>
          </div>
          <div className="border-t border-amber-100/[0.08] px-4 py-2.5 text-center font-mono text-[8px] uppercase tracking-[0.12em] text-slate-700">TRIBUNAL RECORD SEALED // OUTPOST 09</div>
        </div>
      ) : (
        <div className={`mx-auto max-w-xl rounded-lg border border-sky-100/15 bg-[radial-gradient(ellipse_at_50%_0%,rgba(125,211,252,0.055),transparent_60%),#090d13] px-5 py-10 text-center transition duration-700 ${revealed ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-sky-100/15 bg-sky-100/[0.035] text-sky-100/70"><Fingerprint size={22} /></span>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-sky-100/60">COUNCIL DEADLOCKED</div>
          <h2 className="mt-2 font-display text-2xl text-slate-100">No crew member was exiled.</h2>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500">The vote tied or abstentions prevailed. The habitat grows colder as another night approaches.</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded border border-white/[0.07] bg-black/20 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600"><ShieldAlert size={11} /> NO AIRLOCK DEPLOYMENT</div>
        </div>
      )}

      <div className="mx-auto mt-5 max-w-xl rounded border border-white/[0.06] bg-black/15 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2 font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">
          <span className="flex items-center gap-1.5"><Clock3 size={11} /> {ending ? 'FINAL TRANSMISSION' : 'LIGHTS DROP IN'}</span>
          <span className="tabular-nums text-slate-400">00:{String(remaining).padStart(2, '0')}</span>
        </div>
        <div className="h-[2px] overflow-hidden rounded bg-white/[0.06]"><div className="h-full bg-amber-100/60 transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
        <p className="mt-2 text-center font-mono text-[8px] uppercase tracking-[0.09em] text-slate-700">{ending ? 'Mission record preparing...' : 'Night cycle initializes when this sequence completes'}</p>
      </div>
    </PhasePanel>
  );
}

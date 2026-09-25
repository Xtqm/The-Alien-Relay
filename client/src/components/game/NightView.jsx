import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Check, ChevronRight, EyeOff, LoaderCircle, LockKeyhole, Radio, ScanEye, Signal, SignalHigh } from 'lucide-react';
import { useGame } from '../../hooks/useGame.js';
import PhasePanel from './PhasePanel.jsx';

function PassiveNight({ gameState }) {
  return (
    <div className="mx-auto grid max-w-3xl items-center gap-7 rounded border border-sky-200/[0.09] bg-[#080e18]/70 p-5 sm:grid-cols-[210px_1fr] sm:p-8">
      <div className="radar-scope relative mx-auto aspect-square w-[190px] overflow-hidden rounded-full border border-sky-200/15 bg-[#09121d]" aria-hidden="true">
        <div className="absolute inset-[12%] rounded-full border border-sky-200/[0.08]" />
        <div className="absolute inset-[26%] rounded-full border border-sky-200/[0.08]" />
        <div className="absolute inset-[40%] rounded-full border border-sky-200/[0.08]" />
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-sky-100/[0.07]" />
        <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-sky-100/[0.07]" />
        <div className="radar-sweep absolute inset-0 rounded-full" />
        <span className="radar-blip left-[33%] top-[31%]" />
        <span className="radar-blip radar-blip-delay left-[69%] top-[62%]" />
        <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-200/80 shadow-[0_0_10px_rgba(125,211,252,0.6)]" />
      </div>
      <div className="text-center sm:text-left">
        <div className="mb-3 flex items-center justify-center gap-2 font-mono text-[9px] uppercase tracking-[0.17em] text-sky-200/70 sm:justify-start"><EyeOff size={13} /> SECTOR BLACKOUT // LIFE SUPPORT MINIMAL</div>
        <h2 className="font-display text-2xl text-slate-100">Keep still. Wait for dawn.</h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-400">The ventilation grid is carrying every sound. Your instruments show only atmospheric fluctuations. Stay silent and watch for the habitat lights.</p>
        <div className="mt-5 inline-flex items-center gap-2 rounded border border-sky-200/10 bg-sky-200/[0.035] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-sky-100/65"><Activity size={12} className="animate-pulse" /> Monitoring atmospheric fluctuations...</div>
        <div className="mt-3 flex items-center justify-center gap-2 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-600 sm:justify-start"><Signal size={11} /> {gameState.players.filter((player) => player.isAlive).length} LIFE SIGNS // NIGHT {gameState.roundNumber}</div>
      </div>
    </div>
  );
}

export default function NightView({ gameState }) {
  const { infectPlayer } = useGame();
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [lockedTarget, setLockedTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const candidates = gameState.players.filter((player) => player.isAlive && player.id !== gameState.myPlayerId);
  const selectedTarget = candidates.find((player) => player.id === selectedTargetId);
  const signalLocked = Boolean(lockedTarget || gameState.hasSubmittedInfection);

  useEffect(() => {
    if (!selectedTargetId) return undefined;
    const dismissOnEscape = (event) => {
      if (event.key === 'Escape' && !submitting) setSelectedTargetId('');
    };
    window.addEventListener('keydown', dismissOnEscape);
    return () => window.removeEventListener('keydown', dismissOnEscape);
  }, [selectedTargetId, submitting]);

  const confirmInfection = async () => {
    if (!selectedTarget || submitting || signalLocked) return;
    setSubmitting(true);
    try {
      await infectPlayer(selectedTarget.id);
      setLockedTarget(selectedTarget);
      setSelectedTargetId('');
    } catch {
      // GameContext surfaces server and connection errors in the shared banner.
    } finally {
      setSubmitting(false);
    }
  };

  if (!gameState.canInfectTonight) {
    return (
      <PhasePanel
        eyebrow={`NIGHT CYCLE ${String(gameState.roundNumber).padStart(2, '0')} // LIGHTS OUT`}
        title="The habitat holds its breath."
        description="The relay stays hidden in the dark. Your station instruments are restricted to passive observation."
      >
        <PassiveNight gameState={gameState} />
      </PhasePanel>
    );
  }

  return (
    <PhasePanel
      eyebrow={`NIGHT CYCLE ${String(gameState.roundNumber).padStart(2, '0')} // PRIVATE CHANNEL`}
      title="The organism is listening."
      description="Choose one living crew member for the relay. Your target stays concealed until the full night cycle ends."
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded border border-rose-300/25 bg-[#190d0e]/50 px-4 py-3.5">
        <div className="flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-rose-100/85"><Radio size={14} className="animate-pulse text-rose-300" /> TRANSMISSION LINK ACTIVE // SELECT BIOLOGICAL HOST</div>
        <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-amber-100/65"><LockKeyhole size={11} /> ENCRYPTED</span>
      </div>

      {signalLocked ? (
        <div role="status" className="mx-auto flex max-w-xl flex-col items-center rounded border border-rose-300/25 bg-rose-300/[0.035] px-5 py-10 text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-rose-300/25 bg-rose-300/[0.06] text-rose-200 shadow-[0_0_28px_rgba(251,113,133,0.1)]"><LockKeyhole size={20} /></span>
          <div className="font-mono text-[9px] uppercase tracking-[0.19em] text-rose-200/75">SIGNAL LOCKED // TRANSMISSION ACCEPTED</div>
          <h2 className="mt-2 font-display text-2xl text-slate-100">The relay is sealed.</h2>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-400">Your transmission is concealed until the night timer expires. No one else can see your target.</p>
          <div className="mt-5 flex items-center gap-2 rounded border border-rose-300/15 bg-black/20 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-rose-100/70"><SignalHigh size={12} /> Carrier secured{lockedTarget?.name && <> <span className="text-slate-500">//</span> {lockedTarget.name}</>}</div>
          <div className="mt-4 flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-600"><Activity size={11} /> Holding for full night cycle</div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">
            <span>SELECT A LIVING HOST</span>
            <span className="flex items-center gap-1.5 text-rose-200/55"><ScanEye size={12} /> PRIVATE TO YOUR TERMINAL</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((player, index) => (
              <button
                key={player.id}
                type="button"
                disabled={submitting}
                onClick={() => setSelectedTargetId(player.id)}
                className="group flex min-h-[76px] items-center gap-3 rounded border border-white/[0.075] bg-black/20 px-3.5 py-3 text-left transition hover:border-rose-300/35 hover:bg-rose-300/[0.045] disabled:cursor-wait disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-white/[0.08] bg-white/[0.025] font-mono text-[10px] text-slate-500 transition group-hover:border-rose-300/20 group-hover:text-rose-200">{String(index + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-200">{player.name}</span>
                  <span className={`mt-1 block font-mono text-[8px] uppercase tracking-[0.1em] ${player.isDisconnected ? 'text-amber-100/60' : 'text-slate-600'}`}>{player.isDisconnected ? 'TEMPORARY SIGNAL LOSS' : 'LIFE SIGNS STABLE'}</span>
                </span>
                <ChevronRight size={15} className="shrink-0 text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-rose-200" />
              </button>
            ))}
            {candidates.length === 0 && <div className="rounded border border-white/[0.07] p-4 text-xs text-slate-500 sm:col-span-2 lg:col-span-3">No living host is available for the relay.</div>}
          </div>
          <div className="mt-5 flex items-start gap-2.5 rounded border border-amber-100/10 bg-amber-100/[0.025] px-3.5 py-3 text-[11px] leading-relaxed text-slate-500"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-100/55" /><span>Your choice stays pending on the server until daybreak. Night always lasts its full duration, whether or not a signal is sent.</span></div>
        </>
      )}

      {selectedTarget && !signalLocked && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setSelectedTargetId(''); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="infection-confirm-title" className="w-full max-w-md rounded-lg border border-rose-200/25 bg-[#0b0e13] p-5 shadow-[0_0_70px_rgba(251,113,133,0.13)] sm:p-6">
            <div className="mb-4 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.15em] text-rose-200/70"><Radio size={13} /> Secure transmission confirmation</div>
            <h2 id="infection-confirm-title" className="font-display text-2xl text-slate-100">Transmit parasite to {selectedTarget.name}?</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">Once accepted, the signal remains encrypted until dawn. This action cannot be recalled.</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSelectedTargetId('')} disabled={submitting} className="flex h-11 items-center justify-center rounded border border-white/10 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400 transition hover:bg-white/[0.04] disabled:opacity-50">Cancel</button>
              <button type="button" autoFocus onClick={confirmInfection} disabled={submitting} className="flex h-11 items-center justify-center gap-2 rounded border border-rose-200/25 bg-rose-200/[0.09] font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-rose-100 transition hover:bg-rose-200/[0.15] disabled:opacity-60">{submitting ? <><LoaderCircle size={13} className="animate-spin" /> Transmitting</> : <><Check size={13} /> Confirm transmission</>}</button>
            </div>
          </section>
        </div>
      )}
    </PhasePanel>
  );
}

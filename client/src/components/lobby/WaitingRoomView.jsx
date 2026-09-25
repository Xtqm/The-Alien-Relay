import { useState } from 'react';
import { ArrowLeft, LoaderCircle, LockKeyhole, Radio, ScanLine, Signal, SignalZero } from 'lucide-react';
import { useGame } from '../../hooks/useGame.js';

export default function WaitingRoomView({ connectionStatus, admissionInfo }) {
  const { cancelPendingAdmission } = useGame();
  const [cancelling, setCancelling] = useState(false);
  const online = connectionStatus === 'connected';

  const cancelRequest = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await cancelPendingAdmission();
    } catch {
      // GameContext surfaces any server or connection error in the shared banner.
    } finally {
      setCancelling(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-78px)] max-w-3xl items-center justify-center px-4 py-12 sm:px-7">
      <section className="airlock-panel panel-grid w-full overflow-hidden rounded-lg border border-cyan-100/15 bg-panel/85 shadow-[0_0_70px_rgba(34,211,238,0.055)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-7">
          <div className="flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-cyan-100/70"><Radio size={14} /> THE RELAY // SECURE AIRLOCK</div>
          <span className={`flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] ${online ? 'text-signal/70' : 'text-amber-100/70'}`}>{online ? <Signal size={12} /> : <SignalZero size={12} />}{online ? 'UPLINK STABLE' : 'RELINKING SIGNAL'}</span>
        </header>

        <div className="px-5 py-8 text-center sm:px-10 sm:py-12">
          <div className="airlock-scanner relative mx-auto mb-7 flex h-36 w-36 items-center justify-center overflow-hidden rounded-full border border-cyan-100/20 bg-cyan-100/[0.025] text-cyan-100/80 shadow-[inset_0_0_35px_rgba(34,211,238,0.06)] sm:h-44 sm:w-44">
            <span className="absolute inset-[12%] rounded-full border border-cyan-100/[0.09]" />
            <span className="absolute inset-[28%] rounded-full border border-cyan-100/[0.09]" />
            <span className="absolute h-full w-px bg-cyan-100/[0.08]" />
            <span className="absolute h-px w-full bg-cyan-100/[0.08]" />
            <ScanLine size={34} strokeWidth={1.2} className="relative z-[1] animate-slow-pulse" />
            <span className="absolute right-[23%] top-[31%] h-1.5 w-1.5 animate-ping rounded-full bg-cyan-100/75" />
          </div>

          <div className="mb-3 flex items-center justify-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-cyan-100/65"><LockKeyhole size={12} /> AIRLOCK PRESSURIZATION</div>
          <h1 className="font-display text-2xl font-semibold uppercase leading-snug tracking-[0.035em] text-slate-100 sm:text-3xl">Awaiting commander authorization</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-400">Your clearance request is with the expedition leader. The crew manifest and outpost controls remain sealed until you are admitted.</p>

          <div className="mx-auto mt-7 flex max-w-sm items-center justify-between gap-4 rounded border border-white/[0.07] bg-black/20 px-4 py-3 text-left">
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">REQUESTED OUTPOST</span>
            <span className="font-mono text-sm font-semibold tracking-[0.18em] text-slate-100">{admissionInfo?.roomId || '----'}</span>
          </div>

          <div className="mx-auto mt-5 flex max-w-sm items-center gap-2 rounded border border-cyan-100/10 bg-cyan-100/[0.025] px-3 py-2.5 text-left font-mono text-[8px] uppercase tracking-[0.08em] text-cyan-100/55"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-100/70" /> Airlock request transmitted // awaiting response</div>

          <button type="button" onClick={cancelRequest} disabled={cancelling} className="mx-auto mt-7 flex min-h-11 items-center justify-center gap-2 rounded border border-white/[0.09] px-4 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400 transition hover:border-rose-200/20 hover:text-rose-100 disabled:cursor-wait disabled:opacity-60">
            {cancelling ? <LoaderCircle size={13} className="animate-spin" /> : <ArrowLeft size={13} />}{cancelling ? 'WITHDRAWING REQUEST...' : 'CANCEL REQUEST'}
          </button>
        </div>
        <footer className="flex items-center justify-center gap-2 border-t border-white/[0.055] px-4 py-3 font-mono text-[8px] uppercase tracking-[0.13em] text-slate-700"><span className="h-px w-5 bg-white/[0.08]" /> OUTPOST 09 // PRESSURE EQUALIZATION <span className="h-px w-5 bg-white/[0.08]" /></footer>
      </section>
    </main>
  );
}

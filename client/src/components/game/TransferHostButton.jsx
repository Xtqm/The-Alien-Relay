import { useState } from 'react';
import { Crown, LoaderCircle, ShieldAlert, X } from 'lucide-react';
import { useGame } from '../../hooks/useGame.js';

export default function TransferHostButton({ player, compact = false }) {
  const { transferHost } = useGame();
  const [confirming, setConfirming] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const confirmTransfer = async () => {
    if (transferring) return;
    setTransferring(true);
    try {
      await transferHost(player.id);
      setConfirming(false);
    } catch {
      // GameContext surfaces server rejections in the shared alert banner.
    } finally {
      setTransferring(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Make ${player.name} Outpost Commander`}
        title={`Make ${player.name} Outpost Commander`}
        className={`inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded border border-amber-100/20 bg-amber-100/[0.035] px-2 font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-amber-100/80 transition hover:border-amber-100/35 hover:bg-amber-100/[0.08] hover:text-amber-50 ${compact ? 'px-2.5' : ''}`}
      >
        <Crown size={12} />
        <span>{compact ? 'Promote' : 'Make Commander'}</span>
      </button>

      {confirming && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="commander-transfer-title" aria-describedby="commander-transfer-description" className="w-full max-w-md rounded-lg border border-amber-100/25 bg-[#0b0e13] p-5 shadow-[0_0_70px_rgba(251,191,36,0.1)] sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.15em] text-amber-100/70"><ShieldAlert size={13} /> Command authority transfer</div>
              <button type="button" onClick={() => setConfirming(false)} disabled={transferring} aria-label="Close confirmation" className="rounded p-1 text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-200 disabled:opacity-50"><X size={15} /></button>
            </div>
            <h2 id="commander-transfer-title" className="font-display text-2xl text-slate-100">Appoint {player.name}?</h2>
            <p id="commander-transfer-description" className="mt-3 text-sm leading-relaxed text-slate-400">Transfer Commander authority to {player.name}? You will become a standard crew member.</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={transferring} className="flex h-11 items-center justify-center rounded border border-white/[0.1] bg-white/[0.025] font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-50">Keep command</button>
              <button type="button" autoFocus onClick={confirmTransfer} disabled={transferring} className="flex h-11 items-center justify-center gap-2 rounded border border-amber-100/25 bg-amber-100/[0.09] font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-50 transition hover:bg-amber-100/[0.15] disabled:opacity-60">{transferring ? <><LoaderCircle size={13} className="animate-spin" /> Transferring</> : <><Crown size={13} /> Confirm transfer</>}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

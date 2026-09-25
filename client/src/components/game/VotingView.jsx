import { useState } from 'react';
import { Check, CheckCheck, CircleHelp, LoaderCircle, LockKeyhole, Minus, UserRound, Users } from 'lucide-react';
import { useGame } from '../../hooks/useGame.js';
import PhasePanel from './PhasePanel.jsx';

export default function VotingView({ gameState }) {
  const { castVote } = useGame();
  const [selectedVote, setSelectedVote] = useState('');
  const [pendingVote, setPendingVote] = useState('');
  const living = gameState.players.filter((player) => player.isAlive);
  const submitted = living.filter((player) => player.hasVoted).length;
  const currentPlayer = gameState.players.find((player) => player.id === gameState.myPlayerId);
  const mayVote = currentPlayer?.isAlive && !currentPlayer?.isDisconnected;

  const submitVote = async (targetPlayerIdOrSkip) => {
    if (pendingVote || !mayVote) return;
    setPendingVote(targetPlayerIdOrSkip);
    try {
      await castVote(targetPlayerIdOrSkip);
      setSelectedVote(targetPlayerIdOrSkip);
    } catch {
      // GameContext reports the rejection without exposing another player's ballot.
    } finally {
      setPendingVote('');
    }
  };

  const statusFor = (player) => {
    if (player.isDisconnected) return 'DISCONNECTED';
    if (!player.isAlive) return 'EXILED';
    return player.hasVoted ? 'BALLOT SEALED' : 'AWAITING BALLOT';
  };

  return (
    <PhasePanel
      eyebrow={`TRIBUNAL ${String(gameState.roundNumber).padStart(2, '0')} // CLOSED BALLOT`}
      title="The tribunal is in session."
      description="Choose one living crew member or abstain. Ballots stay sealed while the crew is still deciding."
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-white/[0.07] bg-black/20 p-4">
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500"><Users size={13} className="text-signal/70" /> LIVING PERSONNEL</div>
          <div className="mt-3 font-display text-3xl text-slate-100">{living.length}<span className="ml-2 text-base text-slate-600">ACTIVE</span></div>
        </div>
        <div className="rounded border border-white/[0.07] bg-black/20 p-4">
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500"><CheckCheck size={13} className="text-amber-200/75" /> BALLOTS RECEIVED</div>
          <div className="mt-3 font-display text-3xl text-slate-100">{submitted}<span className="ml-2 text-base text-slate-600">/ {living.length}</span></div>
        </div>
      </div>

      {currentPlayer?.hasVoted && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded border border-signal/15 bg-signal/[0.03] px-3.5 py-2.5 text-[11px] text-signal/75"><LockKeyhole size={13} /> Your ballot is registered. You can change it until the tribunal closes.</div>
      )}

      <div className="mb-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-slate-600"><span>SELECT YOUR BALLOT</span><span>SUBMISSION STATUS ONLY</span></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {gameState.players.map((player, index) => {
          const disabled = !player.isAlive || player.isDisconnected || !mayVote || Boolean(pendingVote);
          const selected = selectedVote === player.id;
          return (
            <button
              type="button"
              key={player.id}
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => submitVote(player.id)}
              className={`flex min-h-[86px] items-center gap-3 rounded border px-3 py-3 text-left transition ${selected ? 'border-signal/45 bg-signal/[0.07] shadow-[0_0_22px_rgba(184,251,112,0.06)]' : 'border-white/[0.07] bg-black/15 hover:border-signal/25 hover:bg-signal/[0.025]'} ${disabled ? 'cursor-not-allowed opacity-40 grayscale' : ''}`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded border font-mono text-[10px] ${selected ? 'border-signal/30 bg-signal/[0.06] text-signal' : 'border-white/[0.08] bg-white/[0.025] text-slate-500'}`}>
                {selected ? <Check size={15} /> : <UserRound size={15} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-200">{player.name}{player.id === gameState.myPlayerId && <span className="ml-1.5 font-mono text-[8px] text-slate-600">(You)</span>}</span>
                <span className={`mt-1.5 block font-mono text-[8px] uppercase tracking-[0.085em] ${player.isDisconnected ? 'text-amber-100/70' : player.hasVoted ? 'text-signal/65' : 'text-slate-600'}`}>{statusFor(player)}</span>
              </span>
              <span className="font-mono text-[8px] text-slate-700">{String(index + 1).padStart(2, '0')}</span>
            </button>
          );
        })}

        <button
          type="button"
          disabled={!mayVote || Boolean(pendingVote)}
          aria-pressed={selectedVote === 'SKIP'}
          onClick={() => submitVote('SKIP')}
          className={`flex min-h-[86px] items-center gap-3 rounded border px-3 py-3 text-left transition ${selectedVote === 'SKIP' ? 'border-amber-200/40 bg-amber-200/[0.06]' : 'border-dashed border-amber-100/20 bg-amber-100/[0.018] hover:border-amber-100/35 hover:bg-amber-100/[0.035]'} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-amber-100/15 bg-amber-100/[0.035] text-amber-100/70">{pendingVote === 'SKIP' ? <LoaderCircle size={15} className="animate-spin" /> : <Minus size={17} />}</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-200">Skip / Abstain</span><span className="mt-1.5 block font-mono text-[8px] uppercase tracking-[0.085em] text-slate-600">No exile nomination</span></span>
          {selectedVote === 'SKIP' && <CheckCheck size={14} className="text-amber-100/80" />}
        </button>
      </div>

      {!mayVote && <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-600">Your terminal is not cleared to submit a ballot.</p>}
      <p className="mt-4 flex items-center gap-2 text-[10px] leading-relaxed text-slate-600"><CircleHelp size={12} className="shrink-0" /> Living crew can vote for any living player, including themselves, or choose Skip. Your current selection is private.</p>
    </PhasePanel>
  );
}

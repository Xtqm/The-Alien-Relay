import { useState } from 'react';
import { Check, Copy, LogOut, Radio, Shield, Signal, SignalZero } from 'lucide-react';
import { useGame } from '../../hooks/useGame.js';

const PHASE_LABELS = {
  LOBBY: 'OPEN CHANNEL // ASSEMBLY',
  NIGHT: 'NIGHT // SECTOR BLACKOUT',
  DAY: 'DAY // CREW DEBATE',
  VOTING: 'VOTING // TRIBUNAL',
  RESOLUTION: 'RESOLUTION // AIRLOCK',
  GAME_OVER: 'MISSION COMPLETE',
};

export default function Header({ gameState, connectionStatus }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { leaveRoom } = useGame();
  const role = gameState?.myRole;
  const phase = gameState?.phase;

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(gameState.roomId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const confirmLeave = async () => {
    setLeaving(true);
    try {
      await leaveRoom();
    } catch {
      // The shared connection banner reports a leave failure.
    } finally {
      setLeaving(false);
      setConfirmingLeave(false);
    }
  };

  const online = connectionStatus === 'connected';

  return (
    <>
    <header className="relative z-10 border-b border-white/[0.07] bg-[#090c11]/85 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-7 lg:px-10">
        <a href="#" aria-label="The Relay home" className="flex shrink-0 items-center gap-3">
          <span className="relative flex h-10 w-10 items-center justify-center rounded border border-signal/25 bg-signal/[0.07] text-signal shadow-signal">
            <Radio size={19} strokeWidth={1.6} />
            <span className="absolute -right-1 -top-1 h-2 w-2 animate-slow-pulse rounded-full bg-signal" />
          </span>
          <span>
            <span className="block font-display text-sm font-bold uppercase tracking-[0.25em] text-slate-100">The Relay</span>
            <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.22em] text-slate-500">Outpost 09 · Europa</span>
          </span>
        </a>

        <div className="flex items-center gap-2 sm:gap-3">
          {gameState?.roomId && (
            <>
              <button
                onClick={copyRoomCode}
                title="Copy room code"
                className="flex h-9 items-center gap-2 rounded border border-white/10 bg-white/[0.035] px-2.5 text-xs transition hover:border-signal/40 hover:bg-signal/[0.06] sm:px-3"
              >
                <span className="font-mono text-[9px] tracking-[0.13em] text-slate-500">ROOM</span>
                <span className="font-mono font-bold tracking-[0.18em] text-slate-100">{gameState.roomId}</span>
                {copied ? <Check size={13} className="text-signal" /> : <Copy size={13} className="text-slate-500" />}
              </button>
              <span className="hidden h-7 items-center gap-2 rounded border border-signal/20 bg-signal/[0.055] px-2.5 font-mono text-[9px] tracking-[0.1em] text-signal sm:flex">
                <span className="h-1.5 w-1.5 animate-slow-pulse rounded-full bg-signal" />
                {PHASE_LABELS[phase] || phase}
              </span>
              <button
                type="button"
                onClick={() => setConfirmingLeave(true)}
                aria-label="Leave room"
                title="Leave room"
                className="flex h-9 items-center gap-1.5 rounded border border-rose-200/15 bg-rose-200/[0.025] px-2.5 font-mono text-[9px] uppercase tracking-[0.1em] text-rose-100/75 transition hover:border-rose-200/30 hover:bg-rose-200/[0.07] hover:text-rose-100 sm:px-3"
              >
                <LogOut size={14} /> <span className="hidden sm:inline">Leave</span>
              </button>
            </>
          )}
          <span
            title={online ? 'Signal stable' : connectionStatus === 'reconnecting' ? 'Re-establishing signal' : 'Signal interrupted'}
            className={`flex h-9 w-9 items-center justify-center rounded border sm:w-auto sm:gap-2 sm:px-2.5 ${online ? 'border-signal/15 text-signal' : 'border-amber-300/20 text-amber-200'}`}
          >
            {online ? <Signal size={15} /> : <SignalZero size={15} />}
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.12em] sm:inline">
              {online ? 'LINK OK' : connectionStatus === 'reconnecting' ? 'RELINKING' : connectionStatus.toUpperCase()}
            </span>
          </span>
          {role && phase !== 'LOBBY' && (
            <button
              type="button"
              onClick={() => setRevealed((value) => !value)}
              aria-label={`${revealed ? 'Hide' : 'Reveal'} secret role`}
              aria-pressed={revealed}
              title="Click to reveal your role. It is also visible while hovering."
              className={`group flex h-9 items-center gap-1.5 rounded border px-2.5 font-mono text-[9px] tracking-[0.11em] transition ${revealed && role === 'ALIEN' ? 'border-rose-400/30 bg-rose-400/[0.07] text-rose-300' : revealed ? 'border-signal/25 bg-signal/[0.06] text-signal' : 'border-white/10 bg-white/[0.025] text-slate-500'}`}
            >
              <Shield size={13} />
              <span className="group-hover:hidden">CLASSIFIED</span>
              <span className="hidden group-hover:inline">{role}</span>
              <span className={revealed ? 'hidden' : 'ml-0.5 text-slate-600'}>{revealed ? '' : '·'}</span>
            </button>
          )}
        </div>
      </div>
      {gameState?.roomId && (
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 pb-2.5 sm:hidden">
          <span className="h-px w-3 bg-signal/35" />
          <span className="font-mono text-[9px] tracking-[0.13em] text-signal/80">{PHASE_LABELS[phase] || phase}</span>
        </div>
      )}
    </header>
    {confirmingLeave && (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !leaving) setConfirmingLeave(false);
        }}
      >
        <section role="alertdialog" aria-modal="true" aria-labelledby="leave-room-title" aria-describedby="leave-room-description" className="w-full max-w-md rounded-lg border border-rose-200/20 bg-[#0b0e13] p-6 shadow-[0_0_70px_rgba(251,113,133,0.12)]">
          <div className="font-mono text-[9px] uppercase tracking-[0.17em] text-rose-200/65">AIRLOCK // DEPARTURE</div>
          <h2 id="leave-room-title" className="mt-2 font-display text-2xl text-slate-100">Abandon Outpost?</h2>
          <p id="leave-room-description" className="mt-2 text-sm leading-relaxed text-slate-400">Your seat will be vacated. If you leave during a mission, your player will be eliminated.</p>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <button type="button" autoFocus onClick={() => setConfirmingLeave(false)} disabled={leaving} className="flex h-11 items-center justify-center rounded border border-white/10 bg-white/[0.035] font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:bg-white/[0.07] disabled:opacity-50">Stay aboard</button>
            <button type="button" onClick={confirmLeave} disabled={leaving} className="flex h-11 items-center justify-center gap-2 rounded border border-rose-200/25 bg-rose-200/[0.08] font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-rose-100 transition hover:bg-rose-200/[0.14] disabled:cursor-wait disabled:opacity-60"><LogOut size={13} />{leaving ? 'Departing...' : 'Leave room'}</button>
          </div>
        </section>
      </div>
    )}
    </>
  );
}

import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Check, Clock3, Copy, Radio, Share2, Sun } from 'lucide-react';
import PhasePanel from './PhasePanel.jsx';
import KickPlayerButton from './KickPlayerButton.jsx';

function CrewStatus({ player, wasExiled }) {
  const disconnected = player.isDisconnected;
  const alive = player.isAlive && !disconnected;
  const label = disconnected ? 'DISCONNECTED' : alive ? 'ALIVE' : wasExiled ? 'EXILED' : 'LOST';
  const colors = disconnected
    ? 'border-amber-200/20 bg-amber-200/[0.045] text-amber-100/75'
    : alive
      ? 'border-signal/15 bg-signal/[0.035] text-signal/75'
      : 'border-white/[0.07] bg-white/[0.02] text-slate-500';
  return <span className={`rounded border px-1.5 py-1 font-mono text-[8px] uppercase tracking-[0.07em] ${colors}`}>{label}</span>;
}

export default function DayView({ gameState, announcementLog = [] }) {
  const [copied, setCopied] = useState(false);
  const living = gameState.players.filter((player) => player.isAlive && !player.isDisconnected);
  const currentPlayer = gameState.players.find((player) => player.id === gameState.myPlayerId);
  const isHost = currentPlayer?.isHost === true;
  const remaining = Math.max(0, Number(gameState.timer) || 0);
  const urgent = remaining <= 15;
  const roundMilestone = useMemo(() => ({
    id: `daybreak-${gameState.roundNumber}`,
    text: `Round ${gameState.roundNumber}: Habitat life support restored. Crew discussion is now open.`,
    type: 'info',
    timestamp: Date.now(),
    milestone: true,
  }), [gameState.roundNumber]);
  const logEntries = [roundMilestone, ...announcementLog.slice(-7)].sort((left, right) => left.timestamp - right.timestamp).slice(-8).reverse();

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(gameState.roomId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <PhasePanel
      eyebrow={`DAY CYCLE ${String(gameState.roundNumber).padStart(2, '0')} // HABITAT LIT`}
      title="The crew is awake."
      description="The open channel is yours. Compare notes, share what you saw, and watch for the details that do not add up."
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded border border-signal/10 bg-signal/[0.025] px-4 py-3">
        <div className="flex items-center gap-2.5"><Sun size={15} className="text-amber-200" /><span className="font-mono text-[9px] uppercase tracking-[0.13em] text-slate-300">Crew discussion channel open</span></div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-500"><Activity size={12} className="text-signal/70" />{living.length} CREW ACTIVE</span>
          <span className={`flex items-center gap-1.5 font-mono text-[10px] font-semibold tabular-nums ${urgent ? 'animate-signal-pulse text-rose-200' : 'text-slate-200'}`} aria-label={`${remaining} seconds remaining`}><Clock3 size={12} />{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}{urgent && <AlertTriangle size={11} />}</span>
          <button type="button" onClick={copyRoomCode} className="flex items-center gap-1.5 rounded border border-white/10 px-2 py-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-slate-400 transition hover:border-signal/25 hover:text-signal" title="Copy room code">
            {copied ? <Check size={11} /> : <Share2 size={11} />}{copied ? 'COPIED' : gameState.roomId} <Copy size={10} className="opacity-60" />
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between border-b border-white/[0.07] pb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500"><span>CREW MANIFEST</span><span>{gameState.players.length} REGISTERED</span></div>
          <div className="space-y-2">
            {gameState.players.map((player) => (
              <div key={player.id} className={`flex items-center gap-3 rounded border px-3 py-3 ${player.isAlive && !player.isDisconnected ? 'border-white/[0.065] bg-black/15' : 'border-white/[0.04] bg-black/10'}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${player.isDisconnected ? 'animate-pulse bg-amber-200' : player.isAlive ? 'bg-signal/80' : 'bg-slate-600'}`} />
                <span className={`min-w-0 flex-1 truncate text-sm ${player.isAlive ? 'text-slate-300' : 'text-slate-500'}`}>
                  {player.name}{player.id === gameState.myPlayerId && <span className="ml-2 font-mono text-[8px] text-slate-600">YOU</span>}
                  {gameState.myInfectedTarget?.id === player.id && <span className="ml-2 inline-flex items-center gap-1 rounded border border-rose-200/20 bg-rose-200/[0.045] px-1.5 py-0.5 align-middle font-mono text-[8px] uppercase tracking-[0.07em] text-rose-100/75"><Radio size={9} /> YOUR RELAY</span>}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <CrewStatus player={player} wasExiled={gameState.lastExiled?.id === player.id} />
                  {isHost && player.id !== gameState.myPlayerId && <KickPlayerButton player={player} />}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 border-l border-signal/25 pl-3 text-[11px] leading-relaxed text-slate-500">Personal relay history is visible only to you. Crew roles and ballot choices remain classified.</p>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between border-b border-white/[0.07] pb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500"><span>INCIDENT LOG</span><span>LOCAL RECORD</span></div>
          <div className="space-y-2">
            {logEntries.map((entry) => (
              <article key={entry.id} className={`rounded border px-3 py-2.5 ${entry.milestone ? 'border-sky-200/15 bg-sky-200/[0.025]' : entry.type === 'alert' ? 'border-amber-200/15 bg-amber-200/[0.025]' : 'border-white/[0.055] bg-black/15'}`}>
                <div className="mb-1 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-600"><span className={`h-1 w-1 rounded-full ${entry.milestone ? 'bg-sky-200/70' : entry.type === 'alert' ? 'bg-amber-200/75' : 'bg-signal/60'}`} />{entry.milestone ? 'ROUND MILESTONE' : entry.type === 'alert' ? 'PRIORITY ALERT' : 'STATION BULLETIN'}{!entry.milestone && <span className="ml-auto">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</div>
                <p className="text-[11px] leading-relaxed text-slate-300">{entry.text}</p>
              </article>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-600"><Radio size={11} className="text-signal/50" /> Only public station transmissions appear here</div>
        </section>
      </div>
    </PhasePanel>
  );
}

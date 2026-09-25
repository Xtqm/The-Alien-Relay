import { useMemo, useState } from 'react';
import { useGame } from '../../hooks/useGame.js';
import {
  ArrowRight, BadgeCheck, CircleDot, Crown, Link2Off, LoaderCircle,
  RadioTower, RotateCcw, Shield, Skull, Sparkles, UserRound, WifiOff,
} from 'lucide-react';
import PhasePanel from './PhasePanel.jsx';
import TransferHostButton from './TransferHostButton.jsx';

function FactionBadge({ role }) {
  const alien = role === 'ALIEN';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.1em] ${alien ? 'border-rose-200/20 bg-rose-200/[0.045] text-rose-100' : 'border-cyan-100/15 bg-cyan-100/[0.035] text-cyan-100/75'}`}>
      {alien ? <Skull size={10} /> : <Shield size={10} />}{role || 'UNKNOWN'}
    </span>
  );
}

function chainNodes(history, alphaAlienId, playerNames) {
  const alphaEvent = history.find((event) => event.kind === 'ALPHA');
  const alphaId = alphaAlienId || alphaEvent?.playerId;
  if (!alphaId) return [];

  const nodes = [{
    playerId: alphaId,
    round: alphaEvent?.round || 1,
    kind: 'ALPHA',
    infectorId: null,
  }];
  for (const event of history) {
    if (event.status !== 'SUCCESS' && event.kind !== 'INFECTION') continue;
    nodes.push({
      playerId: event.targetId,
      round: event.round,
      kind: 'INFECTION',
      infectorId: event.infectorId,
    });
  }
  return nodes.map((node, index) => ({
    ...node,
    index,
    name: playerNames.get(node.playerId) || 'Unknown crew member',
    infectorName: playerNames.get(node.infectorId) || '',
  }));
}

function ChainTimeline({ history, alphaAlienId, playerNames, chainActive }) {
  const nodes = useMemo(() => chainNodes(history, alphaAlienId, playerNames), [history, alphaAlienId, playerNames]);
  const rounds = useMemo(() => [...new Set([
    ...history.map((event) => event.round).filter(Number.isInteger),
    ...nodes.map((node) => node.round).filter(Number.isInteger),
  ])].sort((a, b) => a - b), [history, nodes]);
  const [selectedRound, setSelectedRound] = useState('ALL');
  const [selectedNodeId, setSelectedNodeId] = useState(nodes[0]?.playerId || '');
  const throughRound = selectedRound === 'ALL' ? Infinity : Number(selectedRound);
  const visibleNodes = nodes.filter((node) => node.round <= throughRound);
  const selectedNode = visibleNodes.find((node) => node.playerId === selectedNodeId) || visibleNodes.at(-1);
  const termination = history.find((event) => event.kind === 'COLLISION' || event.kind === 'CHAIN_BROKEN');
  const terminationVisible = termination && termination.round <= throughRound;
  const failedTransmission = history.find((event) => event.status === 'FAILED' && event.kind === 'FAILED' && event.round <= throughRound);

  const terminationCopy = () => {
    if (!terminationVisible) return null;
    if (termination.kind === 'COLLISION' || termination.status === 'COLLISION') {
      return {
        icon: Link2Off,
        title: 'Collision snap',
        text: `COLLISION DETECTED // ${playerNames.get(termination.targetId) || 'Target'} was already an Alien. Chain permanently severed on Night ${termination.round}.`,
        className: 'border-amber-200/20 bg-amber-200/[0.045] text-amber-100',
      };
    }
    if (termination.reason === 'LATEST_ALIEN_EXILED') {
      return {
        icon: Link2Off,
        title: 'Tip exiled',
        text: `TRANSMISSION VECTOR ELIMINATED // ${playerNames.get(termination.playerId) || 'The spear tip'} was exiled by tribunal on Round ${termination.round}.`,
        className: 'border-rose-200/20 bg-rose-200/[0.045] text-rose-100',
      };
    }
    if (termination.reason === 'LATEST_ALIEN_DISCONNECTED') {
      return {
        icon: WifiOff,
        title: 'Tip signal lost',
        text: 'SIGNAL DECAY // Spear tip lost connection during quarantine.',
        className: 'border-amber-200/20 bg-amber-200/[0.045] text-amber-100',
      };
    }
    return {
      icon: Link2Off,
      title: 'Relay severed',
      text: `TRANSMISSION VECTOR ELIMINATED // The active relay ended on Round ${termination.round}.`,
      className: 'border-rose-200/20 bg-rose-200/[0.045] text-rose-100',
    };
  };
  const terminationDetails = terminationCopy();

  return (
    <section className="rounded-lg border border-white/[0.08] bg-black/20 p-4 sm:p-5" aria-labelledby="relay-timeline-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.15em] text-rose-100/65"><RadioTower size={12} /> CLASSIFIED HISTORY // DECLASSIFIED</div>
          <h2 id="relay-timeline-title" className="font-display text-xl text-slate-100">Relay chain timeline</h2>
        </div>
        <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-slate-600 sm:hidden">Swipe to trace the chain →</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show chain through round">
          <button type="button" onClick={() => setSelectedRound('ALL')} aria-pressed={selectedRound === 'ALL'} className={`rounded border px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.1em] transition ${selectedRound === 'ALL' ? 'border-signal/30 bg-signal/[0.06] text-signal' : 'border-white/[0.08] text-slate-500 hover:text-slate-200'}`}>Full chain</button>
          {rounds.map((round) => (
            <button key={round} type="button" onClick={() => setSelectedRound(String(round))} aria-pressed={selectedRound === String(round)} className={`rounded border px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.1em] transition ${selectedRound === String(round) ? 'border-signal/30 bg-signal/[0.06] text-signal' : 'border-white/[0.08] text-slate-500 hover:text-slate-200'}`}>Round {round}</button>
          ))}
        </div>
      </div>

      {visibleNodes.length ? (
        <>
        <div className="mt-5 flex items-stretch gap-2 overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-mandatory pb-2 touch-pan-x [-webkit-overflow-scrolling:touch]">
            {visibleNodes.map((node, index) => (
              <div key={`${node.playerId}-${node.index}`} className="flex shrink-0 snap-start items-center gap-2">
                <button type="button" onClick={() => setSelectedNodeId(node.playerId)} aria-pressed={selectedNode?.playerId === node.playerId} className={`min-w-[152px] rounded border p-3 text-left transition active:scale-[0.98] ${selectedNode?.playerId === node.playerId ? 'border-rose-200/35 bg-rose-200/[0.07] shadow-[0_0_24px_rgba(251,113,133,0.07)]' : 'border-white/[0.08] bg-[#0a0d12] hover:border-rose-200/20'}`}>
                  <div className="flex items-center justify-between gap-2 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-500"><span>{node.kind === 'ALPHA' ? 'ALPHA / PATIENT ZERO' : `NODE ${String.fromCharCode(65 + node.index)}`}</span><span>ROUND {node.round}</span></div>
                  <div className="mt-2 truncate text-sm font-medium text-slate-100">{node.name}</div>
                  {node.kind === 'ALPHA' ? <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.08em] text-rose-200/65">Origin // Round 1</div> : <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.08em] text-slate-600">Transmitted by {node.infectorName}</div>}
                </button>
                {index < visibleNodes.length - 1 && <div className="flex min-w-[42px] flex-col items-center justify-center text-rose-200/55"><ArrowRight size={15} /><span className="mt-1 whitespace-nowrap font-mono text-[7px] uppercase tracking-[0.08em]">Night {visibleNodes[index + 1].round}</span></div>}
              </div>
            ))}
            {terminationVisible && <div className="flex shrink-0 items-center gap-2 px-2 text-amber-100/75"><Link2Off size={17} /><span className="font-mono text-[8px] uppercase tracking-[0.1em]">Chain severed</span></div>}
          </div>

          {selectedNode && <div className="mt-2 rounded border border-white/[0.06] bg-white/[0.015] px-3.5 py-2.5 text-[11px] text-slate-400" aria-live="polite">
            {selectedNode.kind === 'ALPHA' ? <><span className="text-rose-100/80">{selectedNode.name}</span> began as Alpha / Patient Zero in Round 1.</> : <><span className="text-rose-100/80">{selectedNode.infectorName}</span> transmitted to <span className="text-rose-100/80">{selectedNode.name}</span> during Night {selectedNode.round}.</>}
          </div>}

          {terminationDetails ? (
            <div className={`mt-4 flex items-start gap-3 rounded border px-3.5 py-3 ${terminationDetails.className}`} role="status">
              <terminationDetails.icon size={15} className="mt-0.5 shrink-0" />
              <div><div className="font-mono text-[9px] font-semibold uppercase tracking-[0.13em]">{terminationDetails.title}</div><p className="mt-1 text-[11px] leading-relaxed opacity-80">{terminationDetails.text}</p></div>
            </div>
          ) : (
            <>
              {failedTransmission && <div className="mb-2 flex items-center gap-2 rounded border border-amber-200/15 bg-amber-200/[0.025] px-3.5 py-3 font-mono text-[9px] uppercase tracking-[0.09em] text-amber-100/70"><Link2Off size={13} /> Transmission failed // target unavailable on Night {failedTransmission.round}; the relay remained active.</div>}
              {chainActive ? (
                <div className="flex items-center gap-2 rounded border border-signal/15 bg-signal/[0.03] px-3.5 py-3 font-mono text-[9px] uppercase tracking-[0.11em] text-signal/75"><Sparkles size={13} /> Chain intact // Full transmission integrity maintained.</div>
              ) : (
            <div className="mt-4 flex items-center gap-2 rounded border border-amber-200/15 bg-amber-200/[0.025] px-3.5 py-3 font-mono text-[9px] uppercase tracking-[0.1em] text-amber-100/70"><Link2Off size={13} /> Relay ended; no termination event was recorded.</div>
              )}
            </>
          )}
        </>
      ) : (
        <p className="mt-5 rounded border border-white/[0.06] p-4 text-xs text-slate-500">No relay origin was recorded for this mission.</p>
      )}
    </section>
  );
}

function Metric({ label, value, detail, accent = 'text-slate-100' }) {
  return <div className="rounded border border-white/[0.07] bg-black/20 p-3.5 sm:p-4"><div className="font-mono text-[8px] uppercase tracking-[0.11em] text-slate-600">{label}</div><div className={`mt-2 font-display text-2xl ${accent}`}>{value}</div>{detail && <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.08em] text-slate-600">{detail}</div>}</div>;
}

export default function GameOverView({ gameState }) {
  const { resetGame } = useGame();
  const [resetting, setResetting] = useState(false);
  const won = gameState.winner === 'HUMANS';
  const reveal = gameState.finalReveal || {};
  const players = reveal.players || gameState.allPlayerRoles || [];
  const chain = reveal.infectionChainHistory || reveal.chainHistory || gameState.infectionChainHistory || [];
  const alphaAlienId = reveal.alphaAlienId || chain.find((event) => event.kind === 'ALPHA')?.playerId;
  const chainActive = reveal.chainActive ?? true;
  const crewExiled = reveal.crewExiled ?? players.filter((player) => !player.isAlive).length;
  const livingHumans = players.filter((player) => player.isAlive && player.role === 'HUMAN').length;
  const livingAliens = players.filter((player) => player.isAlive && player.role === 'ALIEN').length;
  const playerNames = useMemo(() => new Map(players.map((player) => [player.id, player.name])), [players]);
  const isHost = gameState.players.find((player) => player.id === gameState.myPlayerId)?.isHost;

  const initializeRematch = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      await resetGame();
    } catch {
      // GameContext surfaces server and connection errors in the shared banner.
    } finally {
      setResetting(false);
    }
  };

  return (
    <PhasePanel
      eyebrow="MISSION ARCHIVE // FINAL TRANSMISSION"
      title={won ? 'The habitat survives.' : 'The outpost is lost.'}
      description={won ? 'The relay organism has been stopped. The remaining crew may return to orbit.' : 'No living humans remain. The relay organism controls the station.'}
    >
      <div className={`victory-banner relative mb-5 overflow-hidden rounded-lg border p-5 sm:p-7 ${won ? 'victory-human border-cyan-200/25 bg-[radial-gradient(ellipse_at_15%_0%,rgba(34,211,238,0.13),transparent_55%),radial-gradient(ellipse_at_90%_100%,rgba(16,185,129,0.09),transparent_50%),#07110f]' : 'victory-alien border-rose-200/25 bg-[radial-gradient(ellipse_at_15%_0%,rgba(251,113,133,0.15),transparent_55%),radial-gradient(ellipse_at_90%_100%,rgba(251,191,36,0.08),transparent_50%),#13090c]'}`}>
        <div className="relative flex flex-wrap items-center gap-4">
          <span className={`flex h-14 w-14 items-center justify-center rounded border ${won ? 'border-cyan-100/25 bg-cyan-100/[0.05] text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,0.12)]' : 'border-rose-100/25 bg-rose-100/[0.05] text-rose-100 shadow-[0_0_30px_rgba(251,113,133,0.12)]'}`}>{won ? <BadgeCheck size={25} /> : <Skull size={25} />}</span>
          <div className="min-w-0 flex-1">
            <div className={`font-mono text-[9px] uppercase tracking-[0.15em] ${won ? 'text-cyan-100/60' : 'text-rose-100/60'}`}>VICTORIOUS FACTION // {gameState.winner}</div>
            <h2 className={`mt-2 font-display text-lg font-semibold uppercase leading-snug tracking-[0.04em] sm:text-2xl ${won ? 'text-cyan-50' : 'text-rose-50'}`}>{won ? 'OUTPOST SECURED // ALL PARASITIC ORGANISMS EXILED' : 'HABITAT COMPROMISED // NO LIVING HUMANS REMAIN'}</h2>
          </div>
          <div className="flex items-center gap-2 rounded border border-white/10 bg-black/20 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-300"><Sparkles size={12} /> MISSION {String(gameState.roundNumber).padStart(2, '0')}</div>
        </div>
      </div>

      <div className="mb-7 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Metric label="Rounds survived" value={gameState.roundNumber} detail="Total mission cycles" />
        <Metric label="Crew exiled" value={crewExiled} detail="Tribunal airlocks" accent="text-amber-100" />
        <Metric label="Chain length" value={chain.filter((event) => event.kind === 'ALPHA' || event.status === 'SUCCESS' || event.kind === 'INFECTION').length} detail="Alpha + successful links" accent="text-rose-100" />
        <Metric label="Survival ratio" value={`${livingHumans} : ${livingAliens}`} detail="Living humans : aliens" accent={livingAliens ? 'text-cyan-100' : 'text-slate-100'} />
      </div>

      <div className="mb-7">
        <ChainTimeline history={chain} alphaAlienId={alphaAlienId} playerNames={playerNames} chainActive={chainActive} />
      </div>

      <section aria-labelledby="manifest-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div><div className="mb-1 font-mono text-[8px] uppercase tracking-[0.15em] text-slate-600">Final debrief</div><h2 id="manifest-title" className="font-display text-xl text-slate-100">Complete crew manifest</h2></div>
          <span className="font-mono text-[8px] uppercase tracking-[0.11em] text-slate-600">ORIGINAL AND FINAL FACTIONS DECLASSIFIED</span>
        </div>
        <div className="overflow-x-auto rounded border border-white/[0.07]">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead><tr className="border-b border-white/[0.07] bg-white/[0.025] font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600"><th className="px-3 py-3 font-medium">Crew member</th><th className="px-3 py-3 font-medium">Original faction</th><th className="px-3 py-3 font-medium">Final faction</th><th className="px-3 py-3 font-medium">Status</th><th className="px-3 py-3 font-medium">Command</th></tr></thead>
            <tbody>
              {players.map((player) => {
                const originalFaction = player.id === alphaAlienId ? 'ALIEN' : 'HUMAN';
                const current = gameState.players.find((entry) => entry.id === player.id);
                return <tr key={player.id} className="border-b border-white/[0.045] last:border-0">
                  <td className="px-3 py-3"><div className="flex items-center gap-2 text-sm text-slate-200"><span className="truncate">{player.name}</span>{current?.isHost && <span title="Host" className="inline-flex items-center gap-1 rounded border border-amber-100/15 bg-amber-100/[0.035] px-1.5 py-0.5 font-mono text-[7px] uppercase text-amber-100/70"><Crown size={9} /> Host</span>}{player.id === gameState.myPlayerId && <span title="You" className="inline-flex items-center gap-1 rounded border border-sky-100/15 bg-sky-100/[0.035] px-1.5 py-0.5 font-mono text-[7px] uppercase text-sky-100/70"><UserRound size={9} /> You</span>}</div></td>
                  <td className="px-3 py-3"><FactionBadge role={originalFaction} /></td>
                  <td className="px-3 py-3"><FactionBadge role={player.role} /></td>
                  <td className="px-3 py-3"><span className={`inline-flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] ${player.isAlive ? 'text-signal/75' : 'text-slate-500'}`}><CircleDot size={10} />{player.isAlive ? 'SURVIVED' : 'EXILED'}</span></td>
                  <td className="px-3 py-3">{isHost && current && current.id !== gameState.myPlayerId && !current.isDisconnected && <TransferHostButton player={current} compact />}</td>
                </tr>;
              })}
            </tbody>
          </table>
          {!players.length && <p className="p-4 text-xs text-slate-500">No final manifest was received.</p>}
        </div>
      </section>

      <div className="mt-7 border-t border-white/[0.07] pt-5">
        {isHost ? (
          <button type="button" onClick={initializeRematch} disabled={resetting} className="group flex min-h-12 w-full items-center justify-center gap-2 rounded border border-signal/30 bg-signal px-4 font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-void transition hover:bg-[#c8ff91] disabled:cursor-wait disabled:opacity-65 sm:mx-auto sm:w-auto sm:min-w-[300px]">
            {resetting ? <LoaderCircle size={14} className="animate-spin" /> : <RotateCcw size={14} />}{resetting ? 'RESTORING CREW MANIFEST...' : 'INITIALIZE NEW MISSION'}
          </button>
        ) : (
          <div role="status" className="flex min-h-12 items-center justify-center gap-2 rounded border border-white/[0.08] bg-white/[0.025] px-4 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500"><LoaderCircle size={13} className="animate-spin text-signal/65" /> STANDBY // AWAITING EXPEDITION LEADER RESET</div>
        )}
      </div>
    </PhasePanel>
  );
}

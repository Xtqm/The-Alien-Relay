import { useState } from 'react';
import { ArrowUpRight, Check, Copy, Cpu, DoorOpen, LoaderCircle, Radio, Settings2, Shield, ShieldCheck, UserRoundCheck, UserRoundX, Users } from 'lucide-react';
import KickPlayerButton from '../game/KickPlayerButton.jsx';
import TransferHostButton from '../game/TransferHostButton.jsx';
import { useGame } from '../../hooks/useGame.js';

const PROTOCOLS = [
  { key: 'dayDurationSeconds', label: 'Day discussion', options: [60, 90, 120, 150] },
  { key: 'nightDurationSeconds', label: 'Night cycle', options: [15, 20, 30] },
  { key: 'votingDurationSeconds', label: 'Tribunal', options: [20, 30, 45] },
];

function ReadonlySetting({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.055] py-3 last:border-0 last:pb-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">{label}</span>
      <span className="font-mono text-xs text-slate-200">{value} SEC</span>
    </div>
  );
}

export default function LobbyView({ gameState }) {
  const { startGame, updateRoomSettings, toggleWaitingRoom, pendingApplicants, admitApplicant, rejectApplicant } = useGame();
  const [starting, setStarting] = useState(false);
  const [savingSetting, setSavingSetting] = useState('');
  const [copied, setCopied] = useState(false);
  const [applicantAction, setApplicantAction] = useState('');
  const players = gameState.players || [];
  const minPlayers = gameState.settings?.minPlayers || 5;
  const maxPlayers = gameState.settings?.maxPlayers || 12;
  const isHost = players.find((player) => player.id === gameState.myPlayerId)?.isHost;
  const waitingRoomEnabled = Boolean(gameState.settings?.waitingRoomEnabled);
  const shortfall = Math.max(0, minPlayers - players.filter((player) => !player.isDisconnected).length);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(gameState.roomId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const saveSetting = async (key, value) => {
    setSavingSetting(key);
    try {
      await updateRoomSettings({ [key]: Number(value) });
    } catch {
      // GameContext surfaces any server rejection in the shared error banner.
    } finally {
      setSavingSetting('');
    }
  };

  const begin = async () => {
    setStarting(true);
    try {
      await startGame();
    } catch {
      // GameContext surfaces any server rejection in the shared error banner.
    } finally {
      setStarting(false);
    }
  };

  const setAirlockProtocol = async () => {
    setSavingSetting('waitingRoom');
    try {
      await toggleWaitingRoom(!waitingRoomEnabled);
    } catch {
      // GameContext surfaces any server rejection in the shared error banner.
    } finally {
      setSavingSetting('');
    }
  };

  const decideApplicant = async (applicantId, decision) => {
    setApplicantAction(applicantId);
    try {
      if (decision === 'admit') await admitApplicant(applicantId);
      else await rejectApplicant(applicantId);
    } catch {
      // GameContext surfaces any server rejection in the shared error banner.
    } finally {
      setApplicantAction('');
    }
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-5 px-4 pb-14 sm:px-7 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.8fr)] lg:gap-6 lg:px-10">
      <section className="panel-grid min-h-[430px] rounded-lg border border-white/[0.085] bg-panel/80 p-5 sm:p-7">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-signal/75">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" /> QUARTERS / CREW MANIFEST
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-wide text-slate-100 sm:text-3xl">Crew assembly</h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">Bring your crew aboard. There may be something else already on the station.</p>
          </div>
          <div className="flex items-center gap-2 rounded border border-white/[0.08] bg-black/20 px-3 py-2 font-mono text-[10px] text-slate-400">
            <Users size={13} className="text-signal/80" />
            <span className="text-slate-100">{players.length}</span> / {maxPlayers} CREW
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between border-b border-white/[0.07] pb-2 font-mono text-[9px] uppercase tracking-[0.17em] text-slate-600">
          <span>IDENTIFIED PERSONNEL</span><span>LINK STATUS</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {players.map((player, index) => (
            <div key={player.id} className="flex min-w-0 items-center gap-3 rounded border border-white/[0.065] bg-black/20 px-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-white/[0.08] bg-white/[0.025] font-mono text-[10px] text-slate-400">{String(index + 1).padStart(2, '0')}</span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-200">
                  <span className="truncate">{player.name}</span>
                  {player.id === gameState.myPlayerId && <span className="shrink-0 text-[9px] text-slate-500">(You)</span>}
                </div>
                <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-600">
                  {player.isHost ? <><Shield size={10} className="text-amber-200/70" /> HOST</> : 'CREW'}
                </div>
              </div>
              <span className={`shrink-0 rounded border px-1.5 py-1 font-mono text-[8px] uppercase tracking-[0.07em] ${player.isDisconnected ? 'border-amber-200/20 bg-amber-200/[0.045] text-amber-100/75' : 'border-signal/15 bg-signal/[0.035] text-signal/70'}`}>
                {player.isDisconnected ? 'RELINKING' : 'ONLINE'}
              </span>
              {isHost && player.id !== gameState.myPlayerId && !player.isDisconnected && (
                <>
                  <TransferHostButton player={player} compact />
                  <KickPlayerButton player={player} />
                </>
              )}
            </div>
          ))}
          {players.length < maxPlayers && (
            <div className="flex min-h-[68px] items-center justify-center gap-2 rounded border border-dashed border-white/[0.07] font-mono text-[9px] uppercase tracking-[0.14em] text-slate-700 sm:col-span-2 xl:col-span-1">
              <Radio size={13} /> AWAITING CREW
            </div>
          )}
        </div>
        <p className="mt-5 font-mono text-[9px] leading-relaxed tracking-[0.08em] text-slate-600">A MINIMUM OF {minPlayers} CONNECTED PERSONNEL IS REQUIRED TO INITIATE THE RELAY.</p>
      </section>

      <aside className="flex flex-col gap-4">
        <section className="rounded-lg border border-white/[0.085] bg-panel/80 p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <Settings2 size={15} className="text-signal/80" />
            <h2 className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-300">{isHost ? 'Host controls' : 'Outpost protocols'}</h2>
          </div>
          {isHost ? (
            <div className="space-y-3">
              {PROTOCOLS.map(({ key, label, options }) => (
                <label key={key} className="block">
                  <span className="mb-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.11em] text-slate-500">
                    {label}{savingSetting === key && <LoaderCircle size={11} className="animate-spin text-signal/70" />}
                  </span>
                  <select
                    value={gameState.settings?.[key] || options[Math.min(1, options.length - 1)]}
                    onChange={(event) => saveSetting(key, event.target.value)}
                    disabled={Boolean(savingSetting) || starting}
                    className="h-10 w-full rounded border border-white/[0.09] bg-[#080b10] px-3 font-mono text-xs text-slate-200 outline-none transition focus:border-signal/35 focus:ring-1 focus:ring-signal/10 disabled:opacity-60"
                  >
                    {options.map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
                  </select>
                </label>
              ))}
              <div className="border-t border-white/[0.06] pt-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-slate-300">Airlock Security</div>
                    <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.06em] text-slate-600">Waiting room // host approval required</p>
                  </div>
                  <button type="button" role="switch" aria-checked={waitingRoomEnabled} aria-label="Airlock Security waiting room" onClick={setAirlockProtocol} disabled={Boolean(savingSetting) || starting} className={`relative h-7 w-12 shrink-0 rounded-full border transition disabled:cursor-wait disabled:opacity-60 ${waitingRoomEnabled ? 'border-cyan-100/30 bg-cyan-100/15' : 'border-white/10 bg-white/[0.035]'}`}>
                    <span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full transition-all ${waitingRoomEnabled ? 'left-[25px] bg-cyan-100 shadow-[0_0_12px_rgba(165,243,252,0.3)]' : 'left-[3px] bg-slate-500'}`} />
                  </button>
                </div>
                <div className={`mt-2 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.09em] ${waitingRoomEnabled ? 'text-cyan-100/70' : 'text-slate-600'}`}><ShieldCheck size={10} />{waitingRoomEnabled ? 'Clearance required for new arrivals' : 'Open entry // valid room code grants access'}</div>
              </div>
              <p className="pt-1 font-mono text-[8px] leading-relaxed tracking-[0.08em] text-slate-600">PROTOCOL CHANGES SYNC TO THE CREW AND APPLY BEFORE LAUNCH.</p>
            </div>
          ) : (
            <>
              <ReadonlySetting label="Day discussion" value={gameState.settings?.dayDurationSeconds || 90} />
              <ReadonlySetting label="Night cycle" value={gameState.settings?.nightDurationSeconds || 20} />
              <ReadonlySetting label="Tribunal" value={gameState.settings?.votingDurationSeconds || 30} />
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.055] py-3 last:border-0 last:pb-0"><span className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">Airlock Security</span><span className={`font-mono text-[9px] uppercase tracking-[0.1em] ${waitingRoomEnabled ? 'text-cyan-100/75' : 'text-slate-400'}`}>{waitingRoomEnabled ? 'Waiting room' : 'Open entry'}</span></div>
              <div className="mt-4 flex items-center gap-2 border-t border-white/[0.055] pt-3 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-600"><Shield size={11} className="text-amber-200/60" /> COMMAND CONFIGURED</div>
            </>
          )}
        </section>

        {isHost && pendingApplicants.length > 0 && (
          <section className="rounded-lg border border-cyan-100/20 bg-[radial-gradient(ellipse_at_10%_0%,rgba(34,211,238,0.065),transparent_60%),#0a1016] p-5 sm:p-6" aria-labelledby="clearance-requests-title">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="mb-1 flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.15em] text-cyan-100/65"><DoorOpen size={12} /> Pending clearance</div>
                <h2 id="clearance-requests-title" className="font-display text-lg text-slate-100">Clearance requests</h2>
              </div>
              <span className="flex h-7 min-w-7 items-center justify-center rounded border border-cyan-100/15 bg-cyan-100/[0.04] px-2 font-mono text-[9px] text-cyan-100/80">{pendingApplicants.length}</span>
            </div>
            <div className="space-y-2">
              {pendingApplicants.map((applicant) => (
                <div key={applicant.id} className="rounded border border-white/[0.07] bg-black/20 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2 text-sm text-slate-200"><Users size={13} className="shrink-0 text-cyan-100/65" /><span className="truncate">{applicant.name}</span></div>
                    <span className="shrink-0 font-mono text-[7px] uppercase tracking-[0.06em] text-slate-600">{new Date(applicant.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => decideApplicant(applicant.id, 'admit')} disabled={Boolean(applicantAction)} className="flex h-9 items-center justify-center gap-1.5 rounded border border-signal/20 bg-signal/[0.045] font-mono text-[8px] font-semibold uppercase tracking-[0.1em] text-signal/80 transition hover:bg-signal/[0.09] disabled:cursor-wait disabled:opacity-45"><UserRoundCheck size={12} /> Admit</button>
                    <button type="button" onClick={() => decideApplicant(applicant.id, 'deny')} disabled={Boolean(applicantAction)} className="flex h-9 items-center justify-center gap-1.5 rounded border border-rose-200/15 bg-rose-200/[0.025] font-mono text-[8px] font-semibold uppercase tracking-[0.1em] text-rose-100/70 transition hover:bg-rose-200/[0.07] disabled:cursor-wait disabled:opacity-45"><UserRoundX size={12} /> Deny</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-lg border border-signal/15 bg-signal/[0.025] p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-signal/75">
            <Cpu size={13} /> INVITATION FREQUENCY
          </div>
          <p className="text-sm text-slate-400">Transmit this access code to your crew.</p>
          <button onClick={copyCode} className="mt-4 flex w-full items-center justify-between rounded border border-signal/20 bg-black/25 px-4 py-3 transition hover:border-signal/40 hover:bg-signal/[0.04]">
            <span className="font-mono text-xl font-semibold tracking-[0.28em] text-slate-100">{gameState.roomId}</span>
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-signal/80">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'COPIED' : 'COPY CODE'}</span>
          </button>
        </section>

        {isHost ? (
          <div>
            <button
              onClick={begin}
              disabled={shortfall > 0 || starting || Boolean(savingSetting)}
              title={shortfall > 0 ? `Need ${shortfall} more connected player${shortfall === 1 ? '' : 's'} to launch.` : 'Launch the mission.'}
              className="group flex min-h-[54px] w-full items-center justify-between rounded border border-signal/30 bg-signal px-4 font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-void shadow-signal transition hover:bg-[#c8ff91] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.06] disabled:text-slate-600 disabled:shadow-none"
            >
              <span>{starting ? 'INITIALIZING RELAY...' : 'Launch mission'}</span><ArrowUpRight size={17} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
            {shortfall > 0 && <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.09em] text-amber-100/65">Awaiting {shortfall} more connected crew</p>}
          </div>
        ) : (
          <div className="flex min-h-[54px] items-center justify-center gap-2 rounded border border-white/[0.07] bg-white/[0.025] px-4 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
            <Radio size={13} className="text-signal/65" /> Awaiting command authorization
          </div>
        )}
      </aside>
    </div>
  );
}

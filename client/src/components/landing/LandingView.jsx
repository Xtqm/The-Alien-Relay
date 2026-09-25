import { useState } from 'react';
import { ArrowRight, Fingerprint, LoaderCircle, Radio, ScanLine, ShieldCheck, Signal } from 'lucide-react';
import { useGame } from '../../hooks/useGame.js';

export default function LandingView({ connectionStatus }) {
  const { createRoom, joinRoom } = useGame();
  const [mode, setMode] = useState('create');
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const connected = connectionStatus === 'connected';

  const submit = async (event) => {
    event.preventDefault();
    if (!connected || submitting) return;
    setSubmitting(true);
    try {
      if (mode === 'create') await createRoom(playerName);
      else await joinRoom(roomId, playerName);
    } catch {
      // GameContext publishes the server's error message to the shared banner.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto grid min-h-[calc(100vh-78px)] max-w-7xl items-center gap-12 px-4 pb-16 pt-12 sm:px-7 md:grid-cols-[1.12fr_0.88fr] md:gap-10 lg:px-10">
      <section className="relative">
        <div className="mb-7 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-signal/75">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-35" /><span className="relative inline-flex h-2 w-2 rounded-full bg-signal" /></span>
          DEEP SPACE RESEARCH // LINK ESTABLISHED
        </div>
        <h1 className="max-w-2xl font-display text-[clamp(3rem,9vw,6.7rem)] font-medium uppercase leading-[0.87] tracking-[-0.055em] text-slate-100">
          Something<br /><span className="text-signal">came back</span><br />with us.
        </h1>
        <p className="mt-7 max-w-md text-sm leading-7 text-slate-400 sm:text-base">
          Europa Relay Station 09 is isolated. One of the crew has changed. Keep the habitat alive long enough to find out who.
        </p>
        <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3 border-t border-white/[0.075] pt-5 font-mono text-[9px] uppercase tracking-[0.13em] text-slate-600">
          <span className="flex items-center gap-2"><ShieldCheck size={13} className="text-signal/70" /> 5–12 CREW</span>
          <span className="flex items-center gap-2"><Fingerprint size={13} className="text-signal/70" /> TRUST NO ONE</span>
          <span className="flex items-center gap-2"><Signal size={13} className="text-signal/70" /> PERSISTENT LINK</span>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-[440px]">
        <div className="absolute -inset-4 rounded-xl border border-signal/[0.06]" />
        <div className="relative overflow-hidden rounded-lg border border-white/[0.1] bg-[#0b1017]/95 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-white/[0.075] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <ScanLine size={15} className="text-signal/80" />
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-300">Access terminal</span>
            </div>
            <span className={`flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] ${connected ? 'text-signal/70' : 'text-amber-200/70'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-signal' : 'animate-pulse bg-amber-200'}`} />
              {connected ? 'ONLINE' : connectionStatus === 'reconnecting' ? 'RELINKING' : 'CONNECTING'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 border-b border-white/[0.075] p-2">
            <button onClick={() => setMode('create')} className={`flex items-center justify-center gap-2 rounded py-3 font-mono text-[9px] uppercase tracking-[0.13em] transition ${mode === 'create' ? 'bg-signal/[0.08] text-signal' : 'text-slate-600 hover:text-slate-300'}`}>
              <Radio size={13} /> New outpost
            </button>
            <button onClick={() => setMode('join')} className={`flex items-center justify-center gap-2 rounded py-3 font-mono text-[9px] uppercase tracking-[0.13em] transition ${mode === 'join' ? 'bg-signal/[0.08] text-signal' : 'text-slate-600 hover:text-slate-300'}`}>
              <ArrowRight size={13} /> Join crew
            </button>
          </div>

          <form onSubmit={submit} className="p-5 sm:p-6">
            <div className="mb-5">
              <label htmlFor="crew-name" className="mb-2 block font-mono text-[9px] uppercase tracking-[0.15em] text-slate-500">Crew identification</label>
              <input id="crew-name" value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={16} autoComplete="nickname" required placeholder="ENTER CALLSIGN" className="h-12 w-full rounded border border-white/[0.09] bg-black/25 px-3.5 font-mono text-xs tracking-[0.09em] text-slate-100 outline-none transition placeholder:text-slate-700 focus:border-signal/40 focus:ring-1 focus:ring-signal/15" />
            </div>
            {mode === 'join' && (
              <div className="mb-5">
                <label htmlFor="room-code" className="mb-2 block font-mono text-[9px] uppercase tracking-[0.15em] text-slate-500">Four-character room code</label>
                <input id="room-code" value={roomId} onChange={(event) => setRoomId(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))} required minLength={4} maxLength={4} autoCapitalize="characters" autoComplete="off" placeholder="AB09" className="h-12 w-full rounded border border-white/[0.09] bg-black/25 px-3.5 font-mono text-base tracking-[0.24em] text-slate-100 outline-none transition placeholder:text-slate-700 focus:border-signal/40 focus:ring-1 focus:ring-signal/15" />
              </div>
            )}
            <button type="submit" disabled={!connected || submitting || !playerName.trim() || (mode === 'join' && roomId.length !== 4)} className="group flex h-12 w-full items-center justify-between rounded border border-signal/30 bg-signal px-4 font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-void shadow-signal transition hover:bg-[#c8ff91] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.055] disabled:text-slate-600 disabled:shadow-none">
              <span>{submitting ? 'ESTABLISHING UPLINK' : mode === 'create' ? 'Establish new outpost' : 'Enter the outpost'}</span>
              {submitting ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />}
            </button>
            <p className="mt-4 text-center font-mono text-[8px] leading-relaxed tracking-[0.08em] text-slate-700">YOUR CONNECTION IS ENCRYPTED // SESSION RESUMES AUTOMATICALLY</p>
          </form>
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 font-mono text-[8px] uppercase tracking-[0.14em] text-slate-700"><span className="h-px w-7 bg-white/[0.08]" /> EUROPA RESEARCH DIVISION <span className="h-px w-7 bg-white/[0.08]" /></div>
      </section>
    </div>
  );
}

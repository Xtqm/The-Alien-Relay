import { useState } from 'react';
import { UserX } from 'lucide-react';
import { useGame } from '../../hooks/useGame.js';

export default function KickPlayerButton({ player, showLabel = false, className = '' }) {
  const { kickPlayer } = useGame();
  const [kicking, setKicking] = useState(false);

  const dismiss = async () => {
    if (kicking || !window.confirm(`Dismiss ${player.name} from the outpost?`)) return;
    setKicking(true);
    try {
      await kickPlayer(player.id);
    } catch {
      // GameContext surfaces server rejections in the shared alert banner.
    } finally {
      setKicking(false);
    }
  };

  return (
    <button
      type="button"
      onClick={dismiss}
      disabled={kicking}
      aria-label={`Kick ${player.name}`}
      title={`Kick ${player.name}`}
      className={`inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded border border-rose-200/15 bg-rose-200/[0.025] px-2 font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-rose-100/65 transition hover:border-rose-200/30 hover:bg-rose-200/[0.08] hover:text-rose-100 disabled:cursor-wait disabled:opacity-50 ${className}`}
    >
      <UserX size={12} />
      {showLabel && <span>{kicking ? 'Removing' : 'Kick'}</span>}
    </button>
  );
}

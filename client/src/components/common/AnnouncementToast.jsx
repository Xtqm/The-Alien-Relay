import { useState } from 'react';
import { AlertTriangle, Radio, X } from 'lucide-react';

export default function AnnouncementToast({ announcements }) {
  const [dismissed, setDismissed] = useState(() => new Set());
  const visible = announcements.slice(-3).filter((announcement) => !dismissed.has(announcement.id));
  if (!visible.length) return null;

  return (
    <div aria-live="polite" aria-relevant="additions" className="fixed right-4 top-20 z-50 flex w-[min(23rem,calc(100vw-2rem))] flex-col gap-2 sm:right-7">
      {visible.map((announcement) => {
        const alert = announcement.type === 'alert';
        const Icon = alert ? AlertTriangle : Radio;
        return (
          <div key={announcement.id} className={`animate-[toast-in_220ms_ease-out] rounded border bg-[#0b1017]/95 p-3.5 shadow-xl backdrop-blur ${alert ? 'border-amber-300/25' : 'border-signal/20'}`}>
            <div className="flex items-start gap-2.5">
              <Icon size={15} className={alert ? 'mt-0.5 shrink-0 text-amber-200' : 'mt-0.5 shrink-0 text-signal'} />
              <p className="flex-1 text-xs leading-relaxed text-slate-200">{announcement.text}</p>
              <button
                type="button"
                onClick={() => setDismissed((current) => new Set([...current, announcement.id]))}
                aria-label="Dismiss announcement"
                className="mt-0.5 shrink-0 text-slate-600 transition hover:text-slate-300"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useEffect, useRef } from 'react';

export function useWakeLock(isActive = true) {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!isActive || typeof navigator === 'undefined' || !navigator.wakeLock) return undefined;

    let disposed = false;
    let requestPending = false;
    let activeLock = null;

    const requestWakeLock = async () => {
      if (disposed || document.visibilityState !== 'visible' || requestPending || (activeLock && !activeLock.released)) return;
      requestPending = true;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (disposed || document.visibilityState !== 'visible') {
          await lock.release().catch(() => {});
          return;
        }

        activeLock = lock;
        wakeLockRef.current = lock;
        lock.addEventListener('release', () => {
          if (wakeLockRef.current === lock) wakeLockRef.current = null;
          if (activeLock === lock) activeLock = null;
        }, { once: true });
      } catch {
        // Wake Lock can be unavailable due to browser support or device policy.
      } finally {
        requestPending = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    requestWakeLock();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      const lock = activeLock || wakeLockRef.current;
      activeLock = null;
      wakeLockRef.current = null;
      if (lock && !lock.released) lock.release().catch(() => {});
    };
  }, [isActive]);
}

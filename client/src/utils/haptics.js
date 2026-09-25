export function triggerHaptic(pattern = [50]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;

  try {
    return navigator.vibrate(pattern);
  } catch {
    // Haptics are unavailable or disabled in this browser.
    return false;
  }
}

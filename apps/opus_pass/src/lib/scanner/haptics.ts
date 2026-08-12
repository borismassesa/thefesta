/**
 * The web's answer to expo-haptics: navigator.vibrate on phones that support
 * it (most Android; iOS Safari ignores it), a no-op everywhere else.
 *
 * Same intent as the mobile app: attendants work in the dark, often not
 * looking at the screen between guests, so every scan outcome lands in their
 * hand, not just on the glass.
 */
export function vibrateForResult(status: 'success' | 'duplicate' | 'invalid' | 'error'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    if (status === 'success') navigator.vibrate(80)
    else if (status === 'duplicate') navigator.vibrate([50, 40, 50])
    else navigator.vibrate([90, 50, 90])
  } catch {
    // Vibration is best-effort chrome — never let it break a scan.
  }
}

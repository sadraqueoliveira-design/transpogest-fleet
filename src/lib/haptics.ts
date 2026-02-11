/**
 * Haptic feedback utility for mobile PWA.
 * Uses navigator.vibrate API (Android only; iOS ignores).
 */
export function hapticSuccess() {
  navigator.vibrate?.([10, 30, 10]);
}

export function hapticError() {
  navigator.vibrate?.([50, 50, 50]);
}

export function hapticTap() {
  navigator.vibrate?.(8);
}

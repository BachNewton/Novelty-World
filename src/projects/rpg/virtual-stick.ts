/**
 * Floating-origin virtual analog stick — pure helpers.
 * The component converts the stick deflection into synthetic WASD codes so
 * facing, walk/idle state, and the animation clock behave exactly as keyboard.
 */

/** Stick deflection inside this fraction of the radius reads as centered. */
export const STICK_DEADZONE = 0.2;
/** Stick travel radius in CSS px. */
export const STICK_RADIUS_PX = 56;
/** Knob radius in CSS px. */
export const STICK_KNOB_PX = 22;
/**
 * Minimum absolute unit-component to engage an axis. Low enough that a
 * diagonal engages both axes, high enough that a cardinal push engages one.
 */
export const STICK_AXIS_THRESHOLD = 0.35;

export interface StickDeflection {
  /** Unit vector of the push; 0,0 when inside the deadzone. */
  nx: number;
  ny: number;
  /** Tilt magnitude, 0..1 (1 at or beyond the radius). */
  mag: number;
}

/** Raw stick offset (CSS px from the touch-down origin) to unit vector + magnitude. */
export function stickDeflection(dx: number, dy: number, radius: number): StickDeflection {
  const len = Math.hypot(dx, dy);
  if (!(len > 0) || len < STICK_DEADZONE * radius) return { nx: 0, ny: 0, mag: 0 };
  return { nx: dx / len, ny: dy / len, mag: Math.min(1, len / radius) };
}

/**
 * Unit deflection to synthetic key codes. Diagonals produce both keys with
 * the dominant axis last (most-recent), matching the pressed-stack facing rule.
 */
export function stickToKeys(defl: StickDeflection): string[] {
  const xKey =
    defl.nx > STICK_AXIS_THRESHOLD
      ? "KeyD"
      : defl.nx < -STICK_AXIS_THRESHOLD
        ? "KeyA"
        : null;
  const yKey =
    defl.ny > STICK_AXIS_THRESHOLD
      ? "KeyS"
      : defl.ny < -STICK_AXIS_THRESHOLD
        ? "KeyW"
        : null;
  if (xKey !== null && yKey !== null) {
    return Math.abs(defl.nx) >= Math.abs(defl.ny) ? [yKey, xKey] : [xKey, yKey];
  }
  if (xKey !== null) return [xKey];
  if (yKey !== null) return [yKey];
  return [];
}

/**
 * The player on foot: where they stand, which way they face, and their gait,
 * stepped from what the keys ask for. Pure: no renderer, no clock of its own.
 */

export type Gait = "idle" | "walk" | "sprint";

export interface Player {
  x: number;
  z: number;
  /** Which way they face, about the vertical, with 0 facing +z as the characters are made. */
  yaw: number;
  gait: Gait;
}

/** What the keys ask for: a direction on the ground (any length, zero to stand still), and whether to sprint. */
export interface Move {
  x: number;
  z: number;
  sprint: boolean;
}

/**
 * Ground speeds, in world units a second, that keep a planted foot still on the
 * ground: how fast the walk and sprint clips sweep a foot backward as it touches
 * down, measured from the clips' leg swing about the hip (0.176 above the ground).
 */
export const SPEED: Record<Exclude<Gait, "idle">, number> = { walk: 1.45, sprint: 2.3 };

/** How fast the player turns to face where they go, in radians a second. */
const TURN_RATE = 12;

export const STANDING: Player = { x: 0, z: 0, yaw: 0, gait: "idle" };

/** The player after `dt` seconds of `move`, kept within `reach` of the origin on each axis. */
export function stepPlayer(player: Player, move: Move, dt: number, reach: number): Player {
  const length = Math.hypot(move.x, move.z);
  if (length === 0) return { ...player, gait: "idle" };
  const gait = move.sprint ? "sprint" : "walk";
  const step = (SPEED[gait] * dt) / length;
  return {
    x: clamp(player.x + move.x * step, reach),
    z: clamp(player.z + move.z * step, reach),
    yaw: turnToward(player.yaw, Math.atan2(move.x, move.z), TURN_RATE * dt),
    gait,
  };
}

function clamp(value: number, reach: number): number {
  return Math.min(reach, Math.max(-reach, value));
}

/** Turn from `from` toward `to` the short way round, by at most `most`. */
export function turnToward(from: number, to: number, most: number): number {
  const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return Math.abs(turn) <= most ? to : from + Math.sign(turn) * most;
}

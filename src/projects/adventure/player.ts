/**
 * The player on foot: where they stand, which way they face, and their gait,
 * stepped from what the controls ask for. Pure: no renderer, no clock of its own.
 */

/** What the player is doing, named for the clip that shows it. */
export type Gait = "idle" | "walk" | "sprint" | "jump" | "fall";

export interface Player {
  x: number;
  z: number;
  /** Height above the ground, while in the air. */
  y: number;
  /** Speed upward, while in the air. */
  rise: number;
  /** Which way they face, about the vertical, with 0 facing +z as the characters are made. */
  yaw: number;
  gait: Gait;
}

/** What the controls ask for: a direction on the ground (any length, zero to stand still), whether to sprint, and whether jump was pressed. */
export interface Move {
  x: number;
  z: number;
  sprint: boolean;
  jump: boolean;
}

/**
 * Ground speeds, in world units a second, that keep a planted foot still on the
 * ground: how fast the walk and sprint clips sweep a foot backward as it touches
 * down, measured from the clips' leg swing about the hip (0.176 above the ground).
 * In the air the player keeps going at the speed their keys ask for.
 */
export const SPEED = { walk: 1.45, sprint: 2.3 } as const;

/** How high a jump goes, in world units (a character stands about 0.75), and how long it takes to get there, in seconds. */
export const JUMP_HEIGHT = 0.5;
const JUMP_RISE_TIME = 0.3;
/** The pull down, and the speed a jump leaves the ground at, that make a jump that high and that long. */
const GRAVITY = (2 * JUMP_HEIGHT) / JUMP_RISE_TIME ** 2;
const JUMP_SPEED = GRAVITY * JUMP_RISE_TIME;

/** How fast the player turns to face where they go, in radians a second. */
const TURN_RATE = 12;

export const STANDING: Player = { x: 0, z: 0, y: 0, rise: 0, yaw: 0, gait: "idle" };

/** The player after `dt` seconds of `move`, kept within `reach` of the origin on each axis. */
export function stepPlayer(player: Player, move: Move, dt: number, reach: number): Player {
  const onGround = player.y === 0 && player.rise === 0;
  let { y, rise } = player;
  if (onGround && move.jump) rise = JUMP_SPEED;
  if (y > 0 || rise > 0) {
    y = Math.max(0, y + rise * dt - (GRAVITY * dt * dt) / 2);
    rise = y === 0 ? 0 : rise - GRAVITY * dt;
  }
  const inAir = y > 0;

  const length = Math.hypot(move.x, move.z);
  const pace = move.sprint ? "sprint" : "walk";
  const gait: Gait = inAir ? (rise > 0 ? "jump" : "fall") : length === 0 ? "idle" : pace;
  if (length === 0) return { ...player, y, rise, gait };
  const step = (SPEED[pace] * dt) / length;
  return {
    x: clamp(player.x + move.x * step, reach),
    z: clamp(player.z + move.z * step, reach),
    y,
    rise,
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

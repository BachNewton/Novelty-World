/**
 * The player on foot: where they stand, which way they face, and their gait,
 * stepped from what the controls ask for. Pure: no renderer, no clock of its own.
 */

/** What the player is doing, named for the clip that shows it. */
export type Gait = "idle" | "walk" | "sprint" | "jump" | "fall";

export interface Player {
  x: number;
  z: number;
  /** The height of their feet. */
  y: number;
  /** Whether they are in the air, jumping or falling, rather than standing on the ground. */
  airborne: boolean;
  /** Speed upward, while in the air. */
  rise: number;
  /** Which way they face, about the vertical, with 0 facing +z as the characters are made. */
  yaw: number;
  gait: Gait;
  /**
   * How fast the gait's clip plays, as a share of how it is made: a walk at
   * half its ground speed plays its clip at half speed, so a planted foot
   * stays still. 1 for every gait but a walk or a sprint.
   */
  stride: number;
}

/**
 * What the controls ask for: a direction on the ground (zero to stand still,
 * shorter than 1 for a stick pushed part way), whether to sprint, and whether
 * jump was pressed.
 */
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
 * In the air the player keeps going at the speed their controls ask for.
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

export const STANDING: Player = { x: 0, z: 0, y: 0, airborne: false, rise: 0, yaw: 0, gait: "idle", stride: 1 };

/**
 * The slowest a walk goes, as a share of its full ground speed: a stick pushed
 * only just past its deadzone walks this fast, its clip slowed to match. Any
 * slower and the clip's slow swing stops reading as a walk.
 */
export const SLOWEST_WALK = 0.35;

/**
 * How much of its gait's full ground speed a move goes at: a walk as far as the
 * stick is pushed, never slower than the slowest walk, and never faster than a
 * full push (two keys at once go no faster than one); a sprint always at full
 * speed, since running is asked for by its own button; 0 standing still.
 */
export function pushOf(move: Move): number {
  const length = Math.hypot(move.x, move.z);
  if (length === 0) return 0;
  if (move.sprint) return 1;
  return Math.min(1, Math.max(SLOWEST_WALK, length));
}

/** A place: where a player's feet are, or how far they move. */
export interface Point {
  x: number;
  y: number;
  z: number;
}

/**
 * Where a player's feet end up, moving from `from` by `by` past whatever the
 * world puts in the way, and whether they are standing on something there.
 */
export type Mover = (from: Point, by: Point) => Point & { grounded: boolean };

/**
 * The player after `dt` seconds of `move`, as far as `mover` lets them go:
 * the move asked for is theirs (how fast, which way, a jump's rise and fall),
 * where it ends is the world's.
 */
export function stepPlayer(player: Player, move: Move, dt: number, mover: Mover): Player {
  const length = Math.hypot(move.x, move.z);
  const pace = move.sprint ? "sprint" : "walk";
  const push = pushOf(move);
  const step = length === 0 ? 0 : (SPEED[pace] * push * dt) / length;

  let { rise, airborne } = player;
  if (!airborne && move.jump) {
    airborne = true;
    rise = JUMP_SPEED;
  }
  // On the ground a step asks to go only across: the world keeps them on the ground, up and down its slopes, and says when it is gone.
  const up = airborne ? rise * dt - (GRAVITY * dt * dt) / 2 : 0;
  if (airborne) rise -= GRAVITY * dt;
  const to = mover(player, { x: move.x * step, y: up, z: move.z * step });
  if (airborne && rise > 0 && to.y - player.y < up - 1e-4) {
    // Their head met something: the jump stops rising.
    rise = 0;
  }
  if (airborne && rise <= 0 && to.grounded) {
    airborne = false;
    rise = 0;
  } else if (!airborne && !to.grounded) {
    // Off an edge: they fall from where they stood.
    airborne = true;
    rise = 0;
  }

  const gait: Gait = airborne ? (rise > 0 ? "jump" : "fall") : length === 0 ? "idle" : pace;
  const yaw = length === 0 ? player.yaw : turnToward(player.yaw, Math.atan2(move.x, move.z), TURN_RATE * dt);
  const stride = gait === "walk" || gait === "sprint" ? push : 1;
  return { x: to.x, y: to.y, z: to.z, airborne, rise, yaw, gait, stride };
}

/** Turn from `from` toward `to` the short way round, by at most `most`. */
export function turnToward(from: number, to: number, most: number): number {
  const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return Math.abs(turn) <= most ? to : from + Math.sign(turn) * most;
}

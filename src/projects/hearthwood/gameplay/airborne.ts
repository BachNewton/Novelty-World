import { canStand, walk, type WalkGround } from "./walking";

/*
 * Jumping and the broom: how the walker moves on the ground, in the air and
 * gliding, as one pure step that comes out the same at any frame rate.
 *
 * On the ground they walk (see walking). Jump is a small hop under real
 * gravity, keeping the way they were going and steerable a little in the
 * air. Jumping again in the air takes out the broom: a slow descent forward
 * at a steady speed, turning towards where the player steers, that never
 * climbs. Jumping on the broom puts it away and they fall again; falling
 * never hurts. Any touch of ground they can stand on lands them, softly.
 *
 * Deep water and ground too steep to stand on can't be landed on, so the
 * broom never lets them reach it: touching it brings the broom out (if it
 * wasn't already) and they skim along its surface, still steered, sliding
 * down a slope too steep to hold them, until there is ground to land on.
 */

export type AirMode = "ground" | "air" | "broom";

export interface Mover {
  mode: AirMode;
  x: number;
  /** The walker's feet. */
  y: number;
  z: number;
  /** Metres per second. */
  vx: number;
  vy: number;
  vz: number;
  /** The way the broom flies, in radians from +z towards +x. */
  heading: number;
}

export interface Intent {
  /** Jump was pressed since the last step. */
  jump: boolean;
  /** How the player asks to go along the ground, in metres per second in the world. */
  velocity: { x: number; z: number };
  /** The way the walker faces, which a broom taken out from a standstill flies. */
  facing: number;
  /** Where the player steers the broom, or null to fly straight on. */
  steer: number | null;
}

export interface StepResult {
  /** How far the walker went along the ground or through the air, in metres. */
  moved: number;
  /** How fast they came down, in metres per second, on the step they landed; null otherwise. */
  landed: number | null;
}

/** A hop: about 0.6 m high and 0.63 s long, in a gravity a little stronger than the earth's, for a soft, quick arc. */
export const JUMP = {
  speed: 3.8,
  gravity: 12,
  /** The fastest a fall gets, in metres per second. */
  terminal: 22,
  /** How quickly the way through the air follows the player's steering, per second. */
  airControl: 3,
} as const;

/**
 * The broom: a glide ratio of about 4.5, so a ridge 200 m above a valley
 * sails about 900 m out into it, in a minute and a half. Putting it away
 * and taking it out again is the way down faster: a fall, caught.
 */
export const GLIDE = {
  /** Its steady speed forward, in metres per second: brisker than a run. */
  speed: 10,
  /** How fast it sinks, in metres per second. */
  sink: 2.2,
  /** How quickly its speed and its sink settle to theirs, per second. */
  settle: 1.4,
  /** How quickly it turns towards where it is steered, per second. */
  turn: 2.2,
  /** How fast it slides down ground too steep to stand on while skimming it, in metres per second. */
  slide: 4,
} as const;

/** The longest step the motion is worked out in, in seconds: fine enough that nothing passes through the land. */
const STEP = 1 / 120;
/** How far a step through the air may rise onto ground that can be stood on, in metres: a hop up a slope lands on it rather than stopping against it. */
const STEP_UP = 0.6;

function catchUp(rate: number, seconds: number): number {
  return 1 - Math.exp(-rate * seconds);
}

function turnBetween(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function surfaceAt(ground: WalkGround, x: number, z: number): number {
  return Math.max(ground.heightAt(x, z), ground.waterAt(x, z));
}

export function standingMover(ground: WalkGround, x: number, z: number, heading: number): Mover {
  return { mode: "ground", x, y: ground.heightAt(x, z), z, vx: 0, vy: 0, vz: 0, heading };
}

/** A mover on the broom at a height above the land, flying along a heading at the broom's speed: where a screenshot starts a glide. */
export function glidingMover(ground: WalkGround, x: number, z: number, above: number, heading: number): Mover {
  return {
    mode: "broom",
    x,
    y: surfaceAt(ground, x, z) + above,
    z,
    vx: Math.sin(heading) * GLIDE.speed,
    vy: -GLIDE.sink,
    vz: Math.cos(heading) * GLIDE.speed,
    heading,
  };
}

/** Jump pressed: a hop from the ground, the broom out in the air, put away on the broom. */
function jump(mover: Mover, intent: Intent): void {
  switch (mover.mode) {
    case "ground":
      mover.mode = "air";
      mover.vy = JUMP.speed;
      mover.vx = intent.velocity.x;
      mover.vz = intent.velocity.z;
      return;
    case "air": {
      mover.mode = "broom";
      mover.vy = Math.min(mover.vy, 0);
      const speed = Math.hypot(mover.vx, mover.vz);
      mover.heading = speed > 0.5 ? Math.atan2(mover.vx, mover.vz) : intent.facing;
      return;
    }
    case "broom":
      mover.mode = "air";
  }
}

/** The way down a slope, as a unit vector, or none on level ground. */
function downhill(ground: WalkGround, x: number, z: number): { x: number; z: number } {
  const e = 0.6;
  const dx = ground.heightAt(x + e, z) - ground.heightAt(x - e, z);
  const dz = ground.heightAt(x, z + e) - ground.heightAt(x, z - e);
  const length = Math.hypot(dx, dz);
  return length < 1e-6 ? { x: 0, z: 0 } : { x: -dx / length, z: -dz / length };
}

/** One short step through the air or on the broom. */
function fly(mover: Mover, intent: Intent, ground: WalkGround, dt: number): StepResult {
  if (mover.mode === "air") {
    const k = catchUp(JUMP.airControl, dt);
    mover.vx += (intent.velocity.x - mover.vx) * k;
    mover.vz += (intent.velocity.z - mover.vz) * k;
    mover.y += mover.vy * dt - (JUMP.gravity * dt * dt) / 2;
    mover.vy = Math.max(mover.vy - JUMP.gravity * dt, -JUMP.terminal);
  } else {
    if (intent.steer !== null) mover.heading += turnBetween(mover.heading, intent.steer) * catchUp(GLIDE.turn, dt);
    const k = catchUp(GLIDE.settle, dt);
    const speed = Math.hypot(mover.vx, mover.vz);
    const settled = speed + (GLIDE.speed - speed) * k;
    mover.vx = Math.sin(mover.heading) * settled;
    mover.vz = Math.cos(mover.heading) * settled;
    mover.vy = Math.min(0, mover.vy + (-GLIDE.sink - mover.vy) * k);
    mover.y += mover.vy * dt;
  }

  // Skimming ground too steep to stand on, the broom goes no further up it and slides down it.
  const here = surfaceAt(ground, mover.x, mover.z);
  let wayX = mover.vx;
  let wayZ = mover.vz;
  if (mover.mode === "broom" && mover.y <= here + 1e-3 && ground.heightAt(mover.x, mover.z) > ground.waterAt(mover.x, mover.z)) {
    const down = downhill(ground, mover.x, mover.z);
    const up = Math.max(0, -(wayX * down.x + wayZ * down.z));
    wayX += down.x * (up + GLIDE.slide);
    wayZ += down.z * (up + GLIDE.slide);
  }

  const fromX = mover.x;
  const fromZ = mover.z;
  const sx = wayX * dt;
  const sz = wayZ * dt;
  const open = (x: number, z: number) => {
    const surface = surfaceAt(ground, x, z);
    // Never higher than where they are, or the ground they are on; or ground to stand on a little above it.
    return surface <= Math.max(mover.y, here) || (surface - mover.y <= STEP_UP && canStand(ground, x, z));
  };
  const tries = [
    { x: fromX + sx, z: fromZ + sz },
    { x: fromX + sx, z: fromZ },
    { x: fromX, z: fromZ + sz },
  ];
  const to = tries.find((t) => (t.x !== fromX || t.z !== fromZ) && open(t.x, t.z));
  if (to) {
    mover.x = to.x;
    mover.z = to.z;
  }
  const moved = Math.hypot(mover.x - fromX, mover.z - fromZ);

  const surface = surfaceAt(ground, mover.x, mover.z);
  if (mover.y > surface) return { moved, landed: null };
  if (canStand(ground, mover.x, mover.z)) {
    const landed = -mover.vy;
    mover.mode = "ground";
    mover.y = ground.heightAt(mover.x, mover.z);
    mover.vy = 0;
    return { moved, landed: Math.max(0, landed) };
  }
  // Nowhere to land: the broom catches them, and they skim on.
  if (mover.mode === "air") {
    mover.mode = "broom";
    const speed = Math.hypot(mover.vx, mover.vz);
    mover.heading = speed > 0.5 ? Math.atan2(mover.vx, mover.vz) : intent.facing;
  }
  mover.y = surface;
  mover.vy = 0;
  return { moved, landed: null };
}

/**
 * Where the walker is after `seconds` of the player's intent: walked along
 * the ground as far as the land allows, or carried through the air.
 */
export function stepMover(mover: Mover, intent: Intent, ground: WalkGround, seconds: number): StepResult {
  if (intent.jump) jump(mover, intent);
  if (mover.mode === "ground") {
    const from = { x: mover.x, z: mover.z };
    const to = walk(ground, from, intent.velocity.x * seconds, intent.velocity.z * seconds);
    mover.x = to.x;
    mover.z = to.z;
    mover.y = ground.heightAt(to.x, to.z);
    mover.vx = seconds > 0 ? (to.x - from.x) / seconds : 0;
    mover.vz = seconds > 0 ? (to.z - from.z) / seconds : 0;
    return { moved: Math.hypot(to.x - from.x, to.z - from.z), landed: null };
  }
  const steps = Math.max(1, Math.ceil(seconds / STEP));
  const dt = seconds / steps;
  let moved = 0;
  for (let i = 0; i < steps; i++) {
    const result = fly(mover, intent, ground, dt);
    moved += result.moved;
    if (result.landed !== null) {
      // The rest of the time is spent walking on from where they landed.
      const rest = seconds - dt * (i + 1);
      const walked = stepMover(mover, { ...intent, jump: false }, ground, rest);
      return { moved: moved + walked.moved, landed: result.landed };
    }
  }
  return { moved, landed: null };
}

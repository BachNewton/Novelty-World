/*
 * Whether the player could see a thing standing somewhere: in the camera's view,
 * within the reach its kind is drawn to, and not behind the ground, over a crest
 * or round a hill. Trees and buildings hide things too, but the ground is the
 * only cover known on the CPU, so a thing hidden only by them counts as seen:
 * the test errs towards seen, which only ever costs a place to spawn.
 */

/** The camera at a moment: where it is, and its view as planes whose normals point inwards, each (nx, ny, nz, d). */
export interface Eye {
  x: number;
  y: number;
  z: number;
  planes: readonly (readonly [number, number, number, number])[];
}

/** A thing as the eye judges it: where its foot stands, how far it reaches out from there and up, and how far off its kind is still drawn. */
export interface Sighted {
  x: number;
  y: number;
  z: number;
  radiusM: number;
  heightM: number;
  reachM: number;
}

/** The ground is sampled along a sight line at least this often, and at most this many times. */
const STEP_M = 6;
const MOST_STEPS = 200;
/** The ground must stand this far over the sight line to count as cover. */
const COVER_M = 0.3;
/** The ends of a sight line, at the eye and round the thing's own foot, aren't checked: the ground there is what they stand on. */
const CLEAR_ENDS_M = 3;

export function sees(eye: Eye, groundAt: (x: number, z: number) => number, thing: Sighted): boolean {
  const { x, y, z, radiusM, heightM, reachM } = thing;
  const middle = y + heightM / 2;
  const distance = Math.hypot(x - eye.x, middle - eye.y, z - eye.z);
  if (distance - radiusM > reachM) return false;
  for (const [nx, ny, nz, d] of eye.planes) if (nx * x + ny * middle + nz * z + d < -(radiusM + heightM / 2)) return false;
  // Over the top of it: if the ground hides that, it hides the rest.
  const top = y + heightM;
  const across = Math.hypot(x - eye.x, z - eye.z);
  if (across < 2 * CLEAR_ENDS_M) return true;
  const steps = Math.min(MOST_STEPS, Math.ceil(across / STEP_M));
  for (let step = 1; step < steps; step++) {
    const share = step / steps;
    const travelled = across * share;
    if (travelled < CLEAR_ENDS_M || across - travelled < CLEAR_ENDS_M + radiusM) continue;
    const sx = eye.x + (x - eye.x) * share;
    const sz = eye.z + (z - eye.z) * share;
    if (groundAt(sx, sz) > eye.y + (top - eye.y) * share + COVER_M) return false;
  }
  return true;
}

/** An eye's planes from a view-projection matrix (column-major, as three keeps it) for a reversed or ordinary depth: the four sides and the near plane. */
export function eyeOf(position: { x: number; y: number; z: number }, viewProjection: ArrayLike<number>): Eye {
  const m = viewProjection;
  const row = (r: number) => [m[r], m[r + 4], m[r + 8], m[r + 12]] as const;
  const [r0, r1, r3] = [row(0), row(1), row(3)];
  const plane = (sign: number, r: readonly number[]) => {
    const p = [r3[0] + sign * r[0], r3[1] + sign * r[1], r3[2] + sign * r[2], r3[3] + sign * r[3]];
    const length = Math.hypot(p[0], p[1], p[2]);
    return [p[0] / length, p[1] / length, p[2] / length, p[3] / length] as const;
  };
  // Behind the eye: the plane through it facing the way it looks, so the depth's convention doesn't matter.
  const ahead = plane(1, [0, 0, 0, 0]);
  return { x: position.x, y: position.y, z: position.z, planes: [plane(1, r0), plane(-1, r0), plane(1, r1), plane(-1, r1), ahead] };
}

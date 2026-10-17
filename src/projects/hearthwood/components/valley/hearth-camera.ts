/*
 * The camera at the hearth, as maths: while Elliott cooks it looks over
 * their shoulder at the fire and what is on it, from a little behind and
 * to the right of them and above, aimed a little in front of the flames so
 * the fire sits in the upper part of the view, above the cooking card. It
 * is worked out in the fire's frame (its middle on the ground, +z towards
 * Elliott), the same frame the cooking is drawn in.
 */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** How near to and far from the fire Elliott is taken to stand, for framing, in metres. */
const STANDS = { near: 1.7, far: 3.4 } as const;

/** The hearth's own field of view, in degrees: a little closer than walking's. */
export const HEARTH_FOV = 50;

/** A point in the fire's frame, in the world: `side` is the heading from the fire to Elliott. */
export function fromFire(fire: Point3, side: number, local: Point3): Point3 {
  const c = Math.cos(side);
  const s = Math.sin(side);
  return { x: fire.x + local.x * c + local.z * s, y: fire.y + local.y, z: fire.z - local.x * s + local.z * c };
}

/** The heading from the fire to where Elliott stands. */
export function sideOf(fire: Point3, at: { x: number; z: number }): number {
  return Math.atan2(at.x - fire.x, at.z - fire.z);
}

/** Where the camera sits and what it looks at while Elliott cooks, `distance` metres from the fire. */
export function hearthView(fire: Point3, side: number, distance: number): { eye: Point3; look: Point3 } {
  const d = Math.min(STANDS.far, Math.max(STANDS.near, distance));
  return {
    eye: fromFire(fire, side, { x: 0.85, y: 1.85, z: d + 1.0 }),
    look: fromFire(fire, side, { x: -0.05, y: 0.25, z: 0.55 }),
  };
}

/** The heading that faces the fire from where Elliott stands. */
export const towardFire = (side: number) => side + Math.PI;

/*
 * The camera in conversation, as maths: it frames the person Elliott talks
 * with, their face a little above the middle of the view so the storybook
 * panel along the bottom never covers it. Through Elliott's eyes it looks
 * at them from where Elliott stands; from behind, it is a view over
 * Elliott's right shoulder taking in both of them, the person nearer the
 * middle.
 */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** The conversation's fields of view, in degrees: a little closer than walking's. */
export const TALK_FOV = { first: 62, third: 50 } as const;

/** How far below the face the camera aims, in metres, so the face sits above the middle of the view. */
const BELOW_FACE = { first: 0.2, third: 0.12 } as const;

/** The heading Elliott faces the person from, as the walker's heading is (0 faces +z). */
export const headingTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);

/**
 * Where the camera sits and looks while Elliott talks: `elliott` and the
 * person's `face` in the world, `eyes` the height of Elliott's eyes above
 * their feet.
 */
export function talkView(pointOfView: "first" | "third", elliott: Point3, face: Point3, eyes: number): { eye: Point3; look: Point3 } {
  if (pointOfView === "first") {
    return { eye: { x: elliott.x, y: elliott.y + eyes, z: elliott.z }, look: { x: face.x, y: face.y - BELOW_FACE.first, z: face.z } };
  }
  const dx = elliott.x - face.x;
  const dz = elliott.z - face.z;
  const d = Math.hypot(dx, dz) || 1;
  const back = { x: dx / d, z: dz / d };
  // Elliott's right as they face the person.
  const right = { x: back.z, z: -back.x };
  return {
    eye: { x: elliott.x + back.x * 1.9 + right.x * 0.85, y: elliott.y + 1.75, z: elliott.z + back.z * 1.9 + right.z * 0.85 },
    look: { x: elliott.x + (face.x - elliott.x) * 0.7, y: face.y - BELOW_FACE.third, z: elliott.z + (face.z - elliott.z) * 0.7 },
  };
}

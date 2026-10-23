import * as THREE from "three";
import { ball, drum, ring, rod, sculpt, type Solid } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, itemModel, ON_ITS_SIDE, piece } from "./item";

/*
 * The Bell (item): a brass handbell, rung to call the living to you, or
 * what else is listening. A bright, flaring bell hanging mouth down from a
 * dark turned wooden handle, a thick lip round its mouth and its iron
 * clapper showing inside. It reads by the bell's flared, trumpet-like
 * silhouette under the fist and its warm brass; the Crystal Ball, the other
 * thing on a turned stem, holds its round glass up over the fist. Held
 * upright by its handle, the bell hanging under the fist.
 */

/** Along the handle, from the grip: its knob over the fist, and the collar where it meets the bell. */
const HANDLE = { knob: 0.062, collar: -0.05, radius: 0.0135 };
/** The bell's profile from its crown down to its lip, [radius, height]: a shoulder, a waist, and the flare to the mouth. */
const PROFILE: readonly (readonly [number, number])[] = [
  [0, -0.058],
  [0.019, -0.061],
  [0.03, -0.071],
  [0.033, -0.085],
  [0.036, -0.102],
  [0.043, -0.119],
  [0.054, -0.132],
  [0.062, -0.14],
];
const WALL = 0.0045;
const LIP = PROFILE[PROFILE.length - 1];

/** The bell's wall, a shell round the profile turned about the handle's axis. */
function shell(): Solid {
  const distance = (x: number, y: number, z: number) => {
    const r = Math.hypot(x, z);
    let d = Infinity;
    for (let i = 1; i < PROFILE.length; i++) {
      const [ar, ay] = PROFILE[i - 1];
      const [br, by] = PROFILE[i];
      const [er, ey] = [br - ar, by - ay];
      const t = THREE.MathUtils.clamp(((r - ar) * er + (y - ay) * ey) / (er * er + ey * ey), 0, 1);
      d = Math.min(d, Math.hypot(r - ar - er * t, y - ay - ey * t));
    }
    return d - WALL;
  };
  const reach = LIP[0] + WALL;
  return { distance, min: [-reach, LIP[1] - WALL, -reach], max: [reach, PROFILE[0][1] + WALL, reach] };
}

/** The brass: the bell's shell, its thick sound-bow round the mouth, and the collar it hangs from. */
function brassGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(shell(), "gold")
    .add(ring([0, LIP[1] + 0.003, 0], LIP[0] - 0.002, 0.0062), "gold", 0.006)
    .add(drum([0, HANDLE.collar - 0.004, 0], HANDLE.radius * 1.35, 0.008, 0.003), "gold", 0.006)
    .geometry(0.0022);
}

/** The handle: turned wood from the collar up through the fist to a round knob over it. */
function handleGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, HANDLE.collar, 0], [0, HANDLE.knob - 0.01, 0], HANDLE.radius * 1.05, HANDLE.radius * 0.92), "woodDark")
    .add(ball([0, HANDLE.knob, 0], HANDLE.radius * 1.45), "woodDark", 0.01)
    .add(ring([0, HANDLE.collar + 0.012, 0], HANDLE.radius * 1.02, 0.0038), "woodDark", 0.004)
    .geometry(0.0024);
}

/** The clapper, an iron ball on its shank, hanging inside the bell to just above the lip. */
function clapperGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.064, 0], [0, -0.118, 0], 0.0045, 0.0035), "soot")
    .add(ball([0, -0.124, 0], 0.0095), "soot", 0.006)
    .geometry(0.0018);
}

const PARTS = figureParts("item:bell", () => ({ brass: brassGeometry(), handle: handleGeometry(), clapper: clapperGeometry() }));

function bell(): THREE.Group {
  const parts = PARTS.get();
  const brass = piece(parts.brass, "bell", SHINES.brass);
  const handle = piece(parts.handle, "bell handle");
  const clapper = piece(parts.clapper, "bell clapper", SHINES.iron);
  return assembled("bell", [brass, handle, clapper], [
    { between: [brass, handle], at: [0, HANDLE.collar, 0], radius: 0.03 },
    { between: [brass, clapper], at: [0, -0.064, 0], radius: 0.015 },
  ]);
}

/** Held by its handle; on the floor it lies on its side, its flare and mouth to the eye. */
export const BELL = itemModel({
  card: "bell",
  parts: [PARTS],
  held: () => ({ object: bell(), handle: HANDLE.radius, carry: "upright" }),
  plate: ON_ITS_SIDE,
});

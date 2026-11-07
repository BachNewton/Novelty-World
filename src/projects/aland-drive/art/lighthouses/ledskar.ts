import type { V3 } from "../roadside/mesh";
import { IdentityMesh, identityModel, type IdentityPart } from "../identity/mesh";
import type { LighthouseArt } from "./kit";

/*
 * Ledskär båk: the 1748 stone daymark off Herröskatan, raised in 1866 and striped in 1899. An octagonal tower in two
 * tapering stages, the upper set back on a stone ledge, every face painted a stripe of its own, faded red or white,
 * under a low pyramid of green copper. It shows no light: the working light is a small lantern of its own just north.
 * One face is red to +z, the main island.
 */

const SIDES = 8;
/** An octagon's corner reach over its reach to a face's middle. */
const CORNER = 1 / Math.cos(Math.PI / SIDES);
const STRIPES: readonly IdentityPart[] = ["limewash-red", "whitewash"];

const [FOOT, PLINTH, SHAFT, LEDGE, LEDGE_SIDE, LEDGE_TOP, EAVE, EDGE, APEX, FINIAL] = [-0.3, 0.35, 0.5, 6.1, 6.22, 6.3, 10.05, 10.15, 10.85, 11.25];
const lowerAt = (y: number) => 1.85 - (y / LEDGE) * 0.2;
const [PLINTH_REACH, LEDGE_REACH, UPPER_FROM, UPPER_TO, ROOF_REACH] = [1.93, 1.75, 1.33, 1.24, 1.47];

/** The corner of the octagon `reach` from its middle to a face's, between face `side - 1` and face `side`. */
const corner = (side: number, y: number, reach: number): V3 => {
  const angle = Math.PI / 2 + (side - 0.5) * (2 * Math.PI / SIDES);
  return [Math.cos(angle) * reach * CORNER, y, Math.sin(angle) * reach * CORNER];
};

/** A tapering eight-sided stage, its faces in turn of `parts`; face 0 looks to +z. */
function stage(mesh: IdentityMesh, [from, to]: readonly [number, number], [reach, reachTo]: readonly [number, number], parts: readonly IdentityPart[], shade = 1): IdentityMesh {
  for (let side = 0; side < SIDES; side++) {
    mesh.face([corner(side + 1, from, reach), corner(side, from, reach), corner(side, to, reachTo), corner(side + 1, to, reachTo)], parts[side % parts.length], shade);
  }
  return mesh;
}

/** A flat octagon across the stage at a height. */
const octagon = (mesh: IdentityMesh, y: number, reach: number, part: IdentityPart, shade = 1) => mesh.face(Array.from({ length: SIDES }, (_, side) => corner(side, y, reach)), part, shade);

/** The low copper pyramid, from its edge's foot to its apex. */
function roof(mesh: IdentityMesh, from: number, seams: boolean): IdentityMesh {
  for (let side = 0; side < SIDES; side++) mesh.face([corner(side + 1, EDGE, ROOF_REACH), corner(side, EDGE, ROOF_REACH), [0, APEX, 0]], "copper", 1.05);
  if (seams) for (let side = 0; side < SIDES; side++) mesh.beam(corner(side, EDGE, ROOF_REACH + 0.02), [0, APEX + 0.02, 0], 0.05, 0.05, "copper", 0.85);
  if (from < EDGE) stage(mesh, [from, EDGE], [ROOF_REACH, ROOF_REACH], ["copper"], 0.8);
  return mesh;
}

function build() {
  const near = new IdentityMesh();
  // The footing, a hand wider, washed back to the shaft.
  stage(near, [FOOT, PLINTH], [PLINTH_REACH, PLINTH_REACH], STRIPES, 0.92);
  stage(near, [PLINTH, SHAFT], [PLINTH_REACH, lowerAt(SHAFT)], STRIPES, 1.04);
  stage(near, [SHAFT, LEDGE], [lowerAt(SHAFT), lowerAt(LEDGE)], STRIPES);
  // The stone ledge the upper stage is set back on, its top washed in to shed the rain.
  stage(near, [LEDGE, LEDGE_SIDE], [LEDGE_REACH, LEDGE_REACH], ["concrete"], 0.92);
  stage(near, [LEDGE_SIDE, LEDGE_TOP], [LEDGE_REACH, UPPER_FROM + 0.02], ["concrete"], 1.05);
  octagon(near, LEDGE, LEDGE_REACH, "concrete", 0.7);
  stage(near, [LEDGE_TOP - 0.1, EAVE + 0.05], [UPPER_FROM, UPPER_TO], STRIPES);
  octagon(near, EAVE, ROOF_REACH, "roof-under", 0.8);
  roof(near, EAVE, true);
  near.thinTube([0, APEX - 0.1, 0], [0, FINIAL, 0], 0.035, 4, { radiusTo: 0.02, cap: true }, "steel-dark");
  // The skerry's granite breaking through the turf round its foot.
  for (const [angle, out, wide, tall] of [[0.4, 3.2, 0.9, 0.35], [1.9, 2.9, 0.7, 0.28], [2.8, 3.6, 1.2, 0.4], [4.1, 3.0, 0.6, 0.25], [5.3, 3.4, 1.0, 0.32]] as const) {
    near.lump([Math.cos(angle) * out, -0.12, Math.sin(angle) * out], wide, tall, 5, Math.round(angle * 10), { top: "rock", under: "rock" });
  }

  const far = new IdentityMesh();
  stage(far, [FOOT, LEDGE], [PLINTH_REACH, lowerAt(LEDGE)], STRIPES);
  stage(far, [LEDGE, LEDGE_SIDE], [LEDGE_REACH, LEDGE_REACH], ["concrete"], 0.92);
  octagon(far, LEDGE_SIDE, LEDGE_REACH, "concrete", 1.05);
  stage(far, [LEDGE_SIDE - 0.05, EAVE + 0.05], [UPPER_FROM, UPPER_TO], STRIPES);
  roof(far, EDGE, false);
  return identityModel(near, far, 300, 8000);
}

export const LEDSKAR: LighthouseArt = { name: "Ledskär båk", build, lampM: null, lanternM: 0 };

import type { V3 } from "../roadside/mesh";
import { IdentityMesh, identityModel, type IdentityPart } from "../identity/mesh";
import type { LighthouseArt } from "./kit";

/*
 * Högsten båk: the 1845 wooden daymark off Eckerö, restored in 1981, on an island that has carried a sea mark since 1740.
 * A tall six-sided tower, boarded red from its stone footing to its eaves and tapering as it rises, its boarding in three
 * tiers on two drip mouldings, a short upright frieze under a low pyramid of dark sheet metal. It shows no light. Its door
 * is on face 0, which is turned a little off +z (Eckerö) so the kit's upright boards run across all six faces.
 */

const SIDES = 6;
/** Face 0's outward way, from +x towards +z. */
const FACE_0 = Math.PI / 2 - Math.PI / 12;
const STEP = (2 * Math.PI) / SIDES;
/** A hexagon's reach to a face's middle over its reach to a corner. */
const APOTHEM = Math.cos(Math.PI / SIDES);

const [FOOT, PLINTH, FRIEZE, EAVE, FASCIA, APEX] = [-0.3, 0.35, 14.2, 14.85, 15.1, 16];
const BANDS = [5.0, 9.9] as const;
const [BASE_REACH, TOP_REACH] = [4, 3];
/** The boarding's corner reach at a height, from its foot on the plinth to the frieze. */
const reachAt = (y: number) => BASE_REACH + (Math.min(y, FRIEZE) - PLINTH) / (FRIEZE - PLINTH) * (TOP_REACH - BASE_REACH);
const [PLINTH_OUT, BAND_OUT, BAND_TALL, EAVE_REACH] = [0.14, 0.07, 0.12, TOP_REACH + 0.45];

/** Corner `side` of the hexagon at a height, between face `side - 1` and face `side`. */
const corner = (side: number, y: number, reach: number): V3 => {
  const angle = FACE_0 + (side - 0.5) * STEP;
  return [Math.cos(angle) * reach, y, Math.sin(angle) * reach];
};

/** Six outward faces from one height and reach to another. */
function sides(mesh: IdentityMesh, [from, to]: readonly [number, number], [reach, reachTo]: readonly [number, number], part: IdentityPart, shade = 1): IdentityMesh {
  for (let side = 0; side < SIDES; side++) {
    mesh.face([corner(side + 1, from, reach), corner(side, from, reach), corner(side, to, reachTo), corner(side + 1, to, reachTo)], part, shade);
  }
  return mesh;
}

/** A flat hexagonal ring at a height between two reaches, facing up or down. */
function annulus(mesh: IdentityMesh, y: number, inner: number, outer: number, up: boolean, part: IdentityPart, shade = 1): IdentityMesh {
  for (let side = 0; side < SIDES; side++) {
    const [a, b, c, d] = [corner(side + 1, y, outer), corner(side, y, outer), corner(side, y, inner), corner(side + 1, y, inner)];
    mesh.face(up ? [a, b, c, d] : [d, c, b, a], part, shade);
  }
  return mesh;
}

/** A drip moulding round the boarding, standing proud of it, mitred at the corners. */
function band(mesh: IdentityMesh, y: number): IdentityMesh {
  const [low, high] = [y - BAND_TALL / 2, y + BAND_TALL / 2];
  sides(mesh, [low, high], [reachAt(low) + BAND_OUT, reachAt(high) + BAND_OUT], "brick-red", 0.9);
  annulus(mesh, high, reachAt(high), reachAt(high) + BAND_OUT, true, "brick-red", 1.05);
  return annulus(mesh, low, reachAt(low), reachAt(low) + BAND_OUT, false, "brick-red", 0.7);
}

/** The eaves and the low pyramid roof over them. */
function roof(mesh: IdentityMesh, seams: boolean): IdentityMesh {
  if (seams) annulus(mesh, EAVE, TOP_REACH, EAVE_REACH, false, "roof-under", 0.8);
  else mesh.face(Array.from({ length: SIDES }, (_, side) => corner(side, EAVE, EAVE_REACH)), "roof-under", 0.8);
  sides(mesh, [EAVE, FASCIA], [EAVE_REACH, EAVE_REACH], "roof", 0.9);
  for (let side = 0; side < SIDES; side++) mesh.face([corner(side + 1, FASCIA, EAVE_REACH), corner(side, FASCIA, EAVE_REACH), [0, APEX, 0]], "roof", 1.05);
  // The hips' cover strips stop short of the apex, where six would meet in one another's planes.
  const shortOf = (at: V3, share: number): V3 => [at[0] * share, FASCIA + 0.02 + (APEX - FASCIA) * (1 - share), at[2] * share];
  if (seams) for (let side = 0; side < SIDES; side++) mesh.beam(corner(side, FASCIA + 0.02, EAVE_REACH + 0.02), shortOf(corner(side, 0, EAVE_REACH + 0.02), 0.06), 0.06, 0.05, "roof", 0.8);
  return mesh;
}

/** The plain board door on face 0, at the foot. */
function door(mesh: IdentityMesh): IdentityMesh {
  const [wide, tall] = [0.9, 1.9];
  const out: V3 = [Math.cos(FACE_0), 0, Math.sin(FACE_0)];
  const along: V3 = [-out[2], 0, out[0]];
  const at = (u: number, y: number): V3 => {
    const reach = reachAt(y) * APOTHEM + 0.02;
    return [out[0] * reach + along[0] * u, y, out[2] * reach + along[2] * u];
  };
  const [low, high] = [PLINTH + 0.05, PLINTH + 0.05 + tall];
  return mesh.face([at(wide / 2, low), at(-wide / 2, low), at(-wide / 2, high), at(wide / 2, high)], "band-black");
}

function build() {
  const near = new IdentityMesh();
  // The footing of laid stone, a hand proud of the boarding.
  sides(near, [FOOT, PLINTH], [BASE_REACH + PLINTH_OUT, BASE_REACH + PLINTH_OUT], "rock", 0.95);
  annulus(near, PLINTH, BASE_REACH, BASE_REACH + PLINTH_OUT, true, "rock", 1.05);
  sides(near, [PLINTH, FRIEZE], [BASE_REACH, TOP_REACH], "red-boards");
  sides(near, [FRIEZE, EAVE + 0.05], [TOP_REACH, TOP_REACH], "red-boards", 0.95);
  for (const y of BANDS) band(near, y);
  roof(near, true);
  door(near);

  const far = new IdentityMesh();
  sides(far, [FOOT, PLINTH], [BASE_REACH + PLINTH_OUT, BASE_REACH + PLINTH_OUT], "rock", 0.95);
  sides(far, [PLINTH - 0.05, EAVE + 0.05], [BASE_REACH, TOP_REACH], "red-boards");
  roof(far, false);
  return identityModel(near, far, 250, 15000);
}

export const HOGSTEN: LighthouseArt = { name: "Högsten båk", build, lampM: null, lanternM: 0 };

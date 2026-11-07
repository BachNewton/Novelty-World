import type { V3 } from "../roadside/mesh";
import { IdentityMesh, identityModel, type IdentityPart } from "../identity/mesh";
import { plate } from "../identity/kit";
import type { LighthouseArt } from "./kit";

/*
 * Flötjan: the 1953 landfall light south of Mariehamn, a stout column of slip-formed concrete cast in one pour, red with
 * one white band between its two galleries, a white watch drum and a small white lantern on top, a lattice mast for its
 * racon beside it. No stairs: a steel ladder climbs it, on the landing side, to +z and the main island; its solar panel
 * hangs on the band to the south. It stands at the top of a long, low granite skerry with nothing else on it.
 * Its proportions are read off the Commons photo `Flotjan.jpg`, scaled to the register's height.
 */

const SIDES = 16;
const [FOOT, RADIUS, RADIUS_TOP] = [2.9, 2.85, 2.8];
/** Heights above the tower's foot. */
const [LOW_DECK, BAND_TOP, TOP_DECK, DECK_THICK] = [9.1, 13.8, 18.85, 0.25];
const DECK_REACH = 3.75;
const RAIL_HIGH = 1.05;
const [DRUM_TOP, GLASS_TOP, ROOF_PEAK, MAST_TOP] = [20.6, 21.5, 22.7, 25.6];
const [DRUM_REACH, GLASS_REACH, EAVE_REACH] = [1.2, 1.1, 1.55];
const LAMP = 21.05;

const at = (y: number) => FOOT + y;
const radiusAt = (y: number) => RADIUS + (y / TOP_DECK) * (RADIUS_TOP - RADIUS);
const round = (angle: number, reach: number, y: number): V3 => [Math.cos(angle) * reach, y, Math.sin(angle) * reach];
const turn = (step: number, of: number) => (step / of) * 2 * Math.PI;

/** A flat disc facing down, for a deck's or an eave's underside. */
function under(mesh: IdentityMesh, y: number, reach: number, sides: number, part: IdentityPart, shade = 0.7): IdentityMesh {
  return mesh.face(Array.from({ length: sides }, (_, side) => round(turn(side, sides), reach, y)), part, shade);
}

/** A gallery: a concrete deck round the column, its top at `top`, and a railing of posts and a top rail. */
function gallery(mesh: IdentityMesh, top: number, posts: number | null): IdentityMesh {
  mesh.tube([0, top - DECK_THICK, 0], [0, top, 0], DECK_REACH, SIDES, { cap: true, shadeFrom: 0.8, shadeTo: 1.05 }, "concrete");
  under(mesh, top - DECK_THICK, DECK_REACH, SIDES, "concrete");
  if (posts === null) return mesh;
  const reach = DECK_REACH - 0.08;
  for (let post = 0; post < posts; post++) {
    const [a, b] = [turn(post + 0.5, posts), turn(post + 1.5, posts)];
    // Every other length of rail a few millimetres thicker, so two lengths' faces never lie in one plane where they meet.
    const rail = post % 2 === 0 ? 0.05 : 0.044;
    mesh.thinBeam(round(a, reach, top - 0.02), round(a, reach, top + RAIL_HIGH), 0.04, 0.04, "steel");
    mesh.thinBeam(round(a, reach, top + RAIL_HIGH), round(b, reach, top + RAIL_HIGH), rail, rail, "steel");
  }
  return mesh;
}

/** The column in its three paints, from its foot sunk in the rock to inside the top deck. */
function column(mesh: IdentityMesh, sides: number): IdentityMesh {
  const bands: readonly [number, number, IdentityPart][] = [[-0.8, LOW_DECK, "roof-red"], [LOW_DECK, BAND_TOP, "whitewash"], [BAND_TOP, TOP_DECK - 0.05, "roof-red"]];
  for (const [from, to, part] of bands) mesh.tube([0, at(from), 0], [0, at(to), 0], radiusAt(from), sides, { radiusTo: radiusAt(to), shadeFrom: 0.96, shadeTo: 1.03 }, part);
  return mesh;
}

/** A gentle noise round the skerry's outline, so it reads as worn granite rather than an ellipse. */
const wobble = (angle: number, seed: number) => 1 + 0.12 * Math.sin(angle * 3 + seed) + 0.07 * Math.sin(angle * 5 + seed * 2.3);

/**
 * The skerry: a long, low granite whaleback, its back highest at the tower, its edges under the sea. Rings from the
 * waterline up, each `[height, share of the outline]`, closed by a fan to the tower's foot.
 */
function skerry(mesh: IdentityMesh, rings: readonly (readonly [number, number])[], sides: number): IdentityMesh {
  const [halfX, halfZ, centreZ] = [11, 29, -8];
  const point = (ring: number, side: number): V3 => {
    const [y, share] = rings[ring];
    const angle = turn(side, sides);
    const out = share * wobble(angle, ring * 0.7 + 1.3);
    // The rings close in on the tower, which stands off the skerry's middle, near its north end.
    const pull = 1 - share;
    return [Math.cos(angle) * halfX * out, y, centreZ * (1 - pull) + Math.sin(angle) * halfZ * out];
  };
  for (let ring = 0; ring + 1 < rings.length; ring++) {
    for (let side = 0; side < sides; side++) {
      const shade = 0.82 + ring * 0.08;
      mesh.face([point(ring, side + 1), point(ring, side), point(ring + 1, side), point(ring + 1, side + 1)], "rock", shade);
    }
  }
  const top = rings.length - 1;
  for (let side = 0; side < sides; side++) mesh.face([point(top, side + 1), point(top, side), [0, FOOT + 0.1, 0]], "rock", 1.08);
  return mesh;
}

function build() {
  const near = new IdentityMesh();
  skerry(near, [[-0.8, 1], [0.7, 0.8], [1.8, 0.5], [2.7, 0.3]], 14);
  for (const [x, z, wide, tall, seed] of [[6.2, -14, 1.6, 0.7, 3], [-5.5, -21, 1.2, 0.5, 7], [3.8, 6.5, 1.0, 0.45, 11]] as const) {
    near.lump([x, 1.0, z], wide, tall, 5, seed, { top: "rock", under: "rock" });
  }

  column(near, SIDES);
  gallery(near, at(LOW_DECK + DECK_THICK / 2), 10);
  gallery(near, at(TOP_DECK + 0.1), 12);
  const deck = at(TOP_DECK + 0.1);

  // Slit windows to the stair-less shaft, and the door out onto the lower gallery by the ladder.
  for (const [y, angle] of [[15.6, 1.2], [15.6, 3.9], [5.2, 4.6]] as const) {
    const [cos, sin, reach] = [Math.cos(angle), Math.sin(angle), radiusAt(y) + 0.03];
    plate(near, [cos * reach - sin * 0.22, at(y), sin * reach + cos * 0.22], [sin * 0.44, 0, -cos * 0.44], [0, 0.7, 0], "glass");
  }
  const doorZ = radiusAt(LOW_DECK + 0.5) + 0.03;
  near.face([[-0.45, at(LOW_DECK + 0.13), doorZ], [0.45, at(LOW_DECK + 0.13), doorZ], [0.45, at(LOW_DECK + 2.1), doorZ], [-0.45, at(LOW_DECK + 2.1), doorZ]], "steel-dark");

  // The ladder up the landing side, through both decks' edges, and the davit at the band's top for hoisting gear.
  const ladderZ = (y: number) => radiusAt(y) + 0.25;
  for (const x of [-1.1, -0.65]) near.thinBeam([x, at(-0.2), ladderZ(0)], [x, at(TOP_DECK + 1.1), ladderZ(TOP_DECK)], 0.05, 0.05, "steel-dark");
  near.thinBeam([0.7, at(BAND_TOP), radiusAt(BAND_TOP) + 0.05], [0.7, at(BAND_TOP), DECK_REACH + 0.9], 0.12, 0.12, "steel-dark");
  near.thinBeam([0.7, at(LOW_DECK + 0.15), DECK_REACH - 0.1], [0.7, at(BAND_TOP), DECK_REACH - 0.1], 0.08, 0.08, "steel-dark");

  // The solar panel hung on the band to the south, standing a hand off the wall.
  const panelZ = -radiusAt(LOW_DECK) - 0.12;
  near.box([-0.75, at(LOW_DECK + 1.0), panelZ - 0.08], [0.75, at(BAND_TOP - 0.25), panelZ], "solar-panel", { shade: 0.9 });

  // The watch drum, the lantern, its lamp, and its white cap with a vent.
  near
    .tube([0, deck - 0.1, 0], [0, at(DRUM_TOP), 0], DRUM_REACH, 12, { cap: true, shadeFrom: 0.85, shadeTo: 1 }, "whitewash")
    .tube([0, at(DRUM_TOP), 0], [0, at(GLASS_TOP), 0], GLASS_REACH, 8, {}, "lantern-glass")
    .tube([0, at(LAMP - 0.25), 0], [0, at(LAMP + 0.25), 0], 0.3, 6, { cap: true }, "lamp")
    .tube([0, at(GLASS_TOP), 0], [0, at(ROOF_PEAK), 0], EAVE_REACH, 12, { radiusTo: 0.18, shadeFrom: 0.95, shadeTo: 1.1 }, "whitewash")
    .tube([0, at(ROOF_PEAK - 0.05), 0], [0, at(ROOF_PEAK + 0.3), 0], 0.14, 6, { radiusTo: 0.1, cap: true }, "whitewash");
  under(near, at(GLASS_TOP), EAVE_REACH, 12, "roof-under");

  // The racon's lattice mast at the south edge of the top gallery, its crosstrees and aerials.
  const mast: V3 = [0.4, deck, -DECK_REACH + 0.55];
  near.thinTube(mast, [mast[0], at(MAST_TOP), mast[2]], 0.07, 4, { radiusTo: 0.04, cap: true }, "steel");
  for (const [y, half] of [[MAST_TOP - 1.6, 0.55], [MAST_TOP - 0.7, 0.4]] as const) {
    near.thinBeam([mast[0] - half, at(y), mast[2]], [mast[0] + half, at(y), mast[2]], 0.04, 0.04, "steel");
  }
  near.thinBeam([mast[0], deck + 0.6, mast[2]], [mast[0], deck + 0.6, -DRUM_REACH + 0.05], 0.06, 0.06, "steel");

  const far = new IdentityMesh();
  skerry(far, [[-0.8, 1], [1.4, 0.55]], 7);
  column(far, 6);
  far.tube([0, at(LOW_DECK), 0], [0, at(LOW_DECK + DECK_THICK + RAIL_HIGH * 0.4), 0], DECK_REACH, 6, { cap: true, shadeFrom: 0.8 }, "concrete");
  far.tube([0, at(TOP_DECK - 0.15), 0], [0, at(TOP_DECK + 0.1 + RAIL_HIGH * 0.4), 0], DECK_REACH, 6, { cap: true, shadeFrom: 0.8 }, "concrete");
  far
    .tube([0, at(TOP_DECK + 0.4), 0], [0, at(DRUM_TOP), 0], DRUM_REACH, 5, {}, "whitewash")
    .tube([0, at(DRUM_TOP), 0], [0, at(GLASS_TOP), 0], GLASS_REACH, 5, {}, "lantern-glass")
    .tube([0, at(GLASS_TOP), 0], [0, at(ROOF_PEAK + 0.3), 0], EAVE_REACH, 5, { radiusTo: 0.1, cap: true, shadeTo: 1.1 }, "whitewash");
  return identityModel(near, far, 200, 25000);
}

export const FLOTJAN: LighthouseArt = { name: "Flötjan", build, lampM: FOOT + LAMP, lanternM: EAVE_REACH + 0.05 };

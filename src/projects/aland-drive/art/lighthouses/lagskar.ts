import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { house, houseFar, windowFacingZ, type HouseShape } from "../identity/kit";
import { IdentityMesh, identityModel, type IdentityPart } from "../identity/mesh";
import type { LighthouseArt } from "./kit";

/*
 * Lågskär (1920): a truncated square pyramid of reinforced concrete painted brick red, 33 m from its rock to the top
 * of its lantern. A bolder plinth stage with a moulding and a round-headed door, a long shaft with slit windows climbing
 * each face, a corbelled cornice carrying the gallery, and a small white lantern. Its 1½-storey keeper's house, pale
 * yellow under a brown roof, stands just behind, with small red outbuildings, all on a low granite skerry no tile
 * draws. Proportions from the 1939–45 photo on Commons, colours from File:Lagskar.jpg. +z holds the door.
 */

const SWAP_M = 1200;
const REACH_M = 20000;

/** The skerry: an ellipse, its edge wavering, rising to a low hump, centred a little behind the tower. */
const ROCK = { x: 8, z: -4, a: 44, b: 27, high: 3.2 };
const outline = (angle: number) => 1 + 0.09 * Math.sin(3 * angle + 1) + 0.06 * Math.sin(5 * angle + 2.3) + 0.04 * Math.sin(7 * angle + 0.4);
const reachOf = (x: number, z: number) => {
  const [u, v] = [(x - ROCK.x) / ROCK.a, (z - ROCK.z) / ROCK.b];
  return Math.hypot(u, v) / outline(Math.atan2(v, u));
};
/** The rock's height: sea level at its edge, under the sea past it. */
const groundAt = (x: number, z: number) => {
  const reach = reachOf(x, z);
  if (reach >= 1) return -(reach - 1) * 15;
  const fall = 1 - reach ** 2;
  return ROCK.high * fall ** 0.7 + 0.35 * Math.sin(0.21 * x + 0.5) * Math.cos(0.27 * z + 1.1) * fall;
};
const rockPoint = (reach: number, angle: number): V3 => {
  const out = reach * outline(angle);
  const [x, z] = [ROCK.x + Math.cos(angle) * ROCK.a * out, ROCK.z + Math.sin(angle) * ROCK.b * out];
  return [x, groundAt(x, z), z];
};
/** The lowest the rock gets under a footprint, so what stands on it sinks in all round. */
const lowestUnder = (x0: number, x1: number, z0: number, z1: number) => Math.min(...[x0, (x0 + x1) / 2, x1].flatMap((x) => [z0, (z0 + z1) / 2, z1].map((z) => groundAt(x, z))));

/** Rings of the rock out from its middle; the far version takes every few. */
const NEAR_RINGS = [0.2, 0.4, 0.6, 0.75, 0.88, 1, 1.12];
const FAR_RINGS = [0.6, 1];

function rock(mesh: IdentityMesh, rings: readonly number[], sides: number): IdentityMesh {
  const angle = (side: number) => (side / sides) * 2 * Math.PI;
  const middle = rockPoint(0, 0);
  for (let side = 0; side < sides; side++) mesh.face([middle, rockPoint(rings[0], angle(side)), rockPoint(rings[0], angle(side + 1))], "rock", 1.04);
  for (let ring = 0; ring + 1 < rings.length; ring++) {
    for (let side = 0; side < sides; side++) {
      // Granite mottled a little, lighter on its weathered crown.
      const shade = 0.9 + 0.1 * ((side * 7 + ring * 3) % 4) / 3 + (ring < 2 ? 0.04 : 0);
      mesh.face([rockPoint(rings[ring], angle(side)), rockPoint(rings[ring + 1], angle(side)), rockPoint(rings[ring + 1], angle(side + 1)), rockPoint(rings[ring], angle(side + 1))], "rock", shade);
    }
  }
  return mesh;
}

/** The tower stands on its rock: everything of it is measured up from here. */
const FOOT = Math.round(groundAt(0, 0) * 100) / 100;
const SINK = 0.6;
const PLINTH = { top: 8, from: 6.4, to: 5.7 };
const SHAFT = { from: 8.3, top: 28.7, halfFrom: 4.65, halfTo: 2.6 };
const CORNICE = { flare: 29.4, top: 29.8, half: 3.45 };
const LANTERN = { foot: 29.75, glass: 30.6, roof: 32, dome: 32.75, radius: 1.25, roofRadius: 1.38 };
export const LAGSKAR_LAMP_M = FOOT + 31.3;

/** Which way each face of the square looks, +z first, and the light on it. */
const FACES = [0, 1, 2, 3] as const;
const FACE_SHADE = [1, 0.97, 0.9, 0.94];
/** A point on face `side` of a square tower whose half width at a height is `half`: `along` the face, `out` past it. */
const onFace = (side: number, along: number, y: number, depth: number): V3 => {
  if (side === 0) return [along, y, depth];
  if (side === 1) return [depth, y, -along];
  if (side === 2) return [-along, y, -depth];
  return [-depth, y, along];
};

/** A square stage tapering from one half width to another, its faces square to the axes; capped where asked. */
function frustum(mesh: IdentityMesh, y0: number, y1: number, half0: number, half1: number, part: IdentityPart, { top = false, bottom = false, shade = 1 } = {}): IdentityMesh {
  for (const side of FACES) mesh.face([onFace(side, -half0, y0, half0), onFace(side, half0, y0, half0), onFace(side, half1, y1, half1), onFace(side, -half1, y1, half1)], part, shade * FACE_SHADE[side]);
  if (top) mesh.face([[-half1, y1, half1], [half1, y1, half1], [half1, y1, -half1], [-half1, y1, -half1]], part, shade * 1.05);
  if (bottom) mesh.face([[-half0, y0, half0], [half0, y0, half0], [half0, y0, -half0], [-half0, y0, -half0]], part, shade * 0.7);
  return mesh;
}

/** Points on a tapering face, `out` clear of it: its depth follows the taper so a plate lies parallel to the wall. */
function onWall(side: number, halfAt: (y: number) => number, out: number) {
  return (along: number, y: number) => onFace(side, along, y, halfAt(y) + out);
}

function tower(mesh: IdentityMesh): IdentityMesh {
  const y = (height: number) => FOOT + height;
  const plinthHalf = (at: number) => PLINTH.from + ((at - FOOT) / PLINTH.top) * (PLINTH.to - PLINTH.from);
  const shaftHalf = (at: number) => SHAFT.halfFrom + ((at - y(SHAFT.from)) / (SHAFT.top - SHAFT.from)) * (SHAFT.halfTo - SHAFT.halfFrom);
  // The plinth stage, its moulding, the shaft, and the corbelled cornice the gallery stands on.
  frustum(mesh, y(-SINK), y(PLINTH.top), PLINTH.from + (SINK / PLINTH.top) * (PLINTH.from - PLINTH.to), PLINTH.to, "brick-red");
  frustum(mesh, y(PLINTH.top - 0.05), y(PLINTH.top + 0.45), 5.95, 5.95, "brick-red", { top: true, bottom: true, shade: 1.08 });
  frustum(mesh, y(SHAFT.from), y(SHAFT.top), SHAFT.halfFrom, SHAFT.halfTo, "brick-red");
  frustum(mesh, y(SHAFT.top - 0.05), y(CORNICE.flare), SHAFT.halfTo, CORNICE.half, "brick-red", { shade: 0.88 });
  frustum(mesh, y(CORNICE.flare - 0.02), y(CORNICE.top), CORNICE.half, CORNICE.half, "brick-red", { top: true, shade: 1.08 });

  // Slit windows up every face, staggered face to face as the stair winds past them.
  for (const side of FACES) {
    const at = onWall(side, shaftHalf, 0.03);
    for (const level of [10.6, 14.2, 17.8, 21.4, 25]) {
      const low = y(level + (side % 2) * 1.6);
      mesh.face([at(-0.22, low), at(0.22, low), at(0.22, low + 1.3), at(-0.22, low + 1.3)], "glass");
    }
  }

  // The round-headed door in the plinth, up a concrete step, and a pedimented window in each other face.
  const surround = onWall(0, plinthHalf, 0.02);
  const door = onWall(0, plinthHalf, 0.04);
  const arch = (at: (along: number, height: number) => V3, wide: number, spring: number, from: number) => [
    at(-wide, from),
    at(wide, from),
    ...Array.from({ length: 7 }, (_, step) => at(Math.cos((step / 6) * Math.PI) * wide, spring + Math.sin((step / 6) * Math.PI) * wide)),
  ];
  mesh.face(arch(surround, 1.05, y(2.7), y(0.45)), "brick-red", 1.14);
  mesh.face(arch(door, 0.8, y(2.6), y(0.5)), "door");
  mesh.box([-1.2, y(-0.6), plinthHalf(y(0.5)) - 0.2], [1.2, y(0.5), plinthHalf(y(0.5)) + 1.1], "concrete", { open: true, shadeTop: 1.08 });
  for (const side of [1, 2, 3]) {
    const pediment = onWall(side, plinthHalf, 0.02);
    const glass = onWall(side, plinthHalf, 0.04);
    mesh.face([pediment(-0.75, y(3.6)), pediment(0.75, y(3.6)), pediment(0.75, y(5.6)), pediment(0, y(6.3)), pediment(-0.75, y(5.6))], "brick-red", 1.14);
    mesh.face([glass(-0.5, y(3.8)), glass(0.5, y(3.8)), glass(0.5, y(5.4)), glass(-0.5, y(5.4))], "glass");
  }

  // The gallery's rail, white: a post at each corner and mid side, two bars, each bay its own so it thins on its own.
  const rail = CORNICE.half - 0.12;
  const deck = y(CORNICE.top);
  const round: [number, number][] = [[-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0]];
  round.forEach(([a, b], post) => {
    const [c, d] = round[(post + 1) % round.length];
    mesh.thinBeam([a * rail, deck, b * rail], [a * rail, deck + 1.05, b * rail], 0.06, 0.06, "whitewash");
    // Bars along z sit 2 cm under those along x, so where two meet at a corner their tops don't share a plane.
    const lift = a === c ? -0.02 : 0;
    for (const bar of [0.5, 1]) mesh.thinBeam([a * rail, deck + bar + lift, b * rail], [c * rail, deck + bar + lift, d * rail], 0.05, 0.05, "whitewash");
  });

  // The lantern: a white drum, its glazing with white bars, the lamp in it, and a shallow white dome with its vent.
  const lantern = (height: number): V3 => [0, y(height), 0];
  mesh
    .tube(lantern(LANTERN.foot), lantern(LANTERN.glass), LANTERN.radius, 8, { cap: false, shadeFrom: 0.9 }, "whitewash")
    .tube(lantern(LANTERN.glass - 0.05), lantern(LANTERN.roof), LANTERN.radius - 0.05, 8, {}, "lantern-glass")
    .tube(lantern(LANTERN.glass + 0.35), lantern(LANTERN.glass + 0.95), 0.42, 6, { cap: true }, "lamp")
    .tube(lantern(LANTERN.roof), lantern(LANTERN.roof + 0.18), LANTERN.roofRadius, 8, { cap: false }, "whitewash")
    .tube(lantern(LANTERN.roof + 0.18), lantern(LANTERN.dome), LANTERN.roofRadius, 8, { radiusTo: 0.3, cap: true, shadeFrom: 0.95, shadeTo: 1.1 }, "whitewash")
    .tube(lantern(LANTERN.dome - 0.05), lantern(LANTERN.dome + 0.3), 0.18, 5, { radiusTo: 0.12, cap: true }, "steel-dark")
    .tube(lantern(LANTERN.dome + 0.3), lantern(LANTERN.dome + 0.75), 0.03, 3, { radiusTo: 0.01 }, "steel-dark");
  for (let bar = 0; bar < 8; bar++) {
    const angle = (bar / 8) * 2 * Math.PI;
    const [x, z] = [Math.cos(angle) * (LANTERN.radius - 0.02), Math.sin(angle) * (LANTERN.radius - 0.02)];
    mesh.thinBeam([x, y(LANTERN.glass), z], [x, y(LANTERN.roof), z], 0.07, 0.07, "whitewash");
  }
  return mesh;
}

function towerFar(mesh: IdentityMesh): IdentityMesh {
  const y = (height: number) => FOOT + height;
  frustum(mesh, y(-SINK), y(PLINTH.top + 0.45), PLINTH.from, PLINTH.to + 0.2, "brick-red");
  frustum(mesh, y(PLINTH.top), y(SHAFT.top), SHAFT.halfFrom + 0.05, SHAFT.halfTo, "brick-red");
  frustum(mesh, y(SHAFT.top - 0.05), y(CORNICE.top), SHAFT.halfTo, CORNICE.half, "brick-red", { top: true, shade: 0.95 });
  return mesh
    .tube([0, y(LANTERN.foot), 0], [0, y(LANTERN.roof + 0.18), 0], LANTERN.radius, 6, {}, "whitewash")
    .tube([0, y(LANTERN.roof + 0.18), 0], [0, y(LANTERN.dome), 0], LANTERN.roofRadius, 6, { radiusTo: 0.3, cap: true, shadeTo: 1.1 }, "whitewash");
}

/** The keeper's house (1920), 1½ storeys of pale yellow under a steep brown roof, just behind the tower. */
const KEEPER = { x: [9, 21], z: [-13, -4.5] } as const;
const keeperBase = lowestUnder(KEEPER.x[0], KEEPER.x[1], KEEPER.z[0], KEEPER.z[1]);
const KEEPER_FLOOR = groundAt((KEEPER.x[0] + KEEPER.x[1]) / 2, (KEEPER.z[0] + KEEPER.z[1]) / 2) + 0.4;
const KEEPER_SHAPE: HouseShape = { ...KEEPER, eave: KEEPER_FLOOR + 4.2, ridge: KEEPER_FLOOR + 8.6, wall: "log-end", roof: "timber-grey", overhang: 0.4, foot: keeperBase - 0.4 };

/** Small red board sheds: a store and a boathouse-sized barn. */
const SHEDS: readonly { x: readonly [number, number]; z: readonly [number, number] }[] = [
  { x: [-15, -10], z: [-6, -2.4] },
  { x: [25, 31], z: [-17, -12.5] },
];
const shedShape = ({ x, z }: (typeof SHEDS)[number]): HouseShape => {
  const floor = groundAt((x[0] + x[1]) / 2, (z[0] + z[1]) / 2) + 0.2;
  return { x, z, eave: floor + 2.3, ridge: floor + 3.6, wall: "red-boards", roof: "roof", gable: "red-boards", foot: lowestUnder(x[0], x[1], z[0], z[1]) - 0.3 };
};

function keeperHouse(mesh: IdentityMesh): IdentityMesh {
  house(mesh, KEEPER_SHAPE);
  const [x0, x1] = KEEPER.x;
  const [z0, z1] = KEEPER.z;
  for (const x of [10.6, 13.2, 16.8, 19.4]) {
    windowFacingZ(mesh, x, KEEPER_FLOOR + 1.6, z1, 0.95, 1.3);
    windowFacingZ(mesh, x, KEEPER_FLOOR + 1.6, z0, 0.95, 1.3, -1);
  }
  // Its door, mid front, and the half storey's windows in the gables.
  mesh.face([[14.45, KEEPER_FLOOR - 0.3, z1 + 0.015], [15.55, KEEPER_FLOOR - 0.3, z1 + 0.015], [15.55, KEEPER_FLOOR + 1.95, z1 + 0.015], [14.45, KEEPER_FLOOR + 1.95, z1 + 0.015]], "trim");
  mesh.face([[14.55, KEEPER_FLOOR - 0.3, z1 + 0.03], [15.45, KEEPER_FLOOR - 0.3, z1 + 0.03], [15.45, KEEPER_FLOOR + 1.85, z1 + 0.03], [14.55, KEEPER_FLOOR + 1.85, z1 + 0.03]], "door");
  for (const [x, side] of [[x1, 1], [x0, -1]] as const) {
    for (const [middle, high] of [[-2.2, 1.6], [2.2, 1.6], [-1, 5.4], [1, 5.4]] as const) {
      const z = (z0 + z1) / 2 + middle;
      const [low, top] = [KEEPER_FLOOR + high - 0.65, KEEPER_FLOOR + high + 0.65];
      mesh.face([[x + side * 0.015, low - 0.07, z - 0.52], [x + side * 0.015, low - 0.07, z + 0.52], [x + side * 0.015, top + 0.07, z + 0.52], [x + side * 0.015, top + 0.07, z - 0.52]], "trim");
      mesh.face([[x + side * 0.03, low, z - 0.45], [x + side * 0.03, low, z + 0.45], [x + side * 0.03, top, z + 0.45], [x + side * 0.03, top, z - 0.45]], "glass");
    }
  }
  // Two chimneys standing through the ridge.
  for (const x of [12.4, 17.6]) mesh.box([x - 0.4, KEEPER_FLOOR + 6.5, -9.15], [x + 0.4, KEEPER_FLOOR + 9.6, -8.35], "brick-red", { open: true, shadeTop: 0.6 });
  return mesh;
}

/** Junipers and low pines on the far end of the skerry. */
const BUSHES: readonly [number, number, number, number][] = [
  [33, -2, 2.2, 1.9],
  [37, -9, 2.6, 2.4],
  [29, 6, 1.8, 1.5],
  [41, 1, 1.9, 1.7],
  [22, 9, 1.6, 1.3],
];

function nearModel(): IdentityMesh {
  const mesh = rock(new IdentityMesh(), NEAR_RINGS, 24);
  tower(mesh);
  keeperHouse(mesh);
  for (const shed of SHEDS) {
    const shape = shedShape(shed);
    house(mesh, shape);
    windowFacingZ(mesh, (shed.x[0] + shed.x[1]) / 2 - 1.2, shape.eave - 1, shed.z[1], 0.6, 0.6);
    mesh.face([[(shed.x[0] + shed.x[1]) / 2, shape.foot ?? 0, shed.z[1] + 0.015], [(shed.x[0] + shed.x[1]) / 2 + 1.2, shape.foot ?? 0, shed.z[1] + 0.015], [(shed.x[0] + shed.x[1]) / 2 + 1.2, shape.eave - 0.3, shed.z[1] + 0.015], [(shed.x[0] + shed.x[1]) / 2, shape.eave - 0.3, shed.z[1] + 0.015]], "door");
  }
  BUSHES.forEach(([x, z, wide, tall], seed) => mesh.lump([x, groundAt(x, z) - 0.25, z], wide, tall, 6, seed + 3, { top: "leaf-under", under: "brush" }));
  return mesh;
}

function farModel(): IdentityMesh {
  const mesh = rock(new IdentityMesh(), FAR_RINGS, 12);
  towerFar(mesh);
  houseFar(mesh, KEEPER_SHAPE);
  for (const shed of SHEDS) houseFar(mesh, shedShape(shed));
  for (const [x, z, wide, tall] of BUSHES) mesh.spike([x, groundAt(x, z) - 0.25, z], [x, groundAt(x, z) + tall, z], wide, "leaf-under");
  return mesh;
}

function build(): RoadsideModel {
  return identityModel(nearModel(), farModel(), SWAP_M, REACH_M);
}

export const LAGSKAR: LighthouseArt = { name: "Lågskär", build, lampM: LAGSKAR_LAMP_M, lanternM: LANTERN.roofRadius };

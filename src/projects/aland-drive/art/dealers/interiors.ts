import type { DealerInterior, Lamp, Solid, Spot, Window } from "../../dealership/interior";
import { BRANDS, type Brand } from "./brands";
import { barrel, carLift, chair, coffeeTable, lightHalo, planter, salesDesk, sofa, turntableDeck, tyre, tyreRack, workbench } from "./kit";
import { Shell, type Finish, type Paint, type V3 } from "./shell";
import { SELLER_MAKERS } from "./stock";
import { USED_HALL } from "./exteriors";

/*
 * Inside the three dealerships that are rooms, as the walk-in system reads them (`dealership/interior.ts`): the room's
 * still art and the data round it, in the room's own metres on its exterior's axes, the street side +z. Each room is
 * its building's inside, wall for wall, so its windows are where the exterior has its glass and the island is seen
 * through them; nothing is painted past a window or an open door. Each is lit as its kind would be: the garage by
 * workshop tubes, the town dealer by an even, bright ceiling, the premium showroom by warm spots on its three cars.
 * Nothing imports this file but the dynamic import in `index.ts`, so a room stays out of the first download.
 */

export const INTERIOR_IDS = ["village-garage", "town-dealer", "premium-showroom", "used-lot"] as const;
export type InteriorId = (typeof INTERIOR_IDS)[number];

/** An opening in a wall: from `a0` to `a1` along it, `y0` to `y1` up it. */
interface Hole {
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

/**
 * A wall's inner face from `a0` to `a1` along it and up to `top` (a number, or a function of the place along it for a
 * sloped top), with its openings left open: what's past them is the island. `at` turns a place along the wall and up it
 * into the room.
 */
function wall(s: Shell, at: (along: number, up: number) => V3, a0: number, a1: number, top: number | ((along: number) => number), holes: readonly Hole[], paint: Paint, finish: Finish = {}) {
  const topAt = (along: number) => (typeof top === "number" ? top : top(along));
  const face = (b0: number, b1: number, y0: number, y1: number | null) => {
    if (b1 - b0 < 1e-3) return;
    const [high0, high1] = y1 === null ? [topAt(b0), topAt(b1)] : [y1, y1];
    if (high0 - y0 < 1e-3 && high1 - y0 < 1e-3) return;
    s.quad(at(b0, y0), at(b1, y0), at(b1, high1), at(b0, high0), paint, finish);
  };
  const sorted = [...holes].sort((first, second) => first.a0 - second.a0);
  let from = a0;
  for (const hole of sorted) {
    face(from, hole.a0, 0, null);
    face(hole.a0, hole.a1, 0, hole.y0);
    face(hole.a0, hole.a1, hole.y1, null);
    from = hole.a1;
  }
  face(from, a1, 0, null);
}

/** A pane in a wall, as four corners in order round it. */
const pane = (at: (along: number, up: number) => V3, { a0, a1, y0, y1 }: Hole): Window => ({ corners: [at(a0, y0), at(a1, y0), at(a1, y1), at(a0, y1)] });

const box = (x0: number, z0: number, x1: number, z1: number): Solid => ({ kind: "box", centre: [(x0 + x1) / 2, (z0 + z1) / 2], half: [(x1 - x0) / 2, (z1 - z0) / 2] });

/** A maker's panel on a wall facing +z at its origin: the badge over the name. */
function makerPanel(s: Shell, brand: Brand, wide: number, tall: number, finish: Finish = {}) {
  s.box([-wide / 2, 0, 0], [wide / 2, tall, 0.04], brand.colour, finish);
  s.within({ y: tall * 0.6, z: 0.06 }, () => s.logo(brand, tall * 0.25));
  s.within({ y: tall * 0.12, z: 0.06 }, () => s.text(brand.name, tall * 0.13, brand.ink));
}

/** A strip of tubes hung from `drop` below its chains, from one end to the other along x, shining by itself. */
function tubes(s: Shell, x0: number, x1: number, y: number, z: number, drop: number) {
  s.box([x0, y, z - 0.06], [x1, y + 0.05, z + 0.06], "dealer-steel-dark");
  s.box([x0 + 0.05, y - 0.04, z - 0.035], [x1 - 0.05, y, z + 0.035], "dealer-light-cool", { glow: 1 });
  for (const x of [x0 + 0.3, x1 - 0.3]) s.box([x - 0.008, y + 0.05, z - 0.008], [x + 0.008, y + 0.05 + drop, z + 0.008], "dealer-steel-dark");
}

/**
 * The village garage: Klippa's workshop, its five on the floor facing the bay doors, one of them up on the lift, and
 * in the bay at the west end a find from a barn under a tarp, waiting to be restored. Tubes hang under the trusses.
 */
function villageGarage(): DealerInterior {
  const s = new Shell();
  const brand = BRANDS.klippa;
  const [x0, x1, z0, z1, eave, ridge] = [-12.9, 8.9, -8.9, -0.1, 4.25, 6.25];
  const midZ = (z0 + z1) / 2;
  const roofAt = (z: number) => eave + (1 - Math.abs(z - midZ) / (midZ - z0)) * (ridge - eave);

  s.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], "dealer-concrete", { pattern: "speckle", gloss: 0.15 });
  for (const [from, to] of [[z1, midZ], [z0, midZ]] as const) s.quad([x0, roofAt(from), from], [x1, roofAt(from), from], [x1, ridge, to], [x0, ridge, to], "dealer-timber", { pattern: "boards", shade: 0.72 });

  // The walls, their windows and doors where the exterior has them.
  const front = (along: number, up: number): V3 => [along, up, z1];
  const back = (along: number, up: number): V3 => [along, up, z0];
  const west = (along: number, up: number): V3 => [x0, up, along];
  const east = (along: number, up: number): V3 => [x1, up, along];
  const openBay: Hole = { a0: -11, a1: -7.4, y0: 0, y1: 3.3 };
  const officeDoor: Hole = { a0: 2.95, a1: 3.85, y0: 0, y1: 2.05 };
  const officeWindow: Hole = { a0: 5.2, a1: 7.6, y0: 0.95, y1: 2.35 };
  const backWindows = [-10, -4.5, 1, 6.5].map((x): Hole => ({ a0: x - 0.7, a1: x + 0.7, y0: 2.05, y1: 2.95 }));
  const eastWindows = [-7.5, -1.5].map((z): Hole => ({ a0: z - 0.75, a1: z + 0.75, y0: 1.35, y1: 2.45 }));
  const shade = { pattern: "boards", shade: [0.78, 0.78, 1, 1] } as const;
  wall(s, front, x0, x1, eave, [openBay, officeDoor, officeWindow], "wall-trim", shade);
  wall(s, back, x0, x1, eave, backWindows, "wall-trim", shade);
  wall(s, west, z0, z1, eave, [], "wall-trim", shade);
  wall(s, east, z0, z1, eave, eastWindows, "wall-trim", shade);
  for (const x of [x0, x1]) s.tri([x, eave, z1], [x, eave, z0], [x, ridge, midZ], "wall-trim", { pattern: "boards" });
  const windows = [pane(front, officeDoor), pane(front, officeWindow), ...backWindows.map((hole) => pane(back, hole)), ...eastWindows.map((hole) => pane(east, hole))];
  for (const { corners } of windows) {
    const [a, , c] = corners;
    const [lowX, highX, lowZ, highZ] = [Math.min(a[0], c[0]), Math.max(a[0], c[0]), Math.min(a[2], c[2]), Math.max(a[2], c[2])];
    const inward = a[2] === z1 ? -0.06 : a[2] === z0 ? 0.06 : a[0] === x1 ? -0.06 : 0.06;
    const [y0, y1] = [a[1], c[1]];
    // A trim along the pane's sill and head, its face to the wall left off, since it lies on the wall.
    const against = a[2] === z1 ? "south" : a[2] === z0 ? "north" : a[0] === x1 ? "east" : "west";
    if (lowZ === highZ) for (const y of [y0, y1]) s.box([lowX - 0.06, y - 0.03, Math.min(lowZ, lowZ + inward)], [highX + 0.06, y + 0.03, Math.max(lowZ, lowZ + inward)], "wall-trim", {}, ["bottom", against]);
    else for (const y of [y0, y1]) s.box([Math.min(lowX, lowX + inward), y - 0.03, lowZ - 0.06], [Math.max(lowX, lowX + inward), y + 0.03, highZ + 0.06], "wall-trim", {}, ["bottom", against]);
  }
  // The closed bay's roller door, seen from inside; the open bay's frame.
  s.box([-6.4, 0, z1 - 0.05], [-2.8, 3.3, z1 - 0.02], "dealer-panel", { pattern: "ribs", shade: [0.82, 0.82, 0.95, 0.95] });
  for (const x of [openBay.a0, openBay.a1]) s.box([x - 0.08, 0, z1 - 0.12], [x + 0.08, 3.4, z1], "dealer-steel-dark", {}, ["bottom", "south"]);
  s.box([openBay.a0 - 0.08, 3.3, z1 - 0.14], [openBay.a1 + 0.08, 3.42, z1], "dealer-steel-dark", {}, ["south"]);

  // Trusses, and the tubes hung under them.
  for (let x = -12; x <= 8; x += 3) {
    s.bar([x, eave, z0], [x, eave, z1], 0.14, "dealer-timber-dark");
    s.bar([x, eave, z0], [x, ridge - 0.12, midZ], 0.14, "dealer-timber-dark");
    s.bar([x, eave, z1], [x, ridge - 0.12, midZ], 0.14, "dealer-timber-dark");
    s.bar([x, eave, midZ], [x, ridge - 0.12, midZ], 0.1, "dealer-timber-dark");
  }
  const tubeY = 3.85;
  const runs: [number, number, number][] = [[-12.4, -4.2, -6.2], [-4.2, 4.6, -6.2], [-12.4, -4.2, -2.8], [-4.2, 4.6, -2.8]];
  for (const [from, to, z] of runs) tubes(s, from, to, tubeY, z, eave - tubeY - 0.07);

  // The cars face the bays; the middle one is up on the lift.
  const lift: V3 = [-2, 1.6, -5];
  const floorSpots = [-8.1, -5.05, 1.05, 4.0];
  s.within({ x: lift[0], z: lift[2] }, () => carLift(s, lift[1]));
  const spots: Spot[] = [{ at: lift, yaw: Math.PI }, ...floorSpots.map((x): Spot => ({ at: [x, 0, -5.1], yaw: Math.PI }))];

  // The bay at the west end: a barn find under its tarp, its wheels showing, and the tyres along the wall.
  const find: V3 = [-10.9, 0, -4.6];
  s.within({ x: find[0], z: find[2] }, () => {
    s.box([-0.88, 0.32, -2.15], [0.88, 0.95, 2.15], "dealer-stone", { shade: [0.72, 0.72, 0.95, 0.95] }, []);
    s.box([-0.72, 0.95, -1.05], [0.72, 1.38, 0.95], "dealer-stone", { shade: 1.02 });
    for (const [x, z] of [[-0.8, -1.35], [0.8, -1.35], [-0.8, 1.4], [0.8, 1.4]]) s.within({ x, z, yaw: Math.PI / 2, pitch: Math.PI / 2 }, () => tyre(s, -0.1, 0.31, 0.2, 8));
  });
  s.within({ x: x0 + 0.38, z: -6.4, yaw: Math.PI / 2 }, () => tyreRack(s, 4));

  // The back wall: the bench, Klippa's sign over it, the barrels and the compressor.
  s.within({ x: -7.3, z: z0 + 0.45 }, () => workbench(s, 3.4));
  s.within({ x: -7.25, y: 2.1, z: z0 + 0.02 }, () => {
    s.box([-1.5, 0, 0], [1.5, 1.0, 0.04], brand.colour);
    s.within({ x: -1.0, y: 0.5, z: 0.06 }, () => s.logo(brand, 0.36));
    s.within({ x: 0.45, y: 0.32, z: 0.06 }, () => s.text(brand.name, 0.36, brand.ink));
  });
  s.within({ x: 2.4, z: z0 + 0.4 }, () => barrel(s, "dealer-klippa"));
  s.within({ x: 3.1, z: z0 + 0.4 }, () => barrel(s, "wall-plinth"));
  s.within({ x: -1.9, z: z0 + 0.35 }, () => {
    s.box([-0.3, 0, -0.2], [0.3, 0.8, 0.2], "wall-red", { pattern: "ribs" });
    s.lathe([[0.08, 0.8], [0.08, 1.05], [0, 1.06]], 5, "dealer-steel");
  });

  // The office behind a half wall, its desk, and a lamp over it.
  const officeX = 5.3;
  s.box([officeX - 0.08, 0, z0], [officeX + 0.08, 1.1, -2.3], "wall-trim", { pattern: "boards", shade: [0.8, 0.8, 1, 1] }, ["bottom", "north"]);
  for (let z = -8.4; z <= -2.4; z += 2) s.box([officeX - 0.04, 1.1, z - 0.04], [officeX + 0.04, 2.5, z + 0.04], "wall-trim");
  s.box([officeX - 0.05, 2.5, z0], [officeX + 0.05, 2.6, -2.3], "wall-trim", {}, ["north"]);
  s.within({ x: 7.3, z: -5.6, yaw: Math.PI / 2 }, () => salesDesk(s, "dealer-timber", "wall-trim", brand));
  s.within({ x: 7.1, y: eave, z: -5.6 }, () => {
    s.box([-0.012, -1.2, -0.012], [0.012, 0, 0.012], "dealer-rubber");
    s.lathe([[0.32, -1.42], [0.08, -1.2], [0, -1.17]], 8, "dealer-klippa");
    s.lathe([[0.3, -1.42], [0, -1.41]], 8, "dealer-light-warm", { glow: 1 });
  });

  const strip = (from: number, to: number, z: number): Lamp => ({ kind: "strip", from: [from, tubeY - 0.04, z], to: [to, tubeY - 0.04, z], paint: "dealer-light-cool", power: 0.75, reachM: 4.5 });
  return {
    name: "Klippa Bilverkstad",
    origin: [0, 0.05, 0],
    room: s.build(),
    turntables: [],
    stock: { makers: SELLER_MAKERS["village-garage"], from: ["dealer"] },
    spots,
    floor: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]],
    solids: [
      box(x0, -8.6, -9.9, -2.3),
      box(-9.1, z0, -5.5, z0 + 0.8),
      box(-2.3, z0, -1.5, z0 + 0.6),
      box(2.0, z0, 3.5, z0 + 0.8),
      { kind: "round", centre: [lift[0] - 1.62, lift[2]], radiusM: 0.3 },
      { kind: "round", centre: [lift[0] + 1.62, lift[2]], radiusM: 0.3 },
      box(officeX - 0.1, z0, officeX + 0.1, -2.3),
      box(6.0, -7.0, 8.6, -4.2),
    ],
    windows,
    viewFrom: [-2, 1.6, -1.2],
    light: { ambient: 0.32, ambientPaint: "dealer-light-cool", lamps: [...runs.map(([from, to, z]) => strip(from, to, z)), { kind: "point", at: [7.1, eave - 1.45, -5.6], paint: "dealer-light-warm", power: 0.7, reachM: 2.5 }], mirrors: ["dealer-concrete", "dealer-timber"] },
    door: { at: [3.4, -1.0], yaw: 0, reachM: 1.5 },
  };
}

/**
 * The town dealer, Norrvind: a bright retail floor behind the glass, the three makers it sells on the back wall, a car
 * turning in the middle, and the even light of a ceiling of panels.
 */
function townDealer(): DealerInterior {
  const s = new Shell();
  const brands = [BRANDS.vastan, BRANDS.odmark, BRANDS.norrsken];
  const [x0, x1, z0, z1, height] = [-16.9, 16.9, -12.9, -2.1, 5.4];

  s.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], "dealer-tile", { pattern: "tiles", gloss: 0.5 });
  s.quad([x0, height, z0], [x1, height, z0], [x1, height, z1], [x0, height, z1], "dealer-ceiling", { pattern: "seams" });

  const front = (along: number, up: number): V3 => [along, up, z1];
  const back = (along: number, up: number): V3 => [along, up, z0];
  const west = (along: number, up: number): V3 => [x0, up, along];
  const east = (along: number, up: number): V3 => [x1, up, along];
  const mullion = 25 / 8;
  const glass = Array.from({ length: 8 }, (_, index): Hole => ({ a0: -14 + index * mullion + 0.05, a1: -14 + (index + 1) * mullion - 0.05, y0: 0.05, y1: height - 0.05 }));
  const eastWindows = [-4, -7.5, -11].map((z): Hole => ({ a0: z - 1, a1: z + 1, y0: 2.6, y1: 3.8 }));
  wall(s, front, x0, x1, height, glass, "dealer-panel", { shade: [0.85, 0.85, 1, 1] });
  wall(s, back, x0, x1, height, [], "dealer-panel", { shade: [0.85, 0.85, 1, 1] });
  wall(s, west, z0, z1, height, [], "dealer-panel", { shade: [0.85, 0.85, 1, 1] });
  wall(s, east, z0, z1, height, eastWindows, "dealer-panel", { shade: [0.85, 0.85, 1, 1] });
  const windows = [...glass.map((hole) => pane(front, hole)), ...eastWindows.map((hole) => pane(east, hole))];
  for (let x = -14; x <= 11.01; x += mullion) s.box([x - 0.05, 0, z1 - 0.12], [x + 0.05, height, z1], "dealer-steel-dark", {}, ["bottom", "top", "south"]);
  s.box([-14, 2.71, z1 - 0.1], [11, 2.79, z1], "dealer-steel-dark", {}, ["south"]);
  for (const { a0, a1, y0, y1 } of eastWindows) for (const y of [y0, y1]) s.box([x1 - 0.06, y - 0.03, a0 - 0.05], [x1, y + 0.03, a1 + 0.05], "dealer-steel-dark", {}, ["east"]);
  // The sign tower stands into the room's front corner.
  s.box([11.6, 0, z1 - 1.1], [x1, height, z1], "dealer-house", { shade: [0.9, 0.9, 1, 1] }, ["bottom", "top", "south", "east"]);

  // The back wall: each maker's panel, and the service counter's door to the workshop behind.
  brands.forEach((brand, index) => s.within({ x: -9 + index * 9, y: 2.2, z: z0 + 0.02 }, () => makerPanel(s, brand, 4.2, 2.6, { glow: 0.15 })));
  s.within({ x: -14.5, z: z0 + 0.02 }, () => {
    s.box([-0.6, 0, 0], [0.6, 2.2, 0.06], "dealer-steel");
    s.box([-0.06, 1.0, 0.06], [0.06, 1.1, 0.12], "dealer-steel-dark", {}, ["bottom", "north"]);
  });

  // Desks either side at the back, a lounge corner, planters along the glass.
  for (const [x, brand] of [[-5, brands[0]], [5, brands[2]]] as const) s.within({ x, z: z0 + 1.2, yaw: Math.PI }, () => salesDesk(s, "wall-trim", "dealer-house", brand));
  s.within({ x: -15.4, z: -10.4, yaw: Math.PI / 2 }, () => sofa(s, 2.2, "dealer-fabric"));
  s.within({ x: -14.3, z: -10.4 }, () => coffeeTable(s));
  s.within({ x: 15.8, z: -12.3 }, () => planter(s, 1.6));

  // A car turning in the middle under a ring of light, and the ceiling's panels.
  const centre: V3 = [0, 0, -7.4];
  const radius = 3.1;
  s.within({ x: centre[0], y: 0.015, z: centre[2] }, () => s.lathe([[radius + 0.2, 0], [radius + 0.02, 0]], 40, "dealer-steel-dark"));
  s.within({ x: centre[0], y: height - 0.9, z: centre[2] }, () => lightHalo(s, 3.4, "dealer-light-cool", "dealer-steel-dark", 0.8));
  const rows = [-3.6, -6.3, -9.0, -11.7];
  for (const z of rows) for (const [from, to] of [[-16, -0.3], [0.3, 16]]) s.quad([from, height - 0.02, z - 0.3], [to, height - 0.02, z - 0.3], [to, height - 0.02, z + 0.3], [from, height - 0.02, z + 0.3], "dealer-light-cool", { glow: 1 });
  const deck = new Shell();
  turntableDeck(deck, radius, 0.08, "dealer-steel-dark", "dealer-steel", "dealer-light-cool");

  const spots: Spot[] = [
    { at: [centre[0], 0.092, centre[2]], yaw: 0.6, turntable: 0 },
    { at: [-7.7, 0, -5.2], yaw: 0.35 },
    { at: [7.7, 0, -5.2], yaw: -0.35 },
    { at: [-12.9, 0, -5.6], yaw: 0.5 },
    { at: [12.9, 0, -6.6], yaw: -0.5 },
    { at: [-10.6, 0, -10.9], yaw: Math.PI / 2 },
    { at: [10.6, 0, -10.9], yaw: -Math.PI / 2 },
  ];
  const strip = (from: number, to: number, z: number): Lamp => ({ kind: "strip", from: [from, height - 0.05, z], to: [to, height - 0.05, z], paint: "dealer-light-cool", power: 0.42, reachM: 5.5 });
  return {
    name: "Norrvind Bilar",
    origin: [0, 0.05, 0],
    room: s.build(),
    turntables: [{ soup: deck.build(), centre, turnSeconds: 32 }],
    stock: { makers: SELLER_MAKERS["town-dealer"], from: ["dealer"] },
    spots,
    floor: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]],
    solids: [box(11.6, z1 - 1.1, x1, z1), box(-6.2, z0, -3.8, z0 + 2.3), box(3.8, z0, 6.2, z0 + 2.3), box(-16.9, -11.6, -13.8, -9.2), box(15.0, -12.6, 16.6, -12.0)],
    windows,
    viewFrom: [-1.5, 1.6, -3.2],
    light: { ambient: 0.5, ambientPaint: "dealer-light-cool", lamps: rows.flatMap((z) => [strip(-16, -0.3, z), strip(0.3, 16, z)]), mirrors: ["dealer-tile", "dealer-ceiling"] },
    door: { at: [-3, -3.2], yaw: 0, reachM: 1.5 },
  };
}

/**
 * The premium showroom: Tärna and Aurelle in a pavilion of glass to the sea, the finest car turning in the middle and
 * one each side on a stone plinth, each under a warm spot; its floor is the deck's, 0.4 m above the exterior's origin.
 */
function premiumShowroom(): DealerInterior {
  const s = new Shell();
  const [tarna, aurelle] = [BRANDS.tarna, BRANDS.aurelle];
  const floorY = 0.4;
  const [x0, x1, z0, z1] = [-13.9, 13.9, -7.9, 7.9];
  // The roof's underside, as the exterior has it, a few centimetres lower, in the room's own heights.
  const ceilingAt = (z: number) => 3.9 + ((9.8 - z) / (9.8 + 11)) * 2.4 - floorY - 0.05;

  s.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], "dealer-polish", { gloss: 0.6 });
  s.quad([x0, ceilingAt(z0), z0], [x1, ceilingAt(z0), z0], [x1, ceilingAt(z1), z1], [x0, ceilingAt(z1), z1], "dealer-timber", { pattern: "boards", shade: 0.8 });

  const front = (along: number, up: number): V3 => [along, up, z1];
  const sea = (along: number, up: number): V3 => [along, up, z0];
  const west = (along: number, up: number): V3 => [x0, up, along];
  const east = (along: number, up: number): V3 => [x1, up, along];
  const door: Hole = { a0: -2.15, a1: 2.15, y0: 0, y1: ceilingAt(z1) - 0.2 };
  wall(s, front, x0, x1, ceilingAt(z1), [door], "dealer-timber-dark", { pattern: "boards", shade: [0.8, 0.8, 1, 1] });
  const seaBays = Array.from({ length: 8 }, (_, index) => -14 + index * 3.5);
  const seaGlass = seaBays.map((x): Hole => ({ a0: Math.max(x, x0) + 0.05, a1: Math.min(x + 3.5, x1) - 0.05, y0: 0, y1: ceilingAt(z0) - 0.05 }));
  wall(s, sea, x0, x1, ceilingAt(z0), seaGlass, "dealer-rubber");
  const endBays = [2, -0.5, -3, -5.5, z0];
  const endGlass = endBays.slice(0, -1).map((z, index): Hole => ({ a0: endBays[index + 1] + 0.05, a1: z - 0.05, y0: 0, y1: 0 }));
  const endGlassTo = (hole: Hole) => ({ ...hole, y1: Math.min(ceilingAt(hole.a0), ceilingAt(hole.a1)) - 0.05 });
  for (const [side, x] of [[west, x0], [east, x1]] as const) {
    wall(s, side, z0, z1, ceilingAt, endGlass.map(endGlassTo), "dealer-timber-dark", { pattern: "boards", shade: [0.8, 0.8, 1, 1] });
    for (const z of endBays) s.box([x + (x < 0 ? 0 : -0.1), 0, z - 0.04], [x + (x < 0 ? 0.1 : 0), ceilingAt(z), z + 0.04], "dealer-rubber", {}, ["bottom", "top", x < 0 ? "west" : "east"]);
  }
  for (const x of [...seaBays.slice(1), x1]) s.box([x - 0.04, 0, z0], [x + 0.04, ceilingAt(z0), z0 + 0.1], "dealer-rubber", {}, ["bottom", "top", "north"]);
  // The panes under each window's sloping top are drawn level at its lower corner: the triangle over it is the wall's.
  const windows = [pane(front, door), ...seaGlass.map((hole) => pane(sea, hole)), ...endGlass.map(endGlassTo).flatMap((hole) => [pane(west, hole), pane(east, hole)])];

  // The two makers' walls either side of the door, inside.
  for (const [brand, x] of [[tarna, -8], [aurelle, 8]] as const) {
    s.within({ x, y: 0.9, z: z1 - 0.02, yaw: Math.PI }, () => {
      s.box([-4.2, 0, 0], [4.2, 2.2, 0.04], brand === tarna ? "dealer-tarna-ink" : "dealer-aurelle");
      s.within({ x: -2.6, y: 1.1, z: 0.06 }, () => s.logo(brand, 0.75, { glow: 0.9 }));
      s.within({ x: 1.0, y: 0.8, z: 0.06 }, () => s.text(brand.name, 0.55, brand === tarna ? "dealer-tarna" : "dealer-aurelle-ink", { glow: 0.95 }));
    });
  }

  // The finest car turning in the middle under a ring of light; the others on stone plinths.
  const centre: V3 = [0, 0, -0.6];
  const radius = 3.1;
  s.within({ x: centre[0], y: 0.015, z: centre[2] }, () => s.lathe([[radius + 0.25, 0], [radius + 0.02, 0]], 40, "dealer-tarna"));
  s.within({ x: centre[0], y: ceilingAt(centre[2]) - 1.2, z: centre[2] }, () => lightHalo(s, 3.3, "dealer-light-warm", "dealer-tarna-ink", 1.1));
  const plinthTop = 0.15;
  const plinths: [number, number, number][] = [[-8.6, -2.6, 0.6], [8.6, -2.6, -0.6]];
  for (const [x, z] of plinths) s.within({ x, z }, () => s.lathe([[3.15, 0], [3.15, plinthTop - 0.03], [3.1, plinthTop], [0, plinthTop]], 28, "dealer-stone", { gloss: 0.2 }));
  const deck = new Shell();
  turntableDeck(deck, radius, 0.08, "dealer-polish", "dealer-tarna-ink", "dealer-tarna");

  // A reception desk and a lounge by the street wall.
  s.within({ x: -9.5, z: 5.3, yaw: Math.PI }, () => salesDesk(s, "dealer-stone", "dealer-timber-dark", tarna));
  s.within({ x: 9.5, z: 5.6 }, () => {
    s.within({ z: 0.6, yaw: Math.PI }, () => sofa(s, 2.4, "dealer-leather"));
    s.within({ z: -0.5 }, () => coffeeTable(s));
    for (const x of [-1.6, 1.6]) s.within({ x, z: -1.2, yaw: x < 0 ? -0.6 : 0.6 }, () => chair(s, "dealer-leather"));
  });

  const spotAt = (x: number, z: number, coneDeg: number, power: number): Lamp => ({ kind: "spot", at: [x, ceilingAt(z) - 0.1, z], aim: [x, 0, z], coneDeg, paint: "dealer-light-warm", power, reachM: 6 });
  for (const [x, z] of [[0, -0.6], ...plinths.map(([px, pz]) => [px, pz])]) {
    s.within({ x, y: ceilingAt(z) - 0.02, z }, () => s.lathe([[0.22, 0], [0.22, -0.1], [0.16, -0.12], [0, -0.12]], 10, "dealer-tarna-ink"));
    s.within({ x, y: ceilingAt(z) - 0.155, z }, () => s.lathe([[0.15, 0], [0, 0]], 10, "dealer-light-warm", { glow: 1 }));
  }
  const downlights: [number, number][] = [[-9.5, 4.6], [0, 5.2], [9.5, 4.6], [-12, -6], [12, -6]];
  for (const [x, z] of downlights) s.within({ x, y: ceilingAt(z) - 0.03, z }, () => s.lathe([[0.1, 0], [0, 0]], 8, "dealer-light-warm", { glow: 1 }));

  return {
    name: "Tärna & Aurelle",
    origin: [0, floorY, 0],
    room: s.build(),
    turntables: [{ soup: deck.build(), centre, turnSeconds: 36 }],
    stock: { makers: SELLER_MAKERS["premium-showroom"], from: ["dealer"] },
    spots: [{ at: [centre[0], 0.092, centre[2]], yaw: 0.5, turntable: 0 }, ...plinths.map(([x, z, yaw]): Spot => ({ at: [x, plinthTop, z], yaw }))],
    floor: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]],
    solids: [box(-10.8, 4.3, -8.2, 6.4), box(7.0, 3.8, 12.0, 6.5)],
    windows,
    viewFrom: [0, 1.6, -3.5],
    light: {
      ambient: 0.24,
      ambientPaint: "dealer-light-warm",
      lamps: [spotAt(0, -0.6, 56, 2.2), ...plinths.map(([x, z]) => spotAt(x, z, 50, 1.8)), ...downlights.map(([x, z]): Lamp => ({ kind: "point", at: [x, ceilingAt(z) - 0.3, z], paint: "dealer-light-warm", power: 0.35, reachM: 3.5 }))],
      mirrors: ["dealer-polish", "dealer-timber"],
    },
    door: { at: [0, 7.0], yaw: 0, reachM: 1.5 },
  };
}

/**
 * The used lot's hall: a plain floor under fluorescent tubes, a row of traded-in cars facing the glass, the lot's rows
 * through it, and an office by the door. Until the economy decides what the lot buys and sells, it holds the slowest
 * of the dealers' cars, the A7 hatches and the B3 and B4 four-by-fours.
 */
function usedHall(): DealerInterior {
  const s = new Shell();
  const { door, office, glass } = USED_HALL;
  const [x0, x1, z0, z1, height] = [USED_HALL.x0 + 0.1, USED_HALL.x1 - 0.1, USED_HALL.z0 + 0.1, USED_HALL.z1 - 0.1, USED_HALL.eave - 0.2];

  s.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], "dealer-concrete", { gloss: 0.3, shade: 1.05 });
  s.quad([x0, height, z0], [x1, height, z0], [x1, height, z1], [x0, height, z1], "dealer-steel", { pattern: "ribs", shade: 0.85 });
  const front = (along: number, up: number): V3 => [along, up, z1];
  const back = (along: number, up: number): V3 => [along, up, z0];
  const west = (along: number, up: number): V3 => [x0, up, along];
  const east = (along: number, up: number): V3 => [x1, up, along];
  const doorHole: Hole = { a0: door.x0, a1: door.x1, y0: 0, y1: door.top };
  const officeHole: Hole = { a0: office.x0, a1: office.x1, y0: office.sill, y1: office.top };
  const glassHoles = Array.from({ length: glass.bays }, (_, bay): Hole => ({ a0: glass.x0 + bay * glass.wide + 0.05, a1: glass.x0 + (bay + 1) * glass.wide - 0.05, y0: glass.sill, y1: glass.top }));
  const wallFinish = { pattern: "ribs", shade: [0.8, 0.8, 1, 1] } as const;
  wall(s, front, x0, x1, height, [doorHole, officeHole, ...glassHoles], "dealer-panel", wallFinish);
  wall(s, back, x0, x1, height, [], "dealer-panel", wallFinish);
  wall(s, west, z0, z1, height, [], "dealer-panel", wallFinish);
  wall(s, east, z0, z1, height, [], "dealer-panel", wallFinish);
  for (let bay = 0; bay <= glass.bays; bay++) {
    const x = glass.x0 + bay * glass.wide;
    s.box([x - 0.05, glass.sill, z1 - 0.08], [x + 0.05, glass.top, z1], "dealer-steel-dark", {}, ["bottom", "top", "south"]);
  }
  for (const y of [glass.sill, glass.top]) s.box([glass.x0, y - 0.04, z1 - 0.1], [glass.x0 + glass.bays * glass.wide, y + 0.04, z1], "dealer-steel-dark", {}, ["south"]);
  const windows = [pane(front, doorHole), pane(front, officeHole), ...glassHoles.map((hole) => pane(front, hole))];

  // Tubes in three rows, the lot's name over the back wall.
  const tubeY = height - 0.5;
  const rows = [-3.3, -6.3, -9.2];
  for (const z of rows) for (const [from, to] of [[-11.4, 1.95], [2.05, 15.4]]) tubes(s, from, to, tubeY, z, height - tubeY - 0.07);
  s.within({ x: 5, y: 2.6, z: z0 + 0.02 }, () => {
    s.box([-3.2, 0, 0], [3.2, 0.9, 0.04], "dealer-hazard");
    s.within({ y: 0.25, z: 0.06 }, () => s.text("BEGAGNADE BILAR", 0.4, "dealer-klippa-ink"));
  });

  // The office: a half wall, a desk, a sofa for the wait.
  const officeX = -6.2;
  s.box([officeX - 0.08, 0, z0], [officeX + 0.08, 1.1, -4.2], "dealer-panel", { shade: [0.8, 0.8, 1, 1] }, ["bottom", "north"]);
  s.within({ x: -9.2, z: -7.4, yaw: Math.PI / 2 }, () => salesDesk(s, "dealer-timber", "dealer-hazard", BRANDS.klippa));
  s.within({ x: -11.2, z: -4.2, yaw: Math.PI / 2 }, () => sofa(s, 2, "dealer-fabric"));

  // The cars face the glass.
  const spots = [-4.0, -1.05, 1.9, 4.85, 7.8, 10.75, 13.7].map((x): Spot => ({ at: [x, 0, -6.6], yaw: Math.PI }));
  const strip = (from: number, to: number, z: number): Lamp => ({ kind: "strip", from: [from, tubeY - 0.04, z], to: [to, tubeY - 0.04, z], paint: "dealer-light-cool", power: 0.55, reachM: 4.5 });
  return {
    name: "Begagnade bilar",
    origin: [0, 0.03, 0],
    room: s.build(),
    turntables: [],
    stock: { tiers: ["A7", "B3", "B4"], from: ["dealer"] },
    spots,
    floor: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]],
    solids: [box(officeX - 0.1, z0, officeX + 0.1, -4.2), box(-10.6, -8.6, -7.6, -6.2), box(-11.9, -5.3, -10.7, -3.1)],
    windows,
    viewFrom: [3, 1.6, -2.6],
    light: { ambient: 0.4, ambientPaint: "dealer-light-cool", lamps: rows.flatMap((z) => [strip(-11.4, 2, z), strip(2, 15.4, z)]), mirrors: ["dealer-concrete", "dealer-steel"] },
    door: { at: [(door.x0 + door.x1) / 2, -2.4], yaw: 0, reachM: 1.5 },
  };
}

export function buildInterior(id: InteriorId): DealerInterior {
  switch (id) {
    case "village-garage":
      return villageGarage();
    case "town-dealer":
      return townDealer();
    case "premium-showroom":
      return premiumShowroom();
    case "used-lot":
      return usedHall();
  }
}

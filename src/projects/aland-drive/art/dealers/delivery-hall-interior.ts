import type { DealerInterior, Lamp, Solid, Spot } from "../../dealership/interior";
import { DOOR_HALF_M, DRIVE_OUT, HALL, importMark, MULLION_EVERY_M, TRANSOM_M, WALL_M } from "./delivery-hall-plan";
import { GLYPH_HEIGHT, lineWidth } from "./glyphs";
import { LISTINGS } from "./listings";
import { chair, coffeeTable, lightHalo, planter, turntableDeck } from "./kit";
import { Shell, type Paint, type V3 } from "./shell";

/*
 * Inside the delivery hall: one tall white room, its whole front glass to the harbour, a polished pale floor, and the
 * eight cars that come by ship each under its own light, the finest turning on a deck in the middle under a ring of
 * light, straight ahead of the door. Rows of light panels across the ceiling keep it bright and even, as a maker's
 * handover hall is. The back wall is pale oak to head height with the importer's name over it; the south end carries
 * the ferries' routes that brought the cars; a lounge and the handover desk are in the south corner; and the cars
 * leave by the glazed door in the north end, towards the terminal.
 *
 * In the room's own metres: the exterior's axes, its floor at y 0, which stands on the building's plinth.
 */

const [X0, X1, Z0] = [HALL.x0 + WALL_M, HALL.x1 - WALL_M, HALL.z0 + WALL_M];
/** The front glass's plane, a hair inside the building's. */
const GLASS_Z = HALL.z1 - 0.02;
const CEILING = 8.2;
const GLASS_TOP = 7.9;
const PROUD_M = 0.02;
const TURNTABLE = { centre: [0, 0, -10] as V3, radiusM: 3.4, deckY: 0.12, turnSeconds: 40 };

/** The spots, finest first: the turntable, then the front row nearest the door, then the back row. Every nose looks towards the glass and the middle. */
const STANDS: readonly (readonly [x: number, z: number, yaw: number])[] = [
  [8.5, -5.5, Math.PI - 0.5],
  [-8.5, -5.5, Math.PI + 0.5],
  [15, -5.5, Math.PI - 0.5],
  [-15, -5.5, Math.PI + 0.5],
  [8.5, -15, Math.PI - 0.5],
  [-15, -15, Math.PI + 0.5],
  [-8.5, -15, Math.PI + 0.5],
];
const STRIPS_Z = [-2.6, -7.6, -12.4, -17.4] as const;
const LOUNGE = { x: 15, z: -16.6 } as const;
const DESK = { x: 17.6, z: -10.8 } as const;

function shell(s: Shell): void {
  const top = CEILING;
  s.quad([X0, 0, GLASS_Z], [X1, 0, GLASS_Z], [X1, 0, Z0], [X0, 0, Z0], "dealer-tile", { gloss: 0.55, pattern: "tiles", shade: 0.8 });
  s.quad([X0, top, Z0], [X1, top, Z0], [X1, top, GLASS_Z], [X0, top, GLASS_Z], "dealer-white", { shade: 0.97 });
  s.quad([X0, 0, Z0], [X1, 0, Z0], [X1, top, Z0], [X0, top, Z0], "dealer-white");
  s.quad([X1, 0, Z0], [X1, 0, GLASS_Z], [X1, top, GLASS_Z], [X1, top, Z0], "dealer-white");
  // The north end, round the drive-out door, and the door's reveals through the wall.
  const [d0, d1, tall] = [DRIVE_OUT.z0, DRIVE_OUT.z1, DRIVE_OUT.tall];
  const pane = HALL.x0 + PROUD_M;
  s.quad([X0, 0, d0], [X0, 0, Z0], [X0, top, Z0], [X0, top, d0], "dealer-white");
  s.quad([X0, 0, GLASS_Z], [X0, 0, d1], [X0, top, d1], [X0, top, GLASS_Z], "dealer-white");
  s.quad([X0, tall, d1], [X0, tall, d0], [X0, top, d0], [X0, top, d1], "dealer-white");
  s.quad([pane, 0, d0], [X0, 0, d0], [X0, tall, d0], [pane, tall, d0], "dealer-white", { shade: 0.9 });
  s.quad([X0, 0, d1], [pane, 0, d1], [pane, tall, d1], [X0, tall, d1], "dealer-white", { shade: 0.9 });
  s.quad([pane, tall, d0], [X0, tall, d0], [X0, tall, d1], [pane, tall, d1], "dealer-white", { shade: 0.85 });
  for (let y = 0.92; y < tall - 0.2; y += 0.92) s.box([pane + PROUD_M, y - 0.03, d0], [pane + 0.07, y + 0.03, d1], "dealer-steel", {}, ["west", "north", "south"]);
  // A dark skirting along the plain walls.
  s.quad([X1 - PROUD_M, 0, Z0], [X1 - PROUD_M, 0, GLASS_Z - 0.2], [X1 - PROUD_M, 0.09, GLASS_Z - 0.2], [X1 - PROUD_M, 0.09, Z0], "dealer-steel-dark");
  for (const [from, to] of [[Z0, d0], [d1, GLASS_Z - 0.2]] as const) s.quad([X0 + PROUD_M, 0, to], [X0 + PROUD_M, 0, from], [X0 + PROUD_M, 0.09, from], [X0 + PROUD_M, 0.09, to], "dealer-steel-dark");
}

/** The front: its sill, head, glazing bars and the door's frame, all standing just inside the glass. */
function glazing(s: Shell): void {
  const face = GLASS_Z - PROUD_M;
  s.quad([X0, GLASS_TOP, face], [X1, GLASS_TOP, face], [X1, CEILING, face], [X0, CEILING, face], "dealer-white");
  s.box([X0, 0, face - 0.18], [X1, 0.1, face], "dealer-steel-dark", {}, ["bottom", "south", "east", "west"]);
  const bar = (low: V3, high: V3) => s.box(low, high, "dealer-steel-dark", {}, ["bottom", "top", "south"]);
  for (let x = HALL.x0 + MULLION_EVERY_M; x < HALL.x1 - 0.01; x += MULLION_EVERY_M) bar([x - 0.06, 0.1, face - 0.14], [x + 0.06, GLASS_TOP, face]);
  s.box([X0, TRANSOM_M - 0.05, face - 0.11], [X1, TRANSOM_M + 0.05, face], "dealer-steel-dark", {}, ["south", "east", "west"]);
  for (const x of [-DOOR_HALF_M, DOOR_HALF_M]) bar([x - 0.06, 0.1, face - 0.13], [x + 0.06, 2.6, face]);
  s.box([-DOOR_HALF_M - 0.06, 2.6, face - 0.13], [DOOR_HALF_M + 0.06, 2.72, face], "dealer-steel-dark", {}, ["south"]);
  for (const x of [-0.25, 0.25]) s.box([x - 0.02, 0.9, face - 0.19], [x + 0.02, 1.9, face - 0.15], "dealer-steel");
}

/** The back wall: oak to head height, the importer's name over it with a line of light, the door to the offices. */
function backWall(s: Shell): void {
  const z = Z0 + PROUD_M;
  s.quad([X0, 0, z], [X1, 0, z], [X1, 2.7, z], [X0, 2.7, z], "dealer-timber", { pattern: "boards" });
  s.box([-12.6, 0, z], [-11.4, 2.4, z + PROUD_M], "dealer-steel-dark", {}, ["bottom", "north"]);
  const [name, tall] = ["LEVERANSHALL", 0.9];
  const wide = (lineWidth(name) * tall) / GLYPH_HEIGHT;
  s.within({ x: 0.8, y: 4.4, z }, () => s.text(name, tall, "dealer-import"));
  s.within({ x: 0.8 - wide / 2 - 1.1, y: 4.85, z }, () => importMark(s, 0.75));
  s.quad([-14, 3.86, z], [14, 3.86, z], [14, 3.92, z], [-14, 3.92, z], "dealer-light-cool", { glow: 1 });
}

/** The south end: the sea routes the cars came by, Stockholm to Mariehamn and on to Åbo and Helsingfors. */
function routeWall(s: Shell): void {
  s.within({ x: X1 - PROUD_M, z: -10, yaw: -Math.PI / 2 }, () => {
    s.quad([-6.5, 2.9, 0], [6.5, 2.9, 0], [6.5, 6.6, 0], [-6.5, 6.6, 0], "dealer-import");
    const ports: readonly (readonly [name: string, x: number, y: number, size: number])[] = [
      ["STOCKHOLM", -4.8, 4.2, 0.09],
      ["MARIEHAMN", -0.6, 4.9, 0.16],
      ["ÅBO", 3.4, 5.9, 0.09],
      ["HELSINGFORS", 4.6, 3.8, 0.09],
    ];
    const at = (index: number): V3 => [ports[index][1], ports[index][2], PROUD_M];
    s.within({ z: PROUD_M }, () => {
      for (const [from, to] of [[0, 1], [1, 2], [1, 3]] as const) s.bar(at(from), at(to), 0.04, "dealer-white", { glow: 0.6 });
      for (const [name, x, y, size] of ports) {
        s.within({ x, y, pitch: Math.PI / 2 }, () => s.lathe([[size, 0.02], [0, 0.02]], 10, "dealer-white", { glow: 1 }));
        s.within({ x, y: y - 0.48, z: 0.02 }, () => s.text(name, 0.22, "dealer-white", { glow: 0.6 }));
      }
    });
  });
}

/** A long low sofa, its back to -z: its seat and back run between the arms, their hidden ends left off. */
function lowSofa(s: Shell, wide: number, paint: Paint): void {
  const half = wide / 2;
  s.box([-half, 0, -0.36], [half, 0.14, 0.36], "dealer-steel-dark", {}, ["bottom", "top", "east", "west"]);
  s.box([-half, 0.14, -0.4], [half, 0.44, 0.4], paint, {}, ["bottom", "east", "west"]);
  s.box([-half, 0.44, -0.42], [half, 0.86, -0.2], paint, { shade: 0.9 }, ["bottom", "east", "west"]);
  for (const x of [-half - 0.12, half]) s.box([x, 0, -0.42], [x + 0.12, 0.62, 0.42], paint, { shade: 0.86 });
}

/** Where a car is handed over: the lounge and its rug, the desk by the south wall. */
function lounge(s: Shell): void {
  s.quad([LOUNGE.x - 3, 0.012, -13.6], [LOUNGE.x + 3, 0.012, -13.6], [LOUNGE.x + 3, 0.012, Z0 + 0.5], [LOUNGE.x - 3, 0.012, Z0 + 0.5], "dealer-fabric");
  s.within({ x: LOUNGE.x, z: LOUNGE.z - 2 }, () => lowSofa(s, 3, "dealer-leather"));
  s.within({ x: LOUNGE.x, z: LOUNGE.z }, () => coffeeTable(s));
  for (const dx of [-1.2, 1.2]) s.within({ x: LOUNGE.x + dx, z: LOUNGE.z + 2, yaw: Math.PI }, () => chair(s, "dealer-fabric"));
  s.within({ x: DESK.x, z: DESK.z, yaw: -Math.PI / 2 }, () => {
    s.box([-1.1, 0, -0.1], [1.1, 0.72, 0.4], "dealer-white", { shade: [0.86, 0.86, 1, 1] });
    s.box([-1.16, 0.72, -0.46], [1.16, 0.77, 0.46], "dealer-timber", { gloss: 0.3 });
    s.box([-0.3, 0.8, -0.23], [0.3, 1.14, -0.2], "dealer-rubber");
    s.quad([0.28, 0.82, -0.235], [-0.28, 0.82, -0.235], [-0.28, 1.12, -0.235], [0.28, 1.12, -0.235], "dealer-light-cool", { glow: 0.8 });
    s.box([-0.06, 0.77, -0.25], [0.06, 0.8, -0.18], "dealer-rubber");
    s.within({ y: 0.4, z: 0.4 + PROUD_M }, () => importMark(s, 0.2));
    s.within({ z: -0.95 }, () => chair(s, "dealer-rubber"));
    for (const x of [-0.6, 0.6]) s.within({ x, z: 1, yaw: Math.PI }, () => chair(s, "dealer-fabric"));
  });
  for (const x of [X0 + 1.3, X1 - 1.3]) s.within({ x, z: GLASS_Z - 1.2 }, () => planter(s, 1.8));
}

/** The light fittings: the panels across the ceiling, a downlight over each car, the ring over the turntable. */
function fittings(s: Shell): void {
  const y = CEILING - PROUD_M;
  for (const z of STRIPS_Z) s.quad([-18, y, z - 0.25], [18, y, z - 0.25], [18, y, z + 0.25], [-18, y, z + 0.25], "dealer-light-cool", { glow: 1 });
  for (const [x, z] of STANDS) {
    s.within({ x, z }, () => {
      s.lathe([[0.55, CEILING - 0.01], [0.43, CEILING - 0.01]], 16, "dealer-steel");
      s.lathe([[0.43, y - 0.005], [0, y - 0.005]], 16, "dealer-light-cool", { glow: 1 });
    });
  }
  const [cx, , cz] = TURNTABLE.centre;
  s.within({ x: cx, y: 6.4, z: cz }, () => lightHalo(s, 4.3, "dealer-light-cool", "dealer-white"));
  s.within({ x: cx, z: cz }, () => s.lathe([[TURNTABLE.radiusM + 0.22, 0.012], [TURNTABLE.radiusM + 0.02, 0.012]], 40, "dealer-steel-dark"));
}

const solids: readonly Solid[] = [
  { kind: "box", centre: [LOUNGE.x, LOUNGE.z - 2], half: [1.7, 0.45] },
  { kind: "round", centre: [LOUNGE.x, LOUNGE.z], radiusM: 0.45 },
  ...[-1.2, 1.2].map((dx): Solid => ({ kind: "round", centre: [LOUNGE.x + dx, LOUNGE.z + 2], radiusM: 0.3 })),
  { kind: "box", centre: [DESK.x + 0.4, DESK.z], half: [0.9, 1.2] },
  ...[-0.6, 0.6].map((dz): Solid => ({ kind: "round", centre: [DESK.x - 1, DESK.z + dz], radiusM: 0.3 })),
  ...[X0 + 1.3, X1 - 1.3].map((x): Solid => ({ kind: "box", centre: [x, GLASS_Z - 1.2], half: [0.9, 0.3] })),
];

function lamps(): Lamp[] {
  const spots = [[TURNTABLE.centre[0], TURNTABLE.centre[2]] as const, ...STANDS].map(([x, z]): Lamp => ({ kind: "spot", at: [x, CEILING - 0.05, z], aim: [0, -1, 0], coneDeg: 40, paint: "dealer-light-cool", power: 1.2, reachM: 9 }));
  const strips = STRIPS_Z.map((z): Lamp => ({ kind: "strip", from: [-18, CEILING - 0.05, z], to: [18, CEILING - 0.05, z], paint: "dealer-light-cool", power: 0.5, reachM: 6 }));
  return [...spots, ...strips];
}

export function deliveryHallInterior(): DealerInterior {
  const s = new Shell();
  shell(s);
  glazing(s);
  backWall(s);
  routeWall(s);
  lounge(s);
  fittings(s);
  const deck = new Shell();
  turntableDeck(deck, TURNTABLE.radiusM, TURNTABLE.deckY, "dealer-tile", "dealer-steel", "dealer-white");
  const [cx, , cz] = TURNTABLE.centre;
  const spots: Spot[] = [{ at: [cx, TURNTABLE.deckY, cz], yaw: Math.PI - 0.6, turntable: 0 }, ...STANDS.map(([x, z, yaw]): Spot => ({ at: [x, 0, z], yaw }))];
  const [d0, d1, tall] = [DRIVE_OUT.z0, DRIVE_OUT.z1, DRIVE_OUT.tall];
  const pane = HALL.x0 + PROUD_M;
  return {
    ...LISTINGS["delivery-hall"],
    origin: [0, HALL.floorY, 0],
    room: s.build(),
    turntables: [{ soup: deck.build(), centre: TURNTABLE.centre, turnSeconds: TURNTABLE.turnSeconds }],
    spots,
    floor: [[X0 + 0.1, Z0 + 0.1], [X1 - 0.1, Z0 + 0.1], [X1 - 0.1, GLASS_Z - 0.25], [X0 + 0.1, GLASS_Z - 0.25]],
    solids,
    windows: [
      { corners: [[X0, 0.1, GLASS_Z], [X1, 0.1, GLASS_Z], [X1, GLASS_TOP, GLASS_Z], [X0, GLASS_TOP, GLASS_Z]] },
      { corners: [[pane, 0, d0], [pane, 0, d1], [pane, tall, d1], [pane, tall, d0]] },
    ],
    viewFrom: [0, 1.65, -0.6],
    light: { ambient: 0.75, ambientPaint: "dealer-light-cool", lamps: lamps(), mirrors: ["dealer-tile", "dealer-light-cool"] },
    door: { at: [0, -1.4], yaw: 0, reachM: 1.6 },
  };
}

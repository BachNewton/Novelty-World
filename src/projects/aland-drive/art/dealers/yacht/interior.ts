import type { DealerInterior, Lamp, Solid, Spot, Window } from "../../../dealership/interior";
import { Shell, type Finish, type Paint, type V3 } from "../shell";
import { CAR_DECK, CAR_DECK_GLASS, CAR_DECK_PANES, SHELL_DOOR } from "./plan";

/*
 * The yacht's car deck: a private showroom low in the hull for the five fastest cars, the A1 hypercars and the A2
 * supercars. A teak floor and panelling, a cream lining and ceiling, polished steel, and the long panes in the hull
 * either side, the sea to the west and the town to the east. The finest car turns on a turntable forward, under its own
 * spots; the other four stand two a side, angled in towards it; aft by the door, a sofa and a low table.
 *
 * Lit as a yacht is in the evening: soft, warm and low, from spots over each car and coves along the ceiling, never
 * the sun. Room metres: the floor at y 0, the hull's frame otherwise (bow +x, the quay side +z), the floor `origin`
 * above the water.
 */

const HEIGHT = CAR_DECK.ceilingY - CAR_DECK.floorY;
const [AFT, FORE, WALL] = [CAR_DECK.aftX, CAR_DECK.foreX, CAR_DECK.liningZ];
const [GLASS_LOW, GLASS_HIGH] = [CAR_DECK_GLASS.lowY - CAR_DECK.floorY, CAR_DECK_GLASS.highY - CAR_DECK.floorY];
/** Where a pane sits, out in the hull past the lining: the window's reveal is the lining's depth. */
const PANE_Z = 5.98;
const DADO = GLASS_LOW;

const TABLE = { x: 2.6, radiusM: 3, deckY: 0.07, turnSeconds: 48 } as const;
/** The four cars a side stand at, two a side, their noses turned in towards the turntable. */
const SIDE_SPOTS: readonly (readonly [x: number, z: number])[] = [[-6.3, 3.05], [-6.3, -3.05], [-13.4, 3.05], [-13.4, -3.05]];
const TOE_IN = 0.25;
/** Facing forward, along +x. */
const FORWARD = -Math.PI / 2;

const SOFA = { from: AFT + 0.2, to: AFT + 1.1, nearZ: -2.3, farZ: -WALL + 0.15 } as const;
const COFFEE = { x: -19.4, z: -3.8, radiusM: 0.55 } as const;
const DOOR = { x: (SHELL_DOOR.fromX + SHELL_DOOR.toX) / 2, z: 4.75 } as const;

const TEAK: Finish = { pattern: "boards", gloss: 0.3 };
const LAMP_GLOW: Finish = { glow: 1 };
/** Under each cove, its strip's light. */
const COVE_Y = HEIGHT - 0.235;

/** A face across the room's x and z at a height, facing up or, `down`, facing down. */
function level(s: Shell, x0: number, x1: number, z0: number, z1: number, y: number, paint: Paint, finish: Finish = {}, down = false) {
  const corners: V3[] = [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]];
  if (down) corners.reverse();
  s.quad(corners[0], corners[1], corners[2], corners[3], paint, finish);
}

/** One side's lining, at `side` (1 the quay's), with its panes cut out and a reveal round each. */
function lining(s: Shell, side: number) {
  const z = side * WALL;
  const wall = (x0: number, x1: number, y0: number, y1: number, paint: Paint, finish: Finish = {}) => s.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], paint, finish);
  const reveal = (a: V3, b: V3, paint: Paint, finish: Finish = {}) => s.quad(a, b, [b[0], b[1], side * PANE_Z], [a[0], a[1], side * PANE_Z], paint, finish);
  wall(AFT, FORE, 0, DADO, "dealer-timber", TEAK);
  wall(AFT, FORE, GLASS_HIGH, HEIGHT, "dealer-panel");
  const ends = [AFT, ...CAR_DECK_PANES.flat(), FORE];
  for (let at = 0; at + 1 < ends.length; at += 2) {
    const [x0, x1] = [ends[at], ends[at + 1]];
    if (side > 0 && at === 0) {
      // The shell door aft, closed from inside: a teak frame round a panel of frosted glass.
      wall(x0, SHELL_DOOR.fromX, DADO, GLASS_HIGH, "dealer-panel");
      wall(SHELL_DOOR.toX, x1, DADO, GLASS_HIGH, "dealer-panel");
      const [d0, d1] = [SHELL_DOOR.fromX, SHELL_DOOR.toX];
      s.within({ z: z - side * 0.02 }, () => {
        s.box([d0, 0, -0.03], [d1, 2.3, 0.03], "dealer-timber-dark", { pattern: "boards" });
        s.quad([d0 + 0.25, 0.3, -side * 0.045], [d1 - 0.25, 0.3, -side * 0.045], [d1 - 0.25, 2.05, -side * 0.045], [d0 + 0.25, 2.05, -side * 0.045], "dealer-glass", { gloss: 0.4 });
      });
      continue;
    }
    wall(x0, x1, DADO, GLASS_HIGH, "dealer-panel");
  }
  for (const [x0, x1] of CAR_DECK_PANES) {
    reveal([x0, GLASS_LOW, z], [x1, GLASS_LOW, z], "dealer-timber", { gloss: 0.4 });
    reveal([x1, GLASS_HIGH, z], [x0, GLASS_HIGH, z], "dealer-panel");
    reveal([x0, GLASS_HIGH, z], [x0, GLASS_LOW, z], "dealer-steel", { gloss: 0.5 });
    reveal([x1, GLASS_LOW, z], [x1, GLASS_HIGH, z], "dealer-steel", { gloss: 0.5 });
  }
  // The cove along the ceiling, its warm strip a hair below.
  s.within({ z: z - side * 0.35 }, () => {
    // Open where it meets the lining, the bulkheads and the deckhead, so no face lies on theirs.
    s.box([AFT, HEIGHT - 0.22, -0.35], [FORE, HEIGHT, 0.35], "dealer-panel", {}, ["top", "east", "west", side > 0 ? "south" : "north"]);
    const strip = -side * 0.3;
    s.quad([AFT + 0.3, COVE_Y, strip - 0.03], [FORE - 0.3, COVE_Y, strip - 0.03], [FORE - 0.3, COVE_Y, strip + 0.03], [AFT + 0.3, COVE_Y, strip + 0.03], "dealer-light-warm", LAMP_GLOW);
  });
}

/** The yacht's name in brass on the aft bulkhead, facing forward. */
function bulkheads(s: Shell) {
  s.quad([AFT, 0, WALL], [AFT, 0, -WALL], [AFT, HEIGHT, -WALL], [AFT, HEIGHT, WALL], "dealer-timber-dark", { pattern: "boards" });
  s.within({ x: AFT + 0.02, y: 1.55, z: 1.4, yaw: Math.PI / 2 }, () => s.text("SOLVIND", 0.3, "dealer-tarna", { gloss: 0.6 }));
  // Forward, teak panels round a lit niche.
  s.quad([FORE, 0, -WALL], [FORE, 0, WALL], [FORE, HEIGHT, WALL], [FORE, HEIGHT, -WALL], "dealer-timber", TEAK);
  s.within({ x: FORE - 0.02 }, () => {
    s.quad([0, 0.5, -2.2], [0, 0.5, 2.2], [0, 2.25, 2.2], [0, 2.25, -2.2], "dealer-timber-dark", {});
    s.quad([-0.015, 2.19, -2.1], [-0.015, 2.19, 2.1], [-0.015, 2.22, 2.1], [-0.015, 2.22, -2.1], "dealer-light-warm", LAMP_GLOW);
  });
}

function floorAndCeiling(s: Shell) {
  level(s, AFT, FORE, -WALL, WALL, 0, "dealer-timber", TEAK);
  level(s, AFT, FORE, -WALL + 0.7, WALL - 0.7, HEIGHT - 0.22, "dealer-ceiling", {}, true);
  // A ring of light in the floor round the turntable, and a polished steel strip down the middle aisle.
  s.within({ x: TABLE.x, y: 0.004 }, () => {
    const sides = 48;
    for (let side = 0; side < sides; side++) {
      const [a, b] = [(side * 2 * Math.PI) / sides, ((side + 1) * 2 * Math.PI) / sides];
      const ring = (radius: number, angle: number): V3 => [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
      s.quad(ring(TABLE.radiusM + 0.06, a), ring(TABLE.radiusM + 0.06, b), ring(TABLE.radiusM + 0.14, b), ring(TABLE.radiusM + 0.14, a), "dealer-light-warm", LAMP_GLOW);
    }
  });
  level(s, AFT + 2.6, TABLE.x - TABLE.radiusM - 0.4, -0.06, 0.06, 0.004, "dealer-steel", { gloss: 0.7 });
}

/** The lamps' faces in the ceiling: a round glowing lens for each spot. */
function lampFaces(s: Shell, lamps: readonly Lamp[]) {
  for (const lamp of lamps) {
    if (lamp.kind !== "spot") continue;
    s.within({ x: lamp.at[0], y: HEIGHT - 0.225, z: lamp.at[2] }, () => {
      s.lathe([[0.11, 0], [0.11, -0.03], [0.16, -0.03], [0.16, 0]], 12, "dealer-steel", { gloss: 0.5 });
      s.lathe([[0, -0.015], [0.11, -0.015]], 12, "dealer-light-warm", LAMP_GLOW);
    });
  }
}

function lounge(s: Shell) {
  const { from, to, nearZ, farZ } = SOFA;
  s.box([from, 0, farZ], [to, 0.42, nearZ], "dealer-stone", { shade: [0.8, 0.8, 1, 1] });
  s.box([from, 0.42, farZ], [from + 0.28, 0.85, nearZ], "dealer-stone", {});
  s.box([from, 0.42, nearZ - 0.24], [to, 0.66, nearZ], "dealer-stone", {});
  s.within({ x: COFFEE.x, z: COFFEE.z }, () => {
    s.lathe([[0.22, 0], [0.12, 0.08], [0.1, 0.34], [0, 0.34]], 12, "dealer-steel", { gloss: 0.6 });
    s.lathe([[COFFEE.radiusM, 0.34], [COFFEE.radiusM, 0.4], [0, 0.4]], 24, "dealer-timber", { gloss: 0.5 });
  });
  // A rug under them, a hair above the teak.
  level(s, AFT + 0.1, AFT + 4.4, -WALL + 0.25, -1.9, 0.006, "dealer-fabric", {});
}

function turntable() {
  const s = new Shell();
  s.lathe([[TABLE.radiusM, 0], [TABLE.radiusM, TABLE.deckY], [0, TABLE.deckY]], 48, "dealer-polish", { gloss: 0.65 });
  s.within({ y: TABLE.deckY + 0.003 }, () => s.lathe([[TABLE.radiusM - 0.18, 0], [TABLE.radiusM - 0.12, 0]], 48, "dealer-steel", { gloss: 0.6 }));
  return s.build();
}

const LAMP_Y = HEIGHT - 0.26;
const warmSpot = (x: number, z: number, power: number): Lamp => ({ kind: "spot", at: [x, LAMP_Y, z], aim: [x, 0, z], coneDeg: 34, paint: "dealer-light-warm", power, reachM: 3.2 });

const SPOTS: readonly Spot[] = [
  { at: [TABLE.x, TABLE.deckY, 0], yaw: FORWARD, turntable: 0 },
  ...SIDE_SPOTS.map(([x, z]): Spot => ({ at: [x, 0, z], yaw: FORWARD + Math.sign(z) * TOE_IN })),
];

const LAMPS: readonly Lamp[] = [
  ...SPOTS.map(({ at }) => warmSpot(at[0], at[2], at[2] === 0 ? 1.7 : 1.4)),
  ...[-1, 1].map((side): Lamp => ({ kind: "spot", at: [TABLE.x, LAMP_Y, side * 3.6], aim: [TABLE.x, 0.6, 0], coneDeg: 28, paint: "dealer-light-warm", power: 1.1, reachM: 3.4 })),
  ...[-1, 1].map((side): Lamp => ({ kind: "strip", from: [AFT + 0.3, COVE_Y - 0.02, side * (WALL - 0.65)], to: [FORE - 0.3, COVE_Y - 0.02, side * (WALL - 0.65)], paint: "dealer-light-warm", power: 0.35, reachM: 1.6 })),
  { kind: "strip", from: [FORE - 0.1, 2.2, -2.1], to: [FORE - 0.1, 2.2, 2.1], paint: "dealer-light-warm", power: 0.45, reachM: 1.4 },
  { kind: "point", at: [COFFEE.x, 2.2, COFFEE.z], paint: "dealer-light-warm", power: 0.8, reachM: 2.6 },
  { kind: "spot", at: [AFT + 1.6, LAMP_Y, 1.4], aim: [AFT, 1.6, 1.4], coneDeg: 40, paint: "dealer-light-warm", power: 0.9, reachM: 2.4 },
];

const WINDOWS: readonly Window[] = [-1, 1].flatMap((side) =>
  CAR_DECK_PANES.map(([x0, x1]): Window => {
    const z = side * PANE_Z;
    return { corners: [[x0, GLASS_LOW, z], [x1, GLASS_LOW, z], [x1, GLASS_HIGH, z], [x0, GLASS_HIGH, z]] };
  }),
);

const SOLIDS: readonly Solid[] = [
  { kind: "box", centre: [(SOFA.from + SOFA.to) / 2, (SOFA.nearZ + SOFA.farZ) / 2], half: [(SOFA.to - SOFA.from) / 2, (SOFA.nearZ - SOFA.farZ) / 2] },
  { kind: "round", centre: [COFFEE.x, COFFEE.z], radiusM: COFFEE.radiusM },
];

export function yachtInterior(): DealerInterior {
  const s = new Shell();
  floorAndCeiling(s);
  for (const side of [-1, 1]) lining(s, side);
  bulkheads(s);
  lounge(s);
  lampFaces(s, LAMPS);
  const middle = (CAR_DECK_PANES[0][0] + CAR_DECK_PANES[CAR_DECK_PANES.length - 1][1]) / 2;
  return {
    name: "Solvind",
    origin: [0, CAR_DECK.floorY, 0],
    room: s.build(),
    turntables: [{ soup: turntable(), centre: [TABLE.x, 0, 0], turnSeconds: TABLE.turnSeconds }],
    stock: { from: ["harbour"], tiers: ["A1", "A2"] },
    spots: SPOTS,
    floor: [[AFT + 0.1, -WALL + 0.1], [FORE - 0.1, -WALL + 0.1], [FORE - 0.1, WALL - 0.1], [AFT + 0.1, WALL - 0.1]],
    solids: SOLIDS,
    windows: WINDOWS,
    viewFrom: [middle, 1.62, 0],
    light: { ambient: 0.22, ambientPaint: "dealer-light-warm", lamps: LAMPS, mirrors: ["dealer-timber", "dealer-ceiling"] },
    door: { at: [DOOR.x, DOOR.z], yaw: -Math.PI / 4, reachM: 1.5 },
  };
}

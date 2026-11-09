import { BACK, DOOR_HALF_M, DRIVE_OUT, HALL, importMark, MULLION_EVERY_M, PODIUM, RAMP, STAIR, TRANSOM_M } from "./delivery-hall-plan";
import type { Exterior } from "./exteriors";
import { Shell, type Finish, type Paint, type Soup, type V3 } from "./shell";

/*
 * The importer's delivery hall at Västerhamn, where the cars that come by ship are handed over: a maker's handover
 * centre rather than a shed. A white box under one thin flat roof, its whole front glass to the harbour and the
 * ferries' berths, the roof's deep overhang soffited in pale timber with the importer's name along a navy fascia, and a
 * low dark-boarded back of house behind. It stands on a granite podium on the sand terrace above the terminal's road:
 * the podium's top is the terrace before the glass, a broad stair runs down to the road, and the cars leave by a glazed
 * door in the north end and a ramp down towards the terminal. The glass shows the bright hall inside, its light band
 * and the cars standing in it, and at night it glows.
 *
 * Its far version is the same building without what a few hundred metres hides: no glazing bars, doors' bars, mats or
 * lamps, the stair a slope and the birches cruder.
 */

type Detail = "near" | "far";

const WALL_FOOT: readonly number[] = [0.84, 0.84, 1, 1];
const ROOF = { x0: -21.5, x1: 21.5, z0: -21, z1: 3.2, top: 9.6 } as const;
const PROUD_M = 0.02;
const PARAPET = { tall: 0.9, thick: 0.3 } as const;
const CHEEK_M = 0.35;
const STEPS = Math.ceil((HALL.floorY - STAIR.foot) / STAIR.rise);
const STAIR_END = PODIUM.z1 + STEPS * STAIR.run;
const TOTEM = { x: -5.6, z: 6.6 } as const;

/** What the front glass shows, floor to roof: the floor, the white hall, its band of light, its ceiling. */
const GLASS_BANDS: readonly (readonly [y0: number, y1: number, paint: Paint, finish: Finish])[] = [
  [HALL.floorY, 0.55, "dealer-tile", { glow: 0.3, gloss: 0.6 }],
  [0.55, 6.9, "dealer-white", { glow: 0.3, gloss: 0.85, shade: [0.7, 0.7, 0.86, 0.86] }],
  [6.9, 7.5, "dealer-light-cool", { glow: 0.8, gloss: 0.4 }],
  [7.5, HALL.roofY, "dealer-white", { glow: 0.25, gloss: 0.8, shade: 0.9 }],
];

/** The cars inside, as the front glass shows them: where each stands along the hall, and how far its outline's reached. */
const SEEN_CARS: readonly (readonly [x: number, long: number])[] = [[-15, 3.9], [-8.5, 4.1], [0, 4.6], [8.5, 4.1], [15, 3.9]];

/** A car's side as a dark shape on the glass, its wheels on the floor. */
function carShadow(s: Shell, long: number): void {
  const half = long / 2;
  const outline: (readonly [number, number])[] = [[-half, 0.12], [half, 0.12], [half, 0.62], [half * 0.82, 0.78], [half * 0.38, 0.86], [half * 0.12, 1.26], [-half * 0.42, 1.28], [-half * 0.7, 0.86], [-half, 0.74]];
  s.outline(outline, 1, 0, "dealer-steel-dark", { gloss: 0.85, glow: 0.1, shade: 1.25 });
}

function frontGlass(s: Shell): void {
  const z = HALL.z1;
  for (const [y0, y1, paint, finish] of GLASS_BANDS) s.quad([HALL.x0, y0, z], [HALL.x1, y0, z], [HALL.x1, y1, z], [HALL.x0, y1, z], paint, finish);
  for (const [x, long] of SEEN_CARS) s.within({ x, y: HALL.floorY, z: z + PROUD_M }, () => carShadow(s, long));
}

/** The glazed door the cars leave by, in the hall's north end. */
function driveOutGlass(s: Shell): void {
  const x = HALL.x0 - PROUD_M;
  const [z0, z1, top] = [DRIVE_OUT.z0, DRIVE_OUT.z1, HALL.floorY + DRIVE_OUT.tall];
  s.quad([x, HALL.floorY, z0], [x, HALL.floorY, z1], [x, top, z1], [x, top, z0], "dealer-white", { glow: 0.3, gloss: 0.85, shade: [0.7, 0.7, 0.86, 0.86] });
}

/** The podium: granite sides, the terrace's paving on top, a parapet along its front either side of the stair. */
function podium(s: Shell, detail: Detail): void {
  const { x0, x1, z0, z1, sink } = PODIUM;
  const top = HALL.floorY;
  s.box([x0, sink, z0], [x1, top, z1], "dealer-stone", { shade: [0.8, 0.8, 0.95, 0.95] }, ["bottom", "top"]);
  s.quad([x0, top, z1], [x1, top, z1], [x1, top, z0], [x0, top, z0], "dealer-tile", detail === "near" ? { pattern: "tiles" } : {});
  for (const [from, to] of [[x0, -STAIR.half - CHEEK_M], [STAIR.half + CHEEK_M, x1]] as const) {
    s.box([from, top, z1 - PARAPET.thick], [to, top + PARAPET.tall, z1], "dealer-stone", {}, ["bottom"]);
  }
  // The terrace's lane from the drive-out door to the ramp.
  s.quad([x0, top + PROUD_M, DRIVE_OUT.z1 + 0.5], [HALL.x0, top + PROUD_M, DRIVE_OUT.z1 + 0.5], [HALL.x0, top + PROUD_M, DRIVE_OUT.z0 - 0.5], [x0, top + PROUD_M, DRIVE_OUT.z0 - 0.5], "dealer-asphalt", detail === "near" ? { pattern: "speckle" } : {});
}

/** The stair down to the road between two granite cheeks: steps near, a slope of the same outline far. */
function stair(s: Shell, detail: Detail): void {
  const { half, rise, run, foot } = STAIR;
  const { sink, z1 } = PODIUM;
  const top = HALL.floorY;
  if (detail === "near") {
    for (let step = 0; step < STEPS; step++) {
      const tread = top - (step + 1) * rise;
      s.box([-half, sink, z1 + step * run], [half, tread, z1 + (step + 1) * run], "dealer-stone", { shade: 0.95 }, ["bottom", "north", "east", "west"]);
    }
  } else {
    s.quad([-half, top - rise, z1], [-half, foot, STAIR_END], [half, foot, STAIR_END], [half, top - rise, z1], "dealer-stone", { shade: 0.95 });
    s.quad([-half, foot, STAIR_END], [-half, sink, STAIR_END], [half, sink, STAIR_END], [half, foot, STAIR_END], "dealer-stone", { shade: 0.95 });
  }
  for (const side of [-1, 1]) {
    const [inner, outer] = [side * half, side * (half + CHEEK_M)];
    const [high, low] = [top + CHEEK_M, foot + CHEEK_M];
    const wall = (x: number) => s.quad([x, sink, z1], [x, sink, STAIR_END], [x, low, STAIR_END], [x, high, z1], "dealer-stone");
    wall(inner);
    wall(outer);
    s.quad([inner, high, z1], [inner, low, STAIR_END], [outer, low, STAIR_END], [outer, high, z1], "dealer-stone", { shade: 1.05 });
    s.quad([inner, sink, STAIR_END], [outer, sink, STAIR_END], [outer, low, STAIR_END], [inner, low, STAIR_END], "dealer-stone");
    s.quad([outer, top, z1], [inner, top, z1], [inner, high, z1], [outer, high, z1], "dealer-stone");
  }
}

/** The ramp from the drive-out door down off the podium's north end, between granite sides. */
function ramp(s: Shell): void {
  const [from, to] = [PODIUM.x0, PODIUM.x0 - RAMP.long];
  const [z0, z1] = [DRIVE_OUT.z0 - 0.5, DRIVE_OUT.z1 + 0.5];
  const [high, low, sink] = [HALL.floorY, HALL.floorY - RAMP.drop, PODIUM.sink];
  s.quad([from, high, z1], [from, high, z0], [to, low, z0], [to, low, z1], "dealer-asphalt", { pattern: "speckle" });
  for (const z of [z0, z1]) s.quad([from, sink, z], [to, sink, z], [to, low, z], [from, high, z], "dealer-stone", { shade: 0.9 });
  s.quad([to, sink, z0], [to, sink, z1], [to, low, z1], [to, low, z0], "dealer-stone", { shade: 0.9 });
}

/** The hall's walls, the back of house and the roof: the building's shape, the same at every distance. */
function volumes(s: Shell): void {
  s.box([HALL.x0, HALL.floorY, HALL.z0], [HALL.x1, HALL.roofY, HALL.z1], "dealer-white", { pattern: "seams", shade: WALL_FOOT }, ["bottom", "top", "south"]);
  s.box([BACK.x0, HALL.floorY, BACK.z0], [BACK.x1, BACK.top, HALL.z0], "dealer-timber-dark", { pattern: "boards", shade: WALL_FOOT }, ["bottom", "south", "top"]);
  s.quad([BACK.x0, BACK.top, HALL.z0], [BACK.x0, BACK.top, BACK.z0], [BACK.x1, BACK.top, BACK.z0], [BACK.x1, BACK.top, HALL.z0], "dealer-steel-dark");

  const { x0, x1, z0, z1, top } = ROOF;
  const low = HALL.roofY;
  s.quad([x0, top, z1], [x1, top, z1], [x1, top, z0], [x0, top, z0], "dealer-concrete");
  s.quad([x0, low, z0], [x1, low, z0], [x1, low, z1], [x0, low, z1], "dealer-timber", { pattern: "boards", shade: 0.86 });
  s.quad([x0, low, z1], [x1, low, z1], [x1, top, z1], [x0, top, z1], "dealer-import");
  s.quad([x1, low, z0], [x0, low, z0], [x0, top, z0], [x1, top, z0], "dealer-import");
  s.quad([x1, low, z1], [x1, low, z0], [x1, top, z0], [x1, top, z1], "dealer-import");
  s.quad([x0, low, z0], [x0, low, z1], [x0, top, z1], [x0, top, z0], "dealer-import");
}

/** The name along the front fascia and the mark at either end, lit from behind after dark. */
function names(s: Shell): void {
  const y = (HALL.roofY + ROOF.top) / 2;
  s.within({ x: 10.5, y: y - 0.26, z: ROOF.z1 + PROUD_M }, () => s.text("LEVERANSHALL", 0.52, "dealer-white", { glow: 0.9 }));
  s.within({ x: 3.9, y, z: ROOF.z1 + PROUD_M }, () => importMark(s, 0.38, 0.9));
  for (const [x, yaw] of [[ROOF.x1 + PROUD_M, Math.PI / 2], [ROOF.x0 - PROUD_M, -Math.PI / 2]] as const) s.within({ x, y, z: -9, yaw }, () => importMark(s, 0.38, 0.9));
}

function birch(s: Shell, detail: Detail): void {
  const sides = detail === "near" ? 7 : 4;
  s.box([-0.09, 0, -0.09], [0.09, 3.2, 0.09], "wall-trim", {}, ["bottom", "top"]);
  const crown: (readonly [number, number])[] = detail === "near" ? [[0.2, 2.4], [1.25, 3.3], [1.45, 4.6], [1, 5.8], [0, 6.5]] : [[0.2, 2.4], [1.4, 3.6], [1.1, 5.6], [0, 6.5]];
  s.lathe(crown, sides, "tree-birch", { pattern: detail === "near" ? "speckle" : "plain", shade: 0.92 });
}

/** A slim navy sign at the head of the stair, the mark at its top on both faces. */
function totem(s: Shell, detail: Detail): void {
  s.box([-0.7, 0, -0.15], [0.7, 5, 0.15], "dealer-import", { shade: [0.9, 0.9, 1, 1] });
  if (detail === "far") return;
  for (const yaw of [0, Math.PI]) {
    s.within({ y: 4.1, yaw }, () => s.within({ z: 0.15 + PROUD_M }, () => importMark(s, 0.5, 0.9)));
    s.within({ y: 3.1, yaw }, () => s.within({ z: 0.15 + PROUD_M }, () => s.text("IMPORT", 0.22, "dealer-white", { glow: 0.9 })));
  }
}

/** What only the near version has: the glazing's bars, the doors, the soffit's lamps, the mat and the parapet's lamps. */
function nearDetail(s: Shell): void {
  const bar = (low: V3, high: V3) => s.box(low, high, "dealer-steel-dark", {}, ["bottom", "top", "north"]);
  for (let x = HALL.x0; x <= HALL.x1 + 0.01; x += MULLION_EVERY_M) bar([x - 0.06, HALL.floorY, HALL.z1 + PROUD_M], [x + 0.06, HALL.roofY, HALL.z1 + 0.16]);
  s.box([HALL.x0, HALL.floorY + TRANSOM_M - 0.05, HALL.z1 + PROUD_M], [HALL.x1, HALL.floorY + TRANSOM_M + 0.05, HALL.z1 + 0.13], "dealer-steel-dark", {}, ["north"]);
  // The people's door: a pair of glass leaves in a frame, the meeting stile the mullion at x 0.
  const doorTop = HALL.floorY + 2.6;
  for (const x of [-DOOR_HALF_M, DOOR_HALF_M]) bar([x - 0.06, HALL.floorY, HALL.z1 + PROUD_M], [x + 0.06, doorTop, HALL.z1 + 0.15]);
  s.box([-DOOR_HALF_M - 0.06, doorTop, HALL.z1 + PROUD_M], [DOOR_HALF_M + 0.06, doorTop + 0.12, HALL.z1 + 0.15], "dealer-steel-dark", {}, ["north"]);
  for (const x of [-0.25, 0.25]) s.box([x - 0.02, HALL.floorY + 0.9, HALL.z1 + 0.17], [x + 0.02, HALL.floorY + 1.9, HALL.z1 + 0.21], "dealer-steel");

  // The drive-out door: its frame and the sections' joints.
  const x = HALL.x0;
  const [z0, z1, top] = [DRIVE_OUT.z0, DRIVE_OUT.z1, HALL.floorY + DRIVE_OUT.tall];
  for (const z of [z0, z1]) s.box([x - 0.16, HALL.floorY, z - 0.1], [x - PROUD_M, top + 0.12, z + 0.1], "dealer-steel-dark", {}, ["bottom", "east"]);
  s.box([x - 0.16, top, z0 + 0.1], [x - PROUD_M, top + 0.12, z1 - 0.1], "dealer-steel-dark", {}, ["east"]);
  for (let y = HALL.floorY + 0.92; y < top - 0.2; y += 0.92) s.box([x - 0.09, y - 0.03, z0 + 0.1], [x - PROUD_M, y + 0.03, z1 - 0.1], "dealer-steel", {}, ["east"]);

  // Lamps in the soffit over the walk along the glass, and along the parapet's inner face.
  for (let lamp = HALL.x0 + 2; lamp < HALL.x1; lamp += MULLION_EVERY_M) {
    const y = HALL.roofY - PROUD_M;
    s.quad([lamp - 0.22, y, 1.5], [lamp + 0.22, y, 1.5], [lamp + 0.22, y, 1.94], [lamp - 0.22, y, 1.94], "dealer-light-cool", { glow: 1 });
  }
  const inner = PODIUM.z1 - PARAPET.thick - PROUD_M;
  for (let lamp = PODIUM.x0 + 2; lamp < PODIUM.x1 - 1; lamp += 4) {
    if (Math.abs(lamp) < STAIR.half + CHEEK_M + 0.5) continue;
    const y = HALL.floorY + 0.35;
    s.quad([lamp + 0.25, y, inner], [lamp - 0.25, y, inner], [lamp - 0.25, y + 0.08, inner], [lamp + 0.25, y + 0.08, inner], "dealer-light-cool", { glow: 1 });
  }
  s.quad([-1.8, HALL.floorY + 0.015, 2.4], [1.8, HALL.floorY + 0.015, 2.4], [1.8, HALL.floorY + 0.015, 0.3], [-1.8, HALL.floorY + 0.015, 0.3], "dealer-rubber");
}

function hall(detail: Detail): Soup {
  const s = new Shell();
  podium(s, detail);
  stair(s, detail);
  ramp(s);
  volumes(s);
  frontGlass(s);
  driveOutGlass(s);
  names(s);
  const birches: readonly V3[] = [[-22.8, 0, 4.4], [-22.8, 0, -3], [-22.8, 0, -18.5], [-13, 0, 5.2], [13, 0, 5.2]];
  for (const [x, , z] of birches) s.within({ x, y: HALL.floorY, z }, () => birch(s, detail));
  s.within({ x: TOTEM.x, y: HALL.floorY, z: TOTEM.z }, () => totem(s, detail));
  if (detail === "near") nearDetail(s);
  return s.build();
}

export function deliveryHall(): Exterior {
  return {
    id: "delivery-hall",
    soup: hall("near"),
    far: hall("far"),
    slots: [],
    plotHalf: [-(PODIUM.x0 - RAMP.long), -PODIUM.z0],
    walls: [
      [PODIUM.x0, PODIUM.z0, PODIUM.x1, PODIUM.z1],
      [-STAIR.half - CHEEK_M, PODIUM.z1, STAIR.half + CHEEK_M, STAIR_END],
      [PODIUM.x0 - RAMP.long, DRIVE_OUT.z0 - 0.5, PODIUM.x0, DRIVE_OUT.z1 + 0.5],
    ],
    entrance: { at: [0, STAIR.foot, STAIR_END + 2.5], radiusM: 4 },
  };
}

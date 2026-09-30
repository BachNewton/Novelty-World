import { TUNING } from "../tuning";
import {
  GROUND_DROP,
  ROAD_LEFT,
  ROAD_RIGHT,
  VERGE,
  box,
  boxArea,
  sideX,
  type Area,
  type WorldBox,
} from "./geometry";
import type { WorldPaint } from "./paints";

// The two structures spanning the road: the overpass the frog starts on, and
// the finish gantry it ends on. Both are decks the frog can stand on, high
// enough that the tallest vehicle, lifted off the road by its planned ground
// clearance, drives clearly underneath, on pillars that stay outside the
// traffic lanes and the verges.

export const DECK_TOP = 5;
const DECK_THICKNESS = 0.45;
export const DECK_UNDERSIDE = DECK_TOP - DECK_THICKNESS;
// How far the vehicles are planned to ride above the road.
export const PLANNED_VEHICLE_LIFT = 0.25;
// The tallest vehicle, lifted, and the least room left above it.
export const VEHICLE_TOP = TUNING.wallRows + PLANNED_VEHICLE_LIFT;
export const HEADROOM = 0.25;

// Each deck spans a stretch of the course this long.
export const DECK_LENGTH = 3;
// The overpass's deck lies just behind the course's start.
export const OVERPASS_NEAR = -DECK_LENGTH;
export const OVERPASS_FAR = 0;

// The pillars' inner faces, beyond the road edge, clear of the verge.
const PIER_IN = VERGE + 0.4;
const ABUTMENT_OUT = PIER_IN + 2.5;
// The overpass carries a crossing road out onto stepped embankments.
const EMBANKMENT_STEPS = [
  { out: 3, height: DECK_TOP },
  { out: 4.5, height: 3.75 },
  { out: 6, height: 2.5 },
  { out: 7.5, height: 1.25 },
];
const EMBANKMENT_SPREAD = 1;
const LIP_HEIGHT = 0.12;
const TOP_SKIN = 0.04;
const STRIPE = 0.5;
const STRIPE_PROUD = 0.02;
const RAIL_POST_SPACING = 1;

// A box spanning x0..x1, y0..y1 and depths near..far.
function span(x0: number, x1: number, y0: number, y1: number, near: number, far: number, paint: WorldPaint): WorldBox {
  return box([(x0 + x1) / 2, (y0 + y1) / 2, -(near + far) / 2], [x1 - x0, y1 - y0, far - near], paint);
}

// Alternating squares of two paints along a deck's face, facing +z when
// `facing` is 1 or -z when it is -1.
function faceStripes(x0: number, x1: number, y0: number, y1: number, depth: number, facing: 1 | -1, paints: readonly [WorldPaint, WorldPaint], rows = 1): WorldBox[] {
  const count = Math.floor((x1 - x0) / STRIPE);
  const start = (x0 + x1) / 2 - (count * STRIPE) / 2;
  const rowHeight = (y1 - y0) / rows;
  const z = -depth + facing * (STRIPE_PROUD / 2);
  return Array.from({ length: count * rows }, (_, i) => {
    const [col, row] = [i % count, Math.floor(i / count)];
    return box(
      [start + (col + 0.5) * STRIPE, y0 + (row + 0.5) * rowHeight, z],
      [STRIPE, rowHeight, STRIPE_PROUD],
      paints[(col + row) % 2],
    );
  });
}

export function overpassBoxes(): WorldBox[] {
  const [near, far] = [OVERPASS_NEAR, OVERPASS_FAR];
  const deckOut = ABUTMENT_OUT + EMBANKMENT_STEPS[0].out;
  const [x0, x1] = [sideX("left", deckOut), sideX("right", deckOut)];
  const boxes: WorldBox[] = [
    span(sideX("left", ABUTMENT_OUT), sideX("right", ABUTMENT_OUT), DECK_UNDERSIDE, DECK_TOP, near, far, "bridge"),
    // The crossing road on top, with its centre line running across.
    span(x0, x1, DECK_TOP - TOP_SKIN, DECK_TOP, near + 0.15, far - 0.15, "asphalt"),
    // A hazard lip marks the edge the frog jumps down from.
    span(ROAD_LEFT - PIER_IN, ROAD_RIGHT + PIER_IN, DECK_TOP, DECK_TOP + LIP_HEIGHT, far - 0.15, far, "sign"),
    ...faceStripes(sideX("left", ABUTMENT_OUT), sideX("right", ABUTMENT_OUT), DECK_UNDERSIDE, DECK_TOP, far, -1, ["sign", "sign-ink"]),
    ...faceStripes(sideX("left", ABUTMENT_OUT), sideX("right", ABUTMENT_OUT), DECK_UNDERSIDE, DECK_TOP, near, 1, ["sign", "sign-ink"]),
  ];
  const dashCount = Math.floor((x1 - x0) / 1.2);
  for (let i = 0; i < dashCount; i++) {
    const x = x0 + 0.6 + i * 1.2;
    boxes.push(box([x, DECK_TOP + 0.006, -(near + far) / 2], [0.6, 0.012, 0.08], "lane-dash"));
  }
  // A railing along the back edge; the front is left open to jump from.
  const postCount = Math.floor((x1 - x0) / RAIL_POST_SPACING);
  for (let i = 0; i <= postCount; i++) {
    const x = x0 + (i * (x1 - x0)) / postCount;
    boxes.push(box([x, DECK_TOP + 0.2, -near - 0.1], [0.1, 0.4, 0.1], "post"));
  }
  boxes.push(box([(x0 + x1) / 2, DECK_TOP + 0.36, -near - 0.1], [x1 - x0, 0.08, 0.06], "rail"));

  for (const side of ["left", "right"] as const) {
    const [a, b] = [sideX(side, PIER_IN), sideX(side, ABUTMENT_OUT)];
    boxes.push(span(Math.min(a, b), Math.max(a, b), -GROUND_DROP, DECK_UNDERSIDE, near - 0.4, far + 0.4, "bridge-dark"));
    EMBANKMENT_STEPS.forEach((step, i) => {
      const [c, d] = [sideX(side, ABUTMENT_OUT), sideX(side, ABUTMENT_OUT + step.out)];
      const spread = EMBANKMENT_SPREAD * (i + 1);
      boxes.push(span(Math.min(c, d), Math.max(c, d), -GROUND_DROP, step.height, near - spread, far + spread, i === 0 ? "bridge" : "meadow-deep"));
    });
  }
  return boxes;
}

const TOWER_IN = PIER_IN;
const TOWER_WIDTH = 1.2;
const TOWER_BLOCK = 1;
const TOWER_BLOCKS = 7;
const FLAG_POLE = 1.3;

// The finish gantry: a chequered beam across the road on two chequered
// towers, with pink flags on top and a deck to stand on.
export function gantryBoxes(courseLength: number): WorldBox[] {
  const [near, far] = [courseLength, courseLength + DECK_LENGTH];
  const [x0, x1] = [sideX("left", TOWER_IN + TOWER_WIDTH), sideX("right", TOWER_IN + TOWER_WIDTH)];
  const boxes: WorldBox[] = [
    span(x0, x1, DECK_UNDERSIDE, DECK_TOP, near, far, "bridge"),
    span(x0 + 0.1, x1 - 0.1, DECK_TOP - TOP_SKIN, DECK_TOP, near + 0.1, far - 0.1, "finish-light"),
    ...faceStripes(x0, x1, DECK_UNDERSIDE, DECK_TOP, near, 1, ["finish-light", "finish-dark"], 2),
    ...faceStripes(x0, x1, DECK_UNDERSIDE, DECK_TOP, far, -1, ["finish-light", "finish-dark"], 2),
  ];
  for (const side of ["left", "right"] as const) {
    const [a, b] = [sideX(side, TOWER_IN), sideX(side, TOWER_IN + TOWER_WIDTH)];
    for (let level = 0; level < TOWER_BLOCKS; level++) {
      const y0 = level === 0 ? -GROUND_DROP : level * TOWER_BLOCK;
      boxes.push(
        span(Math.min(a, b), Math.max(a, b), y0, (level + 1) * TOWER_BLOCK, near + 0.4, far - 0.4, level % 2 === 0 ? "finish-dark" : "finish-light"),
      );
    }
    const x = (a + b) / 2;
    const top = TOWER_BLOCKS * TOWER_BLOCK;
    const depth = (near + far) / 2;
    boxes.push(box([x, top + FLAG_POLE / 2, -depth], [0.08, FLAG_POLE, 0.08], "post"));
    boxes.push(box([x + (side === "left" ? -0.35 : 0.35), top + FLAG_POLE - 0.25, -depth], [0.7, 0.45, 0.04], "spring-pad"));
  }
  return boxes;
}

// Where the finish is painted on the road: a spring pad just short of the
// line, then a chequered line under the gantry's near face.
export const SPRING_PAD_NEAR = -3.25;
export const FINISH_LINE = { near: -0.75, far: 0.25 };
const CHECK = 0.5;
const CHEVRON_ARM = 0.42;

export function finishZone(courseLength: number): { near: number; far: number } {
  return { near: courseLength + SPRING_PAD_NEAR, far: courseLength + FINISH_LINE.far };
}

export function finishMarkings(courseLength: number): WorldBox[] {
  const marks: WorldBox[] = [];
  const lanes = ROAD_RIGHT - ROAD_LEFT;
  const lineNear = courseLength + FINISH_LINE.near;
  for (let col = 0; col < lanes / CHECK; col++) {
    for (let row = 0; row < (FINISH_LINE.far - FINISH_LINE.near) / CHECK; row++) {
      const depth = lineNear + (row + 0.5) * CHECK;
      marks.push(mark(ROAD_LEFT + (col + 0.5) * CHECK, depth, CHECK, CHECK, (col + row) % 2 === 0 ? "finish-light" : "finish-dark"));
    }
  }
  // The spring pad: a band across the road with a chevron per lane pointing
  // up the course, like a boost pad.
  const padNear = courseLength + SPRING_PAD_NEAR;
  const padFar = lineNear - 0.15;
  marks.push(mark((ROAD_LEFT + ROAD_RIGHT) / 2, (padNear + padFar) / 2, lanes - 0.1, padFar - padNear, "spring-pad"));
  const middle = (padNear + padFar) / 2;
  for (let lane = 0; lane < lanes; lane++) {
    for (const [dx, yaw] of [[-0.14, Math.PI / 4], [0.14, -Math.PI / 4]] as const) {
      for (const dz of [-0.45, 0.45]) {
        marks.push({ ...mark(lane + dx, middle + dz, CHEVRON_ARM, 0.12, "spring-arrow"), yaw });
      }
    }
  }
  return marks;
}

// A flat marking painted on the road.
export const MARK_THICKNESS = 0.01;
export function mark(x: number, depth: number, width: number, length: number, paint: WorldPaint): WorldBox {
  return box([x, 0, -depth], [width, MARK_THICKNESS, length], paint);
}

// The ground the structures stand on, which roadside decorations keep clear of.
export function structureKeepOuts(courseLength: number): Area[] {
  const margin = 1;
  return [overpassBoxes(), gantryBoxes(courseLength)].map((boxes) => {
    const areas = boxes.map(boxArea);
    return {
      minX: Math.min(...areas.map((a) => a.minX)) - margin,
      maxX: Math.max(...areas.map((a) => a.maxX)) + margin,
      minDepth: Math.min(...areas.map((a) => a.minDepth)) - margin,
      maxDepth: Math.max(...areas.map((a) => a.maxDepth)) + margin,
    };
  });
}

import { GROUND_CLEARANCE } from "../clearance";
import { TUNING } from "../tuning";
import {
  GROUND_DROP,
  ROAD_LEFT,
  VERGE,
  box,
  boxArea,
  roadRight,
  sideX,
  type Area,
  type WorldBox,
} from "./geometry";
import type { WorldPaint } from "./paints";

// The two structures spanning the road: the overpass the frog starts on, and
// the finish gantry it ends on. Both are decks the frog can stand on, high
// enough that the tallest vehicle, lifted off the road by the ground
// clearance, drives clearly underneath, on pillars that stay outside the
// traffic lanes and the verges, however many lanes the road has.

export const DECK_TOP = 5;
const DECK_THICKNESS = 0.45;
export const DECK_UNDERSIDE = DECK_TOP - DECK_THICKNESS;
// The tallest vehicle, lifted by the ground clearance, and the least room
// left above it.
export const VEHICLE_TOP = TUNING.wallRows + GROUND_CLEARANCE;
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
// Each lower step of an embankment starts this much further out than the one
// above it, so no two steps share the face toward the road.
const EMBANKMENT_STEP_IN = 0.1;
const LIP_HEIGHT = 0.12;
// A deck's near and far faces are a row of squares this wide and this deep,
// set into the deck flush with its faces.
const STRIPE = 0.5;
const STRIPE_DEPTH = 0.05;
const RAIL_POST_SPACING = 1;

// A box spanning x0..x1, y0..y1 and depths near..far.
function span(x0: number, x1: number, y0: number, y1: number, near: number, far: number, paint: WorldPaint): WorldBox {
  return box([(x0 + x1) / 2, (y0 + y1) / 2, -(near + far) / 2], [x1 - x0, y1 - y0, far - near], paint);
}

// Alternating squares of two paints across a deck's whole face, set into the
// deck from `depth`: toward the far end when `inward` is 1, toward the near
// end when it is -1. They are the face, rather than paint laid on it.
function faceStripes(x0: number, x1: number, y0: number, y1: number, depth: number, inward: 1 | -1, paints: readonly [WorldPaint, WorldPaint], rows = 1): WorldBox[] {
  const count = Math.max(1, Math.round((x1 - x0) / STRIPE));
  const width = (x1 - x0) / count;
  const rowHeight = (y1 - y0) / rows;
  const z = -(depth + inward * (STRIPE_DEPTH / 2));
  return Array.from({ length: count * rows }, (_, i) => {
    const [col, row] = [i % count, Math.floor(i / count)];
    return box(
      [x0 + (col + 0.5) * width, y0 + (row + 0.5) * rowHeight, z],
      [width, rowHeight, STRIPE_DEPTH],
      paints[(col + row) % 2],
    );
  });
}

// A layer of paint lying on a deck, `level` layers thick (see MARK_THICKNESS).
function layer(x0: number, x1: number, near: number, far: number, paint: WorldPaint, level = 1): WorldBox {
  return span(x0, x1, DECK_TOP, DECK_TOP + level * MARK_THICKNESS, near, far, paint);
}

export function overpassBoxes(lanes: number): WorldBox[] {
  const [near, far] = [OVERPASS_NEAR, OVERPASS_FAR];
  const deckOut = ABUTMENT_OUT + EMBANKMENT_STEPS[0].out;
  const [x0, x1] = [sideX(lanes, "left", deckOut), sideX(lanes, "right", deckOut)];
  const [deckLeft, deckRight] = [sideX(lanes, "left", ABUTMENT_OUT), sideX(lanes, "right", ABUTMENT_OUT)];
  const boxes: WorldBox[] = [
    span(deckLeft, deckRight, DECK_UNDERSIDE, DECK_TOP, near + STRIPE_DEPTH, far - STRIPE_DEPTH, "bridge"),
    // The crossing road on top, with its centre line running across.
    layer(x0, x1, near + 0.15, far - 0.15, "asphalt"),
    // A hazard lip marks the edge the frog jumps down from.
    span(ROAD_LEFT - PIER_IN, roadRight(lanes) + PIER_IN, DECK_TOP, DECK_TOP + LIP_HEIGHT, far - 0.15, far, "sign"),
    ...faceStripes(deckLeft, deckRight, DECK_UNDERSIDE, DECK_TOP, far, -1, ["sign", "sign-ink"]),
    ...faceStripes(deckLeft, deckRight, DECK_UNDERSIDE, DECK_TOP, near, 1, ["sign", "sign-ink"]),
  ];
  const dashCount = Math.floor((x1 - x0) / 1.2);
  const middle = (near + far) / 2;
  for (let i = 0; i < dashCount; i++) {
    const x = x0 + 0.6 + i * 1.2;
    boxes.push(layer(x - 0.3, x + 0.3, middle - 0.04, middle + 0.04, "lane-dash", 2));
  }
  // A railing along the back edge, its posts standing a little above the
  // rail; the front is left open to jump from.
  const postCount = Math.floor((x1 - x0) / RAIL_POST_SPACING);
  for (let i = 0; i <= postCount; i++) {
    const x = x0 + (i * (x1 - x0)) / postCount;
    boxes.push(box([x, DECK_TOP + 0.2, -near - 0.1], [0.1, 0.4, 0.1], "post"));
  }
  boxes.push(box([(x0 + x1) / 2, DECK_TOP + 0.32, -near - 0.1], [x1 - x0, 0.08, 0.06], "rail"));

  for (const side of ["left", "right"] as const) {
    const [a, b] = [sideX(lanes, side, PIER_IN), sideX(lanes, side, ABUTMENT_OUT)];
    boxes.push(span(Math.min(a, b), Math.max(a, b), -GROUND_DROP, DECK_UNDERSIDE, near - 0.4, far + 0.4, "bridge-dark"));
    EMBANKMENT_STEPS.forEach((step, i) => {
      const [c, d] = [sideX(lanes, side, ABUTMENT_OUT + i * EMBANKMENT_STEP_IN), sideX(lanes, side, ABUTMENT_OUT + step.out)];
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
export function gantryBoxes(lanes: number, courseLength: number): WorldBox[] {
  const [near, far] = [courseLength, courseLength + DECK_LENGTH];
  const [x0, x1] = [sideX(lanes, "left", TOWER_IN + TOWER_WIDTH), sideX(lanes, "right", TOWER_IN + TOWER_WIDTH)];
  const boxes: WorldBox[] = [
    span(x0, x1, DECK_UNDERSIDE, DECK_TOP, near + STRIPE_DEPTH, far - STRIPE_DEPTH, "bridge"),
    layer(sideX(lanes, "left", TOWER_IN), sideX(lanes, "right", TOWER_IN), near + 0.1, far - 0.1, "finish-light"),
    ...faceStripes(x0, x1, DECK_UNDERSIDE, DECK_TOP, near, 1, ["finish-light", "finish-dark"], 2),
    ...faceStripes(x0, x1, DECK_UNDERSIDE, DECK_TOP, far, -1, ["finish-light", "finish-dark"], 2),
  ];
  for (const side of ["left", "right"] as const) {
    const [a, b] = [sideX(lanes, side, TOWER_IN), sideX(lanes, side, TOWER_IN + TOWER_WIDTH)];
    for (let level = 0; level < TOWER_BLOCKS; level++) {
      const [y0, y1] = [level === 0 ? -GROUND_DROP : level * TOWER_BLOCK, (level + 1) * TOWER_BLOCK];
      // The deck passes through the towers, so a block stops at the deck
      // rather than sharing its faces.
      const pieces: [number, number][] = [
        [y0, Math.min(y1, DECK_UNDERSIDE)],
        [Math.max(y0, DECK_TOP), y1],
      ];
      for (const [p0, p1] of pieces) {
        if (p1 > p0) boxes.push(span(Math.min(a, b), Math.max(a, b), p0, p1, near + 0.4, far - 0.4, level % 2 === 0 ? "finish-dark" : "finish-light"));
      }
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

export function finishMarkings(lanes: number, courseLength: number): WorldBox[] {
  const marks: WorldBox[] = [];
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
  marks.push(mark((ROAD_LEFT + roadRight(lanes)) / 2, (padNear + padFar) / 2, lanes - 0.1, padFar - padNear, "spring-pad"));
  const middle = (padNear + padFar) / 2;
  for (let lane = 0; lane < lanes; lane++) {
    for (const [dx, yaw] of [[-0.14, Math.PI / 4], [0.14, -Math.PI / 4]] as const) {
      for (const dz of [-0.45, 0.45]) {
        marks.push({ ...mark(lane + dx, middle + dz, CHEVRON_ARM, 0.12, "spring-arrow", 2), yaw });
      }
    }
  }
  return marks;
}

// Paint lies on a surface in layers this thick: paint on the surface is the
// first layer, and paint on paint the second. Each layer's top stands clear
// of the one below, so no two share a plane for the depth buffer to fight
// over.
export const MARK_THICKNESS = 0.01;

// A flat marking painted on the road, `level` layers thick.
export function mark(x: number, depth: number, width: number, length: number, paint: WorldPaint, level = 1): WorldBox {
  return box([x, (level * MARK_THICKNESS) / 2, -depth], [width, level * MARK_THICKNESS, length], paint);
}

// The ground the structures stand on, which roadside decorations keep clear of.
export function structureKeepOuts(lanes: number, courseLength: number): Area[] {
  const margin = 1;
  return [overpassBoxes(lanes), gantryBoxes(lanes, courseLength)].map((boxes) => {
    const areas = boxes.map(boxArea);
    return {
      minX: Math.min(...areas.map((a) => a.minX)) - margin,
      maxX: Math.max(...areas.map((a) => a.maxX)) + margin,
      minDepth: Math.min(...areas.map((a) => a.minDepth)) - margin,
      maxDepth: Math.max(...areas.map((a) => a.maxDepth)) + margin,
    };
  });
}

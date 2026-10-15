import { GROUND_CLEARANCE } from "../clearance";
import { TALLEST_VEHICLE } from "../fleet";
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

// The structure spanning the road: the finish gantry the frog ends on, a deck
// it can stand on, high enough that the tallest vehicle, lifted off the road
// by the ground clearance, drives clearly underneath, on towers that stay
// outside the traffic lanes and the verges, however many lanes the road has.
// The course starts from the helicopter instead (`heli/`).

export const DECK_TOP = 5;
const DECK_THICKNESS = 0.45;
export const DECK_UNDERSIDE = DECK_TOP - DECK_THICKNESS;
// The tallest vehicle, lifted by the ground clearance, and the least room
// left above it.
export const VEHICLE_TOP = TALLEST_VEHICLE + GROUND_CLEARANCE;
export const HEADROOM = 0.25;

// The deck spans a stretch of the course this long.
export const DECK_LENGTH = 3;

// The towers' inner faces, beyond the road edge, clear of the verge.
const TOWER_IN = VERGE + 0.4;
// A deck's near and far faces are a row of squares this wide and this deep,
// set into the deck flush with its faces.
const STRIPE = 0.5;
const STRIPE_DEPTH = 0.05;

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
// line, then a chequered line under the gantry's near face. It is painted in
// the course's frame, with the gantry, over the road's own paint, so it lies a
// layer above the edge lines, wherever they fall under it. The road leaves
// its lane dashes off along it (`finishPaintSpan`): a pad or a check whose
// edge across the road fell exactly on a dash's end would put their end
// faces in one plane, which depth-fights.
export const SPRING_PAD_NEAR = -3.25;
export const FINISH_LINE = { near: -0.75, far: 0.25 };

// The stretch of road the finish paint covers, from the spring pad's near
// edge to the finish line's far one.
export function finishPaintSpan(courseLength: number): { near: number; far: number } {
  return { near: courseLength + SPRING_PAD_NEAR, far: courseLength + FINISH_LINE.far };
}
const CHECK = 0.5;
const CHEVRON_ARM = 0.42;

export function finishMarkings(lanes: number, courseLength: number): WorldBox[] {
  const marks: WorldBox[] = [];
  const lineNear = courseLength + FINISH_LINE.near;
  for (let col = 0; col < lanes / CHECK; col++) {
    for (let row = 0; row < (FINISH_LINE.far - FINISH_LINE.near) / CHECK; row++) {
      const depth = lineNear + (row + 0.5) * CHECK;
      marks.push(mark(ROAD_LEFT + (col + 0.5) * CHECK, depth, CHECK, CHECK, (col + row) % 2 === 0 ? "finish-light" : "finish-dark", 2));
    }
  }
  // The spring pad: a band across the road with a chevron per lane pointing
  // up the course, like a boost pad.
  const padNear = finishPaintSpan(courseLength).near;
  const padFar = lineNear - 0.15;
  marks.push(mark((ROAD_LEFT + roadRight(lanes)) / 2, (padNear + padFar) / 2, lanes - 0.1, padFar - padNear, "spring-pad", 2));
  const middle = (padNear + padFar) / 2;
  for (let lane = 0; lane < lanes; lane++) {
    for (const [dx, yaw] of [[-0.14, Math.PI / 4], [0.14, -Math.PI / 4]] as const) {
      for (const dz of [-0.45, 0.45]) {
        marks.push({ ...mark(lane + dx, middle + dz, CHEVRON_ARM, 0.12, "spring-arrow", 3), yaw });
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

// The ground the finish gantry stands on, which roadside decorations keep
// clear of.
export function structureKeepOuts(lanes: number, courseLength: number): Area[] {
  const margin = 1;
  const areas = gantryBoxes(lanes, courseLength).map(boxArea);
  return [
    {
      minX: Math.min(...areas.map((a) => a.minX)) - margin,
      maxX: Math.max(...areas.map((a) => a.maxX)) + margin,
      minDepth: Math.min(...areas.map((a) => a.minDepth)) - margin,
      maxDepth: Math.max(...areas.map((a) => a.maxDepth)) + margin,
    },
  ];
}

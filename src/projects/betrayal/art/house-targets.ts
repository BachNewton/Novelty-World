import * as THREE from "three";
import type { Layout } from "../engine/board";
import { placed } from "../engine/board";
import type { ChoiceLayout } from "../input/controls";
import type { Point, ScreenPoint, Target as PointerTarget } from "../input/navigate";
import type { GhostDoor } from "../play/ghost";
import type { Edge, FloorId, Rotation } from "../types";
import type { FloorChoice, Mark } from "./house";
import { DIRECTION } from "./house-layout";
import { inHouse, shownOn, type HousePoint, type Stairway } from "./house-walk";
import { DOOR_WIDTH, TILE } from "./room";

/*
 * What the house shows a decision offering, as pure functions: each target
 * (a room, a stair, a doorway, an empty cell, a tile to place, a figure)
 * placed in the scene, marked on its floor, and laid out on the screen for
 * the input layer to point at. A target's id is the choice's, never a room's:
 * one room can carry several targets.
 */

/** The walk a target leads to: a figure's route through rooms, from the one
 *  it stands in, to the spot (`slot`) it would stand on at the end. */
export interface TargetRoute {
  figure: string;
  rooms: readonly string[];
  slot: number;
}

export type Target = { id: string } & (
  /** A room. With a route, the route preview shows when it is focused, and on
   *  another floor it shows as the stair its route takes there from this one. */
  | { kind: "room"; room: string; route?: TargetRoute }
  /** The stair out of `room` towards the room it links to. */
  | { kind: "stair"; room: string; toward: string }
  /** An unexplored doorway out of `room`, on a board direction. */
  | { kind: "doorway"; room: string; direction: Edge }
  /** An empty cell on a floor. */
  | { kind: "cell"; floor: FloorId; x: number; y: number }
  /** A room tile not yet placed, shown as a ghost on a cell, turned
   *  `rotation` quarter turns, with what its doorways would do there. */
  | { kind: "ghost"; floor: FloorId; x: number; y: number; tile: string; rotation: Rotation; doors: readonly GhostDoor[] }
  /** Another figure. */
  | { kind: "figure"; figure: string }
  /** The figure whose turn it is, choosing itself. */
  | { kind: "self"; figure: string }
);

export type TargetKind = Target["kind"];

/** A cell of the house, as the camera frames it. */
export interface Cell {
  floor: FloorId;
  x: number;
  y: number;
}

/** Where a target is in the scene, given the floor showing. */
export interface TargetPlace {
  /** The point it is drawn round, a little above the floor. */
  anchor: THREE.Vector3;
  /** What a pointer can hit, in the scene: a floor polygon, or for a figure
   *  the corners of its box, taken round on the screen. Null where it
   *  doesn't show, so it is reached only by changing floor. */
  outline: THREE.Vector3[] | null;
  /** True when `outline` is a box whose screen rectangle is the target. */
  box: boolean;
  /** Its glow, or null where it doesn't show. */
  mark: Mark | null;
  /** The cell the camera frames for it, on the floor it shows on. */
  cell: Cell;
  /** The floor it lies on, for showing it when the focus moves to it from another. */
  floor: FloorId;
}

export interface PlaceContext {
  layout: Layout;
  showing: FloorChoice;
  stairway: Stairway;
  scenePoint: (point: HousePoint) => THREE.Vector3;
  figureAt: (figure: string) => HousePoint;
}

/** Where on a target its screen position is taken: a little above the middle of its floor. */
export const ANCHOR_HEIGHT = 0.3;
/** A figure's screen position is taken about its middle. */
const FIGURE_ANCHOR = 0.9;
/** A figure is a pointer target this far round its base, and this tall. */
const FIGURE_BOX = { reach: 0.6, height: 1.8 };
/** A stair offered as a choice is a pointer target this far either side of its run. */
const STAIR_REACH = 0.8;
/** A doorway is a pointer target this deep, half each side of its wall. */
const DOORWAY_REACH = 1.4;
/** The smallest pointer target, in CSS pixels each way: a fingertip. */
export const FINGER = 48;

const lift = (point: THREE.Vector3, by: number) => point.clone().setY(point.y + by);

function tileOf(layout: Layout, room: string) {
  const tile = placed(layout, room);
  if (!tile) throw new Error(`The house has no room "${room}"`);
  return tile;
}

/** A rectangle on a floor round `centre`, `w` along x and `d` along z. */
function rectangle(centre: THREE.Vector3, w: number, d: number): THREE.Vector3[] {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, z]) => centre.clone().add(new THREE.Vector3((x * w) / 2, 0, (z * d) / 2)));
}

function cellCentre(ctx: PlaceContext, { floor, x, y }: Cell): THREE.Vector3 {
  return ctx.scenePoint({ floor, x: x * TILE, y: 0, z: y * TILE });
}

const shows = (ctx: PlaceContext, floor: FloorId) => ctx.showing === "all" || ctx.showing === floor;

/** The stair out of `from` towards `toward`: its middle, the band either side of its run, and its cell. */
function stairPlace(ctx: PlaceContext, id: string, from: string, toward: string, floor: FloorId): TargetPlace {
  const tile = tileOf(ctx.layout, from);
  const run = (ctx.stairway(from, toward) ?? []).map((point) => ctx.scenePoint(inHouse(ctx.layout, from, point)));
  if (run.length < 2) throw new Error(`${from} has no stair towards ${toward}`);
  const [start, end] = [run[0], run[run.length - 1]];
  const side = end.clone().sub(start).setY(0).normalize().cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(STAIR_REACH);
  return {
    anchor: start.clone().add(end).multiplyScalar(0.5).setY((start.y + end.y) / 2 + ANCHOR_HEIGHT),
    outline: [start.clone().add(side), end.clone().add(side), end.clone().sub(side), start.clone().sub(side)],
    box: false,
    mark: { id, kind: "stair", room: from, toward },
    cell: { floor: tile.floor, x: tile.x, y: tile.y },
    floor,
  };
}

function figurePlace(ctx: PlaceContext, id: string, figure: string): TargetPlace {
  const at = ctx.figureAt(figure);
  const base = ctx.scenePoint(at);
  const shown = shows(ctx, at.floor);
  const { reach, height } = FIGURE_BOX;
  const corners = rectangle(base, reach * 2, reach * 2).flatMap((corner) => [corner, lift(corner, height)]);
  return {
    anchor: lift(base, FIGURE_ANCHOR),
    outline: shown ? corners : null,
    box: true,
    mark: shown ? { id, kind: "figure", figure } : null,
    cell: { floor: at.floor, x: Math.round(at.x / TILE), y: Math.round(at.z / TILE) },
    floor: at.floor,
  };
}

export function targetPlace(target: Target, ctx: PlaceContext): TargetPlace {
  switch (target.kind) {
    case "room": {
      const tile = tileOf(ctx.layout, target.room);
      const shown = shownOn(ctx.layout, { room: target.room, route: target.route ? [...target.route.rooms] : [target.room] }, ctx.showing, ctx.stairway);
      if (shown && "stairFrom" in shown) return stairPlace(ctx, target.id, shown.stairFrom, target.room, tile.floor);
      const centre = cellCentre(ctx, tile);
      return {
        anchor: lift(centre, ANCHOR_HEIGHT),
        outline: shown ? rectangle(centre, TILE, TILE) : null,
        box: false,
        mark: shown ? { id: target.id, kind: "room", room: target.room } : null,
        cell: { floor: tile.floor, x: tile.x, y: tile.y },
        floor: tile.floor,
      };
    }
    case "stair": {
      const place = stairPlace(ctx, target.id, target.room, target.toward, tileOf(ctx.layout, target.room).floor);
      return shows(ctx, place.floor) ? place : { ...place, outline: null, mark: null };
    }
    case "doorway": {
      const tile = tileOf(ctx.layout, target.room);
      const { x, z } = DIRECTION[target.direction];
      const centre = cellCentre(ctx, tile).add(new THREE.Vector3((x * TILE) / 2, 0, (z * TILE) / 2));
      const [w, d] = x === 0 ? [DOOR_WIDTH, DOORWAY_REACH] : [DOORWAY_REACH, DOOR_WIDTH];
      const shown = shows(ctx, tile.floor);
      return {
        anchor: lift(centre, ANCHOR_HEIGHT),
        outline: shown ? rectangle(centre, w, d) : null,
        box: false,
        mark: shown ? { id: target.id, kind: "doorway", room: target.room, direction: target.direction } : null,
        cell: { floor: tile.floor, x: tile.x, y: tile.y },
        floor: tile.floor,
      };
    }
    case "cell":
    case "ghost": {
      const cell = { floor: target.floor, x: target.x, y: target.y };
      const centre = cellCentre(ctx, cell);
      const shown = shows(ctx, target.floor);
      const mark: Mark = target.kind === "cell" ? { id: target.id, kind: "cell", ...cell } : { id: target.id, kind: "ghost", ...cell, doors: target.doors };
      return { anchor: lift(centre, ANCHOR_HEIGHT), outline: shown ? rectangle(centre, TILE, TILE) : null, box: false, mark: shown ? mark : null, cell, floor: target.floor };
    }
    case "figure":
    case "self":
      return figurePlace(ctx, target.id, target.figure);
  }
}

/** An outline on the screen grown, where it is smaller than a fingertip
 *  either way, to a rectangle at least that big round its middle. */
export function fingerSized(outline: readonly Point[]): Point[] {
  const xs = outline.map((point) => point.x);
  const ys = outline.map((point) => point.y);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (right - left >= FINGER && bottom - top >= FINGER) return [...outline];
  const [cx, cy] = [(left + right) / 2, (top + bottom) / 2];
  const [w, h] = [Math.max(right - left, FINGER) / 2, Math.max(bottom - top, FINGER) / 2];
  return [
    { x: cx - w, y: cy - h },
    { x: cx + w, y: cy - h },
    { x: cx + w, y: cy + h },
    { x: cx - w, y: cy + h },
  ];
}

/** The screen rectangle round a box's corners. */
function boxOutline(corners: readonly Point[]): Point[] {
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

/**
 * The targets laid out on the screen for the input layer: every target whose
 * anchor is in front of the camera, for moving the focus by direction, and
 * every target showing on the floor, as a pointer target at least a
 * fingertip big. `project` gives a scene point's place on the screen, or
 * null behind the camera.
 */
export function choiceLayout(places: readonly { id: string; place: TargetPlace }[], focused: string | null, project: (point: THREE.Vector3) => Point | null): ChoiceLayout {
  const points: ScreenPoint[] = [];
  const targets: PointerTarget[] = [];
  for (const { id, place } of places) {
    const at = project(place.anchor);
    if (!at) continue;
    points.push({ id, ...at });
    const corners = place.outline?.map(project);
    if (!corners?.every((corner) => corner !== null)) continue;
    targets.push({ id, anchor: at, outline: fingerSized(place.box ? boxOutline(corners) : corners) });
  }
  return { points, targets, focused };
}

/**
 * The floor the view shows after the active explorer goes from one floor to
 * another, by walking or by the turn passing to someone on another floor.
 * The view follows them when it was showing the floor they left; a floor the
 * player chose to look at instead, or every floor at once, stays.
 */
export function followFloor(showing: FloorChoice, from: FloorId, to: FloorId): FloorChoice {
  return showing === from ? to : showing;
}

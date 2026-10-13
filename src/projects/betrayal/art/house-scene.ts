import * as THREE from "three";
import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import type { StandardButton } from "@/shared/lib/gamepad";
import { FLOORS, placed, type Layout } from "../engine/board";
import { attachControls, pointAt, usesReticle, type ChoiceLayout, type InputKind } from "../input/controls";
import { panOnFloor } from "../input/gestures";
import { cycleChoice, stepFloor, type Point } from "../input/navigate";
import type { FloorId, PlacedTile } from "../types";
import type { Pace } from "./explorers/figure";
import { buildHouse, definition, tileCorners, type FloorChoice, type House, type HouseFigure, type RoomShownAs } from "./house";
import type { LayoutChange } from "./house-layout";
import { choiceLayout, exploreEntry, routeEnd, targetPlace, type Target, type TargetPlace } from "./house-targets";
import { inHouse, walkPath, walkPose, type Avoid, type HousePoint, type Stairway, type Walk } from "./house-walk";
import { pinsApart } from "./pins-apart";
import type { ShownThing } from "../play/things";
import { createThingsLayer } from "./things/layer";
import { floorRead, readFloor } from "./room-floor";
import { aroundBases } from "./walk-around";
import { workerLanes } from "./bake-workers";
import { frameSlicer } from "./build-slices";
import { shaderReadier } from "./shader-prep";
import { meshInWorkers } from "./figure-mesh";
import { createBakeScheduler, type BakeStatus } from "./bake-schedule";
import type { Rebake } from "./lit-floor";
import { backdropKind, createBackdrop } from "./backdrop";
import type { HouseMood } from "./house-mood";
import { budgetGuard, HOUSE_LIGHT, LIGHTMAP, MAX_DRAW_CALLS, MAX_TEXTURE_UNITS } from "./lighting";
import { BASE_RADIUS, TILE, type RoomPoint } from "./room";
import { shownBounds } from "./shapes";
import { BASE_SPAN, cameraDistance, clampPitch, DEFAULT_PITCH, depthRange, FIELD_OF_VIEW, ZOOM_RANGE } from "./house-camera";
import { cameraCue, followed, followedFloor, FOLLOWING, type CameraCue, type CameraFollow, type CameraMode } from "./camera-follow";

/*
 * The house as a picture of whatever is fed to it, with no game in it: a
 * layout of rooms, figures standing in them, the targets a decision offers,
 * whose turn it is, and beats of animation (a walk, a room appearing, the
 * camera panning to something) that resolve on events. Nothing here ever holds
 * up input: a beat plays while the player chooses, and `finish` completes
 * whatever is playing at once. The input layer reports focus and commits by
 * target id to whoever drives the scene.
 */

export type { FloorChoice } from "./house";
export type { Target, TargetRoute } from "./house-targets";

/** Pixels on the screen's short side, as on the bench; null is native. */
export type Resolution = number | null;
const RESOLUTIONS: Resolution[] = [270, 360, 540, 720, 1080, null];
const DEFAULT_RESOLUTION: Resolution = null;
/** How quickly the camera eases to where it is going: the share of the way it closes each second, roughly. */
const EASE_RATE = 6;
/** How far past the rooms showing the camera's target may be panned, in metres. */
const PAN_MARGIN = TILE / 2;
/** The gap kept between a tag pinned in the house and the screen's edge, in CSS pixels. */
const SCREEN_MARGIN = 8;
/** How far a room's `far` pin stands from its middle, in metres: just inside its back wall. */
const FAR_SIDE = TILE * 0.4;
/** The least space between pins kept apart, in CSS pixels. */
const PIN_GAP = 4;
/** How much of a frame building the house may take, in milliseconds: about half of a 60 Hz frame,
 *  leaving the rest to drawing it. A room is built whole, so a frame always builds one. */
const BUILD_BUDGET_MS = 8;

/** A figure in the house: who it is, how it is built, and where it stands at
 *  rest: a room, and its place there, in the room's own frame. */
export interface FigureSpec extends HouseFigure {
  room: string;
  at: readonly [x: number, z: number];
}

/** One figure's walk (or run) along its route of rooms to its place (`at`,
 *  in the last room's own frame), which is where it then rests. */
export interface FigureWalk {
  figure: string;
  route: readonly string[];
  at: readonly [x: number, z: number];
  pace?: Pace;
  /** The walker's Speed value, which sets how fast it goes; left out, the house's own pace. */
  speed?: number;
}

/** A page element kept over a figure, a thing, or a room's middle (or its
 *  `far` side from the camera, where its back wall stands), `height` metres
 *  above its floor and raised by `lift` of its own height. A clamped one
 *  stays on the screen when its point leaves it, at the top of the screen
 *  when its point doesn't show at all; any other hides. Pins kept `apart`
 *  (the figures' marks, each a touch target) never cover each other: those
 *  that would are laid side by side (`pins-apart.ts`). */
export interface Pin {
  element: HTMLElement;
  at: { figure: string } | { room: string; far?: boolean } | { thing: string };
  height: number;
  lift: number;
  clamp: boolean;
  apart: boolean;
}

/** What the camera pans to: one room, with its back walls standing; or these rooms on the floor showing. */
export type Framing = { closeUp: string } | { rooms: readonly string[] };

/** A beat of animation. Each resolves when it has played out, or at once on `finish`. */
export type Beat =
  /** Figures walk (or run) at once. Each keeps round the figures standing
   *  still, and round where the walkers before it are going; resolves once
   *  every one has arrived. */
  | { kind: "walk"; walks: readonly FigureWalk[] }
  /** A room placed by `setLayout` shows, once it is baked with its light. */
  | { kind: "appear"; room: string }
  /** The camera pans to something, keeping the player's angles and zoom, or
   *  (null) lets a close view's walls down; resolves once it has settled. */
  | { kind: "frame"; framing: Framing | null }
  /** A pause on the stage's clock, for a step the player should see. */
  | { kind: "pause"; seconds: number }
  /** A room `setLayout` moved lifts off its old cell and is carried, with the
   *  figures standing in it, to its new one, over `seconds`; the room baked
   *  there shows once it lands. */
  | { kind: "move-room"; room: string; seconds: number };

/** How the view is set: the camera, the floor, and what shows. */
export interface SceneView {
  /** The standard view last set by `setView`, 0 to 3; the player turns the camera freely from it. */
  view: number;
  zoom: number;
  floor: FloorChoice;
  /** The room whose back walls stand, or null. */
  closeUp: string | null;
  resolution: Resolution;
  frozenAt: number | null;
  /** The input the player last used, for its button hints. */
  input: InputKind;
  /** Whether the targets glow and the route shows; off for judging the art alone. */
  showMarks: boolean;
  /** Whether the player is holding every wall up, for a full look at them. */
  wallsRaised: boolean;
  /** Whether a figure is walking. */
  walking: boolean;
  /** Whether a moved room is being carried to its new cell. */
  moving: boolean;
  /** Whether the camera follows the active explorer, or is the player's alone (`camera-follow.ts`). */
  camera: CameraMode;
}

/** Where the camera is: the point on the floor it looks at, its angles round
 *  the vertical and up from the floor, its zoom, and the floor
 *  showing. `mode` is whether it follows the active explorer or is free. */
export interface CameraState {
  target: THREE.Vector3;
  yaw: number;
  pitch: number;
  zoom: number;
  floor: FloorChoice;
  mode: CameraMode;
}

/** Whoever drives the scene, told what the player does with the targets. */
export interface SceneInput {
  focus: (id: string) => void;
  commit: (id: string) => void;
  /** The player confirms with no target offered: going on from a moment shown. */
  confirm: () => void;
  /** The player backs out: the focus is cleared, or a selection pending cancelled. */
  back?: () => void;
  /** The reticle or the mouse has left the choice it was on, so nothing has the focus. */
  blur?: () => void;
  /** The player steps to the next (1) or previous (-1) choice: true when the
   *  driver took the step (a room tile being placed, whose ways round are the
   *  choices then), else the house jumps to the next target. */
  cycle?: (step: 1 | -1) => boolean;
  /** Opens or closes the player's explorer. */
  explorer?: () => void;
  /** Opens or closes the game menu. */
  menu?: () => void;
  /** End turn's hold, begun (true) and let go (false). */
  endTurn?: (held: boolean) => void;
  /** Whether a panel covers the house, taking Tab, Enter and Space. */
  covered?: () => boolean;
  /** Offered every pad button press before the house, from any pad: true when it was taken. */
  padButton?: (button: StandardButton, pad: number) => boolean;
  /** Whether a pad may act now; an idle pad's sticks and buttons are ignored. Every pad may when absent. */
  padMay?: (pad: number) => boolean;
}

/** What one frame cost to draw, for measuring. */
export interface HouseStats {
  calls: number;
  triangles: number;
  /** Baked lights in the rooms showing, and the live lights in the scene. */
  bakedLights: number;
  liveLights: number;
  /** The CPU time of the last render call, in ms. */
  renderMs: number;
  /** The most texture units any compiled shader uses, and what the device offers one. */
  textureUnitsUsed: number;
  maxTextureUnits: number;
  maxFragmentUniforms: number;
  drawingBuffer: [number, number];
  /** How long each floor's first bake took, in ms. */
  bakeMs: Partial<Record<FloorId, number>>;
}

/** The scene's half of the test and screenshot hook (`window.__betrayalHouse`). */
export interface SceneHook {
  frameCount: () => number;
  /** Turns the camera to one of the four standard angles, 0 to 3, at the standard tilt. */
  setView: (view: number) => void;
  /** Swings the camera a quarter turn from wherever it is. */
  turn: (step: 1 | -1) => void;
  /** Fits the close view's room, or else the floor showing, from the camera's
   *  angle: for screenshots, never a game event. */
  fit: () => void;
  /** Shows the floor above (1) or below (-1). */
  stepFloor: (step: 1 | -1) => void;
  /** Follows the explorer whose turn it is again, gliding to them and their floor, keeping the angles and zoom. */
  follow: () => void;
  /** Whether the camera follows the active explorer or is free. */
  cameraMode: () => CameraMode;
  /** Where the camera looks, its angles round the vertical and up from the floor, and its zoom. */
  camera: () => { target: { x: number; y: number; z: number }; yaw: number; pitch: number; zoom: number };
  /** The choice the screen-centre reticle selects, or null; null too when the pointer is the selection. */
  reticle: () => string | null;
  setZoom: (zoom: number) => void;
  setFloor: (floor: FloorChoice) => void;
  setCloseUp: (room: string | null) => void;
  setResolution: (resolution: Resolution) => void;
  freezeClock: (seconds: number | null) => void;
  /** The house is built and shows its direct light, and the camera has settled: the player can play. Finer light may still be on its way. */
  isReady: () => boolean;
  /** Ready, every pass of the light is in, and every figure shows as itself (not its pawn, while it is meshed): for screenshots and anything that compares the final picture. */
  isFullyLit: () => boolean;
  /** How many rooms show, lit. */
  roomsShown: () => number;
  /** How a room shows now: a ghost, solid in flat light while it bakes, lit, or not at all. */
  roomShownAs: (room: string) => RoomShownAs;
  /** The background bake's work in hand. */
  bake: () => BakeStatus;
  floors: () => FloorId[];
  /** The rooms on a floor, as tile ids. */
  rooms: (floor: FloorId) => string[];
  stats: () => HouseStats;
  /** Rebuilds a room and re-bakes it with its neighbours, as discovering or moving it in play would. */
  rebake: (room: string) => Promise<Rebake>;
  /** Moves the focus to a target, as the input layer does. */
  focus: (id: string) => void;
  showChoices: (show: boolean) => void;
  /** Stands every wall full while true, as holding the raise-walls key, button or touch button does. */
  raiseWalls: (raised: boolean) => void;
  /** Where a target shows on the page, in CSS pixels, for tests to point at. */
  screenPoint: (id: string) => Point | null;
  /** The target under a point on the page, in CSS pixels, or null. */
  targetAt: (point: Point) => string | null;
}

/**
 * Where to aim and how far back to stand, looking from the unit direction
 * `back`, so every point fits in view: the distance that fits them about the
 * aim, then the aim moved to the middle of what is seen and fitted again,
 * so a lopsided house is centred rather than fitted round its box's middle.
 */
function fitView(points: THREE.Vector3[], back: THREE.Vector3, camera: THREE.PerspectiveCamera): { target: THREE.Vector3; distance: number } {
  const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const horizontal = vertical * camera.aspect;
  const right = new THREE.Vector3(0, 1, 0).cross(back).normalize();
  const up = back.clone().cross(right);
  const target = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
  let distance = 0;
  for (let pass = 0; pass < 2; pass++) {
    distance = 0;
    for (const point of points) {
      const offset = point.clone().sub(target);
      const depth = offset.dot(back);
      distance = Math.max(distance, depth + Math.abs(offset.dot(right)) / horizontal, depth + Math.abs(offset.dot(up)) / vertical);
    }
    const across = [Infinity, -Infinity];
    const along = [Infinity, -Infinity];
    for (const point of points) {
      const offset = point.clone().sub(target);
      const depth = distance - offset.dot(back);
      const x = offset.dot(right) / depth;
      const y = offset.dot(up) / depth;
      across[0] = Math.min(across[0], x);
      across[1] = Math.max(across[1], x);
      along[0] = Math.min(along[0], y);
      along[1] = Math.max(along[1], y);
    }
    target.addScaledVector(right, ((across[0] + across[1]) / 2) * distance).addScaledVector(up, ((along[0] + along[1]) / 2) * distance);
  }
  return { target, distance };
}

/** View 0 looks from the bottom-right corner; each step is a quarter turn. */
function viewAngle(view: number): number {
  return THREE.MathUtils.degToRad(45 + 90 * view);
}

/** An angle moved by whole turns to lie within half a turn of `near`. */
function wrapNear(angle: number, near: number): number {
  return angle + Math.round((near - angle) / (Math.PI * 2)) * Math.PI * 2;
}

const stairway: Stairway = (room, toward) => definition(room).stairs?.[toward];

const floorsOf = (layout: Layout) => FLOORS.filter((floor) => layout.tiles.some((tile) => tile.floor === floor));

/** A beat playing: how it ends on its own, checked each frame, and how it ends at once. */
interface Playing {
  kind: Beat["kind"];
  /** A walk's figure and its route of rooms. */
  walk?: { figure: string; route: readonly string[] };
  /** A moved room's flight: its room, and posing it for this frame. */
  carry?: { room: string; pose: () => void };
  /** True once it has played out on its own; it is then over. */
  over: () => boolean;
  end: () => void;
}

/** The house scene: `layout`'s rooms, one floor at a time or all stacked,
 *  driven by `setLayout`, `setFigures`, `setTargets`, `setActive` and `play`.
 *  Plain state outside React, so a page, tests and screenshot tools drive the same thing. */
/** `readout` adds the performance readout (draw calls, texture units, bake
 *  times) under the frame-rate panel, for the house demo's phone tests. */
export function createHouseScene(initial: Layout, { readout: showsReadout = false }: { readout?: boolean } = {}) {
  let layout = initial;
  const figures = new Map<string, FigureSpec>();
  let targets: readonly Target[] = [];
  let focused: string | null = null;
  let active: string | null = null;
  /** The house's light as a whole, kept for a house mounted later. */
  let mood: HouseMood = "explore";
  let input: SceneInput = { focus: () => undefined, commit: () => undefined, confirm: () => undefined };

  let view: SceneView = {
    view: 0,
    zoom: 1,
    floor: floorsOf(initial).includes("ground") ? "ground" : (floorsOf(initial)[0] ?? "ground"),
    closeUp: null,
    resolution: DEFAULT_RESOLUTION,
    frozenAt: null,
    input: "keyboard-mouse",
    showMarks: true,
    wallsRaised: false,
    walking: false,
    moving: false,
    camera: FOLLOWING.mode,
  };
  const listeners = new Set<() => void>();
  /** The camera's angles round the vertical and up from the floor, and its zoom, eased towards their goals (the zoom's is `view.zoom`). */
  let yaw = viewAngle(view.view);
  let pitch = DEFAULT_PITCH;
  let zoom = view.zoom;
  let yawGoal: number | null = null;
  /** The player's angle before a close view turned to its room's best one, to turn back to after; null when none did. */
  let yawBeforeCloseUp: number | null = null;
  let pitchGoal: number | null = null;
  /** The point on the floor the camera looks at, and where it is easing to; null until the house first shows. */
  let aim: THREE.Vector3 | null = null;
  let aimGoal: THREE.Vector3 | null = null;
  /** Whether the camera follows the active explorer (and what it looks at meanwhile), or is free. */
  let follow: CameraFollow = FOLLOWING;
  /** The player has a hand on the camera, so it hasn't settled. */
  let handsOn = false;
  /** A choice a jump went to, which the reticle holds while the camera glides there, until the player pans away. */
  let pinned: string | null = null;
  /** The choice under the reticle as of the last frame: the reticle's choice changes only when this does. */
  let underReticle: string | null = null;
  /** The reticle's choice, as the driver was last told it: cleared by backing out, until the reticle moves onto another. */
  let pointed: string | null = null;
  /** The order the next and previous choice go round in, fixed at the first
   *  jump until the choices change: a jump can change floor, which moves a
   *  choice shown as its stairs, so reading the order off the screen again
   *  would skip choices. */
  let cycleOrder: string[] | null = null;

  const playing = new Set<Playing>();
  /** The bake's workers and its queue, for the scene's life: the lanes start with the first work, and stop when the scene unmounts. */
  const bakes = createBakeScheduler(() => workerLanes());
  // The bake lights first the room the explorer whose turn it is stands in, then the rooms on screen
  // (once the camera is placed), then the rest of the floor showing, then the other floors.
  bakes.setPriority(({ floor, room }) => {
    if (active !== null && figures.get(active)?.room === room) return 3;
    if (view.floor !== "all" && view.floor !== floor) return 0;
    const tile = placed(layout, room);
    const at = tile && mounted && aim ? mounted.project(mounted.house.cellCentre(tile.floor, tile.x, tile.y)) : null;
    if (!at || !mounted) return 1;
    const { clientWidth, clientHeight } = mounted.container;
    return at.x >= 0 && at.y >= 0 && at.x <= clientWidth && at.y <= clientHeight ? 2 : 1;
  });
  let mounted: {
    house: House;
    sync: () => void;
    applyResolution: () => void;
    stats: () => HouseStats;
    layoutNow: () => ChoiceLayout;
    project: (point: THREE.Vector3) => Point | null;
    container: HTMLElement;
    placeCamera: (ease: number) => boolean;
    /** The point on the floor showing under a point of the screen, or null where the view is above the horizon. */
    floorHit: (point: Point) => THREE.Vector3 | null;
    /** The camera's target and zoom that fit these points in view from its angle. */
    fitting: (points: THREE.Vector3[]) => { target: THREE.Vector3; zoom: number };
  } | null = null;
  let settled = false;
  let frames = 0;
  /** The stage's clock, in seconds. */
  let seconds = 0;
  /** A page element the scene keeps over the focused target, as its name tag. */
  let label: HTMLElement | null = null;
  /** A page element the scene keeps at the screen's centre while the reticle is the selection. */
  let reticleMark: HTMLElement | null = null;
  /** A page element the scene keeps on the ghost of a room being placed, for its turning handles; hidden with a controller, which turns it with buttons. */
  let ghostHandles: HTMLElement | null = null;
  /** Page elements the scene keeps over figures and rooms: a figure's marks, a card's title over its room. */
  const pins = new Map<string, readonly Pin[]>();
  /** The things living in the rooms: objects, room effects and connections. Each is a pointer target that names it, never a choice. */
  const things = createThingsLayer();

  const tileFloor = (room: string): FloorId => {
    const tile = placed(layout, room);
    if (!tile) throw new Error(`The house has no room "${room}"`);
    return tile.floor;
  };
  const figureOf = (id: string): FigureSpec => {
    const figure = figures.get(id);
    if (!figure) throw new Error(`The house has no figure "${id}"`);
    return figure;
  };
  const figureFloor = (id: string): FloorId => (mounted ? mounted.house.figureAt(id).floor : tileFloor(figureOf(id).room));
  /** Where a figure rests, in the house. */
  const placeOf = (figure: FigureSpec): HousePoint => inHouse(layout, figure.room, [figure.at[0], 0, figure.at[1]]);
  /** Keeps a walk's way across a room round the figures resting there, but for those in `walking`. */
  const roundStanding =
    (walking: ReadonlySet<string>): Avoid =>
    (room, points) => {
      const bases = [...figures.values()].filter((figure) => figure.room === room && !walking.has(figure.id)).map(({ at: [x, z] }) => ({ x, z, radius: BASE_RADIUS }));
      // A room whose floor is still being read (in its worker) keeps to its lanes until it is.
      if (bases.length === 0 || !floorRead(room)) return [...points];
      const crossing = definition(room).crossing ?? [];
      const onCrossing = (point: RoomPoint) => crossing.some((along) => along === point);
      return aroundBases(readFloor(room), points, bases, (a, b) => onCrossing(a) && onCrossing(b));
    };

  function update(next: Partial<SceneView>) {
    view = { ...view, ...next };
    mounted?.sync();
    for (const listener of listeners) listener();
  }

  /** Shows a floor, keeping a close view only if its room is on it. */
  function showFloor(floor: FloorChoice) {
    const closeUp = view.closeUp && floor !== "all" && tileFloor(view.closeUp) === floor ? view.closeUp : null;
    if (floor !== view.floor || closeUp !== view.closeUp) update({ floor, closeUp });
  }

  /** The floor a following camera's subject is on, or null when it is free or follows no one. */
  const followedFloorNow = (): FloorId | null => {
    const subject = followed(follow, active);
    if (subject === null) return null;
    if ("point" in subject) return subject.floor;
    return figures.has(subject.figure) ? figureFloor(subject.figure) : null;
  };

  /** A following camera's view shows its subject's floor. */
  function keepFollowedFloor() {
    const floor = followedFloorNow();
    if (floor !== null) showFloor(followedFloor(view.floor, floor));
  }

  function cue(next: CameraCue) {
    const was = follow;
    follow = cameraCue(follow, next);
    if (follow === was) return;
    settled = false;
    if (follow.mode !== view.camera) update({ camera: follow.mode });
    keepFollowedFloor();
  }

  /** The camera pans to a point on a floor, keeping the player's angles and zoom, if it is following: free, nothing the game shows moves it. */
  function panTo(point: THREE.Vector3, floor: FloorId) {
    if (follow.mode === "free") return;
    cue({ kind: "show", point, floor });
    pinned = null;
  }

  /** The player's own look at a point (a jump to a choice): a following camera looks there for now, a free one goes there. */
  function lookAt(point: THREE.Vector3, floor: FloorId) {
    if (follow.mode === "following") cue({ kind: "show", point, floor });
    else aimGoal = point.clone();
    settled = false;
  }

  /** The middle of these rooms' floors. */
  function middleOf(house: House, rooms: readonly string[]): THREE.Vector3 {
    const centres = rooms.map((room) => {
      const tile = placed(layout, room);
      if (!tile) throw new Error(`The house has no room "${room}"`);
      return house.cellCentre(tile.floor, tile.x, tile.y);
    });
    return centres.reduce((sum, centre) => sum.add(centre), new THREE.Vector3()).divideScalar(centres.length);
  }

  /** Where a pin's point is in the house, or null where it doesn't show: off the floor showing, or not in the house. */
  const pinPoint = (house: House, pinned: Pin): THREE.Vector3 | null => {
    if ("thing" in pinned.at) {
      const floor = things.floorOf(pinned.at.thing);
      return floor !== null && (view.floor === "all" || floor === view.floor) ? things.pointOf(pinned.at.thing, house.scenePoint, pinned.height) : null;
    }
    const at = "figure" in pinned.at ? (figures.has(pinned.at.figure) ? house.figureAt(pinned.at.figure) : null) : null;
    const tile = "room" in pinned.at ? placed(layout, pinned.at.room) : null;
    const floor = at?.floor ?? tile?.floor;
    if (floor === undefined || (view.floor !== "all" && floor !== view.floor)) return null;
    const point = at ? house.scenePoint(at) : tile ? house.cellCentre(tile.floor, tile.x, tile.y) : null;
    // Away from the camera, across the floor: the side of the room its back wall stands on.
    if (point && "room" in pinned.at && pinned.at.far) point.add(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(FAR_SIDE));
    return point && point.setY(point.y + pinned.height);
  };
  const placeContext = (house: House) => ({ layout, showing: view.floor, stairway, scenePoint: house.scenePoint, figureAt: house.figureAt });
  const placesOf = (house: House): { id: string; place: TargetPlace }[] => {
    const context = placeContext(house);
    return [...targets.map((target) => ({ id: target.id, place: targetPlace(target, context) })), ...things.places(house.scenePoint, view.floor)];
  };
  const walkingNow = () => [...playing].some((beat) => beat.walk !== undefined);
  const movingNow = () => [...playing].some((beat) => beat.carry !== undefined);
  /** Where each room the last layout change moved stood before it, for its flight. */
  let departed = new Map<string, PlacedTile>();
  const ghostOf = (list: readonly Target[]) => list.find((target): target is Extract<Target, { kind: "ghost" }> => target.kind === "ghost") ?? null;
  /** The ghost of a room being placed, when one is offered. */
  const turning = () => ghostOf(targets)?.id ?? null;

  /** Moves the focus to a target, showing its floor if it doesn't show on this one. */
  function focusTarget(id: string) {
    if (things.has(id)) {
      const floor = things.floorOf(id);
      if (floor !== null && view.floor !== "all" && floor !== view.floor) showFloor(floor);
      input.focus(id);
      return;
    }
    const target = targets.find((candidate) => candidate.id === id);
    if (!target) return;
    if (mounted && view.floor !== "all") {
      const place = targetPlace(target, placeContext(mounted.house));
      // A following camera would go straight back to its subject's floor, so it looks at the choice instead.
      if (place.outline === null) {
        if (follow.mode === "following") cue({ kind: "show", point: place.anchor, floor: place.floor });
        else showFloor(place.floor);
      }
    }
    input.focus(id);
  }

  // ---- What the house shows ----

  function setLayout(next: Layout): LayoutChange | null {
    const before = layout;
    layout = next;
    things.setLayout(next);
    const change = mounted?.house.setLayout(next) ?? null;
    // A room moved again (or gone) mid-flight lands at once: its flight is from a place it no longer comes from.
    const changed = new Set([...(change?.moved ?? []), ...(change?.removed ?? [])]);
    for (const beat of [...playing]) if (beat.carry && changed.has(beat.carry.room)) beat.end();
    departed = new Map((change?.moved ?? []).flatMap((room) => {
      const was = placed(before, room);
      return was ? [[room, was] as const] : [];
    }));
    // Figures standing in a room that moved stand in it where it now is; its flight carries them there.
    const house = mounted?.house;
    const walking = new Set([...playing].flatMap((beat) => (beat.walk ? [beat.walk.figure] : [])));
    for (const figure of figures.values()) {
      if (house && departed.has(figure.room) && !walking.has(figure.id)) house.stand(figure.id, placeOf(figure), house.roomHeading(figure.room));
    }
    // A room appearing (discovered, or placed by a rule) is something to see: the camera pans to it.
    const shownNow = change?.added.filter((room) => view.floor === "all" || tileFloor(room) === view.floor) ?? [];
    if (mounted && shownNow.length > 0) panTo(middleOf(mounted.house, shownNow), tileFloor(shownNow[0]));
    settled = false;
    return change;
  }

  function placeFigure(house: House, figure: FigureSpec) {
    house.addFigure(figure, placeOf(figure), house.roomHeading(figure.room));
  }

  function setFigures(specs: readonly FigureSpec[]) {
    const house = mounted?.house;
    const wanted = new Map(specs.map((spec) => [spec.id, spec] as const));
    for (const [id, old] of figures) {
      const next = wanted.get(id);
      if (next && next.build === old.build && next.colour === old.colour && (next.mark ?? null) === (old.mark ?? null)) continue;
      house?.removeFigure(id);
      figures.delete(id);
      if (active === id) active = null;
    }
    const walking = new Set([...playing].flatMap((beat) => (beat.walk ? [beat.walk.figure] : [])));
    for (const spec of specs) {
      const old = figures.get(spec.id);
      figures.set(spec.id, { ...spec });
      if (!house) continue;
      // A figure moving with no walk playing (put somewhere by a rule) stands there at once.
      if (!old || walking.has(spec.id)) {
        if (!old) placeFigure(house, spec);
      } else if (old.room !== spec.room || old.at[0] !== spec.at[0] || old.at[1] !== spec.at[1]) house.stand(spec.id, placeOf(spec));
    }
    mounted?.sync();
  }

  /** The targets a decision offers, and the one the focus is on. */
  function setTargets(next: readonly Target[], focus: string | null) {
    const ids = (list: readonly Target[]) => list.map((target) => target.id).join("\n");
    if (ids(next) !== ids(targets)) {
      pinned = null;
      cycleOrder = null;
    }
    // A ghost put on a new cell is shown. It is the player's own decision in hand, so even a free camera shows its floor; a following one pans to it too.
    const [ghost, was] = [ghostOf(next), ghostOf(targets)];
    if (ghost && (ghost.floor !== was?.floor || ghost.x !== was.x || ghost.y !== was.y)) {
      if (follow.mode === "free" && view.floor !== "all") showFloor(ghost.floor);
      if (mounted) panTo(mounted.house.cellCentre(ghost.floor, ghost.x, ghost.y), ghost.floor);
    }
    targets = next;
    focused = focus;
    mounted?.sync();
  }

  /** Whose turn it is: the light follows them, and a new turn follows them
   *  with the camera, free or not: on one device it has just passed to the
   *  player who expects to see their own explorer. */
  function setActive(id: string | null) {
    const turned = id !== null && id !== active;
    active = id;
    if (turned) cue({ kind: "follow" });
    keepFollowedFloor();
    mounted?.sync();
  }

  // ---- Beats ----

  function play(beat: Beat): Promise<void> {
    return new Promise((resolve) => {
      const start = (over: () => boolean, end: () => void, extra: Pick<Playing, "walk" | "carry"> = {}, done: () => void = resolve) => {
        const entry: Playing = {
          kind: beat.kind,
          over,
          end: () => {
            playing.delete(entry);
            end();
            done();
            if (!walkingNow() && view.walking) update({ walking: false });
            if (!movingNow() && view.moving) update({ moving: false });
          },
          ...extra,
        };
        playing.add(entry);
      };
      switch (beat.kind) {
        case "walk": {
          const walkers = beat.walks.map((walk) => walk.figure);
          for (const other of [...playing]) if (other.walk && walkers.includes(other.walk.figure)) other.end();
          const from = new Map(walkers.map((id) => [id, mounted?.house.figureAt(id)]));
          for (const walk of beat.walks) figures.set(walk.figure, { ...figureOf(walk.figure), room: walk.route[walk.route.length - 1], at: walk.at });
          const house = mounted?.house;
          if (!house || beat.walks.length === 0) {
            resolve();
            return;
          }
          let walking = beat.walks.length;
          const arrived = () => {
            if (--walking === 0) resolve();
          };
          beat.walks.forEach((step, i) => {
            // The walkers after this one are on their way too, so only those before it stand where they are going.
            const walkingOn = new Set(walkers.slice(i));
            const walk: Walk = { path: walkPath(layout, step.route, from.get(step.figure) ?? placeOf(figureOf(step.figure)), placeOf(figureOf(step.figure)), definition, roundStanding(walkingOn)), start: seconds, pace: step.pace, speed: step.speed };
            house.walk(step.figure, walk);
            start(
              () => walkPose(walk, seconds).done,
              () => {
                house.stand(step.figure, placeOf(figureOf(step.figure)), walkPose(walk, Infinity).heading);
                cue({ kind: "arrive", figure: step.figure });
              },
              { walk: { figure: step.figure, route: step.route } },
              arrived,
            );
          });
          cue({ kind: "walk", figure: walkers[0] });
          settled = false;
          update({ walking: true });
          return;
        }
        case "appear": {
          let shown = false;
          void (mounted?.house.roomShown(beat.room) ?? Promise.resolve()).then(() => {
            shown = true;
          });
          start(() => shown, () => undefined);
          return;
        }
        case "frame": {
          const closeUp = beat.framing && "closeUp" in beat.framing ? beat.framing.closeUp : null;
          // A close view of a room on a floor the player isn't looking at would frame nothing: the player's floor stands.
          if (closeUp !== null && view.floor !== "all" && tileFloor(closeUp) !== view.floor) {
            resolve();
            return;
          }
          const rooms = beat.framing === null ? [] : "closeUp" in beat.framing ? [beat.framing.closeUp] : beat.framing.rooms;
          const showing = rooms.filter((room) => view.floor === "all" || tileFloor(room) === view.floor);
          if (mounted && showing.length > 0) panTo(middleOf(mounted.house, showing), tileFloor(showing[0]));
          if (beat.framing === null) cue({ kind: "release" });
          // A room may name the angle it reads best from: a following camera's close view turns there, and back after.
          const angle = closeUp === null ? undefined : definition(closeUp).angle;
          if (angle !== undefined && follow.mode === "following" && !handsOn) {
            yawBeforeCloseUp ??= yawGoal ?? yaw;
            yawGoal = wrapNear(viewAngle(angle), yaw);
          } else if (closeUp === null && yawBeforeCloseUp !== null) {
            yawGoal = wrapNear(yawBeforeCloseUp, yaw);
            yawBeforeCloseUp = null;
          }
          settled = false;
          update({ closeUp });
          start(
            () => settled,
            () => mounted?.placeCamera(1),
          );
          return;
        }
        case "move-room": {
          const from = departed.get(beat.room);
          departed.delete(beat.room);
          const house = mounted?.house;
          const to = placed(layout, beat.room);
          if (!house || !from || !to) {
            resolve();
            return;
          }
          for (const other of [...playing]) if (other.carry?.room === beat.room) other.end();
          const walking = new Set([...playing].flatMap((other) => (other.walk ? [other.walk.figure] : [])));
          const riders = [...figures.values()].filter((figure) => figure.room === beat.room && !walking.has(figure.id)).map((figure) => figure.id);
          const flight = house.liftRoom(beat.room, from, riders);
          const began = seconds;
          const share = () => (beat.seconds > 0 ? Math.min(1, (seconds - began) / beat.seconds) : 1);
          if (view.floor === "all" || to.floor === view.floor) panTo(house.cellCentre(to.floor, to.x, to.y), to.floor);
          start(
            () => share() >= 1,
            () => {
              flight.land();
              mounted?.sync();
            },
            { carry: { room: beat.room, pose: () => flight.at(share()) } },
          );
          update({ moving: true });
          return;
        }
        case "pause": {
          const until = seconds + beat.seconds;
          start(
            () => seconds >= until,
            () => undefined,
          );
          return;
        }
      }
    });
  }

  /** Completes whatever is playing, at once: walkers stand where they were going, and the camera is where it was easing to. */
  function finish() {
    for (const beat of [...playing]) beat.end();
  }

  // ---- The camera ----

  /** The floor the camera's target lies on: the one showing, or with every
   *  floor showing, the active figure's (else the lowest). */
  const aimFloor = (): FloorId => (view.floor !== "all" ? view.floor : active !== null && figures.has(active) ? figureFloor(active) : floorsOf(layout)[0]);

  /** The camera's target, as far as it is going. */
  const aimingAt = () => (aimGoal ?? aim ?? new THREE.Vector3()).clone();

  const camera = {
    state: (): CameraState => ({ target: (aim ?? new THREE.Vector3()).clone(), yaw, pitch, zoom: view.zoom, floor: view.floor, mode: follow.mode }),
    /** Puts the camera's target on a point, at once: the camera is then free. */
    setTarget: (point: THREE.Vector3) => {
      cue({ kind: "free" });
      aim = point.clone();
      aimGoal = point.clone();
      settled = false;
    },
    /** Moves the camera's target along the floor, in scene metres. The player's pan: the camera is then free. */
    panBy: (dx: number, dz: number) => {
      cue({ kind: "free" });
      const by = new THREE.Vector3(dx, 0, dz);
      aimGoal = aimingAt().add(by);
      aim?.add(by);
      pinned = null;
      settled = false;
    },
    /** Turns the camera round the vertical and tilts it up from the floor, in radians, within the tilt limits. */
    orbitBy: (yawBy: number, pitchBy = 0) => {
      yawBeforeCloseUp = null;
      yaw += yawBy;
      pitch = clampPitch(pitch + pitchBy);
      yawGoal = null;
      pitchGoal = null;
      settled = false;
    },
    zoomBy: (factor: number) => hook.setZoom(view.zoom * factor),
    /** Eases the camera to any of a target point (freeing it), an angle round the vertical, a tilt and a zoom. */
    easeTo: ({ target, yaw: toYaw, pitch: toPitch, zoom: toZoom }: { target?: THREE.Vector3; yaw?: number; pitch?: number; zoom?: number }) => {
      if (target) {
        cue({ kind: "free" });
        aimGoal = target.clone();
      }
      if (toYaw !== undefined) yawGoal = wrapNear(toYaw, yaw);
      if (toPitch !== undefined) pitchGoal = clampPitch(toPitch);
      if (toZoom !== undefined) hook.setZoom(toZoom);
      settled = false;
    },
    /** Pans to something, keeping the player's angles and zoom. */
    frame: (what: Framing | null) => play({ kind: "frame", framing: what }),
    /** Follows the active figure again: the camera glides to it and its floor, keeping the player's angles and zoom. */
    follow: () => {
      cue({ kind: "follow" });
      pinned = null;
      settled = false;
    },
  };

  const hook: SceneHook = {
    frameCount: () => frames,
    setView: (next) => {
      update({ view: ((next % 4) + 4) % 4 });
      yawGoal = wrapNear(viewAngle(view.view), yaw);
      pitchGoal = DEFAULT_PITCH;
      settled = false;
    },
    turn: (step) => {
      yawGoal = (yawGoal ?? yaw) + (step * Math.PI) / 2;
      settled = false;
    },
    fit: () => {
      if (!mounted) return;
      const { house } = mounted;
      const room = view.closeUp === null ? null : placed(layout, view.closeUp);
      const fit = mounted.fitting(room ? tileCorners(house.cellCentre(room.floor, room.x, room.y)) : house.corners());
      cue({ kind: "free" });
      aimGoal = fit.target;
      hook.setZoom(fit.zoom);
      settled = false;
    },
    setZoom: (next) => {
      update({ zoom: THREE.MathUtils.clamp(next, ...ZOOM_RANGE) });
      settled = false;
    },
    /** The player's floor: the camera is then free. */
    setFloor: (floor) => {
      cue({ kind: "free" });
      showFloor(floor);
      settled = false;
    },
    stepFloor: (step) => hook.setFloor(stepFloor(floorsOf(layout), view.floor, step, active === null ? aimFloor() : figureFloor(active))),
    follow: () => camera.follow(),
    cameraMode: () => follow.mode,
    camera: () => {
      const { x, y, z } = aim ?? new THREE.Vector3();
      return { target: { x, y, z }, yaw, pitch, zoom: view.zoom };
    },
    reticle: () => pointed,
    setCloseUp: (room) => {
      update({ closeUp: room, floor: room ? tileFloor(room) : view.floor });
      if (room !== null && mounted) panTo(middleOf(mounted.house, [room]), tileFloor(room));
      settled = false;
    },
    setResolution: (resolution) => {
      update({ resolution });
      mounted?.applyResolution();
    },
    freezeClock: (at) => {
      // At once, not at the next frame: a beat started before that frame would start on the old clock and end, or never start, when it jumps.
      if (at !== null) seconds = at;
      update({ frozenAt: at });
    },
    isReady: () => mounted !== null && mounted.house.built() && settled,
    isFullyLit: () => hook.isReady() && !bakes.status().pending && mounted?.house.figuresIn() === true,
    roomsShown: () => mounted?.house.roomsShown() ?? 0,
    roomShownAs: (room) => mounted?.house.shownAs(room) ?? null,
    bake: bakes.status,
    floors: () => floorsOf(layout),
    rooms: (floor) => layout.tiles.filter((tile) => tile.floor === floor).map((tile) => tile.tile),
    stats: () => {
      if (!mounted) throw new Error("The house scene is not mounted");
      return mounted.stats();
    },
    rebake: (room) => {
      if (!mounted) throw new Error("The house scene is not mounted");
      return mounted.house.rebake(room);
    },
    focus: focusTarget,
    showChoices: (show) => update({ showMarks: show }),
    raiseWalls: (raised) => {
      if (raised !== view.wallsRaised) update({ wallsRaised: raised });
    },
    screenPoint: (id) => {
      if (!mounted) return null;
      const place = placesOf(mounted.house).find((candidate) => candidate.id === id)?.place;
      const at = place && mounted.project(place.anchor);
      if (!at) return null;
      const rect = mounted.container.getBoundingClientRect();
      return { x: at.x + rect.left, y: at.y + rect.top };
    },
    targetAt: (point) => {
      if (!mounted) return null;
      const rect = mounted.container.getBoundingClientRect();
      return pointAt(mounted.layoutNow().targets, { x: point.x - rect.left, y: point.y - rect.top });
    },
  };

  function mount(ctx: ThreeSceneContext): ThreeSceneHandlers {
    const { scene, camera: lens, renderer, container } = ctx;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.imageRendering = "pixelated";
    renderer.toneMappingExposure = 1.5;
    lens.fov = FIELD_OF_VIEW;
    container.style.touchAction = "none";

    // Shaders compile on the GPU's own threads before what uses them shows (a room while it bakes, a figure while it is meshed),
    // so no frame waits for one. A room's and a figure's are compiled for the scene with the house in it, so they start once it is staged.
    const readyShaders = shaderReadier(renderer, lens, scene);
    let staged!: () => void;
    const onStage = new Promise<void>((resolve) => {
      staged = resolve;
    });
    // The rooms are built a few each frame, the floor showing first, and each floor's bake starts as soon as its rooms are in;
    // the figures are meshed by workers, each standing in as its pawn until it lands. So the house shows from the first frame.
    const slices = frameSlicer(BUILD_BUDGET_MS);
    const house = buildHouse(layout, bakes, {
      prepare: (object) => onStage.then(() => readyShaders(object)),
      slices,
      figures: meshInWorkers,
    });
    for (const figure of figures.values()) placeFigure(house, figure);
    house.setMood(mood, { shifting: false });
    scene.fog = house.fog;
    scene.background = house.background;
    // What the house holds from the start (its lights, the pawns, the route) joins the scene once its shaders are ready too.
    let unmounted = false;
    void readyShaders(house.root).then(() => {
      if (unmounted) return;
      scene.add(house.root);
      staged();
    });
    // What lies behind the house (`?backdrop=night`), drawn before it; off, the background is the fog's colour.
    const backdrop = backdropKind() === "night" ? createBackdrop(house.fill.color) : null;
    if (backdrop) {
      void readyShaders(backdrop.mesh).then(() => {
        if (!unmounted) scene.add(backdrop.mesh);
      });
    }

    let cutaway = new THREE.Vector2(1, 1).normalize();
    aim = null;
    const raycaster = new THREE.Raycaster();

    /** The height of the floor the camera's target lies on. */
    const level = () => house.cellCentre(aimFloor(), 0, 0).y;
    /** Metres of floor across the screen's short side at a zoom. */
    const spanAt = (at: number) => BASE_SPAN / at;
    /** The tangent of half the view's angle across the screen's short side. */
    const shortSide = () => Math.tan(THREE.MathUtils.degToRad(lens.fov) / 2) * Math.min(1, lens.aspect);
    /** The unit direction from the camera's target back to the camera, at an angle round the vertical and a tilt. */
    const backward = (round: number, up: number) => new THREE.Vector3(Math.sin(round) * Math.cos(up), Math.sin(up), Math.cos(round) * Math.cos(up));
    const centre = (): Point => ({ x: container.clientWidth / 2, y: container.clientHeight / 2 });

    /** A target kept on the floor showing, and no further than a little past its rooms. */
    const bounded = (point: THREE.Vector3): THREE.Vector3 => {
      const corners = house.corners();
      if (corners.length === 0) return point.clone().setY(level());
      const box = new THREE.Box3().setFromPoints(corners).expandByVector(new THREE.Vector3(PAN_MARGIN, 0, PAN_MARGIN));
      return new THREE.Vector3(THREE.MathUtils.clamp(point.x, box.min.x, box.max.x), level(), THREE.MathUtils.clamp(point.z, box.min.z, box.max.z));
    };
    /** Where the camera first looks: the active figure's room, or the middle of the floor. */
    const home = () => (active !== null ? middleOf(house, [figureOf(active).room]) : new THREE.Box3().setFromPoints(house.corners()).getCenter(new THREE.Vector3()));

    const placeCamera = (ease: number) => {
      const subject = followed(follow, active);
      if (subject !== null && "point" in subject) aimGoal = new THREE.Vector3(subject.point.x, subject.point.y, subject.point.z);
      else if (subject !== null && figures.has(subject.figure)) aimGoal = house.scenePoint(house.figureAt(subject.figure));
      const goal = bounded(aimGoal ?? home());
      aimGoal = goal;
      aim ??= goal.clone();
      aim.lerp(goal, ease);
      const span = spanAt(zoom);
      const distance = cameraDistance(zoom, lens.aspect);
      // Zooming in raises the lowest tilt, so the camera stays above the furniture.
      pitch = clampPitch(pitch, distance);
      lens.position.copy(aim).addScaledVector(backward(yaw, pitch), distance);
      lens.lookAt(aim);
      lens.updateMatrixWorld();
      const shown = shownBounds(house.root);
      const range = shown.isEmpty() ? null : depthRange(lens.position, lens.getWorldDirection(new THREE.Vector3()), lens.aspect, shown);
      if (range && (range.near !== lens.near || range.far !== lens.far)) {
        lens.near = range.near;
        lens.far = range.far;
        lens.updateProjectionMatrix();
      }

      const facing = new THREE.Vector2(lens.position.x - aim.x, lens.position.z - aim.z);
      if (facing.lengthSq() > 1e-6) cutaway = facing.normalize();
      house.setCutaway(cutaway, view.closeUp, view.wallsRaised);
      house.fog.near = Math.max(0, distance - span);
      house.fog.far = house.fog.near + (span * 2) / Math.max(HOUSE_LIGHT.fog.density, 0.01);
      return aim.distanceTo(goal) < 0.01;
    };

    const fitting = (points: THREE.Vector3[]) => {
      // From the angles the camera is turning to, so a fit straight after `setView` fits that view.
      const back = backward(yawGoal ?? yaw, pitchGoal ?? pitch);
      const fit = fitView(points, back, lens);
      // The fit aims at the middle of what it sees; the camera's target is where that line of sight meets the floor.
      const drop = (fit.target.y - level()) / back.y;
      return { target: fit.target.clone().addScaledVector(back, -drop), zoom: BASE_SPAN / (2 * shortSide() * (fit.distance + drop)) };
    };

    const floorHit = (point: Point): THREE.Vector3 | null => {
      raycaster.setFromCamera(new THREE.Vector2((point.x / container.clientWidth) * 2 - 1, 1 - (point.y / container.clientHeight) * 2), lens);
      return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -level()), new THREE.Vector3());
    };

    /** Centres an element over a point on the screen, raised by `lift` of its
     *  own height (lowered, below zero), but never past the screen's edges:
     *  a target near one would carry its tag off it. */
    const pin = (element: HTMLElement, at: Point, lift: number) => {
      const { offsetWidth: width, offsetHeight: height } = element;
      const x = Math.max(SCREEN_MARGIN, Math.min(at.x - width / 2, container.clientWidth - width - SCREEN_MARGIN));
      const y = Math.max(SCREEN_MARGIN, Math.min(at.y - height * lift, container.clientHeight - height - SCREEN_MARGIN));
      element.style.transform = `translate(${x}px, ${y}px)`;
    };

    const project = (point: THREE.Vector3): Point | null => {
      const ndc = point.clone().project(lens);
      if (ndc.z > 1) return null;
      return { x: ((ndc.x + 1) / 2) * container.clientWidth, y: ((1 - ndc.y) / 2) * container.clientHeight };
    };
    const layoutNow = (): ChoiceLayout => choiceLayout(placesOf(house), focused, project);
    /** Where a target's outline lies across the screen: its middle, top and bottom; null where it doesn't show. */
    const screenSpan = (place: TargetPlace | undefined): { middle: number; top: number; bottom: number } | null => {
      const corners = place?.outline?.map(project);
      if (!corners?.every((corner) => corner !== null)) return null;
      const [xs, ys] = [corners.map((corner) => corner.x), corners.map((corner) => corner.y)];
      return { middle: (Math.min(...xs) + Math.max(...xs)) / 2, top: Math.min(...ys), bottom: Math.max(...ys) };
    };

    /** The selection: the reticle's choice, or the focused one where a pointer selects. */
    const selection = () => (usesReticle(view.input) ? pointed : focused);

    const controls = attachControls(container, {
      layout: layoutNow,
      focus: focusTarget,
      blur: () => input.blur?.(),
      commit: (id) => input.commit(id),
      confirm: () => {
        // A thing in a room is read whatever the decision offers.
        const at = selection();
        if (at !== null && things.has(at)) {
          input.commit(at);
          return;
        }
        if (targets.length === 0) {
          input.confirm();
          return;
        }
        // With a ghost offered, confirming with nothing else selected places it.
        const chosen = selection() ?? ghostOf(targets)?.id ?? null;
        if (chosen !== null) input.commit(chosen);
      },
      explorer: () => input.explorer?.(),
      menu: () => input.menu?.(),
      endTurn: (held) => input.endTurn?.(held),
      covered: () => input.covered?.() ?? false,
      padButton: (button, pad) => input.padButton?.(button, pad) ?? false,
      padMay: (pad) => input.padMay?.(pad) ?? true,
      back: () => {
        // Backing out of a jump stops the camera where it is.
        if (pinned !== null && aim) lookAt(aim, aimFloor());
        pinned = null;
        pointed = null;
        input.back?.();
      },
      cycle: (step) => {
        if (input.cycle?.(step)) return;
        // The d-pad steps the choices; the things in the rooms are pointed at, never stepped to.
        const points = layoutNow().points.filter((point) => !things.has(point.id));
        const current = selection();
        // Read again when the selection isn't in it: a choice behind the camera when it was read.
        if (cycleOrder === null || (current !== null && !cycleOrder.includes(current))) cycleOrder = [...points].sort((a, b) => a.x - b.x || a.y - b.y).map((point) => point.id);
        const at = current === null ? -1 : cycleOrder.indexOf(current);
        const id = at === -1 ? cycleChoice(points, current, step, centre()) : cycleOrder[(at + step + cycleOrder.length) % cycleOrder.length];
        if (id === null) return;
        focusTarget(id);
        const place = placesOf(house).find((candidate) => candidate.id === id)?.place;
        if (place) {
          // The target where the line of sight through the choice's anchor meets the floor, so the anchor shows at the screen's centre.
          const back = backward(yaw, pitch);
          lookAt(place.anchor.clone().addScaledVector(back, -(place.anchor.y - level()) / back.y), place.floor);
        }
        pinned = id;
        pointed = id;
        settled = false;
      },
      pan: (right, down) => {
        const metres = spanAt(zoom);
        const move = panOnFloor(right * metres, down * metres, yaw);
        camera.panBy(move.x, move.z);
      },
      drag: (from, to) => {
        const [a, b] = [floorHit(from), floorHit(to)];
        if (a && b) camera.panBy(a.x - b.x, a.z - b.z);
      },
      orbit: (yawBy, pitchBy) => camera.orbitBy(yawBy, pitchBy),
      zoom: (factor) => camera.zoomBy(factor),
      floor: (step) => hook.stepFloor(step),
      follow: () => camera.follow(),
      controlling: (on) => {
        handsOn = on;
        settled = false;
      },
      raiseWalls: hook.raiseWalls,
      usedInput: (kind) => {
        if (kind !== view.input) update({ input: kind });
      },
    });

    /** Points the reticle at whatever is under the screen's centre, as the mouse points at what is under it, and tells the driver when that changes. */
    const showReticle = () => {
      const reticle = usesReticle(view.input);
      const under = reticle ? pointAt(layoutNow().targets, centre()) : null;
      if (pinned !== null && !targets.some((target) => target.id === pinned)) pinned = null;
      if (reticle && pinned === null && under !== underReticle) {
        pointed = under;
        if (under !== null) input.focus(under);
        else input.blur?.();
      }
      underReticle = under;
      if (!reticle) pointed = null;
      if (!reticleMark) return;
      reticleMark.style.visibility = reticle && view.showMarks ? "visible" : "hidden";
      reticleMark.dataset.pointing = String(pointed !== null);
      const middle = centre();
      reticleMark.style.transform = `translate(${middle.x}px, ${middle.y}px) translate(-50%, -50%)`;
    };

    const applyResolution = () => {
      const shortSide = view.resolution;
      const { clientWidth, clientHeight } = container;
      const ratio = shortSide === null ? window.devicePixelRatio : shortSide / Math.min(clientWidth, clientHeight);
      ctx.setPixelRatio(ratio);
    };

    /** Shows what the scene holds: the floor, whose turn it is, and the targets with the focused one's route. */
    let shownFloor: FloorChoice | null = null;
    let shownMarks = "";
    const sync = () => {
      if (view.floor !== shownFloor) {
        shownFloor = view.floor;
        house.showFloor(view.floor);
        const lowest = view.floor === "all" ? (house.floors[0] ?? "ground") : view.floor;
        backdrop?.show({ underground: view.floor === "basement", floorY: house.cellCentre(lowest, 0, 0).y, groundFloorY: house.cellCentre("ground", 0, 0).y });
      }
      house.setActive(active);
      things.focus(focused);
      const offering = view.showMarks && !walkingNow() && !movingNow();
      const places = offering ? placesOf(house) : [];
      const marks = places.flatMap(({ place }) => place.mark ?? []);
      const key = JSON.stringify([marks, layout.tiles.length]);
      if (key !== shownMarks) {
        shownMarks = key;
        house.setMarks(marks, focused);
      } else {
        house.focusMark(focused);
      }
      const ghost = ghostOf(targets);
      house.setGhost(ghost && { tile: ghost.tile, floor: ghost.floor, x: ghost.x, y: ghost.y, rotation: ghost.rotation });
      const going = targets.find((target) => target.id === focused);
      const routed = offering && (going?.kind === "room" || going?.kind === "explore") ? going : null;
      const end = routed && routeEnd(layout, routed);
      const onward = routed?.kind === "explore" ? exploreEntry(layout, routed).slice(1) : [];
      house.showRoute(routed?.route && end ? [...walkPath(layout, routed.route.rooms, house.figureAt(routed.route.figure), end, definition, roundStanding(new Set([routed.route.figure]))), ...onward] : null);
      settled = false;
    };

    const gl = renderer.getContext();
    const guard = budgetGuard(renderer);
    let liveLights = 0;
    scene.traverse((object) => {
      if (object instanceof THREE.Light) liveLights++;
    });
    const stats = (): HouseStats => {
      const baked = house.rooms.filter((room) => view.floor === "all" || room.floor === view.floor).flatMap((room) => room.room.lights);
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        bakedLights: baked.length,
        liveLights,
        renderMs: ctx.mainRenderMs(),
        textureUnitsUsed: guard.samplers(),
        maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number,
        maxFragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number,
        drawingBuffer: [size.x, size.y],
        bakeMs: Object.fromEntries([...house.bakes].map(([floor, bake]) => [floor, Math.round(bake.ms)])),
      };
    };

    // What the phone test needs at a glance, under the frame-rate panel: the
    // draw calls and texture units the budgets hold, and how long the bake took.
    const readout = document.createElement("pre");
    readout.className = "pointer-events-none absolute top-12 right-0 m-0 bg-(--bt-panel) px-1 text-[10px] leading-tight text-(--bt-muted)";
    if (showsReadout) container.appendChild(readout);
    const showReadout = () => {
      if (!showsReadout) return;
      const now = stats();
      const bake = Object.entries(now.bakeMs).map(([floor, ms]) => `${floor} ${ms}`).join(", ");
      readout.textContent = [
        `draw ${now.calls}/${MAX_DRAW_CALLS} · tri ${Math.round(now.triangles / 1000)}k`,
        `tex units ${now.textureUnitsUsed}/${Math.min(now.maxTextureUnits, MAX_TEXTURE_UNITS)} (gpu ${now.maxTextureUnits})`,
        `render ${now.renderMs.toFixed(1)} ms · ${now.drawingBuffer.join("×")}`,
        `bake ms: ${bake || "…"}`,
        `lightmap ${LIGHTMAP.texelsPerMetre}/m ${LIGHTMAP.filter}`,
      ].join("\n");
    };

    scene.add(things.root);
    things.mount(readyShaders);
    mounted = { house, sync, applyResolution, stats, layoutNow, project, container, placeCamera, floorHit, fitting };
    sync();

    return {
      onFrame: (delta) => {
        slices.frame();
        guard.check();
        frames++;
        if (frames % 10 === 0) showReadout();
        seconds = view.frozenAt ?? seconds + delta;
        controls.frame(delta);
        for (const beat of playing) beat.carry?.pose();
        house.update(seconds);
        things.update(house, seconds, view.floor);
        keepFollowedFloor();

        const ease = Math.min(1, delta * EASE_RATE);
        let still = !handsOn;
        if (yawGoal !== null) {
          yaw += (yawGoal - yaw) * ease;
          if (Math.abs(yawGoal - yaw) < 0.002) [yaw, yawGoal] = [yawGoal, null];
          else still = false;
        }
        if (pitchGoal !== null) {
          pitch += (pitchGoal - pitch) * ease;
          if (Math.abs(pitchGoal - pitch) < 0.002) [pitch, pitchGoal] = [pitchGoal, null];
          else still = false;
        }
        zoom += (view.zoom - zoom) * ease;
        if (Math.abs(view.zoom - zoom) < 0.002) zoom = view.zoom;
        else still = false;
        const arrived = placeCamera(ease);
        settled = still && arrived && house.built();
        showReticle();
        for (const beat of [...playing]) if (beat.over()) beat.end();
        const ghost = turning();
        // A ghost's tag and turning handles sit off its floor, above and below it, clear of the marks at its doorways.
        const ghostSpan = ghost === null ? null : screenSpan(placesOf(house).find(({ id }) => id === ghost)?.place);
        if (label) {
          const place = view.showMarks && !walkingNow() && !movingNow() ? placesOf(house).find(({ id }) => id === focused)?.place : undefined;
          const at = focused !== null && focused === ghost ? ghostSpan && { x: ghostSpan.middle, y: ghostSpan.top } : place ? project(place.anchor) : null;
          label.style.visibility = at ? "visible" : "hidden";
          if (at) pin(label, at, 1.5);
        }
        const apart: { pinned: Pin; at: Point; lift: number }[] = [];
        for (const pinned of [...pins.values()].flat()) {
          const point = pinPoint(house, pinned);
          const at = point && project(point);
          const onScreen = at && at.x >= 0 && at.y >= 0 && at.x <= container.clientWidth && at.y <= container.clientHeight;
          // A clamped pin whose point doesn't show (on another floor, behind the camera) waits at the top of the screen.
          const shown = onScreen ? at : pinned.clamp ? (at ?? { x: container.clientWidth / 2, y: 0 }) : null;
          pinned.element.style.visibility = shown ? "visible" : "hidden";
          if (!shown) continue;
          if (pinned.apart) apart.push({ pinned, at: shown, lift: at ? pinned.lift : 0 });
          else pin(pinned.element, shown, at ? pinned.lift : 0);
        }
        const boxes = apart.map(({ pinned: { element }, at, lift }) => ({ x: at.x, top: at.y - element.offsetHeight * lift, width: element.offsetWidth, height: element.offsetHeight }));
        const xs = pinsApart(boxes, PIN_GAP, { left: SCREEN_MARGIN, right: container.clientWidth - SCREEN_MARGIN });
        for (const [i, { pinned, at, lift }] of apart.entries()) pin(pinned.element, { x: xs[i], y: at.y }, lift);
        if (ghostHandles) {
          const at = ghostSpan && !usesReticle(view.input) ? { x: ghostSpan.middle, y: ghostSpan.bottom } : null;
          ghostHandles.style.visibility = at ? "visible" : "hidden";
          if (at) pin(ghostHandles, at, -0.25);
        }
      },
      onResize: () => {
        applyResolution();
        placeCamera(1);
      },
      dispose: () => {
        finish();
        readout.remove();
        controls.dispose();
        unmounted = true;
        scene.remove(house.root);
        things.unmount();
        scene.remove(things.root);
        house.dispose();
        if (backdrop) {
          scene.remove(backdrop.mesh);
          backdrop.dispose();
        }
        bakes.stop();
        mounted = null;
      },
    };
  }

  return {
    mount,
    hook,
    /** The background bake, for the screen's indicator and the debug view. */
    bakes,
    camera,
    setLayout,
    setFigures,
    setTargets,
    /** The things living in the rooms, as they show. */
    setThings: (next: readonly ShownThing[]) => {
      things.set(next, layout);
      mounted?.sync();
    },
    setActive,
    /** The house's light as a whole: shifting to the haunt's at its reveal, or set at once (a game resumed mid-haunt). */
    setMood: (next: HouseMood, how: { shifting: boolean }) => {
      mood = next;
      mounted?.house.setMood(next, how);
    },
    mood: () => mood,
    play,
    finish,
    /** Who hears the player focus, commit and confirm. */
    setInput: (next: SceneInput) => {
      input = next;
    },
    /** Sets the input the hints are for, as using it would: hot-seat restores the acting seat's own. */
    setInputKind: (kind: InputKind) => {
      if (kind !== view.input) update({ input: kind });
    },
    resolutions: RESOLUTIONS,
    zoomRange: ZOOM_RANGE,
    setLabel: (element: HTMLElement | null) => {
      label = element;
    },
    setReticle: (element: HTMLElement | null) => {
      reticleMark = element;
    },
    setGhostHandles: (element: HTMLElement | null) => {
      ghostHandles = element;
    },
    /** Keeps these page elements over their figures and rooms while they show, replacing the group's set before. */
    setPins: (group: string, next: readonly Pin[]) => {
      if (next.length === 0) pins.delete(group);
      else pins.set(group, next);
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    view: () => view,
  };
}

export type HouseScene = ReturnType<typeof createHouseScene>;

import * as THREE from "three";
import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import type { StandardButton } from "@/shared/lib/gamepad";
import { FLOORS, placed, type Layout } from "../engine/board";
import { attachControls, usesReticle, type ChoiceLayout, type InputKind } from "../input/controls";
import { panOnFloor } from "../input/gestures";
import { cycleChoice, pickTarget, reticleTarget, stepFloor, type Point } from "../input/navigate";
import type { FloorId } from "../types";
import type { Pace } from "./explorers/figure";
import { buildHouse, definition, tileCorners, type FloorChoice, type House, type HouseFigure } from "./house";
import type { LayoutChange } from "./house-layout";
import { choiceLayout, FINGER, followFloor, routeEnd, targetPlace, type Target, type TargetPlace } from "./house-targets";
import { walkPath, walkPose, type Stairway, type Walk } from "./house-walk";
import { workerBaker } from "./bake-workers";
import type { Rebake } from "./lit-floor";
import { DEFAULT_MARKINGS, type Markings } from "./markings";
import { budgetGuard, HOUSE_LIGHT, LIGHTMAP, MAX_DRAW_CALLS, MAX_TEXTURE_UNITS } from "./lighting";
import { TILE } from "./room";
import { clampPitch, DEFAULT_PITCH } from "./house-camera";

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
const FIELD_OF_VIEW = 32;
/** Metres of floor across the screen's short side at zoom 1: about four rooms. */
const BASE_SPAN = 24;
const ZOOM_RANGE = [0.3, 4] as const;
/** How quickly the camera eases to where it is going: the share of the way it closes each second, roughly. */
const EASE_RATE = 6;
/** How far past the rooms showing the camera's target may be panned, in metres. */
const PAN_MARGIN = TILE / 2;
/** The reticle snaps to a choice this close to the screen's centre, in CSS pixels. */
const RETICLE_SNAP = FINGER;

/** A figure in the house: who it is, how it is built, and where it stands at
 *  rest: a room, and its place there (0 the pawn spot, 1 beside it). */
export interface FigureSpec extends HouseFigure {
  room: string;
  slot: number;
}

/** What the camera pans to: one room, with its back walls standing; or these rooms on the floor showing. */
export type Framing = { closeUp: string } | { rooms: readonly string[] };

/** A beat of animation. Each resolves when it has played out, or at once on `finish`. */
export type Beat =
  /** A figure walks (or runs) its route of rooms to its place (`slot`) in the last, which is where it then rests. */
  | { kind: "walk"; figure: string; route: readonly string[]; slot: number; pace?: Pace }
  /** A room placed by `setLayout` shows, once it is baked with its light. */
  | { kind: "appear"; room: string }
  /** The camera pans to something, keeping the player's angles and zoom, or
   *  (null) lets a close view's walls down; resolves once it has settled. */
  | { kind: "frame"; framing: Framing | null }
  /** A pause on the stage's clock, for a step the player should see. */
  | { kind: "pause"; seconds: number };

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
}

/** Where the camera is: the point on the floor it looks at, its angles round
 *  the vertical and up from the floor, its zoom, and the floor
 *  showing. `following` is whether it is following a figure as it walks. */
export interface CameraState {
  target: THREE.Vector3;
  yaw: number;
  pitch: number;
  zoom: number;
  floor: FloorChoice;
  following: boolean;
}

/** Whoever drives the scene, told what the player does with the targets. */
export interface SceneInput {
  focus: (id: string) => void;
  commit: (id: string) => void;
  /** The player confirms with no target offered: going on from a moment shown. */
  confirm: () => void;
  /** The player backs out: the focus is cleared, or a selection pending cancelled. */
  back?: () => void;
  /** The reticle has left every choice, so nothing has the focus. */
  blur?: () => void;
  /** Turns the ghost of a room being placed to its next way round, clockwise
   *  seen from above (1) or back (-1). While a ghost is offered, the keys and
   *  buttons that turn things (Q and E, the bumpers, the d-pad's left and
   *  right, a tap on it) turn the ghost instead of
   *  the camera or the selection. */
  rotate?: (step: 1 | -1) => void;
  /** Offered every pad button press before the house: true when it was taken. */
  padButton?: (button: StandardButton) => boolean;
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
  /** Brings the view back to the explorer whose turn it is: their room and floor, keeping the angles and zoom. */
  recentre: () => void;
  /** Where the camera looks, its angles round the vertical and up from the floor, and its zoom. */
  camera: () => { target: { x: number; y: number; z: number }; yaw: number; pitch: number; zoom: number };
  /** The choice the screen-centre reticle selects, or null; null too when the pointer is the selection. */
  reticle: () => string | null;
  setZoom: (zoom: number) => void;
  setFloor: (floor: FloorChoice) => void;
  setCloseUp: (room: string | null) => void;
  setResolution: (resolution: Resolution) => void;
  freezeClock: (seconds: number | null) => void;
  /** The house is built and baked, and the camera has settled. */
  isReady: () => boolean;
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
  /** True once it has played out on its own; it is then over. */
  over: () => boolean;
  end: () => void;
}

/** The house scene: `layout`'s rooms, one floor at a time or all stacked,
 *  driven by `setLayout`, `setFigures`, `setTargets`, `setActive` and `play`.
 *  Plain state outside React, so a page, tests and screenshot tools drive the same thing. */
/** `readout` adds the performance readout (draw calls, texture units, bake
 *  times) under the frame-rate panel, for the house demo's phone tests.
 *  `markings` are the cutaway markings its rooms are built with (null for none). */
export function createHouseScene(initial: Layout, { readout: showsReadout = false, markings = DEFAULT_MARKINGS }: { readout?: boolean; markings?: Markings | null } = {}) {
  let layout = initial;
  const figures = new Map<string, FigureSpec>();
  let targets: readonly Target[] = [];
  let focused: string | null = null;
  let active: string | null = null;
  /** The floor the active figure was last seen on, for following them. */
  let activeFloor: FloorId | null = null;
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
  };
  const listeners = new Set<() => void>();
  /** The camera's angles round the vertical and up from the floor, and its zoom, eased towards their goals (the zoom's is `view.zoom`). */
  let yaw = viewAngle(view.view);
  let pitch = DEFAULT_PITCH;
  let zoom = view.zoom;
  let yawGoal: number | null = null;
  let pitchGoal: number | null = null;
  /** The point on the floor the camera looks at, and where it is easing to; null until the house first shows. */
  let aim: THREE.Vector3 | null = null;
  let aimGoal: THREE.Vector3 | null = null;
  /** A figure the camera follows as it walks, until the player takes the camera. */
  let following: string | null = null;
  /** The player has a hand on the camera, so the game may not move it. */
  let handsOn = false;
  /** A choice a jump went to, which the reticle holds until the player pans away. */
  let pinned: string | null = null;
  /** A choice the player backed out of, which the reticle passes over until it leaves it. */
  let dismissed: string | null = null;
  /** The reticle's choice as the driver was last told it. */
  let reticleSelected: string | null = null;

  const playing = new Set<Playing>();
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
  /** A page element the scene keeps at the screen's centre, or snapped onto the choice it selects, while the reticle is the selection. */
  let reticleMark: HTMLElement | null = null;
  /** A page element the scene keeps on the ghost of a room being placed, for its turning handles; hidden with a controller, which turns it with buttons. */
  let ghostHandles: HTMLElement | null = null;

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

  /** The camera pans to a point, keeping the player's angles and zoom, unless the player has a hand on it. */
  function panTo(point: THREE.Vector3) {
    if (handsOn) return;
    aimGoal = point.clone();
    following = null;
    pinned = null;
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

  const placeContext = (house: House) => ({ layout, showing: view.floor, stairway, scenePoint: house.scenePoint, figureAt: house.figureAt });
  const placesOf = (house: House): { id: string; place: TargetPlace }[] => {
    const context = placeContext(house);
    return targets.map((target) => ({ id: target.id, place: targetPlace(target, context) }));
  };
  const walkingNow = () => [...playing].some((beat) => beat.walk !== undefined);
  const ghostOf = (list: readonly Target[]) => list.find((target): target is Extract<Target, { kind: "ghost" }> => target.kind === "ghost") ?? null;
  /** The ghost the player can turn: offered, with someone to tell. */
  const turning = () => (input.rotate ? (ghostOf(targets)?.id ?? null) : null);

  /** Moves the focus to a target, showing its floor if it doesn't show on this one. */
  function focusTarget(id: string) {
    const target = targets.find((candidate) => candidate.id === id);
    if (!target) return;
    if (mounted && view.floor !== "all") {
      const place = targetPlace(target, placeContext(mounted.house));
      if (place.outline === null) showFloor(place.floor);
    }
    input.focus(id);
  }

  // ---- What the house shows ----

  function setLayout(next: Layout): LayoutChange | null {
    layout = next;
    const change = mounted?.house.setLayout(next) ?? null;
    // A room appearing (discovered, or placed by a rule) is something to see: the camera pans to it.
    const shownNow = change?.added.filter((room) => view.floor === "all" || tileFloor(room) === view.floor) ?? [];
    if (mounted && shownNow.length > 0) panTo(middleOf(mounted.house, shownNow));
    settled = false;
    return change;
  }

  function placeFigure(house: House, figure: FigureSpec) {
    house.addFigure(figure, house.spot(figure.room, figure.slot), house.roomHeading(figure.room));
  }

  function setFigures(specs: readonly FigureSpec[]) {
    const house = mounted?.house;
    const wanted = new Map(specs.map((spec) => [spec.id, spec] as const));
    for (const [id, old] of figures) {
      const next = wanted.get(id);
      if (next && next.build === old.build && next.colour === old.colour) continue;
      house?.removeFigure(id);
      figures.delete(id);
      if (active === id) active = null;
    }
    const walking = new Set([...playing].flatMap((beat) => (beat.walk ? [beat.walk.figure] : [])));
    for (const spec of specs) {
      const old = figures.get(spec.id);
      figures.set(spec.id, { ...spec });
      if (!house) continue;
      if (!old) placeFigure(house, spec);
      else if ((old.room !== spec.room || old.slot !== spec.slot) && !walking.has(spec.id)) house.stand(spec.id, house.spot(spec.room, spec.slot));
    }
    mounted?.sync();
  }

  /** The targets a decision offers, and the one the focus is on. */
  function setTargets(next: readonly Target[], focus: string | null) {
    const ids = (list: readonly Target[]) => list.map((target) => target.id).join("\n");
    if (ids(next) !== ids(targets)) {
      pinned = null;
      dismissed = null;
    }
    // A ghost put on a new cell is shown: its floor, and the camera panned to it.
    const [ghost, was] = [ghostOf(next), ghostOf(targets)];
    if (ghost && (ghost.floor !== was?.floor || ghost.x !== was.x || ghost.y !== was.y)) {
      if (view.floor !== "all") showFloor(ghost.floor);
      if (mounted) panTo(mounted.house.cellCentre(ghost.floor, ghost.x, ghost.y));
    }
    targets = next;
    focused = focus;
    mounted?.sync();
  }

  /** Whose turn it is: the light follows them, the camera pans to them, and
   *  the view goes to their floor if it was on the floor of whoever went before. */
  function setActive(id: string | null) {
    if (id !== null) {
      const floor = figureFloor(id);
      const showing = activeFloor === null ? floor : followFloor(view.floor, activeFloor, floor);
      activeFloor = floor;
      showFloor(showing);
    } else {
      activeFloor = null;
    }
    if (id !== active && id !== null && mounted) panTo(mounted.house.scenePoint(mounted.house.figureAt(id)));
    active = id;
    mounted?.sync();
  }

  // ---- Beats ----

  function play(beat: Beat): Promise<void> {
    return new Promise((resolve) => {
      const start = (over: () => boolean, end: () => void) => {
        const entry: Playing = {
          kind: beat.kind,
          over,
          end: () => {
            playing.delete(entry);
            end();
            resolve();
            if (!walkingNow() && view.walking) update({ walking: false });
          },
          ...(beat.kind === "walk" ? { walk: { figure: beat.figure, route: beat.route } } : {}),
        };
        playing.add(entry);
      };
      switch (beat.kind) {
        case "walk": {
          const figure = figureOf(beat.figure);
          for (const other of [...playing]) if (other.walk?.figure === beat.figure) other.end();
          const destination = beat.route[beat.route.length - 1];
          figures.set(beat.figure, { ...figure, room: destination, slot: beat.slot });
          const house = mounted?.house;
          if (!house) {
            resolve();
            return;
          }
          const walk: Walk = { path: walkPath(layout, beat.route, house.figureAt(beat.figure), house.spot(destination, beat.slot), stairway), start: seconds, pace: beat.pace };
          house.walk(beat.figure, walk);
          start(
            () => walkPose(walk, seconds).done,
            () => {
              const rest = figureOf(beat.figure);
              house.stand(beat.figure, house.spot(rest.room, rest.slot), walkPose(walk, Infinity).heading);
              if (following === beat.figure) following = null;
            },
          );
          if (!handsOn) following = beat.figure;
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
          if (mounted && showing.length > 0) panTo(middleOf(mounted.house, showing));
          settled = false;
          update({ closeUp });
          start(
            () => settled,
            () => mounted?.placeCamera(1),
          );
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
  const aimFloor = (): FloorId => (view.floor !== "all" ? view.floor : (activeFloor ?? floorsOf(layout)[0]));

  /** The camera's target, as far as it is going. */
  const aimingAt = () => (aimGoal ?? aim ?? new THREE.Vector3()).clone();

  const camera = {
    state: (): CameraState => ({ target: (aim ?? new THREE.Vector3()).clone(), yaw, pitch, zoom: view.zoom, floor: view.floor, following: following !== null }),
    /** Puts the camera's target on a point, at once. */
    setTarget: (point: THREE.Vector3) => {
      aim = point.clone();
      aimGoal = point.clone();
      following = null;
      settled = false;
    },
    /** Moves the camera's target along the floor, in scene metres. The player's pan: it stops the camera following anyone. */
    panBy: (dx: number, dz: number) => {
      const by = new THREE.Vector3(dx, 0, dz);
      aimGoal = aimingAt().add(by);
      aim?.add(by);
      following = null;
      pinned = null;
      settled = false;
    },
    /** Turns the camera round the vertical and tilts it up from the floor, in radians, within the tilt limits. */
    orbitBy: (yawBy: number, pitchBy = 0) => {
      yaw += yawBy;
      pitch = clampPitch(pitch + pitchBy);
      yawGoal = null;
      pitchGoal = null;
      settled = false;
    },
    zoomBy: (factor: number) => hook.setZoom(view.zoom * factor),
    /** Eases the camera to any of a target point, an angle round the vertical, a tilt and a zoom. */
    easeTo: ({ target, yaw: toYaw, pitch: toPitch, zoom: toZoom }: { target?: THREE.Vector3; yaw?: number; pitch?: number; zoom?: number }) => {
      if (target) aimGoal = target.clone();
      if (toYaw !== undefined) yawGoal = wrapNear(toYaw, yaw);
      if (toPitch !== undefined) pitchGoal = clampPitch(toPitch);
      if (toZoom !== undefined) hook.setZoom(toZoom);
      settled = false;
    },
    /** Pans to something, keeping the player's angles and zoom. */
    frame: (what: Framing | null) => play({ kind: "frame", framing: what }),
    /** Brings the camera back to the active figure: its room and floor, keeping the player's angles and zoom. */
    recentre: () => {
      if (active === null) return;
      showFloor(figureFloor(active));
      following = null;
      pinned = null;
      if (mounted) camera.easeTo({ target: middleOf(mounted.house, [figureOf(active).room]) });
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
      aimGoal = fit.target;
      following = null;
      hook.setZoom(fit.zoom);
      settled = false;
    },
    setZoom: (next) => {
      update({ zoom: THREE.MathUtils.clamp(next, ...ZOOM_RANGE) });
      settled = false;
    },
    setFloor: (floor) => {
      showFloor(floor);
      settled = false;
    },
    stepFloor: (step) => hook.setFloor(stepFloor(floorsOf(layout), view.floor, step, active === null ? aimFloor() : figureFloor(active))),
    recentre: () => camera.recentre(),
    camera: () => {
      const { x, y, z } = aim ?? new THREE.Vector3();
      return { target: { x, y, z }, yaw, pitch, zoom: view.zoom };
    },
    reticle: () => reticleSelected,
    setCloseUp: (room) => {
      update({ closeUp: room, floor: room ? tileFloor(room) : view.floor });
      if (room !== null && mounted) panTo(middleOf(mounted.house, [room]));
      settled = false;
    },
    setResolution: (resolution) => {
      update({ resolution });
      mounted?.applyResolution();
    },
    freezeClock: (at) => {
      update({ frozenAt: at });
    },
    isReady: () => mounted !== null && mounted.house.built() && settled,
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
      return pickTarget(mounted.layoutNow().targets, { x: point.x - rect.left, y: point.y - rect.top }, FINGER / 2);
    },
  };

  function mount(ctx: ThreeSceneContext): ThreeSceneHandlers {
    const { scene, camera: lens, renderer, container } = ctx;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.imageRendering = "pixelated";
    renderer.toneMappingExposure = 1.5;
    lens.fov = FIELD_OF_VIEW;
    lens.near = 0.1;
    lens.far = 400;
    container.style.touchAction = "none";

    const baker = workerBaker();
    const house = buildHouse(layout, baker, markings);
    for (const figure of figures.values()) placeFigure(house, figure);
    scene.add(house.root);
    scene.fog = house.fog;
    scene.background = house.background;

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
      if (following !== null && !handsOn) aimGoal = house.scenePoint(house.figureAt(following));
      const goal = bounded(aimGoal ?? home());
      aimGoal = goal;
      aim ??= goal.clone();
      aim.lerp(goal, ease);
      const span = spanAt(zoom);
      const distance = span / (2 * shortSide());
      // Zooming in raises the lowest tilt, so the camera stays above the furniture.
      pitch = clampPitch(pitch, distance);
      lens.position.copy(aim).addScaledVector(backward(yaw, pitch), distance);
      lens.lookAt(aim);
      lens.updateMatrixWorld();

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

    /** The choice the screen-centre reticle selects, and where the reticle
     *  shows: a choice a jump went to, held until the player pans away; else
     *  the one under the centre or close to it, unless the player backed out
     *  of it; else nothing, with the reticle at the centre. */
    const reticleNow = (): { id: string | null; at: Point } => {
      const middle = centre();
      const { points, targets: onScreen } = layoutNow();
      if (pinned !== null && targets.some((target) => target.id === pinned)) return { id: pinned, at: points.find((point) => point.id === pinned) ?? middle };
      const hit = reticleTarget(onScreen, middle, RETICLE_SNAP);
      if (hit?.id !== dismissed) dismissed = null;
      return hit && hit.id !== dismissed ? hit : { id: null, at: middle };
    };
    /** The selection: the reticle's choice, or the focused one where a pointer selects. */
    const selection = () => (usesReticle(view.input) ? reticleNow().id : focused);

    const controls = attachControls(container, {
      layout: layoutNow,
      focus: focusTarget,
      commit: (id) => input.commit(id),
      confirm: () => {
        if (targets.length === 0) {
          input.confirm();
          return;
        }
        // With a ghost offered, confirming with nothing else selected places it.
        const chosen = selection() ?? ghostOf(targets)?.id ?? null;
        if (chosen !== null) input.commit(chosen);
      },
      rotating: turning,
      rotate: (step) => input.rotate?.(step),
      padButton: (button) => input.padButton?.(button) ?? false,
      back: () => {
        // Backing out of a jump stops the camera where it is, so the choice the reticle is passed over is the one it is on now.
        if (pinned !== null && aim) aimGoal = aim.clone();
        pinned = null;
        if (usesReticle(view.input)) dismissed = reticleNow().id;
        input.back?.();
      },
      cycle: (step) => {
        const id = cycleChoice(layoutNow().points, selection(), step, centre());
        if (id === null) return;
        focusTarget(id);
        const place = placesOf(house).find((candidate) => candidate.id === id)?.place;
        if (place) {
          // The target where the line of sight through the choice's anchor meets the floor, so the anchor shows at the screen's centre.
          const back = backward(yaw, pitch);
          aimGoal = place.anchor.clone().addScaledVector(back, -(place.anchor.y - level()) / back.y);
        }
        following = null;
        pinned = id;
        dismissed = null;
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
      recentre: () => camera.recentre(),
      controlling: (on) => {
        handsOn = on;
        settled = false;
      },
      raiseWalls: hook.raiseWalls,
      usedInput: (kind) => {
        if (kind !== view.input) update({ input: kind });
      },
    });

    /** Keeps the reticle on the screen and tells the driver when its choice changes. */
    const showReticle = () => {
      const reticle = usesReticle(view.input) ? reticleNow() : null;
      const selected = reticle?.id ?? null;
      if (reticle && selected !== reticleSelected) {
        if (selected !== null) input.focus(selected);
        else input.blur?.();
      }
      reticleSelected = selected;
      if (!reticleMark) return;
      reticleMark.style.visibility = reticle && view.showMarks ? "visible" : "hidden";
      reticleMark.dataset.snapped = String(selected !== null);
      if (reticle) reticleMark.style.transform = `translate(${reticle.at.x}px, ${reticle.at.y}px) translate(-50%, -50%)`;
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
      }
      house.setActive(active);
      const offering = view.showMarks && !walkingNow();
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
      const routed = offering && (going?.kind === "room" || going?.kind === "doorway") ? going : null;
      const end = routed && routeEnd(layout, routed, house.spot);
      house.showRoute(routed?.route && end ? walkPath(layout, routed.route.rooms, house.figureAt(routed.route.figure), end, stairway) : null);
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

    mounted = { house, sync, applyResolution, stats, layoutNow, project, container, placeCamera, floorHit, fitting };
    sync();

    return {
      onFrame: (delta) => {
        guard.check();
        frames++;
        if (frames % 10 === 0) showReadout();
        seconds = view.frozenAt ?? seconds + delta;
        controls.frame(delta);
        house.update(seconds);
        if (active !== null && activeFloor !== null) {
          const floor = house.figureAt(active).floor;
          if (floor !== activeFloor) {
            const showing = followFloor(view.floor, activeFloor, floor);
            activeFloor = floor;
            showFloor(showing);
          }
        }

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
          const place = view.showMarks && !walkingNow() ? placesOf(house).find(({ id }) => id === focused)?.place : undefined;
          const at = focused !== null && focused === ghost ? ghostSpan && { x: ghostSpan.middle, y: ghostSpan.top } : place ? project(place.anchor) : null;
          label.style.visibility = at ? "visible" : "hidden";
          if (at) label.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -150%)`;
        }
        if (ghostHandles) {
          const at = ghostSpan && !usesReticle(view.input) ? { x: ghostSpan.middle, y: ghostSpan.bottom } : null;
          ghostHandles.style.visibility = at ? "visible" : "hidden";
          if (at) ghostHandles.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, 25%)`;
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
        scene.remove(house.root);
        house.dispose();
        baker.dispose();
        mounted = null;
      },
    };
  }

  return {
    mount,
    hook,
    camera,
    setLayout,
    setFigures,
    setTargets,
    setActive,
    play,
    finish,
    /** Who hears the player focus, commit and confirm. */
    setInput: (next: SceneInput) => {
      input = next;
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
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    view: () => view,
  };
}

export type HouseScene = ReturnType<typeof createHouseScene>;

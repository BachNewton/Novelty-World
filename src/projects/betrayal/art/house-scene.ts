import * as THREE from "three";
import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import { FLOORS, placed, type Layout } from "../engine/board";
import { attachControls, type ChoiceLayout, type InputKind } from "../input/controls";
import { pickTarget, type Point } from "../input/navigate";
import type { FloorId } from "../types";
import type { Pace } from "./explorers/figure";
import { buildHouse, definition, tileCorners, type FloorChoice, type House, type HouseFigure } from "./house";
import type { LayoutChange } from "./house-layout";
import { choiceLayout, FINGER, followFloor, targetPlace, type Cell, type Target, type TargetPlace } from "./house-targets";
import { walkPath, walkPose, type Stairway, type Walk } from "./house-walk";
import { workerBaker } from "./bake-workers";
import type { Rebake } from "./lit-floor";
import { budgetGuard, HOUSE_LIGHT, LIGHTMAP, MAX_DRAW_CALLS, MAX_TEXTURE_UNITS } from "./lighting";

/*
 * The house as a picture of whatever is fed to it, with no game in it: a
 * layout of rooms, figures standing in them, the targets a decision offers,
 * whose turn it is, and beats of animation (a walk, a room appearing, the
 * camera framing something) that resolve on events. Nothing here ever holds
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
const ELEVATION = THREE.MathUtils.degToRad(40);
const PITCH_RANGE = [THREE.MathUtils.degToRad(12), THREE.MathUtils.degToRad(85)] as const;
const ZOOM_RANGE = [0.7, 4] as const;
/** How quickly the camera eases to where it is going: the share of the way it closes each second, roughly. */
const EASE_RATE = 6;

/** A figure in the house: who it is, how it is built, and where it stands at
 *  rest: a room, and its place there (0 the pawn spot, 1 beside it). */
export interface FigureSpec extends HouseFigure {
  room: string;
  slot: number;
}

/** What the camera frames: one room close, with its back walls standing; or these rooms on the floor showing. */
export type Framing = { closeUp: string } | { rooms: readonly string[] };

/** A beat of animation. Each resolves when it has played out, or at once on `finish`. */
export type Beat =
  /** A figure walks (or runs) its route of rooms to its place (`slot`) in the last, which is where it then rests. */
  | { kind: "walk"; figure: string; route: readonly string[]; slot: number; pace?: Pace }
  /** A room placed by `setLayout` shows, once it is baked with its light. */
  | { kind: "appear"; room: string }
  /** The camera frames something, or (null) goes back to framing the decision; resolves once it has settled. */
  | { kind: "frame"; framing: Framing | null }
  /** A pause on the stage's clock, for a step the player should see. */
  | { kind: "pause"; seconds: number };

/** How the view is set: the camera, the floor, and what shows. */
export interface SceneView {
  /** The standard view nearest the camera's angle, 0 to 3. */
  view: number;
  zoom: number;
  floor: FloorChoice;
  /** The room a close view frames, or null. */
  closeUp: string | null;
  resolution: Resolution;
  frozenAt: number | null;
  /** The input the player last used, for its button hints. */
  input: InputKind;
  /** Whether the targets glow and the route shows; off for judging the art alone. */
  showMarks: boolean;
  /** Whether a figure is walking. */
  walking: boolean;
}

/** Where the camera is: the point it looks at, its angles round the vertical
 *  and up from the floor, its zoom, and the floor showing. `following` is
 *  whether it frames what the game shows, rather than where the player put it. */
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
  confirm: () => void;
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
  setView: (view: number) => void;
  /** Swings the camera a quarter turn from wherever it is. */
  turn: (step: 1 | -1) => void;
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

/** The preset view nearest a camera angle. */
function nearestView(yaw: number): number {
  return Math.round((yaw - viewAngle(0)) / (Math.PI / 2));
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
export function createHouseScene(initial: Layout) {
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
    input: "mouse",
    showMarks: true,
    walking: false,
  };
  const listeners = new Set<() => void>();
  /** What the camera frames when it follows the game, beyond a close view. */
  let framing: { rooms: readonly string[] } | null = null;
  /** The camera's angles and zoom, eased towards their goals. */
  let yaw = viewAngle(view.view);
  let pitch = ELEVATION;
  let zoom = view.zoom;
  let yawGoal: number | null = null;
  let pitchGoal: number | null = null;
  /** Where the player put the camera's target, when it isn't following the game. */
  let freeTarget: THREE.Vector3 | null = null;
  /** The point the camera looks at, and how far back it stands. */
  let aim: THREE.Vector3 | null = null;

  const playing = new Set<Playing>();
  let mounted: {
    house: House;
    sync: () => void;
    settle: () => void;
    applyResolution: () => void;
    stats: () => HouseStats;
    layoutNow: () => ChoiceLayout;
    project: (point: THREE.Vector3) => Point | null;
    container: HTMLElement;
    placeCamera: (ease: number) => boolean;
  } | null = null;
  let settled = false;
  let frames = 0;
  /** The stage's clock, in seconds. */
  let seconds = 0;
  /** A page element the scene keeps over the focused target, as its name tag. */
  let label: HTMLElement | null = null;

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

  /** The camera goes back to framing what the game shows. */
  function follow() {
    freeTarget = null;
    settled = false;
  }

  const placeContext = (house: House) => ({ layout, showing: view.floor, stairway, scenePoint: house.scenePoint, figureAt: house.figureAt });
  const placesOf = (house: House): { id: string; place: TargetPlace }[] => {
    const context = placeContext(house);
    return targets.map((target) => ({ id: target.id, place: targetPlace(target, context) }));
  };
  const walkingNow = () => [...playing].some((beat) => beat.walk !== undefined);

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

  /** The targets a decision offers, and the one the focus is on. A new set of
   *  targets brings the camera back to framing them. */
  function setTargets(next: readonly Target[], focus: string | null) {
    const ids = (list: readonly Target[]) => list.map((target) => target.id).join("\n");
    if (ids(next) !== ids(targets)) follow();
    targets = next;
    focused = focus;
    mounted?.sync();
  }

  /** Whose turn it is: the light and the framing follow them, and the view
   *  goes to their floor if it was on the floor of whoever went before. */
  function setActive(id: string | null) {
    if (id !== null) {
      const floor = figureFloor(id);
      const showing = activeFloor === null ? floor : followFloor(view.floor, activeFloor, floor);
      activeFloor = floor;
      showFloor(showing);
    } else {
      activeFloor = null;
    }
    if (id !== active) follow();
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
            },
          );
          follow();
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
          framing = beat.framing && "rooms" in beat.framing ? beat.framing : null;
          follow();
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

  const camera = {
    state: (): CameraState => ({ target: (aim ?? new THREE.Vector3()).clone(), yaw, pitch, zoom: view.zoom, floor: view.floor, following: freeTarget === null }),
    /** Puts the camera's target on a point, and leaves it there. */
    setTarget: (point: THREE.Vector3) => {
      freeTarget = point.clone();
      aim = point.clone();
      settled = false;
    },
    /** Moves the camera's target along the floor, in scene metres. */
    panBy: (dx: number, dz: number) => {
      freeTarget = (freeTarget ?? aim ?? new THREE.Vector3()).clone().add(new THREE.Vector3(dx, 0, dz));
      aim?.add(new THREE.Vector3(dx, 0, dz));
      settled = false;
    },
    /** Turns the camera round its target, in radians: round the vertical, and up. */
    orbitBy: (yawBy: number, pitchBy = 0) => {
      yaw += yawBy;
      pitch = THREE.MathUtils.clamp(pitch + pitchBy, ...PITCH_RANGE);
      yawGoal = null;
      pitchGoal = null;
    },
    zoomBy: (factor: number) => hook.setZoom(view.zoom * factor),
    /** Eases the camera to any of a target point, an angle round the vertical and a zoom. */
    easeTo: ({ target, yaw: toYaw, zoom: toZoom }: { target?: THREE.Vector3; yaw?: number; zoom?: number }) => {
      if (target) freeTarget = target.clone();
      if (toYaw !== undefined) yawGoal = wrapNear(toYaw, yaw);
      if (toZoom !== undefined) hook.setZoom(toZoom);
      settled = false;
    },
    /** Frames something, keeping the player's angle and zoom. */
    frame: (what: Framing | null) => play({ kind: "frame", framing: what }),
    /** Brings the camera back to the active figure: its floor, and the target
     *  eased to where it stands, keeping the player's angle and zoom. */
    recentre: () => {
      if (active === null) return;
      const floor = figureFloor(active);
      if (view.floor !== "all") showFloor(floor);
      camera.easeTo({ target: mounted?.house.scenePoint(mounted.house.figureAt(active)) });
    },
  };

  const hook: SceneHook = {
    frameCount: () => frames,
    setView: (next) => {
      update({ view: ((next % 4) + 4) % 4 });
      mounted?.settle();
    },
    turn: (step) => {
      hook.setView((mounted ? nearestView(yaw) : view.view) + step);
    },
    setZoom: (next) => {
      update({ zoom: THREE.MathUtils.clamp(next, ...ZOOM_RANGE) });
    },
    setFloor: (floor) => {
      follow();
      showFloor(floor);
    },
    setCloseUp: (room) => {
      follow();
      framing = null;
      update({ closeUp: room, floor: room ? tileFloor(room) : view.floor });
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
    const house = buildHouse(layout, baker);
    for (const figure of figures.values()) placeFigure(house, figure);
    scene.add(house.root);
    scene.fog = house.fog;
    scene.background = house.background;

    let handsOn = false;
    let framed: THREE.Vector3[] = [];
    let distance = 0;
    let cutaway = new THREE.Vector2(1, 1).normalize();
    aim = null;

    /** What the camera frames: a close view's room; else every floor; else, on
     *  the floor showing, the rooms framed, or the rooms a walk passes through,
     *  or the active figure's room and the targets; else the whole floor. */
    const subject = (): THREE.Vector3[] => {
      const cornersOf = (cell: Cell) => tileCorners(house.cellCentre(cell.floor, cell.x, cell.y));
      const roomCell = (room: string): Cell => {
        const tile = placed(layout, room);
        if (!tile) throw new Error(`The house has no room "${room}"`);
        return tile;
      };
      if (view.closeUp) return cornersOf(roomCell(view.closeUp));
      if (view.floor === "all") return house.corners();
      // A walk is watched while it plays, the active figure's before anyone else's.
      const walks = [...playing].flatMap((beat) => beat.walk ?? []);
      const walking = (walks.find((walk) => walk.figure === active) ?? walks.at(0))?.route;
      const cells = framing
        ? framing.rooms.map(roomCell)
        : walking
          ? walking.map(roomCell)
          : [...(active ? [roomCell(figureOf(active).room)] : []), ...placesOf(house).map(({ place }) => place.cell)];
      const showing = cells.filter((cell) => cell.floor === view.floor);
      return showing.length > 0 ? showing.flatMap(cornersOf) : house.corners();
    };

    const settle = () => {
      yawGoal = wrapNear(viewAngle(view.view), yaw);
      pitchGoal = ELEVATION;
      settled = false;
    };

    const placeCamera = (ease: number) => {
      if ((freeTarget === null && !handsOn) || framed.length === 0) framed = subject();
      const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const fit = fitView(framed, back, lens);
      const target = freeTarget ?? fit.target;
      const want = fit.distance / zoom;
      if (!aim) {
        aim = target.clone();
        distance = want;
      }
      aim.lerp(target, ease);
      distance += (want - distance) * ease;
      lens.position.copy(aim).addScaledVector(back, distance);
      lens.lookAt(aim);
      lens.updateMatrixWorld();

      const facing = new THREE.Vector2(lens.position.x - aim.x, lens.position.z - aim.z);
      if (facing.lengthSq() > 1e-6) cutaway = facing.normalize();
      house.setCutaway(cutaway, view.closeUp);
      const radius = new THREE.Sphere().setFromPoints(framed).radius;
      house.fog.near = Math.max(0, fit.distance - radius);
      house.fog.far = house.fog.near + (radius * 2) / Math.max(HOUSE_LIGHT.fog.density, 0.01);
      return aim.distanceTo(target) < 0.01 && Math.abs(want - distance) < 0.01;
    };

    const project = (point: THREE.Vector3): Point | null => {
      const ndc = point.clone().project(lens);
      if (ndc.z > 1) return null;
      return { x: ((ndc.x + 1) / 2) * container.clientWidth, y: ((1 - ndc.y) / 2) * container.clientHeight };
    };
    const layoutNow = (): ChoiceLayout => choiceLayout(placesOf(house), focused, project);

    const controls = attachControls(container, {
      layout: layoutNow,
      focus: focusTarget,
      commit: (id) => input.commit(id),
      confirm: () => input.confirm(),
      orbit: (yawBy, pitchBy) => camera.orbitBy(yawBy, pitchBy),
      zoom: (factor) => camera.zoomBy(factor),
      turn: (step) => hook.turn(step),
      controlling: (on) => {
        handsOn = on;
        settled = false;
      },
      usedInput: (kind) => {
        if (kind !== view.input) update({ input: kind });
      },
    });

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
      const going = targets.find((target) => target.id === focused);
      const route = offering && going?.kind === "room" ? going.route : undefined;
      house.showRoute(route ? walkPath(layout, route.rooms, house.figureAt(route.figure), house.spot(going?.kind === "room" ? going.room : "", route.slot), stairway) : null);
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
    container.appendChild(readout);
    const showReadout = () => {
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

    mounted = { house, sync, settle, applyResolution, stats, layoutNow, project, container, placeCamera };
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
        for (const beat of [...playing]) if (beat.over()) beat.end();
        if (label) {
          const place = view.showMarks && !walkingNow() ? placesOf(house).find(({ id }) => id === focused)?.place : undefined;
          const at = place ? project(place.anchor) : null;
          label.style.visibility = at ? "visible" : "hidden";
          if (at) label.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -150%)`;
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
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    view: () => view,
  };
}

export type HouseScene = ReturnType<typeof createHouseScene>;

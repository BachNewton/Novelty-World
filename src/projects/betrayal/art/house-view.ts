import * as THREE from "three";
import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import { CATALOG } from "../data";
import { FLOORS, type Layout } from "../engine/board";
import { attachControls, type ChoiceLayout, type InputKind } from "../input/controls";
import type { Point } from "../input/navigate";
import type { FloorId } from "../types";
import { longfellow } from "./explorers/longfellow";
import { buildHouse, definition, stairMark, tileCorners, type House, type HouseExplorer } from "./house";
import { HOUSE_FIXTURE } from "./house-layout";
import { afterLeg, inHouse, moveIsOver, nextLegs, shownOn, walkPath, walkPose, type Shown, type Stairway, type Walk } from "./house-walk";
import { pawn } from "./kit/pawn";
import { workerBaker } from "./bake-workers";
import type { Rebake } from "./lit-floor";
import { budgetGuard, HOUSE_LIGHT, LIGHTMAP, MAX_DRAW_CALLS, MAX_TEXTURE_UNITS } from "./lighting";
import { TILE } from "./room";
import { roomTile } from "./stage";

/** Pixels on the screen's short side, as on the bench; null is native. */
export type Resolution = number | null;
const RESOLUTIONS: Resolution[] = [270, 360, 540, 720, 1080, null];
const DEFAULT_RESOLUTION = 540;
const FIELD_OF_VIEW = 32;
const ELEVATION = THREE.MathUtils.degToRad(40);
const PITCH_RANGE = [THREE.MathUtils.degToRad(12), THREE.MathUtils.degToRad(85)] as const;
const ZOOM_RANGE = [0.7, 4] as const;
/** How quickly the camera eases to where it is going: the share of the way it closes each second, roughly. */
const EASE_RATE = 6;
/** The stand-in decision: how many spaces an explorer may move. */
const MOVEMENT = 4;
/** How long a room an explorer enters for the first time is framed close, its walls up. */
const ENTERING_SECONDS = 2.5;
/** Where on a choice its screen position is taken: a little above the middle of its floor. */
const ANCHOR_HEIGHT = 0.3;
/** A stair offered as a choice is a pointer target this far either side of its run. */
const STAIR_REACH = 0.8;

interface CastMember extends HouseExplorer {
  name: string;
}

/** Two explorers for the prototype, taking turns: Longfellow in the Library,
 *  and a recoloured scale pawn in the Foyer. */
const CAST: CastMember[] = [
  { id: "longfellow", name: "Professor Longfellow", room: "library", build: longfellow, colour: "amber" },
  { id: "pawn", name: "The scale pawn", room: "foyer", build: () => pawn({ colour: "bone" }), colour: "verdigrisLight" },
];

export type FloorChoice = FloorId | "all";

/** What the stand-in decision offers: a room to walk to, or stopping in the
 *  room the explorer stands in, which ends the turn. */
export interface Choice {
  room: string;
  name: string;
  /** Spaces of movement it takes. */
  steps: number;
  floor: FloorId;
  stop: boolean;
}

/** Choosing where to go; walking there (input waits); or standing in a room
 *  entered for the first time while the camera frames it. */
export type Phase = "choosing" | "walking" | "entering";

export interface HouseSnapshot {
  view: number;
  zoom: number;
  floor: FloorChoice;
  /** The room a close view frames, or null. */
  closeUp: string | null;
  resolution: Resolution;
  frozenAt: number | null;
  explorers: { id: string; name: string; room: string }[];
  /** Whose turn it is, by index into `explorers`. */
  active: number;
  /** The active explorer's movement this turn, and the spaces of it left. */
  movement: number;
  left: number;
  phase: Phase;
  choices: Choice[];
  /** The choice the focus cursor is on. */
  focused: string | null;
  /** The input the player last used, for its button hints. */
  input: InputKind;
  /** Whether the choices glow and the route shows; off for judging the art alone. */
  showChoices: boolean;
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

export interface HouseApi {
  frameCount: () => number;
  setView: (view: number) => void;
  /** Swings the camera a quarter turn from wherever it is. */
  turn: (step: 1 | -1) => void;
  setZoom: (zoom: number) => void;
  setFloor: (floor: FloorChoice) => void;
  setCloseUp: (room: string | null) => void;
  setResolution: (resolution: Resolution) => void;
  freezeClock: (seconds: number | null) => void;
  isReady: () => boolean;
  floors: () => FloorId[];
  /** The rooms on a floor, as tile ids. */
  rooms: (floor: FloorId) => string[];
  stats: () => HouseStats;
  /** Rebuilds a room and re-bakes it with its neighbours, as discovering or moving it in play would. */
  rebake: (room: string) => Promise<Rebake>;
  /** Moves the focus cursor to a choice. */
  focus: (room: string) => void;
  /** Commits a choice: the active explorer walks there. */
  choose: (room: string) => void;
  /** Commits the focused choice. */
  confirm: () => void;
  showChoices: (show: boolean) => void;
  state: () => HouseSnapshot;
  /** Where a choice shows on the page, in CSS pixels, for tests to point at. */
  screenPoint: (room: string) => Point | null;
}

declare global {
  interface Window {
    __betrayalHouse?: HouseApi;
  }
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

/** The house view: an engine layout as a house of rooms, one floor at a time
 *  or all stacked, with two explorers taking turns to walk round it. A stand-in
 *  decision offers every room within a move; the shared focus cursor picks one
 *  by mouse, touch, keyboard or controller, and the explorer walks there.
 *  Plain state outside React, so the page, tests and screenshot tools drive
 *  the same thing. */
export function createHouseView(layout: Layout = HOUSE_FIXTURE) {
  const floors = FLOORS.filter((floor) => layout.tiles.some((tile) => tile.floor === floor));
  const floorOf = (room: string) => {
    const tile = layout.tiles.find((placed) => placed.tile === room);
    if (!tile) throw new Error(`The house has no room "${room}"`);
    return tile.floor;
  };
  const roomName = (id: string) => roomTile(id).name;

  let snapshot: HouseSnapshot = {
    view: 0,
    zoom: 1,
    floor: "ground",
    closeUp: null,
    resolution: DEFAULT_RESOLUTION,
    frozenAt: null,
    explorers: CAST.map(({ id, name, room }) => ({ id, name, room })),
    active: 0,
    movement: MOVEMENT,
    left: MOVEMENT,
    phase: "choosing",
    choices: [],
    focused: null,
    input: "mouse",
    showChoices: true,
  };
  const listeners = new Set<() => void>();
  let mounted: {
    sync: () => void;
    settle: () => void;
    turn: (step: 1 | -1) => void;
    applyResolution: () => void;
    stats: () => HouseStats;
    screenPoint: (room: string) => Point | null;
  } | null = null;
  let houseReady = false;
  let settled = false;
  let frames = 0;
  /** The stage's clock, in seconds. */
  let seconds = 0;
  /** Each choice's route, from the active explorer's room. */
  let routes = new Map<string, string[]>();
  let walking: { explorer: string; room: string; walk: Walk } | null = null;
  let enteringUntil: number | null = null;
  const visited = new Set(CAST.map((member) => member.room));
  let house: House | null = null;
  /** A page element the view keeps over the focused choice, as its name tag. */
  let label: HTMLElement | null = null;

  function update(next: HouseSnapshot) {
    snapshot = next;
    mounted?.sync();
    for (const listener of listeners) listener();
  }

  /** Puts the active explorer's next leg: every room within the movement
   *  left, and stopping where they stand. */
  function offer(next: HouseSnapshot): HouseSnapshot {
    const explorer = next.explorers[next.active];
    const reaches = nextLegs(layout, CATALOG, { room: explorer.room, left: next.left });
    routes = new Map(reaches.map((reach) => [reach.room, reach.route]));
    const choices: Choice[] = [
      ...reaches.map((reach) => ({ room: reach.room, name: roomName(reach.room), steps: reach.route.length - 1, floor: floorOf(reach.room), stop: false })),
      { room: explorer.room, name: "Stop here", steps: 0, floor: floorOf(explorer.room), stop: true },
    ];
    return { ...next, phase: "choosing", closeUp: null, choices, focused: choices[0].room, floor: floorOf(explorer.room) };
  }
  snapshot = offer(snapshot);

  function nextTurn() {
    enteringUntil = null;
    update(offer({ ...snapshot, active: (snapshot.active + 1) % snapshot.explorers.length, left: snapshot.movement }));
  }

  /** After a leg: the next leg, or, when the move is over, the next explorer's turn. */
  function continueTurn(next: HouseSnapshot) {
    enteringUntil = null;
    const explorer = next.explorers[next.active];
    if (moveIsOver(layout, CATALOG, { room: explorer.room, left: next.left })) {
      snapshot = next;
      nextTurn();
    } else {
      update(offer(next));
    }
  }

  /** The point a walk to `room` ends on: the pawn spot, or beside it when someone already stands there. */
  function arrivalSlot(room: string, explorer: string): number {
    return snapshot.explorers.some((other) => other.id !== explorer && other.room === room) ? 1 : 0;
  }

  function pathTo(built: House, room: string) {
    const route = routes.get(room);
    if (!route) throw new Error(`${room} is not a choice`);
    const explorer = snapshot.explorers[snapshot.active].id;
    return walkPath(layout, route, built.explorerAt(explorer), built.spot(room, arrivalSlot(room, explorer)), stairway);
  }

  function shownAs(room: string, floor: FloorChoice): Shown {
    return shownOn(layout, { room, route: routes.get(room) ?? [room] }, floor, stairway);
  }
  /** The room on `floor` whose stair stands for a choice on another floor. */
  function stairFrom(room: string, floor: FloorChoice): string | null {
    const shown = shownAs(room, floor);
    return shown && "stairFrom" in shown ? shown.stairFrom : null;
  }

  function focus(room: string) {
    const choice = snapshot.choices.find((candidate) => candidate.room === room);
    if (snapshot.phase !== "choosing" || !choice || snapshot.focused === room) return;
    const floor = shownAs(room, snapshot.floor) ? snapshot.floor : choice.floor;
    update({ ...snapshot, focused: room, floor });
  }

  function choose(room: string) {
    if (snapshot.phase === "entering") {
      continueTurn(snapshot);
      return;
    }
    if (snapshot.phase !== "choosing" || !house) return;
    if (snapshot.choices.some((choice) => choice.stop && choice.room === room)) {
      nextTurn();
      return;
    }
    if (!routes.has(room)) return;
    const explorer = snapshot.explorers[snapshot.active].id;
    walking = { explorer, room, walk: { path: pathTo(house, room), start: seconds } };
    house.walk(explorer, walking.walk);
    update({ ...snapshot, phase: "walking", choices: [], focused: null });
  }

  function confirm() {
    if (snapshot.phase === "entering") continueTurn(snapshot);
    else if (snapshot.focused !== null) choose(snapshot.focused);
  }

  /** The leg is over: the explorer stands in the room, which is framed close
   *  with its walls up if it is new to them, and then the move goes on. */
  function arrive() {
    if (!walking || !house) return;
    const { explorer, room } = walking;
    walking = null;
    house.stand(explorer, house.explorerAt(explorer));
    const from = snapshot.explorers[snapshot.active].room;
    const { left } = afterLeg({ room: from, left: snapshot.left }, { room, route: routes.get(room) ?? [] });
    const explorers = snapshot.explorers.map((member) => (member.id === explorer ? { ...member, room } : member));
    if (visited.has(room)) {
      continueTurn({ ...snapshot, explorers, left });
      return;
    }
    visited.add(room);
    enteringUntil = seconds + ENTERING_SECONDS;
    update({ ...snapshot, explorers, left, phase: "entering", closeUp: room, floor: floorOf(room) });
  }

  const setFloor = (floor: FloorChoice) => {
    update({ ...snapshot, floor, closeUp: snapshot.closeUp && floor !== "all" && floorOf(snapshot.closeUp) === floor ? snapshot.closeUp : null });
  };

  const api: HouseApi = {
    frameCount: () => frames,
    setView: (view) => {
      update({ ...snapshot, view: ((view % 4) + 4) % 4 });
      mounted?.settle();
    },
    turn: (step) => {
      if (mounted) mounted.turn(step);
      else api.setView(snapshot.view + step);
    },
    setZoom: (zoom) => {
      update({ ...snapshot, zoom: THREE.MathUtils.clamp(zoom, ...ZOOM_RANGE) });
    },
    setFloor,
    setCloseUp: (room) => {
      update({ ...snapshot, closeUp: room, floor: room ? floorOf(room) : snapshot.floor });
    },
    setResolution: (resolution) => {
      update({ ...snapshot, resolution });
      mounted?.applyResolution();
    },
    freezeClock: (at) => {
      update({ ...snapshot, frozenAt: at });
    },
    isReady: () => houseReady && settled,
    floors: () => floors,
    rooms: (floor) => layout.tiles.filter((tile) => tile.floor === floor).map((tile) => tile.tile),
    stats: () => {
      if (!mounted) throw new Error("The house view is not mounted");
      return mounted.stats();
    },
    rebake: (room) => {
      if (!house) throw new Error("The house view is not mounted");
      return house.rebake(room);
    },
    focus,
    choose,
    confirm,
    showChoices: (show) => update({ ...snapshot, showChoices: show }),
    state: () => snapshot,
    screenPoint: (room) => mounted?.screenPoint(room) ?? null,
  };

  function mount(ctx: ThreeSceneContext): ThreeSceneHandlers {
    const { scene, camera, renderer, container } = ctx;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.imageRendering = "pixelated";
    renderer.toneMappingExposure = 1.5;
    camera.fov = FIELD_OF_VIEW;
    camera.near = 0.1;
    camera.far = 400;
    container.style.touchAction = "none";

    const baker = workerBaker();
    const built = buildHouse(
      layout,
      CAST.map((member) => ({ ...member, room: snapshot.explorers.find((explorer) => explorer.id === member.id)?.room ?? member.room })),
      baker,
    );
    house = built;
    scene.add(built.root);
    scene.fog = built.fog;
    scene.background = built.background;
    void built.ready.then(() => {
      if (house === built) houseReady = true;
    });
    if (walking) built.walk(walking.explorer, walking.walk);

    // The camera: its angles and zoom, eased towards their goals, frame a subject.
    let yaw = viewAngle(snapshot.view);
    let pitch = ELEVATION;
    let zoom = snapshot.zoom;
    let yawGoal: number | null = null;
    let pitchGoal: number | null = null;
    let handsOn = false;
    let framed: THREE.Vector3[] = [];
    let aim: THREE.Vector3 | null = null;
    let distance = 0;
    let cutaway = new THREE.Vector2(1, 1).normalize();

    /** What the camera frames: a close view's room; else the rooms that
     *  matter on the floor showing (the active explorer's and the choices,
     *  or the rooms a walk passes through); else the whole floor. */
    const subject = (): THREE.Vector3[] => {
      const centre = (room: string) => {
        const placed = built.rooms.find((candidate) => candidate.id === room);
        if (!placed) throw new Error(`The house has no room "${room}"`);
        return placed.centre;
      };
      if (snapshot.closeUp) return tileCorners(centre(snapshot.closeUp));
      if (snapshot.floor === "all") return built.corners();
      const rooms =
        snapshot.phase === "walking" && walking
          ? (routes.get(walking.room) ?? [])
          : [snapshot.explorers[snapshot.active].room, ...snapshot.choices.map((choice) => stairFrom(choice.room, snapshot.floor) ?? choice.room)];
      const showing = rooms.filter((room) => floorOf(room) === snapshot.floor);
      return showing.length > 0 ? showing.flatMap((room) => tileCorners(centre(room))) : built.corners();
    };

    const turn = (step: 1 | -1) => api.setView(nearestView(yaw) + step);
    const settle = () => {
      yawGoal = wrapNear(viewAngle(snapshot.view), yaw);
      pitchGoal = ELEVATION;
      settled = false;
    };

    const placeCamera = (ease: number) => {
      if (!handsOn || framed.length === 0) framed = subject();
      const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const { target, distance: fit } = fitView(framed, back, camera);
      const want = fit / zoom;
      if (!aim) {
        aim = target.clone();
        distance = want;
      }
      aim.lerp(target, ease);
      distance += (want - distance) * ease;
      camera.position.copy(aim).addScaledVector(back, distance);
      camera.lookAt(aim);
      camera.updateMatrixWorld();

      const facing = new THREE.Vector2(camera.position.x - aim.x, camera.position.z - aim.z);
      if (facing.lengthSq() > 1e-6) cutaway = facing.normalize();
      built.setCutaway(cutaway, snapshot.closeUp);
      const radius = new THREE.Sphere().setFromPoints(framed).radius;
      built.fog.near = Math.max(0, fit - radius);
      built.fog.far = built.fog.near + (radius * 2) / Math.max(HOUSE_LIGHT.fog.density, 0.01);
      return aim.distanceTo(target) < 0.01 && Math.abs(want - distance) < 0.01;
    };

    const project = (point: THREE.Vector3): Point | null => {
      const ndc = point.clone().project(camera);
      if (ndc.z > 1) return null;
      return { x: ((ndc.x + 1) / 2) * container.clientWidth, y: ((1 - ndc.y) / 2) * container.clientHeight };
    };
    /** A choice's place in the scene where it shows on the floor showing:
     *  the point it is drawn round, and the outline a pointer can hit (none
     *  where it doesn't show, and is only reached by changing floor). */
    const placeOf = (room: string): { anchor: THREE.Vector3; outline: THREE.Vector3[] | null } => {
      const shown = shownAs(room, snapshot.floor);
      if (shown && "stairFrom" in shown) {
        const run = (stairway(shown.stairFrom, room) ?? []).map((point) => built.scenePoint(inHouse(layout, shown.stairFrom, point)));
        const [start, end] = [run[0], run[run.length - 1]];
        const side = end.clone().sub(start).setY(0).normalize().cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(STAIR_REACH);
        return {
          anchor: start.clone().add(end).multiplyScalar(0.5).setY((start.y + end.y) / 2 + ANCHOR_HEIGHT),
          outline: [start.clone().add(side), end.clone().add(side), end.clone().sub(side), start.clone().sub(side)],
        };
      }
      const placed = built.rooms.find((candidate) => candidate.id === room);
      if (!placed) throw new Error(`The house has no room "${room}"`);
      const outline = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([x, z]) => placed.centre.clone().add(new THREE.Vector3((x * TILE) / 2, 0, (z * TILE) / 2)));
      return { anchor: placed.centre.clone().setY(placed.centre.y + ANCHOR_HEIGHT), outline: shown ? outline : null };
    };
    const anchorOf = (room: string) => placeOf(room).anchor;
    const choiceLayout = (): ChoiceLayout => {
      const points = [];
      const targets = [];
      for (const choice of snapshot.choices) {
        const { anchor, outline } = placeOf(choice.room);
        const at = project(anchor);
        if (!at) continue;
        points.push({ id: choice.room, ...at });
        const corners = outline?.map(project);
        if (corners && corners.every((corner) => corner !== null)) targets.push({ id: choice.room, anchor: at, outline: corners });
      }
      return { points, targets, focused: snapshot.focused };
    };

    const controls = attachControls(container, {
      layout: choiceLayout,
      focus,
      commit: choose,
      confirm,
      orbit: (yawBy, pitchBy) => {
        yaw += yawBy;
        pitch = THREE.MathUtils.clamp(pitch + pitchBy, ...PITCH_RANGE);
        yawGoal = null;
        pitchGoal = null;
      },
      zoom: (factor) => api.setZoom(snapshot.zoom * factor),
      turn: (step) => turn(step),
      controlling: (on) => {
        handsOn = on;
        settled = false;
      },
      usedInput: (input) => {
        if (input !== snapshot.input) update({ ...snapshot, input });
      },
    });

    const applyResolution = () => {
      const shortSide = snapshot.resolution;
      const { clientWidth, clientHeight } = container;
      const ratio = shortSide === null ? window.devicePixelRatio : shortSide / Math.min(clientWidth, clientHeight);
      ctx.setPixelRatio(ratio);
    };

    /** Shows what the snapshot says: the floor, whose turn it is, and the choices with the focused one's route. */
    let shownFloor: FloorChoice | null = null;
    const sync = () => {
      if (snapshot.floor !== shownFloor) {
        shownFloor = snapshot.floor;
        built.showFloor(snapshot.floor);
      }
      built.setActive(snapshot.explorers[snapshot.active].id);
      const offering = snapshot.phase === "choosing" && snapshot.showChoices;
      const markOf = (room: string) => {
        const shown = shownAs(room, snapshot.floor);
        return shown === null ? null : "stairFrom" in shown ? stairMark(shown.stairFrom, room) : room;
      };
      const marks = offering ? snapshot.choices.flatMap((choice) => markOf(choice.room) ?? []) : [];
      built.markChoices(marks, offering && snapshot.focused !== null ? markOf(snapshot.focused) : null);
      const going = offering && snapshot.focused !== null && routes.has(snapshot.focused) ? snapshot.focused : null;
      built.showRoute(going === null ? null : pathTo(built, going));
      settled = false;
    };

    const gl = renderer.getContext();
    const guard = budgetGuard(renderer);
    let liveLights = 0;
    scene.traverse((object) => {
      if (object instanceof THREE.Light) liveLights++;
    });
    const stats = (): HouseStats => {
      const baked = built.rooms.filter((room) => snapshot.floor === "all" || room.floor === snapshot.floor).flatMap((room) => room.room.lights);
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
        bakeMs: Object.fromEntries([...built.bakes].map(([floor, bake]) => [floor, Math.round(bake.ms)])),
      };
    };
    const screenPoint = (room: string) => {
      const at = project(anchorOf(room));
      const rect = container.getBoundingClientRect();
      return at && { x: at.x + rect.left, y: at.y + rect.top };
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

    mounted = { sync, settle, turn, applyResolution, stats, screenPoint };
    sync();
    window.__betrayalHouse = api;

    return {
      onFrame: (delta) => {
        guard.check();
        frames++;
        if (frames % 10 === 0) showReadout();
        seconds = snapshot.frozenAt ?? seconds + delta;
        controls.frame(delta);
        if (walking) {
          const pose = walkPose(walking.walk, seconds);
          // The view follows the walker up or down the stairs.
          if (snapshot.floor !== "all" && pose.point.floor !== snapshot.floor) update({ ...snapshot, floor: pose.point.floor });
          if (pose.done) arrive();
        }
        if (enteringUntil !== null && seconds >= enteringUntil) continueTurn(snapshot);
        built.update(seconds);

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
        zoom += (snapshot.zoom - zoom) * ease;
        if (Math.abs(snapshot.zoom - zoom) < 0.002) zoom = snapshot.zoom;
        else still = false;
        const arrived = placeCamera(ease);
        settled = still && arrived;
        if (label) {
          const at = snapshot.phase === "choosing" && snapshot.showChoices && snapshot.focused !== null ? project(anchorOf(snapshot.focused)) : null;
          label.style.visibility = at ? "visible" : "hidden";
          if (at) label.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -150%)`;
        }
      },
      onResize: () => {
        applyResolution();
        placeCamera(1);
      },
      dispose: () => {
        readout.remove();
        controls.dispose();
        scene.remove(built.root);
        built.dispose();
        baker.dispose();
        house = null;
        houseReady = false;
        mounted = null;
        delete window.__betrayalHouse;
      },
    };
  }

  return {
    mount,
    api,
    floors,
    resolutions: RESOLUTIONS,
    zoomRange: ZOOM_RANGE,
    roomName,
    setLabel: (element: HTMLElement | null) => {
      label = element;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => snapshot,
  };
}

export type HouseView = ReturnType<typeof createHouseView>;

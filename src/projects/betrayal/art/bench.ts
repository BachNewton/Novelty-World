import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import { BENCH_EXPLORERS, type BenchExplorer } from "./explorers";
import type { Edge } from "../types";
import { freezeRoom } from "./freeze";
import { budgetGuard, fillLight, HOUSE_LIGHT, houseFog } from "./lighting";
import type { Baker } from "./bake";
import { workerBaker } from "./bake-workers";
import { createLitFloor, type Rebake } from "./lit-floor";
import { CUT_HEIGHT, DEFAULT_FOCUS, pieceLabel, type PropPlacement, type RoomDefinition } from "./room";
import { BENCH_ROOMS } from "./rooms";
import { buildRoom, OUTWARD, roomTile, type ExplorerBuilder } from "./stage";
import { group } from "./shapes";

/** The art is drawn at this many pixels on the screen's short side and scaled
 *  up with hard edges, for the chunky retro look on every screen size. Null
 *  draws at the screen's own resolution. */
export type Resolution = number | null;
const RESOLUTIONS: Resolution[] = [270, 360, 540, 720, 1080, null];
const DEFAULT_RESOLUTION = 540;
const FIELD_OF_VIEW = 32;
const ELEVATION = THREE.MathUtils.degToRad(40);
/** How far the room reaches from its centre on screen: across (corner to
 *  corner, seen diagonally) and up and down. */
const ROOM_HALF_WIDTH = 4.5;
const ROOM_RADIUS = 4.1;
const ROOM_CENTRE = new THREE.Vector3(0, 0.9, 0);
const ZOOMS = [1, 1.6, 2.4];
/** Framing the explorer: the height the camera aims at, and how far round it the frame reaches. */
const EXPLORER_AIM = 0.85;
const EXPLORER_RADIUS = 0.9;
/** Framing a prop: the least it frames round the prop's centre, so a small one still shows where it lies. */
const PROP_RADIUS = 0.3;

/** What the camera's presets frame: the whole room, the explorer standing in
 *  it, or one prop (by its place in the room's `props`). */
export type Subject = "room" | "explorer" | { prop: number };

/** A prop as the bench lists it: its label, its turn (it faces +z unturned),
 *  and the walls it hangs on, which hide it in any view that cuts one of them. */
export interface BenchProp {
  label: string;
  turn: number;
  walls: Edge[];
}

export interface BenchSnapshot {
  roomId: string;
  roomName: string;
  view: number;
  zoom: number;
  resolution: Resolution;
  explorer: string;
  subject: Subject;
  /** The animation clock stands still at this many seconds; null lets it run. */
  frozenAt: number | null;
}

export interface BenchApi {
  frameCount: () => number;
  setRoom: (id: string) => void;
  setView: (view: number) => void;
  setZoom: (zoom: number) => void;
  setResolution: (resolution: Resolution) => void;
  /** Who stands at the room's pawn spot (see `explorers()`). */
  setExplorer: (id: string) => void;
  setSubject: (subject: Subject) => void;
  /** Stops the animation clock (candle flicker, explorers) at a fixed time, so
   *  screenshots differ only when the art does; null starts it again. */
  freezeClock: (seconds: number | null) => void;
  isReady: () => boolean;
  rooms: () => string[];
  explorers: () => string[];
  /** The room's props, in the order the subject numbers them. */
  props: () => BenchProp[];
  /** The last bake of the room's light: which rooms, and how long it took. */
  bake: () => Rebake | null;
}

declare global {
  interface Window {
    __betrayalBench?: BenchApi;
  }
}

/** One room on its own, lit exactly as the house lights it: baked, under the
 *  house's fill and moon, laid unturned. */
function benchStage(def: RoomDefinition, explorerBuilder: ExplorerBuilder, baker: Baker) {
  const part = buildRoom(def, { explorer: explorerBuilder });
  const explorer = part.explorer;
  const frozen = freezeRoom(def.id, part);
  const floor = createLitFloor(baker);
  const bake = floor.place([{ id: def.id, room: frozen, matrix: new THREE.Matrix4() }]);
  const fog = houseFog();
  let isCut: (edge: Edge) => boolean = () => false;
  const cut = () => floor.rooms.get(def.id)?.setCut(isCut);
  return {
    root: group(floor.root, fillLight()),
    fog,
    background: fog.color.clone(),
    setCutaway: (cameraDirection: THREE.Vector2) => {
      isCut = (edge) => OUTWARD[edge].dot(cameraDirection) > 0.01;
      cut();
    },
    update: floor.update,
    explorer,
    bounds: (prop: PropPlacement) => frozen.bounds.get(prop),
    bake,
    ready: Promise.all([frozen.ready, bake.then(cut)]).then(() => undefined),
    dispose: floor.dispose,
  };
}
type Stage = ReturnType<typeof benchStage>;

function definition(id: string): RoomDefinition {
  return BENCH_ROOMS.find((room) => room.id === id) ?? BENCH_ROOMS[0];
}

function explorer(id: string): BenchExplorer {
  const found = BENCH_EXPLORERS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`The bench has no explorer "${id}"`);
  return found;
}

/** The art bench: one room on its own, under an orbit camera that the presets
 *  (four views, zoom, framing) place and the user can drag from there.
 *  Plain state outside React, so the page and screenshot tools drive the same thing. */
export function createBench(initialRoom: string) {
  const firstRoom = definition(initialRoom).id;
  let snapshot: BenchSnapshot = {
    roomId: firstRoom,
    roomName: roomTile(firstRoom).name,
    view: 0,
    zoom: ZOOMS[0],
    resolution: DEFAULT_RESOLUTION,
    explorer: BENCH_EXPLORERS[0].id,
    subject: "room",
    frozenAt: null,
  };
  const listeners = new Set<() => void>();
  let mounted: {
    rebuild: () => void;
    settle: () => void;
    applyResolution: () => void;
  } | null = null;
  let stageReady = false;
  let lastBake: Rebake | null = null;
  let settled = false;
  let frames = 0;

  function update(next: BenchSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  const api: BenchApi = {
    frameCount: () => frames,
    bake: () => lastBake,
    setRoom: (id) => {
      const room = definition(id);
      if (room.id !== id) throw new Error(`The bench has no room "${id}"`);
      update({ ...snapshot, roomId: id, roomName: roomTile(id).name });
      const url = new URL(window.location.href);
      url.searchParams.set("bench", id);
      window.history.replaceState(window.history.state, "", url);
      mounted?.rebuild();
      mounted?.settle();
    },
    setView: (view) => {
      update({ ...snapshot, view: ((view % 4) + 4) % 4 });
      mounted?.settle();
    },
    setZoom: (zoom) => {
      update({ ...snapshot, zoom });
      mounted?.settle();
    },
    setResolution: (resolution) => {
      update({ ...snapshot, resolution });
      mounted?.applyResolution();
    },
    setExplorer: (id) => {
      explorer(id);
      update({ ...snapshot, explorer: id });
      mounted?.rebuild();
      mounted?.settle();
    },
    setSubject: (subject) => {
      update({ ...snapshot, subject });
      mounted?.settle();
    },
    freezeClock: (seconds) => {
      update({ ...snapshot, frozenAt: seconds });
    },
    isReady: () => stageReady && settled,
    rooms: () => BENCH_ROOMS.map((room) => room.id),
    explorers: () => BENCH_EXPLORERS.map((figure) => figure.id),
    props: () =>
      definition(snapshot.roomId).props.map((prop) => ({
        label: pieceLabel(prop),
        turn: prop.turn ?? 0,
        walls: (prop.y ?? 0) >= CUT_HEIGHT ? (prop.walls ?? []) : [],
      })),
  };

  function mount(ctx: ThreeSceneContext): ThreeSceneHandlers {
    const { scene, camera, renderer } = ctx;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.imageRendering = "pixelated";
    renderer.toneMappingExposure = 1.5;
    camera.fov = FIELD_OF_VIEW;
    camera.near = 0.1;
    camera.far = 200;

    const guard = budgetGuard(renderer);
    const baker = workerBaker();
    let stage: Stage | null = null;
    const rebuild = () => {
      if (stage) {
        scene.remove(stage.root);
        stage.dispose();
      }
      stageReady = false;
      const built = benchStage(definition(snapshot.roomId), explorer(snapshot.explorer).build, baker);
      void built.bake.then((bake) => {
        if (stage === built) lastBake = bake;
      });
      stage = built;
      scene.add(built.root);
      scene.fog = built.fog;
      scene.background = built.background;
      void built.ready.then(() => {
        if (stage === built) stageReady = true;
      });
    };

    let angle = viewAngle(snapshot.view);
    let zoom = snapshot.zoom;
    let seconds = 0;
    /** Whether the presets place the camera, or the user's hand on the orbit controls does. */
    let byHand = false;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 1;
    controls.maxDistance = 40;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
    let cutaway = new THREE.Vector2(1, 1).normalize();

    const fitDistance = () => {
      const vertical = THREE.MathUtils.degToRad(camera.fov);
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
      return Math.max(ROOM_RADIUS / Math.sin(vertical / 2), ROOM_HALF_WIDTH / Math.sin(horizontal / 2));
    };

    /** The sphere round the prop the subject names, as built in the room. */
    const propBounds = (index: number): THREE.Sphere => {
      const placement = definition(snapshot.roomId).props.at(index);
      const found = placement && stage?.bounds(placement);
      if (!found) throw new Error(`${snapshot.roomId} has no prop ${index}`);
      return found.getBoundingSphere(new THREE.Sphere());
    };

    const presetTarget = () => {
      if (typeof snapshot.subject === "object") return propBounds(snapshot.subject.prop).center;
      if (snapshot.subject === "explorer" && stage?.explorer) {
        return stage.explorer.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, EXPLORER_AIM, 0));
      }
      const focus = new THREE.Vector3(...(definition(snapshot.roomId).focus ?? DEFAULT_FOCUS));
      return ROOM_CENTRE.clone().lerp(focus, 1 - 1 / zoom);
    };

    /** Cuts away the walls facing the camera, and fades the far side of the
     *  room into fog by the same amount from any distance. */
    const frameRoom = (target: THREE.Vector3, distance: number) => {
      if (!stage) return;
      // Straight overhead no side faces the camera, so the last cut stands.
      const facing = new THREE.Vector2(camera.position.x - target.x, camera.position.z - target.z);
      if (facing.lengthSq() > 1e-6) cutaway = facing.normalize();
      stage.setCutaway(cutaway);
      const fog = stage.fog;
      const density = HOUSE_LIGHT.fog.density;
      fog.near = Math.max(0, distance - ROOM_RADIUS);
      fog.far = fog.near + (ROOM_RADIUS * 2) / Math.max(density, 0.01);
    };

    const placeCamera = () => {
      controls.update();
      if (byHand) {
        frameRoom(controls.target, camera.position.distanceTo(controls.target));
        return;
      }
      // The update above only drains the controls' leftover drag momentum: a
      // preset overwrites the whole pose, so none of it reaches a preset shot.
      const fit = fitDistance();
      const subject = snapshot.subject;
      const radius =
        typeof subject === "object" ? Math.max(propBounds(subject.prop).radius, PROP_RADIUS) : subject === "explorer" && stage?.explorer ? EXPLORER_RADIUS : ROOM_RADIUS;
      const distance = (fit * radius) / ROOM_RADIUS;
      const target = presetTarget();
      const direction = new THREE.Vector3(
        Math.sin(angle) * Math.cos(ELEVATION),
        Math.sin(ELEVATION),
        Math.cos(angle) * Math.cos(ELEVATION),
      );
      camera.position.copy(target).addScaledVector(direction, distance / zoom);
      camera.lookAt(target);
      controls.target.copy(target);
      frameRoom(target, fit);
    };

    /** A drag takes the camera from wherever the preset put it. */
    controls.addEventListener("start", () => {
      byHand = true;
      settled = true;
    });
    /** A preset turns the camera back from wherever the hand left it. */
    const settle = () => {
      if (byHand) angle = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
      byHand = false;
      settled = false;
    };

    const applyResolution = () => {
      const shortSide = snapshot.resolution;
      const { clientWidth, clientHeight } = ctx.container;
      const ratio = shortSide === null ? window.devicePixelRatio : shortSide / Math.min(clientWidth, clientHeight);
      ctx.setPixelRatio(ratio);
    };

    mounted = { rebuild, settle, applyResolution };
    rebuild();
    window.__betrayalBench = api;

    return {
      onFrame: (delta) => {
        guard.check();
        frames++;
        seconds = snapshot.frozenAt ?? seconds + delta;
        stage?.update(seconds);
        if (!byHand) {
          let goal = viewAngle(snapshot.view);
          goal += Math.round((angle - goal) / (Math.PI * 2)) * Math.PI * 2;
          const ease = Math.min(1, delta * 8);
          angle += (goal - angle) * ease;
          zoom += (snapshot.zoom - zoom) * ease;
          if (Math.abs(goal - angle) < 0.002 && Math.abs(snapshot.zoom - zoom) < 0.002) {
            angle = goal;
            zoom = snapshot.zoom;
            settled = true;
          }
        }
        placeCamera();
      },
      onResize: () => {
        applyResolution();
        placeCamera();
      },
      dispose: () => {
        controls.dispose();
        if (stage) {
          scene.remove(stage.root);
          stage.dispose();
        }
        baker.dispose();
        mounted = null;
        delete window.__betrayalBench;
      },
    };
  }

  return {
    mount,
    api,
    zooms: ZOOMS,
    resolutions: RESOLUTIONS,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => snapshot,
  };
}

export type Bench = ReturnType<typeof createBench>;

/** View 0 looks from the bottom-right corner; each step is a quarter turn. */
function viewAngle(view: number): number {
  return THREE.MathUtils.degToRad(45 + 90 * view);
}

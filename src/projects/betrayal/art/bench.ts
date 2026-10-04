import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import type { RoomDefinition } from "./room";
import { BENCH_ROOMS } from "./rooms";
import { buildRoomStage, roomTile, type Stage } from "./stage";

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

/** The dollhouse camera steps between four fixed views; the free camera is
 *  three's orbit controls, for looking around a room by hand. */
export type CameraMode = "dollhouse" | "free";

export interface BenchSnapshot {
  roomId: string;
  roomName: string;
  view: number;
  zoom: number;
  camera: CameraMode;
  resolution: Resolution;
}

export interface BenchApi {
  frameCount: () => number;
  setRoom: (id: string) => void;
  setView: (view: number) => void;
  setZoom: (zoom: number) => void;
  setCamera: (mode: CameraMode) => void;
  setResolution: (resolution: Resolution) => void;
  isReady: () => boolean;
  rooms: () => string[];
}

declare global {
  interface Window {
    __betrayalBench?: BenchApi;
  }
}

function definition(id: string): RoomDefinition {
  return BENCH_ROOMS.find((room) => room.id === id) ?? BENCH_ROOMS[0];
}

/** The art bench: one room on its own, with an orbiting dollhouse camera.
 *  Plain state outside React, so the page and screenshot tools drive the same thing. */
export function createBench(initialRoom: string) {
  const firstRoom = definition(initialRoom).id;
  let snapshot: BenchSnapshot = {
    roomId: firstRoom,
    roomName: roomTile(firstRoom).name,
    view: 0,
    zoom: ZOOMS[0],
    camera: "dollhouse",
    resolution: DEFAULT_RESOLUTION,
  };
  const listeners = new Set<() => void>();
  let mounted: {
    rebuild: () => void;
    settle: () => void;
    enterCamera: (mode: CameraMode) => void;
    applyResolution: () => void;
  } | null = null;
  let stageReady = false;
  let settled = false;
  let frames = 0;

  function update(next: BenchSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  const api: BenchApi = {
    frameCount: () => frames,
    setRoom: (id) => {
      const room = definition(id);
      if (room.id !== id) throw new Error(`The bench has no room "${id}"`);
      update({ ...snapshot, roomId: id, roomName: roomTile(id).name });
      const url = new URL(window.location.href);
      url.searchParams.set("bench", id);
      window.history.replaceState(window.history.state, "", url);
      mounted?.rebuild();
    },
    setView: (view) => {
      api.setCamera("dollhouse");
      update({ ...snapshot, view: ((view % 4) + 4) % 4 });
      mounted?.settle();
    },
    setZoom: (zoom) => {
      api.setCamera("dollhouse");
      update({ ...snapshot, zoom });
      mounted?.settle();
    },
    setCamera: (mode) => {
      if (mode === snapshot.camera) return;
      update({ ...snapshot, camera: mode });
      mounted?.enterCamera(mode);
    },
    setResolution: (resolution) => {
      update({ ...snapshot, resolution });
      mounted?.applyResolution();
    },
    isReady: () => stageReady && settled,
    rooms: () => BENCH_ROOMS.map((room) => room.id),
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

    let stage: Stage | null = null;
    const rebuild = () => {
      if (stage) {
        scene.remove(stage.root);
        stage.dispose();
      }
      stageReady = false;
      const built = buildRoomStage(definition(snapshot.roomId));
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
    const settle = () => {
      settled = false;
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = false;
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

    const dollhouseTarget = () => {
      const focus = new THREE.Vector3(...(definition(snapshot.roomId).focus ?? [0, 0.4, 0]));
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
      const density = definition(snapshot.roomId).mood.fog.density;
      fog.near = Math.max(0, distance - ROOM_RADIUS);
      fog.far = fog.near + (ROOM_RADIUS * 2) / Math.max(density, 0.01);
    };

    const placeCamera = () => {
      if (snapshot.camera === "free") {
        controls.update();
        frameRoom(controls.target, camera.position.distanceTo(controls.target));
        return;
      }
      const fit = fitDistance();
      const target = dollhouseTarget();
      const direction = new THREE.Vector3(
        Math.sin(angle) * Math.cos(ELEVATION),
        Math.sin(ELEVATION),
        Math.cos(angle) * Math.cos(ELEVATION),
      );
      camera.position.copy(target).addScaledVector(direction, fit / zoom);
      camera.lookAt(target);
      frameRoom(target, fit);
    };

    /** The free camera starts where the dollhouse camera is, and the dollhouse
     *  camera turns back from wherever the free one left off. */
    const enterCamera = (mode: CameraMode) => {
      if (mode === "free") {
        controls.target.copy(dollhouseTarget());
        controls.enabled = true;
        settled = true;
        return;
      }
      controls.enabled = false;
      angle = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
      settled = false;
    };

    const applyResolution = () => {
      const shortSide = snapshot.resolution;
      const { clientWidth, clientHeight } = ctx.container;
      const ratio = shortSide === null ? window.devicePixelRatio : shortSide / Math.min(clientWidth, clientHeight);
      if (Math.abs(renderer.getPixelRatio() - ratio) > 0.001) ctx.setPixelRatio(ratio);
    };

    mounted = { rebuild, settle, enterCamera, applyResolution };
    rebuild();
    window.__betrayalBench = api;

    return {
      onFrame: (delta) => {
        frames++;
        seconds += delta;
        stage?.update(seconds);
        if (snapshot.camera === "dollhouse") {
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

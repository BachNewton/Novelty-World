import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import { FLOORS, type Layout } from "../engine/board";
import type { FloorId } from "../types";
import { longfellow } from "./explorers/longfellow";
import { buildHouse, HOUSE_MOOD, tileCorners, type House, type HouseExplorer } from "./house";
import { HOUSE_FIXTURE } from "./house-layout";
import { pawn } from "./kit/pawn";
import { roomTile } from "./stage";

/** Pixels on the screen's short side, as on the bench; null is native. */
export type Resolution = number | null;
const RESOLUTIONS: Resolution[] = [270, 360, 540, 720, 1080, null];
const DEFAULT_RESOLUTION = 540;
const FIELD_OF_VIEW = 32;
const ELEVATION = THREE.MathUtils.degToRad(40);
const ZOOMS = [1, 1.6, 2.4];

/** Two explorers for the prototype: Longfellow, whose turn it is, in the
 *  Library, and a recoloured scale pawn in the Foyer. */
const FIXTURE_EXPLORERS: HouseExplorer[] = [
  { room: "library", build: longfellow, colour: "amber", active: true },
  { room: "foyer", build: () => pawn({ colour: "bone" }), colour: "verdigrisLight", active: false },
];

export type FloorChoice = FloorId | "all";

export interface HouseSnapshot {
  view: number;
  zoom: number;
  floor: FloorChoice;
  /** The room a close view frames, or null for the whole floor. */
  focus: string | null;
  resolution: Resolution;
  frozenAt: number | null;
}

/** What one frame cost to draw, for measuring. */
export interface HouseStats {
  calls: number;
  triangles: number;
  /** Point lights in the rooms showing, and how many of them cast shadows. */
  pointLights: number;
  shadowLights: number;
  /** The CPU time of the last render call, in ms. */
  renderMs: number;
  maxTextureUnits: number;
  maxFragmentUniforms: number;
  drawingBuffer: [number, number];
}

export interface HouseApi {
  frameCount: () => number;
  setView: (view: number) => void;
  setZoom: (zoom: number) => void;
  setFloor: (floor: FloorChoice) => void;
  setFocus: (room: string | null) => void;
  setResolution: (resolution: Resolution) => void;
  freezeClock: (seconds: number | null) => void;
  isReady: () => boolean;
  floors: () => FloorId[];
  /** The rooms on a floor, as tile ids. */
  rooms: (floor: FloorId) => string[];
  stats: () => HouseStats;
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

/** The house view: an engine layout as a house of rooms, one floor at a time
 *  or all stacked, under an orbit camera that four presets, zoom and a focus
 *  room place, and that a drag takes from there. Plain state outside React,
 *  so the page and screenshot tools drive the same thing. */
export function createHouseView(layout: Layout = HOUSE_FIXTURE) {
  const floors = FLOORS.filter((floor) => layout.tiles.some((tile) => tile.floor === floor));
  let snapshot: HouseSnapshot = {
    view: 0,
    zoom: ZOOMS[0],
    floor: "ground",
    focus: null,
    resolution: DEFAULT_RESOLUTION,
    frozenAt: null,
  };
  const listeners = new Set<() => void>();
  let mounted: { settle: () => void; applyResolution: () => void; showFloor: () => void; stats: () => HouseStats } | null = null;
  let houseReady = false;
  let settled = false;
  let frames = 0;
  let house: House | null = null;

  function update(next: HouseSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  const floorOf = (room: string) => {
    const tile = layout.tiles.find((placed) => placed.tile === room);
    if (!tile) throw new Error(`The house has no room "${room}"`);
    return tile.floor;
  };

  const api: HouseApi = {
    frameCount: () => frames,
    setView: (view) => {
      update({ ...snapshot, view: ((view % 4) + 4) % 4 });
      mounted?.settle();
    },
    setZoom: (zoom) => {
      update({ ...snapshot, zoom });
      mounted?.settle();
    },
    setFloor: (floor) => {
      update({ ...snapshot, floor, focus: snapshot.focus && floor !== "all" && floorOf(snapshot.focus) === floor ? snapshot.focus : null });
      mounted?.showFloor();
      mounted?.settle();
    },
    setFocus: (room) => {
      update({ ...snapshot, focus: room, floor: room ? floorOf(room) : snapshot.floor });
      mounted?.showFloor();
      mounted?.settle();
    },
    setResolution: (resolution) => {
      update({ ...snapshot, resolution });
      mounted?.applyResolution();
    },
    freezeClock: (seconds) => {
      update({ ...snapshot, frozenAt: seconds });
    },
    isReady: () => houseReady && settled,
    floors: () => floors,
    rooms: (floor) => layout.tiles.filter((tile) => tile.floor === floor).map((tile) => tile.tile),
    stats: () => {
      if (!mounted) throw new Error("The house view is not mounted");
      return mounted.stats();
    },
  };

  function mount(ctx: ThreeSceneContext): ThreeSceneHandlers {
    const { scene, camera, renderer } = ctx;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.imageRendering = "pixelated";
    renderer.toneMappingExposure = 1.5;
    camera.fov = FIELD_OF_VIEW;
    camera.near = 0.1;
    camera.far = 400;

    const built = buildHouse(layout, FIXTURE_EXPLORERS);
    house = built;
    scene.add(built.root);
    scene.fog = built.fog;
    scene.background = built.background;
    void built.ready.then(() => {
      if (house === built) houseReady = true;
    });

    let angle = viewAngle(snapshot.view);
    let zoom = snapshot.zoom;
    let seconds = 0;
    let byHand = false;
    let cutaway = new THREE.Vector2(1, 1).normalize();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 1;
    controls.maxDistance = 150;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(88);

    /** What the presets frame: the focus room's tile, or every room showing. */
    const subject = () => {
      if (!snapshot.focus) return built.corners();
      const room = built.rooms.find((placed) => placed.id === snapshot.focus);
      if (!room) throw new Error(`The house has no room "${snapshot.focus}"`);
      return tileCorners(room.centre);
    };

    const frame = (target: THREE.Vector3, distance: number, radius: number) => {
      const facing = new THREE.Vector2(camera.position.x - target.x, camera.position.z - target.z);
      if (facing.lengthSq() > 1e-6) cutaway = facing.normalize();
      built.setCutaway(cutaway, snapshot.focus);
      built.fog.near = Math.max(0, distance - radius);
      built.fog.far = built.fog.near + (radius * 2) / Math.max(HOUSE_MOOD.fog.density, 0.01);
    };

    const placeCamera = () => {
      controls.update();
      const points = subject();
      const radius = new THREE.Sphere().setFromPoints(points).radius;
      if (byHand) {
        frame(controls.target, camera.position.distanceTo(controls.target), radius);
        return;
      }
      const back = new THREE.Vector3(Math.sin(angle) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(angle) * Math.cos(ELEVATION));
      const { target, distance: fit } = fitView(points, back, camera);
      camera.position.copy(target).addScaledVector(back, fit / zoom);
      camera.lookAt(target);
      controls.target.copy(target);
      frame(target, fit, radius);
    };

    controls.addEventListener("start", () => {
      byHand = true;
      settled = true;
    });
    const settle = () => {
      if (byHand) angle = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
      byHand = false;
      settled = false;
    };

    const applyResolution = () => {
      const shortSide = snapshot.resolution;
      const { clientWidth, clientHeight } = ctx.container;
      const ratio = shortSide === null ? window.devicePixelRatio : shortSide / Math.min(clientWidth, clientHeight);
      if (Math.abs(renderer.getPixelRatio() - ratio) > 0.001) ctx.setPixelRatio(ratio);
    };

    const gl = renderer.getContext();
    const stats = (): HouseStats => {
      const lights = built.rooms.filter((room) => snapshot.floor === "all" || room.floor === snapshot.floor).flatMap((room) => room.part.lights);
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        pointLights: lights.length,
        shadowLights: lights.filter((light) => light.castShadow).length,
        renderMs: ctx.mainRenderMs(),
        maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number,
        maxFragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number,
        drawingBuffer: [size.x, size.y],
      };
    };

    mounted = { settle, applyResolution, showFloor: () => built.showFloor(snapshot.floor), stats };
    built.showFloor(snapshot.floor);
    window.__betrayalHouse = api;

    return {
      onFrame: (delta) => {
        frames++;
        seconds = snapshot.frozenAt ?? seconds + delta;
        built.update(seconds);
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
        scene.remove(built.root);
        built.dispose();
        house = null;
        mounted = null;
        delete window.__betrayalHouse;
      },
    };
  }

  return {
    mount,
    api,
    zooms: ZOOMS,
    floors,
    resolutions: RESOLUTIONS,
    roomName: (id: string) => roomTile(id).name,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => snapshot,
  };
}

export type HouseView = ReturnType<typeof createHouseView>;

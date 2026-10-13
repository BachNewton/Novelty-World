import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import { workerLanes } from "./bake-workers";
import { createBakeScheduler } from "./bake-schedule";
import { freezeRoom } from "./freeze";
import { cameraDistance, FIELD_OF_VIEW } from "./house-camera";
import { driveFlames, flame, FLAME_PRESETS, momentAtSignal, type FlamePresetName } from "./kit/flame";
import { budgetGuard, fillLight, HOUSE_LIGHT, type BakedLight } from "./lighting";
import { createLitFloor } from "./lit-floor";
import { paletteHex } from "./palette";
import { WALL_HEIGHT } from "./room";
import { box, cylinder, flat, glow, group } from "./shapes";
import { disposeTree, type RoomPart } from "./stage";
import { texturesUnder } from "./textures";

/*
 * The flame bench (`?bench=flames`): each flame preset of the kit (`kit/flame.ts`)
 * on a holder by a wall, beside today's lit diamond at the same size, to judge
 * the shader flame against it before any room takes it up.
 *
 * Each preset's light goes through the house's own path: frozen and baked as a
 * room is (`freezeRoom`, `createLitFloor`), with its flicker on signal 0, the
 * signal its flame dips with, so the wall's glow and the flame move together.
 * Every preset is on that one signal, so all of them dip at once, where a room
 * spreads its flames over the four; that lets one held flicker hold them all.
 * The house's fill lights the stage; there is no moon and no fog.
 */

const SIGNAL = 0;

/** Where each preset stands along the wall, and what it burns on. */
interface Station {
  name: FlamePresetName;
  x: number;
  /** The flame's foot: on the wick, the burner, the torch's head or the hearth's logs. */
  foot: [y: number, z: number];
  /** How far today's diamond stands to its left. */
  apart: number;
  /** Whether it stands on a plinth, as a candle or a lamp on a table. */
  plinth?: boolean;
  holder: () => THREE.Object3D;
}

const WALL_Z = -0.6;
const PLINTH = 0.8;

const STATIONS: readonly Station[] = [
  {
    name: "candle",
    x: -3.3,
    foot: [PLINTH + 0.16, 0],
    apart: 0.2,
    plinth: true,
    holder: () => cylinder(0.028, 0.15, flat("bone"), [0, PLINTH, 0], { sides: 6 }),
  },
  {
    name: "oilLamp",
    x: -1.8,
    foot: [PLINTH + 0.1, 0],
    apart: 0.24,
    plinth: true,
    holder: () =>
      group(
        cylinder(0.07, 0.02, flat("brass"), [0, PLINTH, 0], { top: 0.05, sides: 8 }),
        cylinder(0.06, 0.06, flat("brass"), [0, PLINTH + 0.02, 0], { top: 0.02, sides: 8 }),
        cylinder(0.012, 0.02, flat("soot"), [0, PLINTH + 0.08, 0], { sides: 4 }),
      ),
  },
  {
    name: "gasJet",
    x: -0.3,
    foot: [1.42, -0.32],
    apart: 0.24,
    holder: () =>
      group(
        box([0.05, 0.05, 0.05], flat("brass"), [0, 1.37, WALL_Z + 0.05]),
        box([0.02, 0.02, 0.26], flat("brass"), [0, 1.38, WALL_Z + 0.17]),
        cylinder(0.01, 0.03, flat("brass"), [0, 1.39, -0.32], { sides: 4 }),
      ),
  },
  {
    name: "torch",
    x: 1.3,
    foot: [1.55, -0.38],
    apart: 0.3,
    holder: () =>
      group(
        box([0.06, 0.16, 0.04], flat("soot"), [0, 1.2, WALL_Z + 0.07]),
        box([0.03, 0.03, 0.2], flat("soot"), [0, 1.3, WALL_Z + 0.15]),
        cylinder(0.025, 0.35, flat("wood"), [0, 1.2, -0.38], { top: 0.035, sides: 6 }),
      ),
  },
  {
    name: "hearth",
    x: 3.1,
    foot: [0.1, -0.1],
    apart: 0.5,
    holder: () => {
      const logs = group(
        box([1.0, 0.06, 0.55], flat("stoneDark"), [0, 0, -0.15]),
        cylinder(0.05, 0.6, flat("woodDark"), [0, 0, 0], { sides: 6 }),
        cylinder(0.05, 0.6, flat("woodDark"), [0, 0, 0], { sides: 6 }),
      );
      logs.children[1].rotation.set(0, 0.25, Math.PI / 2);
      logs.children[1].position.set(0.3, 0.1, -0.1);
      logs.children[2].rotation.set(0, -0.3, Math.PI / 2);
      logs.children[2].position.set(0.3, 0.1, -0.05);
      return logs;
    },
  },
];

/** How the camera stands: as the house's at its usual zoom, as the house's zoomed in, or close up. */
export const CAMERAS = [
  { id: "house", label: "House (zoom 1)" },
  { id: "houseNear", label: "House (zoom 3)" },
  { id: "close", label: "Close" },
] as const;
export type CameraId = (typeof CAMERAS)[number]["id"];

/** How fast the clock runs, as a share of real time. */
export const SPEEDS = [0.25, 0.5, 1, 2] as const;

export const FLAME_NAMES = STATIONS.map((station) => station.name);

export interface FlameBenchSnapshot {
  camera: CameraId;
  /** The preset the camera centres on, or null for the whole row. */
  focus: FlamePresetName | null;
  speed: number;
  /** The clock stands still at this many seconds; null lets it run. */
  frozenAt: number | null;
  /** The flicker signal held at this value (−1 to 1) while the flames' noise runs on; null lets it flicker. */
  held: number | null;
  /** Whether today's diamonds stand beside the shader flames. */
  diamonds: boolean;
  baking: boolean;
}

export interface FlameBenchApi {
  frameCount: () => number;
  isReady: () => boolean;
  setCamera: (camera: CameraId) => void;
  setFocus: (focus: FlamePresetName | null) => void;
  setSpeed: (speed: number) => void;
  /** Stops the clock at a moment, so screenshots differ only when the art does; null starts it again. */
  freezeClock: (seconds: number | null) => void;
  holdFlicker: (value: number | null) => void;
  setDiamonds: (on: boolean) => void;
}

declare global {
  interface Window {
    __betrayalFlameBench?: FlameBenchApi;
  }
}

/** Today's flame, the candle's lit diamond (`kit/candles.ts`), at a preset's size: the candle's at the candle's. */
function diamond(name: FlamePresetName): THREE.Mesh {
  const scale = FLAME_PRESETS[name].height / FLAME_PRESETS.candle.height;
  const geometry = new THREE.OctahedronGeometry(0.022 * scale, 0);
  geometry.scale(1, 2.2, 1);
  geometry.translate(0, 0.045 * scale, 0);
  return new THREE.Mesh(geometry, glow("flame"));
}

function lightOf(station: Station): BakedLight {
  const { height, light } = FLAME_PRESETS[station.name];
  // Lifted off what it burns on, which would otherwise blow out in it, as the kit's candle lifts its light.
  return { ...light, signal: SIGNAL, at: new THREE.Vector3(station.x, station.foot[0] + height * 0.5 + 0.06, station.foot[1]) };
}

/** The stage as a room part, ready to freeze and bake: a floor, a back wall, plinths, holders and the lights. */
function stagePart(): RoomPart {
  const root = group(box([9.5, 0.2, 3], flat("sootLight"), [0, -0.2, 0.6]), box([9.5, WALL_HEIGHT, 0.12], flat("ash"), [0, 0, WALL_Z - 0.06]));
  for (const station of STATIONS.filter((s) => s.plinth)) root.add(box([0.7, PLINTH, 0.36], flat("stoneDark"), [station.x - station.apart / 2, 0, 0]));
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  for (const station of STATIONS) {
    for (const x of [station.x, station.x - station.apart]) {
      const holder = station.holder();
      holder.position.x = x;
      root.add(holder);
    }
  }
  return {
    root,
    walls: [],
    corners: [],
    hung: [],
    cutWalls: () => undefined,
    update: () => undefined,
    explorer: null,
    lights: STATIONS.map(lightOf),
    spots: [],
    ready: texturesUnder(root),
    dispose: () => disposeTree(root),
  };
}

/** The bench's state outside React, so the page and screenshot tools drive the same thing. */
export function createFlameBench() {
  let snapshot: FlameBenchSnapshot = { camera: "house", focus: null, speed: 1, frozenAt: null, held: null, diamonds: true, baking: true };
  const listeners = new Set<() => void>();
  let mounted: { place: () => void; show: () => void } | null = null;
  let ready = false;
  let frames = 0;
  let seconds = 0;
  /** The moment the flicker is held at, worked out once when it is held. */
  let heldAt: number | null = null;

  function update(next: FlameBenchSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  const api: FlameBenchApi = {
    frameCount: () => frames,
    isReady: () => ready,
    setCamera: (camera) => {
      update({ ...snapshot, camera });
      mounted?.place();
    },
    setFocus: (focus) => {
      update({ ...snapshot, focus });
      mounted?.place();
    },
    setSpeed: (speed) => {
      update({ ...snapshot, speed });
    },
    freezeClock: (at) => {
      if (at !== null) seconds = at;
      update({ ...snapshot, frozenAt: at });
    },
    holdFlicker: (value) => {
      if (value !== null && !(value >= -1 && value <= 1)) throw new Error(`A flicker signal runs from −1 to 1; ${value} given`);
      heldAt = value === null ? null : momentAtSignal(value, SIGNAL);
      update({ ...snapshot, held: value });
    },
    setDiamonds: (on) => {
      update({ ...snapshot, diamonds: on });
      mounted?.show();
    },
  };

  function mount(ctx: ThreeSceneContext): ThreeSceneHandlers {
    const { scene, camera, renderer } = ctx;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMappingExposure = 1.5;
    camera.fov = FIELD_OF_VIEW;
    camera.near = 0.02;
    camera.far = 200;
    camera.updateProjectionMatrix();
    scene.background = new THREE.Color(paletteHex(HOUSE_LIGHT.fog.colour));
    scene.fog = null;

    const guard = budgetGuard(renderer);
    const bakes = createBakeScheduler(() => workerLanes());
    const floor = createLitFloor(bakes, "flame-bench");
    const fill = fillLight();
    const flames = STATIONS.map((station) => {
      const mesh = flame(station.name, { signal: SIGNAL });
      mesh.position.set(station.x, ...station.foot);
      return mesh;
    });
    const diamonds = STATIONS.map((station) => {
      const mesh = diamond(station.name);
      mesh.position.set(station.x - station.apart, ...station.foot);
      return mesh;
    });
    scene.add(floor.root, fill, ...flames, ...diamonds);

    const part = stagePart();
    const frozen = freezeRoom("flame-bench", part);
    let live = true;
    void floor.place([{ id: "stage", room: frozen, matrix: new THREE.Matrix4() }]).then((done) =>
      Promise.all([frozen.ready, done.bounce]).then(() => {
        part.dispose();
        if (!live) return;
        ready = true;
        update({ ...snapshot, baking: false });
      }),
    );

    const show = () => {
      for (const mesh of diamonds) mesh.visible = snapshot.diamonds;
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 0.15;
    controls.maxDistance = 80;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
    /** Puts the camera where the presets say, round the focused preset's flame or the row's middle. */
    const place = () => {
      const station = STATIONS.find((s) => s.name === snapshot.focus);
      const preset = station ? FLAME_PRESETS[station.name] : null;
      const target = station
        ? new THREE.Vector3(station.x - station.apart / 2, station.foot[0] + (preset?.height ?? 0) * 0.5, station.foot[1])
        : new THREE.Vector3(0, 0.8, -0.2);
      const close = station ? Math.max(0.45, (preset?.height ?? 0) * 6 + station.apart * 2) : 6;
      const distance = { house: cameraDistance(1, camera.aspect), houseNear: cameraDistance(3, camera.aspect), close }[snapshot.camera];
      const elevation = THREE.MathUtils.degToRad(snapshot.camera === "close" ? 14 : 40);
      const angle = THREE.MathUtils.degToRad(snapshot.camera === "close" ? 15 : 30);
      camera.position.copy(target).add(new THREE.Vector3(Math.sin(angle) * Math.cos(elevation), Math.sin(elevation), Math.cos(angle) * Math.cos(elevation)).multiplyScalar(distance));
      camera.lookAt(target);
      controls.target.copy(target);
      controls.update();
    };

    mounted = { place, show };
    place();
    window.__betrayalFlameBench = api;

    return {
      onFrame: (delta) => {
        guard.check();
        frames++;
        if (snapshot.frozenAt === null) seconds += delta * snapshot.speed;
        const signalSeconds = heldAt ?? seconds;
        floor.update(signalSeconds);
        driveFlames(seconds, signalSeconds);
        controls.update();
      },
      onResize: place,
      dispose: () => {
        live = false;
        ready = false;
        controls.dispose();
        floor.dispose();
        bakes.stop();
        for (const mesh of [...flames, ...diamonds]) mesh.geometry.dispose();
        for (const mesh of diamonds) (mesh.material as THREE.Material).dispose();
        scene.remove(floor.root, fill, ...flames, ...diamonds);
        mounted = null;
        delete window.__betrayalFlameBench;
      },
    };
  }

  return {
    mount,
    api,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => snapshot,
  };
}

export type FlameBench = ReturnType<typeof createFlameBench>;

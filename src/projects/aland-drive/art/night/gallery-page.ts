import { Group, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector3, type Camera, type Node, type Scene } from "three/webgpu";
import { float, mix, sin, smoothstep, step, uv } from "three/tsl";
import { startGame, type Place } from "../../render/game";
import type { Sky, SkyLook } from "../sky/sky";
import { placesOf } from "../marina/places";
import { placeModel } from "../roadside/material";
import { buildTownLamp } from "../town-kit/lamps";
import { townMaterials } from "../town-kit/material";
import { rhythm } from "./characteristic";
import { shareOf } from "./sea-lights";
import { createAurora, createCarGlows, createGlows, createLampPools, createSeaBeams, harbourGlows, lampGlow, litSign, NIGHT_STOPS, SEA_LIGHTS, seaLightGlows, type Headlights, type LampKind, type LampSpot, type Night, type NightLook } from ".";

/* The gallery's page: the real game on real tiles, with the night's integration applied in memory and its pieces on stage. */

interface Hook {
  scene: Scene;
  camera: Camera;
  world: { height: (x: number, z: number) => number };
  manifest: { worldOrigin: { east: number; north: number } };
  night: Night;
  sky: Sky;
  lookAtHour: (amount: number) => SkyLook;
  headlights: Headlights;
  clipmap: { groundAt: (level: number, place: Node<"vec2">) => Node<"float"> };
  colour: (name: string) => Node<"vec3">;
  hazed: (color: Node<"vec3">) => Node<"vec3">;
  sun: { azimuthDeg: number; elevationDeg: number };
  linear: (name: string) => Vector3;
}

export interface NightView {
  name: string;
  at?: Place;
  /** A showcase spot's key, for the chase camera with the headlights on. */
  jump?: string;
  seconds?: number;
  /** Sets the clock to a turning light's flash as seen from `at`, and this share of a period after it. */
  flashOf?: string;
  afterFlash?: number;
  aurora?: number;
}

/** A straight street's lamp posts, both sides, in the scene. The real placing is `art/town-kit`'s and `art/street`'s, and belongs to the integrator. */
interface LampRow {
  kind: LampKind;
  fromEast: number;
  fromNorth: number;
  bearingDeg: number;
  sideM: number;
  stepM: number;
  count: number;
}

const LAMP_ROWS: readonly LampRow[] = [
  { kind: "town", fromEast: 108060, fromNorth: 6683258, bearingDeg: 268, sideM: 8, stepM: 32, count: 22 },
  { kind: "town", fromEast: 107740, fromNorth: 6683073, bearingDeg: 92, sideM: 7, stepM: 30, count: 22 },
];
const CARS_ON_STAGE = 6;

declare global {
  interface Window {
    __nightHookReady?: Hook;
    __nightHook?: { beforeFrame: () => void };
    __nightFailure?: string;
    __nightGallery?: {
      setHour: (look: NightLook) => void;
      show: (view: NightView) => void;
      /** Shows or hides everything the night draws, for measuring it. */
      setDrawn: (drawn: boolean) => void;
      instances: Record<string, number>;
    };
  }
}

const element = document.getElementById("game");
if (!element) throw new Error("no game element");

function flashSeconds({ at, flashOf, afterFlash = 0 }: NightView, { manifest }: Hook) {
  const light = SEA_LIGHTS.find(({ name }) => name?.startsWith(flashOf ?? "") === true);
  if (!light || !at) throw new Error("gallery: no such light in view");
  const [eyeX, eyeZ] = [at.east - manifest.worldOrigin.east, -(at.north - manifest.worldOrigin.north)];
  const found = rhythm(light.sectors[0]);
  const flash = found.flashes[0];
  const share = (flash.fromS + flash.toS) / 2 / found.periodS;
  const bearing = Math.atan2(light.x - eyeX, -(light.z - eyeZ)) / (Math.PI * 2);
  const seconds = (share - shareOf(light.x, light.z) + bearing + afterFlash) * found.periodS;
  return seconds + found.periodS * 1000;
}

/** A shop's board on a wall's height beside the street, in a shop's colour, with blocks for letters: the facades' real boards take `litSign` the same way. */
function shopBoard({ world, manifest, night, colour, hazed }: Hook) {
  const [x, z] = [107930 - manifest.worldOrigin.east, -(6683062 - manifest.worldOrigin.north)];
  const geometry = new PlaneGeometry(7, 1.1);
  const material = new MeshBasicNodeMaterial({ side: 2 });
  const letters = smoothstep(float(0.35), float(0.4), sin(uv().x.mul(70)).abs()).mul(step(float(0.3), uv().y)).mul(step(uv().y, float(0.7))).mul(step(float(0.08), uv().x)).mul(step(uv().x, float(0.92)));
  const painted = mix(colour("edge"), colour("wall-trim"), letters);
  material.colorNode = hazed(painted).add(litSign(night, painted, letters).sub(painted).max(0));
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, world.height(x, z) + 3.4, z);
  mesh.rotation.y = -Math.PI / 2;
  return mesh;
}

function lampSpots({ world, manifest }: Hook): LampSpot[] {
  const spots: LampSpot[] = [];
  for (const row of LAMP_ROWS) {
    const bearing = (row.bearingDeg * Math.PI) / 180;
    const [alongX, alongZ] = [Math.sin(bearing), -Math.cos(bearing)];
    for (let at = 0; at < row.count; at++) {
      for (const side of row.kind === "road" ? [1] : [-1, 1]) {
        const x = row.fromEast - manifest.worldOrigin.east + alongX * at * row.stepM - alongZ * side * row.sideM;
        const z = -(row.fromNorth - manifest.worldOrigin.north) + alongZ * at * row.stepM + alongX * side * row.sideM;
        spots.push({ kind: row.kind, x, y: world.height(x, z), z, yaw: Math.atan2(alongZ * side, -alongX * side) });
      }
    }
  }
  return spots;
}

startGame(element, {
  onHud: () => undefined,
  onInputKind: () => undefined,
  onCamera: () => undefined,
  onFailure: (error) => {
    window.__nightFailure = error.stack ?? error.message;
  },
})
  .then((game) => {
    (window as unknown as { __alandDrive: unknown }).__alandDrive = game.probe;
    const hook = window.__nightHookReady;
    if (!hook) throw new Error("no hook: the integration did not apply");
    const { night, sky, scene, camera, lookAtHour, headlights, clipmap } = hook;

    const spots = lampSpots(hook);
    const sea = seaLightGlows();
    const harbours = harbourGlows(placesOf("marina"));
    const all = [...spots.map(lampGlow), ...sea.glows, ...harbours];
    const glows = createGlows(night, all, sea.rhythms);
    const pools = createLampPools(night, spots, (place) => clipmap.groundAt(0, place));
    const beams = createSeaBeams(night);
    const cars = createCarGlows(night, CARS_ON_STAGE);
    const aurora = createAurora(night, 110000);
    const stage = new Group();
    const meshes: Mesh[] = [glows.mesh, pools.mesh, beams.mesh, cars.mesh, aurora.mesh];
    stage.add(...meshes, shopBoard(hook), ...placeModel(buildTownLamp(), spots, townMaterials({ colour: hook.colour, linear: hook.linear, hazed: hook.hazed, sun: hook.sun, time: night.seconds })));
    scene.add(stage);

    const eye = new Vector3();
    let lastClock = performance.now();
    window.__nightHook = {
      beforeFrame() {
        const now = performance.now();
        sky.update(camera.getWorldPosition(eye), (now - lastClock) / 1000);
        lastClock = now;
        aurora.update(eye);
      },
    };

    const forward = new Vector3();
    const lamps = new Vector3();
    const probe = game.probe;
    window.__nightGallery = {
      instances: { glows: all.length, pools: spots.length, beams: beams.beams, rhythms: sea.rhythms.length },
      setHour(look) {
        night.amount.value = NIGHT_STOPS[look];
        sky.setLook(lookAtHour(NIGHT_STOPS[look]));
      },
      show(view) {
        night.seconds.value = view.seconds ?? flashSeconds(view, hook);
        aurora.setStrength(view.aurora ?? 0);
        if (view.at) {
          probe.look(view.at);
          headlights.update(lamps.set(0, -1000, 0), forward.set(0, 0, -1), false);
          cars.update([]);
          return;
        }
        const { position, rotation } = probe.car() as unknown as { position: [number, number, number]; rotation: [number, number, number, number] };
        const [x, y, z, w] = rotation;
        forward.set(-2 * (x * z + w * y), -2 * (y * z - w * x), -(1 - 2 * (x * x + y * y))).normalize();
        lamps.set(position[0], position[1] + 0.1, position[2]).addScaledVector(forward, 2);
        headlights.update(lamps, forward, true);
        const flat = Math.hypot(forward.x, forward.z);
        const [fx, fz] = [forward.x / flat, forward.z / flat];
        cars.update([
          { x: position[0] + fx * 60 + fz * 1.8, y: position[1], z: position[2] + fz * 60 - fx * 1.8, forwardX: fx, forwardZ: fz, braking: true },
          { x: position[0] + fx * 150 - fz * 1.8, y: position[1], z: position[2] + fz * 150 + fx * 1.8, forwardX: -fx, forwardZ: -fz, braking: false },
        ]);
      },
      setDrawn(drawn) {
        stage.visible = drawn;
        headlights.cones.visible = drawn;
      },
    };
  })
  .catch((error: unknown) => {
    window.__nightFailure = error instanceof Error ? (error.stack ?? error.message) : String(error);
  });

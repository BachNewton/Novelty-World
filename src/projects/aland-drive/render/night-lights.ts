import type { Scene, WebGPURenderer } from "three/webgpu";
import { createCarGlows, createGlows, createLampLight, lampGlow, LAMPS_ON_FROM, POOL_REACH_M, seaLightGlows, type CarAtNight, type LampSpot, type Night, type V3 } from "../art/night";
import { uniform } from "three/tsl";
import { lampAt } from "./lighthouses";
import { LIGHTS_ON_MARKS } from "./lights-on-marks";
import { lampOnMark } from "./sea-marks";

/*
 * The night's lights in the game (`art/night`): every lamp beside the roads, the sea's lights from OSM flashing from
 * their own lamps, and other players' head and tail lamps, all as glows in one draw;
 * and the light the lamps near the camera cast, which every colour drawn takes (`lightOn`). By day, before the first
 * lamp strikes, none of it is drawn or cast.
 */

/** More lamps than the tiles with detail round Mariehamn hold together. */
const LAMPS_MOST = 12000;
/** How far the camera moves before the cast lamps' list is written again, and how far past their reach it holds them. */
const POOLS_MARGIN_M = 100;
/** A lamp and a car out of sight, so no list is empty while the pipelines are built before the drive. */
const NOWHERE_LAMP: LampSpot = { kind: "road", x: 0, y: -10000, z: 0 };
const NOWHERE: readonly [number, number, number] = [0, -10000, 0];
const NOWHERE_CAR: CarAtNight = { head: [NOWHERE, NOWHERE], tail: [NOWHERE, NOWHERE], forwardX: 0, forwardZ: -1, braking: false };
const CARS_MOST = 64;

export interface NightLights {
  /** The roadside's lamps, whenever they change. */
  setLamps: (spots: readonly LampSpot[]) => void;
  /** Other players' cars this frame. */
  setCars: (cars: readonly CarAtNight[]) => void;
  /** Each frame, before drawing: draws the lights only once lamps are coming on, and casts the near lamps' light. */
  update: (renderer: WebGPURenderer, camera: { x: number; z: number }) => void;
  /** A surface's light from the lamps, for its colour by day: added to its lit colour before haze. */
  lightOn: (albedo: V3) => V3;
  /** Builds the casting pass's pipeline, before the drive. */
  compile: (renderer: WebGPURenderer) => Promise<void>;
  /** Every mesh shown, for compiling before the drive; `false` puts back what the hour says. */
  showAll: (all: boolean) => void;
  /** Shows the night's lights or leaves them out, to see what they cost. */
  show: (shown: boolean) => void;
  dispose: () => void;
}

/** The ground as the world has it, and a count that changes whenever it does. */
interface Ground {
  height: (x: number, z: number) => number;
  revision: () => number;
}

export function createNightLights(scene: Scene, night: Night, { onAland, ground }: { onAland: boolean; ground: Ground }): NightLights {
  // Every glow is in the lamp of a model drawn there: a sea light in the mark under it, a lighthouse's in its tower's
  // lamp, pulled out to clear its lantern. A light with no model to shine from isn't drawn.
  const seaLights = onAland ? LIGHTS_ON_MARKS : [];
  const lampY = lampOnMark(ground.height);
  const sea = seaLightGlows(seaLights, lampY);
  const fixed = sea.glows;
  const lanterns = fixed.map((glow) => (glow.streak === true ? undefined : lampAt(glow.x, glow.z)?.outM));
  let groundRevision: number | null = null;
  const glows = createGlows(night, fixed, sea.rhythms, fixed.length + LAMPS_MOST);
  const pools = createLampLight(night, LAMPS_MOST);
  const cars = createCarGlows(night, CARS_MOST);
  const meshes = [glows.mesh, cars.mesh];
  scene.add(...meshes);
  let compiling = false;
  let hidden = false;
  const shownLight = uniform(1);
  // Every lamp has its glow, but its light only falls near, so the cast list holds only the lamps within their reach.
  let lamps: readonly LampSpot[] = [];
  let poolsAround: { x: number; z: number } | null = null;
  let glowCount = fixed.length;
  const writeLamps = (spots: readonly LampSpot[]) => {
    spots.forEach((spot, at) => {
      glows.set(fixed.length + at, lampGlow(spot));
    });
    glowCount = fixed.length + spots.length;
    glows.upload(glowCount);
  };
  // A sea mark ashore stands on the ground as the world has it, which sharpens as tiles land, so its light follows.
  const standSeaLights = () => {
    groundRevision = ground.revision();
    seaLightGlows(seaLights, lampY).glows.forEach((glow, at) => {
      const outM = lanterns[at];
      fixed[at] = outM === undefined ? glow : { ...glow, outM };
      glows.set(at, fixed[at]);
    });
    glows.upload(glowCount);
  };
  const refillPools = (camera: { x: number; z: number }) => {
    poolsAround = { x: camera.x, z: camera.z };
    pools.set(lamps.filter(({ x, z }) => Math.hypot(x - camera.x, z - camera.z) < POOL_REACH_M + POOLS_MARGIN_M));
  };
  const lit = () => compiling || (!hidden && night.amount.value > LAMPS_ON_FROM);
  const show = () => {
    for (const mesh of meshes) mesh.visible = lit();
  };

  return {
    setLamps(spots) {
      if (spots.length > LAMPS_MOST) throw new Error(`${spots.length} lamps, and room for ${LAMPS_MOST}`);
      writeLamps(spots);
      lamps = spots;
      poolsAround = null;
    },
    setCars(seen) {
      if (seen.length > CARS_MOST) throw new Error(`${seen.length} cars to light, and room for ${CARS_MOST}`);
      cars.update(seen);
    },
    update(renderer, camera) {
      if (ground.revision() !== groundRevision) standSeaLights();
      show();
      if (!lit()) return;
      if (poolsAround === null || Math.hypot(camera.x - poolsAround.x, camera.z - poolsAround.z) > POOLS_MARGIN_M) refillPools(camera);
      pools.cast(renderer, camera);
    },
    lightOn: (albedo) => pools.lightOn(albedo).mul(shownLight),
    compile: pools.compile,
    showAll(all) {
      compiling = all;
      show();
      writeLamps(all ? [...lamps, NOWHERE_LAMP] : lamps);
      pools.set(all ? [NOWHERE_LAMP] : []);
      poolsAround = null;
      cars.update(all ? [NOWHERE_CAR] : []);
    },
    show(shown) {
      hidden = !shown;
      shownLight.value = shown ? 1 : 0;
      show();
    },
    dispose() {
      for (const mesh of meshes) scene.remove(mesh);
      glows.dispose();
      pools.dispose();
      cars.dispose();
    },
  };
}

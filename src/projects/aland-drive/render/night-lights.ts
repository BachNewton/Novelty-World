import type { Scene } from "three/webgpu";
import { createCarGlows, createGlows, createLampPools, createSeaBeams, lampGlow, LAMPS_ON_FROM, POOL_REACH_M, seaLightGlows, type CarAtNight, type GroundAt, type LampSpot, type Night } from "../art/night";
import { LIGHTS_ON_MARKS, lampOnMark } from "./lights-on-marks";

/*
 * The night's lights in the game (`art/night`): every lamp beside the roads, with its pool on the ground, the sea's
 * lights from OSM with the great lights' turning beams, and other players' head and tail lamps, all as glows in one draw
 * and pools in another. Every glow is in the lamp of a model drawn there: a roadside lamp's glass, a sea mark's lamp. A
 * light with no model to shine from isn't drawn. None of it lights anything else. By day, before the first lamp
 * strikes, none of it is drawn at all.
 */

/** More lamps than the tiles with detail round Mariehamn hold together. */
const LAMPS_MOST = 12000;
/** How far the camera moves before the pools' list is written again, and how far past their reach it holds them. */
const POOLS_MARGIN_M = 100;
/** A lamp and a car out of sight, so no list is empty while the pipelines are built before the drive. */
const NOWHERE_LAMP: LampSpot = { kind: "road", x: 0, y: -10000, z: 0 };
const NOWHERE_CAR: CarAtNight = { x: 0, y: -10000, z: 0, forwardX: 0, forwardZ: -1, braking: false };
const CARS_MOST = 64;

export interface NightLights {
  /** The roadside's lamps, whenever they change. */
  setLamps: (spots: readonly LampSpot[]) => void;
  /** Other players' cars this frame. */
  setCars: (cars: readonly CarAtNight[]) => void;
  /** Each frame: draws the lights only once lamps are coming on, and keeps the pools to those near the camera. */
  update: (camera: { x: number; z: number }) => void;
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

export function createNightLights(scene: Scene, night: Night, { onAland, groundAt, ground }: { onAland: boolean; groundAt: GroundAt; ground: Ground }): NightLights {
  const seaLights = onAland ? LIGHTS_ON_MARKS : [];
  const lampY = lampOnMark(ground.height);
  const sea = seaLightGlows(seaLights, lampY);
  const fixed = sea.glows;
  const glows = createGlows(night, fixed, sea.rhythms, fixed.length + LAMPS_MOST);
  const pools = createLampPools(night, LAMPS_MOST, groundAt);
  const beams = onAland ? createSeaBeams(night, seaLights, lampY) : null;
  // A sea mark ashore stands on the ground as the world has it, which sharpens as tiles land, so its light follows.
  let groundRevision = ground.revision();
  const standSeaLights = () => {
    groundRevision = ground.revision();
    seaLightGlows(seaLights, lampY).glows.forEach((glow, at) => {
      glows.set(at, glow);
    });
    glows.upload(glowCount);
    beams?.stand(lampY);
  };
  const cars = createCarGlows(night, CARS_MOST);
  const meshes = [glows.mesh, pools.mesh, cars.mesh, ...(beams ? [beams.mesh] : [])];
  scene.add(...meshes);
  let compiling = false;
  let hidden = false;
  // Every lamp has its glow, but a pool is only seen near, so the pools' list holds only the lamps within their reach.
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
  const refillPools = (camera: { x: number; z: number }) => {
    poolsAround = { x: camera.x, z: camera.z };
    pools.set(lamps.filter(({ x, z }) => Math.hypot(x - camera.x, z - camera.z) < POOL_REACH_M + POOLS_MARGIN_M));
  };
  const show = () => {
    const lit = compiling || (!hidden && night.amount.value > LAMPS_ON_FROM);
    for (const mesh of meshes) mesh.visible = lit;
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
    update(camera) {
      if (ground.revision() !== groundRevision) standSeaLights();
      show();
      if (poolsAround === null || Math.hypot(camera.x - poolsAround.x, camera.z - poolsAround.z) > POOLS_MARGIN_M) refillPools(camera);
    },
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
      show();
    },
    dispose() {
      for (const mesh of meshes) scene.remove(mesh);
      glows.dispose();
      pools.dispose();
      beams?.dispose();
      cars.dispose();
    },
  };
}

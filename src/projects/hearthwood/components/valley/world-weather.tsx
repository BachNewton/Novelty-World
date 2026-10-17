"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { emptySample } from "../../engine/land";
import { liveFeatures } from "../../features";
import { REGIONS } from "../../engine/regions";
import { holdWeather, makeLightning, makeWeather, type WeatherAt, type WeatherKind } from "../../engine/weather";
import type { World } from "../../engine/world";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { Air } from "../../art/daylight";
import { REGION_AIR } from "../../art/palette";
import { Rain } from "../../art/weather/rain";
import { Snow } from "../../art/weather/snow";
import { calmWeather, type WeatherNow } from "../../art/weather/now";
import type { ValleyClock } from "./clock";
import { useFeature } from "./feature-renderer";

/*
 * The weather in the scene: worked out once a frame from the engine where
 * the camera stands (see `engine/weather.ts`), with the air's thickness for
 * the plain haze, the valley floor the mist pools on, the lightning's flash,
 * and the falling rain and snow, each mounted only while its feature is on.
 */

/** After the clocks move on, before the light reads the air. */
export const WEATHER_PRIORITY = -5;

/** How far the camera moves before the valley floor round it is looked for again, in metres. */
const FLOOR_STEP = 40;
/** Where round the camera the valley floor is looked for: rings of this many metres. */
const FLOOR_RINGS = [0, 250, 600, 1100] as const;

/** The scene's weather: what the art reads, and holding it at one kind for a look. */
export interface SceneWeather extends WeatherNow {
  hold: (kind: WeatherKind | null) => void;
}

export function makeSceneWeather(held: WeatherKind | null): SceneWeather {
  const now: SceneWeather = {
    ...calmWeather(),
    held,
    hold: (kind) => {
      now.held = kind;
    },
  };
  return now;
}

/** The lowest ground or water in rings round a point: the floor of the valley it stands in. */
function valleyFloor(world: World, x: number, z: number): number {
  const sample = emptySample();
  let lowest = Infinity;
  for (const ring of FLOOR_RINGS) {
    const count = ring === 0 ? 1 : 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const land = world.landAt(x + Math.cos(angle) * ring, z + Math.sin(angle) * ring, sample, 60);
      lowest = Math.min(lowest, Math.max(land.height, land.water));
    }
  }
  return lowest;
}

/** Works the weather out where the camera is, and thickens or clears the plain haze with it. */
class WeatherWatch {
  private readonly sky: WeatherAt;
  private readonly lightning: (seconds: number, storm: number) => number;
  private readonly floor = { x: Infinity, z: Infinity, target: 0, ready: false };

  constructor(
    private readonly world: World,
    private readonly now: SceneWeather,
    private readonly air: Air,
  ) {
    this.sky = makeWeather(world.seed);
    this.lightning = makeLightning(world.seed);
  }

  tick(clock: ValleyClock, x: number, y: number, z: number, delta: number): void {
    const { world, now, floor } = this;
    world.regionAt(x, z, undefined, now.regions);
    const drifting = this.sky.at(clock.time, now.regions, y);
    now.weather = now.held === null ? drifting : holdWeather(now.held, drifting);
    // Without the lightning feature there is no flash at all, for the rain or anything else.
    now.flash = liveFeatures().isOn("lightning") ? this.lightning(clock.motion, now.weather.storm) : 0;
    this.air.thickness = now.weather.haze * REGIONS.reduce((sum, region, i) => sum + now.regions[i] * REGION_AIR[region], 0);
    if (Math.hypot(x - floor.x, z - floor.z) > FLOOR_STEP) {
      floor.x = x;
      floor.z = z;
      floor.target = valleyFloor(world, x, z);
      if (!floor.ready) now.floor = floor.target;
      floor.ready = true;
    }
    // The mist's floor settles gently as the camera crosses from one valley to the next.
    now.floor += (floor.target - now.floor) * Math.min(1, delta * 0.8);
  }
}

/** Works the weather out where the camera is, each frame. */
export function WeatherTicker({ world, clock, now, air }: { world: World; clock: ValleyClock; now: SceneWeather; air: Air }) {
  const watch = useMemo(() => new WeatherWatch(world, now, air), [world, now, air]);
  useFrame(({ camera }, delta) => {
    watch.tick(clock, camera.position.x, camera.position.y, camera.position.z, delta);
  }, WEATHER_PRIORITY);
  return null;
}

/** The weather's own objects: rain and snow round the camera, each only while its feature is on. */
export function WorldWeather({ now, atmosphere }: { now: WeatherNow; atmosphere: AtmosphereUniforms }) {
  const rain = useFeature("rain");
  const snow = useFeature("snow");
  return (
    <>
      {rain && <Rain now={now} atmosphere={atmosphere} />}
      {snow && <Snow now={now} atmosphere={atmosphere} />}
    </>
  );
}

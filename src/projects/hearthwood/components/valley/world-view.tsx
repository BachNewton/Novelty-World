"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useWalkInput } from "../../input/use-walk-input";
import { REGIONS } from "../../engine/regions";
import { emptySample } from "../../engine/land";
import { createWorld, type World } from "../../engine/world";
import { parseWeather, type WeatherKind } from "../../engine/weather";
import { makeAtmosphere } from "../../art/atmosphere";
import { Campfire } from "../../art/campfire";
import { Daylight, type Air, type Focus } from "../../art/light/daylight";
import { Fireflies } from "../../art/fireflies";
import { readForagePalette } from "../../art/forage-shapes";
import { readPalette } from "../../art/palette";
import { FrameCosts } from "../../art/passes";
import { makeSkyUniforms, Sky } from "../../art/sky/sky";
import { absorptionOf } from "../../art/water/absorption";
import { setWaterAtEye } from "../../art/water/underwater";
import { QUALITY } from "../../quality";
import { parseDate } from "../../engine/calendar";
import { advanceClock, makeClock, type ValleyClock } from "./clock";
import { DebugPanel } from "./debug-panel";
import { FeatureRenderer, useFeature } from "./feature-renderer";
import { useFrameStats } from "./frame-stats";
import { FIRST_ORBIT } from "./follow-camera";
import { ForageOverlay } from "./forage-overlay";
import { createForaging } from "./foraging";
import { CompanionOverlay } from "./companion-overlay";
import { createCompanionship } from "./companionship";
import { Interactions } from "./interactions";
import { WorldAnimals } from "./world-animals";
import { WalkerAndCamera, type Walker } from "./walker";
import { TouchStickView, WalkHints } from "./walk-hints";
import { WorldForage } from "./world-forage";
import { WorldLand, type Streaming } from "./world-land";
import { WorldPlaces } from "./world-places";
import { WorldPlants } from "./world-plants";
import { WorldProbeHandle, type FreeCamera } from "./world-probe";
import { makeSceneWeather, WeatherTicker, WorldWeather } from "./world-weather";

/*
 * The endless world: generated from its seed as the camera goes, drawn, lit
 * by the turning day, and walked in first or third person from camp. `?seed=<text>`
 * opens another world, `?hour=<0-24>` holds the day at an hour, `?date=`
 * starts on a date (`summer-2`, a festival such as `litha`, or a day number), and
 * `?weather=` holds the weather at one kind (`clear`, `mist`, `rain`…; dev
 * switches for judging the light and the far land), ~ opens the debug panel with
 * the time on a slider, and the probe on window drives it for screenshots.
 */

export const DEFAULT_SEED = "first-valley";

/** Runs first in every frame: the clocks move on. */
const CLOCK_PRIORITY = -6;

interface Options {
  seed: string;
  hour: number | null;
  /** The whole game day to start on, or null for a new game's. */
  date: number | null;
  /** The weather held for a look, or null for the sky's own. */
  weather: WeatherKind | null;
}

function readOptions(search: string): Options {
  const params = new URLSearchParams(search);
  const hour = params.get("hour");
  const parsed = hour === null ? null : Number(hour);
  if (parsed !== null && !(parsed >= 0 && parsed <= 24)) throw new Error(`?hour must be between 0 and 24, not ${hour ?? ""}`);
  const date = params.get("date");
  return { seed: params.get("seed") ?? DEFAULT_SEED, hour: parsed, date: date === null ? null : parseDate(date), weather: parseWeather(params.get("weather")) };
}

const PROMPT_COLOURS = {
  "--prompt-body": "var(--color-hearthwood-valley-ui-shade)",
  "--prompt-ink": "var(--color-hearthwood-valley-ui-ink)",
} as CSSProperties;

/** The clock moves on, and the water learns whether the camera is under it. */
function Ticker({ clock, world }: { clock: ValleyClock; world: World }) {
  const weights = useMemo(() => new Float32Array(REGIONS.length), []);
  const land = useMemo(() => emptySample(), []);
  const underwater = useFeature("underwaterFog");
  useFrame(({ camera }, delta) => {
    advanceClock(clock, Math.min(delta, 0.1));
    if (underwater) {
      const { x, z } = camera.position;
      world.sampleAt(x, z, land);
      world.regionAt(x, z, land, weights);
      setWaterAtEye(land.water > land.height ? land.water : null, absorptionOf(weights));
    }
  }, CLOCK_PRIORITY);
  return null;
}

export function WorldView() {
  const options = useMemo(() => readOptions(window.location.search), []);
  const world = useMemo(() => createWorld(options.seed), [options.seed]);
  const palette = useMemo(() => readPalette(), []);
  const foragePalette = useMemo(() => readForagePalette(), []);
  const foraging = useMemo(() => createForaging(world), [world]);
  const companionship = useMemo(() => createCompanionship(world, foraging), [world, foraging]);
  const shared = useMemo(() => {
    const { camp } = world;
    const walker: Walker = {
      x: camp.x + 3.4,
      z: camp.z + 1.5,
      heading: Math.atan2(-3.4, -1.5),
      stride: 0,
      orbit: { ...FIRST_ORBIT, yaw: Math.atan2(-3.4, -1.5) },
      lookPitch: 0,
      view: "walk",
    };
    const focus: Focus = { x: walker.x, y: camp.y, z: walker.z };
    const streaming: Streaming = { land: false, plants: false, places: false };
    const air: Air = { thickness: 1 };
    const freeCamera: { at: FreeCamera | null } = { at: null };
    const weather = makeSceneWeather(options.weather);
    const clock = makeClock(options.hour, options.date);
    return { atmosphere: makeAtmosphere(), sky: makeSkyUniforms(palette), clock, walker, focus, streaming, air, freeCamera, weather, debug: { clock, costs: new FrameCosts(), weather } };
  }, [world, palette, options.hour, options.date, options.weather]);
  const surface = useRef<HTMLDivElement>(null);
  const input = useWalkInput(surface);
  const [fireflies, setFireflies] = useState<Float32Array>(() => new Float32Array(0));
  useFrameStats();
  const { atmosphere, sky, clock, walker, focus, streaming, air, freeCamera, weather, debug } = shared;

  return (
    <div ref={surface} data-testid="hearthwood-world" className="relative h-dvh w-full touch-none overflow-hidden select-none" style={PROMPT_COLOURS}>
      <Canvas
        dpr={[1, QUALITY.maxPixelRatio]}
        // A reversed depth buffer keeps depth precise from a hand's breadth to the horizon a hundred kilometres off.
        gl={{ antialias: true, powerPreference: "high-performance", reversedDepthBuffer: true }}
        camera={{ fov: 55, near: 0.2, far: QUALITY.viewDistance * 1.2 }}
      >
        <Ticker clock={clock} world={world} />
        <WeatherTicker world={world} clock={clock} now={weather} air={air} />
        <Daylight day={clock} palette={palette} atmosphere={atmosphere} sky={sky} focus={focus} air={air} />
        <Sky atmosphere={atmosphere} sky={sky} />
        <FeatureRenderer day={clock} atmosphere={atmosphere} sky={sky} costs={debug.costs} player={focus} weather={weather} />
        <WorldWeather now={weather} atmosphere={atmosphere} />
        <WorldLand world={world} palette={palette} atmosphere={atmosphere} sky={sky} quality={QUALITY} streaming={streaming} />
        <WorldPlants world={world} palette={palette} atmosphere={atmosphere} quality={QUALITY} streaming={streaming} onFireflies={setFireflies} />
        <WorldPlaces world={world} palette={palette} atmosphere={atmosphere} sky={sky} streaming={streaming} />
        <WorldForage foraging={foraging} palette={foragePalette} atmosphere={atmosphere} clock={clock} walker={walker} input={input.state} rival={() => companionship.candidate?.score ?? Infinity} />
        <WorldAnimals companionship={companionship} world={world} clock={clock} walker={walker} input={input.state} foraging={foraging} atmosphere={atmosphere} />
        <Campfire at={world.camp} seed={world.seed} palette={palette} atmosphere={atmosphere} fire={clock} />
        <Fireflies spots={fireflies} palette={palette} atmosphere={atmosphere} sky={sky} />
        <WalkerAndCamera world={world} input={input.state} walker={walker} focus={focus} palette={palette} atmosphere={atmosphere} />
        <WorldProbeHandle world={world} palette={palette} clock={clock} walker={walker} streaming={streaming} freeCamera={freeCamera} weather={weather} foraging={foraging} companionship={companionship} costs={debug.costs} setPointOfView={input.setPointOfView} />
      </Canvas>
      <WalkHints input={input} />
      <ForageOverlay foraging={foraging} clock={clock} input={input.kind} />
      <CompanionOverlay companionship={companionship} input={input.kind} />
      <Interactions foraging={foraging} companionship={companionship} clock={clock} surface={surface} />
      <TouchStickView stick={input.stick} />
      <DebugPanel context={debug} />
    </div>
  );
}

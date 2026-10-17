"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { NeutralToneMapping } from "three";
import { useWalkInput } from "../../input/use-walk-input";
import { REGIONS } from "../../engine/regions";
import { createWorld, type World } from "../../engine/world";
import { makeAtmosphere } from "../../art/atmosphere";
import { Campfire } from "../../art/campfire";
import { Daylight, type Air, type Focus } from "../../art/daylight";
import { Fireflies } from "../../art/fireflies";
import { readForagePalette } from "../../art/forage-shapes";
import { readPalette, REGION_AIR } from "../../art/palette";
import { FrameCosts } from "../../art/passes";
import { makeSkyUniforms, Sky } from "../../art/sky";
import { QUALITY } from "../../quality";
import { parseDate } from "../../engine/calendar";
import { advanceClock, makeClock, type ValleyClock } from "./clock";
import { DebugPanel } from "./debug-panel";
import { FeatureRenderer } from "./feature-renderer";
import { useFrameStats } from "./frame-stats";
import { FIRST_ORBIT } from "./follow-camera";
import { ForageOverlay } from "./forage-overlay";
import { createForaging } from "./foraging";
import { WalkerAndCamera, type Walker } from "./walker";
import { TouchStickView, WalkHints } from "./walk-hints";
import { WorldForage } from "./world-forage";
import { WorldLand, type Streaming } from "./world-land";
import { WorldPlaces } from "./world-places";
import { WorldPlants } from "./world-plants";
import { WorldProbeHandle, type FreeCamera } from "./world-probe";

/*
 * The endless world: generated from its seed as the camera goes, drawn, lit
 * by the turning day, and walked in first or third person from camp. `?seed=<text>`
 * opens another world, `?hour=<0-24>` holds the day at an hour, `?date=`
 * starts on a date (`summer-2`, a festival such as `litha`, or a day number), and
 * `?haze=<n>` scales the haze (0 is a perfectly clear day; dev switches for
 * judging the light and the far land), ~ opens the debug panel with the time on a
 * slider, and the probe on window drives it for screenshots.
 */

export const DEFAULT_SEED = "first-valley";

/** Runs first in every frame: the clocks move on. */
const CLOCK_PRIORITY = -6;

interface Options {
  seed: string;
  hour: number | null;
  /** The whole game day to start on, or null for a new game's. */
  date: number | null;
  /** How thick the haze is against the usual, until the weather sets it. */
  haze: number;
}

function readOptions(search: string): Options {
  const params = new URLSearchParams(search);
  const hour = params.get("hour");
  const parsed = hour === null ? null : Number(hour);
  if (parsed !== null && !(parsed >= 0 && parsed <= 24)) throw new Error(`?hour must be between 0 and 24, not ${hour ?? ""}`);
  const haze = Number(params.get("haze") ?? 1);
  if (!(haze >= 0)) throw new Error(`?haze must be 0 or more, not ${params.get("haze") ?? ""}`);
  const date = params.get("date");
  return { seed: params.get("seed") ?? DEFAULT_SEED, hour: parsed, date: date === null ? null : parseDate(date), haze };
}

const PROMPT_COLOURS = {
  "--prompt-body": "var(--color-hearthwood-valley-ui-shade)",
  "--prompt-ink": "var(--color-hearthwood-valley-ui-ink)",
} as CSSProperties;

/** The weather, which will one day come and go; for now only how hazy the day is, against the usual. */
export interface Weather {
  haze: number;
}

/** How thick the air is at a point: the weather's haze, thickened or cleared by the regions there. */
function breathe(air: Air, weather: Weather, world: World, x: number, z: number, weights: Float32Array): void {
  world.regionAt(x, z, undefined, weights);
  air.thickness = weather.haze * REGIONS.reduce((sum, region, i) => sum + weights[i] * REGION_AIR[region], 0);
}

/** The clock moves on, and the air thickens or clears with the weather and the region the camera is in. */
function Ticker({ clock, world, air, weather }: { clock: ValleyClock; world: World; air: Air; weather: Weather }) {
  const weights = useMemo(() => new Float32Array(REGIONS.length), []);
  useFrame(({ camera }, delta) => {
    advanceClock(clock, Math.min(delta, 0.1));
    breathe(air, weather, world, camera.position.x, camera.position.z, weights);
  }, CLOCK_PRIORITY);
  return null;
}

export function WorldView() {
  const options = useMemo(() => readOptions(window.location.search), []);
  const world = useMemo(() => createWorld(options.seed), [options.seed]);
  const palette = useMemo(() => readPalette(), []);
  const foragePalette = useMemo(() => readForagePalette(), []);
  const foraging = useMemo(() => createForaging(world), [world]);
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
    const weather: Weather = { haze: options.haze };
    const clock = makeClock(options.hour, options.date);
    return { atmosphere: makeAtmosphere(), sky: makeSkyUniforms(palette), clock, walker, focus, streaming, air, freeCamera, weather, debug: { clock, costs: new FrameCosts() } };
  }, [world, palette, options.hour, options.date, options.haze]);
  const surface = useRef<HTMLDivElement>(null);
  const input = useWalkInput(surface);
  const [fireflies, setFireflies] = useState<Float32Array>(() => new Float32Array(0));
  useFrameStats();
  const { atmosphere, sky, clock, walker, focus, streaming, air, freeCamera, weather, debug } = shared;

  return (
    <div ref={surface} data-testid="hearthwood-world" className="relative h-dvh w-full touch-none overflow-hidden select-none" style={PROMPT_COLOURS}>
      <Canvas
        dpr={[1, QUALITY.maxPixelRatio]}
        shadows="percentage"
        // A reversed depth buffer keeps depth precise from a hand's breadth to the horizon a hundred kilometres off.
        gl={{ antialias: true, powerPreference: "high-performance", reversedDepthBuffer: true }}
        camera={{ fov: 55, near: 0.2, far: QUALITY.viewDistance * 1.2 }}
        onCreated={({ gl }) => {
          gl.toneMapping = NeutralToneMapping;
        }}
      >
        <Ticker clock={clock} world={world} air={air} weather={weather} />
        <Daylight day={clock} palette={palette} atmosphere={atmosphere} sky={sky} focus={focus} air={air} shadows={{ map: QUALITY.shadowMap, reach: QUALITY.shadowReach }} />
        <Sky atmosphere={atmosphere} sky={sky} />
        <FeatureRenderer day={clock} atmosphere={atmosphere} sky={sky} costs={debug.costs} />
        <WorldLand world={world} palette={palette} atmosphere={atmosphere} sky={sky} quality={QUALITY} streaming={streaming} />
        <WorldPlants world={world} palette={palette} atmosphere={atmosphere} quality={QUALITY} streaming={streaming} onFireflies={setFireflies} />
        <WorldPlaces world={world} palette={palette} atmosphere={atmosphere} sky={sky} streaming={streaming} />
        <WorldForage foraging={foraging} palette={foragePalette} atmosphere={atmosphere} clock={clock} walker={walker} input={input.state} />
        <Campfire at={world.camp} seed={world.seed} palette={palette} atmosphere={atmosphere} fire={clock} />
        <Fireflies spots={fireflies} palette={palette} atmosphere={atmosphere} sky={sky} />
        <WalkerAndCamera world={world} input={input.state} walker={walker} focus={focus} palette={palette} atmosphere={atmosphere} />
        <WorldProbeHandle world={world} palette={palette} clock={clock} walker={walker} streaming={streaming} freeCamera={freeCamera} weather={weather} foraging={foraging} costs={debug.costs} setPointOfView={input.setPointOfView} />
      </Canvas>
      <WalkHints input={input} />
      <ForageOverlay foraging={foraging} clock={clock} surface={surface} input={input.kind} />
      <TouchStickView stick={input.stick} />
      <DebugPanel context={debug} />
    </div>
  );
}

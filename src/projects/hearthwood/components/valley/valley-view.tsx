"use client";

import { useMemo, useRef, type CSSProperties } from "react";
import { Canvas } from "@react-three/fiber";
import { Color, NeutralToneMapping } from "three";
import { useWalkInput } from "../../input/use-walk-input";
import { generateValley } from "../../world/valley";
import { makeAtmosphere } from "./atmosphere";
import { Campfire } from "./campfire";
import { makeClock } from "./clock";
import { DebugPanel } from "./debug-panel";
import { Daylight, type Focus } from "./daylight";
import { Fireflies } from "./fireflies";
import { useFrameStats } from "./frame-stats";
import { FIRST_ORBIT } from "./follow-camera";
import { readPalette } from "./palette";
import { Places } from "./places";
import { Plants } from "./plants";
import { makeSkyUniforms, Sky, type RidgeColours } from "./sky";
import { Terrain } from "./terrain";
import { ValleyProbeHandle } from "./valley-probe";
import { WalkerAndCamera, type Walker } from "./walker";
import { TouchStickView, WalkHints } from "./walk-hints";
import { Water } from "./water";

/*
 * The valley: generated from its seed, drawn, lit by the turning day, and
 * walked in third person. `?seed=<text>` opens another valley and
 * `?hour=<0-24>` holds the day at an hour (a dev switch for judging the
 * light), ~ opens the debug panel with the time on a slider, and the
 * probe on window drives it for screenshots.
 */

export const DEFAULT_SEED = "first-valley";

/** The sharpest the valley draws, in device pixels per CSS pixel: past this a phone's GPU pays in fill for detail no one sees. */
const MAX_PIXEL_RATIO = 1.5;

interface Options {
  seed: string;
  hour: number | null;
}

function readOptions(search: string): Options {
  const params = new URLSearchParams(search);
  const hour = params.get("hour");
  const parsed = hour === null ? null : Number(hour);
  if (parsed !== null && !(parsed >= 0 && parsed <= 24)) throw new Error(`?hour must be between 0 and 24, not ${hour ?? ""}`);
  return { seed: params.get("seed") ?? DEFAULT_SEED, hour: parsed };
}

const PROMPT_COLOURS = {
  "--prompt-body": "var(--color-hearthwood-valley-ui-shade)",
  "--prompt-ink": "var(--color-hearthwood-valley-ui-ink)",
} as CSSProperties;

export function ValleyView() {
  const options = useMemo(() => readOptions(window.location.search), []);
  const valley = useMemo(() => generateValley(options.seed), [options.seed]);
  const palette = useMemo(() => readPalette(), []);
  const shared = useMemo(() => {
    const { camp } = valley;
    const walker: Walker = {
      x: camp.x + 3.4,
      z: camp.z + 1.5,
      heading: Math.atan2(-3.4, -1.5),
      stride: 0,
      orbit: { ...FIRST_ORBIT, yaw: Math.atan2(-3.4, -1.5) },
      view: "walk",
    };
    const focus: Focus = { x: walker.x, y: camp.y, z: walker.z };
    const ridges: RidgeColours = { near: new Color(), far: new Color() };
    return { atmosphere: makeAtmosphere(), sky: makeSkyUniforms(), clock: makeClock(options.hour), walker, focus, ridges };
  }, [valley, options.hour]);
  const surface = useRef<HTMLDivElement>(null);
  const input = useWalkInput(surface);
  useFrameStats();
  const { atmosphere, sky, clock, walker, focus, ridges } = shared;

  return (
    <div ref={surface} data-testid="hearthwood-valley" className="relative h-dvh w-full touch-none overflow-hidden select-none" style={PROMPT_COLOURS}>
      <Canvas
        dpr={[1, MAX_PIXEL_RATIO]}
        shadows="percentage"
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 55, near: 0.2, far: 1800 }}
        onCreated={({ gl }) => {
          gl.toneMapping = NeutralToneMapping;
        }}
      >
        <Daylight clock={clock} palette={palette} atmosphere={atmosphere} sky={sky} ridges={ridges} focus={focus} />
        <Sky seed={valley.seed} atmosphere={atmosphere} sky={sky} ridges={ridges} />
        <Terrain valley={valley} palette={palette} atmosphere={atmosphere} />
        <Water valley={valley} palette={palette} atmosphere={atmosphere} sky={sky} />
        <Plants valley={valley} palette={palette} atmosphere={atmosphere} />
        <Places valley={valley} palette={palette} atmosphere={atmosphere} />
        <Campfire valley={valley} palette={palette} atmosphere={atmosphere} clock={clock} />
        <Fireflies valley={valley} palette={palette} atmosphere={atmosphere} sky={sky} />
        <WalkerAndCamera valley={valley} input={input.state} walker={walker} focus={focus} palette={palette} atmosphere={atmosphere} />
        <ValleyProbeHandle valley={valley} clock={clock} walker={walker} />
      </Canvas>
      <WalkHints kind={input.kind} show={!input.walkedWith.has(input.kind)} />
      <TouchStickView stick={input.stick} />
      <DebugPanel clock={clock} />
    </div>
  );
}

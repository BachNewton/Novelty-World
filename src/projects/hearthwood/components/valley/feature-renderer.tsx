"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { WebGPURenderer } from "three/webgpu";
import { liveFeatures, type FeatureId } from "../../features";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { DayState } from "../../art/light/daylight";
import { FEATURE_ART } from "../../art/features";
import type { FeatureFrame } from "../../art/feature-art";
import { FrameRenderer, type FrameCosts } from "../../art/frame";
import type { SkyUniforms } from "../../art/sky/sky";
import { calmWeather, type WeatherNow } from "../../art/weather/now";
import { QUALITY } from "../../quality";

/*
 * The scene's render loop, in one component: it takes the frame over from
 * react-three-fiber (any frame callback above priority 0 does) and draws it
 * through the frame's pipeline (`art/frame.ts`). Everything else that runs
 * per frame runs before it; whatever reads what was drawn runs after it, at
 * AFTER_RENDER_PRIORITY.
 */

export const RENDER_PRIORITY = 1;
export const AFTER_RENDER_PRIORITY = 2;

/** Where no weather is worked out (the art gallery), the features draw a still, fair day. */
const CALM = calmWeather();

/** The canvas's renderer: every Hearthwood canvas is a `GpuCanvas`, whose renderer is three's WebGPU one. */
export function useRenderer(): WebGPURenderer {
  return useThree((s) => s.gl) as unknown as WebGPURenderer;
}

export function FeatureRenderer({
  day,
  atmosphere,
  sky,
  costs,
  player = null,
  weather = CALM,
}: {
  day: DayState;
  atmosphere: AtmosphereUniforms;
  sky: SkyUniforms;
  costs: FrameCosts;
  /** Where Elliott stands, read every frame. */
  player?: FeatureFrame["player"];
  weather?: WeatherNow;
}) {
  const renderer = useRenderer();
  const frameRenderer = useMemo(() => new FrameRenderer(renderer, liveFeatures(), FEATURE_ART, { samples: QUALITY.samples }), [renderer]);
  useEffect(() => () => frameRenderer.dispose(), [frameRenderer]);
  useFrame(({ scene, camera }, delta) => {
    frameRenderer.render({ renderer, scene, camera, day, atmosphere, sky, weather, delta, player }, costs);
  }, RENDER_PRIORITY);
  return null;
}

/** Whether a feature is on, as React state: a feature that adds objects of its own mounts them only while it is. */
export function useFeature(id: FeatureId): boolean {
  const switches = liveFeatures();
  return useSyncExternalStore(
    (listener) => switches.subscribe(listener),
    () => switches.isOn(id),
    () => switches.isOn(id),
  );
}

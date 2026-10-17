"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { GpuTimer } from "@/shared/lib/three/gpu-timer";
import { liveFeatures, type FeatureId } from "../../features";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { DayState } from "../../art/light/daylight";
import { FEATURE_ART } from "../../art/features";
import { FrameRenderer, type FrameCosts } from "../../art/passes";
import type { SkyUniforms } from "../../art/sky/sky";

/*
 * The scene's render loop, in one component: it takes the frame over from
 * react-three-fiber (any frame callback above priority 0 does) and draws it
 * through the features' passes (`art/passes.ts`). Everything else that runs
 * per frame runs before it; whatever reads what was drawn runs after it, at
 * AFTER_RENDER_PRIORITY.
 */

export const RENDER_PRIORITY = 1;
export const AFTER_RENDER_PRIORITY = 2;

export function FeatureRenderer({ day, atmosphere, sky, costs }: { day: DayState; atmosphere: AtmosphereUniforms; sky: SkyUniforms; costs: FrameCosts }) {
  const gl = useThree((s) => s.gl);
  const renderer = useMemo(() => new FrameRenderer(gl, liveFeatures(), FEATURE_ART, new GpuTimer(gl)), [gl]);
  useEffect(() => () => renderer.dispose(), [renderer]);
  useFrame(({ scene, camera }, delta) => {
    renderer.render({ gl, scene, camera, day, atmosphere, sky, delta }, costs);
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

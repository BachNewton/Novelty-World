"use client";

import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { setupOceanScene } from "../scene";

/** Root of the Shipwright project: a full-bleed 3D ocean you can look around.
 *  Everything else — islands, voxel ships, multiplayer — builds on top of this. */
export function Shipwright() {
  const containerRef = useThreeScene(setupOceanScene, {
    stats: true,
    // Per-pass GPU timing (capture / ssr / main) so the SSR res·steps·refine knobs can
    // be dialled by watching real GPU cost, not CPU-side fps — see docs/PERFORMANCE.md.
    gpuStats: true,
    // Full-res scene capture. Half-res was measured to save little compute (the SSR
    // march runs per output pixel in its own low-res pass regardless — see
    // docs/PERFORMANCE.md); full res sharpens refraction/depth and avoids silhouette
    // edge-bleed, for only a VRAM/bandwidth cost.
    sceneCapture: { resolutionScale: 1 },
    // HDR bloom, off at mount. `scene.ts` can switch it live (Environment -> Display) and the
    // tonemap x bloom experiment drives it over the debug API. Strength/radius are the values that
    // survived that experiment; the exposure-tracking threshold + energy clamp live in `scene.ts`.
    bloom: { strength: 0.35, radius: 0.55 },
    // MSAA on: even though the device-ratio render scale supersamples, MSAA still
    // visibly cleans up geometry edges (the horizon, object silhouettes) that
    // supersampling alone leaves faintly aliased. It only samples coverage/depth, not
    // the fragment shader, so it doesn't touch the SSR/water bottleneck — the cost is
    // framebuffer bandwidth + a per-frame resolve (watch it on weak/iGPU targets).
    antialias: true,
  });

  return <div ref={containerRef} className="h-[100dvh] w-full overflow-hidden" />;
}

"use client";

import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { setupOceanScene } from "../scene";

/** Root of the Shipwright project: a full-bleed 3D ocean you can look around.
 *  Everything else — islands, voxel ships, multiplayer — builds on top of this. */
export function Shipwright() {
  const containerRef = useThreeScene(setupOceanScene, {
    stats: true,
    // Full-res scene capture. Half-res was measured to save little compute (the SSR
    // march runs per output pixel in its own low-res pass regardless — see
    // docs/PERFORMANCE.md); full res sharpens refraction/depth and avoids silhouette
    // edge-bleed, for only a VRAM/bandwidth cost.
    sceneCapture: { resolutionScale: 1 },
    // The device-ratio render scale supersamples, so MSAA is redundant here — skip
    // it to save framebuffer bandwidth (helps weak/iGPU targets).
    antialias: false,
  });

  return <div ref={containerRef} className="h-[100dvh] w-full overflow-hidden" />;
}

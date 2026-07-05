"use client";

import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { setupOceanScene } from "../scene";

/** Root of the Shipwright project: a full-bleed 3D ocean you can look around.
 *  Everything else — islands, voxel ships, multiplayer — builds on top of this. */
export function Shipwright() {
  const containerRef = useThreeScene(setupOceanScene, {
    stats: true,
    // Half-res scene capture: reflection/refraction through moving water hide the
    // softening, and it saves bandwidth + VRAM (helps weak/iGPU targets).
    sceneCapture: { resolutionScale: 0.5 },
    // The device-ratio render scale supersamples, so MSAA is redundant here — skip
    // it to save framebuffer bandwidth (helps weak/iGPU targets).
    antialias: false,
  });

  return <div ref={containerRef} className="h-[100dvh] w-full overflow-hidden" />;
}

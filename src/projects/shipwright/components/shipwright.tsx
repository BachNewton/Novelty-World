"use client";

import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { setupOceanScene } from "../scene";

/** Root of the Shipwright project: a full-bleed 3D ocean you can look around.
 *  Everything else — islands, voxel ships, multiplayer — builds on top of this. */
export function Shipwright() {
  const containerRef = useThreeScene(setupOceanScene, { stats: true });

  return <div ref={containerRef} className="h-[100dvh] w-full overflow-hidden" />;
}

"use client";

import * as THREE from "three";
import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { setupOceanScene } from "../scene";

/** Root of the Shipwright project: a full-bleed 3D ocean you can look around.
 *  Everything else — islands, voxel ships, multiplayer — builds on top of this. */
export function Shipwright() {
  const containerRef = useThreeScene(setupOceanScene, {
    // AgX, not ACES. This is the Tier-2 tone-mapping decision, settled by the 2x2 in
    // docs/LIGHTING.md and graded blind. ACES desaturates a highlight BEFORE it clips, so a
    // physically warm low sun renders neutral-silver: the sun-glitter road at 4 deg is silver-white
    // under ACES and gold under AgX -- the same pixels, the same frame, and precisely the gap
    // FIDELITY.md names. AgX costs 0.37 ms (inside the noise) and no artefacts.
    //
    // The trade, and it is real: AgX pulls whole-image saturation down a little -- a paler blue sky
    // and slightly softer primaries at the zenith. That is close to this project's own aesthetic note
    // ("at noon colours are bright but naturally less punchy"), so it is accepted rather than fought.
    toneMapping: THREE.AgXToneMapping,
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
    // strength 0.15: the ONLY value in the sweep that does not wash the sunset to milky white. It is
    // the dominant knob; knee and clamp (set live from the exposure in scene.ts) shape the glow.
    // Half-res pyramid: bloom is a blur, so it is visually free and cuts the pass's fill by ~4x.
    // OFF by default, and the measurement says why. On the target AMD 780M at 1080p:
    //     bloom + a 4x-MSAA HDR target   +3.64 ms   (of a ~9.5 ms GPU budget)
    //     bloom + a 1x-MSAA HDR target   +3.44 ms
    //     bloom, no MSAA on that target  +1.18 ms
    // So "adding bloom" costs 2.5 ms of MSAA RESOLVE on a 1080p HalfFloat target (~66 MB/frame on a
    // 512 MB UMA iGPU) and only 1.2 ms of actual blur. The blur is cheap; the HDR framebuffer is not.
    // Blind review of the 2x2 called bloom a mild win at sunset and neutral at the zenith, so it does
    // not earn 3.6 ms -- but it plausibly earns 1.2. Enable it from the GUI (Environment -> Display).
    bloom: { enabled: false, strength: 0.15, radius: 0.6, resolutionScale: 0.5, samples: 4 },
    // MSAA on: even though the device-ratio render scale supersamples, MSAA still
    // visibly cleans up geometry edges (the horizon, object silhouettes) that
    // supersampling alone leaves faintly aliased. It only samples coverage/depth, not
    // the fragment shader, so it doesn't touch the SSR/water bottleneck — the cost is
    // framebuffer bandwidth + a per-frame resolve (watch it on weak/iGPU targets).
    antialias: true,
  });

  return <div ref={containerRef} className="h-[100dvh] w-full overflow-hidden" />;
}

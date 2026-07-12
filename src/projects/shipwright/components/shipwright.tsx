"use client";

import * as THREE from "three";
import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { setupOceanScene } from "../scene";

/**
 * Benchmark-only overrides for the three options below that are fixed at MOUNT and therefore cannot be
 * reached by `window.__shipwright.runBenchmark(config)`, which runs long after: MSAA (baked into the
 * WebGL context at creation), the scene-capture resolution, and the composer target's sample count.
 * The benchmark passes them as query params instead (`tools/bench.mjs --msaa off --capture-scale 0.5`).
 *
 * Absent → the shipped defaults below, so a normal visit is untouched.
 */
const benchParam = (name: string): string | null =>
  typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(name);
const benchFlag = (name: string, fallback: boolean): boolean => {
  const v = benchParam(name);
  if (v === null) return fallback;
  return !(v === "off" || v === "false" || v === "0");
};
const benchNumber = (name: string, fallback: number): number => {
  const v = benchParam(name);
  if (v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

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
    sceneCapture: { resolutionScale: benchNumber("captureScale", 1) },
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
    // NB `samples` is the MSAA count on the COMPOSER's HDR target, and the composer runs whenever bloom
    // OR the display grade is on — and the grade is on by default. So this 4× target is paid on every
    // shipped frame, bloom or no bloom. That is measured, not assumed: see docs/PERFORMANCE.md.
    bloom: {
      enabled: false,
      strength: 0.12,
      radius: 0.6,
      resolutionScale: 0.5,
      samples: benchNumber("composerSamples", 4),
    },
    // MSAA on: even though the device-ratio render scale supersamples, MSAA still
    // visibly cleans up geometry edges (the horizon, object silhouettes) that
    // supersampling alone leaves faintly aliased. It only samples coverage/depth, not
    // the fragment shader, so it doesn't touch the SSR/water bottleneck — the cost is
    // framebuffer bandwidth + a per-frame resolve (watch it on weak/iGPU targets).
    //
    // NB the hook IGNORES this while the grade (below) is on, because then the scene is drawn into the
    // composer's target and the context's MSAA would antialias nothing but the final blit. That was
    // costing 3.2 ms — 21% of the GPU frame — for no pixels at all. The scene's real geometry AA now
    // comes from the composer target's `samples`.
    antialias: benchFlag("msaa", true),
    // The post-tonemap display GRADE. Declared here, not in scene.ts, because whether a composer runs
    // decides how the WebGL context itself is created (see `antialias`) — which must be known before the
    // renderer exists. AgX intentionally holds punch off the highlights; this puts it back, uniformly, at
    // the end of the pipeline, which is where a camera/art operator belongs (never in the physics).
    grade: { enabled: true, saturation: 1.2, contrast: 1.08 },
  });

  return <div ref={containerRef} className="h-[100dvh] w-full overflow-hidden" />;
}

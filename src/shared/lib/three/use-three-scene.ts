"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GpuTimer } from "./gpu-timer";

export interface BloomOptions {
  strength?: number;
  radius?: number;
  threshold?: number;
}

export interface ThreeSceneOptions {
  /** Overlay a three.js FPS/ms stats panel in the top-left corner. */
  stats?: boolean;
  /**
   * Overlay a per-pass **GPU-time** panel (`EXT_disjoint_timer_query_webgl2`). Unlike
   * the `stats` panel — which measures CPU submit time and frame cadence — this reports
   * how long the GPU actually spent executing each pass. The hook times its own `main`
   * render; a scene brackets its extra passes via `ctx.gpuTimer.span(name, fn)`. Dev
   * affordance; degrades to an "n/a" panel where the extension is unavailable.
   */
  gpuStats?: boolean;
  /**
   * MSAA on the main framebuffer (default `true`). Smooths geometry edges but costs
   * a 4× framebuffer + a per-frame resolve. Set `false` when the scene supersamples
   * (render scale ≥ device ratio), which already antialiases everything — saves
   * bandwidth on weak/iGPU targets. Fixed at mount (WebGL context creation).
   */
  antialias?: boolean;
  /** Render through an HDR bloom pipeline. `true` uses defaults; pass an object to tune. */
  bloom?: boolean | BloomOptions;
  /**
   * Allocate a render target with a colour texture **and** a depth texture, exposed
   * on the context as `sceneCapture`. A scene renders itself into it (typically
   * hiding the surface being shaded) so a shader can read the scene behind/around a
   * surface — the shared basis for screen-space reflection, refraction, and
   * depth-based effects (soft edges, water absorption). The hook owns its lifecycle:
   * it is kept sized to the drawing buffer and disposed on unmount. Opt-in; nothing
   * is allocated unless this is set. Pass `{ resolutionScale }` (e.g. 0.5) to render
   * the capture below screen resolution — reflections/refraction through moving water
   * hide the softening, and it saves bandwidth + VRAM. Sampled by normalised screen
   * UV, so the scale is transparent to the consuming shader.
   */
  sceneCapture?: boolean | SceneCaptureOptions;
  /**
   * Cap on the device-pixel-ratio the renderer draws at (default 2). The drawing
   * buffer is `min(devicePixelRatio, maxPixelRatio)`. Lower it to trade sharpness
   * for a big fill-rate saving on weak GPUs — fragment-heavy scenes (SSR) scale
   * with pixel count. Adjustable live via `ctx.setPixelRatio`.
   */
  maxPixelRatio?: number;
  /**
   * Cap the render/update loop to this many frames per second (default 0 = uncapped,
   * i.e. render every vsync). Capping trades latency for **smoothness + cooler clocks**:
   * a rock-solid lower rate feels better than a jittery near-refresh one, and less
   * sustained GPU load keeps an APU from thermal/power-throttling (see
   * shipwright/docs/PERFORMANCE.md). **Pick a DIVISOR of the display refresh** — 50 on a
   * 100 Hz panel shows each frame for exactly two refreshes (even cadence); a non-divisor
   * like 60-on-100 causes pulldown judder. Adjustable live via `ctx.setFpsCap`.
   */
  fpsCap?: number;
}

/**
 * A colour + depth capture of the rendered scene. `target.texture` is HDR-linear
 * colour; `target.depthTexture` is the scene depth. The owning scene populates it
 * each frame (`renderer.setRenderTarget(target)` … render … `setRenderTarget(null)`);
 * the hook keeps it sized to the drawing buffer.
 */
export interface SceneCaptureOptions {
  /** Render the capture at this fraction of the drawing buffer (default 1). */
  resolutionScale?: number;
}

export interface SceneCapture {
  target: THREE.WebGLRenderTarget;
  depthTexture: THREE.DepthTexture;
}

export interface ThreeSceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  container: HTMLDivElement;
  /** Present when the `bloom` option is enabled, so a scene can add UI to tune it. */
  bloomPass?: UnrealBloomPass;
  /** Present when the `sceneCapture` option is enabled — a colour+depth scene target. */
  sceneCapture?: SceneCapture;
  /**
   * Present when `gpuStats` is enabled. Bracket a scene's own passes with
   * `gpuTimer.span(name, fn)` to break out their GPU cost alongside the hook's `main`
   * render in the panel. Spans must not overlap.
   */
  gpuTimer?: GpuTimer;
  /**
   * Set the live device-pixel-ratio (clamped to the `maxPixelRatio` option), then
   * resize the drawing buffer + capture target to match. Lets a scene expose a
   * render-scale control for weak GPUs.
   */
  setPixelRatio: (ratio: number) => void;
  /**
   * Set the live frame-rate cap (see the `fpsCap` option); 0 = uncapped. Lets a scene
   * expose an FPS-cap control for smoothness / thermal headroom.
   */
  setFpsCap: (fps: number) => void;
}

export interface ThreeSceneHandlers {
  /** Called once per animation frame. `delta` is seconds since the last frame. */
  onFrame?: (delta: number) => void;
  /** Called after the camera/renderer have been resized to the container. */
  onResize?: (width: number, height: number) => void;
  /** Called on unmount to release scene-specific GPU resources. */
  dispose?: () => void;
}

/**
 * Mounts a vanilla three.js renderer into a container `<div>` and drives its
 * whole lifecycle from React: it creates the `WebGLRenderer` + a
 * `PerspectiveCamera`, runs the animation loop, keeps the drawing buffer sized
 * to the container (via `ResizeObserver`), and disposes everything on unmount.
 * With the `bloom` option it renders through an HDR `EffectComposer` pipeline.
 *
 * The `setup` callback builds the scene from the provided context and returns
 * per-frame / resize / dispose handlers (return `{}` for a static scene).
 * Attach the returned ref to the container element.
 *
 * This is the shared bridge between React and imperative three.js — the first
 * consumer is Shipwright, but it deliberately knows nothing game-specific so
 * future 3D projects can reuse it.
 */
export function useThreeScene(
  setup: (ctx: ThreeSceneContext) => ThreeSceneHandlers,
  options: ThreeSceneOptions = {},
): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  // The scene is built once on mount from the setup passed at that time; refs
  // hold it so the mount effect can stay dependency-free without going stale.
  const setupRef = useRef(setup);
  const showStatsRef = useRef(options.stats ?? false);
  const gpuStatsRef = useRef(options.gpuStats ?? false);
  const antialiasRef = useRef(options.antialias ?? true);
  const bloomRef = useRef(options.bloom ?? false);
  const sceneCaptureRef = useRef(options.sceneCapture ?? false);
  const maxPixelRatioRef = useRef(options.maxPixelRatio ?? 2);
  const fpsCapRef = useRef(options.fpsCap ?? 0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const maxPixelRatio = maxPixelRatioRef.current;
    // MSAA (antialias) only smooths geometry edges and costs a 4× framebuffer + a
    // per-frame resolve. When a scene supersamples (render scale ≥ device ratio) that
    // already antialiases everything MSAA can't (shader shimmer), so MSAA is mostly
    // redundant there — opt out to save bandwidth on weak/iGPU targets.
    const renderer = new THREE.WebGLRenderer({ antialias: antialiasRef.current });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      1,
      20000,
    );

    // Optional HDR bloom pipeline. Rendering through an EffectComposer backed by
    // a HalfFloat + multisampled target keeps the very bright sun in HDR, so
    // bloom turns it into a glow instead of clipping to white; the final
    // OutputPass applies the renderer's tone mapping + exposure and sRGB encode.
    const bloomOption = bloomRef.current;
    let composer: EffectComposer | undefined;
    let bloomPass: UnrealBloomPass | undefined;
    if (bloomOption) {
      const settings = bloomOption === true ? {} : bloomOption;
      const size = new THREE.Vector2(container.clientWidth, container.clientHeight);
      const target = new THREE.WebGLRenderTarget(size.x, size.y, {
        type: THREE.HalfFloatType,
        samples: 4,
      });
      composer = new EffectComposer(renderer, target);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(size.x, size.y);
      bloomPass = new UnrealBloomPass(
        size,
        settings.strength ?? 0.5,
        settings.radius ?? 0.4,
        settings.threshold ?? 0.9,
      );
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
    }

    // Optional colour+depth scene capture for screen-space effects (SSR,
    // refraction, depth). Sized to the drawing buffer × resolutionScale; shaders
    // sample it by normalised screen UV, so a reduced scale is transparent (just
    // softer + cheaper). Colour is HalfFloat (HDR-linear); depth is a real
    // DepthTexture so shaders can reconstruct view-space position + compare depth.
    const captureOption = sceneCaptureRef.current;
    const captureScale =
      typeof captureOption === "object" ? (captureOption.resolutionScale ?? 1) : 1;
    let sceneCapture: SceneCapture | undefined;
    if (captureOption) {
      const db = renderer.getDrawingBufferSize(new THREE.Vector2());
      const w = Math.max(1, Math.round(db.x * captureScale));
      const h = Math.max(1, Math.round(db.y * captureScale));
      const depthTexture = new THREE.DepthTexture(w, h);
      const target = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        depthTexture,
      });
      sceneCapture = { target, depthTexture };
    }

    // `resize` is defined below (it closes over `handlers`), so route setPixelRatio
    // through a holder that's filled in once resize exists.
    let applyResize = () => {};
    const setPixelRatio = (ratio: number) => {
      renderer.setPixelRatio(Math.min(ratio, maxPixelRatio));
      applyResize();
    };

    // Frame-rate cap (0 = uncapped). The animation loop still fires every vsync, but we
    // skip the render/update work until a capped frame's worth of time has elapsed.
    let fpsCap = fpsCapRef.current;
    const setFpsCap = (fps: number) => {
      fpsCap = Math.max(0, fps);
    };

    // Built before setup so a scene can grab it from the context and add its own spans.
    const gpuTimer = gpuStatsRef.current ? new GpuTimer(renderer) : undefined;

    const handlers = setupRef.current({
      scene,
      camera,
      renderer,
      container,
      bloomPass,
      sceneCapture,
      gpuTimer,
      setPixelRatio,
      setFpsCap,
    });

    const stats = showStatsRef.current ? new Stats() : undefined;
    if (stats) {
      stats.showPanel(0);
      container.appendChild(stats.dom);
    }
    if (gpuTimer) container.appendChild(gpuTimer.dom);

    const timer = new THREE.Timer();
    // Uses the Page Visibility API to avoid a huge delta when the tab regains focus.
    timer.connect(document);
    const renderMain = (d: number) => {
      if (composer) composer.render(d);
      else renderer.render(scene, camera);
    };
    let lastFrameMs = 0;
    renderer.setAnimationLoop((timeMs) => {
      // Frame-rate cap: skip this vsync until a capped frame's budget has elapsed. The 0.9
      // tolerance locks cleanly onto a refresh divisor — with the budget at exactly 1/cap,
      // vsync jitter would occasionally push a frame to the next divisor (e.g. 50→33 on a
      // 100 Hz panel); backing off 10% keeps the intended cadence. `timeMs` is the rAF
      // timestamp (monotonic ms).
      if (fpsCap > 0) {
        if (timeMs - lastFrameMs < (1000 / fpsCap) * 0.9) return;
        lastFrameMs = timeMs;
      }
      timer.update();
      const delta = timer.getDelta();
      handlers.onFrame?.(delta);
      if (gpuTimer) gpuTimer.span("main", () => renderMain(delta));
      else renderMain(delta);
      gpuTimer?.poll();
      stats?.update();
    });

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer?.setSize(width, height);
      if (sceneCapture) {
        const db = renderer.getDrawingBufferSize(new THREE.Vector2());
        sceneCapture.target.setSize(
          Math.max(1, Math.round(db.x * captureScale)),
          Math.max(1, Math.round(db.y * captureScale)),
        );
      }
      handlers.onResize?.(width, height);
    };
    applyResize = resize;
    // Apply once now so any pixel-ratio a scene set during setup (via setPixelRatio,
    // whose resize was a no-op before this point) takes effect on the first frame.
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      timer.disconnect();
      timer.dispose();
      stats?.dom.remove();
      gpuTimer?.dispose();
      handlers.dispose?.();
      composer?.dispose();
      sceneCapture?.target.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return containerRef;
}

"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export interface BloomOptions {
  strength?: number;
  radius?: number;
  threshold?: number;
}

export interface ThreeSceneOptions {
  /** Overlay a three.js FPS/ms stats panel in the top-left corner. */
  stats?: boolean;
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
   * Set the live device-pixel-ratio (clamped to the `maxPixelRatio` option), then
   * resize the drawing buffer + capture target to match. Lets a scene expose a
   * render-scale control for weak GPUs.
   */
  setPixelRatio: (ratio: number) => void;
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
  const antialiasRef = useRef(options.antialias ?? true);
  const bloomRef = useRef(options.bloom ?? false);
  const sceneCaptureRef = useRef(options.sceneCapture ?? false);
  const maxPixelRatioRef = useRef(options.maxPixelRatio ?? 2);

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

    const handlers = setupRef.current({
      scene,
      camera,
      renderer,
      container,
      bloomPass,
      sceneCapture,
      setPixelRatio,
    });

    const stats = showStatsRef.current ? new Stats() : undefined;
    if (stats) {
      stats.showPanel(0);
      container.appendChild(stats.dom);
    }

    const timer = new THREE.Timer();
    // Uses the Page Visibility API to avoid a huge delta when the tab regains focus.
    timer.connect(document);
    renderer.setAnimationLoop(() => {
      timer.update();
      const delta = timer.getDelta();
      handlers.onFrame?.(delta);
      if (composer) {
        composer.render(delta);
      } else {
        renderer.render(scene, camera);
      }
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
      handlers.dispose?.();
      composer?.dispose();
      sceneCapture?.target.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return containerRef;
}

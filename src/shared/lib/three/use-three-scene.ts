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
  /** Render through an HDR bloom pipeline. `true` uses defaults; pass an object to tune. */
  bloom?: boolean | BloomOptions;
}

export interface ThreeSceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  container: HTMLDivElement;
  /** Present when the `bloom` option is enabled, so a scene can add UI to tune it. */
  bloomPass?: UnrealBloomPass;
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
  const bloomRef = useRef(options.bloom ?? false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    const handlers = setupRef.current({
      scene,
      camera,
      renderer,
      container,
      bloomPass,
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
      handlers.onResize?.(width, height);
    };
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
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return containerRef;
}

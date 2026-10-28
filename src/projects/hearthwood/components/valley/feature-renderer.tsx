"use client";

import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from "react";
import { Camera, PerspectiveCamera, Scene, type WebGPURenderer } from "three/webgpu";
import { liveFeatures, type FeatureId } from "../../features";
import { FEATURE_ART } from "../../art/features";
import type { FeatureFrame } from "../../art/feature-art";
import { FrameRenderer, type FrameCosts } from "../../art/frame";
import { QUALITY } from "../../quality";
import { RendererContext } from "../gpu-canvas";

/*
 * The scene's render loop, without react-three-fiber. `GpuCanvas` (in
 * `gpu-canvas.tsx`) creates the raw WebGPU renderer and exposes it through
 * context; this component builds the frame's pipeline (`art/frame.ts`) on it.
 * `WorldView` drives the drawing imperatively through `FeatureRendererRef.render`
 * every frame. Anything that reads what was drawn runs after this at
 * `AFTER_RENDER_PRIORITY`; anything that must run before the frame runs at a
 * lower priority.
 */

export const RENDER_PRIORITY = 1;
export const AFTER_RENDER_PRIORITY = 2;

/** The raw three.Scene built by `FeatureRenderer`, provided to art components that mount their own objects imperatively. */
export const SceneContext = createContext<Scene | null>(null);

/** The PerspectiveCamera built by `FeatureRenderer`, provided to art components that need the camera's position each frame. */
export const CameraContext = createContext<Camera | null>(null);

/** The handle `WorldView` holds to drive the render loop imperatively. */
export interface FeatureRendererRef {
  render(frame: Partial<FeatureFrame>, costs: FrameCosts): void;
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

/** The canvas's renderer: provided by `GpuCanvas` through context, null until WebGPU is ready. */
export function useRenderer(): WebGPURenderer {
  return useContext(RendererContext) as unknown as WebGPURenderer;
}

export const FeatureRenderer = forwardRef<FeatureRendererRef, void>(function FeatureRenderer(_props, ref) {
  void _props;
  const renderer = useContext(RendererContext);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const frameRendererRef = useRef<FrameRenderer | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);

  useEffect(() => {
    if (!renderer) return;
    const s = new Scene();
    const c = new PerspectiveCamera(55, 1, 0.1, QUALITY.viewDistance * 1.2);
    sceneRef.current = s;
    cameraRef.current = c;
    setScene(s);
    setCamera(c);
    const frameRenderer = new FrameRenderer(renderer, liveFeatures(), FEATURE_ART, { samples: QUALITY.samples });
    frameRendererRef.current = frameRenderer;
    return () => {
      frameRenderer.dispose();
      frameRendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      setScene(null);
      setCamera(null);
    };
  }, [renderer]);

  useImperativeHandle(
    ref,
    () => ({
      render(frame: Partial<FeatureFrame>, costs: FrameCosts): void {
        if (!renderer || !frameRendererRef.current || !sceneRef.current || !cameraRef.current) return;
        frameRendererRef.current.render(
          { renderer, scene: sceneRef.current, camera: cameraRef.current, ...frame },
          costs,
        );
      },
    }),
    [renderer],
  );

  return (
    <SceneContext.Provider value={scene}>
      <CameraContext.Provider value={camera}>
        {null}
      </CameraContext.Provider>
    </SceneContext.Provider>
  );
});

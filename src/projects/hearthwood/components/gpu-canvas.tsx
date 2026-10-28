"use client";

import { createContext, type ReactNode, useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";

/*
 * Every Hearthwood canvas: three's raw WebGPU renderer, never WebGL and never
 * react-three-fiber. A browser without WebGPU (or one that hands back only the
 * WebGL fallback) is told so instead of drawing. The canvas is `flat`: the
 * frame's own pipeline (`art/frame.ts`) tone maps and encodes, so nothing else
 * may.
 */

/** The raw WebGPU renderer, provided by `GpuCanvas` to `FeatureRenderer` and anything else that needs it. */
export const RendererContext = createContext<THREE.WebGPURenderer | null>(null);

/** Asks for the GPU timer only with `?costs` (for the ~ panel and the shot tools), since timing has a cost of its own. */
function wantsTimestamps(): boolean {
  return new URLSearchParams(window.location.search).has("costs");
}

export async function makeRenderer(canvas: HTMLCanvasElement): Promise<THREE.WebGPURenderer> {
  if (!("gpu" in navigator)) throw new Error("This browser has no WebGPU");
  const renderer = new THREE.WebGPURenderer({
    canvas,
    // Edges are smoothed in the frame's own pipeline, at the scene pass, not on the swap chain.
    antialias: false,
    // Reversed depth keeps depth precise from a hand's breadth to the horizon a hundred kilometres off.
    reversedDepthBuffer: true,
    trackTimestamp: wantsTimestamps(),
  });
  await renderer.init();
  const backend = renderer.backend as { isWebGPUBackend?: boolean };
  if (backend.isWebGPUBackend !== true) {
    renderer.dispose();
    throw new Error("This browser has no WebGPU");
  }
  return renderer;
}

interface GpuCanvasProps {
  children?: ReactNode;
  dpr?: [number, number];
  camera?: { fov: number; near: number; far: number };
}

export function GpuCanvas({ children, ...props }: GpuCanvasProps) {
  void props;
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
  const [renderer, setRenderer] = useState<THREE.WebGPURenderer | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      // The frame's pipeline fills the canvas; CSS keeps it covering the surface.
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      display: "block",
    });
    containerRef.current.appendChild(canvas);
    const pixelRatio = Math.min(Math.max(window.devicePixelRatio, 1), 2);
    const width = Math.floor(containerRef.current.clientWidth * pixelRatio) || 1;
    const height = Math.floor(containerRef.current.clientHeight * pixelRatio) || 1;
    canvas.width = width;
    canvas.height = height;
    let live = true;
    makeRenderer(canvas).then((r) => {
      rendererRef.current = r;
      if (live) setRenderer(r);
    }).catch((error) => {
      setFailed(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
      rendererRef.current?.dispose();
      canvas.remove();
    };
  }, []);

  if (failed) {
    return <NoWebGpu reason={failed} />;
  }
  return (
    <RendererContext.Provider value={renderer}>
      <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
        {children}
      </div>
    </RendererContext.Provider>
  );
}

function NoWebGpu({ reason }: { reason: string }) {
  return (
    <div data-testid="hearthwood-no-webgpu" className="flex h-full w-full items-center justify-center p-6 text-center" style={{ background: "var(--color-hearthwood-valley-ui-shade)", color: "var(--color-hearthwood-valley-ui-ink)" }}>
      <div className="max-w-md space-y-2">
        <p className="text-lg font-semibold">Hearthwood needs WebGPU</p>
        <p className="text-sm opacity-80">It draws its world with WebGPU, which this browser doesn&apos;t offer. Chrome or Edge on a laptop, or Chrome on Android, will run it.</p>
        <p className="text-xs opacity-60">{reason}</p>
      </div>
    </div>
  );
}

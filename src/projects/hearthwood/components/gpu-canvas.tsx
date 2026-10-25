"use client";

import { useState, type ComponentProps } from "react";
import { Canvas, extend } from "@react-three/fiber";
import * as THREE from "three/webgpu";

/*
 * Every Hearthwood canvas: react-three-fiber over three's WebGPU renderer,
 * never WebGL. A browser without WebGPU (or one that hands back only the
 * WebGL fallback) is told so instead of drawing. The canvas is `flat`: the
 * frame's own pipeline (`art/frame.ts`) tone maps and encodes, so nothing
 * else may.
 */

// The scene graph's JSX elements are three/webgpu's classes, so `<mesh>` takes node materials.
extend(THREE as unknown as Parameters<typeof extend>[0]);

type CanvasProps = ComponentProps<typeof Canvas>;

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
    powerPreference: "high-performance",
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

export function GpuCanvas({ children, ...props }: Omit<CanvasProps, "gl" | "flat" | "linear">) {
  const [failed, setFailed] = useState<string | null>(null);
  if (failed) return <NoWebGpu reason={failed} />;
  return (
    <Canvas
      {...props}
      flat
      gl={async ({ canvas }) => {
        try {
          return await makeRenderer(canvas as HTMLCanvasElement);
        } catch (error) {
          setFailed(error instanceof Error ? error.message : String(error));
          throw error;
        }
      }}
    >
      {children}
    </Canvas>
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

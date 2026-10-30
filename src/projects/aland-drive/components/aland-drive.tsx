"use client";

import { useEffect, useRef, useState } from "react";
import type { GameProbe } from "../render/game";

/*
 * The page round the world: the canvas the game draws into. The game itself
 * runs outside React (`render/game.ts`); the page only starts it and stops it.
 */

declare global {
  interface Window {
    __alandDrive?: GameProbe;
  }
}

// The game's own UI colours, declared with its other tokens outside Tailwind's theme.
const INK = "var(--color-aland-drive-ui-ink)";
const SHADE = "var(--color-aland-drive-ui-shade)";

export function AlandDrive() {
  const container = useRef<HTMLDivElement>(null);
  const [noWebGpu, setNoWebGpu] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const cleanup = new AbortController();
    // Asked again after each wait: the page may have closed while it waited.
    const closed = () => cleanup.signal.aborted;
    let stop: (() => void) | null = null;
    void (async () => {
      const adapter = "gpu" in navigator ? await navigator.gpu.requestAdapter() : null;
      if (closed()) return;
      if (!adapter) {
        setNoWebGpu(true);
        return;
      }
      const { startGame } = await import("../render/game");
      const game = await startGame(element);
      if (closed()) {
        game.dispose();
        return;
      }
      window.__alandDrive = game.probe;
      stop = () => {
        game.dispose();
        delete window.__alandDrive;
      };
    })();
    return () => {
      cleanup.abort();
      stop?.();
    };
  }, []);

  return (
    <div className="fixed inset-0" style={{ background: SHADE }}>
      <div ref={container} className="absolute inset-0" />
      {noWebGpu && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center" style={{ color: INK }}>
          <p className="max-w-sm text-lg">Åland Drive needs a browser with WebGPU, such as a recent Chrome, Edge or Safari.</p>
        </div>
      )}
    </div>
  );
}

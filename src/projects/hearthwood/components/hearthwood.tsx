"use client";

import { useEffect, useRef, useState } from "react";
import { parseDate } from "../engine/calendar";
import type { GameProbe, GameStatus } from "../render/game";
import { useFrameStats } from "@/shared/lib/three/frame-stats";

/*
 * The page round the world: the canvas the game draws into, the frame
 * meter, and a word on how to fly. The game itself runs outside React
 * (`render/game.ts`); the page only starts it, stops it, and shows what it
 * reports. The address can set the world: `?seed=` another world, `?hour=`
 * a held hour, `?date=` a date (`summer-2`, `litha`), `?aurora=on|off`.
 */

declare global {
  interface Window {
    __hearthwood?: GameProbe;
  }
}

type Support = "checking" | "ready" | "no-webgpu";

// The world's own UI colours, declared with its other tokens outside Tailwind's theme.
const INK = "var(--color-hearthwood-valley-ui-ink)";
const SHADE = "var(--color-hearthwood-valley-ui-shade)";

function optionsFrom(search: string) {
  const params = new URLSearchParams(search);
  const hour = params.get("hour");
  const date = params.get("date");
  const aurora = params.get("aurora");
  return {
    seed: params.get("seed") ?? "hearthwood",
    hour: hour === null ? null : Number(hour),
    day: date === null ? null : parseDate(date),
    aurora: aurora === "on" ? 1 : aurora === "off" ? 0 : null,
  };
}

export function Hearthwood() {
  const container = useRef<HTMLDivElement>(null);
  const [support, setSupport] = useState<Support>("checking");
  const [status, setStatus] = useState<GameStatus>({ speed: 0, locked: false });
  useFrameStats();

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
        setSupport("no-webgpu");
        return;
      }
      setSupport("ready");
      const { startGame } = await import("../render/game");
      const game = await startGame(element, optionsFrom(window.location.search), setStatus);
      if (closed()) {
        game.dispose();
        return;
      }
      window.__hearthwood = game.probe;
      stop = () => {
        game.dispose();
        delete window.__hearthwood;
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
      {support === "no-webgpu" && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center" style={{ color: INK }}>
          <p className="max-w-sm text-lg">Hearthwood needs a browser with WebGPU, such as a recent Chrome, Edge or Safari.</p>
        </div>
      )}
      {support === "ready" && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm" style={{ color: INK, background: `color-mix(in srgb, ${SHADE} 60%, transparent)` }}>
          {status.locked ? `${String(Math.round(status.speed))} m/s · wheel changes speed` : "Click to look · WASD fly · E/Q up/down · Shift fast"}
        </div>
      )}
    </div>
  );
}

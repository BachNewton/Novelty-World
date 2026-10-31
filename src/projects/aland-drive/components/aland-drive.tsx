"use client";

import { useEffect, useRef, useState } from "react";
import type { InputKind } from "@/shared/lib/input";
import { Prompt } from "@/shared/components/prompts";
import { useFrameStats } from "@/shared/lib/three/frame-stats";
import { ArrowUp, Camera, Crosshair, Eye, Map as MapIcon, MapPinOff, RefreshCcw, Hand, X } from "lucide-react";
import { BINDINGS } from "../input/controls";
import type { CameraMode, GameProbe, HudReading, LoadingProgress } from "../render/game";

/*
 * The page round the world: the canvas the game draws into, and the UI over it.
 * The game itself runs outside React (`render/game.ts`), and the page only
 * starts it and stops it. The speed changes every frame, so it's written
 * straight to its elements rather than rendered.
 */

declare global {
  interface Window {
    __alandDrive?: GameProbe;
  }
}

// The game's own UI colours, declared with its other tokens outside Tailwind's theme.
const INK = "var(--color-aland-drive-ui-ink)";
const SHADE = "var(--color-aland-drive-ui-shade)";
const ACCENT = "var(--color-aland-drive-ui-accent)";

const HINTS = [
  { binding: BINDINGS.handbrake, icon: Hand, label: "Handbrake" },
  { binding: BINDINGS.respawn, icon: RefreshCcw, label: "Back to the road" },
  { binding: BINDINGS.view, icon: Camera, label: "Change view" },
  { binding: BINDINGS.freeCamera, icon: Eye, label: "Free camera" },
  { binding: BINDINGS.map, icon: MapIcon, label: "World map" },
];

const MAP_HINTS = [
  { binding: BINDINGS.mapPick, icon: Crosshair, label: "Set destination" },
  { binding: BINDINGS.mapClear, icon: MapPinOff, label: "Clear route" },
  { binding: BINDINGS.mapClose, icon: X, label: "Close map" },
];

const ROAD_LABEL_FADE = "@keyframes aland-road-label { 0% { opacity: 0 } 12% { opacity: 1 } 75% { opacity: 1 } 100% { opacity: 0 } }";

/** The next turn as a distance: a driver reads tens of metres near, and tenths of a kilometre far. */
function distanceText(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres / 10) * 10} m`;
}

export function AlandDrive() {
  const container = useRef<HTMLDivElement>(null);
  const speedText = useRef<HTMLSpanElement>(null);
  const speedBar = useRef<HTMLDivElement>(null);
  const miniMap = useRef<HTMLCanvasElement>(null);
  const worldMap = useRef<HTMLCanvasElement>(null);
  const cue = useRef<HTMLDivElement>(null);
  const cueArrow = useRef<HTMLDivElement>(null);
  const cueText = useRef<HTMLSpanElement>(null);
  const [noWebGpu, setNoWebGpu] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState<InputKind>("keyboard-mouse");
  const [camera, setCamera] = useState<CameraMode>("chase");
  const [loading, setLoading] = useState<LoadingProgress | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [road, setRoad] = useState<{ name: string; seen: number } | null>(null);
  useFrameStats();

  useEffect(() => {
    const element = container.current;
    const mini = miniMap.current;
    const world = worldMap.current;
    if (!element || !mini || !world) return;
    const cleanup = new AbortController();
    // Asked again after each wait: the page may have closed while it waited.
    const closed = () => cleanup.signal.aborted;
    let stop: (() => void) | null = null;
    const showSpeed = ({ speedKmh, speedShare, cue: next }: HudReading) => {
      if (speedText.current) speedText.current.textContent = speedKmh.toFixed(0);
      if (speedBar.current) speedBar.current.style.transform = `scaleX(${speedShare})`;
      if (cue.current) cue.current.style.visibility = next ? "visible" : "hidden";
      if (next && cueArrow.current && cueText.current) {
        cueArrow.current.style.transform = `rotate(${next.radians}rad)`;
        cueText.current.textContent = distanceText(next.metres);
      }
    };
    void (async () => {
      const adapter = "gpu" in navigator ? await navigator.gpu.requestAdapter() : null;
      if (closed()) return;
      if (!adapter) {
        setNoWebGpu(true);
        return;
      }
      const { NoWebGpuError, startGame } = await import("../render/game");
      try {
        const game = await startGame(element, {
          onHud: showSpeed,
          onInputKind: setInput,
          onCamera: setCamera,
          onFailure: (lost) => { setFailure(lost.message); },
          onLoading: setLoading,
          onMapReady: () => { setMapReady(true); },
          onMapOpen: setMapOpen,
          onRoad: (name) => { setRoad((last) => ({ name, seen: (last?.seen ?? 0) + 1 })); },
        }, { mini, world });
        if (closed()) {
          game.dispose();
          return;
        }
        window.__alandDrive = game.probe;
        setStarted(true);
        stop = () => {
          game.dispose();
          delete window.__alandDrive;
        };
      } catch (error) {
        if (!(error instanceof NoWebGpuError)) {
          setFailure(error instanceof Error ? error.message : String(error));
          throw error;
        }
        setNoWebGpu(true);
      }
    })();
    return () => {
      cleanup.abort();
      stop?.();
    };
  }, []);

  const stillLoading = !started && !noWebGpu && failure === null;

  return (
    <div className="fixed inset-0" style={{ background: SHADE, ["--prompt-body" as string]: SHADE, ["--prompt-ink" as string]: INK }}>
      <div ref={container} className="absolute inset-0" />
      <style>{ROAD_LABEL_FADE}</style>
      {(stillLoading || (loading !== null && loading.done < loading.total)) && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: SHADE }}>
          <div className="h-2 w-72 overflow-hidden rounded-full" role="progressbar" aria-label="Loading the island" aria-valuemin={0} aria-valuemax={loading?.total ?? 1} aria-valuenow={loading?.done ?? 0} style={{ background: INK, opacity: 0.9 }}>
            <div className="h-full origin-left transition-transform" style={{ background: ACCENT, transform: `scaleX(${loading ? loading.done / loading.total : 0})` }} />
          </div>
        </div>
      )}
      <canvas ref={worldMap} className="absolute inset-0 size-full cursor-crosshair transition-opacity" style={{ display: mapOpen ? "block" : "none", opacity: 0 }} aria-label="Island map" />
      <canvas ref={miniMap} width={240} height={240} className="pointer-events-none absolute bottom-4 left-4 rounded-full" style={{ display: mapReady && !mapOpen && camera !== "free" ? "block" : "none", border: `2px solid ${INK}` }} aria-label="Mini map" />
      {started && !noWebGpu && (
        <>
          {road !== null && !mapOpen && camera !== "free" && (
            <div key={road.seen} className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 text-2xl font-semibold" style={{ color: INK, textShadow: `0 0 6px ${SHADE}`, animation: "aland-road-label 3.5s ease-out forwards" }} aria-live="polite" aria-label="Road" onAnimationEnd={() => { setRoad(null); }}>
              {road.name}
            </div>
          )}
          {!mapOpen && camera !== "free" && (
            <div ref={cue} className="pointer-events-none absolute top-3 right-6 flex items-center gap-2 text-xl font-semibold" style={{ color: INK, textShadow: `0 0 6px ${SHADE}`, visibility: "hidden" }} aria-label="Next direction">
              <div ref={cueArrow}>
                <ArrowUp className="size-10" style={{ color: ACCENT }} />
              </div>
              <span ref={cueText} className="tabular-nums" />
            </div>
          )}
          {camera !== "free" && (
            <div className="pointer-events-none absolute right-6 bottom-5 w-44 text-right" style={{ color: INK, textShadow: `0 0 6px ${SHADE}` }} role="status" aria-label="Speed in kilometres an hour">
              <span ref={speedText} className="text-6xl font-bold tabular-nums">
                0
              </span>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: SHADE }}>
                <div ref={speedBar} className="h-full w-full origin-left" style={{ background: ACCENT, transform: "scaleX(0)" }} />
              </div>
            </div>
          )}
          <ul className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-3 text-sm" style={{ color: INK, filter: `drop-shadow(0 0 3px ${SHADE})` }}>
            {(mapOpen ? MAP_HINTS : HINTS).map(({ binding, icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1" title={label}>
                <Prompt binding={binding} input={input} />
                <Icon aria-label={label} className="size-4" />
              </li>
            ))}
          </ul>
        </>
      )}
      {failure !== null && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center" style={{ color: INK, background: SHADE }} role="alert">
          <p className="max-w-md text-lg">Åland Drive lost part of the map: {failure}</p>
        </div>
      )}
      {noWebGpu && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center" style={{ color: INK }}>
          <p className="max-w-sm text-lg">Åland Drive needs a browser with WebGPU, such as a recent Chrome, Edge or Safari.</p>
        </div>
      )}
    </div>
  );
}

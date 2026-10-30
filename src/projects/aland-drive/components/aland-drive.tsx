"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { InputKind } from "@/shared/lib/input";
import { Prompt } from "@/shared/components/prompts";
import { useFrameStats } from "@/shared/lib/three/frame-stats";
import { CircleArrowUp, CircleSlash2, Camera, Eye, RefreshCcw, Undo2, Redo2, Hand } from "lucide-react";
import { BINDINGS } from "../input/controls";
import type { CameraMode, GameProbe, HudReading } from "../render/game";

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
  { binding: BINDINGS.throttle, icon: CircleArrowUp, label: "Accelerate" },
  { binding: BINDINGS.brake, icon: CircleSlash2, label: "Brake and reverse" },
  { binding: BINDINGS.left, icon: Undo2, label: "Steer left" },
  { binding: BINDINGS.right, icon: Redo2, label: "Steer right" },
  { binding: BINDINGS.handbrake, icon: Hand, label: "Handbrake" },
  { binding: BINDINGS.respawn, icon: RefreshCcw, label: "Back to the road" },
  { binding: BINDINGS.view, icon: Camera, label: "Change view" },
  { binding: BINDINGS.freeCamera, icon: Eye, label: "Free camera" },
];

export function AlandDrive() {
  const container = useRef<HTMLDivElement>(null);
  const speedText = useRef<HTMLSpanElement>(null);
  const speedBar = useRef<HTMLDivElement>(null);
  const [noWebGpu, setNoWebGpu] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<string[]>([]);
  const [input, setInput] = useState<InputKind>("keyboard-mouse");
  const [camera, setCamera] = useState<CameraMode>("chase");
  useFrameStats();

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const cleanup = new AbortController();
    // Asked again after each wait: the page may have closed while it waited.
    const closed = () => cleanup.signal.aborted;
    let stop: (() => void) | null = null;
    const showSpeed = ({ speedKmh, speedShare }: HudReading) => {
      if (speedText.current) speedText.current.textContent = speedKmh.toFixed(0);
      if (speedBar.current) speedBar.current.style.transform = `scaleX(${speedShare})`;
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
        const game = await startGame(element, { onHud: showSpeed, onInputKind: setInput, onCamera: setCamera, onFailure: (lost) => { setFailure(lost.message); } });
        if (closed()) {
          game.dispose();
          return;
        }
        window.__alandDrive = game.probe;
        setAttribution(game.attribution);
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

  const hints = HINTS.filter(({ binding }, index) => input !== "pad" || HINTS.findIndex((hint) => hint.binding.pad === binding.pad) === index);

  return (
    <div className="fixed inset-0" style={{ background: SHADE, ["--prompt-body" as string]: SHADE, ["--prompt-ink" as string]: INK }}>
      <div ref={container} className="absolute inset-0" />
      {attribution.length > 0 && !noWebGpu && (
        <>
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
            {hints.map(({ binding, icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1" title={label}>
                <Prompt binding={binding} input={input} />
                <Icon aria-label={label} className="size-4" />
              </li>
            ))}
          </ul>
          <Link href="/credits" className="absolute bottom-2 left-3 text-xs" style={{ color: INK, textShadow: `0 0 4px ${SHADE}` }}>
            {attribution.join(" · ")}
          </Link>
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

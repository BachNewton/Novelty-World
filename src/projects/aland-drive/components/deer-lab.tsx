"use client";

import { useEffect, useRef, useState } from "react";
import { useFrameStats } from "@/shared/lib/three/frame-stats";
import { SHOTS, startDeerStage, type DeerStage } from "../art/deer/stage";
import { startFreeCamera } from "../render/free-camera";

/*
 * The `?deer-lab` page: the deer's gallery running live, to judge the gaits in
 * motion, the seasons, and where each kind swaps to its far version. Everything
 * it shows is `art/deer/stage.ts`, which the headless gallery photographs too.
 */

const INK = "var(--color-aland-drive-ui-ink)";
const SHADE = "var(--color-aland-drive-ui-shade)";
const ACCENT = "var(--color-aland-drive-ui-accent)";
const LONGEST_FRAME_S = 0.1;

const SEASONS = [
  { label: "Summer", day: 200 },
  { label: "Autumn", day: 320 },
  { label: "Winter", day: 40 },
  { label: "Spring", day: 110 },
];
const SPEEDS = [
  { label: "Real speed", rate: 1 },
  { label: "Quarter speed", rate: 0.25 },
  { label: "Held", rate: 0 },
];

export function DeerLab() {
  const container = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<DeerStage | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [day, setDay] = useState(SEASONS[0].day);
  const [rate, setRate] = useState(1);
  const [view, setView] = useState(SHOTS[0].name);
  const rateRef = useRef(rate);
  const cameraRef = useRef<ReturnType<typeof startFreeCamera> | null>(null);
  useFrameStats();

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const cleanup = new AbortController();
    let frame = 0;
    void startDeerStage(element, { width: element.clientWidth, height: element.clientHeight })
      .then((made) => {
        if (cleanup.signal.aborted) {
          made.dispose();
          return;
        }
        const free = startFreeCamera(made.camera, made.renderer.domElement);
        cameraRef.current = free;
        made.look(SHOTS[0]);
        free.enter();
        setStage(made);
        const onResize = () => made.resize(element.clientWidth, element.clientHeight);
        window.addEventListener("resize", onResize, { signal: cleanup.signal });
        let last: number | null = null;
        const tick = (now: number) => {
          const seconds = Math.min(last === null ? 0 : (now - last) / 1000, LONGEST_FRAME_S);
          last = now;
          free.update(now);
          made.step(seconds * rateRef.current);
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        cleanup.signal.addEventListener("abort", () => {
          cancelAnimationFrame(frame);
          free.dispose();
          made.dispose();
        });
      })
      .catch((error: unknown) => setFailure(error instanceof Error ? error.message : String(error)));
    return () => cleanup.abort();
  }, []);

  const button = (active: boolean) => ({ background: active ? ACCENT : "transparent", color: active ? SHADE : INK, borderColor: ACCENT });
  const swaps = stage?.herd.swaps();

  return (
    <div className="fixed inset-0" style={{ background: SHADE }}>
      <div ref={container} className="absolute inset-0" />
      <div className="absolute left-3 top-3 w-72 space-y-3 rounded-lg p-3 text-sm" style={{ background: SHADE, color: INK }}>
        <h1 className="font-bold">Deer lab</h1>
        {failure && <p style={{ color: ACCENT }}>{failure}</p>}
        <p className="text-xs">WASD, Q, E and drag to fly. The wheel sets the speed.</p>

        <div className="grid grid-cols-1 gap-1">
          {SHOTS.map((shot) => (
            <button
              key={shot.name}
              type="button"
              className="rounded border px-1 py-1 text-left text-xs"
              style={button(view === shot.name)}
              onClick={() => {
                setView(shot.name);
                stage?.look(shot);
                cameraRef.current?.enter();
              }}
            >
              {shot.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-1">
          {SEASONS.map((season) => (
            <button
              key={season.label}
              type="button"
              className="rounded border px-1 py-1 text-xs"
              style={button(day === season.day)}
              onClick={() => {
                setDay(season.day);
                stage?.setDay(season.day);
              }}
            >
              {season.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1">
          {SPEEDS.map((speed) => (
            <button key={speed.label} type="button" className="rounded border px-1 py-1 text-xs" style={button(rate === speed.rate)} onClick={() => setRate(speed.rate)}>
              {speed.label}
            </button>
          ))}
        </div>

        {swaps && <p className="text-xs">Far version from {Object.entries(swaps).map(([kind, swapM]) => `${kind} ${swapM} m`).join(", ")}</p>}
      </div>
    </div>
  );
}

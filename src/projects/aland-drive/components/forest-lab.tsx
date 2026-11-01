"use client";

import { useEffect, useRef, useState } from "react";
import { useFrameStats } from "@/shared/lib/three/frame-stats";
import type { ForestModel } from "../render/forest";
import { startForestLab, type ForestLab as Lab, type ForestLabState, type ForestLabView } from "../render/forest-lab";

/*
 * The `?forest-lab` page: the canvas, and the controls over it. Everything it
 * shows is `render/forest-lab.ts`, which runs outside React, as the game does.
 */

declare global {
  interface Window {
    __forestLab?: Lab;
  }
}

const INK = "var(--color-aland-drive-ui-ink)";
const SHADE = "var(--color-aland-drive-ui-shade)";
const ACCENT = "var(--color-aland-drive-ui-accent)";
const MOST_DISTANCE_M = 1600;
const READ_EVERY_FRAMES = 10;

const VIEWS: { view: ForestLabView; label: string; key: string }[] = [
  { view: "game", label: "As in the game", key: "Natural colours." },
  { view: "models", label: "Which model", key: "Green turned, yellow outline, blue cone. A speckled tree is mid-crossfade." },
  { view: "thinned", label: "Which trees go", key: "Red trees dissolve away with distance. Grey ones stay on as cones." },
  { view: "slide", label: "Who slides", key: "Redder trees move further up or down between near and far: full red is 2 m." },
];

const MODELS: { model: ForestModel; label: string }[] = [
  { model: "turned", label: "Turned" },
  { model: "outline", label: "Outline" },
  { model: "cone", label: "Cone" },
];

export function ForestLab() {
  const container = useRef<HTMLDivElement>(null);
  const [lab, setLab] = useState<Lab | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [state, setState] = useState<ForestLabState | null>(null);
  const [view, setView] = useState<ForestLabView>("game");
  const [pinned, setPinned] = useState(false);
  const [distance, setDistance] = useState(400);
  const [approaching, setApproaching] = useState(false);
  const [oldGround, setOldGround] = useState(false);
  const [bands, setBands] = useState(true);
  const [hidden, setHidden] = useState<ForestModel[]>([]);
  useFrameStats();

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const cleanup = new AbortController();
    const fail = (error: Error) => setFailure(error.message);
    let started: Lab | null = null;
    let reading = 0;
    void startForestLab(element, fail)
      .then((made) => {
        if (cleanup.signal.aborted) {
          made.dispose();
          return;
        }
        started = made;
        window.__forestLab = made;
        setLab(made);
        const read = () => {
          if (cleanup.signal.aborted) return;
          const next = made.state();
          if (next.frames >= reading) {
            reading = next.frames + READ_EVERY_FRAMES;
            setState(next);
          }
          requestAnimationFrame(read);
        };
        read();
      })
      .catch(fail);
    return () => {
      cleanup.abort();
      delete window.__forestLab;
      started?.dispose();
    };
  }, []);

  const pin = (on: boolean) => {
    setPinned(on);
    lab?.pin(on ? distance : null);
    if (!on) setApproaching(false);
  };
  const approach = () => {
    if (!pinned) pin(true);
    setApproaching(!approaching);
    lab?.approach(!approaching);
  };
  const button = (active: boolean) => ({ background: active ? ACCENT : "transparent", color: active ? SHADE : INK, borderColor: ACCENT });

  return (
    <div className="fixed inset-0" style={{ background: SHADE }}>
      <div ref={container} className="absolute inset-0" />
      <div className="absolute left-3 top-3 w-72 space-y-3 rounded-lg p-3 text-sm" style={{ background: SHADE, color: INK }}>
        <h1 className="font-bold">Forest lab</h1>
        {failure && <p style={{ color: ACCENT }}>{failure}</p>}
        <p className="text-xs">WASD, Q, E and drag to fly. The wheel sets the speed.</p>

        <div className="grid grid-cols-2 gap-1">
          {VIEWS.map((entry) => (
            <button
              key={entry.view}
              type="button"
              className="rounded border px-1 py-1 text-xs"
              style={button(view === entry.view)}
              onClick={() => {
                setView(entry.view);
                lab?.setView(entry.view);
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="text-xs">{VIEWS.find((entry) => entry.view === view)?.key}</p>

        <div className="flex gap-3 text-xs">
          {MODELS.map(({ model, label }) => (
            <label key={model} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={!hidden.includes(model)}
                onChange={(event) => {
                  setHidden(event.target.checked ? hidden.filter((entry) => entry !== model) : [...hidden, model]);
                  lab?.showModel(model, event.target.checked);
                }}
              />
              {label}
            </label>
          ))}
        </div>

        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={bands}
            onChange={(event) => {
              setBands(event.target.checked);
              lab?.showBands(event.target.checked);
            }}
          />
          Mark the bands on the ground
        </label>

        <div className="space-y-1">
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={pinned} onChange={(event) => pin(event.target.checked)} />
            Pin the distance: hold the view, move the car
          </label>
          <input
            type="range"
            className="w-full"
            aria-label="Distance from the car"
            min={0}
            max={MOST_DISTANCE_M}
            value={distance}
            disabled={!pinned}
            onChange={(event) => {
              const metres = Number(event.target.value);
              setDistance(metres);
              lab?.pin(metres);
            }}
          />
          <p className="text-xs">Car is {Math.round(state?.distance ?? 0)} m away</p>
          <button type="button" className="w-full rounded border px-1 py-1 text-xs" style={button(approaching)} onClick={approach}>
            {approaching ? "Stop" : "Drive towards it at 90 km/h"}
          </button>
        </div>

        <div className="space-y-1">
          <button type="button" className="w-full rounded border px-1 py-1 text-xs" style={button(false)} onClick={() => lab?.nextWorstTree()}>
            Show me the next worst tree nearby
          </button>
          {state?.focus && (
            <p className="text-xs">
              Number {state.focus.rank} of {state.focus.of}: {state.focus.height.toFixed(1)} m tall, base slides {state.focus.slide.toFixed(2)} m
            </p>
          )}
        </div>

        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={oldGround}
            onChange={(event) => {
              setOldGround(event.target.checked);
              lab?.useOldGround(event.target.checked);
            }}
          />
          Compare: the old ground under trees
        </label>

        <p className="text-xs">
          {state ? `${(state.triangles / 1e6).toFixed(2)} M triangles, ${state.gpuMs?.toFixed(1) ?? "?"} ms GPU` : "Loading"}
          {state && state.loading > 0 ? `, ${state.loading} tiles to come` : ""}
        </p>
      </div>
    </div>
  );
}

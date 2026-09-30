"use client";

import { useEffect, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { isDone } from "../run";
import { useFrogminoStore } from "../store";
import { MuteButton } from "../audio/mute-button";
import { useGameSounds } from "../audio/use-game-sounds";
import { useFrogKeys } from "./use-frog-keys";

// The scene reads its colours from the live stylesheet, so it only renders in
// the browser.
const FrogminoScene = dynamic(() => import("./scene").then((m) => m.FrogminoScene), {
  ssr: false,
});
const Garage = dynamic(() => import("./garage").then((m) => m.Garage), { ssr: false });
const WorldPreview = dynamic(() => import("./world/world-preview").then((m) => m.WorldPreview), { ssr: false });
const SoundLab = dynamic(() => import("../audio/sound-lab").then((m) => m.SoundLab), { ssr: false });

const KEY_LEGEND: readonly [keys: string, action: string][] = [
  ["A D / ← →", "move"],
  ["Q E", "rotate"],
  ["Space", "hop"],
  ["W S / ↑ ↓", "jump (hold to repeat)"],
  ["R", "restart"],
  ["M", "mute"],
];

function KeyLegend() {
  return (
    <dl className="pointer-events-none absolute bottom-4 left-4 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-lg bg-surface-secondary/80 px-3 py-2 text-xs">
      {KEY_LEGEND.map(([keys, action]) => (
        <div key={action} className="contents">
          <dt className="font-mono text-text-primary">{keys}</dt>
          <dd className="text-text-secondary">{action}</dd>
        </div>
      ))}
    </dl>
  );
}

function DoneOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
      <p className="rounded-xl border-2 border-brand-green bg-surface-secondary/90 px-6 py-4 text-center text-lg font-bold text-text-primary">
        Done — press <span className="text-brand-green">R</span> to restart
      </p>
    </div>
  );
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

// `?garage` in the URL shows the fleet instead of the game, `?world` the world
// preview, and `?sounds` the sound audition. The server render never has any
// of them, so the page hydrates as the game and switches after.
function useUrlFlag(flag: string): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => new URLSearchParams(window.location.search).has(flag),
    () => false,
  );
}

export function Frogmino() {
  const garage = useUrlFlag("garage");
  const world = useUrlFlag("world");
  const sounds = useUrlFlag("sounds");
  if (garage) return <Garage />;
  if (world) return <WorldPreview />;
  if (sounds) return <SoundLab />;
  return <FrogminoGame />;
}

function FrogminoGame() {
  const done = useFrogminoStore((s) => isDone(s.run));
  const restart = useFrogminoStore((s) => s.restart);
  useFrogKeys();
  useGameSounds();
  // The store outlives the page, so coming back starts a fresh run.
  useEffect(() => {
    restart();
  }, [restart]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-surface-primary">
      <div className="absolute inset-0">
        <FrogminoScene />
      </div>
      <h1 className="pointer-events-none absolute left-4 top-4 text-xl font-bold text-brand-green">
        Frogmino
      </h1>
      <MuteButton className="absolute right-4 top-4" />
      <KeyLegend />
      {done && <DoneOverlay />}
    </div>
  );
}

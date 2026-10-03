"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useStore } from "zustand";
import { isDone } from "../run";
import { localSession, type Session } from "../session";
import { coopPlaceholderCourse, soloCourse, type Course } from "../courses";
import { MuteButton } from "../audio/mute-button";
import { useGameSounds } from "../audio/use-game-sounds";
import { FROG_LOOKS } from "../frog/look";
import { seatedSink, SOLO_SEATING, type Seating } from "../input/devices";
import { COOP_LEGEND, SOLO_LEGEND, type KeyboardLayout } from "../input/keyboard";
import { lineupSeating, type Lineup } from "../input/lineup";
import { useGamepadSource } from "../input/use-gamepad-source";
import { useKeyboardSource } from "../input/use-keyboard-source";
import { coopLanes, frogminoView } from "../view";
import type { PreviewLanes } from "../world/preview-rows";
import { TouchControls } from "./touch-controls";
import { FrogminoLobby } from "./lobby";
import { LocalJoin } from "./local-join";

// The scene reads its colours from the live stylesheet, so it only renders in
// the browser.
const FrogminoScene = dynamic(() => import("./scene").then((m) => m.FrogminoScene), {
  ssr: false,
});
const Garage = dynamic(() => import("./garage").then((m) => m.Garage), { ssr: false });
const WorldPreview = dynamic(() => import("./world/world-preview").then((m) => m.WorldPreview), { ssr: false });
const SoundLab = dynamic(() => import("../audio/sound-lab").then((m) => m.SoundLab), { ssr: false });
const MusicLab = dynamic(() => import("../audio/music/music-lab").then((m) => m.MusicLab), { ssr: false });
const FrogPreview = dynamic(() => import("./frog/frog-preview").then((m) => m.FrogPreview), { ssr: false });

const LEGEND_BOX =
  "pointer-events-none absolute bottom-4 left-4 pointer-coarse:hidden rounded-lg bg-surface-secondary/80 px-3 py-2 text-xs";
const PAD_LEGEND = "Controller: stick or D-pad to move and jump, A hop, X B or LB RB rotate, Menu restart";

function SoloLegend() {
  return (
    <div className={LEGEND_BOX}>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
        {SOLO_LEGEND.map(([keys, action]) => (
          <div key={action} className="contents">
            <dt className="font-mono text-text-primary">{keys}</dt>
            <dd className="text-text-secondary">{action}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 max-w-64 text-text-secondary">{PAD_LEGEND}</p>
    </div>
  );
}

// Each action with each player's half of the keyboard.
function CoopLegend() {
  return (
    <div className={`${LEGEND_BOX} grid grid-cols-[auto_auto_auto] gap-x-3 gap-y-0.5`}>
      <span />
      <span className="font-bold text-brand-green">{FROG_LOOKS.p1.name}</span>
      <span className="font-bold text-brand-blue">{FROG_LOOKS.p2.name}</span>
      {COOP_LEGEND.map(([action, p1, p2]) => (
        <div key={action} className="contents">
          <span className="text-text-secondary">{action}</span>
          <span className="font-mono text-text-primary">{p1}</span>
          <span className="font-mono text-text-primary">{p2}</span>
        </div>
      ))}
      <span className="text-text-secondary">restart, mute</span>
      <span className="col-span-2 font-mono text-text-primary">R, M</span>
      <p className="col-span-3 mt-1 max-w-64 text-text-secondary">{PAD_LEGEND}</p>
    </div>
  );
}

// Touch screens have no R key, so they get a Restart button instead.
function DoneOverlay({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
      <p className="rounded-xl border-2 border-brand-green bg-surface-secondary/90 px-6 py-4 text-center text-lg font-bold text-text-primary">
        Done<span className="pointer-coarse:hidden"> — press <span className="text-brand-green">R</span> to restart</span>
      </p>
      <button
        type="button"
        onClick={onRestart}
        className="pointer-events-auto hidden touch-manipulation rounded-full bg-brand-green px-8 py-3 text-lg font-bold text-surface-primary pointer-coarse:block"
      >
        Restart
      </button>
    </div>
  );
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

// The page opens on the screen its URL names (see `view.ts`): the lobby, solo
// play with `?play=solo`, local co-op's join screen with `?play=local`, or a
// dev view in place of the game. The server render has no URL, so it renders
// nothing and the page picks after hydrating.
export function Frogmino() {
  const view = useSyncExternalStore(subscribeToNothing, () => frogminoView(window.location.search), () => null);
  switch (view) {
    case null:
      return null;
    case "garage":
      return <Garage />;
    case "world":
      return <WorldPreview />;
    case "sounds":
      return <SoundLab />;
    case "music":
      return <MusicLab />;
    case "frog":
      return <FrogPreview />;
    case "lobby":
    case "solo":
    case "local":
      return <FrogminoEntry opening={view} />;
  }
}

type Screen = { kind: "lobby" } | { kind: "solo" } | { kind: "join" } | { kind: "local"; lineup: Lineup };

function FrogminoEntry({ opening }: { opening: "lobby" | "solo" | "local" }) {
  const [screen, setScreen] = useState<Screen>(opening === "local" ? { kind: "join" } : { kind: opening });
  const [lanes] = useState(() => coopLanes(window.location.search));
  switch (screen.kind) {
    case "lobby":
      return (
        <FrogminoLobby
          onPlaySolo={() => {
            setScreen({ kind: "solo" });
          }}
          onLocalCoop={() => {
            setScreen({ kind: "join" });
          }}
        />
      );
    case "join":
      return (
        <LocalJoin
          lanes={lanes}
          onStart={(lineup) => {
            setScreen({ kind: "local", lineup });
          }}
          onBack={() => {
            setScreen({ kind: "lobby" });
          }}
        />
      );
    case "solo":
      return <SoloGame />;
    case "local":
      return <LocalCoopGame lineup={screen.lineup} lanes={lanes} />;
  }
}

// The row stream is pure, so solo's course is built once and kept.
let solo: Course | null = null;
function soloCourseOnce(): Course {
  solo ??= soloCourse();
  return solo;
}

// Solo: a local session with one player, whom every device drives. Each game
// opens on a fresh session, so coming back starts a fresh run.
function SoloGame() {
  const [session] = useState(() => localSession(soloCourseOnce()));
  return <FrogminoGame session={session} seating={SOLO_SEATING} keyboard="solo" touch />;
}

// Local co-op: a local session with a player per joined device, on the
// placeholder co-op course. Touch plays solo only.
function LocalCoopGame({ lineup, lanes }: { lineup: Lineup; lanes: PreviewLanes }) {
  const [session] = useState(() => localSession(coopPlaceholderCourse(lanes)));
  const seating = useMemo(() => lineupSeating(lineup), [lineup]);
  return <FrogminoGame session={session} seating={seating} keyboard="split" touch={false} />;
}

function FrogminoGame({
  session,
  seating,
  keyboard,
  touch,
}: {
  session: Session;
  seating: Seating;
  keyboard: KeyboardLayout;
  touch: boolean;
}) {
  const done = useStore(session.store, (s) => isDone(s.run));
  // The team's state, mirrored on the page for the end-to-end tests to wait
  // on: its depth, and when each frog last hopped.
  const depth = useStore(session.store, (s) => s.run.depth);
  const hops = useStore(session.store, (s) => s.run.frogs.map((frog) => String(frog.latestHop?.startedAt ?? "")).join(","));
  const sink = useMemo(() => seatedSink(seating, session), [seating, session]);
  useKeyboardSource(keyboard, sink);
  useGamepadSource(sink);
  useGameSounds(session);

  return (
    <div
      data-testid="frogmino-game"
      data-depth={depth}
      data-hopped-at={hops}
      className="relative h-[100dvh] w-full overflow-hidden bg-surface-primary"
    >
      <div className="absolute inset-0">
        <FrogminoScene session={session} />
      </div>
      {touch && <TouchControls sink={sink} done={done} />}
      <h1 className="pointer-events-none absolute left-4 top-4 text-xl font-bold text-brand-green">Frogmino</h1>
      <MuteButton className="absolute right-4 top-4" />
      {keyboard === "solo" ? <SoloLegend /> : <CoopLegend />}
      {done && <DoneOverlay onRestart={session.restart} />}
    </div>
  );
}

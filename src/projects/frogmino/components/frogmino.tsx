"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { localSession } from "../session";
import { COOP_COURSE } from "../coop-course";
import { coopCourse, soloCourse, type Course } from "../courses";
import { SOLO_SEATING } from "../input/devices";
import { lineupSeating, type Lineup } from "../input/lineup";
import { frogminoView, replayName } from "../view";
import { GameScreen } from "./game-screen";
import { FrogminoLobby } from "./lobby";
import { LocalJoin } from "./local-join";

const Garage = dynamic(() => import("./garage").then((m) => m.Garage), { ssr: false });
const WorldPreview = dynamic(() => import("./world/world-preview").then((m) => m.WorldPreview), { ssr: false });
const SoundLab = dynamic(() => import("../audio/sound-lab").then((m) => m.SoundLab), { ssr: false });
const MusicLab = dynamic(() => import("../audio/music/music-lab").then((m) => m.MusicLab), { ssr: false });
const FrogPreview = dynamic(() => import("./frog/frog-preview").then((m) => m.FrogPreview), { ssr: false });
const ReplayView = dynamic(() => import("./replay-view").then((m) => m.ReplayView), { ssr: false });

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
    case "replay":
      return <ReplayView name={replayName(window.location.search)} />;
    case "lobby":
    case "solo":
    case "local":
      return <FrogminoEntry opening={view} />;
  }
}

type Screen = { kind: "lobby" } | { kind: "solo" } | { kind: "join" } | { kind: "local"; lineup: Lineup };

function FrogminoEntry({ opening }: { opening: "lobby" | "solo" | "local" }) {
  const [screen, setScreen] = useState<Screen>(opening === "local" ? { kind: "join" } : { kind: opening });
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
          lanes={COOP_COURSE.lanes}
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
      return <LocalCoopGame lineup={screen.lineup} />;
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
  return <GameScreen session={session} seating={SOLO_SEATING} keyboard="solo" touch />;
}

// Local co-op: a local session with a player per joined device, on the co-op
// course. Touch plays solo only.
function LocalCoopGame({ lineup }: { lineup: Lineup }) {
  const [session] = useState(() => localSession(coopCourse()));
  const seating = useMemo(() => lineupSeating(lineup), [lineup]);
  return <GameScreen session={session} seating={seating} keyboard="split" touch={false} />;
}

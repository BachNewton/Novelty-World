"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { courseMusic } from "../audio/music/course-music";
import { localSession } from "../session";
import { coopCourse, soloCourse, type Course } from "../courses";
import { SOLO_SEATING } from "../input/devices";
import { lineupSeating, type Lineup } from "../input/lineup";
import { coopCourseParam, frogminoView, replayName } from "../view";
import { GameScreen, type GameExit } from "./game-screen";
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

type Screen = { kind: "lobby" } | { kind: "solo" } | { kind: "join" } | { kind: "local"; lineup: Lineup; course: string };

// A controller's focus on Frogmino's menus, in the game's sunny yellow, apart
// from the green that marks a course picked.
const PAD_FOCUS_LOOK = "[--color-pad-focus:var(--color-frogmino-sunflower)]";

function FrogminoEntry({ opening }: { opening: "lobby" | "solo" | "local" }) {
  return (
    <div className={PAD_FOCUS_LOOK}>
      <EntryScreen opening={opening} />
    </div>
  );
}

function EntryScreen({ opening }: { opening: "lobby" | "solo" | "local" }) {
  const [screen, setScreen] = useState<Screen>(opening === "local" ? { kind: "join" } : { kind: opening });
  const toLobby = { label: "Back to lobby", onExit: () => setScreen({ kind: "lobby" }) };
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
          initialCourse={coopCourseParam(window.location.search)}
          onStart={(lineup, course) => {
            setScreen({ kind: "local", lineup, course });
          }}
          onBack={() => {
            setScreen({ kind: "lobby" });
          }}
        />
      );
    case "solo":
      return <SoloGame exit={toLobby} />;
    case "local":
      return <LocalCoopGame lineup={screen.lineup} course={screen.course} exit={toLobby} />;
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
function SoloGame({ exit }: { exit: GameExit }) {
  const [session] = useState(() => localSession(soloCourseOnce()));
  return <GameScreen session={session} music={courseMusic({ kind: "solo" })} seating={SOLO_SEATING} keyboard="solo" touch exit={exit} />;
}

// Local co-op: a local session with a player per joined device, on the co-op
// course picked on the join screen. Touch plays solo only.
function LocalCoopGame({ lineup, course, exit }: { lineup: Lineup; course: string; exit: GameExit }) {
  const [session] = useState(() => localSession(coopCourse(course)));
  const seating = useMemo(() => lineupSeating(lineup), [lineup]);
  return (
    <GameScreen session={session} music={courseMusic({ kind: "coop", id: course })} seating={seating} keyboard="split" touch={false} exit={exit} />
  );
}

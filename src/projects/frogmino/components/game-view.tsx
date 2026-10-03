"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { useStore } from "zustand";
import { MuteButton } from "../audio/mute-button";
import { useGameSounds } from "../audio/use-game-sounds";
import type { Session } from "../session";

// The scene reads its colours from the live stylesheet, so it only renders in
// the browser.
const FrogminoScene = dynamic(() => import("./scene").then((m) => m.FrogminoScene), {
  ssr: false,
});

// A session's run on screen, with its sound and the mute button: what every
// way of playing shares, whoever its players are. What goes between the
// scene and the corner controls (input layers, legends, overlays) is the
// caller's.
export function GameView({ session, children }: { session: Session; children?: ReactNode }) {
  // The team's state, mirrored on the page for the end-to-end tests to wait
  // on: its depth, each frog's column, when each frog last hopped, the rows
  // passed and the last bonk.
  const depth = useStore(session.store, (s) => s.run.depth);
  const cols = useStore(session.store, (s) => s.run.frogs.map((frog) => String(frog.col)).join(","));
  const hops = useStore(session.store, (s) => s.run.frogs.map((frog) => String(frog.latestHop?.startedAt ?? "")).join(","));
  const passes = useStore(session.store, (s) => s.run.passes);
  const bonkedAt = useStore(session.store, (s) => String(s.run.lastBonk?.tick ?? ""));
  useGameSounds(session);

  return (
    <div
      data-testid="frogmino-game"
      data-depth={depth}
      data-cols={cols}
      data-hopped-at={hops}
      data-passes={passes}
      data-bonked-at={bonkedAt}
      className="relative h-[100dvh] w-full overflow-hidden bg-surface-primary"
    >
      <div className="absolute inset-0">
        <FrogminoScene session={session} />
      </div>
      {children}
      <h1 className="pointer-events-none absolute left-4 top-4 text-xl font-bold text-brand-green">Frogmino</h1>
      <MuteButton className="absolute right-4 top-4" />
    </div>
  );
}

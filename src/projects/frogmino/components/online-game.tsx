"use client";

import { useMemo } from "react";
import { courseMusic } from "../audio/music/course-music";
import type { CourseSpec } from "../courses";
import { cn } from "@/shared/lib/utils";
import { FROG_LOOKS } from "../frog/look";
import type { Seating } from "../input/devices";
import type { Session } from "../session";
import { GameScreen } from "./game-screen";

// Online co-op on this device: one player, whom every device here drives, as
// in solo, as the frog of their slot. The session is online; the game can't
// tell.
export function OnlineGame({
  session,
  course,
  slot,
  onLeave,
}: {
  session: Session;
  course: CourseSpec;
  slot: number;
  onLeave: () => void;
}) {
  const seating = useMemo<Seating>(() => () => slot, [slot]);
  const look = slot === 0 ? FROG_LOOKS.p1 : FROG_LOOKS.p2;
  return (
    <GameScreen session={session} music={courseMusic(course)} seating={seating} keyboard="solo" touch>
      <p
        data-testid="playing-as"
        className={cn(
          "pointer-events-none absolute left-4 top-11 text-sm font-bold",
          slot === 0 ? "text-brand-green" : "text-brand-blue",
        )}
      >
        You&apos;re {look.name}
      </p>
      <button
        type="button"
        onClick={onLeave}
        className="absolute right-16 top-4 touch-manipulation rounded-full border-2 border-border-hover bg-surface-secondary/80 px-3 py-1 text-sm font-bold text-text-primary"
      >
        Leave
      </button>
    </GameScreen>
  );
}

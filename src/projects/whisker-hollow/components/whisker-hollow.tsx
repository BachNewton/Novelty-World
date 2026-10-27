"use client";

import { useState } from "react";
import { useProfile } from "@/shared/lib/profile";
import { useHydrated } from "@/shared/lib/use-hydrated";
import { useLook } from "../look";
import { Game } from "./game";
import { LookPicker } from "./look-picker";

export function WhiskerHollow() {
  // The look, the profile and the session all live in the browser.
  const hydrated = useHydrated();
  const { look, setLook } = useLook();
  const playerName = useProfile((profile) => profile.name);
  const [picking, setPicking] = useState(false);
  if (!hydrated) return <div className="fixed inset-0 bg-wh-paper" />;
  return (
    <div className="fixed inset-0 bg-wh-paper">
      {/* A new name rejoins the garden under it. */}
      {look !== null && <Game key={playerName} look={look} paused={picking} onChangeLook={() => setPicking(true)} />}
      {(look === null || picking) && (
        <LookPicker
          initial={look}
          onDone={(next) => {
            setLook(next);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

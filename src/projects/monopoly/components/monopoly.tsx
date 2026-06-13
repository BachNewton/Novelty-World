"use client";

import { useEffect } from "react";
import { useProfile } from "@/shared/lib/profile";
import { useMonopolyDebugKeys } from "../dev";
import { useMonopolyStore } from "../store";
import { MONOPOLY_THEME } from "../theme";
import { Footer } from "./footer";
import { Header } from "./header";
import { Squares } from "./squares";

export function Monopoly() {
  useMonopolyDebugKeys();
  useMonopolyConnection();
  const state = useMonopolyStore((s) => s.state);

  return (
    <div
      className="flex h-[100dvh] w-full flex-col overflow-hidden"
      style={{ ...MONOPOLY_THEME, backgroundColor: "var(--mono-frame)" }}
    >
      <Header state={state} />
      <Squares />
      <Footer state={state} />
    </div>
  );
}

/** Read `?game=<id>` from the URL on mount and connect the store to the
 *  matching Supabase row using the local profile. With no `game` param we
 *  stay local (no DB, no subscription) — the current default for the bare
 *  route, which the future lobby will replace. */
function useMonopolyConnection(): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get("game");
    if (!gameId) return;

    const { id, name } = useProfile.getState();
    void useMonopolyStore.getState().connect({
      gameId,
      profile: { id, name },
    });

    return () => {
      useMonopolyStore.getState().disconnect();
    };
  }, []);
}

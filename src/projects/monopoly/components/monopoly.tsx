"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { useProfile } from "@/shared/lib/profile";
import { useMonopolyDebugKeys } from "../dev";
import { useMonopolyStore } from "../store";
import { MONOPOLY_THEME } from "../theme";
import { AiReviewLayer } from "./ai-review";
import { Footer } from "./footer";
import { Header } from "./header";
import { LobbyBrowser } from "./lobby-browser";
import { SeatRoom } from "./seat-room";
import { Squares } from "./squares";

/** Root of the Monopoly project. The view is driven by the `?game=` URL
 *  param and the connected game's lifecycle:
 *  - no param → the lobby browser (create / join a game).
 *  - `?game=dev` → the backend dev sandbox (debug hotkeys), seeded as an
 *    immediate-play game so it lands straight on the board.
 *  - `?game=<id>` → connect to that row; while it's a `lobby` show the seat
 *    room, otherwise (active / finished) show the board. */
export function Monopoly() {
  useMonopolyDebugKeys();
  const { gameId, mounted, navigate } = useGameId();
  useGameConnection(gameId, mounted);

  const connecting = useMonopolyStore((s) => s.connecting);
  const storeGameId = useMonopolyStore((s) => s.gameId);
  const status = useMonopolyStore((s) => s.state.status);
  const outdated = useMonopolyStore((s) => s.outdated);

  // Avoid a hydration mismatch (and a wrong-screen flash): the URL is only
  // readable after mount, so render the themed frame empty until then.
  if (!mounted) return <Frame />;

  if (gameId === null) {
    return (
      <Frame>
        <LobbyBrowser onOpen={navigate} />
      </Frame>
    );
  }

  // Hold on a spinner until the store has connected to *this* id and the first
  // authoritative state has landed, so the stale default game never shows
  // through.
  if (connecting || storeGameId !== gameId) {
    return (
      <Frame>
        <Connecting />
      </Frame>
    );
  }

  if (outdated) {
    return (
      <Frame>
        <Outdated onExit={() => { navigate(null); }} />
      </Frame>
    );
  }

  if (status === "lobby") {
    return (
      <Frame>
        <SeatRoom gameId={gameId} onExit={() => { navigate(null); }} />
      </Frame>
    );
  }

  return <Board />;
}

/** Themed Monopoly board. Used for the dev sandbox and any active / finished
 *  online game. */
function Board() {
  const state = useMonopolyStore((s) => s.state);
  return (
    <Frame className="flex h-[100dvh] flex-col overflow-hidden">
      <Header state={state} />
      <Squares />
      <Footer state={state} />
      <AiReviewLayer />
    </Frame>
  );
}

function Frame({
  children,
  className = "min-h-[100dvh]",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`w-full ${className}`}
      style={{ ...MONOPOLY_THEME, backgroundColor: "var(--mono-frame)" }}
    >
      {children}
    </div>
  );
}

function Connecting() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center" style={{ color: "var(--mono-rail)" }}>
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
    </div>
  );
}

/** Shown instead of the board for a game written under an older `GameState`
 *  shape, which the engine can't read. */
function Outdated({ onExit }: { onExit: () => void }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-black" style={{ color: "var(--mono-ink)" }}>
        This game uses an outdated version
      </h1>
      <p className="max-w-sm text-sm" style={{ color: "var(--mono-rail)" }}>
        It was saved by an older version of Monopoly and can&apos;t be played any
        more. You can delete it from the game list.
      </p>
      <button
        type="button"
        onClick={onExit}
        className="rounded-lg px-4 py-2 text-sm font-bold transition-opacity hover:opacity-90"
        style={{ backgroundColor: "var(--mono-orange)", color: "var(--mono-frame)" }}
      >
        Back to games
      </button>
    </div>
  );
}

// pushState (used by navigate) doesn't fire popstate, so we dispatch this
// alongside it to notify the useSyncExternalStore subscribers.
const NAV_EVENT = "nw:monopoly-nav";

function subscribeNav(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  window.addEventListener(NAV_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(NAV_EVENT, callback);
  };
}

function readGameParam(): string | null {
  return new URLSearchParams(window.location.search).get("game");
}

const noopSubscribe = () => () => {};

/** The current game id from the `?game=` param, kept in sync with browser
 *  navigation via `useSyncExternalStore` (the URL is the external store).
 *  `navigate` pushes a new history entry and updates the param; passing
 *  `null` returns to the lobby. `mounted` is false during SSR and the first
 *  hydration render — the URL isn't readable then — so the caller can hold a
 *  neutral frame until it's safe to resolve the view. */
function useGameId(): {
  gameId: string | null;
  mounted: boolean;
  navigate: (id: string | null) => void;
} {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const gameId = useSyncExternalStore(subscribeNav, readGameParam, () => null);

  const navigate = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("game", id);
    else url.searchParams.delete("game");
    window.history.pushState(null, "", url);
    window.dispatchEvent(new Event(NAV_EVENT));
  }, []);

  return { gameId, mounted, navigate };
}

/** Drive the store's connection from the resolved game id:
 *  - `null` → the lobby browser; park the store so nothing runs.
 *  - any id (including `dev`) → connect, seeding the row on first open.
 *  The local profile identifies this client's seat. */
function useGameConnection(gameId: string | null, mounted: boolean): void {
  useEffect(() => {
    if (!mounted) return;
    const store = useMonopolyStore.getState();
    if (gameId === null) {
      if (store.gameId !== null) store.disconnect();
      return;
    }
    const { id, name } = useProfile.getState();
    void store.connect({ gameId, profile: { id, name } });
    return () => {
      useMonopolyStore.getState().disconnect();
    };
  }, [gameId, mounted]);
}

"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { Bot, Globe, User, X } from "lucide-react";
import { GameLobby } from "@/shared/components/game-lobby";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { useProfile } from "@/shared/lib/profile";
import type { Move } from "../contract";
import { BOTS } from "./bots";
import type { Response } from "./protocol";
import { browserIo } from "./client";
import { ENGINE } from "./engine";
import { browserWake, createOnlineStore, type OnlineSnapshot, type OnlineStore } from "./store";
import { MAX_PLAYERS, MIN_PLAYERS } from "./table";

/** What the game screen is given: the game as this player sees it, and how to move. */
export interface OnlineGameProps {
  snapshot: OnlineSnapshot;
  act: (move: Move) => void;
}

/** One online game, connected while the component is mounted. */
export function useOnlineGame(id: string): { snapshot: OnlineSnapshot; store: OnlineStore } {
  const [store] = useState(() =>
    createOnlineStore({ id, profile: () => useProfile.getState(), engine: ENGINE, io: browserIo, onWake: browserWake }),
  );
  useEffect(() => store.connect(), [store]);
  const snapshot = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  return { snapshot, store };
}

// pushState doesn't fire popstate, so navigating dispatches this as well.
const NAV_EVENT = "nw:risk-nav";

function subscribeNav(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  window.addEventListener(NAV_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(NAV_EVENT, callback);
  };
}

const readGameParam = () => new URLSearchParams(window.location.search).get("game");

function navigate(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("game", id);
  else url.searchParams.delete("game");
  window.history.pushState(null, "", url);
  window.dispatchEvent(new Event(NAV_EVENT));
}

/**
 * Risk online: create a game or join one by its code, gather the table
 * (people and bots, 3 to 6 seats), start, then play on `Game`. The game's
 * code lives in the URL (`?game=`), so a reload or a shared link comes back
 * to the same table.
 */
export function RiskOnline({ Game }: { Game: ComponentType<OnlineGameProps> }) {
  const gameId = useSyncExternalStore(subscribeNav, readGameParam, () => null);
  const [notice, setNotice] = useState<string | null>(null);

  const enter = useCallback((make: () => Promise<Response>) => {
    make()
      .then((response) => {
        if (response.ok) {
          setNotice(null);
          navigate(response.row.id);
        } else setNotice(response.reason);
      })
      .catch((error: unknown) => {
        console.error(error);
        setNotice("Couldn't reach the server");
      });
  }, []);

  if (gameId) return <Table key={gameId} id={gameId} Game={Game} />;

  return (
    <GameLobby
      icon={<Globe size={32} />}
      title="Risk"
      subtitle="The classic game of world domination, for 3 to 6 players."
      createLabel="New Game"
      onCreate={() => enter(() => browserIo.post({ op: "create", profile: useProfile.getState() }))}
      onJoin={(code) => enter(() => browserIo.post({ op: "join", game: code, profile: useProfile.getState() }))}
      notice={notice}
    />
  );
}

function Table({ id, Game }: { id: string; Game: ComponentType<OnlineGameProps> }) {
  const { snapshot, store } = useOnlineGame(id);
  const { table } = snapshot;

  if (!snapshot.loaded) return <Centered>Finding the game…</Centered>;
  if (!table) {
    return (
      <Centered>
        <p>There&apos;s no game with the code {id}.</p>
        <Button onClick={() => navigate(null)}>Back</Button>
      </Centered>
    );
  }
  if (table.status !== "lobby") return <Game snapshot={snapshot} act={store.act} />;

  const seated = snapshot.seat !== null;
  const full = table.seats.length >= MAX_PLAYERS;
  return (
    <Centered>
      <header className="space-y-1 text-center">
        <p className="text-sm text-text-secondary">Game code</p>
        <p className="font-mono text-4xl font-bold tracking-widest text-brand-orange">{id}</p>
        <p className="text-sm text-text-secondary">Share the code; bots fill the empty seats.</p>
      </header>
      <Card className="w-full max-w-sm space-y-2 p-4">
        <h2 className="font-medium">
          Seats ({table.seats.length.toString()}/{MAX_PLAYERS.toString()})
        </h2>
        <ol className="space-y-2">
          {table.seats.map((controller, seat) => (
            <li key={seat} className="flex items-center gap-3 rounded-md bg-surface-secondary px-3 py-2">
              {controller.kind === "human" ? <User size={18} /> : <Bot size={18} />}
              <span className="flex-1 truncate">
                {controller.kind === "human" ? controller.profile.name : `${BOTS[controller.bot].name} (bot)`}
                {seat === snapshot.seat && <span className="text-text-secondary"> (you)</span>}
              </span>
              {seated && (
                <button aria-label="Remove from the table" className="text-text-secondary hover:text-text-primary" onClick={() => store.removeSeat(seat)}>
                  <X size={18} />
                </button>
              )}
            </li>
          ))}
        </ol>
      </Card>
      <div className="flex flex-wrap justify-center gap-3">
        {!seated && (
          <Button onClick={store.join} disabled={full}>
            Take a seat
          </Button>
        )}
        {seated && (
          <Button variant="ghost" onClick={store.addBot} disabled={full}>
            Add a bot
          </Button>
        )}
        {seated && (
          <Button onClick={store.start} disabled={table.seats.length < MIN_PLAYERS}>
            Start
          </Button>
        )}
      </div>
      {table.seats.length < MIN_PLAYERS && <p className="text-sm text-text-secondary">Risk needs at least {MIN_PLAYERS.toString()} players.</p>}
      {snapshot.notice && <p className="text-sm text-brand-pink">{snapshot.notice}</p>}
      <Button variant="ghost" onClick={() => navigate(null)}>
        Leave
      </Button>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">{children}</div>;
}

"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { Bot, Globe, User, X } from "lucide-react";
import { GameLobby } from "@/shared/components/game-lobby";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { useProfile } from "@/shared/lib/profile";
import { useRoomList, type RoomList } from "@/shared/lib/room-list";
import type { Move } from "../contract";
import { SEAT_BOTS } from "./seat-bots";
import type { Response } from "./protocol";
import { browserIo } from "./client";
import { ENGINE } from "../play-engine";
import { browserWake, createOnlineStore, type OnlineSnapshot, type OnlineStore } from "./store";
import { firstPerson, RISK_LOBBY, tableListing } from "./listing";
import { MAX_PLAYERS, MIN_PLAYERS } from "./table";

/** What the game screen is given: the game as this player sees it, how to move, and how to
 *  leave the table. */
export interface OnlineGameProps {
  snapshot: OnlineSnapshot;
  act: (move: Move) => void;
  onLeave: () => void;
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
 * Risk online: create a table or join one from the live list of open tables,
 * gather it (people and bots, 3 to 6 seats), start, then play on `Game`. The
 * table this page is at lives in the URL (`?game=`, the row's id, never shown),
 * so a reload comes back to it. `actions` go on the lobby beside creating.
 */
export function RiskOnline({ Game, actions }: { Game: ComponentType<OnlineGameProps>; actions?: ReactNode }) {
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
    <Lobby
      onCreate={() => enter(() => browserIo.post({ op: "create", profile: useProfile.getState() }))}
      onJoin={(id) => enter(() => browserIo.post({ op: "join", game: id, profile: useProfile.getState() }))}
      notice={notice}
      actions={actions}
    />
  );
}

interface LobbyProps {
  onCreate: () => void;
  onJoin: (id: string) => void;
  notice: string | null;
  actions?: ReactNode;
}

function Lobby(props: LobbyProps) {
  const tables = useRoomList({ game: RISK_LOBBY, listing: null });
  return <RiskLobby tables={tables} {...props} />;
}

/** The lobby screen, given the open tables. */
export function RiskLobby({ tables, onCreate, onJoin, notice, actions }: LobbyProps & { tables: RoomList }) {
  return (
    <GameLobby
      icon={<Globe size={32} />}
      title="Risk"
      subtitle="The classic game of world domination, for 3 to 6 players."
      createLabel="New Game"
      onCreate={onCreate}
      openRooms={{ list: tables, onJoin }}
      notice={notice}
      actions={actions}
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
        <p>That table is gone.</p>
        <Button onClick={() => navigate(null)}>Back</Button>
      </Centered>
    );
  }
  if (table.status !== "lobby") return <Game snapshot={snapshot} act={store.act} onLeave={() => navigate(null)} />;
  return <Gathering snapshot={snapshot} table={table} store={store} />;
}

/** A table gathering players, listed in the open lobby while this page advertises it. */
function Gathering({ snapshot, table, store }: { snapshot: OnlineSnapshot; table: NonNullable<OnlineSnapshot["table"]>; store: OnlineStore }) {
  const profileId = useProfile((profile) => profile.id);
  useRoomList({ game: RISK_LOBBY, listing: tableListing(table, profileId) });

  const seated = snapshot.seat !== null;
  const full = table.seats.length >= MAX_PLAYERS;
  return (
    <Centered>
      <header className="space-y-1 text-center">
        <h1 className="text-3xl font-bold">{hostName(table)}&apos;s game</h1>
        <p className="text-sm text-text-secondary">Players find it in the open lobby; bots fill the empty seats.</p>
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
                {controller.kind === "human" ? controller.profile.name : `${SEAT_BOTS[controller.bot].name} (bot)`}
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

function hostName(table: NonNullable<OnlineSnapshot["table"]>): string {
  const first = firstPerson(table.seats);
  // The server never leaves a table without a person at it.
  if (!first) throw new Error(`Risk table ${table.id} has no one at it`);
  return first.name;
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">{children}</div>;
}

"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode, type Ref } from "react";
import { Bot, Globe, Plus, User, X } from "lucide-react";
import { GameLobby } from "@/shared/components/game-lobby";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { PadHints } from "@/shared/components/pad-hints";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { useProfile } from "@/shared/lib/profile";
import type { Move } from "../contract";
import { BotBadge, BotStepper } from "./bot-picker";
import { DEFAULT_BOT, seatBot, type BotId } from "./seat-bots";
import type { Response } from "./protocol";
import { browserIo, browserLobbyIo } from "./client";
import type { OpenAction, TableSummary } from "./lobby";
import { DeleteConfirm, TableList, useLobbyTables } from "./lobby-list";
import { ENGINE } from "../play-engine";
import { browserWake, createOnlineStore, type OnlineSnapshot, type OnlineStore } from "./store";
import { firstPerson, MAX_PLAYERS, MIN_PLAYERS } from "./table";

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
 * Risk online: the lobby lists every game, live. Create a table or tap one to
 * take a seat, come back to your own or watch; gather the table (people and
 * bots, 3 to 6 seats), start, then play on `Game`. The game this page is at
 * lives in the URL (`?game=`, the row's id, never shown), so a reload comes
 * back to it. `actions` go on the lobby beside creating.
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
      onOpen={(table, action) => {
        if (action === "join") enter(() => browserIo.post({ op: "join", game: table.id, profile: useProfile.getState() }));
        else navigate(table.id);
      }}
      notice={notice}
      actions={actions}
    />
  );
}

interface LobbyProps {
  onCreate: () => void;
  onOpen: (table: TableSummary, action: OpenAction) => void;
  notice: string | null;
  actions?: ReactNode;
}

function Lobby({ onCreate, onOpen, notice, actions }: LobbyProps) {
  const { tables, problem } = useLobbyTables(browserLobbyIo);
  const [deleting, setDeleting] = useState<TableSummary | null>(null);

  if (deleting) {
    const remove = async () => {
      const response = await browserIo.post({ op: "delete", game: deleting.id });
      if (!response.ok) return response.reason;
      setDeleting(null);
      return null;
    };
    return <DeleteConfirm table={deleting} onDelete={remove} onCancel={() => setDeleting(null)} />;
  }

  return (
    <GameLobby
      icon={<Globe size={32} />}
      title="Risk"
      subtitle="The classic game of world domination, for 3 to 6 players."
      createLabel="New Game"
      onCreate={onCreate}
      notice={notice}
      actions={actions}
    >
      <TableList tables={tables} problem={problem} onOpen={onOpen} onDelete={setDeleting} />
    </GameLobby>
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

/** A table gathering players. Its seated players add bots, each of a chosen rank, and change
 *  a bot seat's rank until the game starts. */
function Gathering({ snapshot, table, store }: { snapshot: OnlineSnapshot; table: NonNullable<OnlineSnapshot["table"]>; store: OnlineStore }) {
  const root = useRef<HTMLDivElement>(null);
  usePadNavigation(root);
  const [nextBot, setNextBot] = useState<BotId>(DEFAULT_BOT);
  const seated = snapshot.seat !== null;
  const full = table.seats.length >= MAX_PLAYERS;
  return (
    <Centered ref={root}>
      <header className="space-y-1 text-center">
        <h1 className="text-3xl font-bold">{hostName(table)}&apos;s game</h1>
        <p className="text-sm text-text-secondary">Others find it in the lobby; bots fill the empty seats.</p>
      </header>
      <Card className="w-full max-w-sm space-y-2 p-4">
        <h2 className="font-medium">
          Seats ({table.seats.length.toString()}/{MAX_PLAYERS.toString()})
        </h2>
        <ol className="space-y-2">
          {table.seats.map((controller, seat) => (
            <li key={seat} className="flex min-h-11 items-center gap-2 rounded-md bg-surface-secondary px-3 py-1">
              {controller.kind === "human" ? (
                <>
                  <User aria-hidden size={18} className="shrink-0" />
                  <span className="flex-1 truncate">
                    {controller.profile.name}
                    {seat === snapshot.seat && <span className="text-text-secondary"> (you)</span>}
                  </span>
                </>
              ) : (
                <>
                  <Bot aria-label="Bot" size={18} className="shrink-0" />
                  <span className="flex min-w-0 flex-1">
                    {seated ? (
                      <BotStepper bot={controller.bot} onChange={(bot) => store.setBot(seat, bot)}>
                        <BotBadge bot={controller.bot} />
                      </BotStepper>
                    ) : (
                      <BotBadge bot={controller.bot} />
                    )}
                  </span>
                </>
              )}
              {seated && (
                <button aria-label="Remove from the table" title="Remove from the table" className="flex size-11 shrink-0 items-center justify-center text-text-secondary hover:text-text-primary" onClick={() => store.removeSeat(seat)}>
                  <X aria-hidden size={18} />
                </button>
              )}
            </li>
          ))}
        </ol>
        {seated && !full && (
          <div className="flex justify-center">
            <BotStepper bot={nextBot} onChange={setNextBot}>
              <Button variant="ghost" aria-label={`Add a ${seatBot(nextBot).rank} bot`} title="Add a bot" onClick={() => store.addBot(nextBot)} className="min-w-0 gap-2" data-pad-start>
                <Plus aria-hidden size={18} className="shrink-0" />
                <Bot aria-hidden size={18} className="shrink-0" />
                <BotBadge bot={nextBot} />
              </Button>
            </BotStepper>
          </div>
        )}
      </Card>
      <div className="flex flex-wrap justify-center gap-3">
        {!seated && (
          <Button onClick={store.join} disabled={full}>
            Take a seat
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
      <Button variant="ghost" onClick={() => navigate(null)} data-pad-back>
        Leave
      </Button>
      <PadHints
        hints={[
          ["A", "Select"],
          ["B", "Leave"],
        ]}
      />
    </Centered>
  );
}

function hostName(table: NonNullable<OnlineSnapshot["table"]>): string {
  const first = firstPerson(table.seats);
  // The server never leaves a table without a person at it.
  if (!first) throw new Error(`Risk table ${table.id} has no one at it`);
  return first.name;
}

function Centered({ children, ref }: { children: ReactNode; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      {children}
    </div>
  );
}

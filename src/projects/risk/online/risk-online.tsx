"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode, type Ref } from "react";
import { Bot, Globe, Plus, Trophy, User, X } from "lucide-react";
import { GameLobby } from "@/shared/components/game-lobby";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { PadHints } from "@/shared/components/pad-hints";
import { usePadNavigation } from "@/shared/lib/gamepad";
import { useProfile } from "@/shared/lib/profile";
import { useHydrated } from "@/shared/lib/use-hydrated";
import { cn } from "@/shared/lib/utils";
import type { Move } from "../contract";
import { currentElo, useEloLedger } from "./player-elo";
import { seatElo } from "./rating";
import { BotBadge, BotPicker } from "./bot-picker";
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
    createOnlineStore({ id, profile: () => useProfile.getState(), elo: currentElo, engine: ENGINE, io: browserIo, onWake: browserWake }),
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
      onCreate={() => enter(() => browserIo.post({ op: "create", profile: useProfile.getState(), elo: currentElo() }))}
      onOpen={(table, action) => {
        if (action === "join") enter(() => browserIo.post({ op: "join", game: table.id, profile: useProfile.getState(), elo: currentElo() }));
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
      subtitle="The classic game of world domination"
      createLabel="New Game"
      onCreate={onCreate}
      notice={notice}
      actions={actions}
    >
      <YourElo />
      <TableList tables={tables} problem={problem} onOpen={onOpen} onDelete={setDeleting} />
    </GameLobby>
  );
}

/** An Elo as the lobby shows one, a person's or a bot's: the number, with what it is on hover. */
function EloFigure({ elo, whose }: { elo: number; whose: string }) {
  const label = `${whose} Elo ${Math.round(elo).toString()} (Greedy is 1000)`;
  return (
    <span role="img" aria-label={label} title={label} className="shrink-0 text-xs tabular-nums text-text-secondary">
      {Math.round(elo)}
    </span>
  );
}

/** This device's player, by name, with their Elo on the bots' scale. */
function YourElo() {
  const name = useProfile((profile) => profile.name);
  const { elo } = useEloLedger();
  const hydrated = useHydrated();
  return (
    <p className={cn("flex items-center gap-2 rounded-md border border-border-default bg-surface-secondary px-3 py-2", !hydrated && "invisible")} data-testid="risk-your-elo">
      <User aria-hidden size={18} className="shrink-0 text-brand-orange" />
      <span className="max-w-48 truncate font-medium">{name}</span>
      <Trophy aria-hidden size={16} className="shrink-0 text-text-secondary" />
      <EloFigure elo={elo} whose="Your" />
    </p>
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

/** A table gathering players. Its seated players add bots, each picked from every seatable bot,
 *  and remove seats until the game starts; a bot once seated stays the bot it is. */
function Gathering({ snapshot, table, store }: { snapshot: OnlineSnapshot; table: NonNullable<OnlineSnapshot["table"]>; store: OnlineStore }) {
  const root = useRef<HTMLDivElement>(null);
  usePadNavigation(root);
  const [picking, setPicking] = useState(false);
  const seated = snapshot.seat !== null;
  const full = table.seats.length >= MAX_PLAYERS;
  if (picking) {
    return (
      <BotPicker
        onPick={(bot) => {
          store.addBot(bot);
          setPicking(false);
        }}
        onCancel={() => setPicking(false)}
      />
    );
  }
  return (
    <Centered ref={root}>
      <header className="space-y-1 text-center">
        <h1 className="text-3xl font-bold">{hostName(table)}&apos;s game</h1>
        <p className="text-sm text-text-secondary">Others find it in the lobby; bots fill the empty seats.</p>
      </header>
      <Card className="w-full max-w-md space-y-2 p-3 sm:p-4">
        <h2 className="font-medium">
          Seats ({table.seats.length.toString()}/{MAX_PLAYERS.toString()})
        </h2>
        <ol className="space-y-2">
          {table.seats.map((controller, seat) => (
            <li key={seat} className="flex min-h-11 items-center gap-2 rounded-md bg-surface-secondary px-2 py-1 sm:px-3">
              {controller.kind === "human" ? (
                <>
                  <User aria-hidden size={18} className="shrink-0" />
                  <span className="flex-1 truncate">
                    {controller.profile.name}
                    {seat === snapshot.seat && <span className="text-text-secondary"> (you)</span>}
                  </span>
                  <EloFigure elo={seatElo(controller)} whose={seat === snapshot.seat ? "Your" : `${controller.profile.name}'s`} />
                </>
              ) : (
                <>
                  <Bot aria-label="Bot" size={18} className="shrink-0" />
                  <span className="flex min-w-0 flex-1">
                    <BotBadge bot={controller.bot} />
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
          <Button variant="ghost" onClick={() => setPicking(true)} className="w-full gap-2" data-pad-start>
            <Plus aria-hidden size={18} />
            <Bot aria-hidden size={18} />
            Add a bot
          </Button>
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

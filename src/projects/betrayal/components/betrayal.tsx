"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Action, GameState } from "../types";
import { ENGINE, viewFor } from "../game";
import { apply } from "../engine/step-loop";
import type { GameView } from "../engine/view";
import { decodeGame, replay, type SharedGame } from "../share";
import { logLines, seatLabel, type LogLine } from "./describe";
import { ErrorBox } from "./error-box";
import { EventLog } from "./event-log";
import { boardFocus } from "./focus";
import { House } from "./house";
import { errorText, PendingPanel } from "./pending-panel";
import { SharePanel } from "./share-panel";
import { HauntText, SidePanel } from "./side-panel";
import { StartForm } from "./start-form";
import { BETRAYAL_THEME } from "./theme";

/** Whose view: a seat, or a spectator (null). */
type Viewer = number | null;

/** A game in this browser: how it started, what has been played, and where
 *  it is now. The page renders one seat's view, never the state (outside
 *  the full-state toggle), so it keeps every seat's view of the latest
 *  state, a spectator's last, and a log for each, worded from that seat's
 *  own view of every write. */
interface Session {
  game: SharedGame["game"];
  actions: Action[];
  state: GameState;
  views: GameView[];
  logs: LogLine[][];
}

/** A rejected answer is the engine saying no; a thrown error is a bug or missing behaviour. */
type Problem = { kind: "rejected" | "error"; message: string };

const ArtBench = dynamic(() => import("../art/bench-view").then((m) => m.ArtBench), { ssr: false });

function subscribeToNothing(): () => void {
  return () => undefined;
}

/** `?bench=<room-id>` opens the art bench instead of the game, and
 *  `?game=<code>` opens a shared game. The server render has no URL, so it
 *  renders nothing and the page picks after hydrating. */
export function Betrayal() {
  const search = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.search,
    () => null,
  );
  if (search === null) return null;
  const params = new URLSearchParams(search);
  const bench = params.get("bench");
  return bench ? <ArtBench room={bench} /> : <DebugGame code={params.get("game")} />;
}

function viewsOf(state: GameState): GameView[] {
  return [...state.seats.map((_seat, i) => viewFor(state, i)), viewFor(state, null)];
}

/** Where a viewer's view and log are kept in a session. */
function slot(state: GameState, viewer: Viewer): number {
  return viewer ?? state.seats.length;
}

/** Each viewer's log, with one more write's lines. */
function withWrite(logs: LogLine[][], views: GameView[]): LogLine[][] {
  return views.map((view, i) => [...(logs.at(i) ?? []), ...logLines(ENGINE, view)]);
}

/** The seats the game is waiting on, any of whom the tester may be; with
 *  nothing pending, any seat or a spectator. */
function viewers(state: GameState): Viewer[] {
  const pending = state.pending;
  if (pending?.type === "ready") return pending.seats;
  if (pending?.type === "decision")
    return pending.seats.filter((seat) => !(seat in pending.answers));
  return [...state.seats.map((_seat, i) => i), null];
}

/** Rebuilds a shared game by replaying it. */
function open(shared: SharedGame): Session {
  const states = replay(ENGINE, shared, crypto.randomUUID());
  let logs: LogLine[][] = [];
  let views: GameView[] = [];
  for (const state of states) {
    views = viewsOf(state);
    logs = withWrite(logs, views);
  }
  return {
    game: shared.game,
    actions: shared.actions,
    state: states[states.length - 1],
    views,
    logs,
  };
}

/** A pasted code may be the whole link. */
function codeIn(text: string): string {
  const trimmed = text.trim();
  return URL.canParse(trimmed)
    ? (new URL(trimmed).searchParams.get("game") ?? trimmed)
    : trimmed;
}

function attempt(run: () => Session): { session: Session | null; problem: Problem | null } {
  try {
    return { session: run(), problem: null };
  } catch (error) {
    return { session: null, problem: { kind: "error", message: errorText(error) } };
  }
}

/** The playtesting view: every seat played in this one browser, no server. */
function DebugGame({ code }: { code: string | null }) {
  const [start] = useState(() =>
    code === null ? { session: null, problem: null } : attempt(() => open(decodeGame(code))),
  );
  const [session, setSession] = useState<Session | null>(start.session);
  const [problem, setProblem] = useState<Problem | null>(start.problem);
  const [lastGame, setLastGame] = useState<SharedGame["game"] | null>(null);

  const begin = (shared: SharedGame) => {
    const result = attempt(() => open(shared));
    setSession(result.session);
    setProblem(result.problem);
  };

  const act = (action: Action) => {
    if (!session) return;
    try {
      const result = apply(ENGINE, session.state, action);
      if (!result.ok) {
        setProblem({ kind: "rejected", message: result.reason });
        return;
      }
      const views = viewsOf(result.state);
      setSession({
        ...session,
        actions: [...session.actions, action],
        state: result.state,
        views,
        logs: withWrite(session.logs, views),
      });
      setProblem(null);
    } catch (error) {
      setProblem({ kind: "error", message: errorText(error) });
    }
  };

  return (
    <div
      style={BETRAYAL_THEME}
      className="min-h-screen bg-(--bt-bg) p-4 text-(--bt-ink)"
    >
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Betrayal</h1>
        <span className="rounded border border-(--bt-danger) px-2 text-xs font-semibold tracking-wide text-(--bt-danger) uppercase">
          Playtesting view: hot-seat, no server
        </span>
        {session && (
          <button
            type="button"
            className="ml-auto rounded border border-(--bt-line) px-3 py-1 text-sm"
            onClick={() => {
              setLastGame(session.game);
              setSession(null);
              setProblem(null);
            }}
          >
            New game
          </button>
        )}
      </header>

      {!session ? (
        <StartForm
          engine={ENGINE}
          error={problem?.message ?? null}
          initial={lastGame}
          onStart={(game) => {
            begin({ game, actions: [] });
          }}
          onOpen={(text) => {
            const result = attempt(() => open(decodeGame(codeIn(text))));
            setSession(result.session);
            setProblem(result.problem);
          }}
        />
      ) : (
        <PlayView
          session={session}
          problem={problem}
          onAction={act}
          onRestart={() => {
            begin({ game: session.game, actions: [] });
          }}
        />
      )}
    </div>
  );
}

/** One seat's view of the game: the seat being waited on, or, when a
 *  question is put to several at once, whichever of them the tester picks. */
function PlayView({
  session,
  problem,
  onAction,
  onRestart,
}: {
  session: Session;
  problem: Problem | null;
  onAction: (action: Action) => void;
  onRestart: () => void;
}) {
  const { state } = session;
  const [picked, setPicked] = useState<Viewer>(null);
  const [fullState, setFullState] = useState(false);
  const choosable = viewers(state);
  const viewer = choosable.includes(picked) ? picked : choosable[0];
  const view = session.views[slot(state, viewer)];
  const log = session.logs[slot(state, viewer)];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-(--bt-muted)">Viewing as</span>
        {choosable.map((seat) => (
          <button
            key={seat ?? "spectator"}
            type="button"
            aria-pressed={seat === viewer}
            className={`rounded border px-2 py-0.5 ${seat === viewer ? "border-(--bt-accent) bg-(--bt-focus)" : "border-(--bt-line)"}`}
            onClick={() => {
              setPicked(seat);
            }}
          >
            {seat === null ? "Spectator" : seatLabel(view, seat)}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-(--bt-muted)">
          <input
            type="checkbox"
            checked={fullState}
            onChange={(e) => {
              setFullState(e.target.checked);
            }}
          />
          Show full state (debug)
        </label>
      </div>
      {fullState && (
        <Panel title="Full state: everything, secrets included">
          <pre className="max-h-[32rem] overflow-auto text-xs">
            {JSON.stringify(state, null, 1)}
          </pre>
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Pending">
            {problem && (
              <div className="mb-2">
                <p className="text-sm font-semibold text-(--bt-danger)">
                  {problem.kind === "rejected"
                    ? "Rejected by the engine"
                    : "Engine error (state unchanged)"}
                </p>
                <ErrorBox message={problem.message} />
              </div>
            )}
            <PendingPanel engine={ENGINE} view={view} onAction={onAction} />
          </Panel>
          <Panel title="House">
            <House
              engine={ENGINE}
              view={view}
              focus={boardFocus(view)}
              onAction={onAction}
            />
          </Panel>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Log">
            <EventLog engine={ENGINE} view={view} lines={log} />
          </Panel>
          {view.haunt && (
            <Panel title="Your haunt">
              <HauntText view={view} />
            </Panel>
          )}
          <Panel title="Explorers">
            <SidePanel engine={ENGINE} view={view} />
          </Panel>
          <Panel title="Share and replay">
            <SharePanel
              game={session.game}
              actions={session.actions}
              onRestart={onRestart}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded border border-(--bt-line) bg-(--bt-panel) p-3">
      <h2 className="mb-2 text-sm font-semibold tracking-wide text-(--bt-muted) uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

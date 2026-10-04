"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Action, GameState } from "../types";
import { ENGINE } from "../game";
import { apply } from "../engine/step-loop";
import { decodeGame, replay, type SharedGame } from "../share";
import { logLines, type LogLine } from "./describe";
import { ErrorBox } from "./error-box";
import { EventLog } from "./event-log";
import { boardFocus, type Offer } from "./focus";
import { House } from "./house";
import { errorText, offersFor, PendingPanel } from "./pending-panel";
import { SharePanel } from "./share-panel";
import { SidePanel } from "./side-panel";
import { StartForm } from "./start-form";
import { BETRAYAL_THEME } from "./theme";

/** A game in this browser: how it started, what has been played, and where it is now. */
interface Session {
  game: SharedGame["game"];
  actions: Action[];
  state: GameState;
  log: LogLine[];
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

/** Rebuilds a shared game by replaying it. */
function open(shared: SharedGame): Session {
  const states = replay(ENGINE, shared, crypto.randomUUID());
  return {
    game: shared.game,
    actions: shared.actions,
    state: states[states.length - 1],
    log: states.flatMap((state) => logLines(ENGINE, state)),
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
      setSession({
        ...session,
        actions: [...session.actions, action],
        state: result.state,
        log: [...session.log, ...logLines(ENGINE, result.state)],
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
        <GameView
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

function GameView({
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
  const offers = useMemo(() => offersFor(ENGINE, state), [state]);
  const focus = boardFocus(
    state,
    offers.find((o): o is Offer => o.choices !== null) ?? null,
  );
  return (
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
          <PendingPanel
            engine={ENGINE}
            state={state}
            offers={offers}
            onAction={onAction}
          />
        </Panel>
        <Panel title="House">
          <House engine={ENGINE} state={state} focus={focus} onAction={onAction} />
        </Panel>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Panel title="Log">
          <EventLog engine={ENGINE} state={state} lines={session.log} />
        </Panel>
        <Panel title="Explorers">
          <SidePanel engine={ENGINE} state={state} />
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

"use client";

import { useState, type ReactNode } from "react";
import type { Action, GameState } from "../types";
import { ENGINE } from "../game";
import { newGame, type NewGame } from "../engine/exploration";
import { apply } from "../engine/step-loop";
import { logLines, type LogLine } from "./describe";
import { ErrorBox } from "./error-box";
import { EventLog } from "./event-log";
import { House } from "./house";
import { errorText, PendingPanel } from "./pending-panel";
import { SidePanel } from "./side-panel";
import { StartForm } from "./start-form";
import { BETRAYAL_THEME } from "./theme";

interface Session {
  state: GameState;
  log: LogLine[];
}

/** A rejected answer is the engine saying no; a thrown error is a bug or missing behaviour. */
type Problem = { kind: "rejected" | "error"; message: string };

function today(): NewGame["today"] {
  const now = new Date();
  return { month: now.getMonth() + 1, day: now.getDate() };
}

/** Milestone 2's debug view: every seat played in this one browser, no server. */
export function Betrayal() {
  const [session, setSession] = useState<Session | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  const start = (seats: NewGame["seats"]) => {
    try {
      const state = newGame(ENGINE, {
        gameId: crypto.randomUUID(),
        seed: crypto.randomUUID(),
        sets: ["base"],
        seats,
        today: today(),
      });
      setSession({ state, log: logLines(ENGINE, state) });
      setProblem(null);
    } catch (error) {
      setProblem({ kind: "error", message: errorText(error) });
    }
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
          Debug view: hot-seat, no server
        </span>
        {session && (
          <button
            type="button"
            className="ml-auto rounded border border-(--bt-line) px-3 py-1 text-sm"
            onClick={() => {
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
          onStart={start}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
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
                state={session.state}
                onAction={act}
              />
            </Panel>
            <Panel title="House">
              <House engine={ENGINE} state={session.state} />
            </Panel>
            <Panel title="Log">
              <EventLog engine={ENGINE} lines={session.log} />
            </Panel>
          </div>
          <Panel title="Explorers">
            <SidePanel engine={ENGINE} state={session.state} />
          </Panel>
        </div>
      )}
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

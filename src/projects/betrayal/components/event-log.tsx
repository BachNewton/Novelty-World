"use client";

import { useEffect, useRef } from "react";
import type { GameState } from "../types";
import type { Engine } from "../engine/step-loop";
import { describeRule } from "../engine/describe";
import { logGroups, type LogLine } from "./describe";
import { SEAT_BG } from "./theme";
import { Why } from "./why";

export function EventLog({
  engine,
  state,
  lines,
}: {
  engine: Engine;
  state: GameState;
  lines: LogLine[];
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [lines.length]);

  return (
    <div ref={list} className="max-h-[32rem] overflow-y-auto text-sm">
      {logGroups(engine, state, lines).map((group) => (
        <section key={group.key} className="mb-2">
          <h3 className="sticky top-0 flex items-center gap-1.5 bg-(--bt-panel) py-0.5 text-xs font-semibold tracking-wide text-(--bt-muted) uppercase">
            {group.seat !== null && (
              <span className={`inline-block size-2.5 rounded-full ${SEAT_BG[group.seat]}`} />
            )}
            {group.title}
          </h3>
          <ol>
            {group.lines.map(({ event, text }) => (
              <li
                key={event.id}
                className="border-b border-(--bt-line) py-0.5 break-words"
              >
                {text}
                <span className="text-xs text-(--bt-muted)">
                  {" "}
                  [{describeRule(engine, event.rule)}]
                </span>
                <Why engine={engine} rule={event.rule} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

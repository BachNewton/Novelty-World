"use client";

import { useEffect, useRef } from "react";
import type { Engine } from "../engine/step-loop";
import { describeRule, type LogLine } from "./describe";

export function EventLog({
  engine,
  lines,
}: {
  engine: Engine;
  lines: LogLine[];
}) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [lines.length]);

  return (
    <ol ref={list} className="max-h-96 overflow-y-auto font-mono text-xs">
      {/* The log only grows, so a line's position is a stable key. Event ids
          repeat when several seats answer one shared decision. */}
      {lines.map(({ event, text }, index) => (
        <li
          key={index}
          className="border-b border-(--bt-line) py-0.5 break-words"
        >
          <span className="text-(--bt-muted)">{event.id} </span>
          <span className="font-semibold text-(--bt-accent)">{event.type}</span>
          {text && <span> {text}</span>}
          <span className="text-(--bt-muted)">
            {" "}
            [{describeRule(engine, event.rule)}]
          </span>
        </li>
      ))}
    </ol>
  );
}

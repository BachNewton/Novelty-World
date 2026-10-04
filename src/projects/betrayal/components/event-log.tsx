"use client";

import { useEffect, useRef } from "react";
import type { Engine } from "../engine/step-loop";
import { describeRule } from "../engine/describe";
import type { LogLine } from "./describe";

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
    <ol ref={list} className="max-h-96 overflow-y-auto text-sm">
      {lines.map(({ event, text }) => (
        <li
          key={event.id}
          className="border-b border-(--bt-line) py-0.5 break-words"
        >
          {text}
          <span className="text-xs text-(--bt-muted)">
            {" "}
            [{describeRule(engine, event.rule)}]
          </span>
        </li>
      ))}
    </ol>
  );
}

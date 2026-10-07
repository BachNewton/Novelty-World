"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PLAYER_COLOR_VAR } from "../theme";
import type { Player } from "../types";
import { PlayerTag } from "./trade-ui";

/** A player's public note beside their name: a trade's pitch, the note a party
 *  approved with, an auction bidder's note. A long one is cut to a few lines
 *  with a control to read it all, so it can't push the terms, the bids or the
 *  buttons off a phone's screen. `action` is a control at the end of the name
 *  row: an AI decision's reveal button, to review and flag it from here. */
export function PartyNote({
  label,
  player,
  text,
  action,
}: {
  label: string;
  player: Player;
  text: string;
  action?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const quoteRef = useRef<HTMLQuoteElement>(null);

  // Whether the clamp cuts anything depends on the rendered width, so it is
  // measured, and again on every resize (rotation, a wider window).
  useLayoutEffect(() => {
    const quote = quoteRef.current;
    if (!quote || expanded) return;
    const observer = new ResizeObserver(() => {
      setClipped(quote.scrollHeight > quote.clientHeight);
    });
    observer.observe(quote);
    return () => {
      observer.disconnect();
    };
  }, [expanded]);

  return (
    <figure
      className="flex min-w-0 flex-col rounded-sm pt-1 pr-1 pb-2 pl-3"
      style={{
        backgroundColor: "var(--mono-board)",
        boxShadow: `inset 3px 0 0 ${PLAYER_COLOR_VAR[player.color]}`,
      }}
    >
      <figcaption className="flex min-h-11 min-w-0 items-center gap-1.5 text-sm">
        <span
          className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--mono-orange)" }}
        >
          {label}
        </span>
        <PlayerTag player={player} />
        {(clipped || expanded) && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => {
              setExpanded((open) => !open);
            }}
            className="ml-auto min-h-11 shrink-0 px-3 font-semibold uppercase tracking-wide underline underline-offset-2"
            style={{ color: "var(--mono-ink)", fontSize: "0.75rem" }}
          >
            {expanded ? "Less" : "Read all"}
          </button>
        )}
        {action !== undefined && <span className={clipped || expanded ? "shrink-0" : "ml-auto shrink-0"}>{action}</span>}
      </figcaption>
      <blockquote
        ref={quoteRef}
        className={`pr-2 text-sm italic leading-snug [overflow-wrap:anywhere] ${expanded ? "" : "line-clamp-4"}`}
      >
        “{text}”
      </blockquote>
    </figure>
  );
}

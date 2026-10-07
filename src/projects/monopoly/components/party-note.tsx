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

/** Where several notes stack (a multi-party trade, an auction with several AI
 *  bidders): a section that scrolls on its own, so the terms, the bids and the
 *  buttons never move out of view. Its cap fits one clamped note with room for
 *  the next to peek in under a fade, which shows there is more below. */
export function NoteStack({ label, children }: { label: string; children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [moreBelow, setMoreBelow] = useState(false);

  // Re-measured when the box or its notes resize (a note added, "Read all")
  // and on every scroll.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const measure = () => {
      setOverflows(scroller.scrollHeight > scroller.clientHeight);
      setMoreBelow(scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(content);
    scroller.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", measure);
    };
  }, []);

  return (
    <div className="relative min-w-0 shrink-0">
      <div
        ref={scrollRef}
        role="region"
        aria-label={label}
        tabIndex={overflows ? 0 : undefined}
        className="max-h-44 overflow-y-auto overscroll-y-contain rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <div ref={contentRef} className="flex flex-col gap-1.5">
          {children}
        </div>
      </div>
      {moreBelow && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-6"
          style={{ background: "linear-gradient(to bottom, transparent, var(--mono-card))" }}
        />
      )}
    </div>
  );
}

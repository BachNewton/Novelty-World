"use client";

import { useEffect, useRef, useState } from "react";
import { seatName, type GameView } from "../../engine/view";
import type { InputKind } from "../../input/controls";
import type { Action, HauntHalf } from "../../types";
import { Prompt } from "../prompts";
import { enterLayer } from "./pad-focus";

/*
 * The haunt's reveal, in the status box: the haunt, who the traitor is,
 * marked in the traitor's red, and who should look at the screen now. In
 * hot-seat each seat reads its own half while the others look away (there is
 * no hiding mechanism in v1, only the prompt naming who looks), then says it
 * is ready, and the device goes to the next seat to read.
 */

/** Who looks now, and who looks away, in as few words as work. */
export function revealPrompt(view: GameView, holder: number): string {
  const traitors = view.seats.flatMap((seat, i) => (seat.side === "traitor" && !seat.hidden ? [i] : []));
  const me = view.seats[holder];
  if (me.side === "traitor") return "you're the traitor. Everyone else, look away.";
  if (me.side === "heroes" && traitors.length > 0) return `heroes read; ${traitors.map((seat) => seatName(view, seat)).join(" and ")}, look away.`;
  return "your half. Everyone else, look away.";
}

export function RevealNow({ view, holder, act, input }: { view: GameView; holder: number; act: (action: Action) => void; input: InputKind }) {
  const [reading, setReading] = useState<HauntHalf | null>(null);
  const pending = view.pending;
  const haunt = view.haunt;
  if (pending?.type !== "ready" || haunt === null) throw new Error("The reveal shows only while the haunt's ready wait is pending");
  const traitors = view.seats.flatMap((seat, i) => (seat.side === "traitor" && !seat.hidden ? [i] : []));
  const secret = view.seats.some((seat) => seat.secret);
  const halves = [haunt.halves.traitor, haunt.halves.heroes].filter((half) => half !== undefined);

  return (
    <div aria-label="The haunt begins" className="flex flex-col gap-2">
      <p className="text-lg font-semibold">
        <span className="text-(--bt-mood-danger)">Haunt {haunt.number}</span>
        {haunt.name !== null && ` · ${haunt.name}`}
      </p>
      {traitors.length > 0 && (
        <p data-traitor className="flex items-center gap-2 rounded border border-(--bt-mood-danger) px-2 py-1 text-sm">
          <span aria-hidden className="inline-block size-2.5 rounded-full bg-(--bt-mood-danger)" />
          <span>
            <span className="font-semibold text-(--bt-mood-danger)">{traitors.map((seat) => seatName(view, seat)).join(" and ")}</span>: traitor
          </span>
        </p>
      )}
      {secret && <p className="text-sm text-(--bt-muted)">The traitor is secret.</p>}
      <p className="text-base">
        <span className="font-semibold">{seatName(view, holder)}</span>: {revealPrompt(view, holder)}
      </p>
      <div className="flex flex-wrap gap-2">
        {halves.map((half) => (
          <button
            key={half.title}
            type="button"
            onClick={() => {
              setReading(half);
            }}
            className="min-h-11 rounded border border-(--bt-line) bg-(--bt-room) px-3 py-1.5 text-sm hover:border-(--bt-accent)"
          >
            {half.title}
          </button>
        ))}
        <button
          type="button"
          data-pad-start
          onClick={() => {
            act({ kind: "ready", wait: pending.id, seat: holder });
          }}
          className="min-h-11 rounded bg-(--bt-accent) px-4 py-1 font-semibold text-(--bt-bg)"
        >
          Ready
        </button>
      </div>
      {reading && (
        <HalfReader
          half={reading}
          input={input}
          onClose={() => {
            setReading(null);
          }}
        />
      )}
    </div>
  );
}

/** One half of the haunt, to read in full over the house: it opens with the
 *  focus on its close button, and a controller's d-pad scrolls its text. */
function HalfReader({ half, onClose, input }: { half: HauntHalf; onClose: () => void; input: InputKind }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) enterLayer(ref.current);
  }, []);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={half.title}
      data-pad-layer="2"
      className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-(--bt-bg)/80 p-3"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded border border-(--bt-mood-danger) bg-(--bt-panel)">
        <div className="flex items-center justify-between gap-2 border-b border-(--bt-line) px-3 py-2">
          <h2 className="text-lg font-semibold">{half.title}</h2>
          <button type="button" data-pad-back onClick={onClose} className="inline-flex min-h-11 items-center gap-1.5 rounded border border-(--bt-line) px-3 hover:border-(--bt-accent)">
            Close
            <Prompt meaning="back" input={input} size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-2 text-sm break-words whitespace-pre-wrap">{half.text}</div>
      </div>
    </div>
  );
}

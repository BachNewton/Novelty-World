"use client";

import { create } from "zustand";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { useMonopolyStore } from "../store";
import type { AiDecisionRef } from "../types";

// Asking a stalled AI seat to try again. The button shows wherever the stall
// does (the AI status bar and the log's Stalled row), so the two share one
// record of what's in flight: a tap on either shows on both, and neither can
// send a second ask for the same failure.

/** One failure a seat is stalled on: its seat and its place in the log. */
function retryKey(seat: string, ref: AiDecisionRef): string {
  return `${seat}:${String(ref.turn)}:${String(ref.index)}`;
}

interface RetryUi {
  /** Failures this client has asked to retry. One that landed stays here: its
   *  failure has cleared, so the button is gone once the board shows that, and
   *  a later failure has a key of its own. */
  pending: ReadonlySet<string>;
  /** Why a retry didn't land, by failure. */
  errors: Readonly<Partial<Record<string, string>>>;
  start: (key: string) => void;
  fail: (key: string, reason: string) => void;
}

const useRetryUi = create<RetryUi>((set) => ({
  pending: new Set(),
  errors: {},
  start: (key) =>
    set((s) => {
      const { [key]: _cleared, ...errors } = s.errors;
      return { pending: new Set(s.pending).add(key), errors };
    }),
  fail: (key, reason) =>
    set((s) => {
      const pending = new Set(s.pending);
      pending.delete(key);
      return { pending, errors: { ...s.errors, [key]: reason } };
    }),
}));

/** "Try again" on a stalled AI seat: a player's call to ask the model again.
 *  Shown only to a seated player, and only on the failure the seat is stalled
 *  on now. */
export function TryAgainButton({ aiName, seat, refTo }: { aiName: string; seat: string; refTo: AiDecisionRef }) {
  const retryAi = useMonopolyStore((s) => s.retryAi);
  const key = retryKey(seat, refTo);
  const pending = useRetryUi((s) => s.pending.has(key));
  const error = useRetryUi((s) => s.errors[key] ?? null);
  const start = useRetryUi((s) => s.start);
  const fail = useRetryUi((s) => s.fail);
  const retry = () => {
    start(key);
    void retryAi(seat, refTo).then((res) => {
      if (!res.ok) fail(key, res.reason);
    });
  };
  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={(e) => {
          // The log toggles its height on a click; this one is ours.
          e.stopPropagation();
          retry();
        }}
        disabled={pending}
        aria-label={`Ask ${aiName} to try again`}
        className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-black transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-70"
        style={{
          backgroundColor: "var(--mono-ink)",
          color: "var(--mono-frame)",
          outlineColor: "var(--mono-ink)",
        }}
      >
        {pending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        )}
        {pending ? "Trying…" : "Try again"}
      </button>
      {error !== null && (
        <span role="alert" className="max-w-40 text-right text-[11px] font-semibold leading-tight" style={{ color: "var(--mono-red)" }}>
          {error}
        </span>
      )}
    </span>
  );
}

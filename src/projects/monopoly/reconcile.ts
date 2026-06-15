import { apply } from "./engine";
import type { GameState, Intent } from "./types";

/** Replay a client's pending local intents on top of an authoritative head to
 *  produce the optimistic display state.
 *
 *  Every local intent is optimistically predicted and then REBASED: re-applied
 *  onto the latest confirmed head until the route confirms it. There is no
 *  per-intent policy — legality on the current head is the single arbiter:
 *
 *  - An intent that still applies is folded in and kept. An armed `set-queue`
 *    re-arms onto whatever boundary the new head presents, so the action-bar
 *    checkbox never flickers off when a roll (or any other write) wins the
 *    version race underneath it. Because `set-queue` carries the desired state
 *    (not a flip), replaying it on a head that already reflects the arm is an
 *    idempotent no-op — never a toggle-off.
 *  - An intent that no longer applies is dropped, and the display falls back to
 *    authoritative truth for it (e.g. a `cancel-trade` whose trade already
 *    closed).
 *
 *  Bids fold in under the same single rule: an absolute `bid` always re-applies
 *  (it just records the bidder's amount), so it is never dropped and never
 *  escalates — it re-records the same number on the rebuilt head. That is why
 *  the auction needs no special-casing here.
 *
 *  Returns the rebuilt display state and the SURVIVING outbox (dropped intents
 *  removed) so the caller can prune what it re-flushes. Pure — no React, no I/O,
 *  no globals. */
export function rebuildOverlay(
  head: GameState,
  outbox: readonly Intent[],
): { state: GameState; outbox: readonly Intent[] } {
  let state = head;
  const kept: Intent[] = [];
  for (const intent of outbox) {
    const res = apply(state, intent);
    if (!res.ok) continue; // no longer applies on this head — drop it
    state = res.state;
    kept.push(intent);
  }
  return { state, outbox: kept };
}

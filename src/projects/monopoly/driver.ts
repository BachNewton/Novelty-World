import type { GameState } from "./types";

/** Which role this client plays in advancing the current turn:
 *
 *  - "self":  the active player IS this client's seated human — drive their
 *             own turn (auto-roll, auto-end), but leave their real decisions
 *             (buy, raise-cash) to the UI.
 *  - "proxy": the active seat is a bot or a disconnected human — drive it on
 *             their behalf, decisions included, via bot policy. Any connected
 *             client may proxy the same seat; the route's version guard
 *             collapses the redundant writes to no-ops.
 *  - "none":  the active seat is another connected human — do nothing and
 *             wait for their client to drive it.
 */
export type DriverRole = "self" | "proxy" | "none";

/** Decide this client's driver role for the current state. Pure: it reads
 *  only the authoritative state and this client's seat id — no presence, no
 *  timers, no globals. That's the whole point of the "any client may drive a
 *  bot, the CAS dedupes" model: each client can reach the same decision from
 *  state alone.
 *
 *  Every game runs on the authoritative route (there is no local mode); the
 *  `dev` sandbox is just a single human + bots, so it naturally resolves to
 *  "self" for the lone human and "proxy" for the bots, with no "none". */
export function driverRole(
  state: GameState,
  myPlayerId: string | null,
): DriverRole {
  const activeId = state.turn.playerId;
  const active = state.players.find((p) => p.id === activeId);
  if (!active) return "none";

  // A bot seat may be proxied by anyone; a human seat is owned by exactly one
  // client (or, if they're offline, nobody — the turn waits).
  if (active.botStrategy !== null) return "proxy";
  return activeId === myPlayerId ? "self" : "none";
}

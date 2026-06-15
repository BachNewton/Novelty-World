import type { PlayerProfile } from "@/shared/lib/profile";
import type {
  GameState,
  Intent,
  PlayerColor,
  PlayerCount,
  PlayerIcon,
} from "./types";

/** A debug-only state override, accepted by the route ONLY for the reserved
 *  `dev` game id (any other id ignores it). Drives the dev hotkeys:
 *  - `restart` — reseed a fresh immediate-play game with N players.
 *  - `own-all` — hand every ownable square to the first player.
 *  - `random-own` — randomly assign every ownable square (derived from the
 *    game's `rngState`, never `Math.random`). */
export type DevCommand =
  | { kind: "restart"; players: PlayerCount }
  | { kind: "own-all" }
  | { kind: "random-own" };

/** Transport contract between the client store and the authoritative
 *  `/api/monopoly` route. Types only — shared by both sides so the request
 *  and response shapes can't drift. The route is the single writer; clients
 *  POST one of these actions and read the authoritative result.
 *
 *  Two families of action share the version-guarded write path:
 *  - **Lobby ops** (`join` … `start`) mutate a `lobby`-status game via the
 *    pure helpers in `lobby.ts` before play begins.
 *  - **Play ops** (`submit`, `step`) drive the engine once the game is
 *    `active`.
 *  `create` seeds a row and so carries no `fromVersion`. */
export type MonopolyAction =
  /** First open of a game id: insert a fresh row seating the caller. The
   *  reserved `dev` id seeds an immediate-play game (skips the lobby); every
   *  other id seeds a lobby. Fails (conflict) if the row already exists — the
   *  caller then loads the existing row. */
  | { type: "create"; profile: PlayerProfile }
  /** Permanently delete a game row. A destructive lobby-browser op confirmed by
   *  the user; carries no `fromVersion` because the browser holds only the
   *  summary, and a delete is idempotent regardless of the row's version. */
  | { type: "delete" }
  /** Debug state override — applied only for the `dev` game (see `DevCommand`). */
  | { type: "dev"; command: DevCommand; fromVersion: number }
  /** Seat the caller in a lobby, auto-assigning the first free color + icon.
   *  Idempotent for an already-seated profile. */
  | { type: "join"; profile: PlayerProfile; fromVersion: number }
  /** Add a bot seat to a lobby. */
  | { type: "addBot"; fromVersion: number }
  /** Remove a seat from a lobby (a leaving human or a kicked bot). */
  | { type: "removePlayer"; playerId: string; fromVersion: number }
  /** Change a lobby seat's token color (rejected if another seat holds it). */
  | { type: "setColor"; playerId: string; color: PlayerColor; fromVersion: number }
  /** Change a lobby seat's token icon (rejected if another seat holds it). */
  | { type: "setIcon"; playerId: string; icon: PlayerIcon; fromVersion: number }
  /** Rename a lobby seat. */
  | { type: "setName"; playerId: string; name: string; fromVersion: number }
  /** Flip the lobby into play (≥2 players, ≥1 human). */
  | { type: "start"; fromVersion: number }
  /** Apply one or more intents in order (apply-only, no auto-drain). Batched
   *  so a multi-step commit (e.g. staged mortgages) lands as one atomic,
   *  single-version write. */
  | { type: "submit"; intents: readonly Intent[]; fromVersion: number }
  /** Advance mechanics by one unit (the paced game loop's heartbeat). */
  | { type: "step"; fromVersion: number };

export interface MonopolyRequest {
  gameId: string;
  action: MonopolyAction;
}

/** Result of an action. `conflict` means the caller's `fromVersion` was
 *  stale (someone else advanced first) — not an error. A stale-version conflict
 *  carries the winning `state`/`version` so the client can rebase its optimistic
 *  overlay immediately rather than waiting for the realtime echo; the rarer
 *  write-race conflict omits them and the client resyncs from the subscription.
 *  `reason` carries a genuine rejection (illegal intent, write failure). */
export type MonopolyResult =
  | { ok: true; state: GameState; version: number }
  /** A `delete` succeeded — the row is gone, so there's no state to fold in. */
  | { ok: true; deleted: true }
  | { ok: false; conflict?: boolean; state?: GameState; version?: number; reason?: string };

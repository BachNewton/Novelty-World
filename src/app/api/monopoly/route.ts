import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/server-admin";
import { PLAYER_COLORS, PLAYER_ICONS } from "@/projects/monopoly/data";
import { applyDevCommand } from "@/projects/monopoly/dev-ops";
import { apply, autoStep } from "@/projects/monopoly/engine";
import {
  addBot,
  createLobby,
  joinLobby,
  removePlayer,
  setPlayerColor,
  setPlayerIcon,
  setPlayerName,
  startGame,
  type LobbyResult,
} from "@/projects/monopoly/lobby";
import { freshGame } from "@/projects/monopoly/mocks";
import type {
  GameState,
  Intent,
  PlayerColor,
  PlayerIcon,
} from "@/projects/monopoly/types";
import type {
  DevCommand,
  MonopolyAction,
  MonopolyResult,
} from "@/projects/monopoly/protocol";
import type { PlayerProfile } from "@/shared/lib/profile";

// The reserved game id that runs on the backend like any other game but also
// accepts the debug `dev` actions. See monopoly/CLAUDE.md "Multiplayer".
const DEV_GAME_ID = "dev";

// One row per game in public.monopoly_games. This route is the ONLY writer:
// RLS denies client writes, the route writes with the service role and runs
// the engine, so the authoritative state can't be set to anything illegal.
const TABLE = "monopoly_games";

type Db = ReturnType<typeof createAdminClient>;

// Shape of the columns we read back. Supplying it to maybeSingle<T>() keeps
// the result strongly typed instead of `any` (there's no generated Database
// type in this repo).
interface GameRow {
  state: GameState;
  version: number;
}

function json(body: MonopolyResult, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseProfile(v: unknown): PlayerProfile | null {
  if (!isRecord(v)) return null;
  const { id, name } = v;
  if (typeof id === "string" && typeof name === "string") return { id, name };
  return null;
}

function isPlayerColor(v: unknown): v is PlayerColor {
  return typeof v === "string" && (PLAYER_COLORS as readonly string[]).includes(v);
}

function isPlayerIcon(v: unknown): v is PlayerIcon {
  return typeof v === "string" && (PLAYER_ICONS as readonly string[]).includes(v);
}

function parseDevCommand(v: unknown): DevCommand | null {
  if (!isRecord(v)) return null;
  if (v.kind === "restart") {
    return v.players === 2 || v.players === 4 || v.players === 8
      ? { kind: "restart", players: v.players }
      : null;
  }
  if (v.kind === "own-all" || v.kind === "random-own") return { kind: v.kind };
  return null;
}

function parseAction(v: unknown): MonopolyAction | null {
  if (!isRecord(v)) return null;
  const type = v.type;
  if (type === "create") {
    const profile = parseProfile(v.profile);
    return profile ? { type, profile } : null;
  }
  if (type === "delete") return { type };
  // Every op below is version-guarded.
  const fromVersion = v.fromVersion;
  if (typeof fromVersion !== "number") return null;
  if (type === "dev") {
    const command = parseDevCommand(v.command);
    return command ? { type, command, fromVersion } : null;
  }
  if (type === "join") {
    const profile = parseProfile(v.profile);
    return profile ? { type, profile, fromVersion } : null;
  }
  if (type === "addBot" || type === "start") {
    return { type, fromVersion };
  }
  if (type === "removePlayer") {
    return typeof v.playerId === "string"
      ? { type, playerId: v.playerId, fromVersion }
      : null;
  }
  if (type === "setColor") {
    return typeof v.playerId === "string" && isPlayerColor(v.color)
      ? { type, playerId: v.playerId, color: v.color, fromVersion }
      : null;
  }
  if (type === "setIcon") {
    return typeof v.playerId === "string" && isPlayerIcon(v.icon)
      ? { type, playerId: v.playerId, icon: v.icon, fromVersion }
      : null;
  }
  if (type === "setName") {
    return typeof v.playerId === "string" && typeof v.name === "string"
      ? { type, playerId: v.playerId, name: v.name, fromVersion }
      : null;
  }
  if (type === "submit") {
    const { intents } = v;
    if (!Array.isArray(intents)) return null;
    // The engine validates each intent semantically (turn ownership, phase,
    // affordability); the transport only asserts the array shape. The cast is
    // contained to this boundary.
    return { type, intents: intents as Intent[], fromVersion };
  }
  if (type === "step") {
    return { type, fromVersion };
  }
  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, reason: "invalid JSON" }, 400);
  }
  if (!isRecord(raw)) return json({ ok: false, reason: "invalid body" }, 400);

  const gameId = typeof raw.gameId === "string" ? raw.gameId : null;
  const action = parseAction(raw.action);
  if (!gameId || !action) return json({ ok: false, reason: "invalid request" }, 400);
  // Dev actions are accepted only for the reserved dev game id.
  if (action.type === "dev" && gameId !== DEV_GAME_ID) {
    return json({ ok: false, reason: "not a dev game" });
  }

  let supabase: Db;
  try {
    supabase = createAdminClient();
  } catch (err) {
    return json({ ok: false, reason: errMessage(err) }, 500);
  }

  if (action.type === "create") {
    return seed(supabase, gameId, action);
  }
  if (action.type === "delete") {
    return remove(supabase, gameId);
  }
  return mutate(supabase, gameId, action);
}

/** Permanently delete a game row. Unguarded by design (see the `delete` action
 *  in protocol.ts): a confirmed lobby-browser teardown, idempotent — deleting
 *  an already-gone row still succeeds. */
async function remove(supabase: Db, gameId: string): Promise<NextResponse> {
  const { error } = await supabase.from(TABLE).delete().eq("id", gameId);
  if (error) return json({ ok: false, reason: error.message }, 500);
  return json({ ok: true, deleted: true });
}

async function seed(
  supabase: Db,
  gameId: string,
  action: Extract<MonopolyAction, { type: "create" }>,
): Promise<NextResponse> {
  const rngSeed = `${gameId}-${Date.now().toString()}`;
  // The dev sandbox seeds an immediate-play game (skips the lobby); every
  // other id seeds a fresh lobby. Insert-only either way, so a concurrent
  // creator can't clobber an in-progress game — a duplicate-key error means
  // someone created it first, surfaced as a conflict so the client re-loads
  // the existing row.
  const seeded =
    gameId === DEV_GAME_ID
      ? freshGame(rngSeed, action.profile)
      : createLobby(action.profile, rngSeed);
  const { error } = await supabase
    .from(TABLE)
    .insert({ id: gameId, state: seeded, version: 0 });
  if (error) return json({ ok: false, conflict: true, reason: error.message });
  return json({ ok: true, state: seeded, version: 0 });
}

/** Outcome of computing the next state for a version-guarded write.
 *  `noop` means the op was valid but produced no change (e.g. a `step` at a
 *  decision point) — the current row is returned unchanged. */
type Computed =
  | { ok: true; state: GameState }
  | { ok: true; noop: true }
  | { ok: false; reason: string };

/** Map a pure `lobby.ts` result onto the route's computed shape. */
function fromLobby(result: LobbyResult): Computed {
  return result.ok ? { ok: true, state: result.state } : result;
}

/** Compute the next state for a version-guarded op. Pure given the current
 *  state and an injected `rngSeed` (used only by `dev` restart) — the version
 *  guard and write happen in `mutate`. */
function compute(
  state: GameState,
  action: Extract<MonopolyAction, { fromVersion: number }>,
  rngSeed: string,
): Computed {
  switch (action.type) {
    case "dev":
      return { ok: true, state: applyDevCommand(state, action.command, rngSeed) };
    case "join":
      return fromLobby(joinLobby(state, action.profile));
    case "addBot":
      return fromLobby(addBot(state));
    case "removePlayer":
      return fromLobby(removePlayer(state, action.playerId));
    case "setColor":
      return fromLobby(setPlayerColor(state, action.playerId, action.color));
    case "setIcon":
      return fromLobby(setPlayerIcon(state, action.playerId, action.icon));
    case "setName":
      return fromLobby(setPlayerName(state, action.playerId, action.name));
    case "start":
      return fromLobby(startGame(state));
    case "submit": {
      // Apply-only: intents do NOT auto-drain mechanics. One unit of progress
      // per call is the contract — a separate `step` runs each `autoStep`,
      // which re-opens the off-turn interject windows between mechanical
      // beats. See monopoly/CLAUDE.md "Multiplayer / networking".
      let working = state;
      for (const intent of action.intents) {
        const result = apply(working, intent);
        if (!result.ok) return result;
        working = result.state;
      }
      return { ok: true, state: working };
    }
    case "step": {
      const stepped = autoStep(state);
      // Already at a decision point / paused / game over — nothing to do.
      if (stepped.state === state) return { ok: true, noop: true };
      return { ok: true, state: stepped.state };
    }
  }
}

/** Read the row, reject a stale `fromVersion` as a conflict, compute the next
 *  state, and write it back under an optimistic CAS guard. Shared by every
 *  version-guarded action (lobby ops and play ops alike). */
async function mutate(
  supabase: Db,
  gameId: string,
  action: Extract<MonopolyAction, { fromVersion: number }>,
): Promise<NextResponse> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("state, version")
    .eq("id", gameId)
    .maybeSingle<GameRow>();
  if (error) return json({ ok: false, reason: error.message }, 500);
  if (!data) return json({ ok: false, reason: "game not found" }, 404);

  // The caller advances from the version it last saw. If the DB has moved on,
  // its view is stale — reject so it resyncs from the subscription rather than
  // computing against an old snapshot.
  if (data.version !== action.fromVersion) {
    return json({ ok: false, conflict: true });
  }

  const result = compute(data.state, action, `${gameId}-${Date.now().toString()}`);
  if (!result.ok) return json({ ok: false, reason: result.reason });
  if ("noop" in result) {
    return json({ ok: true, state: data.state, version: data.version });
  }

  const newVersion = data.version + 1;
  const { data: updated, error: writeErr } = await supabase
    .from(TABLE)
    .update({
      state: result.state,
      version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", gameId)
    .eq("version", data.version)
    .select("version")
    .maybeSingle<{ version: number }>();
  if (writeErr) return json({ ok: false, reason: writeErr.message }, 500);
  // Lost the optimistic race between our read and write — a no-op, the winner
  // broadcast its state to every subscriber.
  if (!updated) return json({ ok: false, conflict: true });
  return json({ ok: true, state: result.state, version: newVersion });
}

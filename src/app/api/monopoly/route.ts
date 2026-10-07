import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/server-admin";
import { PLAYER_COLORS, PLAYER_ICONS } from "@/projects/monopoly/data";
import { applyDevCommand } from "@/projects/monopoly/dev-ops";
import { apply, autoStep } from "@/projects/monopoly/engine";
import {
  createLobby,
  lobbyReduce,
  type LobbyResult,
} from "@/projects/monopoly/lobby";
import { freshGame } from "@/projects/monopoly/mocks";
import { isOutdated } from "@/projects/monopoly/state-version";
import { VERSIONS } from "@/projects/monopoly/bots/versions";
import { askModel, claimAi, failed, settleAnswer, type Settled } from "@/projects/monopoly/bots/ai/decide";
import { aiCallRow, gameCallRecord, type CallOutcome } from "@/projects/monopoly/bots/ai/calls";
import { recording } from "@/projects/monopoly/bots/ai/eval/record";
import { describeServer, modelFor } from "@/projects/monopoly/bots/ai/model/config";
import {
  afterFlag,
  aiDecisionAt,
  decisionRefOf,
  holdDuringPause,
  isAiFlagCategory,
  pauseForReview,
  resumeAfterReview,
  retryFailed,
  type AiFlagCategory,
} from "@/projects/monopoly/bots/ai/review";
import { isAiStrategy, parseAiStrategy } from "@/projects/monopoly/bots/ai/strategy";
import { aiSeat, currentTurnNumber } from "@/projects/monopoly/bots/ai/seat";
import type {
  AiDecisionRef,
  BotStrategy,
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
// AI review data (supabase/monopoly-ai.sql), also written only here: every
// model call a live game makes, every time a player opens an AI decision, and
// the flags players leave on them.
const CALLS = "monopoly_ai_calls";
const REVEALS = "monopoly_ai_reveals";
const FLAGS = "monopoly_ai_flags";

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

// A seat's strategy is a concrete archive identifier: the literal `dumb`, any
// label in the version archive, or an AI model profile. Validating against the
// live `VERSIONS` map (the same source `botFor` resolves through) means a newly
// registered version is instantly selectable with no list to keep in sync.
function isBotStrategy(v: unknown): v is BotStrategy {
  return typeof v === "string" && (v === "dumb" || v in VERSIONS || isAiStrategy(v));
}

function parseRef(v: unknown): AiDecisionRef | null {
  if (!isRecord(v)) return null;
  const { turn, index } = v;
  return typeof turn === "number" && Number.isInteger(turn) && typeof index === "number" && Number.isInteger(index)
    ? { turn, index }
    : null;
}

function parseCategories(v: unknown): AiFlagCategory[] | null {
  if (!Array.isArray(v) || !v.every(isAiFlagCategory)) return null;
  return [...new Set(v)];
}

// A flag's own words, kept to a sane size: it's a note on one decision.
const FLAG_NOTE_MAX = 4000;

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
  if (type === "resume") return { type };
  if (type === "ai-retry") {
    const by = parseProfile(v.by);
    const ref = parseRef(v.ref);
    return by && ref && typeof v.seat === "string" ? { type, by, seat: v.seat, ref } : null;
  }
  if (type === "review") {
    const by = parseProfile(v.by);
    const ref = parseRef(v.ref);
    return by && ref ? { type, by, ref } : null;
  }
  if (type === "flag") {
    const by = parseProfile(v.by);
    const ref = parseRef(v.ref);
    const categories = parseCategories(v.categories);
    const note = typeof v.note === "string" ? v.note.trim().slice(0, FLAG_NOTE_MAX) : null;
    if (!by || !ref || !categories || note === null) return null;
    // A flag says something: a category, some words, or both.
    if (categories.length === 0 && note === "") return null;
    return { type, by, ref, categories, note };
  }
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
  if (type === "start") {
    return { type, fromVersion };
  }
  if (type === "addBot") {
    return typeof v.botId === "string"
      ? { type, botId: v.botId, fromVersion }
      : null;
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
  if (type === "setStrategy") {
    return typeof v.playerId === "string" && isBotStrategy(v.strategy)
      ? { type, playerId: v.playerId, strategy: v.strategy, fromVersion }
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
  if (type === "ai-decide") {
    return typeof v.seat === "string" ? { type, seat: v.seat, fromVersion } : null;
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
  if (action.type === "ai-decide") {
    return aiDecide(supabase, gameId, action);
  }
  if (action.type === "review") return review(supabase, gameId, action);
  if (action.type === "resume") return resume(supabase, gameId);
  if (action.type === "ai-retry") return aiRetry(supabase, gameId, action);
  if (action.type === "flag") return flag(supabase, gameId, action);
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

/** A version-guarded action computed in one step; `ai-decide` has its own path. */
type EngineAction = Exclude<
  Extract<MonopolyAction, { fromVersion: number }>,
  { type: "ai-decide" }
>;

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
  action: EngineAction,
  rngSeed: string,
): Computed {
  switch (action.type) {
    case "dev":
      return { ok: true, state: applyDevCommand(state, action.command, rngSeed) };
    case "join":
    case "addBot":
    case "removePlayer":
    case "setColor":
    case "setIcon":
    case "setName":
    case "setStrategy":
    case "start":
      // The action carries a `fromVersion` the op type ignores — structurally a
      // LobbyOp, applied through the same dispatcher the client predicts with.
      return fromLobby(lobbyReduce(state, action));
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

const OUTDATED_REASON = "this game uses an outdated version and can't be played";

type Read =
  | { ok: true; row: GameRow }
  | { ok: false; response: NextResponse };

async function readRow(supabase: Db, gameId: string): Promise<Read> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("state, version")
    .eq("id", gameId)
    .maybeSingle<GameRow>();
  if (error) return { ok: false, response: json({ ok: false, reason: error.message }, 500) };
  if (!data) return { ok: false, response: json({ ok: false, reason: "game not found" }, 404) };
  // A row written under an older GameState shape can't be fed to the engine; it
  // can only be deleted, which doesn't read the row.
  if (isOutdated(data.state)) {
    return { ok: false, response: json({ ok: false, reason: OUTDATED_REASON }, 409) };
  }
  return { ok: true, row: data };
}

/** Outcome of a version-guarded write: it landed, another write landed first
 *  (the version moved between our read and this write), or the DB failed. */
type Write =
  | { kind: "written"; version: number }
  | { kind: "lost" }
  | { kind: "error"; response: NextResponse };

async function casWrite(
  supabase: Db,
  gameId: string,
  state: GameState,
  fromVersion: number,
): Promise<Write> {
  const version = fromVersion + 1;
  const { data: updated, error } = await supabase
    .from(TABLE)
    .update({ state, version, updated_at: new Date().toISOString() })
    .eq("id", gameId)
    .eq("version", fromVersion)
    .select("version")
    .maybeSingle<{ version: number }>();
  if (error) return { kind: "error", response: json({ ok: false, reason: error.message }, 500) };
  return updated ? { kind: "written", version } : { kind: "lost" };
}

/** Lost the optimistic race between our read and write: the version moved
 *  between the SELECT and the CAS UPDATE, so it matched no row. Re-read the
 *  winning row and hand it back like a stale-version conflict, so the client
 *  folds + rebases immediately. Without the winner the client can only wait for
 *  a Realtime echo to advance its head — which never arrives when the racing
 *  winner was the client's OWN already-consumed write (its echo is dropped as a
 *  duplicate), stranding the client's pending outbox and freezing its pump
 *  (e.g. a human's auction drop racing a bot's bid, both driven by one client). */
async function lostRace(supabase: Db, gameId: string): Promise<NextResponse> {
  const { data: winner } = await supabase
    .from(TABLE)
    .select("state, version")
    .eq("id", gameId)
    .maybeSingle<GameRow>();
  return winner
    ? json({ ok: false, conflict: true, state: winner.state, version: winner.version })
    : json({ ok: false, conflict: true });
}

/** Read the row, reject a stale `fromVersion` as a conflict, compute the next
 *  state, and write it back under an optimistic CAS guard. Shared by every
 *  version-guarded action (lobby ops and play ops alike). */
async function mutate(
  supabase: Db,
  gameId: string,
  action: EngineAction,
): Promise<NextResponse> {
  const read = await readRow(supabase, gameId);
  if (!read.ok) return read.response;
  const data = read.row;

  // The caller advances from the version it last saw. If the DB has moved on,
  // its view is stale — reject so it rebases rather than computing against an old
  // snapshot. Hand back the winning row so the client can rebase its optimistic
  // overlay immediately instead of waiting for the realtime echo.
  if (data.version !== action.fromVersion) {
    return json({ ok: false, conflict: true, state: data.state, version: data.version });
  }

  const result = compute(data.state, action, `${gameId}-${Date.now().toString()}`);
  if (!result.ok) return json({ ok: false, reason: result.reason });
  if ("noop" in result) {
    return json({ ok: true, state: data.state, version: data.version });
  }

  const write = await casWrite(supabase, gameId, result.state, data.version);
  if (write.kind === "error") return write.response;
  if (write.kind === "lost") return lostRace(supabase, gameId);
  return json({ ok: true, state: result.state, version: write.version });
}

// How many times the AI's commit re-reads and re-applies after losing the
// version race to another write (a human bidding or voting meanwhile). Each
// loss means someone else's write landed, so the game is moving; the bound only
// turns a pathological storm of writes into a loud error.
const AI_COMMIT_ATTEMPTS = 8;

/** Have an AI seat make the decision it owes. Two writes around one slow call:
 *  the seat is marked as thinking first (so no other client asks too, and every
 *  client can show it), then the model's answer is weighed against the latest
 *  row and committed. A failed call or an unusable answer is committed as a
 *  logged failure that stalls the seat: no automatic retry and no fallback
 *  (a player may ask it to try again: `ai-retry`). */
async function aiDecide(
  supabase: Db,
  gameId: string,
  action: Extract<MonopolyAction, { type: "ai-decide" }>,
): Promise<NextResponse> {
  const read = await readRow(supabase, gameId);
  if (!read.ok) return read.response;
  const { state, version } = read.row;
  if (version !== action.fromVersion) {
    return json({ ok: false, conflict: true, state, version });
  }
  const strategy = parseAiStrategy(state.players.find((p) => p.id === action.seat)?.botStrategy ?? null);
  if (strategy === null) return json({ ok: false, reason: "not an AI seat" });

  const claim = claimAi(state, action.seat);
  if (!claim) return json({ ok: true, state, version });
  const claimed = await casWrite(supabase, gameId, claim.state, version);
  if (claimed.kind === "error") return claimed.response;
  if (claimed.kind === "lost") return lostRace(supabase, gameId);

  const model = recording(modelFor(strategy.profile));
  const [asked, server] = await Promise.all([
    askModel(model.adapter, claim.state, action.seat, claim.decision),
    describeServer(strategy.profile),
  ]);
  // Every call is kept in full, however it ends; the game row keeps only the
  // small record its log shows.
  const keep = (outcome: CallOutcome, settled: Settled | null, ref: AiDecisionRef | null) =>
    storeRow(
      supabase,
      CALLS,
      aiCallRow(
        gameId,
        gameCallRecord({
          gameId,
          turn: currentTurnNumber(claim.state),
          seat: action.seat,
          decision: claim.decision,
          version: asked.record.version,
          server,
          calls: model.calls(),
          metrics: asked.record,
          settle: settled
            ? { kind: settled.kind, reason: settled.kind === "fail" ? settled.reason : null }
            : null,
          at: new Date().toISOString(),
        }),
        ref,
        outcome,
        settled?.kind === "fail" ? settled.reason : asked.ok ? null : asked.reason,
      ),
    );

  let latest: GameRow = { state: claim.state, version: claimed.version };
  for (let attempt = 0; attempt < AI_COMMIT_ATTEMPTS; attempt++) {
    // The claim is ours to settle only while it stands; a game reset under the
    // call (the dev restart) has dropped it, and there is nothing to commit.
    if (aiSeat(latest.state, action.seat).thinking !== claim.decision) {
      return json({ ok: true, state: latest.state, version: latest.version });
    }
    // A player paused the table to review a decision while the model thought:
    // the answer waits on the seat until play resumes, so the board doesn't
    // change under the reviewer.
    if (latest.state.pause !== null) {
      const hold = holdDuringPause(
        claim.state,
        latest.state,
        action.seat,
        claim.decision,
        asked.ok ? { ok: true, answer: asked.answer } : { ok: false, reason: asked.reason },
        asked.record,
      );
      const write = await casWrite(supabase, gameId, hold.state, latest.version);
      if (write.kind === "error") return write.response;
      if (write.kind === "written") {
        const warning = await keep(hold.kind, null, null);
        return json({ ok: true, state: hold.state, version: write.version, ...warning });
      }
    } else {
      const settled = asked.ok
        ? settleAnswer(claim.state, latest.state, action.seat, claim.decision, asked.answer, asked.record)
        : failed(latest.state, action.seat, claim.decision, asked.reason, asked.record);
      const write = await casWrite(supabase, gameId, settled.state, latest.version);
      if (write.kind === "error") return write.response;
      if (write.kind === "written") {
        const warning = await keep(settled.kind, settled, decisionRefOf(settled.state, asked.record));
        return json({ ok: true, state: settled.state, version: write.version, ...warning });
      }
    }
    const reread = await readRow(supabase, gameId);
    if (!reread.ok) return reread.response;
    latest = reread.row;
  }
  return json(
    { ok: false, reason: "the AI's answer couldn't be committed: the game kept changing" },
    500,
  );
}

/** Insert a row of AI review data. A failure never fails the action it rides
 *  on (the game must go on), but it is never silent either: it is logged here
 *  and handed back as the response's `warning`, which the client logs too. */
async function storeRow(
  supabase: Db,
  table: string,
  row: object,
): Promise<{ warning?: string }> {
  const { error } = await supabase.from(table).insert(row);
  if (!error) return {};
  const warning = `couldn't store a ${table} row: ${error.message}`;
  console.error(`[monopoly] ${warning}`);
  return { warning };
}

/** Read, change and write the row until the write lands. For the absolute,
 *  idempotent ops (pause, resume) that must take effect on whatever the game
 *  is now, not on the version the client last saw. A change that leaves the
 *  state as it is writes nothing. */
async function rewrite(
  supabase: Db,
  gameId: string,
  change: (state: GameState) => Computed,
): Promise<{ ok: true; row: GameRow } | { ok: false; response: NextResponse }> {
  for (let attempt = 0; attempt < AI_COMMIT_ATTEMPTS; attempt++) {
    const read = await readRow(supabase, gameId);
    if (!read.ok) return read;
    const result = change(read.row.state);
    if (!result.ok) return { ok: false, response: json({ ok: false, reason: result.reason }) };
    if ("noop" in result) return { ok: true, row: read.row };
    const write = await casWrite(supabase, gameId, result.state, read.row.version);
    if (write.kind === "error") return { ok: false, response: write.response };
    if (write.kind === "written") {
      return { ok: true, row: { state: result.state, version: write.version } };
    }
  }
  return {
    ok: false,
    response: json({ ok: false, reason: "couldn't write: the game kept changing" }, 500),
  };
}

/** A player opens an AI decision: pause the table, then log the reveal. */
async function review(
  supabase: Db,
  gameId: string,
  action: Extract<MonopolyAction, { type: "review" }>,
): Promise<NextResponse> {
  const paused = await rewrite(supabase, gameId, (state) => {
    const result = pauseForReview(state, action.by.id, action.ref);
    return result.ok ? changed(state, result.state) : result;
  });
  if (!paused.ok) return paused.response;
  const warning = await storeRow(supabase, REVEALS, {
    game_id: gameId,
    turn: action.ref.turn,
    event_index: action.ref.index,
    seat: aiDecisionAt(paused.row.state, action.ref)?.seat ?? null,
    viewer_id: action.by.id,
    viewer_name: action.by.name,
  });
  return json({ ok: true, state: paused.row.state, version: paused.row.version, ...warning });
}

/** A change for `rewrite`: nothing to write when it left the state as it was. */
function changed(before: GameState, after: GameState): Computed {
  return after === before ? { ok: true, noop: true } : { ok: true, state: after };
}

/** Carry on after a review. Anyone at the table may. */
async function resume(supabase: Db, gameId: string): Promise<NextResponse> {
  const done = await rewrite(supabase, gameId, (state) => changed(state, resumeAfterReview(state)));
  if (!done.ok) return done.response;
  return json({ ok: true, state: done.row.state, version: done.row.version });
}

/** A player asks a stalled AI seat to try again. The failure clears only while
 *  the seat is still stalled on the one the player saw, checked against the row
 *  each write lands on, so two taps clear it once and the other is refused. The
 *  failure stays in the log, and the new attempt gets its own call row when a
 *  client drives the seat again. */
async function aiRetry(
  supabase: Db,
  gameId: string,
  action: Extract<MonopolyAction, { type: "ai-retry" }>,
): Promise<NextResponse> {
  const done = await rewrite(supabase, gameId, (state) => retryFailed(state, action.by.id, action.seat, action.ref));
  if (!done.ok) return done.response;
  return json({ ok: true, state: done.row.state, version: done.row.version });
}

/** Store a player's flag on an AI decision. The opener's flag resumes the
 *  table; anyone else's leaves it paused (`afterFlag`). What the flag is about
 *  (the seat, its notes and plan, version and model) is read from the game, so
 *  a flag always describes what the dialog showed. If the flag can't be stored,
 *  the table stays paused and the player is told, so it can be sent again
 *  rather than lost. */
async function flag(
  supabase: Db,
  gameId: string,
  action: Extract<MonopolyAction, { type: "flag" }>,
): Promise<NextResponse> {
  const read = await readRow(supabase, gameId);
  if (!read.ok) return read.response;
  const decision = aiDecisionAt(read.row.state, action.ref);
  if (!decision) return json({ ok: false, reason: "no AI decision there" });
  const { data: call } = await supabase
    .from(CALLS)
    .select("id")
    .eq("game_id", gameId)
    .eq("turn", action.ref.turn)
    .eq("event_index", action.ref.index)
    .maybeSingle<{ id: number }>();
  const { error } = await supabase.from(FLAGS).insert({
    game_id: gameId,
    turn: action.ref.turn,
    event_index: action.ref.index,
    seat: decision.seat,
    decision: decision.record?.decision ?? null,
    version: decision.record?.version ?? null,
    model: decision.record?.model ?? null,
    call_id: call?.id ?? null,
    flagger_id: action.by.id,
    flagger_name: action.by.name,
    categories: action.categories,
    note: action.note,
    shown: {
      publicNote: decision.publicNote,
      privateNote: decision.privateNote,
      plan: decision.plan,
      failure: decision.failure,
      record: decision.record,
    },
  });
  if (error) return json({ ok: false, reason: `couldn't store the flag: ${error.message}` }, 500);
  const done = await rewrite(supabase, gameId, (state) => changed(state, afterFlag(state, action.by.id)));
  if (!done.ok) return done.response;
  return json({ ok: true, state: done.row.state, version: done.row.version });
}


// @vitest-environment node
//
// Route-level tests for the version-guarded write path. The focus is the
// optimistic-CAS conflict handling — specifically the write-race case (the row's
// version moved between the route's SELECT and its CAS UPDATE, so the update
// matched no row). That conflict MUST hand back the winning row so the client can
// rebase: without it a client whose racing winner was its OWN already-folded
// write (its Realtime echo is dropped as a duplicate) strands its pending outbox
// and freezes — the reported "auction soft-lock after dropping out".

import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAdminClient, modelFor, describeServer } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  modelFor: vi.fn(),
  describeServer: vi.fn(),
}));
vi.mock("@/shared/lib/supabase/server-admin", () => ({ createAdminClient }));
vi.mock("@/projects/monopoly/bots/ai/model/config", () => ({ modelFor, describeServer }));

import { aiSeat } from "@/projects/monopoly/bots/ai/seat";
import { freshGame } from "@/projects/monopoly/mocks";
import type { GameState, Intent } from "@/projects/monopoly/types";
import type { MonopolyResult } from "@/projects/monopoly/protocol";
import { POST } from "./route";

const HEAD: GameState = freshGame("route-conflict", undefined, 4);
const HUMAN = HEAD.turn.playerId;
// An arm is legal at any time, so `compute` always reaches the CAS write.
const ARM: Intent = { kind: "set-queue", playerId: HUMAN, queue: "manage", armed: true };

/** A row the route inserted, and into which table. */
interface Inserted {
  table: string;
  row: Record<string, unknown>;
}

/** A fake Supabase client whose chained query builders resolve `maybeSingle()`
 *  to the queued results in call order. The route calls it for the initial read,
 *  the CAS write, and (on a write-race) the winner re-read. Inserts are recorded
 *  and resolve to `insertResults` in order (success once those run out). */
function fakeClient(
  results: { data: unknown; error: unknown }[],
  writes: { state: GameState }[] = [],
  inserts: Inserted[] = [],
  insertResults: { error: unknown }[] = [],
): unknown {
  const queue = [...results];
  const insertQueue = [...insertResults];
  let table = "";
  const builder = {
    select: () => builder,
    update: (row: { state: GameState }) => {
      writes.push(row);
      return builder;
    },
    insert: (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      return Promise.resolve(insertQueue.shift() ?? { error: null });
    },
    delete: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(queue.shift() ?? { data: null, error: null }),
  };
  return {
    from: (name: string) => {
      table = name;
      return builder;
    },
  };
}

function post(body: unknown): Promise<MonopolyResult> {
  const req = new Request("http://test/api/monopoly", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return POST(req).then((res) => res.json() as Promise<MonopolyResult>);
}

beforeEach(() => {
  vi.clearAllMocks();
  describeServer.mockResolvedValue({ model: "test-model.gguf", contextPerSlot: 16384, slots: 4, defaults: {} });
});

describe("monopoly route — submit CAS conflicts", () => {
  it("commits a clean write and returns the new version", async () => {
    createAdminClient.mockReturnValue(
      fakeClient([
        { data: { state: HEAD, version: 5 }, error: null }, // initial read
        { data: { version: 6 }, error: null }, // CAS write succeeded
      ]),
    );

    const res = await post({
      gameId: "g",
      action: { type: "submit", intents: [ARM], fromVersion: 5 },
    });

    expect(res.ok).toBe(true);
    if (!res.ok || !("version" in res)) throw new Error("expected ok with version");
    expect(res.version).toBe(6);
  });

  it("rejects a stale fromVersion with the winning row to rebase on", async () => {
    const winner: GameState = { ...HEAD, rngState: HEAD.rngState + 1 };
    createAdminClient.mockReturnValue(
      fakeClient([
        { data: { state: winner, version: 7 }, error: null }, // read: already past 5
      ]),
    );

    const res = await post({
      gameId: "g",
      action: { type: "submit", intents: [ARM], fromVersion: 5 },
    });

    expect(res).toMatchObject({ ok: false, conflict: true, version: 7 });
  });

  it("hands back the winner on a write-race (CAS matched no row)", async () => {
    const winner: GameState = { ...HEAD, rngState: HEAD.rngState + 1 };
    createAdminClient.mockReturnValue(
      fakeClient([
        { data: { state: HEAD, version: 5 }, error: null }, // read: version matches
        { data: null, error: null }, // CAS UPDATE matched 0 rows — lost the race
        { data: { state: winner, version: 6 }, error: null }, // re-read the winner
      ]),
    );

    const res = await post({
      gameId: "g",
      action: { type: "submit", intents: [ARM], fromVersion: 5 },
    });

    // The fix: the write-race conflict now carries the winner so the client folds
    // + rebases immediately instead of stranding its outbox waiting for an echo.
    expect(res).toMatchObject({ ok: false, conflict: true, version: 6 });
    if (res.ok) throw new Error("expected conflict");
    expect(res.state).toBeDefined();
  });

  it("still returns a bare conflict if the row vanished mid-write", async () => {
    createAdminClient.mockReturnValue(
      fakeClient([
        { data: { state: HEAD, version: 5 }, error: null }, // read
        { data: null, error: null }, // CAS matched 0 rows
        { data: null, error: null }, // re-read finds nothing (row deleted)
      ]),
    );

    const res = await post({
      gameId: "g",
      action: { type: "submit", intents: [ARM], fromVersion: 5 },
    });

    expect(res).toMatchObject({ ok: false, conflict: true });
    if (res.ok) throw new Error("expected conflict");
    expect(res.state).toBeUndefined();
  });
});

describe("monopoly route — ai-decide", () => {
  // p2 is an AI seat that has landed on Boardwalk and owes a buy decision.
  const AI = "p2";
  const LANDED: GameState = {
    ...HEAD,
    players: HEAD.players.map((p) =>
      p.id === AI ? { ...p, botStrategy: "ai:local@llm-v1", position: 39 } : p,
    ),
    turn: { ...HEAD.turn, playerId: AI, phase: "buy-decision", pendingBuy: 39 },
  };
  const METRICS = {
    ms: 1200,
    thinkMs: null,
    answerMs: 1200,
    promptTokens: 1500,
    completionTokens: 60,
    thinkHitBudget: null,
  };
  const ANSWER = {
    privateNote: "Boardwalk anchors the dark blues.",
    choice: "buy",
    mortgage: [],
    publicNote: "Mine.",
    plan: "Get Park Place.",
  };

  function answering(result: unknown): void {
    modelFor.mockReturnValue({
      complete: () => Promise.resolve(result),
      identify: () => Promise.resolve("test-model.gguf"),
    });
  }

  it("claims the seat, asks the model, and commits its answer", async () => {
    answering({ ok: true, answer: ANSWER, raw: "{}", thoughts: "", metrics: METRICS });
    const writes: { state: GameState }[] = [];
    createAdminClient.mockReturnValue(
      fakeClient(
        [
          { data: { state: LANDED, version: 5 }, error: null }, // read
          { data: { version: 6 }, error: null }, // claim written
          { data: { version: 7 }, error: null }, // answer committed
        ],
        writes,
      ),
    );

    const res = await post({ gameId: "g", action: { type: "ai-decide", seat: AI, fromVersion: 5 } });

    expect(res).toMatchObject({ ok: true, version: 7 });
    expect(aiSeat(writes[0].state, AI).thinking).toBe("buy");
    const committed = writes[1].state;
    expect(committed.ownership[39]).toBe(AI);
    expect(aiSeat(committed, AI)).toMatchObject({ thinking: null, plan: "Get Park Place." });
    // The note carries how the decision was made: version, model and timing.
    const note = committed.turns.flatMap((t) => t.events).find((e) => e.kind === "bot-note");
    expect(note).toMatchObject({
      ai: { decision: "buy", version: "llm-v1", model: "test-model.gguf", ms: 1200 },
    });
  });

  it("keeps the whole call, placed at the decision's log entry", async () => {
    answering({ ok: true, answer: ANSWER, raw: '{"choice":"buy"}', thoughts: "", metrics: METRICS });
    const writes: { state: GameState }[] = [];
    const inserts: Inserted[] = [];
    createAdminClient.mockReturnValue(
      fakeClient(
        [
          { data: { state: LANDED, version: 5 }, error: null },
          { data: { version: 6 }, error: null },
          { data: { version: 7 }, error: null },
        ],
        writes,
        inserts,
      ),
    );

    await post({ gameId: "g", action: { type: "ai-decide", seat: AI, fromVersion: 5 } });

    expect(inserts).toHaveLength(1);
    const { table, row } = inserts[0];
    expect(table).toBe("monopoly_ai_calls");
    const committed = writes[1].state;
    const group = committed.turns[committed.turns.length - 1];
    const index = group.events.findIndex((e) => e.kind === "bot-note");
    expect(row).toMatchObject({
      game_id: "g",
      seat: AI,
      decision: "buy",
      version: "llm-v1",
      model: "test-model.gguf",
      turn: group.turn,
      event_index: index,
      outcome: "commit",
      ms: 1200,
      record: {
        source: { kind: "game", game: "g" },
        server: { slots: 4 },
        result: { ok: true, raw: '{"choice":"buy"}' },
        settle: { kind: "commit" },
      },
    });
    expect((row.record as { request: { user: string } }).request.user).toContain("Boardwalk");
  });

  it("still commits the decision when its call record can't be stored, and says so", async () => {
    answering({ ok: true, answer: ANSWER, raw: "{}", thoughts: "", metrics: METRICS });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    createAdminClient.mockReturnValue(
      fakeClient(
        [
          { data: { state: LANDED, version: 5 }, error: null },
          { data: { version: 6 }, error: null },
          { data: { version: 7 }, error: null },
        ],
        [],
        [],
        [{ error: { message: "table missing" } }],
      ),
    );

    const res = await post({ gameId: "g", action: { type: "ai-decide", seat: AI, fromVersion: 5 } });

    expect(res).toMatchObject({ ok: true, version: 7 });
    if (!res.ok || !("warning" in res)) throw new Error("expected a warning");
    expect(res.warning).toMatch(/monopoly_ai_calls.*table missing/);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("holds an answer that arrives while the table is paused, and commits it on resume", async () => {
    answering({ ok: true, answer: ANSWER, raw: "{}", thoughts: "", metrics: METRICS });
    const writes: { state: GameState }[] = [];
    const inserts: Inserted[] = [];
    // A player paused to review while the model was thinking.
    const pausedMeanwhile = (claim: GameState): GameState => ({
      ...claim,
      pause: { by: HUMAN, ref: { turn: 1, index: 0 } },
    });
    const claimed: GameState = {
      ...LANDED,
      ai: { [AI]: { plan: null, thinking: "buy", failure: null, auctionMax: null, turnStart: null, held: null } },
    };
    createAdminClient.mockReturnValue(
      fakeClient(
        [
          { data: { state: LANDED, version: 5 }, error: null }, // read
          { data: { version: 6 }, error: null }, // claim written
          { data: null, error: null }, // commit lost: the pause landed first
          { data: { state: pausedMeanwhile(claimed), version: 7 }, error: null }, // re-read
          { data: { version: 8 }, error: null }, // the held answer is written
        ],
        writes,
        inserts,
      ),
    );

    const res = await post({ gameId: "g", action: { type: "ai-decide", seat: AI, fromVersion: 5 } });

    expect(res).toMatchObject({ ok: true, version: 8 });
    const held = writes[2].state;
    expect(held.ownership[39]).toBeUndefined();
    expect(aiSeat(held, AI)).toMatchObject({ thinking: "buy", held: { kind: "answer", decision: "buy" } });
    expect(inserts[0].row).toMatchObject({ outcome: "held", turn: null, event_index: null });

    // Resuming settles it.
    const resumeWrites: { state: GameState }[] = [];
    createAdminClient.mockReturnValue(
      fakeClient(
        [
          { data: { state: held, version: 8 }, error: null },
          { data: { version: 9 }, error: null },
        ],
        resumeWrites,
      ),
    );
    const resumed = await post({ gameId: "g", action: { type: "resume" } });

    expect(resumed).toMatchObject({ ok: true, version: 9 });
    const after = resumeWrites[0].state;
    expect(after.pause).toBeNull();
    expect(after.ownership[39]).toBe(AI);
    expect(aiSeat(after, AI)).toMatchObject({ thinking: null, held: null, plan: "Get Park Place." });
  });

  it("commits a failed call as a logged failure that stalls the seat", async () => {
    answering({ ok: false, kind: "unreachable", message: "connection refused", metrics: METRICS });
    const writes: { state: GameState }[] = [];
    createAdminClient.mockReturnValue(
      fakeClient(
        [
          { data: { state: LANDED, version: 5 }, error: null },
          { data: { version: 6 }, error: null },
          { data: { version: 7 }, error: null },
        ],
        writes,
      ),
    );

    const res = await post({ gameId: "g", action: { type: "ai-decide", seat: AI, fromVersion: 5 } });

    expect(res).toMatchObject({ ok: true, version: 7 });
    const committed = writes[1].state;
    expect(aiSeat(committed, AI).failure).toEqual({
      decision: "buy",
      reason: "unreachable: connection refused",
    });
    expect(committed.turns.at(-1)?.events.at(-1)).toMatchObject({ kind: "ai-failed", playerId: AI });
  });

  it("re-reads and re-applies the answer when another write lands first", async () => {
    answering({ ok: true, answer: ANSWER, raw: "{}", thoughts: "", metrics: METRICS });
    const writes: { state: GameState }[] = [];
    const claimed: GameState = {
      ...LANDED,
      ai: { [AI]: { plan: null, thinking: "buy", failure: null, auctionMax: null, turnStart: null, held: null } },
    };
    createAdminClient.mockReturnValue(
      fakeClient(
        [
          { data: { state: LANDED, version: 5 }, error: null }, // read
          { data: { version: 6 }, error: null }, // claim written
          { data: null, error: null }, // commit lost the race
          { data: { state: claimed, version: 7 }, error: null }, // re-read
          { data: { version: 8 }, error: null }, // commit lands
        ],
        writes,
      ),
    );

    const res = await post({ gameId: "g", action: { type: "ai-decide", seat: AI, fromVersion: 5 } });

    expect(res).toMatchObject({ ok: true, version: 8 });
    expect(writes[2].state.ownership[39]).toBe(AI);
  });

  it("does nothing, without calling the model, when the seat owes nothing", async () => {
    answering({ ok: true, answer: ANSWER, raw: "{}", thoughts: "", metrics: METRICS });
    // Another seat's pre-roll: the AI seat owes nothing.
    const idle: GameState = { ...LANDED, turn: { ...HEAD.turn, playerId: "p1" } };
    createAdminClient.mockReturnValue(fakeClient([{ data: { state: idle, version: 5 }, error: null }]));

    const res = await post({ gameId: "g", action: { type: "ai-decide", seat: AI, fromVersion: 5 } });

    expect(res).toMatchObject({ ok: true, version: 5 });
    expect(modelFor).not.toHaveBeenCalled();
  });

  it("rejects a seat that isn't an AI seat", async () => {
    createAdminClient.mockReturnValue(fakeClient([{ data: { state: LANDED, version: 5 }, error: null }]));

    const res = await post({ gameId: "g", action: { type: "ai-decide", seat: "p3", fromVersion: 5 } });

    expect(res).toMatchObject({ ok: false, reason: "not an AI seat" });
  });
});

describe("monopoly route — reviewing AI decisions", () => {
  const AI = "p2";
  const ME = { id: HUMAN, name: "Kyle" };
  // An AI seat's note in the log: turn group 1, event 0.
  const REF = { turn: 1, index: 0 };
  const NOTED: GameState = {
    ...HEAD,
    players: HEAD.players.map((p) => (p.id === AI ? { ...p, botStrategy: "ai:local@llm-v1" } : p)),
    turns: [
      {
        ...HEAD.turns[0],
        events: [
          {
            kind: "bot-note",
            playerId: AI,
            text: "Mine.",
            privateText: "Boardwalk anchors the dark blues.",
            plan: "Get Park Place.",
            ai: {
              decision: "buy",
              version: "llm-v1",
              model: "test-model.gguf",
              ms: 1200,
              thinkMs: null,
              answerMs: 1200,
              promptTokens: 1500,
              completionTokens: 60,
              thinkHitBudget: null,
            },
          },
        ],
      },
      ...HEAD.turns.slice(1),
    ],
  };
  const PAUSED: GameState = { ...NOTED, pause: { by: HUMAN, ref: REF } };

  it("pauses the table and logs the reveal", async () => {
    const writes: { state: GameState }[] = [];
    const inserts: Inserted[] = [];
    createAdminClient.mockReturnValue(
      fakeClient(
        [
          { data: { state: NOTED, version: 5 }, error: null },
          { data: { version: 6 }, error: null },
        ],
        writes,
        inserts,
      ),
    );

    const res = await post({ gameId: "g", action: { type: "review", by: ME, ref: REF } });

    expect(res).toMatchObject({ ok: true, version: 6 });
    expect(writes[0].state.pause).toEqual({ by: HUMAN, ref: REF });
    expect(inserts).toEqual([
      {
        table: "monopoly_ai_reveals",
        row: { game_id: "g", turn: 1, event_index: 0, seat: AI, viewer_id: HUMAN, viewer_name: "Kyle" },
      },
    ]);
  });

  it("leaves an existing pause as it is, but still logs the second reveal", async () => {
    const writes: { state: GameState }[] = [];
    const inserts: Inserted[] = [];
    createAdminClient.mockReturnValue(
      fakeClient([{ data: { state: PAUSED, version: 6 }, error: null }], writes, inserts),
    );

    const res = await post({ gameId: "g", action: { type: "review", by: ME, ref: REF } });

    expect(res).toMatchObject({ ok: true, version: 6 });
    expect(writes).toHaveLength(0);
    expect(inserts).toHaveLength(1);
  });

  it("refuses a review of something that isn't an AI decision", async () => {
    createAdminClient.mockReturnValue(fakeClient([{ data: { state: NOTED, version: 5 }, error: null }]));

    const res = await post({ gameId: "g", action: { type: "review", by: ME, ref: { turn: 1, index: 7 } } });

    expect(res).toMatchObject({ ok: false, reason: "no AI decision there" });
  });

  it("refuses play while paused", async () => {
    createAdminClient.mockReturnValue(fakeClient([{ data: { state: PAUSED, version: 6 }, error: null }]));

    const res = await post({ gameId: "g", action: { type: "submit", intents: [ARM], fromVersion: 6 } });

    expect(res).toMatchObject({ ok: false, reason: "the game is paused" });
  });

  it("resumes, and resuming an unpaused game writes nothing", async () => {
    const writes: { state: GameState }[] = [];
    createAdminClient.mockReturnValue(
      fakeClient(
        [
          { data: { state: PAUSED, version: 6 }, error: null },
          { data: { version: 7 }, error: null },
        ],
        writes,
      ),
    );
    expect(await post({ gameId: "g", action: { type: "resume" } })).toMatchObject({ ok: true, version: 7 });
    expect(writes[0].state.pause).toBeNull();

    const none: { state: GameState }[] = [];
    createAdminClient.mockReturnValue(fakeClient([{ data: { state: NOTED, version: 7 }, error: null }], none));
    expect(await post({ gameId: "g", action: { type: "resume" } })).toMatchObject({ ok: true, version: 7 });
    expect(none).toHaveLength(0);
  });

  it("stores a flag with what the dialog showed, read from the game, then resumes", async () => {
    const writes: { state: GameState }[] = [];
    const inserts: Inserted[] = [];
    createAdminClient.mockReturnValue(
      fakeClient(
        [
          { data: { state: PAUSED, version: 6 }, error: null }, // read for the flag
          { data: { id: 41 }, error: null }, // the decision's call row
          { data: { state: PAUSED, version: 6 }, error: null }, // resume's read
          { data: { version: 7 }, error: null }, // resume written
        ],
        writes,
        inserts,
      ),
    );

    const res = await post({
      gameId: "g",
      action: { type: "flag", by: ME, ref: REF, categories: ["bad-strategy", "bad-strategy"], note: "  Overpaid. " },
    });

    expect(res).toMatchObject({ ok: true, version: 7 });
    expect(writes[0].state.pause).toBeNull();
    expect(inserts).toEqual([
      {
        table: "monopoly_ai_flags",
        row: expect.objectContaining({
          game_id: "g",
          turn: 1,
          event_index: 0,
          seat: AI,
          decision: "buy",
          version: "llm-v1",
          model: "test-model.gguf",
          call_id: 41,
          flagger_id: HUMAN,
          flagger_name: "Kyle",
          categories: ["bad-strategy"],
          note: "Overpaid.",
          shown: expect.objectContaining({
            publicNote: "Mine.",
            privateNote: "Boardwalk anchors the dark blues.",
            plan: "Get Park Place.",
          }),
        }) as unknown,
      },
    ]);
  });

  it("keeps the table paused when a flag can't be stored", async () => {
    const writes: { state: GameState }[] = [];
    createAdminClient.mockReturnValue(
      fakeClient(
        [
          { data: { state: PAUSED, version: 6 }, error: null },
          { data: null, error: null },
        ],
        writes,
        [],
        [{ error: { message: "down" } }],
      ),
    );

    const res = await post({
      gameId: "g",
      action: { type: "flag", by: ME, ref: REF, categories: ["good-move"], note: "" },
    });

    expect(res).toMatchObject({ ok: false, reason: "couldn't store the flag: down" });
    expect(writes).toHaveLength(0);
  });

  it.each([
    { categories: [], note: "  " },
    { categories: ["not-a-category"], note: "x" },
  ])("rejects a flag that says nothing or uses an unknown category", async (flag) => {
    const res = await post({ gameId: "g", action: { type: "flag", by: ME, ref: REF, ...flag } });

    expect(res).toMatchObject({ ok: false, reason: "invalid request" });
  });
});

describe("monopoly route — outdated games", () => {
  // A row from before the current GameState shape (here: before versioning).
  const { stateVersion: _dropped, ...unversioned } = HEAD;
  const OUTDATED = unversioned as GameState;

  it.each([
    { type: "submit", intents: [ARM], fromVersion: 5 },
    { type: "step", fromVersion: 5 },
    { type: "ai-decide", seat: HUMAN, fromVersion: 5 },
    { type: "review", by: { id: HUMAN, name: "Kyle" }, ref: { turn: 1, index: 0 } },
    { type: "resume" },
    { type: "flag", by: { id: HUMAN, name: "Kyle" }, ref: { turn: 1, index: 0 }, categories: ["good-move"], note: "" },
  ])("refuses $type on an outdated row without writing", async (action) => {
    const writes: { state: GameState }[] = [];
    createAdminClient.mockReturnValue(
      fakeClient([{ data: { state: OUTDATED, version: 5 }, error: null }], writes),
    );

    const res = await post({ gameId: "g", action });

    expect(res).toMatchObject({ ok: false });
    if (res.ok) throw new Error("expected a refusal");
    expect(res.reason).toMatch(/outdated version/);
    expect(res.conflict).toBeUndefined();
    expect(writes).toHaveLength(0);
  });

  it("still deletes an outdated row", async () => {
    createAdminClient.mockReturnValue({
      from: () => ({ delete: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    });

    const res = await post({ gameId: "g", action: { type: "delete" } });

    expect(res).toEqual({ ok: true, deleted: true });
  });
});

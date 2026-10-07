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

const { createAdminClient, modelFor } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  modelFor: vi.fn(),
}));
vi.mock("@/shared/lib/supabase/server-admin", () => ({ createAdminClient }));
vi.mock("@/projects/monopoly/bots/ai/model/config", () => ({ modelFor }));

import { aiSeat } from "@/projects/monopoly/bots/ai/seat";
import { freshGame } from "@/projects/monopoly/mocks";
import type { GameState, Intent } from "@/projects/monopoly/types";
import type { MonopolyResult } from "@/projects/monopoly/protocol";
import { POST } from "./route";

const HEAD: GameState = freshGame("route-conflict", undefined, 4);
const HUMAN = HEAD.turn.playerId;
// An arm is legal at any time, so `compute` always reaches the CAS write.
const ARM: Intent = { kind: "set-queue", playerId: HUMAN, queue: "manage", armed: true };

/** A fake Supabase client whose chained query builders resolve `maybeSingle()`
 *  to the queued results in call order. The route calls it for the initial read,
 *  the CAS write, and (on a write-race) the winner re-read. */
function fakeClient(
  results: { data: unknown; error: unknown }[],
  writes: { state: GameState }[] = [],
): unknown {
  const queue = [...results];
  const builder = {
    select: () => builder,
    update: (row: { state: GameState }) => {
      writes.push(row);
      return builder;
    },
    insert: () => builder,
    delete: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(queue.shift() ?? { data: null, error: null }),
  };
  return { from: () => builder };
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
      p.id === AI ? { ...p, botStrategy: "ai:local", position: 39 } : p,
    ),
    turn: { ...HEAD.turn, playerId: AI, phase: "buy-decision", pendingBuy: 39 },
  };
  const ANSWER = {
    privateNote: "Boardwalk anchors the dark blues.",
    choice: "buy",
    mortgage: [],
    publicNote: "Mine.",
    plan: "Get Park Place.",
  };

  function answering(result: unknown): void {
    modelFor.mockReturnValue({ complete: () => Promise.resolve(result) });
  }

  it("claims the seat, asks the model, and commits its answer", async () => {
    answering({ ok: true, answer: ANSWER, thoughts: "", ms: 1 });
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
  });

  it("commits a failed call as a logged failure that stalls the seat", async () => {
    answering({ ok: false, kind: "unreachable", message: "connection refused" });
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
    answering({ ok: true, answer: ANSWER, thoughts: "", ms: 1 });
    const writes: { state: GameState }[] = [];
    const claimed: GameState = {
      ...LANDED,
      ai: { [AI]: { plan: null, thinking: "buy", failure: null, auctionMax: null, turnStart: null } },
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
    answering({ ok: true, answer: ANSWER, thoughts: "", ms: 1 });
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

describe("monopoly route — outdated games", () => {
  // A row from before the current GameState shape (here: before versioning).
  const { stateVersion: _dropped, ...unversioned } = HEAD;
  const OUTDATED = unversioned as GameState;

  it.each([
    { type: "submit", intents: [ARM], fromVersion: 5 },
    { type: "step", fromVersion: 5 },
    { type: "ai-decide", seat: HUMAN, fromVersion: 5 },
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

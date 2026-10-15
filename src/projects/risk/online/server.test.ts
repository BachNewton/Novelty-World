import { describe, expect, it, vi } from "vitest";
import type { Answer, Move, RiskEngine } from "../contract";
import { BOTS } from "./bots";
import { STALE_DECISION } from "./game";
import type { Request } from "./protocol";
import { COMMIT_ATTEMPTS, commit, drive, DRIVE_DECISIONS, handle, type ServerDeps } from "./server";
import { stubEngine } from "./stub-engine";
import { botToMove, type GameRow } from "./table";
import { memoryStore, testDeps } from "./testing";

const ENGINE: RiskEngine = stubEngine;
const ALICE = { id: "alice", name: "Alice" };
const BOB = { id: "bob", name: "Bob" };
const CAROL = { id: "carol", name: "Carol" };

async function ok(deps: ServerDeps, request: Request): Promise<GameRow> {
  const response = await handle(deps, request);
  if (!response.ok) throw new Error(response.reason);
  return response.row;
}

/** A started game of three people, so no bot moves on its own. */
async function humanGame() {
  const db = memoryStore();
  const deps = testDeps(ENGINE, db.store);
  await ok(deps, { op: "create", profile: ALICE });
  await ok(deps, { op: "join", game: "GAME", profile: BOB });
  await ok(deps, { op: "join", game: "GAME", profile: CAROL });
  const row = await ok(deps, { op: "start", game: "GAME", profile: ALICE });
  return { db, deps, row };
}

const PROFILES = [ALICE, BOB, CAROL];

/** The pending seat's first legal move, as its player would send it. */
function nextMove(row: GameRow): { request: Request; answer: Answer } {
  if (!row.game) throw new Error("Not started");
  const seat = ENGINE.view(row.game.engine, null).active;
  const options = ENGINE.options(row.game.engine, seat);
  if (options?.kind !== "setup-place") throw new Error(`Expected setup, got ${String(options?.kind)}`);
  const move: Move = { kind: "place", territory: options.ownTerritories[0], armies: 1 };
  const answer = { decision: row.game.decision, seat, move };
  return { answer, request: { op: "move", game: row.id, profile: PROFILES[seat], answer } };
}

describe("the lobby", () => {
  it("creates a game with its creator in the first seat, retrying a code that is taken", async () => {
    const db = memoryStore();
    const deps = testDeps(ENGINE, db.store, ["TAKN", "TAKN", "FREE"]);
    await ok(deps, { op: "create", profile: BOB });
    const row = await ok(deps, { op: "create", profile: ALICE });
    expect(row).toMatchObject({ id: "FREE", version: 0, status: "lobby", seats: [{ kind: "human", profile: ALICE }], game: null });
  });

  it("joins once, however often a player asks", async () => {
    const deps = testDeps(ENGINE, memoryStore().store);
    await ok(deps, { op: "create", profile: ALICE });
    await ok(deps, { op: "join", game: "GAME", profile: BOB });
    const row = await ok(deps, { op: "join", game: "GAME", profile: BOB });
    expect(row.seats).toHaveLength(2);
    expect(row.version).toBe(1);
  });

  it("starts only with 3 to 6 seats, bots filling the table", async () => {
    const db = memoryStore();
    const deps = testDeps(ENGINE, db.store);
    await ok(deps, { op: "create", profile: ALICE });
    await ok(deps, { op: "add-bot", game: "GAME", profile: ALICE });
    expect(await handle(deps, { op: "start", game: "GAME", profile: ALICE })).toMatchObject({ ok: false });
    for (let i = 0; i < 4; i++) await ok(deps, { op: "add-bot", game: "GAME", profile: ALICE });
    expect(await handle(deps, { op: "add-bot", game: "GAME", profile: ALICE })).toMatchObject({ ok: false, reason: "The table is full" });
    const row = await ok(deps, { op: "start", game: "GAME", profile: ALICE });
    expect(row.status).toBe("playing");
    expect(ENGINE.view(row.game?.engine ?? { engineState: null }, null).seats).toHaveLength(6);
  });

  it("lets only seated players change the table, and keeps a person at it", async () => {
    const db = memoryStore();
    const deps = testDeps(ENGINE, db.store);
    await ok(deps, { op: "create", profile: ALICE });
    expect(await handle(deps, { op: "add-bot", game: "GAME", profile: BOB })).toMatchObject({ ok: false, reason: "Join the game first" });
    expect(await handle(deps, { op: "remove-seat", game: "GAME", profile: ALICE, seat: 0 })).toMatchObject({ ok: false });
  });

  it("says when there is no such game", async () => {
    const deps = testDeps(ENGINE, memoryStore().store);
    expect(await handle(deps, { op: "join", game: "NONE", profile: ALICE })).toEqual({ ok: false, reason: "There's no game with that code", row: null });
  });
});

describe("moves", () => {
  it("applies an answer to the pending decision and raises the next", async () => {
    const { deps, row } = await humanGame();
    const { request } = nextMove(row);
    const after = await ok(deps, request);
    expect(after.game?.decision).toBe(1);
    expect(after.version).toBe(row.version + 1);
  });

  it("accepts a repeated answer that already landed as it is, and rejects a different one to the same decision", async () => {
    const { deps, db, row } = await humanGame();
    const { request, answer } = nextMove(row);
    const landed = await ok(deps, request);
    const writes = db.hooks.writes;
    expect(await handle(deps, request)).toEqual({ ok: true, row: landed });
    expect(db.hooks.writes).toBe(writes);
    const options = ENGINE.options(row.game?.engine ?? { engineState: null }, answer.seat);
    if (options?.kind !== "setup-place") throw new Error("Expected setup");
    const other: Answer = { ...answer, move: { kind: "place", territory: options.ownTerritories[1], armies: 1 } };
    expect(await handle(deps, { op: "move", game: row.id, profile: PROFILES[answer.seat], answer: other })).toMatchObject({
      ok: false,
      reason: STALE_DECISION,
      row: landed,
    });
  });

  it("rejects a move for someone else's seat, and an illegal move, with the row as it is", async () => {
    const { deps, row } = await humanGame();
    const { answer } = nextMove(row);
    const stranger = PROFILES[(answer.seat + 1) % 3];
    expect(await handle(deps, { op: "move", game: row.id, profile: stranger, answer })).toMatchObject({ ok: false, reason: "That seat isn't yours", row });
    const illegal: Answer = { ...answer, move: { kind: "end-turn" } };
    expect(await handle(deps, { op: "move", game: row.id, profile: PROFILES[answer.seat], answer: illegal })).toMatchObject({ ok: false, row });
  });

  it("re-reads and re-applies after losing the write race", async () => {
    const { deps, db, row } = await humanGame();
    const { request } = nextMove(row);
    // A lobby-free write (a profile rename) lands between the commit's read and write.
    db.hooks.beforeWrite = (id) => {
      const current = db.rows.get(id);
      if (current) db.rows.set(id, { ...current, version: current.version + 1 });
    };
    const after = await ok(deps, request);
    expect(after.version).toBe(row.version + 2);
    expect(after.game?.decision).toBe(1);
  });

  it("fails loudly when it loses the race every time", async () => {
    const { db } = await humanGame();
    const step = () => ({ kind: "changed" as const, change: { status: "playing" as const, seats: [], game: null } });
    const always = { ...db.store, write: vi.fn(() => Promise.resolve(null)) };
    await expect(commit(always, "GAME", step)).rejects.toThrow(/lost the write race/);
    expect(always.write).toHaveBeenCalledTimes(COMMIT_ATTEMPTS);
  });
});

/** A started game with Alice and `bots` bots. */
async function botGame(bots: number) {
  const db = memoryStore();
  const deps = testDeps(ENGINE, db.store);
  await ok(deps, { op: "create", profile: ALICE });
  for (let i = 0; i < bots; i++) await ok(deps, { op: "add-bot", game: "GAME", profile: ALICE });
  const row = await ok(deps, { op: "start", game: "GAME", profile: ALICE });
  return { db, deps, row };
}

describe("driving bot seats", () => {
  it("plays the bots until the game waits on a person", async () => {
    const { deps, db } = await botGame(2);
    expect(await drive(deps, "GAME")).toBe("done");
    const row = db.rows.get("GAME");
    if (!row?.game) throw new Error("No game");
    expect(botToMove(ENGINE, row)).toBeNull();
    expect(ENGINE.view(row.game.engine, null).active).toBe(0);
  });

  it("does nothing when no bot is to move", async () => {
    const { deps, db } = await humanGame();
    const writes = db.hooks.writes;
    expect(await drive(deps, "GAME")).toBe("done");
    expect(db.hooks.writes).toBe(writes);
  });

  it("lands one answer per decision when two drives run at once", async () => {
    const one = await botGame(2);
    await drive(one.deps, "GAME");
    const two = await botGame(2);
    await Promise.all([drive(two.deps, "GAME"), drive(two.deps, "GAME")]);
    expect(two.db.rows.get("GAME")?.game).toEqual(one.db.rows.get("GAME")?.game);
  });

  it("hands on to a fresh drive after its decisions run out", async () => {
    const { deps, db } = await botGame(2);
    const row = db.rows.get("GAME");
    if (!row) throw new Error("No game");
    // Every seat a bot, so the drive never reaches a person.
    db.rows.set("GAME", { ...row, seats: row.seats.map(() => ({ kind: "bot", bot: "random" })) });
    const result = await drive(deps, "GAME");
    const after = db.rows.get("GAME");
    expect(result === "more" || after?.status === "over").toBe(true);
    if (result === "more") expect(after?.game?.decision).toBe(DRIVE_DECISIONS);
  });

  it("plays the random bot's move instead of an illegal one, and says so", async () => {
    const { deps, db } = await botGame(2);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const real = BOTS.random.bot;
    let calls = 0;
    BOTS.random.bot = (input) => (calls++ === 0 ? { move: { kind: "end-turn" }, work: 1 } : real(input));
    let logged: number;
    try {
      await drive(deps, "GAME");
      logged = error.mock.calls.length;
    } finally {
      BOTS.random.bot = real;
      error.mockRestore();
    }
    expect(logged).toBe(1);
    expect(db.rows.get("GAME")?.game?.decision).toBeGreaterThan(0);
  });
});

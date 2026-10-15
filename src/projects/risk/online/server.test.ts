import { describe, expect, it, vi } from "vitest";
import type { Answer, CardId, Move } from "../contract";
import { position } from "../engine/test-kit";
import { replay, STALE_DECISION, type OnlineGame } from "./game";
import type { Request } from "./protocol";
import { COMMIT_ATTEMPTS, commit, drive, DRIVE_DECISIONS, handle, type ServerDeps } from "./server";
import { ENGINE } from "../play-engine";
import { SEAT_BOTS } from "./seat-bots";
import { botToMove, type GameRow } from "./table";
import { memoryStore, testDeps } from "./testing";

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
  if (options?.kind !== "reinforce") throw new Error(`Expected a reinforcement, got ${String(options?.kind)}`);
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
    if (options?.kind !== "reinforce") throw new Error("Expected a reinforcement");
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
    const step = () => ({ kind: "changed" as const, change: { status: "playing" as const, seats: [], game: null }, answer: null });
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

describe("the move log", () => {
  it("logs every accepted answer once, with who gave it, and replays to the row's game", async () => {
    const { deps, db } = await botGame(2);
    await drive(deps, "GAME");
    const row = db.rows.get("GAME");
    if (!row?.game) throw new Error("No game");
    const human = nextMove(row);
    // Alice's answer, sent twice: the repeat lands nothing.
    expect(human.answer.seat).toBe(0);
    await ok(deps, human.request);
    await ok(deps, human.request);
    await drive(deps, "GAME");
    const after = db.rows.get("GAME");
    const log = db.moves.get("GAME") ?? [];
    if (!after?.game) throw new Error("No game");
    expect(log.map((m) => m.decision)).toEqual(Array.from({ length: after.game.decision }, (_, i) => i));
    expect(log.find((m) => m.decision === human.answer.decision)?.controller).toEqual({ kind: "human", profile: ALICE });
    expect(log.filter((m) => m.controller.kind === "bot").length).toBe(log.length - 1);
    expect(replay(ENGINE, after.game.players, after.game.seed, log)).toEqual(after.game);
  });

  it("replays a long run of bot decisions", async () => {
    const { deps, db } = await botGame(2);
    const row = db.rows.get("GAME");
    if (!row) throw new Error("No game");
    db.rows.set("GAME", { ...row, seats: row.seats.map(() => ({ kind: "bot", bot: "random" })) });
    await drive(deps, "GAME");
    const after = db.rows.get("GAME");
    if (!after?.game) throw new Error("No game");
    expect(replay(ENGINE, after.game.players, after.game.seed, db.moves.get("GAME") ?? [])).toEqual(after.game);
  });
});

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

  it("fails loudly on a bot's illegal move, rather than playing on", async () => {
    const { deps, db } = await botGame(2);
    const real = SEAT_BOTS.random.bot;
    SEAT_BOTS.random.bot = () => ({ kind: "end-turn" });
    try {
      await expect(drive(deps, "GAME")).rejects.toThrow(/bot "random" at seat \d made an illegal move at decision 0/);
    } finally {
      SEAT_BOTS.random.bot = real;
    }
    expect(db.rows.get("GAME")?.game?.decision).toBe(0);
  });

  it("plays a bot through a trade that must name its +2 territory", async () => {
    // Seat 0, a bot, holds five cards picturing its own territories: it must trade, and every
    // set it can make pictures three of its territories, so the trade must say which takes the
    // bonus (`CARDS-7`).
    const hand: CardId[] = ["alaska", "northwest-territory", "greenland", "alberta", "ontario"];
    const engine = position({
      hands: [hand, [], []],
      board: { ...Object.fromEntries(hand.map((t) => [t, [0, 3]])), brazil: [2, 2], peru: [2, 2], argentina: [2, 2] },
      rest: [1, 2],
    });
    const db = memoryStore();
    const deps = testDeps(ENGINE, db.store);
    const game: OnlineGame = { seed: "trade", players: 3, engine, decision: 0, lastEvents: [], answered: [] };
    db.rows.set("GAME", { id: "GAME", version: 1, status: "playing", seats: [{ kind: "bot", bot: "random" }, { kind: "human", profile: BOB }, { kind: "human", profile: CAROL }], game });
    expect(ENGINE.options(engine, 0)).toMatchObject({ kind: "reinforce", mustTrade: true });

    await drive(deps, "GAME");

    const trade = db.moves.get("GAME")?.[0]?.move;
    expect(trade).toMatchObject({ kind: "trade" });
    expect(trade?.kind === "trade" && trade.bonusTerritory).toBeTruthy();
    expect(ENGINE.view(db.rows.get("GAME")?.game?.engine ?? engine, null).active).not.toBe(0);
  });
});

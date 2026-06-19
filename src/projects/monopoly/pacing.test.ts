import { describe, expect, it } from "vitest";
import { freshGame } from "./mocks";
import {
  DEFAULT_TURN_MS,
  classifyRedirect,
  driveOp,
  glideAnimMs,
  ingestSnapshot,
  paceTransition,
  redirectPauseMs,
  slideAnimMs,
  type Snapshot,
} from "./pacing";
import type { Bot } from "./bots/registry";
import type { GameEvent, GameState, Player, TurnGroup } from "./types";

// freshGame seats p1 as the human and p2..p4 as bots, p1 active at pre-roll.
// Pin the bots to the `dumb` baseline so the pacer's default-resolver tests
// assert note-less reactive intents — these exercise the pacer, not a strategy;
// the proactive suite below injects its own policies regardless.
const base: GameState = (() => {
  const game = freshGame();
  return {
    ...game,
    players: game.players.map((p) =>
      p.botStrategy !== null ? { ...p, botStrategy: "dumb" } : p,
    ),
  };
})();

function withTurn(state: GameState, patch: Partial<GameState["turn"]>): GameState {
  return { ...state, turn: { ...state.turn, ...patch } };
}

function mapPlayer(
  state: GameState,
  id: string,
  patch: Partial<Player>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  };
}

describe("driveOp — drive gating", () => {
  it("never drives while the playback head lags the authoritative head", () => {
    // Even on a turn this client would otherwise drive, a non-caught-up head
    // means snapshots are still queued ahead — animate them first.
    expect(driveOp(base, false, "p1")).toBeNull();
  });

  it("steps the local human's own pre-roll once caught up", () => {
    expect(driveOp(base, true, "p1")).toEqual({ kind: "step" });
  });

  it("proxies a bot seat's mechanical beat once caught up", () => {
    const botTurn = withTurn(base, { playerId: "p2" });
    expect(driveOp(botTurn, true, "p1")).toEqual({ kind: "step" });
  });

  it("ends the active player's own post-roll turn", () => {
    const postRoll = withTurn(base, { phase: "post-roll" });
    expect(driveOp(postRoll, true, "p1")).toEqual({
      kind: "intent",
      intent: { kind: "end-turn", playerId: "p1" },
    });
  });
});

describe("driveOp — human-turn sync barrier", () => {
  // Model a second connected human (p2) and view from p1's client.
  const otherHumanActive = withTurn(mapPlayer(base, "p2", { botStrategy: null }), {
    playerId: "p2",
  });

  it("does not drive another connected human's turn, even when caught up", () => {
    // This is the barrier: p1's client can only PLAY snapshots for p2's turn,
    // never drive it — so the row cannot advance past p2 until p2's own client
    // does, and every client reconverges there.
    expect(driveOp(otherHumanActive, true, "p1")).toBeNull();
  });

  it("is also null when not caught up (both gates hold)", () => {
    expect(driveOp(otherHumanActive, false, "p1")).toBeNull();
  });

  it("is idle for a finished game and a human's own intermission", () => {
    expect(driveOp({ ...base, status: "finished" }, true, "p1")).toBeNull();
    // A human's manage intermission is driven by their own UI, never the pacer
    // (p1 is the human seat in freshGame). A BOT manager's intermission IS
    // driven — see the proactive-infra suite below.
    expect(driveOp(withTurn(base, { phase: "managing", managerId: "p1" }), true, "p1")).toBeNull();
  });
});

describe("driveOp — jail decision", () => {
  it("proxies a bot's jail pay when it can afford the fine", () => {
    const botJail = withTurn(base, { playerId: "p2", phase: "jail-decision" });
    expect(driveOp(botJail, true, "p1")).toEqual({
      kind: "intent",
      intent: { kind: "pay-to-leave-jail", playerId: "p2" },
    });
  });

  it("steps a bot's jail roll when it can neither pay nor use a card", () => {
    const botJail = mapPlayer(
      withTurn(base, { playerId: "p2", phase: "jail-decision" }),
      "p2",
      { cash: 0 },
    );
    expect(driveOp(botJail, true, "p1")).toEqual({ kind: "step" });
  });

  it("leaves the local human's own jail decision to their UI", () => {
    const myJail = withTurn(base, { phase: "jail-decision" });
    expect(driveOp(myJail, true, "p1")).toBeNull();
  });

  it("does not drive another connected human's jail decision", () => {
    const otherJail = withTurn(mapPlayer(base, "p2", { botStrategy: null }), {
      playerId: "p2",
      phase: "jail-decision",
    });
    expect(driveOp(otherJail, true, "p1")).toBeNull();
  });

  it("steps to open the local human's own arm from their jail decision", () => {
    // The jailed player may trade / manage before deciding: an armed intent makes
    // the jail decision a pre-roll-like boundary the player's own client drives.
    const armed: GameState = {
      ...withTurn(base, { phase: "jail-decision" }),
      boundaryQueue: [{ playerId: "p1", kind: "manage" }],
    };
    expect(driveOp(armed, true, "p1")).toEqual({ kind: "step" });
  });

  it("steps to open an off-turn player's arm while the jailed player still decides", () => {
    const armed: GameState = {
      ...withTurn(base, { playerId: "p1", phase: "jail-decision" }),
      boundaryQueue: [{ playerId: "p3", kind: "trade" }],
    };
    expect(driveOp(armed, true, "p1")).toEqual({ kind: "step" });
  });

  it("holds the barrier: never drives another human's jail decision, even with an arm", () => {
    const armed: GameState = {
      ...withTurn(mapPlayer(base, "p2", { botStrategy: null }), {
        playerId: "p2",
        phase: "jail-decision",
      }),
      boundaryQueue: [{ playerId: "p1", kind: "trade" }],
    };
    expect(driveOp(armed, true, "p1")).toBeNull();
  });
});

// The proactive path lets a bot INITIATE — arm a boundary action at its own
// pre-roll, then drive the intermission to a commit. No shipped strategy does
// this yet (dumb/claude are reactive), so it's verified here with mock policies
// injected through `driveOp`'s resolver. freshGame seats p2 as a bot; we view
// from the human p1's client (any client may proxy a bot).
describe("driveOp — proactive bot infrastructure", () => {
  // A resolver that hands `bot` to the p2 seat only, mirroring the real
  // registry resolver (a bot policy for a bot seat, null for everyone else).
  const onlyP2 = (bot: Bot) => (_s: GameState, id: string): Bot | null =>
    id === "p2" ? bot : null;

  const botTurn = (turn: Partial<GameState["turn"]>): GameState =>
    withTurn(base, { playerId: "p2", ...turn });

  it("submits a bot's pre-roll arm before rolling", () => {
    const armManage: Bot = () => ({
      intent: { kind: "set-queue", playerId: "p2", queue: "manage", armed: true },
    });
    expect(driveOp(botTurn({}), true, "p1", onlyP2(armManage))).toEqual({
      kind: "intent",
      intent: { kind: "set-queue", playerId: "p2", queue: "manage", armed: true },
    });
  });

  it("carries a bot decision's reasoning note onto the drive op", () => {
    const armWithNote: Bot = () => ({
      intent: { kind: "set-queue", playerId: "p2", queue: "manage", armed: true },
      note: "Developing my oranges.",
    });
    expect(driveOp(botTurn({}), true, "p1", onlyP2(armWithNote))).toEqual({
      kind: "intent",
      intent: { kind: "set-queue", playerId: "p2", queue: "manage", armed: true },
      note: "Developing my oranges.",
    });
  });

  it("skips a redundant arm the queue already reflects and rolls instead", () => {
    // Once armed, re-submitting the same arm is an idempotent no-op that would
    // spin (each write bumps the version, re-triggering the drive). The pacer
    // falls through to `step`, which is what drains the queue into managing.
    const armManage: Bot = () => ({
      intent: { kind: "set-queue", playerId: "p2", queue: "manage", armed: true },
    });
    const alreadyArmed: GameState = {
      ...botTurn({}),
      boundaryQueue: [{ playerId: "p2", kind: "manage" }],
    };
    expect(driveOp(alreadyArmed, true, "p1", onlyP2(armManage))).toEqual({
      kind: "step",
    });
  });

  it("ignores a non-arm intent at pre-roll and rolls (only set-queue is legal there)", () => {
    const wrong: Bot = () => ({
      intent: { kind: "manage", playerId: "p2", build: {}, mortgage: {} },
    });
    expect(driveOp(botTurn({}), true, "p1", onlyP2(wrong))).toEqual({ kind: "step" });
  });

  it("rolls when the bot wants no proactive action (returns null)", () => {
    const idle: Bot = () => null;
    expect(driveOp(botTurn({}), true, "p1", onlyP2(idle))).toEqual({ kind: "step" });
  });

  it("arms an OFF-TURN bot's trade at the active player's boundary", () => {
    // p3 is a bot, NOT the active player (p2 is). It still gets to arm a trade —
    // the engine opens a queued intermission for whoever armed it, even off-turn.
    const onlyP3 = (bot: Bot) => (_s: GameState, id: string): Bot | null =>
      id === "p3" ? bot : null;
    const armTrade: Bot = () => ({
      intent: { kind: "set-queue", playerId: "p3", queue: "trade", armed: true },
    });
    expect(driveOp(botTurn({}), true, "p1", onlyP3(armTrade))).toEqual({
      kind: "intent",
      intent: { kind: "set-queue", playerId: "p3", queue: "trade", armed: true },
    });
  });

  it("drives a bot buyer's raising-cash intermission", () => {
    const raiseBot: Bot = () => ({
      intent: { kind: "buy", playerId: "p2" },
      note: "Raised the cash — buying it.",
    });
    const state = botTurn({ phase: "raising-cash", pendingBuy: 16 });
    expect(driveOp(state, true, "p1", onlyP2(raiseBot))).toEqual({
      kind: "intent",
      intent: { kind: "buy", playerId: "p2" },
      note: "Raised the cash — buying it.",
    });
  });

  it("cancels a bot buyer's stalled raising-cash back to the buy-decision", () => {
    const idle: Bot = () => null;
    const state = botTurn({ phase: "raising-cash", pendingBuy: 16 });
    expect(driveOp(state, true, "p1", onlyP2(idle))).toEqual({
      kind: "intent",
      intent: { kind: "cancel-manage", playerId: "p2" },
    });
  });

  it("drives a bot manager's managing intermission to its commit", () => {
    const buildBot: Bot = () => ({
      intent: { kind: "manage", playerId: "p2", build: { 16: 1 }, mortgage: {} },
    });
    const state = botTurn({ phase: "managing", managerId: "p2" });
    expect(driveOp(state, true, "p1", onlyP2(buildBot))).toEqual({
      kind: "intent",
      intent: { kind: "manage", playerId: "p2", build: { 16: 1 }, mortgage: {} },
    });
  });

  it("cancels a bot's managing intermission if its policy stalls (returns null)", () => {
    const idle: Bot = () => null;
    const state = botTurn({ phase: "managing", managerId: "p2" });
    expect(driveOp(state, true, "p1", onlyP2(idle))).toEqual({
      kind: "intent",
      intent: { kind: "cancel-manage", playerId: "p2" },
    });
  });

  it("drives a bot proposer's trade-building to its draft/propose intents", () => {
    const proposeBot: Bot = () => ({ intent: { kind: "propose-trade", playerId: "p2" } });
    const state = botTurn({
      phase: "trade-building",
      tradeDraft: { proposerId: "p2", propertyTo: { 1: "p3" }, gojfTo: {}, cashDelta: {} },
    });
    expect(driveOp(state, true, "p1", onlyP2(proposeBot))).toEqual({
      kind: "intent",
      intent: { kind: "propose-trade", playerId: "p2" },
    });
  });

  it("cancels a bot's trade-building if its policy stalls (returns null)", () => {
    const idle: Bot = () => null;
    const state = botTurn({
      phase: "trade-building",
      tradeDraft: { proposerId: "p2", propertyTo: {}, gojfTo: {}, cashDelta: {} },
    });
    expect(driveOp(state, true, "p1", onlyP2(idle))).toEqual({
      kind: "intent",
      intent: { kind: "cancel-trade", playerId: "p2" },
    });
  });

  it("never drives a human's intermission, even with a proactive resolver", () => {
    // managerId p1 is the human seat; the resolver returns null for non-p2, so
    // the pacer leaves it to the human's UI.
    const anyBot: Bot = () => ({ intent: { kind: "cancel-manage", playerId: "p1" } });
    const state = withTurn(base, { phase: "managing", managerId: "p1" });
    expect(driveOp(state, true, "p1", onlyP2(anyBot))).toBeNull();
  });
});

describe("paceTransition", () => {
  it("reads a handoff to a new active player as a glide", () => {
    const from = base;
    const to = withTurn(base, { playerId: "p2" });
    const pace = paceTransition(from, to, DEFAULT_TURN_MS);
    expect(pace.phase).toBe("glide");
    expect(pace.durationMs).toBe(Math.round(DEFAULT_TURN_MS * 0.35));
  });

  it("reads the active player moving as a slide", () => {
    const from = base;
    const to = mapPlayer(base, "p1", { position: 6 });
    const pace = paceTransition(from, to, DEFAULT_TURN_MS);
    expect(pace.phase).toBe("slide");
    expect(pace.durationMs).toBe(Math.round(DEFAULT_TURN_MS * 0.65));
  });

  it("reads a non-visual commit (buy, mortgage) as a free settle", () => {
    const from = withTurn(base, { phase: "buy-decision", pendingBuy: 1 });
    const to = withTurn(base, { phase: "post-roll" });
    const pace = paceTransition(from, to, DEFAULT_TURN_MS);
    expect(pace.phase).toBe("settle");
    expect(pace.durationMs).toBe(0);
  });

  it("budgets a plain turn (one glide + one slide) to ~TURN_MS", () => {
    const handoff = paceTransition(base, withTurn(base, { playerId: "p2" }), DEFAULT_TURN_MS);
    const move = paceTransition(base, mapPlayer(base, "p1", { position: 6 }), DEFAULT_TURN_MS);
    expect(handoff.durationMs + move.durationMs).toBe(DEFAULT_TURN_MS);
  });
});

describe("classifyRedirect", () => {
  const roll = (toPosition: number, doublesStreak = 0): GameEvent => ({
    kind: "roll",
    dice: [1, 1],
    doublesStreak,
    toPosition,
    passedGo: false,
  });

  // A destination snapshot where p1 rolled this beat and ended at `resolved`,
  // with `events` recording the beat. A handoff (Go-to-Jail ends the turn) puts
  // the next player's empty group after p1's, exactly as the engine leaves it.
  const dest = (
    resolved: number,
    events: GameEvent[],
    handoff = false,
  ): GameState => {
    const moved = mapPlayer(base, "p1", { position: resolved });
    const groups: TurnGroup[] = [{ turn: 1, playerId: "p1", events }];
    if (handoff) groups.push({ turn: 2, playerId: "p2", events: [] });
    return {
      ...withTurn(moved, { playerId: handoff ? "p2" : "p1" }),
      turns: groups,
    };
  };

  it("reads an 'advance to' card as a forward redirect", () => {
    // Rolled onto Chance (22), the card advances forward to Illinois (24).
    const to = dest(24, [
      roll(22),
      { kind: "card-drawn", source: "chance", cardId: "chance-illinois" },
    ]);
    expect(classifyRedirect(to, "p1", 18)).toEqual({
      rolledTo: 22,
      resolved: 24,
      finish: "forward",
      handoff: false,
    });
  });

  it("reads 'back 3' as a backward redirect", () => {
    // Rolled onto Chance (36), the card steps back to 33.
    const to = dest(33, [
      roll(36),
      { kind: "card-drawn", source: "chance", cardId: "chance-back-3" },
    ]);
    expect(classifyRedirect(to, "p1", 30)).toEqual({
      rolledTo: 36,
      resolved: 33,
      finish: "back",
      handoff: false,
    });
  });

  it("reads a Go-to-Jail tile as a jail redirect that hands off", () => {
    // Rolled onto Go-to-Jail (30), sent to the Jail cell (10); turn ends.
    const to = dest(10, [roll(30), { kind: "go-to-jail", reason: "tile" }], true);
    expect(classifyRedirect(to, "p1", 27)).toEqual({
      rolledTo: 30,
      resolved: 10,
      finish: "jail",
      handoff: true,
    });
  });

  it("reads a Go-to-Jail card as a jail redirect that hands off", () => {
    const to = dest(
      10,
      [
        roll(22),
        { kind: "card-drawn", source: "chance", cardId: "chance-jail" },
        { kind: "go-to-jail", reason: "card" },
      ],
      true,
    );
    expect(classifyRedirect(to, "p1", 18)).toMatchObject({
      finish: "jail",
      handoff: true,
    });
  });

  it("is NOT a redirect on three doubles — the token never moved", () => {
    // The would-be square (31) is recorded on the roll, but the engine jails
    // straight from the pre-roll square, so this stays a plain snap + glide.
    const to = dest(
      10,
      [roll(31, 3), { kind: "go-to-jail", reason: "three-doubles" }],
      true,
    );
    expect(classifyRedirect(to, "p1", 25)).toBeNull();
  });

  it("is null for a plain move (dice landed where they ended)", () => {
    const to = dest(24, [roll(24)]);
    expect(classifyRedirect(to, "p1", 18)).toBeNull();
  });

  it("is null when the mover did not move this beat", () => {
    // A later beat (e.g. a buy) with a stale earlier roll: same start + end.
    const to = dest(24, [roll(22), { kind: "buy", position: 24, price: 100 }]);
    expect(classifyRedirect(to, "p1", 24)).toBeNull();
  });
});

describe("paceTransition — redirect dwell", () => {
  const roll = (toPosition: number): GameEvent => ({
    kind: "roll",
    dice: [1, 1],
    doublesStreak: 0,
    toPosition,
    passedGo: false,
  });

  it("budgets a card redirect as two slides plus the pause", () => {
    const from = mapPlayer(base, "p1", { position: 18 });
    const to: GameState = {
      ...mapPlayer(base, "p1", { position: 24 }),
      turns: [
        {
          turn: 1,
          playerId: "p1",
          events: [
            roll(22),
            { kind: "card-drawn", source: "chance", cardId: "chance-illinois" },
          ],
        },
      ],
    };
    const pace = paceTransition(from, to, DEFAULT_TURN_MS);
    expect(pace.phase).toBe("redirect");
    expect(pace.durationMs).toBe(Math.round(DEFAULT_TURN_MS * (0.65 * 2 + 0.3)));
  });

  it("budgets a Go-to-Jail redirect as a slide, the pause, the reveal + hold, and the handoff glide", () => {
    const from = mapPlayer(base, "p1", { position: 27 });
    const to: GameState = {
      ...withTurn(mapPlayer(base, "p1", { position: 10 }), { playerId: "p2" }),
      turns: [
        {
          turn: 1,
          playerId: "p1",
          events: [roll(30), { kind: "go-to-jail", reason: "tile" }],
        },
        { turn: 2, playerId: "p2", events: [] },
      ],
    };
    const pace = paceTransition(from, to, DEFAULT_TURN_MS);
    expect(pace.phase).toBe("redirect");
    // slide + 2 glides (reveal-jail, hand-off) + 2 pauses (on-tile, jail-hold).
    expect(pace.durationMs).toBe(
      Math.round(DEFAULT_TURN_MS * (0.65 + 0.35 * 2 + 0.3 * 2)),
    );
  });

  it("scales the inter-leg pause with turnMs", () => {
    expect(redirectPauseMs(DEFAULT_TURN_MS)).toBe(Math.round(DEFAULT_TURN_MS * 0.3));
    expect(redirectPauseMs(DEFAULT_TURN_MS * 2)).toBe(
      redirectPauseMs(DEFAULT_TURN_MS) * 2,
    );
  });

  it("budgets enough dwell to cover the animation sequence the board plays", () => {
    // The store budgets a redirect's dwell here (redirectDwell, via
    // paceTransition); the board's `advanceFrom` (components/squares.tsx)
    // independently sequences the motion from the same per-phase anim helpers.
    // They live far apart and must stay in sync — if the played sequence ever
    // outran the budgeted dwell, the next snapshot would arrive mid-animation
    // and snap. The worst case binds at a huge distance, where every slide and
    // glide hits its phase-budget cap; if that fits, every real board distance
    // fits too (the anim helpers are monotonic up to their caps).
    const turnMs = DEFAULT_TURN_MS;
    const BIG = 100_000;

    // Card redirect → leg-1 slide, the pause, leg-2 slide.
    const cardTo: GameState = {
      ...mapPlayer(base, "p1", { position: 24 }),
      turns: [
        {
          turn: 1,
          playerId: "p1",
          events: [
            roll(22),
            { kind: "card-drawn", source: "chance", cardId: "chance-illinois" },
          ],
        },
      ],
    };
    const cardBudget = paceTransition(
      mapPlayer(base, "p1", { position: 18 }),
      cardTo,
      turnMs,
    ).durationMs;
    const cardSequence =
      slideAnimMs(turnMs, BIG) +
      redirectPauseMs(turnMs) +
      slideAnimMs(turnMs, BIG);
    expect(cardSequence).toBeLessThanOrEqual(cardBudget);

    // Go-to-Jail redirect → leg-1 slide, the pause, the reveal glide, the jail
    // hold, the hand-off glide.
    const jailTo: GameState = {
      ...withTurn(mapPlayer(base, "p1", { position: 10 }), { playerId: "p2" }),
      turns: [
        {
          turn: 1,
          playerId: "p1",
          events: [roll(30), { kind: "go-to-jail", reason: "tile" }],
        },
        { turn: 2, playerId: "p2", events: [] },
      ],
    };
    const jailBudget = paceTransition(
      mapPlayer(base, "p1", { position: 27 }),
      jailTo,
      turnMs,
    ).durationMs;
    const jailSequence =
      slideAnimMs(turnMs, BIG) +
      redirectPauseMs(turnMs) +
      glideAnimMs(turnMs, BIG) +
      redirectPauseMs(turnMs) +
      glideAnimMs(turnMs, BIG);
    expect(jailSequence).toBeLessThanOrEqual(jailBudget);
  });
});

describe("in-phase animation scaling", () => {
  // A short hop where the tuned duration (not the budget cap) is the binding
  // term at DEFAULT_TURN_MS, so motion is free to scale with turnMs.
  const SHORT_PX = 200;
  const SHORT_ROWS = 2;

  it("doubles glide motion when turnMs doubles", () => {
    const atDefault = glideAnimMs(DEFAULT_TURN_MS, SHORT_PX);
    expect(glideAnimMs(DEFAULT_TURN_MS * 2, SHORT_PX)).toBeCloseTo(atDefault * 2);
  });

  it("doubles slide motion when turnMs doubles", () => {
    const atDefault = slideAnimMs(DEFAULT_TURN_MS, SHORT_ROWS);
    expect(slideAnimMs(DEFAULT_TURN_MS * 2, SHORT_ROWS)).toBeCloseTo(atDefault * 2);
  });

  it("keeps motion within its phase budget so a hold always remains", () => {
    // Far beyond any real board distance: the cap, not the tuned duration, binds.
    expect(glideAnimMs(DEFAULT_TURN_MS, 100_000)).toBeLessThan(
      DEFAULT_TURN_MS * 0.35,
    );
    expect(slideAnimMs(DEFAULT_TURN_MS, 100_000)).toBeLessThan(
      DEFAULT_TURN_MS * 0.65,
    );
  });
});

describe("ingestSnapshot", () => {
  const snap = (version: number): Snapshot => ({ version, state: base });

  it("appends a newer snapshot in version order", () => {
    const buffer = ingestSnapshot([], 5, snap(6));
    expect(buffer.map((s) => s.version)).toEqual([6]);
    const buffer2 = ingestSnapshot(buffer, 5, snap(8));
    const buffer3 = ingestSnapshot(buffer2, 5, snap(7));
    expect(buffer3.map((s) => s.version)).toEqual([6, 7, 8]);
  });

  it("drops a snapshot at or behind the playback head", () => {
    const buffer = [snap(7)];
    expect(ingestSnapshot(buffer, 6, snap(6))).toBe(buffer);
    expect(ingestSnapshot(buffer, 6, snap(5))).toBe(buffer);
  });

  it("dedups a version already buffered (route response + Realtime echo)", () => {
    const buffer = ingestSnapshot([], 5, snap(6));
    expect(ingestSnapshot(buffer, 5, snap(6))).toBe(buffer);
  });

  it("tolerates a gap — a missing version still buffers", () => {
    const buffer = ingestSnapshot([snap(6)], 5, snap(9));
    expect(buffer.map((s) => s.version)).toEqual([6, 9]);
  });
});

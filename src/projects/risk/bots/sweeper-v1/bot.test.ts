import { describe, expect, it } from "vitest";
import type { GameEvent, GameState, Move, Seat } from "../../contract";
import { referenceEngine as engine } from "../../engine";
import { play, position, type Position } from "../../engine/test-kit";
import { TERRITORIES, type TerritoryId } from "../../map";
import { fromView, idx } from "../rule-v1/board";
import { randomBot } from "../random";
import { sweeperV1Bot } from "./index";
import { gate, GUARD, moveIn, ONE_WAY_IN } from "./rules";

// sweeper-v1's rules, each on a board where it shows, and its legality over whole games. Unless a
// test says otherwise the game has 5 players and the sweeper is seat 0, to move.

type Layout = Partial<Record<TerritoryId, [Seat, number]>>;

const AFRICA: TerritoryId[] = ["north-africa", "egypt", "east-africa", "congo", "south-africa", "madagascar"];
const AUSTRALIA: TerritoryId[] = ["indonesia", "new-guinea", "western-australia", "eastern-australia"];
const own = (ts: readonly TerritoryId[], seat: Seat, armies: number): Layout => Object.fromEntries(ts.map((t) => [t, [seat, armies]]));

/** A whole board: `named` as given, every other territory dealt round seats 2 to 4 with 8 armies,
 *  thick enough that no capture of one is sure. */
function scenario(named: Layout, p: Position = {}): GameState {
  const board: Layout = { ...named };
  let k = 0;
  for (const t of TERRITORIES) {
    if (board[t.id] === undefined) board[t.id] = [2 + (k++ % 3), 8];
  }
  return position({ players: 5, active: 0, board, ...p });
}

/** The sweeper's moves from `state` to the end of its turn, with the events they made. */
function playTurn(state: GameState): { moves: Move[]; state: GameState } {
  const seat = engine.view(state, null).active;
  const moves: Move[] = [];
  let history: GameEvent[] = [{ rule: "test", kind: "turn-started", seat, turn: engine.view(state, null).turn }];
  while (engine.view(state, null).active === seat && engine.view(state, null).phase !== "game-over") {
    const options = engine.options(state, seat);
    if (!options) throw new Error("the sweeper has no decision");
    const view = engine.view(state, seat);
    const move = sweeperV1Bot({ seat, view, options, events: [], history, humans: view.seats.map(() => false), seed: "test" });
    moves.push(move);
    const result = play(engine, state, seat, move);
    state = result.state;
    history = [...history, ...result.events];
  }
  return { moves, state };
}

const blitzes = (moves: readonly Move[]) => moves.flatMap((m) => (m.kind === "blitz" ? [m] : []));

describe("sweeper-v1's rules", () => {
  it("knows Australia, through Siam, is the one continent with one way in", () => {
    expect(ONE_WAY_IN).toEqual([{ continent: expect.any(Number) as number, inside: idx("indonesia"), outside: idx("siam") }]);
  });

  it("guards Australia on Siam when it holds Siam, and on Indonesia when it doesn't", () => {
    const board = (siam: Seat) => fromView(engine.view(scenario({ ...own(AUSTRALIA, 0, 2), siam: [siam, 3] }), 0));
    expect(gate(board(0), 0)).toBe(idx("siam"));
    expect(gate(board(1), 0)).toBe(idx("indonesia"));
    expect(gate(fromView(engine.view(scenario({ indonesia: [1, 2] }), 0)), 0)).toBeNull();
  });

  it("feeds one stack, sweeps a path through the thin territories, and brings the stack home", () => {
    // The Middle East's 10 beside a thin Africa; everything else is thick.
    const state = scenario({ "middle-east": [0, 10], india: [0, 1], ...own(AFRICA, 1, 1) });
    const { moves } = playTurn(state);
    expect(moves[0]).toEqual({ kind: "place", territory: "middle-east", armies: 3 });
    const run = blitzes(moves);
    expect(run[0].from).toBe("middle-east");
    expect(run.length).toBeGreaterThanOrEqual(3);
    expect(run.every((m) => AFRICA.includes(m.to))).toBe(true);
    // A path: each capture goes on from the one before, with everything but one army moved in.
    for (let i = 1; i < run.length; i++) expect(run[i].from).toBe(run[i - 1].to);
    expect(run.every((m) => m.keepAtLeast === 1)).toBe(true);
    // What is left goes home to the Middle East, which still faces an enemy.
    expect(moves[moves.length - 1]).toMatchObject({ kind: "fortify", from: run[run.length - 1].to, to: "middle-east" });
  });

  it("tops the guard on the gate up before feeding the stack", () => {
    // Australia and Siam held, Siam on 2: 4 armies go to Siam, the last one to the stack.
    const state = scenario({ ...own(AUSTRALIA, 0, 1), siam: [0, 2], india: [0, 10], "middle-east": [1, 1] });
    const { moves } = playTurn(state);
    expect(moves.slice(0, 2)).toEqual([
      { kind: "place", territory: "siam", armies: GUARD - 2 },
      { kind: "place", territory: "india", armies: 1 },
    ]);
  });

  it("launches from the gate leaving the guard behind", () => {
    const state = scenario({ ...own(AUSTRALIA, 0, 1), siam: [0, 20], china: [1, 1], india: [1, 1] }, { phase: "attack" });
    const { moves, state: after } = playTurn(state);
    expect(blitzes(moves)[0]).toMatchObject({ from: "siam", keepAtLeast: GUARD });
    expect(engine.view(after, null).territories.siam.armies).toBeGreaterThanOrEqual(GUARD);
  });

  it("leaves the stack behind when a capture is a dead end", () => {
    // Kamchatka faces enemies; Japan, once taken, faces none.
    const b = fromView(engine.view(scenario({ kamchatka: [0, 10], japan: [0, 1], mongolia: [0, 1] }), 0));
    expect(moveIn(b, 0, idx("kamchatka"), idx("japan"), 3, 9)).toBe(3);
    expect(moveIn(b, 0, idx("mongolia"), idx("kamchatka"), 1, 9)).toBe(9);
  });

  it("takes a card with an even chance when no capture is sure, and only once a turn", () => {
    // Three armies against one: 89%, short of sure.
    const board = { brazil: [0, 3], "north-africa": [1, 1] } satisfies Layout;
    expect(playTurn(scenario(board, { phase: "attack" })).moves[0]).toEqual({ kind: "blitz", from: "brazil", to: "north-africa", keepAtLeast: 1 });
    expect(playTurn(scenario(board, { phase: "attack", capturedThisTurn: true })).moves[0]).toEqual({ kind: "end-attack" });
  });
});

describe("sweeper-v1 as a player", () => {
  /** A game with the sweeper at `seat` and the random bot elsewhere, up to `limit` steps. */
  function fuzz(players: number, seed: string, seat: Seat, limit: number): Seat | null {
    const started = engine.newGame({ players }, seed);
    let state = started.state;
    let history: GameEvent[] = [...started.events];
    for (let step = 0; step < limit; step++) {
      const view = engine.view(state, null);
      if (view.phase === "game-over") return view.winner;
      const options = engine.options(state, view.active);
      if (!options) throw new Error("the active seat has no options");
      const input = { seat: view.active, view: engine.view(state, view.active), options, events: [], history: engine.redact(history, view.active), humans: view.seats.map(() => false), seed: `${seed}/${step.toString()}` };
      const move = view.active === seat ? sweeperV1Bot(input) : randomBot(input);
      if (view.active === seat) expect(sweeperV1Bot(input)).toEqual(move);
      const result = engine.apply(state, view.active, move);
      if (!result.ok) throw new Error(`step ${step.toString()}: ${JSON.stringify(move)} is illegal: ${result.reason}`);
      state = result.state;
      history = [...history, ...result.events];
    }
    return null;
  }

  it.each([3, 4, 5])("makes only legal moves, the same for the same input, and beats the random bot at %i players", (players) => {
    expect(fuzz(players, `sweeper-${players.toString()}`, players - 1, 20_000)).toBe(players - 1);
  });
});

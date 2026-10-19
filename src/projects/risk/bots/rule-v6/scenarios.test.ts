import { describe, expect, it } from "vitest";
import type { CardId, GameState, Move, Seat } from "../../contract";
import { referenceEngine } from "../../engine";
import { play, position, withDice, type Position } from "../../engine/test-kit";
import { TERRITORIES, type TerritoryId } from "../../map";
import { fromView, IDS } from "../rule-v1/board";
import { ruleV6Bot } from "./index";
import { V6_PARAMS } from "./params";
import { plans } from "./planner";

// The design's test scenarios (`ideas/rule-bot-v2.md` §5): positions where expert
// play is clear, each checking the move an expert would make. Unless a scenario says
// otherwise the game has 5 players and v2 is seat 0, to move.

type Layout = Partial<Record<TerritoryId, [Seat, number]>>;

/** A whole board: `named` as given, every other territory dealt round `fillers` with
 *  `armies` each, in map order. */
function layout(named: Layout, fillers: readonly Seat[], armies: number): Layout {
  const board: Layout = { ...named };
  let k = 0;
  for (const t of TERRITORIES) {
    if (board[t.id] !== undefined) continue;
    board[t.id] = [fillers[k % fillers.length], armies];
    k++;
  }
  return board;
}

const active = (state: GameState): Seat => referenceEngine.view(state, null).active;

function decide(state: GameState, seed = "scenario"): Move {
  const seat = active(state);
  const options = referenceEngine.options(state, seat);
  if (!options) throw new Error("the active seat has no options");
  const view = referenceEngine.view(state, seat);
  return ruleV6Bot({ seat, view, options, events: [], history: [], humans: view.seats.map(() => false), seed });
}

/** v2's moves from `state` until its turn ends or `stop` says so (checked on each move
 *  before it is applied). */
function playTurn(state: GameState, stop: (move: Move) => boolean = () => false): { moves: Move[]; state: GameState } {
  const seat = active(state);
  const moves: Move[] = [];
  for (let i = 0; i < 200; i++) {
    const v = referenceEngine.view(state, null);
    if (v.active !== seat || v.phase === "game-over") break;
    const move = decide(state, `scenario/${i}`);
    moves.push(move);
    if (stop(move)) break;
    state = play(referenceEngine, state, seat, move).state;
  }
  return { moves, state };
}

const isAttack = (m: Move): m is Extract<Move, { kind: "blitz" | "attack" }> => m.kind === "blitz" || m.kind === "attack";
const untilAttack = (m: Move) => isAttack(m) || m.kind === "end-attack";
const targetsOf = (moves: readonly Move[]) => moves.filter(isAttack).map((m) => m.to);

function placements(moves: readonly Move[]): Partial<Record<TerritoryId, number>> {
  const out: Partial<Record<TerritoryId, number>> = {};
  for (const m of moves) if (m.kind === "place") out[m.territory] = (out[m.territory] ?? 0) + m.armies;
  return out;
}

function firstAttack(moves: readonly Move[]): Move | undefined {
  return moves.find((m) => isAttack(m) || m.kind === "end-attack");
}

/** The plans v2 weighed, best first: printed when a scenario fails. */
function explain(state: GameState): string {
  const seat = active(state);
  const view = referenceEngine.view(state, seat);
  return plans(fromView(view), seat, view.armiesToPlace, V6_PARAMS)
    .sort((x, y) => y.value - x.value)
    .slice(0, 8)
    .map(
      (p) =>
        `${p.kind} ${p.targets.map((t) => IDS[t]).join(",")} ${p.value.toFixed(4)} p=${p.capture?.pSuccess.toFixed(2) ?? "-"} ` +
        [...p.place].map(([t, a]) => `${IDS[t]}+${a}`).join(" "),
    )
    .join("\n");
}

const inGame = (state: GameState, seat: Seat) => !referenceEngine.view(state, null).seats[seat].eliminated;

function scenario(p: Position): GameState {
  return position({ players: 5, active: 0, ...p });
}

/** A capture with scripted dice (three sixes against a one), waiting for its move-in. */
function captured(p: Position, from: TerritoryId, to: TerritoryId): GameState {
  const state = withDice(scenario({ phase: "attack", ...p }), [6, 6, 6, 1]);
  return play(referenceEngine, state, 0, { kind: "attack", from, to, dice: 3 }).state;
}

const AFRICA: TerritoryId[] = ["north-africa", "egypt", "east-africa", "congo", "south-africa", "madagascar"];
const AUSTRALIA: TerritoryId[] = ["indonesia", "new-guinea", "western-australia", "eastern-australia"];
const NORTH_AMERICA: TerritoryId[] = TERRITORIES.filter((t) => t.continent === "north-america").map((t) => t.id);
const own = (ts: readonly TerritoryId[], armies: number, seat: Seat = 0): Layout =>
  Object.fromEntries(ts.map((t) => [t, [seat, armies]]));

describe("v6 on v4's scenarios", () => {
  // B (seat 1) holds the four of South America, thin; I hold Central America 10 and
  // Africa, which gives me 6 to place.
  const southAmericaKill = (myCards: CardId[], bCards: CardId[], africa: number, threat: Layout = {}) =>
    scenario({
      board: layout(
        {
          "central-america": [0, 10],
          ...own(AFRICA, africa),
          venezuela: [1, 2],
          peru: [1, 1],
          argentina: [1, 1],
          brazil: [1, 3],
          ...threat,
        },
        [2, 3, 4],
        3,
      ),
      hands: [myCards, bCards, [], [], []],
    });

  it("1: kills when the cards force a trade at once, from a launch stack made sure", () => {
    // My 1 card and B's 4 make 5: a trade the moment B falls (`ELIM-3`).
    const state = southAmericaKill(["alaska"], ["china", "mongolia", "siberia", "ural"], 3);
    const { moves } = playTurn(state, untilAttack);
    expect(placements(moves)["central-america"] ?? 0, explain(state)).toBeGreaterThanOrEqual(2);
    expect(firstAttack(moves)).toMatchObject({ from: "central-america", to: "venezuela" });
    expect(inGame(playTurn(state).state, 1)).toBe(false);
  });

  it("2: with no trade to take, kills only when nobody can then kill me", () => {
    const quiet = southAmericaKill([], ["china", "mongolia", "siberia"], 3);
    expect(firstAttack(playTurn(quiet, untilAttack).moves), explain(quiet)).toMatchObject({ to: "venezuela" });

    // Seat 2 sits over a thin Africa with two big stacks: the kill would strip my front.
    const exposed = southAmericaKill([], ["china", "mongolia", "siberia"], 1, {
      "southern-europe": [2, 30],
      "middle-east": [2, 25],
    });
    expect(inGame(playTurn(exposed).state, 1), explain(exposed)).toBe(true);
  });

  it("3: doesn't weaken a card-holder for the leader to finish", () => {
    // C (seat 2): 4 cards, Ukraine 6, Scandinavia 2, Iceland 2, between me and the leader
    // L (seat 1, moving next) with twice anyone's power. A cheap card waits in China.
    const state = scenario({
      board: layout(
        {
          ukraine: [2, 6],
          scandinavia: [2, 2],
          iceland: [2, 2],
          ural: [0, 7],
          siberia: [0, 3],
          mongolia: [0, 4],
          china: [3, 1],
          "northern-europe": [1, 12],
          "southern-europe": [1, 12],
          "middle-east": [1, 10],
          "great-britain": [1, 10],
          "western-europe": [1, 8],
          afghanistan: [1, 10],
        },
        [3, 4, 0],
        2,
      ),
      hands: [[], [], ["egypt", "congo", "japan", "peru"], [], []],
    });
    const { moves } = playTurn(state, (m) => m.kind === "end-attack");
    expect(targetsOf(moves).filter((t) => ["ukraine", "scandinavia", "iceland"].includes(t)), explain(state)).toEqual([]);
  });

  const quietBoard = () => layout(own(AUSTRALIA, 8), [1, 2, 3, 4], 4);

  it("4: trades one of each at once", () => {
    // Infantry, cavalry, artillery: 10 now, and nothing better to wait for.
    const state = scenario({ board: quietBoard(), hands: [["alaska", "argentina", "brazil"], [], [], [], []] });
    expect(decide(state), explain(state)).toMatchObject({ kind: "trade" });
  });

  it("5: holds two infantry and a wild, which any cavalry or artillery turns into one of each", () => {
    const state = scenario({ board: quietBoard(), hands: [["alaska", "alberta", "wild-1"], [], [], [], []] });
    expect(decide(state).kind, explain(state)).toBe("place");
  });

  it("6: at five cards, trades one of each with the +2 on my front, and keeps the wild", () => {
    // Egypt (infantry) is mine and faces an enemy.
    const state = scenario({
      board: layout({ egypt: [0, 4], "middle-east": [1, 6], ...own(AUSTRALIA, 4) }, [1, 2, 3, 4], 3),
      hands: [["egypt", "alaska", "argentina", "brazil", "wild-1"], [], [], [], []],
    });
    const move = decide(state);
    expect(move.kind).toBe("trade");
    if (move.kind === "trade") expect([...move.cards].sort()).toEqual(["argentina", "brazil", "egypt"]);
  });

  it("7: takes a card spot with a blitz of just the armies that make it sure, and stops", () => {
    const state = scenario({
      board: layout(
        { ...own(AUSTRALIA, 3), indonesia: [0, 10], siam: [1, 1], india: [2, 8], china: [2, 8] },
        [1, 2, 3, 4],
        4,
      ),
      phase: "attack",
    });
    expect(decide(state), explain(state)).toEqual({ kind: "blitz", from: "indonesia", to: "siam", keepAtLeast: 7 });
    const { moves } = playTurn(state, (m) => m.kind === "end-attack");
    expect(targetsOf(moves)).toEqual(["siam"]);
  });

  it("8: in a close fight, rolls single battles until it is the favourite", () => {
    // Two players left, 10 attackers against 10: a blitz captures 61% of the time,
    // rolling until the favourite and then blitzing 66%.
    const south = TERRITORIES.filter((t) => ["south-america", "africa", "australia"].includes(t.continent)).map((t) => t.id);
    const state = position({
      players: 3,
      active: 0,
      eliminated: [2],
      board: { ...own(south, 2), indonesia: [0, 11], siam: [1, 10] },
      rest: [1, 2],
      phase: "attack",
    });
    expect(decide(state), explain(state)).toEqual({ kind: "attack", from: "indonesia", to: "siam", dice: 3 });
  });

  it("9: takes a card from North America, but not a continent everyone would break", () => {
    const state = scenario({
      board: layout(
        {
          ...own(NORTH_AMERICA, 4),
          alaska: [1, 1],
          greenland: [2, 1],
          "northwest-territory": [0, 9],
          quebec: [0, 9],
          kamchatka: [3, 3],
          iceland: [4, 3],
          venezuela: [3, 3],
        },
        [1, 2, 3, 4],
        3,
      ),
    });
    const { moves } = playTurn(state, (m) => m.kind === "end-attack");
    // v2 takes Alaska and leaves Greenland: completing North America here would make it the
    // common threat, every neighbour's target, and Iceland's 3 with its owner's income of 5
    // would surely break the continent back (rule-bot-v2.md, "Expert scenarios that
    // changed"). v1 took both.
    expect(targetsOf(moves), explain(state)).toContain("alaska");
  });

  it("10: under a common threat, strikes the leader first", () => {
    // L (seat 1) holds Asia and Australia; seat 2 holds South America beside my Africa.
    const asia = TERRITORIES.filter((t) => t.continent === "asia").map((t) => t.id);
    const state = scenario({
      board: layout(
        {
          ...own(asia, 4, 1),
          ...own(AUSTRALIA, 4, 1),
          ural: [1, 3],
          afghanistan: [1, 3],
          "middle-east": [1, 3],
          ...own(AFRICA, 4),
          ukraine: [0, 8],
          ...own(["venezuela", "peru", "brazil", "argentina"], 2, 2),
        },
        [2, 3, 4],
        3,
      ),
    });
    const attack = firstAttack(playTurn(state, untilAttack).moves);
    const owner = attack && isAttack(attack) ? referenceEngine.view(state, 0).territories[attack.to].owner : null;
    expect(owner, explain(state)).toBe(1);
  });

  it("11: fortifies to the front along an owned path, and only along one", () => {
    const board = (brazil: [Seat, number]) =>
      layout(
        {
          peru: [0, 12],
          venezuela: [0, 2],
          argentina: [0, 1],
          brazil,
          "north-africa": [0, 3],
          egypt: [1, 9],
          "central-america": [2, 3],
        },
        [1, 2, 3, 4],
        3,
      );
    const connected = scenario({ board: board([0, 1]), phase: "fortify" });
    expect(decide(connected)).toMatchObject({ kind: "fortify", from: "peru", to: "north-africa" });
    const cut = scenario({ board: board([2, 1]), phase: "fortify" });
    expect(decide(cut)).not.toMatchObject({ to: "north-africa" });
  });

  describe("12: the move-in", () => {
    it("moves everything out of a source left with no enemy beside it", () => {
      const state = captured({ board: layout({ ...own(AUSTRALIA, 1), indonesia: [0, 10], siam: [1, 1] }, [1, 2, 3, 4], 3) }, "indonesia", "siam");
      expect(decide(state)).toEqual({ kind: "occupy", armies: 9 });
    });

    it("moves the least into a territory with no enemy beside it", () => {
      const state = captured(
        { board: layout({ peru: [0, 3], brazil: [0, 10], argentina: [1, 1], "north-africa": [2, 8] }, [1, 2, 3, 4], 3) },
        "brazil",
        "argentina",
      );
      expect(decide(state)).toEqual({ kind: "occupy", armies: 3 });
    });

    it("moves the run on through the territory it took", () => {
      const state = captured(
        {
          board: layout(
            { "central-america": [0, 15], venezuela: [1, 1], peru: [1, 1], argentina: [1, 1], brazil: [2, 5] },
            [2, 3, 4],
            3,
          ),
          hands: [["alaska", "alberta"], ["china", "mongolia", "siberia", "ural"], [], [], []],
        },
        "central-america",
        "venezuela",
      );
      const move = decide(state);
      expect(move.kind).toBe("occupy");
      // v2 moves on enough to take Peru and Argentina's single armies for sure under Balanced
      // Blitz, and may keep the rest on Central America, the gate (rule-bot-v2.md §2); v1
      // moved everything.
      if (move.kind === "occupy") expect(move.armies).toBeGreaterThanOrEqual(6);
    });
  });

  it("13: sweeps the victims whose cards force trades", () => {
    const state = scenario({
      board: layout(
        {
          brazil: [0, 40],
          peru: [1, 3],
          argentina: [1, 3],
          mongolia: [0, 40],
          japan: [2, 4],
          kamchatka: [2, 4],
          "east-africa": [0, 40],
          madagascar: [3, 3],
          "south-africa": [3, 4],
        },
        [4, 0],
        3,
      ),
      hands: [["alaska", "egypt"], ["china", "india"], ["congo", "iceland", "ukraine"], ["greenland", "quebec", "ontario"], []],
      phase: "attack",
    });
    const after = playTurn(state).state;
    expect(inGame(after, 2) || inGame(after, 3), explain(state)).toBe(false);
  });

  it("14: takes a card from a card-less buffer but doesn't finish it", () => {
    const state = position({
      players: 6,
      active: 0,
      board: layout({ mongolia: [0, 8], japan: [3, 1], kamchatka: [3, 1] }, [1, 2, 4, 5, 0], 4),
      hands: [[], ["china"], ["india"], [], ["peru"], ["egypt"]],
    });
    const after = playTurn(state, (m) => m.kind === "end-attack").state;
    expect(inGame(after, 3), explain(state)).toBe(true);
    expect(referenceEngine.view(after, 0).cardEarned).toBe(true);
  });

  it("15: holding cards, covers the shell or keeps the stack, a near tie, and nothing else", () => {
    // Indonesia 14, New Guinea 2; Western Australia's 10 can take the shell, and with it me.
    const state = scenario({
      board: layout(
        { indonesia: [0, 14], "new-guinea": [0, 2], "western-australia": [1, 10], "eastern-australia": [1, 3], siam: [1, 5] },
        [1, 2, 3, 4],
        3,
      ),
      hands: [["china", "india", "japan", "kamchatka"], [], [], [], []],
      phase: "fortify",
    });
    // v1 covered the shell. v2 scores covering it and keeping the stack within a hair of
    // each other: Western Australia's owner can reach the kill either way (46% kept, 43%
    // covered), and armies moved onto New Guinea are what a sweep through it takes. So it
    // may do either, and must not move anything elsewhere (rule-bot-v2.md).
    const move = decide(state);
    if (move.kind === "fortify") expect(move, explain(state)).toMatchObject({ from: "indonesia", to: "new-guinea" });
    else expect(move).toEqual({ kind: "end-turn" });
  });
});

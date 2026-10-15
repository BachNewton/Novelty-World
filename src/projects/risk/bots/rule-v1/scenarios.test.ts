import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import type { CardId, GameState, Move, Seat } from "../../contract";
import { referenceEngine } from "../../engine";
import { play, position, withDice, type Position } from "../../engine/test-kit";
import { TERRITORIES, type TerritoryId } from "../../map";
import { fromView, IDS } from "./board";
import { ruleV1Bot } from "./index";
import { V1_PARAMS } from "./params";
import { plans } from "./planner";

// The design's test scenarios (`ideas/rule-bot-v1.md` §5): positions where expert
// play is clear, each checking the move an expert would make. Unless a scenario says
// otherwise the game has 5 players and v1 is seat 0, to move. Scenario 11 (setup
// placement) is gone with setup decisions: the deal places every army (Auto Placement).

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

/** Sets traded so far when the next set is worth `value` (`CARDS-6`). */
function tradedBefore(value: number): number {
  for (let n = 0; n < 40; n++) {
    const next = n + 1;
    if ((next <= 6 ? [4, 6, 8, 10, 12, 15][next - 1] : 15 + 5 * (next - 6)) === value) return n;
  }
  throw new Error(`no set is worth ${value}`);
}

const active = (state: GameState): Seat => referenceEngine.view(state, null).active;

function decide(state: GameState, seed = "scenario"): Move {
  const seat = active(state);
  const options = referenceEngine.options(state, seat);
  if (!options) throw new Error("the active seat has no options");
  return ruleV1Bot({ seat, view: referenceEngine.view(state, seat), options, events: [], seed });
}

/** v1's moves from `state` until its turn ends or `stop` says so (checked on each move
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

/** The plans v1 weighed, best first: printed when a scenario fails. */
function explain(state: GameState): string {
  const seat = active(state);
  const view = referenceEngine.view(state, seat);
  return plans(fromView(view), seat, view.armiesToPlace, V1_PARAMS, createRng("explain"))
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
const handOf = (state: GameState, seat: Seat) => referenceEngine.view(state, seat).cards.hand ?? [];

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
const own = (ts: readonly TerritoryId[], armies: number, seat: Seat = 0): Layout =>
  Object.fromEntries(ts.map((t) => [t, [seat, armies]]));

describe("v1's scenarios", () => {
  // Next set 20; B (seat 1) holds the four of South America, thin; I hold Central
  // America 10 and Africa, which gives me 6 to place.
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
      setsTraded: tradedBefore(20),
    });

  it("1: kills for a mid-cash, placing everything on the run's launch stack", () => {
    const state = southAmericaKill(["alaska", "alberta"], ["china", "mongolia", "siberia", "ural", "japan"], 3);
    const { moves } = playTurn(state, untilAttack);
    expect(placements(moves), explain(state)).toEqual({ "central-america": 6 });
    expect(firstAttack(moves)).toMatchObject({ kind: "blitz", from: "central-america", to: "venezuela" });
  });

  it("2: with no mid-cash, kills only when nobody can then kill me", () => {
    const quiet = southAmericaKill(["alaska"], ["china", "mongolia", "siberia", "ural"], 3);
    expect(firstAttack(playTurn(quiet, untilAttack).moves), explain(quiet)).toMatchObject({ to: "venezuela" });
    expect(inGame(playTurn(quiet).state, 1)).toBe(false);

    // Seat 2 sits over a thin Africa: the kill would leave me on 6 cards, a prize.
    const exposed = southAmericaKill(["alaska"], ["china", "mongolia", "siberia", "ural"], 1, {
      "southern-europe": [2, 30],
      "middle-east": [2, 25],
    });
    const after = playTurn(exposed);
    expect(inGame(after.state, 1), explain(exposed)).toBe(true);
    expect(handOf(after.state, 0)).toHaveLength(2);
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
      setsTraded: tradedBefore(10),
    });
    const { moves } = playTurn(state, (m) => m.kind === "end-attack");
    expect(targetsOf(moves).filter((t) => ["ukraine", "scandinavia", "iceland"].includes(t)), explain(state)).toEqual([]);
  });

  // Two sets of one of each symbol.
  const sixCards: CardId[] = ["china", "india", "japan", "kamchatka", "irkutsk", "brazil"];

  // 4 and 7 fail: v1 trades early wherever the armies buy the smallest edge, because its
  // evaluation puts almost no price on holding when nobody else holds cards. Whether a
  // price for holding makes v1 stronger is a measurement (`ideas/bot-log.md`).
  it.fails("4: with six cards and no use for a second set, trades exactly one", () => {
    const state = scenario({
      board: layout(own(AUSTRALIA, 8), [1, 2, 3, 4], 4),
      hands: [sixCards, [], [], [], []],
      setsTraded: tradedBefore(12),
    });
    const { moves } = playTurn(state, (m) => m.kind === "place");
    expect(moves.filter((m) => m.kind === "trade"), explain(state)).toHaveLength(1);
  });

  it("5: with six cards, trades the second set when it makes a mid-cash kill", () => {
    // B (seat 1, 5 cards) holds Siam, India and China, 5 each, beside my Indonesia.
    const state = scenario({
      board: layout(
        { ...own(AUSTRALIA, 1), indonesia: [0, 4], siam: [1, 5], india: [1, 5], china: [1, 5] },
        [2, 3, 4],
        6,
      ),
      hands: [sixCards, ["egypt", "congo", "peru", "argentina", "venezuela"], [], [], []],
      setsTraded: tradedBefore(12),
    });
    const { moves } = playTurn(state, untilAttack);
    expect(moves.filter((m) => m.kind === "trade"), explain(state)).toHaveLength(2);
    expect(firstAttack(moves)).toMatchObject({ kind: "blitz", from: "indonesia", to: "siam" });
  });

  it("6: trades the set that keeps the wild and puts the +2 on my front", () => {
    const state = scenario({
      board: layout({ peru: [0, 3], argentina: [0, 3], brazil: [1, 4], venezuela: [1, 4] }, [1, 2, 3, 4], 3),
      hands: [["peru", "egypt", "ural", "japan", "wild-1"], [], [], [], []],
      setsTraded: tradedBefore(10),
    });
    const trade = decide(state);
    expect(trade.kind).toBe("trade");
    if (trade.kind === "trade") expect([...trade.cards].sort()).toEqual(["japan", "peru", "ural"]);
    const after = play(referenceEngine, state, 0, trade);
    expect(after.events.find((e) => e.kind === "traded")).toMatchObject({ bonus: { territory: "peru", armies: 2 } });
  });

  it.fails("7: holds four cards when no plan needs the armies", () => {
    const state = scenario({
      board: layout(own(AUSTRALIA, 8), [1, 2, 3, 4], 4),
      hands: [["china", "india", "japan", "kamchatka"], [], [], [], []],
      setsTraded: tradedBefore(10),
    });
    expect(decide(state), explain(state)).toMatchObject({ kind: "place" });
  });

  it("8: trades at four cards to stop being the prize", () => {
    // 9 armies on 3 territories, 4 cards, and the next player beside all of them.
    const state = scenario({
      board: layout(
        { "eastern-australia": [0, 3], "western-australia": [0, 3], "new-guinea": [0, 3], indonesia: [1, 9], siam: [1, 12] },
        [1, 2, 3, 4],
        3,
      ),
      hands: [["china", "india", "japan", "kamchatka"], ["egypt", "congo", "peru"], [], [], []],
      setsTraded: tradedBefore(10),
    });
    expect(decide(state), explain(state)).toMatchObject({ kind: "trade" });
  });

  it("9: takes the cheap card early and stops", () => {
    const state = scenario({
      board: layout(
        { ...own(AUSTRALIA, 4), "new-guinea": [1, 1], siam: [2, 4] },
        [1, 2, 3, 4],
        4,
      ),
      setsTraded: tradedBefore(6),
      phase: "attack",
    });
    const { moves } = playTurn(state, (m) => m.kind === "end-attack");
    expect(targetsOf(moves), explain(state)).toEqual(["new-guinea"]);
  });

  it("10: doesn't buy a card dearly early, but does once sets are worth 25", () => {
    // The only capture is Central America, 3 attacking against 2, from Venezuela.
    const at = (value: number) =>
      scenario({
        board: layout(
          {
            venezuela: [0, 4],
            peru: [0, 8],
            argentina: [0, 8],
            brazil: [0, 10],
            "central-america": [1, 2],
            "north-africa": [2, 12],
            "western-united-states": [2, 15],
          },
          [1, 2, 3, 4],
          3,
        ),
        hands: [[], ["china"], ["india"], [], []],
        setsTraded: tradedBefore(value),
        phase: "attack",
      });
    expect(decide(at(6)), explain(at(6))).toEqual({ kind: "end-attack" });
    expect(decide(at(25)), explain(at(25))).toMatchObject({ kind: "blitz", from: "venezuela", to: "central-america" });
  });

  it("12: under a common threat, hits the leader and never a weaker player's continent", () => {
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
      setsTraded: tradedBefore(10),
    });
    const { moves } = playTurn(state, (m) => m.kind === "end-attack");
    expect(targetsOf(moves).filter((t) => ["venezuela", "peru", "brazil", "argentina"].includes(t)), explain(state)).toEqual([]);
  });

  it("13: fortifies to the front along an owned path, and only along one", () => {
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

  describe("14: the move-in", () => {
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
          setsTraded: tradedBefore(20),
        },
        "central-america",
        "venezuela",
      );
      const move = decide(state);
      expect(move.kind).toBe("occupy");
      if (move.kind === "occupy") expect(move.armies).toBeGreaterThanOrEqual(12);
    });
  });

  it("15: in a duel, attacks when the big battle favours the attacker", () => {
    const south = TERRITORIES.filter((t) => ["south-america", "africa", "australia"].includes(t.continent)).map((t) => t.id);
    const state = position({
      players: 3,
      active: 0,
      eliminated: [2],
      board: { ...own(south, 2), indonesia: [0, 31], siam: [1, 30] },
      rest: [1, 2],
      phase: "attack",
    });
    const { moves } = playTurn(state, (m) => m.kind === "end-attack" || (isAttack(m) && m.to === "siam"));
    expect(targetsOf(moves), explain(state)).toContain("siam");
  });

  it("16: sweeps, starting with the victim whose cards trigger the first mid-turn trade", () => {
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
      hands: [
        ["alaska"],
        ["china", "india", "siam", "ural"],
        ["egypt", "congo", "iceland", "ukraine", "yakutsk"],
        ["greenland", "quebec", "ontario", "irkutsk", "siberia"],
        [],
      ],
      setsTraded: tradedBefore(35),
      phase: "attack",
    });
    const first = decide(state);
    expect(isAttack(first) && ["japan", "kamchatka", "madagascar", "south-africa"].includes(first.to), explain(state)).toBe(true);
  });

  it("17: takes a card from a card-less buffer but doesn't finish it", () => {
    const state = position({
      players: 6,
      active: 0,
      board: layout({ mongolia: [0, 8], japan: [3, 1], kamchatka: [3, 1] }, [1, 2, 4, 5, 0], 4),
      hands: [[], ["china"], ["india"], [], ["peru"], ["egypt"]],
      setsTraded: tradedBefore(10),
    });
    const after = playTurn(state, (m) => m.kind === "end-attack").state;
    expect(inGame(after, 3), explain(state)).toBe(true);
    expect(referenceEngine.view(after, 0).cardEarned).toBe(true);
  });

  it("18: ending on five cards, covers the shell an opponent could take", () => {
    // Indonesia 14, New Guinea 2; Western Australia's 10 can take the shell, and with it me.
    const state = scenario({
      board: layout(
        { indonesia: [0, 14], "new-guinea": [0, 2], "western-australia": [1, 10], "eastern-australia": [1, 3], siam: [1, 5] },
        [1, 2, 3, 4],
        3,
      ),
      hands: [["china", "india", "japan", "kamchatka", "irkutsk"], [], [], [], []],
      phase: "fortify",
    });
    expect(decide(state), explain(state)).toMatchObject({ kind: "fortify", from: "indonesia", to: "new-guinea" });
  });
});

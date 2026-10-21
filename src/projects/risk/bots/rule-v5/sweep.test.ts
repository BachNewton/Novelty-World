import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import type { GameState, Seat } from "../../contract";
import { referenceEngine } from "../../engine";
import { position, type Position } from "../../engine/test-kit";
import { TERRITORIES, type TerritoryId } from "../../map";
import { ADJ, fromView, idx, IDS, type Board } from "../rule-v1/board";
import { winProb } from "../rule-v1/odds";
import { plans as v4Plans } from "../rule-v4/planner";
import { V5_PARAMS, type Params } from "./params";
import { bestPlan, plans } from "./planner";
import { SURE, sweepPath, sweepPlans } from "./sweep";

// v5's sweep, on boards built to show it: the path a stack takes, the plans it is offered as,
// and the planner committing to one.

/** `named` as given, every other territory dealt round seats 1 and 2 on `armies` each, so
 *  neither holds most of the board. */
function dealtPosition(named: NonNullable<Position["board"]>, armies: number, p: Position = {}): GameState {
  const all: NonNullable<Position["board"]> = { ...named };
  let k = 0;
  for (const t of TERRITORIES) if (all[t.id] === undefined) all[t.id] = [1 + (k++ % 2), armies];
  return position({ players: 3, ...p, board: all });
}
const dealt = (named: NonNullable<Position["board"]>, armies: number): Board => fromView(referenceEngine.view(dealtPosition(named, armies), 0));
const small: Params = { ...V5_PARAMS, prefs: V5_PARAMS.smallTable.prefs };
const ids = (path: readonly number[]) => path.map((t) => IDS[t]);
const AUSTRALIA: TerritoryId[] = ["indonesia", "new-guinea", "western-australia", "eastern-australia"];
const holding = (ts: readonly TerritoryId[], seat: Seat, armies: number) => Object.fromEntries(ts.map((t) => [t, [seat, armies]]));
const open = () => true;

// My stack on Siam, Australia thin behind it, India and China thick beside it.
const siam = (stack: number, australia: Seat = 1) => dealt({ siam: [0, stack], ...holding(AUSTRALIA, australia, 1), india: [1, 20], china: [2, 20] }, 4);

describe("v5's sweep", () => {
  it("takes the thinnest territory beside the stack that it is sure of, and goes on from there", () => {
    const b = siam(12);
    const path = sweepPath(b, 0, idx("siam"), 12, open);
    expect(ids(path)[0]).toBe("indonesia");
    expect([...ids(path)].sort()).toEqual([...AUSTRALIA].sort());
  });

  it("is a path: each capture beside the one before, the whole stack moving on", () => {
    const b = siam(12);
    const path = sweepPath(b, 0, idx("siam"), 12, open);
    path.reduce((at, t) => {
      expect(ADJ[at]).toContain(t);
      return t;
    }, idx("siam"));
  });

  it("stops at a territory it isn't sure of", () => {
    const b = dealt({ siam: [0, 6], indonesia: [1, 1], "western-australia": [1, 10], "new-guinea": [1, 10], india: [2, 9], china: [2, 9] }, 4);
    expect(winProb(5, 1)).toBeGreaterThanOrEqual(SURE);
    expect(ids(sweepPath(b, 0, idx("siam"), 6, open))).toEqual(["indonesia"]);
  });

  it("takes only what it is allowed to", () => {
    const b = siam(12);
    expect(sweepPath(b, 0, idx("siam"), 12, (t) => t !== idx("indonesia") && t !== idx("india"))).toEqual([]);
  });

  it("is offered whole and by its first half, everything to place on the stack that leads it", () => {
    const b = siam(8);
    const offered = sweepPlans(b, 0, 4, null);
    const fromSiam = offered.filter((cp) => cp.routes[0].source === idx("siam"));
    expect(fromSiam.map((cp) => cp.routes[0].path.length)).toEqual([4, 2]);
    for (const cp of fromSiam) {
      expect(cp.alloc).toEqual([4]);
      expect(cp.leftover).toBe(0);
    }
    const sweeps = plans(b, 0, 4, small, createRng("sweep")).filter((p) => p.kind === "sweep" && p.capture?.routes[0].source === idx("siam"));
    expect(sweeps.length).toBe(2);
    for (const p of sweeps) expect([...p.place]).toEqual([[idx("siam"), 4]]);
  });

  it("goes only through the common threat while there is one", () => {
    expect(sweepPlans(siam(12, 2), 0, 0, 1)).toEqual([]);
    expect(sweepPlans(siam(12, 1), 0, 0, 1).length).toBeGreaterThan(0);
  });

  it("never finishes a card-less player left as a buffer at a big table", () => {
    // Seat 3 holds only Indonesia and New Guinea, and no cards, at a table of 5; seat 1, with the
    // rest of Australia, holds a card. The sweep runs Indonesia, Western and Eastern Australia, and
    // stops before New Guinea would finish seat 3.
    const buffered: Position["board"] = { siam: [0, 12], indonesia: [3, 1], "new-guinea": [3, 2], "western-australia": [1, 1], "eastern-australia": [1, 1], india: [2, 20], china: [4, 20] };
    const b = fromView(referenceEngine.view(position({ players: 5, board: buffered, rest: [4, 3], hands: [[], ["alaska"], [], [], []] }), 0));
    expect(ids(sweepPath(b, 0, idx("siam"), 12, open))).toEqual(["indonesia", "western-australia", "eastern-australia", "new-guinea"]);
    const whole = sweepPlans(b, 0, 0, null).find((cp) => cp.routes[0].source === idx("siam"));
    expect(ids(whole?.routes[0].path ?? [])).toEqual(["indonesia", "western-australia", "eastern-australia"]);
  });

});

describe("v5's planner", () => {
  it("commits to a chain of captures from one stack, which no v4 plan makes, stopped where it pays", () => {
    // v4 plans a continent only when at most half of it is missing, so here every plan of its
    // takes one territory of Australia at most. Holding all of it would leave Siam on one army
    // beside India's 20, so the half sweep is the one worth making.
    const b = siam(8);
    const best = bestPlan(b, 0, 4, small, createRng("sweep"));
    expect(best.kind).toBe("sweep");
    expect(ids(best.targets)).toEqual(["indonesia", "new-guinea"]);
    expect([...best.place]).toEqual([[idx("siam"), 4]]);
    const v4 = v4Plans(b, 0, 4, small, createRng("sweep"));
    expect(Math.max(...v4.map((p) => p.targets.filter((t) => AUSTRALIA.includes(IDS[t])).length))).toBe(1);
  });
});

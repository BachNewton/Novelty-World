import { createRng } from "@/shared/lib/seeded-random";
import type { Move } from "../../contract";
import type { Bot } from "../bot";
import { ADJ, fromView, idx, IDS, type Board } from "../rule-v1/board";
import { afterTrade, chooseBonus, chooseFortify, chooseOccupy, chooseSet } from "./decisions";
import { battleOutcome, blitzCommit } from "../rule-v1/odds";
import { V3_PARAMS, type Params } from "./params";
import { bestPlan, type Plan } from "./planner";

// v3: v2 (`ideas/rule-bot-v2.md`) with the changes `ideas/rule-bot-v3.md` records. v2 is
// frozen, so v3 keeps only the files it changes and shares the rest from v2 (its
// evaluation and capture planner) and v1 (the board, the odds, the hand model).

/** The plan's next attack: its first route's next territory, from the strongest of my
 *  territories beside it. A favourite blitzes, committing only the armies that make the
 *  capture as sure as committing all of them, so the rest stay home whatever happens
 *  and the move-in decides how many follow; an attacker not yet the favourite rolls a
 *  single battle with every die, and blitzes once it is (`odds.ts`). */
function nextAttack(b: Board, plan: Plan): Move | null {
  const route = plan.capture?.routes.find((r) => r.path.length > 0);
  if (!route) return null;
  const target = route.path[0];
  let from = -1;
  for (const n of ADJ[target]) {
    if (b.owner[n] === b.owner[route.source] && (from < 0 || b.armies[n] > b.armies[from])) from = n;
  }
  if (from < 0 || b.armies[from] < 2) return null;
  const a = b.armies[from] - 1;
  const d = b.armies[target];
  if (battleOutcome(a, d).roll) return { kind: "attack", from: IDS[from], to: IDS[target], dice: Math.min(3, a) as 1 | 2 | 3 };
  return { kind: "blitz", from: IDS[from], to: IDS[target], keepAtLeast: b.armies[from] - blitzCommit(a, d) };
}

function placeFromPlan(plan: Plan): { territory: number; armies: number } {
  let best: { territory: number; armies: number } | null = null;
  for (const [territory, armies] of plan.place) {
    if (best === null || armies > best.armies || (armies === best.armies && territory < best.territory)) best = { territory, armies };
  }
  if (best === null) throw new Error("a plan with armies to place placed none");
  return best;
}

export function ruleBot(params: Params): Bot {
  return ({ seat, view, options, seed }): Move => {
    const rng = createRng(seed);
    const b = fromView(view);
    switch (options.kind) {
      case "reinforce": {
        if (options.sets.length > 0) {
          const hand = view.cards.hand ?? [];
          const set = chooseSet(b, seat, hand, options.sets);
          const pictured = options.bonusTerritories.filter((t) => (set as readonly string[]).includes(t));
          const bonus = pictured.length > 0 ? chooseBonus(b, pictured, null) : null;
          let trade = options.mustTrade;
          if (!trade) {
            const hold = bestPlan(b, seat, options.armiesToPlace, params, rng).value;
            const traded = afterTrade(b, seat, set);
            if (bonus !== null) traded.board.armies[idx(bonus)] += 2;
            trade = bestPlan(traded.board, seat, options.armiesToPlace + traded.armies, params, rng).value > hold;
          }
          if (trade) {
            return pictured.length > 1 && bonus !== null
              ? { kind: "trade", cards: set, bonusTerritory: bonus }
              : { kind: "trade", cards: set };
          }
        }
        const plan = bestPlan(b, seat, options.armiesToPlace, params, rng);
        const { territory, armies } = placeFromPlan(plan);
        return { kind: "place", territory: IDS[territory], armies };
      }

      case "attack": {
        const plan = bestPlan(b, seat, 0, params, rng);
        const move = plan.kind === "hold" ? null : nextAttack(b, plan);
        return move ?? { kind: "end-attack" };
      }

      case "occupy": {
        const armies = chooseOccupy(b, seat, idx(options.from), idx(options.to), options.min, options.max, params, rng);
        return { kind: "occupy", armies };
      }

      case "fortify": {
        const move = chooseFortify(b, seat, options.moves, params);
        return move ? { kind: "fortify", from: move.from, to: move.to, armies: move.armies } : { kind: "end-turn" };
      }
    }
  };
}

export const ruleV3Bot: Bot = ruleBot(V3_PARAMS);

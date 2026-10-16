import { createRng } from "@/shared/lib/seeded-random";
import type { Move } from "../../contract";
import type { Bot } from "../bot";
import { ADJ, fromView, idx, IDS, type Board } from "./board";
import { afterTrade, chooseBonus, chooseFortify, chooseOccupy, chooseSet } from "./decisions";
import { expectedLoss, pathRun } from "./odds";
import { V1_PARAMS, type Params } from "./params";
import { bestPlan, type Plan } from "./planner";

// v1, the rule-based bot designed in `ideas/rule-bot-v1.md`: a turn planner over
// expert-shaped plans, priced with exact battle odds and scored by one evaluation
// with a one-round threat model. It sees only its seat's view; its only randomness
// (sampled outcomes, when the work knob asks for them) comes from its seed.

/** How low a blitz may take its source before the bot stops to plan again: once the
 *  rest of the run has fallen below the continue bar, or once it has spent about one
 *  and a half times the capture's expected cost. */
function blitzFloor(b: Board, from: number, path: readonly number[], params: Params): number {
  const armies = b.armies[from];
  const d = b.armies[path[0]];
  const step = Math.max(4, Math.ceil(1.5 * expectedLoss(armies - 1, d)) + 2);
  let floor = armies - step;
  const rest = [Math.ceil(d / 2), ...path.slice(1).map((t) => b.armies[t])];
  for (let k = 2; k < armies; k++) {
    if (pathRun(k, rest).pSuccess >= params.engine.continueBar) {
      floor = Math.max(floor, k - 1);
      break;
    }
  }
  return Math.min(armies - 1, Math.max(1, floor));
}

/** The plan's next battle: its first route's next territory, from the strongest of
 *  my territories beside it. */
function nextBlitz(b: Board, plan: Plan, params: Params): Move | null {
  const route = plan.capture?.routes.find((r) => r.path.length > 0);
  if (!route) return null;
  const target = route.path[0];
  let from = -1;
  for (const n of ADJ[target]) {
    if (b.owner[n] === b.owner[route.source] && (from < 0 || b.armies[n] > b.armies[from])) from = n;
  }
  if (from < 0 || b.armies[from] < 2) return null;
  return { kind: "blitz", from: IDS[from], to: IDS[target], keepAtLeast: blitzFloor(b, from, route.path, params) };
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
            const traded = afterTrade(b, seat);
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
        const move = plan.kind === "hold" ? null : nextBlitz(b, plan, params);
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

export const ruleV1Bot: Bot = ruleBot(V1_PARAMS);

import type { Move, Seat } from "../../contract";
import type { Bot, BotInput } from "../bot";
import { Memo, memoFor } from "../memo";
import { ADJ, fromView, idx, IDS, type Board } from "../rule-v1/board";
import { battleOutcome, blitzCommit } from "../rule-v1/odds";
import { readRecord, recordKey } from "../rule-v4/beliefs";
import { tableParams } from "../rule-v6";
import { afterTrade, chooseBonus, chooseFortify, chooseSet } from "../rule-v6/decisions";
import type { Params as V6Params } from "../rule-v6/params";
import { checkSettings, inEffect, V6_1_PARAMS, type Params } from "./params";
import { bestPlan, chooseOccupy, type Params as PlannerParams, type Plan } from "./planner";
import { scorerFor, threatFor } from "./score";

// v6.1 (`ideas/rule-bot-v6.1.md`): v6 whole, its planner, decisions and opponent model, with
// its board scored by v6.1's settings (`score.ts`) and its plans built round the common threat
// they name (`planner.ts`). The move choices below are v6's (`rule-v6/index.ts`), copied only
// because the scorer that carries the change must be bound to the settings each decision plays
// by: the table's preferences, this game's record of the opponents and the table-size gates,
// which v6 works out inside its bot.

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

const recorded = new WeakMap<V6Params, Memo<V6Params>>();

function withRecord(params: V6Params, seat: Seat, history: BotInput["history"], players: number): V6Params {
  const record = readRecord(history, players, params.opponents.beliefs.historyDecay, seat);
  return memoFor(recorded, params, 8).get(`${seat.toString()}|${recordKey(record)}`, () => ({ ...params, record }));
}

const scored = new WeakMap<V6Params, Memo<PlannerParams>>();

/** The settings a decision plays by, scored by v6.1's `settings` (the table's, as the gates leave
 *  them at this decision), or v6's own where they leave nothing moved. One object per settings
 *  object and attrition (the one setting a gate may switch alone), so v6's memos keep their
 *  answers across decisions. */
function withScorer(params: V6Params, settings: Params | null): PlannerParams {
  if (settings === null) return params;
  return memoFor(scored, params, 4).get(settings.attrition.toString(), () => ({ ...params, score: scorerFor(params, settings), threat: threatFor(params, settings) }));
}

export function ruleBot(table: Params): Bot {
  checkSettings(table);
  return ({ seat, view, options, history }): Move => {
    const players = view.seats.length;
    const alive = view.seats.filter((s) => !s.eliminated).length;
    const params = withScorer(withRecord(tableParams(table, players, alive), seat, history, players), inEffect(table, players, alive));
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
            const hold = bestPlan(b, seat, options.armiesToPlace, params).value;
            const traded = afterTrade(b, seat, set);
            if (bonus !== null) traded.board.armies[idx(bonus)] += 2;
            trade = bestPlan(traded.board, seat, options.armiesToPlace + traded.armies, params).value > hold;
          }
          if (trade) {
            return pictured.length > 1 && bonus !== null ? { kind: "trade", cards: set, bonusTerritory: bonus } : { kind: "trade", cards: set };
          }
        }
        const plan = bestPlan(b, seat, options.armiesToPlace, params);
        const { territory, armies } = placeFromPlan(plan);
        return { kind: "place", territory: IDS[territory], armies };
      }

      case "attack": {
        const plan = bestPlan(b, seat, 0, params);
        const move = plan.kind === "hold" ? null : nextAttack(b, plan);
        return move ?? { kind: "end-attack" };
      }

      case "occupy": {
        const armies = chooseOccupy(b, seat, idx(options.from), idx(options.to), options.min, options.max, params);
        return { kind: "occupy", armies };
      }

      case "fortify": {
        const move = chooseFortify(b, seat, options.moves, params);
        return move ? { kind: "fortify", from: move.from, to: move.to, armies: move.armies } : { kind: "end-turn" };
      }
    }
  };
}

export const ruleV6_1Bot: Bot = ruleBot(V6_1_PARAMS);

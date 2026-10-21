import type { Move, Seat } from "../../contract";
import type { Bot, BotInput } from "../bot";
import { Memo, memoFor } from "../memo";
import { ADJ, fromView, idx, IDS, type Board } from "../rule-v1/board";
import { battleOutcome, blitzCommit } from "../rule-v1/odds";
import { readRecord, recordKey } from "../rule-v4/beliefs";
import { afterTrade, chooseBonus, chooseFortify, chooseOccupy, chooseSet } from "./decisions";
import { V6_PARAMS, type Params } from "./params";
import { bestPlan, type Plan } from "./planner";

// v6: v5 (`ideas/rule-bot-v5.md`) with the fixes `ideas/rule-bot-v6.md` takes from the human
// games G4FR and 9VFL, each a switch in its settings. v5 is the base, so v6 keeps only what it
// changes; the move choices below are v5's, on v6's planner.

/** The plan's next attack, as v4 makes it. */
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

const smallTables = new WeakMap<Params, Params>();

/** The preferences a table plays by (v4): the small table's while three or more are alive. v4
 *  reads the seats the game started with, so a 5- or 6-player game played the large table's
 *  preferences down to the last three; with `alive` on, the seats still alive decide (9VFL: v4
 *  played large-table preferences two players from the end). */
export function tableParams(table: Params, players: number, alive: number): Params {
  const seats = table.fixes.alive === 1 ? alive : players;
  if (!(seats <= table.smallTable.players && alive >= 3)) return table;
  let small = smallTables.get(table);
  if (small === undefined) smallTables.set(table, (small = { ...table, prefs: table.smallTable.prefs }));
  return small;
}

const recorded = new WeakMap<Params, Memo<Params>>();

/** The settings with this game's record of the opponents in them, one object per record (v4). */
function withRecord(params: Params, seat: Seat, history: BotInput["history"], players: number): Params {
  const record = readRecord(history, players, params.opponents.beliefs.historyDecay, seat);
  return memoFor(recorded, params, 8).get(`${seat.toString()}|${recordKey(record)}`, () => ({ ...params, record }));
}

export function ruleBot(table: Params): Bot {
  return ({ seat, view, options, history }): Move => {
    const players = view.seats.length;
    const params = withRecord(tableParams(table, players, view.seats.filter((s) => !s.eliminated).length), seat, history, players);
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

export const ruleV6Bot: Bot = ruleBot(V6_PARAMS);

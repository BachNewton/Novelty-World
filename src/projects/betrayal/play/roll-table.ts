import { rowFor, tableOf } from "../engine/effects";
import type { RowSummary } from "../engine/outcomes";
import type { EventView, GameView, RuleView } from "../engine/view";
import type { RollSpec } from "../engine/sources";
import type { FigureId, Json, Step } from "../types";

/*
 * A roll's table as the status box, a card's beat and a reader show it: each
 * row's results, what it does, and, before the roll, the exact odds of
 * landing on it. The odds are exact: a die shows 0, 1 or 2 alike, so the
 * ways to make each total come from multiplying out (1 + x + x²) once per
 * die. After the roll, the row it landed on is lit. The rows come from the
 * engine's own table, so what a player is shown before is what applies after.
 */

/** The number of ways each total, 0 to 2 × dice, can come up: out of 3 to the power of the dice. */
export function waysToRoll(dice: number): number[] {
  let ways = [1];
  for (let die = 0; die < dice; die++) {
    const next = Array<number>(ways.length + 2).fill(0);
    ways.forEach((count, total) => {
      for (let face = 0; face <= 2; face++) next[total + face] += count;
    });
    ways = next;
  }
  return ways;
}

/** The chance of each row of a table, rolling this many dice with a bonus added to the total. */
export function rowOdds(rows: readonly RowSummary[], dice: number, bonus = 0): number[] {
  const ways = waysToRoll(dice);
  const all = 3 ** dice;
  const odds = rows.map(() => 0);
  ways.forEach((count, total) => {
    odds[rowFor(rows, total + bonus)] += count / all;
  });
  return odds;
}

/** A chance as the table shows it: a whole percent, never 0% or 100% for what can or can't still happen. */
export function percentText(chance: number): string {
  if (chance === 0) return "0%";
  if (chance === 1) return "100%";
  const percent = Math.round(chance * 100);
  if (percent < 1) return "<1%";
  if (percent > 99) return ">99%";
  return `${percent}%`;
}

/** The rows of the table a roll continues into, as a roll's step carries it, or null for a roll with no table. */
export function rollRows(then: { kind: string; params: Json }): RowSummary[] | null {
  return tableOf(then as Step);
}

/** The rows of a table, kept in the order the card prints them: highest results first. */
export function printedOrder(rows: readonly RowSummary[]): { row: RowSummary; index: number }[] {
  return rows.map((row, index) => ({ row, index })).sort((a, b) => b.row.min - a.row.min);
}

/** The table a card's roll goes by, for its beat to show with its text: the
 *  first roll of the card's own after it was drawn, made at once (its coming
 *  or its row) or waiting on its roller (the pending decision), or null for a
 *  card that rolls no table. */
export function cardTable(card: string, after: readonly EventView[], pending: GameView["pending"]): RowSummary[] | null {
  const byCard = (rule: RuleView) => rule.source === "card" && rule.card === card;
  for (const event of after) {
    if ((event.type !== "roll-coming" && event.type !== "table-row") || !byCard(event.rule)) continue;
    const rows = (event.data as { rows: RowSummary[] | null }).rows;
    if (rows !== null) return rows;
  }
  if (pending?.type === "decision" && pending.detail !== null && (pending.kind === "roll-before" || pending.kind === "roll-after") && byCard(pending.rule))
    return rollRows((pending.detail.params as { then: { kind: string; params: Json } }).then);
  return null;
}

/** A choice's options that each make one roll with a table (a trait chosen
 *  before the roll: Possession, the Spider), with the odds of each row at the
 *  roller's trait value now; null for an option that doesn't. */
export function optionRolls(view: GameView, params: Json): ({ rows: RowSummary[]; odds: number[] } | null)[] {
  const options = (params as { options?: { steps: Step[] }[] }).options ?? [];
  return options.map(({ steps }) => {
    const [only] = steps;
    if (steps.length !== 1 || only.kind !== "roll") return null;
    const roll = only.params as { figure: FigureId; spec: RollSpec; then: Step };
    const rows = tableOf(roll.then);
    const value = roll.spec.kind === "trait" ? view.figures[roll.figure].traits[roll.spec.trait] : undefined;
    if (rows === null || typeof value !== "number") return null;
    return { rows, odds: rowOdds(rows, value) };
  });
}

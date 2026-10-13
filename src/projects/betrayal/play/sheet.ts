import type { TurnChoice } from "../engine/exploration";
import type { FigureId } from "../types";
import type { PanelChoice } from "./choices";

/*
 * "Your explorer": the turn's actions with the explorer's cards, sorted onto
 * the sheet's fixed rows. Each card held is a row, with its uses and Drop
 * where the turn offers them; each card on the floor that can be picked up
 * is a row; each explorer who can trade is a row. The order is the engine's
 * listing, never rearranged, so a slot stays where the player learnt it.
 * The status box offers the same actions as buttons, with every trade with
 * one explorer behind one button, which opens the trade sheet.
 */

const turnChoice = (choice: PanelChoice) => choice.choice as TurnChoice;

/** A card the explorer holds, and what the turn lets it do with it. */
export interface HeldRow {
  card: string;
  uses: PanelChoice[];
  drop: PanelChoice | null;
}

/** An explorer to trade with, and every trade the turn allows with them. */
export interface TradeRow {
  with: FigureId;
  choices: PanelChoice[];
}

export interface ExplorerActions {
  held: HeldRow[];
  /** The cards on the floor that can be picked up. */
  floor: { card: string; pickUp: PanelChoice }[];
  trades: TradeRow[];
  /** How many actions the rows offer: a trade row counts once. */
  count: number;
}

/** The turn's actions on an explorer's sheet, from the cards it holds and the turn's panel choices. */
export function explorerActions(cards: readonly string[], panel: readonly PanelChoice[]): ExplorerActions {
  const held = cards.map((card): HeldRow => ({
    card,
    uses: panel.filter((choice) => {
      const turn = turnChoice(choice);
      return turn.act === "action" && turn.source === "card" && turn.id === card;
    }),
    drop: panel.find((choice) => {
      const turn = turnChoice(choice);
      return turn.act === "drop" && turn.card === card;
    }) ?? null,
  }));
  const floor = panel.flatMap((choice) => {
    const turn = turnChoice(choice);
    return turn.act === "pickup" ? [{ card: turn.card, pickUp: choice }] : [];
  });
  const trades = tradeRows(panel);
  const count = held.reduce((sum, row) => sum + row.uses.length + (row.drop ? 1 : 0), 0) + floor.length + trades.length;
  return { held, floor, trades, count };
}

/** The action a sheet opens on, by id: the first of its rows (a trade row by `trade:<explorer>`), or null where it offers none, when it opens on its tab. */
export function firstAction(rows: ExplorerActions | null): string | null {
  if (rows === null) return null;
  const ids = [
    ...rows.held.flatMap((row) => [...row.uses, ...(row.drop ? [row.drop] : [])]).map((choice) => choice.id),
    ...rows.floor.map(({ pickUp }) => pickUp.id),
    ...rows.trades.map((trade) => `trade:${trade.with}`),
  ];
  return ids.at(0) ?? null;
}

/** The turn's trades, one row per explorer, in the order the engine lists them. */
export function tradeRows(panel: readonly PanelChoice[]): TradeRow[] {
  const rows: TradeRow[] = [];
  for (const choice of panel) {
    const turn = turnChoice(choice);
    if (turn.act !== "trade") continue;
    const row = rows.find((candidate) => candidate.with === turn.with);
    if (row) row.choices.push(choice);
    else rows.push({ with: turn.with, choices: [choice] });
  }
  return rows;
}

/** A status box button for the turn: a panel choice, or every trade with one explorer. */
export type BoxAction = { kind: "choice"; choice: PanelChoice } | { kind: "trade"; row: TradeRow };

/** The status box's buttons for the turn: each panel choice, with every trade with one explorer as one entry. */
export function boxActions(panel: readonly PanelChoice[]): BoxAction[] {
  const rows = tradeRows(panel);
  return panel.flatMap((choice): BoxAction[] => {
    const turn = turnChoice(choice);
    if (turn.act !== "trade") return [{ kind: "choice", choice }];
    const row = rows.find((candidate) => candidate.with === turn.with);
    return row && row.choices[0] === choice ? [{ kind: "trade", row }] : [];
  });
}

/** What can go each way in a trade with one explorer: the cards you may give and those you may take, in the engine's order. */
export function tradeSides(row: TradeRow): { gives: string[]; takes: string[] } {
  const gives: string[] = [];
  const takes: string[] = [];
  for (const choice of row.choices) {
    const { give, take } = turnChoice(choice) as Extract<TurnChoice, { act: "trade" }>;
    if (give !== null && !gives.includes(give)) gives.push(give);
    if (take !== null && !takes.includes(take)) takes.push(take);
  }
  return { gives, takes };
}

/** The trade offering `give` for `take` (either may be null, not both), when the turn allows it. */
export function tradeOffer(row: TradeRow, give: string | null, take: string | null): PanelChoice | null {
  return (
    row.choices.find((choice) => {
      const turn = turnChoice(choice) as Extract<TurnChoice, { act: "trade" }>;
      return turn.give === give && turn.take === take;
    }) ?? null
  );
}

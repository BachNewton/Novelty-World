import { tradeParticipants } from "./engine";
import type { GameState, TradeTerms } from "./types";

/** The trade builder's cash entry: pure keypad editing and two-party
 *  balancing. The trade panel renders these; the store submits the result. */

/** Keypad digits are $10 units: typing 3, 4 enters $340. */
export const CASH_UNIT = 10;
const MAX_UNITS = 9_999;

/** The keypad's working value, local until committed. `fresh` means the value
 *  was loaded from the draft and the next digit replaces it rather than
 *  extending it, as on a calculator. */
export interface CashEntry {
  amount: number;
  negative: boolean;
  fresh: boolean;
}

export type CashKey =
  | { kind: "digit"; digit: number }
  | { kind: "back" }
  | { kind: "clear" }
  | { kind: "flip" };

export function openCashEntry(signed: number): CashEntry {
  return { amount: Math.abs(signed), negative: signed < 0, fresh: true };
}

export function cashEntryValue(entry: CashEntry): number {
  return entry.negative ? negate(entry.amount) : entry.amount;
}

// Plain `-x` turns 0 into -0, which formats as "-0".
function negate(n: number): number {
  return n === 0 ? 0 : -n;
}

export function pressCashKey(entry: CashEntry, key: CashKey): CashEntry {
  const units = entry.fresh ? 0 : Math.floor(entry.amount / CASH_UNIT);
  switch (key.kind) {
    case "digit": {
      const next = units * 10 + key.digit;
      if (next > MAX_UNITS) return entry;
      return { ...entry, amount: next * CASH_UNIT, fresh: false };
    }
    case "back":
      return {
        ...entry,
        amount: Math.floor(entry.amount / CASH_UNIT / 10) * CASH_UNIT,
        fresh: false,
      };
    case "clear":
      return { ...entry, amount: 0, fresh: false };
    case "flip":
      return { ...entry, negative: !entry.negative };
  }
}

/** The two players a trade's cash runs between, when there are exactly two:
 *  the proposer first when they are one of them, otherwise seat order. Null
 *  while the draft names fewer or more parties. */
export function cashPair(
  state: GameState,
  terms: TradeTerms & { proposerId: string },
): readonly [string, string] | null {
  const parties = tradeParticipants(state, terms);
  if (parties.size !== 2) return null;
  const ordered = state.players
    .map((p) => p.id)
    .filter((id) => parties.has(id))
    .sort((x, y) => Number(y === terms.proposerId) - Number(x === terms.proposerId));
  return [ordered[0], ordered[1]];
}

/** The pair's single cash figure: what the first pays the second (negative
 *  when the second pays). A draft built before the pair existed may be
 *  unbalanced; the second's side is then read first, else the first's. */
export function pairFigure(
  cashDelta: TradeTerms["cashDelta"],
  [first, second]: readonly [string, string],
): number {
  const received = cashDelta[second] ?? 0;
  return received !== 0 ? received : negate(cashDelta[first] ?? 0);
}

/** The balanced per-player amounts for a pair figure. */
export function pairAmounts(
  [first, second]: readonly [string, string],
  figure: number,
): Record<string, number> {
  return { [first]: negate(figure), [second]: figure };
}

/** Nudge a figure's size in the direction it already runs, stopping at zero. */
export function nudgeFigure(figure: number, step: number): number {
  const size = Math.max(0, Math.abs(figure) + step);
  return figure < 0 ? negate(size) : size;
}

/** `cashDelta` with each player in `amounts` set to that absolute amount;
 *  zero amounts are dropped, keeping the draft sparse. */
export function withCash(
  cashDelta: TradeTerms["cashDelta"],
  amounts: Readonly<Record<string, number>>,
): Record<string, number> {
  const next: Record<string, number> = { ...cashDelta };
  for (const [id, amount] of Object.entries(amounts)) {
    if (amount === 0) delete next[id];
    else next[id] = amount;
  }
  return next;
}

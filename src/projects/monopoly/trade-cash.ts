import type { TradeTerms } from "./types";

/** The trade builder's cash entry: a pure keypad reducer over one player's
 *  amount. The trade panel renders it; the store submits the result. */

const MAX_AMOUNT = 99_999;

/** The keypad's working value, local until committed. `fresh` means the value
 *  was loaded from the draft and the next digit replaces it rather than
 *  extending it, as on a calculator. `negative` is kept apart from `amount` so
 *  a sign typed before any digit holds. */
export interface CashEntry {
  amount: number;
  negative: boolean;
  fresh: boolean;
}

export type CashKey =
  | { kind: "digit"; digit: number }
  | { kind: "back" }
  | { kind: "clear" }
  | { kind: "negate" };

export function openCashEntry(signed: number): CashEntry {
  return { amount: Math.abs(signed), negative: signed < 0, fresh: true };
}

export function cashEntryValue(entry: CashEntry): number {
  // Plain `-0` would format as "-0".
  if (entry.amount === 0) return 0;
  return entry.negative ? -entry.amount : entry.amount;
}

export function pressCashKey(entry: CashEntry, key: CashKey): CashEntry {
  const amount = entry.fresh ? 0 : entry.amount;
  switch (key.kind) {
    case "digit": {
      const next = amount * 10 + key.digit;
      if (next > MAX_AMOUNT) return entry;
      return { ...entry, amount: next, fresh: false };
    }
    case "back":
      return { ...entry, amount: Math.floor(entry.amount / 10), fresh: false };
    case "clear":
      return { ...entry, amount: 0, fresh: false };
    case "negate":
      return { ...entry, negative: !entry.negative };
  }
}

/** `cashDelta` with one player's amount set absolutely; zero drops the
 *  player, keeping the draft sparse. */
export function withCash(
  cashDelta: TradeTerms["cashDelta"],
  playerId: string,
  amount: number,
): Record<string, number> {
  const next: Record<string, number> = { ...cashDelta };
  if (amount === 0) delete next[playerId];
  else next[playerId] = amount;
  return next;
}

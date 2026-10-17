import type { Seat } from "../../contract";
import { boardIncome, firstTurnBonus, opponentsInOrder, type Board } from "../rule-v1/board";
import { CARD_DISCOUNT, handWorth, hiddenHand, policyTrade, type Shape } from "../rule-v1/cards";

// What hands and incomes are worth, read by both the evaluation and the opponent model.

const EMPTY: Shape = [0, 0, 0, 0];
/** What an empty hand is worth: the cards to come, which every player draws alike and
 *  income counts instead. A hand is worth what it adds to that. */
const NO_HAND = handWorth(EMPTY, 0);

/** What `n` cards nobody but their holder has seen are worth, in armies now. */
export function hiddenCards(n: number): number {
  return CARD_DISCOUNT * (hiddenHand(n).worth - NO_HAND);
}

/** What my hand is worth in armies now: the cards I know, any I have taken unseen, and
 *  the card this turn's capture draws as it ends. */
export function myCards(b: Board, me: Seat): number {
  const known = b.known[0] + b.known[1] + b.known[2] + b.known[3];
  const unknown = b.handSize[me] - known + (b.cardEarned ? 1 : 0);
  return CARD_DISCOUNT * (handWorth(b.known, unknown) - NO_HAND);
}

/** The armies my hand is expected to trade at the start of my next turn. */
export function myNextTrade(b: Board, me: Seat): number {
  const known = b.known[0] + b.known[1] + b.known[2] + b.known[3];
  if (known === b.handSize[me] && !b.cardEarned) return policyTrade(b.known)?.value ?? 0;
  return hiddenHand(b.handSize[me] + (b.cardEarned ? 1 : 0)).nextTrade;
}

/** Each player's expected armies next turn: territory and continent income, the set
 *  their hand is expected to trade, and a later seat's first-turn bonus. Objective: it
 *  models them, so no preference of mine enters it. */
export function expectedIncome(b: Board, me: Seat): number[] {
  const income = new Array<number>(b.players).fill(0);
  for (const q of opponentsInOrder(b, me)) {
    income[q] = boardIncome(b, q) + hiddenHand(b.handSize[q]).nextTrade + firstTurnBonus(b, q);
  }
  income[me] = boardIncome(b, me);
  return income;
}

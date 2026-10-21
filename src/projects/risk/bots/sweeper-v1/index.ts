import type { GameEvent, Move, Seat } from "../../contract";
import type { TerritoryId } from "../../map";
import type { Bot } from "../bot";
import { tradeMove } from "../random";
import { fromView, hasEnemyNeighbour, idx, IDS, type Board } from "../rule-v1/board";
import { policyTrade, shapeOf } from "../rule-v1/cards";
import { chooseBonus, chooseSet } from "../rule-v1/decisions";
import { cardCapture, gate, guardShortfall, hub, keep, launch, moveIn, sweepTarget } from "./rules";

// sweeper-v1 (`ideas/sweeper-v1.md`): a style bot that plays the playbook of the person who won
// G4FR and 9VFL, flaws included. It doesn't plan or score: it follows rules (`rules.ts`).

/** This turn's captures of mine, in order, by where each came from and what it took. */
function turnCaptures(history: readonly GameEvent[], me: Seat): { from: number; to: number }[] {
  let start = history.length;
  for (; start > 0; start--) {
    const e = history[start - 1];
    if (e.kind === "turn-started" && e.seat === me) break;
  }
  let from: TerritoryId | null = null;
  const captures: { from: number; to: number }[] = [];
  for (const e of history.slice(start)) {
    if (e.kind === "blitzed" || e.kind === "battle") from = e.from;
    if (e.kind === "captured" && e.seat === me && from !== null) captures.push({ from: idx(from), to: idx(e.territory) });
  }
  return captures;
}

/** Where the sweep stands: the bigger end of this turn's last capture, or, before any, the
 *  stack the turn fed. */
function head(b: Board, me: Seat, captures: readonly { from: number; to: number }[]): number {
  if (captures.length === 0) return launch(b, me, 0);
  const last = captures[captures.length - 1];
  const ends = [last.to, last.from].filter((t) => b.owner[t] === me);
  return ends.reduce((x, y) => (b.armies[y] > b.armies[x] ? y : x));
}

function blitz(b: Board, me: Seat, from: number, to: number): Move {
  return { kind: "blitz", from: IDS[from], to: IDS[to], keepAtLeast: keep(from, gate(b, me)) };
}

export const sweeperV1Bot: Bot = ({ seat, view, options, history }): Move => {
  const b = fromView(view);
  switch (options.kind) {
    case "reinforce": {
      const hand = view.cards.hand ?? [];
      if (options.sets.length > 0 && (options.mustTrade || !options.mayPlace || policyTrade(shapeOf(hand)) !== null)) {
        const set = chooseSet(b, seat, hand, options.sets);
        const stack = launch(b, seat, options.armiesToPlace);
        return tradeMove(set, options.bonusTerritories, (choices) => chooseBonus(b, choices, stack));
      }
      const guard = guardShortfall(b, seat);
      if (guard !== null) return { kind: "place", territory: IDS[guard.gate], armies: Math.min(guard.short, options.armiesToPlace) };
      return { kind: "place", territory: IDS[launch(b, seat, options.armiesToPlace)], armies: options.armiesToPlace };
    }

    case "attack": {
      const from = head(b, seat, turnCaptures(history, seat));
      const target = sweepTarget(b, seat, from);
      if (target !== null) return blitz(b, seat, from, target);
      if (!view.cardEarned) {
        const card = cardCapture(b, seat);
        if (card !== null) return blitz(b, seat, card.from, card.to);
      }
      return { kind: "end-attack" };
    }

    case "occupy":
      return { kind: "occupy", armies: moveIn(b, seat, idx(options.from), idx(options.to), options.min, options.max) };

    case "fortify": {
      const guardAt = gate(b, seat);
      const movable = (t: number) => b.armies[t] - keep(t, guardAt);
      // After a sweep, what is left of the stack goes back to where the sweep set out.
      const captures = turnCaptures(history, seat);
      const stack = head(b, seat, captures);
      if (captures.length > 0 && movable(stack) > 0) {
        const reach = options.moves.filter((m) => idx(m.from) === stack);
        const home = hub(b, stack, captures[0].from, reach.map((m) => idx(m.to)));
        const move = reach.find((m) => idx(m.to) === home);
        if (move) return { kind: "fortify", from: move.from, to: move.to, armies: Math.min(move.maxArmies, movable(stack)) };
      }
      // Otherwise the biggest idle pile behind the lines joins the stack.
      let feed: { from: TerritoryId; armies: number } | null = null;
      for (const m of options.moves) {
        const from = idx(m.from);
        if (idx(m.to) !== stack || hasEnemyNeighbour(b, from)) continue;
        const armies = Math.min(m.maxArmies, movable(from));
        if (armies > 0 && (feed === null || armies > feed.armies)) feed = { from: m.from, armies };
      }
      if (feed === null) return { kind: "end-turn" };
      return { kind: "fortify", from: feed.from, to: IDS[stack], armies: feed.armies };
    }
  }
};

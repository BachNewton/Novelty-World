import { createRng, pick } from "@/shared/lib/seeded-random";
import { shuffleArray } from "@/shared/lib/utils";
import type { GameConfig, GameEvent, GameState, Seat } from "../contract";
import type { TerritoryId } from "../map";
import { FULL_DECK, TERRITORY_CARDS } from "./cards";
import { TERRITORY_IDS, wrap, type Ctx, type Holding } from "./state";
import { startTurn } from "./turn";

/** `SETUP-1`: starting armies by player count. */
export const STARTING_ARMIES: Record<number, number> = { 3: 35, 4: 30, 5: 25, 6: 20 };

/** A new game, set up and waiting on the first player's first reinforcement. Setup takes no
 *  decisions (note `auto-placement`). The random source is drawn on in this order: the seat
 *  order (`SETUP-3`), the deal of the 42 territory cards (`SETUP-4`), each starting army's
 *  territory (`SETUP-5`), and the 44-card deck (`SETUP-6`). */
export function newGame(config: GameConfig, seed: string): { state: GameState; events: readonly GameEvent[] } {
  const players = config.players;
  if (!Number.isInteger(players) || players < 3 || players > 6) {
    throw new Error(`Risk is for 3 to 6 players, not ${players}`);
  }
  const seats = Array.from({ length: players }, (_, seat) => seat);
  const rng = createRng(seed);
  const turnOrder = shuffleArray(seats, rng.next);
  const events: GameEvent[] = [{ rule: "SETUP-3", kind: "turn-order", order: [...turnOrder] }];

  // SETUP-4: the wilds set aside, the territory cards shuffled and dealt round the seat order
  // from the first player, 1 army on each.
  const dealt = shuffleArray(TERRITORY_CARDS, rng.next) as TerritoryId[];
  const owners = dealt.map((_, i) => turnOrder[i % players]);
  const board = Object.fromEntries(
    dealt.map((territory, i): [TerritoryId, Holding] => [territory, { owner: owners[i], armies: 1 }]),
  ) as Record<TerritoryId, Holding>;
  events.push({
    rule: "SETUP-4",
    kind: "dealt",
    owners: Object.fromEntries(dealt.map((t, i) => [t, owners[i]])) as Record<TerritoryId, Seat>,
  });

  // SETUP-5: each player's remaining armies, one at a time, on a random territory of their own.
  for (const seat of turnOrder) {
    const own = dealt.filter((_, i) => owners[i] === seat);
    for (let left = STARTING_ARMIES[players] - own.length; left > 0; left--) board[pick(rng, own)].armies += 1;
  }
  events.push({
    rule: "SETUP-5",
    kind: "starting-armies",
    armies: Object.fromEntries(TERRITORY_IDS.map((t) => [t, board[t].armies])) as Record<TerritoryId, number>,
  });

  const ctx: Ctx = {
    s: {
      players,
      rng: 0,
      turnOrder,
      board,
      hands: seats.map(() => []),
      // SETUP-6: the wilds returned and all 44 cards shuffled as the draw pile.
      drawPile: shuffleArray(FULL_DECK, rng.next),
      discardPile: [],
      setsTraded: 0,
      eliminated: seats.map(() => false),
      turn: 0,
      active: turnOrder[0],
      phase: "reinforce",
      reinforce: null,
      occupying: null,
      capturedThisTurn: false,
      winner: null,
    },
    rng,
    events,
  };
  events.push({ rule: "SETUP-6", kind: "deck-reshuffled" });
  startTurn(ctx, turnOrder[0], "SETUP-7");
  ctx.s.rng = rng.getState();
  return { state: wrap(ctx.s), events };
}

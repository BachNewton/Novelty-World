import { createRng } from "@/shared/lib/seeded-random";
import { shuffleArray } from "@/shared/lib/utils";
import type { GameConfig, GameEvent, GameState, Move, Seat } from "../contract";
import type { TerritoryId } from "../map";
import { FULL_DECK, TERRITORY_CARDS } from "./cards";
import { isTerritoryId, nextSeat, ownerOf, setPhase, wrap, type Ctx, type EngineState, type Holding } from "./state";
import { startTurn } from "./turn";

/** `SETUP-1`: starting armies by player count. */
export const STARTING_ARMIES: Record<number, number> = { 3: 35, 4: 30, 5: 25, 6: 20 };

/** A new game, at its first placement. The random source is drawn on in this order: the seat
 *  order (`SETUP-3`), the deal of the 42 territory cards (`SETUP-4`), and, once every army is
 *  placed, the 44-card deck (`SETUP-6`). */
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

  const dealtTo = (seat: Seat) => owners.filter((owner) => owner === seat).length;
  const ctx: Ctx = {
    s: {
      players,
      rng: 0,
      turnOrder,
      board,
      hands: seats.map(() => []),
      // The whole deck waits here, in box order, until it is shuffled after setup (SETUP-6), so
      // all 44 cards are always somewhere (INV-4).
      drawPile: [...FULL_DECK],
      discardPile: [],
      setsTraded: 0,
      eliminated: seats.map(() => false),
      turn: 0,
      active: turnOrder[0],
      phase: "setup-place",
      setupArmiesLeft: seats.map((seat) => STARTING_ARMIES[players] - dealtTo(seat)),
      reinforce: null,
      occupying: null,
      capturedThisTurn: false,
      winner: null,
    },
    rng,
    events,
  };
  setPhase(ctx, "setup-place", "SETUP-5");
  // Note placement-start: placing begins with the player after the one dealt the last card.
  advanceSetupPlacement(ctx, owners[owners.length - 1]);
  ctx.s.rng = rng.getState();
  return { state: wrap(ctx.s), events };
}

function armiesLeft(s: EngineState): number[] {
  if (!s.setupArmiesLeft) throw new Error(`setup is over (phase ${s.phase})`);
  return s.setupArmiesLeft;
}

/** `SETUP-5`: the next seat round the order with armies left to place; a seat with none is
 *  skipped, and when no seat has any, setup is done. */
function advanceSetupPlacement(ctx: Ctx, after: Seat): void {
  const left = armiesLeft(ctx.s);
  const next = nextSeat(ctx.s, after, (seat) => left[seat] > 0);
  if (next === null) finishSetup(ctx);
  else ctx.s.active = next;
}

/** `SETUP-6`: the wilds returned and all 44 cards shuffled as the draw pile; then the first
 *  player's turn (`SETUP-7`). */
function finishSetup(ctx: Ctx): void {
  const s = ctx.s;
  s.setupArmiesLeft = null;
  s.drawPile = shuffleArray(s.drawPile, ctx.rng.next);
  ctx.events.push({ rule: "SETUP-6", kind: "deck-reshuffled" });
  startTurn(ctx, s.turnOrder[0], "SETUP-7");
}

/** `SETUP-5`: exactly one army, on a territory the player owns. */
export function setupPlace(ctx: Ctx, seat: Seat, move: Extract<Move, { kind: "place" }>): string | null {
  const s = ctx.s;
  if (!isTerritoryId(move.territory) || ownerOf(s, move.territory) !== seat) {
    return "armies can only be placed on a territory you own";
  }
  if (move.armies !== 1) return "setup armies are placed one at a time";

  s.board[move.territory].armies += 1;
  ctx.events.push({ rule: "SETUP-5", kind: "placed", owner: seat, territory: move.territory, armies: 1 });
  armiesLeft(s)[seat] -= 1;
  advanceSetupPlacement(ctx, seat);
  return null;
}

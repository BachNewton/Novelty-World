import type { GameEvent, Seat, TerritoryView } from "../contract";
import type { TerritoryId } from "../map";

// What bots read back from the game's public history (`BotInput.history`): a bot
// keeps no state between moves, so anything it remembers it derives here, from
// the events its seat saw.

/** One attack of this turn: a battle or a blitz, and whether it captured. */
export interface AttackMade {
  from: TerritoryId;
  to: TerritoryId;
  blitz: boolean;
}

/** The active seat's turn so far. */
export interface TurnSoFar {
  seat: Seat;
  turn: number;
  /** Every battle and blitz, in order. */
  attacks: readonly AttackMade[];
  /** Territories captured, in order. */
  captured: readonly TerritoryId[];
  /** Territories armies were placed on (by `place`, in any reinforce phase of the turn), in order,
   *  each once. */
  placedOn: readonly TerritoryId[];
  /** Sets traded. */
  traded: number;
}

/** The turn under way: the events since the last turn began. */
export function turnSoFar(history: readonly GameEvent[]): TurnSoFar {
  let start = history.length - 1;
  while (start >= 0 && history[start].kind !== "turn-started") start--;
  const begun = history[start];
  if (begun.kind !== "turn-started") throw new Error("No turn has started");
  const attacks: AttackMade[] = [];
  const captured: TerritoryId[] = [];
  const placedOn: TerritoryId[] = [];
  let traded = 0;
  for (let i = start + 1; i < history.length; i++) {
    const e = history[i];
    if (e.kind === "battle" || e.kind === "blitzed") attacks.push({ from: e.from, to: e.to, blitz: e.kind === "blitzed" });
    else if (e.kind === "captured") captured.push(e.territory);
    else if (e.kind === "placed" && !placedOn.includes(e.territory)) placedOn.push(e.territory);
    else if (e.kind === "traded") traded++;
  }
  return { seat: begun.seat, turn: begun.turn, attacks, captured, placedOn, traded };
}

export type Board = Record<TerritoryId, TerritoryView>;

/** The board as it stood when each turn ended, rebuilt from the events: `ended` is the seat whose
 *  turn it was. A turn's end is the moment the next turn begins. */
export function boardsAtTurnEnds(history: readonly GameEvent[]): { ended: Seat; turn: number; board: Board }[] {
  const ends: { ended: Seat; turn: number; board: Board }[] = [];
  forEachTurnEnd(history, (ended, turn, board) => {
    ends.push({ ended, turn, board: structuredClone(board) });
    return false;
  });
  return ends;
}

/** `boardsAtTurnEnds` without the copies: `visit` sees the board being rebuilt, as it stands at
 *  each turn's end, and must not keep it. Returning true stops the walk, and the walk returns
 *  whether it was stopped. */
export function forEachTurnEnd(history: readonly GameEvent[], visit: (ended: Seat, turn: number, board: Readonly<Board>) => boolean): boolean {
  const board = {} as Board;
  let current: { seat: Seat; turn: number } | null = null;
  for (const e of history) {
    switch (e.kind) {
      case "dealt":
        for (const [t, owner] of Object.entries(e.owners) as [TerritoryId, Seat][]) board[t] = { owner, armies: 1 };
        break;
      case "starting-armies":
        for (const [t, armies] of Object.entries(e.armies) as [TerritoryId, number][]) board[t].armies = armies;
        break;
      case "placed":
        board[e.territory].armies += e.armies;
        break;
      case "traded":
        if (e.bonus) board[e.bonus.territory].armies += e.bonus.armies;
        break;
      case "battle":
      case "blitzed":
        board[e.from].armies -= e.attackerLosses;
        board[e.to].armies -= e.defenderLosses;
        break;
      case "captured":
        board[e.territory].owner = e.seat;
        break;
      // The move-in names its total, the minimum that went in with the capture included.
      case "occupied":
      case "fortified":
        board[e.from].armies -= e.armies;
        board[e.to].armies += e.armies;
        break;
      case "turn-started":
        if (current && visit(current.seat, current.turn, board)) return true;
        current = { seat: e.seat, turn: e.turn };
        break;
      case "turn-order":
      case "reinforcements":
      case "eliminated":
      case "card-drawn":
      case "deck-reshuffled":
      case "phase":
      case "game-over":
        break;
    }
  }
  return false;
}

/** Rounds of the turn order completed (`REINF-6`): 0 while every seat is on its first turn. A round
 *  ends when the turn passes back to a seat earlier in the turn order. */
export function roundsCompleted(history: readonly GameEvent[]): number {
  let order: readonly Seat[] = [];
  let last: number | null = null;
  let rounds = 0;
  for (const e of history) {
    if (e.kind === "turn-order") order = e.order;
    if (e.kind !== "turn-started") continue;
    const at = order.indexOf(e.seat);
    if (last !== null && at <= last) rounds++;
    last = at;
  }
  return rounds;
}

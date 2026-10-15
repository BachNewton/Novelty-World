import type { ContinentId, TerritoryId } from "./map";

// The boundary between the Risk engine and everything that uses it: the UI, the server
// route that runs real games, and the bots. Nothing outside the engine reads its state
// directly; it asks for a view, a seat's options, and applies moves. Rule ids (`COMBAT-4`)
// and note ids (`defender-dice`) refer to `RULES.md`.

/** A seat at the table, 0-based in seat order. Turn order is drawn at setup (`SETUP-3`). */
export type Seat = number;

export type CardSymbol = "infantry" | "cavalry" | "artillery";

/** A territory card is named by its territory; the two wilds have their own ids. */
export type CardId = TerritoryId | "wild-1" | "wild-2";

export interface GameConfig {
  /** 3–6 (`SETUP-1`): there is no 2-player game. */
  players: number;
}

/** The engine's whole game: hidden information included (the deck's order, every hand). It is
 *  plain JSON, stored in the game row every player can read; by good faith, a screen only
 *  ever shows a player their own `GameView`. Its shape is the engine's own. */
export type GameState = { readonly engineState: unknown };

// ---------------------------------------------------------------------------
// What a player sees
// ---------------------------------------------------------------------------

export type Phase =
  | "setup-place" // SETUP-5: placing the remaining starting armies, once territories are dealt
  | "reinforce" // REINF-*, CARDS-5: trading and placing armies; also mid-attack after ELIM-3
  | "attack" // COMBAT-*
  | "fortify" // FORT-*
  | "game-over";

export interface TerritoryView {
  owner: Seat;
  armies: number;
}

export interface SeatView {
  seat: Seat;
  eliminated: boolean;
  territories: number;
  armies: number;
  handSize: number;
}

/** Everything one viewer may see (`CARDS-2` and note `public-cards`): the board, every hand's
 *  size, the traded cards, and their own hand. A spectator's view has no hand. */
export interface GameView {
  viewer: Seat | null;
  /** Seat order: `turnOrder[0]` played first. */
  turnOrder: readonly Seat[];
  seats: readonly SeatView[];
  territories: Record<TerritoryId, TerritoryView>;
  turn: number;
  active: Seat;
  phase: Phase;
  /** Armies the active seat still has to place this phase. */
  armiesToPlace: number;
  cards: {
    drawPile: number;
    discardPile: readonly CardId[];
    setsTraded: number;
    /** What the next set traded is worth (`CARDS-6`). */
    nextSetValue: number;
    /** The viewer's own hand; null for a spectator. */
    hand: readonly CardId[] | null;
  };
  /** Set after a capture until the attacker moves in (`COMBAT-6`). The minimum has already moved
   *  in with the capture, so `territories` shows it (no territory is ever empty, `INV-1`); `min`
   *  and `max` bound the total that an `occupy` move names. */
  occupying: { from: TerritoryId; to: TerritoryId; min: number; max: number } | null;
  /** Whether the active seat has captured a territory this turn, so draws a card when its attack
   *  ends (`CARDS-1`). Public: every capture is seen. */
  cardEarned: boolean;
  winner: Seat | null;
}

// ---------------------------------------------------------------------------
// What a player can do
// ---------------------------------------------------------------------------

/** Every move a seat can make. A move is legal exactly when `apply` accepts it: there is no
 *  second source of legality. Moves the rules leave no choice over (moving into a territory
 *  when the minimum equals the maximum, the defender's dice) are taken by the engine itself. */
export type Move =
  /** Setup and reinforcement placement. In setup `armies` is 1 (`SETUP-5`). */
  | { kind: "place"; territory: TerritoryId; armies: number }
  /** `bonusTerritory` picks which owned, pictured territory gets the +2 (`CARDS-7`) when more
   *  than one qualifies; the engine picks when only one does. */
  | { kind: "trade"; cards: readonly [CardId, CardId, CardId]; bonusTerritory?: TerritoryId }
  /** One battle (`COMBAT-4`) with the attacker's chosen dice. */
  | { kind: "attack"; from: TerritoryId; to: TerritoryId; dice: 1 | 2 | 3 }
  /** Battles with the most dice allowed, repeated until the territory is captured or the
   *  attacking territory is down to `keepAtLeast` armies (at least 1). One move, so a whole
   *  assault costs the server one request. */
  | { kind: "blitz"; from: TerritoryId; to: TerritoryId; keepAtLeast: number }
  /** The total armies in the captured territory once moved in, `min` to `max` of `occupying`. */
  | { kind: "occupy"; armies: number }
  | { kind: "end-attack" }
  | { kind: "fortify"; from: TerritoryId; to: TerritoryId; armies: number }
  /** Ends the turn without fortifying (`FORT-3`). */
  | { kind: "end-turn" };

/** The legal moves for one seat right now, grouped so a screen can highlight targets
 *  without trying moves one by one. Every move these allow is accepted by `apply`, and no
 *  other move is (a test holds the two together). Null when the seat has nothing to do.
 *  `end-attack` is allowed whenever the kind is "attack", and `end-turn` whenever it is
 *  "fortify". A phase with nothing to do but end it is ended by the engine. */
export type Options =
  | {
      kind: "setup-place";
      ownTerritories: readonly TerritoryId[];
      ownArmiesLeft: number;
    }
  | {
      kind: "reinforce";
      armiesToPlace: number;
      /** False while a trade is required (`CARDS-5`, `ELIM-3`): placing must wait for it. */
      mayPlace: boolean;
      ownTerritories: readonly TerritoryId[];
      mustTrade: boolean;
      sets: readonly (readonly [CardId, CardId, CardId])[];
      /** Owned territories pictured on cards in hand, which can take the occupied-territory
       *  bonus (`CARDS-7`): a set's `bonusTerritory` must be one of its own cards' territories in
       *  this list, and is required when the set has two or more. */
      bonusTerritories: readonly TerritoryId[];
    }
  | {
      kind: "attack";
      attacks: readonly { from: TerritoryId; to: TerritoryId; maxDice: 1 | 2 | 3 }[];
    }
  | { kind: "occupy"; from: TerritoryId; to: TerritoryId; min: number; max: number }
  | {
      kind: "fortify";
      moves: readonly { from: TerritoryId; to: TerritoryId; maxArmies: number }[];
    };

// ---------------------------------------------------------------------------
// What happened
// ---------------------------------------------------------------------------

/** Every event names the rule (or `RULES.md` note) that caused it, for tracing a game against
 *  the rules. Events carry only what the seat they are shown to may see: see `redact`. */
export type GameEvent = { rule: string } & (
  | { kind: "turn-order"; order: readonly Seat[] }
  /** The setup deal (`SETUP-4`): each territory's first owner, with 1 army on it. */
  | { kind: "dealt"; owners: Readonly<Record<TerritoryId, Seat>> }
  | { kind: "placed"; owner: Seat; territory: TerritoryId; armies: number }
  | {
      kind: "reinforcements";
      seat: Seat;
      fromTerritories: number;
      fromContinents: readonly { continent: ContinentId; bonus: number }[];
    }
  | {
      kind: "traded";
      seat: Seat;
      cards: readonly [CardId, CardId, CardId];
      armies: number;
      bonus: { territory: TerritoryId; armies: number } | null;
    }
  | {
      kind: "battle";
      from: TerritoryId;
      to: TerritoryId;
      attackerDice: readonly number[];
      defenderDice: readonly number[];
      attackerLosses: number;
      defenderLosses: number;
    }
  | { kind: "captured"; seat: Seat; territory: TerritoryId; from: Seat }
  | { kind: "occupied"; from: TerritoryId; to: TerritoryId; armies: number }
  | { kind: "eliminated"; seat: Seat; by: Seat; cardsTaken: number }
  /** `card` is present only for the seat that drew it. */
  | { kind: "card-drawn"; seat: Seat; card?: CardId }
  | { kind: "deck-reshuffled" }
  | { kind: "fortified"; from: TerritoryId; to: TerritoryId; armies: number }
  | { kind: "turn-started"; seat: Seat; turn: number }
  | { kind: "phase"; phase: Phase }
  | { kind: "game-over"; winner: Seat }
);

export type ApplyResult =
  | { ok: true; state: GameState; events: readonly GameEvent[] }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/** Pure and deterministic: the random source lives in the state, seeded at `newGame`, so a
 *  game is a function of its seed and its moves (`INV-10`). */
export interface RiskEngine {
  newGame(config: GameConfig, seed: string): { state: GameState; events: readonly GameEvent[] };
  /** Applies `seat`'s move, then every forced step after it, stopping at the next decision. */
  apply(state: GameState, seat: Seat, move: Move): ApplyResult;
  options(state: GameState, seat: Seat): Options | null;
  view(state: GameState, viewer: Seat | null): GameView;
  /** The events as `viewer` may see them: cards drawn by others lose their face. */
  redact(events: readonly GameEvent[], viewer: Seat | null): readonly GameEvent[];
}

// ---------------------------------------------------------------------------
// Answers over the network
// ---------------------------------------------------------------------------

/** Names a pending decision: how many moves the game had applied when it was asked. Every
 *  accepted move answers one decision and raises the next, so the count is the id. Whoever
 *  applies moves (the server route, and a phone replaying its own moves ahead of the server)
 *  keeps it beside the engine's state; the engine needn't. */
export type DecisionId = number;

/** A move as it is sent: it names the decision it answers, so an answer to a decision that is
 *  no longer pending is rejected, and a slow or repeated answer is harmless. Only one seat acts
 *  at a time, and the random source lives in the state, so a phone applying its own answer
 *  computes the same dice the server will. */
export interface Answer {
  decision: DecisionId;
  seat: Seat;
  move: Move;
}

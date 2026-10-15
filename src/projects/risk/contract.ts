import type { ContinentId, TerritoryId } from "./map";

// The boundary between the Risk engine and everything that uses it: the UI, the server
// route that runs real games, and the bots. Nothing outside the engine reads its state
// directly; it asks for a view, a seat's options, and applies moves. Rule ids (`COMBAT-4`)
// and note ids (`defender-dice`) refer to `RULES.md`.

/** A seat at the table, 0-based in seat order. Turn order is drawn at setup (`SETUP-3`). */
export type Seat = number;

/** Who holds a territory: a seat, or the 2-player game's neutral army (`TWO-*`). */
export type Owner = Seat | "neutral";

export type CardSymbol = "infantry" | "cavalry" | "artillery";

/** A territory card is named by its territory; the two wilds have their own ids. */
export type CardId = TerritoryId | "wild-1" | "wild-2";

export interface GameConfig {
  /** 2–6. Two players adds the neutral army (`TWO-*`). */
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
  | "setup-place" // SETUP-5 / TWO-3: placing the remaining starting armies, once territories are dealt
  | "reinforce" // REINF-*, CARDS-5: trading and placing armies; also mid-attack after ELIM-3
  | "attack" // COMBAT-*
  | "fortify" // FORT-*
  | "game-over";

export interface TerritoryView {
  owner: Owner;
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
  /** Set after a capture until the attacker moves in (`COMBAT-6`). */
  occupying: { from: TerritoryId; to: TerritoryId; min: number; max: number } | null;
  winner: Seat | null;
}

// ---------------------------------------------------------------------------
// What a player can do
// ---------------------------------------------------------------------------

/** Every move a seat can make. A move is legal exactly when `apply` accepts it: there is no
 *  second source of legality. Moves the rules leave no choice over (moving into a territory
 *  when the minimum equals the maximum, the defender's dice) are taken by the engine itself. */
export type Move =
  /** Setup and reinforcement placement. In setup `armies` is 1 (`SETUP-5`); in the 2-player
   *  setup a turn places 2 of one's own armies, then 1 neutral (`TWO-3`). */
  | { kind: "place"; territory: TerritoryId; armies: number }
  | { kind: "place-neutral"; territory: TerritoryId }
  /** `bonusTerritory` picks which owned, pictured territory gets the +2 (`CARDS-7`) when more
   *  than one qualifies; the engine picks when only one does. */
  | { kind: "trade"; cards: readonly [CardId, CardId, CardId]; bonusTerritory?: TerritoryId }
  /** One battle (`COMBAT-4`) with the attacker's chosen dice. */
  | { kind: "attack"; from: TerritoryId; to: TerritoryId; dice: 1 | 2 | 3 }
  /** Battles with the most dice allowed, repeated until the territory is captured or the
   *  attacking territory is down to `keepAtLeast` armies (at least 1). One move, so a whole
   *  assault costs the server one request. */
  | { kind: "blitz"; from: TerritoryId; to: TerritoryId; keepAtLeast: number }
  | { kind: "occupy"; armies: number }
  | { kind: "end-attack" }
  | { kind: "fortify"; from: TerritoryId; to: TerritoryId; armies: number }
  /** Ends the turn without fortifying (`FORT-3`). */
  | { kind: "end-turn" };

/** The legal moves for one seat right now, grouped so a screen can highlight targets
 *  without trying moves one by one. Every move these allow is accepted by `apply`, and no
 *  other move is (a test holds the two together). Null when the seat has nothing to do. */
export type Options =
  | {
      kind: "setup-place";
      ownTerritories: readonly TerritoryId[];
      ownArmiesLeft: number;
      /** 2-player setup only: neutral territories that may take this turn's neutral army. */
      neutralTerritories: readonly TerritoryId[];
      neutralArmiesLeft: number;
    }
  | {
      kind: "reinforce";
      armiesToPlace: number;
      /** False while a trade is required (`CARDS-5`, `ELIM-3`): placing must wait for it. */
      mayPlace: boolean;
      ownTerritories: readonly TerritoryId[];
      mustTrade: boolean;
      sets: readonly (readonly [CardId, CardId, CardId])[];
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

/** Every event names the rule (or `RULES.md` note) that caused it, so the screen can explain
 *  it. Events carry only what the seat they are shown to may see: see `redact`. */
export type GameEvent = { rule: string } & (
  | { kind: "turn-order"; order: readonly Seat[] }
  /** The setup deal (`SETUP-4`, `TWO-2`): each territory's first owner, with 1 army on it. */
  | { kind: "dealt"; owners: Readonly<Record<TerritoryId, Owner>> }
  | { kind: "placed"; owner: Owner; territory: TerritoryId; armies: number }
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
  | { kind: "captured"; seat: Seat; territory: TerritoryId; from: Owner }
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

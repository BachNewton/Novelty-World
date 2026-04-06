import type {
  Card,
  Suit,
  Rank,
  Color,
  PlayerIndex,
  Team,
  GameState,
  GamePhase,
  BidAction,
  TrickCard,
  CompletedTrick,
  HandResult,
  ActionResult,
} from "./types";

// ============================================================
// Constants
// ============================================================

export const SUITS: readonly Suit[] = ["hearts", "diamonds", "clubs", "spades"];
export const RANKS: readonly Rank[] = ["9", "10", "jack", "queen", "king", "ace"];
export const WINNING_SCORE = 10;

/** Trump rank order, highest first. (RULES §5.1) */
export const TRUMP_RANK_ORDER: readonly Rank[] = [
  "jack", // right bower placeholder — actual comparison uses isBower checks
  "jack", // left bower placeholder
  "ace",
  "king",
  "queen",
  "10",
  "9",
];

/** Non-trump rank order, highest first. (RULES §5.2) */
export const NON_TRUMP_RANK_ORDER: readonly Rank[] = [
  "ace",
  "king",
  "queen",
  "jack",
  "10",
  "9",
];

// ============================================================
// Card utilities
// ============================================================

/** Return the color of a suit. (RULES §5.3) */
export function getSuitColor(suit: Suit): Color {
  throw new Error("Not implemented");
}

/** Return the other suit of the same color. (RULES §5.3) */
export function getPartnerSuit(suit: Suit): Suit {
  throw new Error("Not implemented");
}

/**
 * Return the effective suit of a card given the current trump.
 * The Left Bower belongs to the trump suit, not its printed suit. (RULES §5.1)
 */
export function getEffectiveSuit(card: Card, trumpSuit: Suit): Suit {
  throw new Error("Not implemented");
}

/** Is this card the Right Bower? (RULES §5.1) */
export function isRightBower(card: Card, trumpSuit: Suit): boolean {
  throw new Error("Not implemented");
}

/** Is this card the Left Bower? (RULES §5.1) */
export function isLeftBower(card: Card, trumpSuit: Suit): boolean {
  throw new Error("Not implemented");
}

/** Is this card a trump card (including bowers)? */
export function isTrump(card: Card, trumpSuit: Suit): boolean {
  throw new Error("Not implemented");
}

/**
 * Compare two cards for trick resolution.
 * Returns negative if a wins, positive if b wins, 0 if equal.
 * Only cards of the lead suit or trump suit can win. (RULES §8.3)
 */
export function compareCards(
  a: Card,
  b: Card,
  trumpSuit: Suit,
  leadSuit: Suit,
): number {
  throw new Error("Not implemented");
}

// ============================================================
// Deck and dealing (RULES §2, §4)
// ============================================================

/** Create an unshuffled 24-card Euchre deck. */
export function createDeck(): Card[] {
  throw new Error("Not implemented");
}

/** Shuffle a deck using Fisher-Yates. Returns a new array. */
export function shuffleDeck(deck: Card[]): Card[] {
  throw new Error("Not implemented");
}

/**
 * Deal 5 cards to each player from a shuffled deck.
 * Returns the 4 hands and the 4-card kitty. (RULES §4)
 */
export function deal(deck: Card[]): {
  hands: [Card[], Card[], Card[], Card[]];
  kitty: Card[];
} {
  throw new Error("Not implemented");
}

// ============================================================
// Player utilities (RULES §3)
// ============================================================

/** Get the team a player belongs to. 0,2 = A; 1,3 = B. */
export function getTeam(player: PlayerIndex): Team {
  throw new Error("Not implemented");
}

/** Get a player's partner. 0↔2, 1↔3. */
export function getPartner(player: PlayerIndex): PlayerIndex {
  throw new Error("Not implemented");
}

/** Get the next player clockwise, optionally skipping the alone player's partner. */
export function getNextPlayer(
  current: PlayerIndex,
  skipPlayer?: PlayerIndex | null,
): PlayerIndex {
  throw new Error("Not implemented");
}

/** Get the player to the left of the dealer (leads first trick). (RULES §8.1) */
export function getLeadPlayer(
  dealer: PlayerIndex,
  goingAlone: boolean,
  alonePlayer: PlayerIndex | null,
): PlayerIndex {
  throw new Error("Not implemented");
}

// ============================================================
// Bidding (RULES §6)
// ============================================================

/**
 * Apply a bid action to the game state.
 * Handles round 1 (order up / pass) and round 2 (call suit / pass).
 * Enforces stick-the-dealer. (RULES §6.3)
 */
export function applyBid(
  state: GameState,
  player: PlayerIndex,
  action: BidAction,
): ActionResult {
  throw new Error("Not implemented");
}

/**
 * Can the current player pass, or must they bid? (stick-the-dealer check)
 */
export function canPass(state: GameState): boolean {
  throw new Error("Not implemented");
}

// ============================================================
// Dealer discard (RULES §6.1)
// ============================================================

/**
 * After the up card is ordered up, the dealer picks it up and must
 * discard one card. Apply that discard.
 */
export function applyDealerDiscard(
  state: GameState,
  card: Card,
): ActionResult {
  throw new Error("Not implemented");
}

// ============================================================
// Trick play (RULES §8)
// ============================================================

/**
 * Get all valid cards a player can play from their hand.
 * Must follow lead suit if able (Left Bower belongs to trump). (RULES §8.2)
 */
export function getValidPlays(
  hand: Card[],
  leadSuit: Suit | null,
  trumpSuit: Suit,
): Card[] {
  throw new Error("Not implemented");
}

/**
 * Is this specific card a valid play? (RULES §8.2)
 */
export function isValidPlay(
  hand: Card[],
  card: Card,
  leadSuit: Suit | null,
  trumpSuit: Suit,
): boolean {
  throw new Error("Not implemented");
}

/**
 * Determine who won a completed trick. (RULES §8.3)
 */
export function determineTrickWinner(
  trick: TrickCard[],
  trumpSuit: Suit,
): PlayerIndex {
  throw new Error("Not implemented");
}

/**
 * Apply a card play to the game state.
 * Validates the play, adds to current trick, resolves trick if complete,
 * and transitions phase when all 5 tricks are done.
 */
export function applyPlay(
  state: GameState,
  player: PlayerIndex,
  card: Card,
): ActionResult {
  throw new Error("Not implemented");
}

// ============================================================
// Scoring (RULES §9)
// ============================================================

/**
 * Calculate the score for a completed hand.
 */
export function calculateHandScore(
  makerTricksWon: number,
  wentAlone: boolean,
): { points: number; euchred: boolean; march: boolean } {
  throw new Error("Not implemented");
}

/**
 * Score a completed hand and return the full result.
 */
export function scoreHand(state: GameState): HandResult {
  throw new Error("Not implemented");
}

/**
 * Count tricks won by each team from completed tricks.
 */
export function countTricksByTeam(
  completedTricks: CompletedTrick[],
): [number, number] {
  throw new Error("Not implemented");
}

// ============================================================
// Game flow
// ============================================================

/** Create the initial game state with a given starting dealer. */
export function createGameState(startingDealer: PlayerIndex): GameState {
  throw new Error("Not implemented");
}

/**
 * Deal a new hand: shuffle, deal cards, flip up card, set phase to bidding.
 * The current dealer on the state is used.
 */
export function dealHand(state: GameState): GameState {
  throw new Error("Not implemented");
}

/** Rotate dealer one seat clockwise. (RULES §10) */
export function rotateDealer(dealer: PlayerIndex): PlayerIndex {
  throw new Error("Not implemented");
}

/** Check if the game is over (a team reached 10). (RULES §9.1) */
export function isGameOver(scores: [number, number]): Team | null {
  throw new Error("Not implemented");
}

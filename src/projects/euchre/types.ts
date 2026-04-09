// ============================================================
// Euchre types — all game concepts from RULES.md
// ============================================================

// --- Core card types ---

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";

export type Rank = "9" | "10" | "jack" | "queen" | "king" | "ace";

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type Color = "red" | "black";

/** Players are indexed 0–3 clockwise. 0+2 = Team A, 1+3 = Team B. (RULES §3) */
export type PlayerIndex = 0 | 1 | 2 | 3;

export type Team = "A" | "B";

// --- Game phases (state machine) ---

export type GamePhase =
  | "bidding-round-1" // RULES §6.1 — players decide on the up card
  | "bidding-round-2" // RULES §6.2 — players name a suit
  | "dealer-discard" //  dealer picks up the up card and must discard one
  | "playing" //         RULES §8 — trick-taking play
  | "hand-over" //       all 5 tricks done, hand scored
  | "game-over"; //      a team reached 10 points (RULES §9.1)

// --- Bidding ---

export type BidAction =
  | { type: "pass" }
  | { type: "order-up"; alone: boolean } // round 1 only (RULES §6.1)
  | { type: "call"; suit: Suit; alone: boolean }; // round 2 only (RULES §6.2)

// --- Trick play ---

export interface TrickCard {
  player: PlayerIndex;
  card: Card;
}

export interface CompletedTrick {
  cards: TrickCard[];
  winner: PlayerIndex;
  leadSuit: Suit; // effective suit of the lead card
}

// --- Hand result (after 5 tricks) ---

export interface HandResult {
  makerTeam: Team;
  makerTricksWon: number;
  defenderTricksWon: number;
  points: number;
  scoringTeam: Team;
  euchred: boolean;
  march: boolean;
  wentAlone: boolean;
}

// --- Full game state ---

export interface GameState {
  phase: GamePhase;

  /** Each player's current hand. hands[playerIndex] = their cards. */
  hands: [Card[], Card[], Card[], Card[]];

  /** The 4-card kitty (face-down remainder after dealing). */
  kitty: Card[];

  /** The face-up card proposed for trump in round 1. Null after turned down. */
  upCard: Card | null;

  // -- Trump & bidding --

  trumpSuit: Suit | null;

  /** Suit turned down in round 1 — cannot be named in round 2. (RULES §6.2) */
  turnedDownSuit: Suit | null;

  /** Current dealer position. Rotates clockwise each hand. (RULES §10) */
  dealer: PlayerIndex;

  /** Whose turn it is (bidding or playing). */
  currentPlayer: PlayerIndex;

  /** Number of consecutive passes in the current bidding phase. */
  bidPassCount: number;

  // -- Maker & alone --

  /** The player who called trump. */
  maker: PlayerIndex | null;

  /** Whether the maker declared going alone. (RULES §7) */
  goingAlone: boolean;

  // -- Trick play --

  /** Cards played in the current (incomplete) trick. */
  currentTrick: TrickCard[];

  /** All completed tricks this hand. */
  completedTricks: CompletedTrick[];

  // -- Scoring --

  /** Cumulative game score. scores[0] = Team A, scores[1] = Team B. */
  scores: [number, number];

  /** Result of the most recent hand. Null during play. */
  handResult: HandResult | null;
}

// --- Action results (returned by logic functions) ---

export interface ActionResult {
  valid: boolean;
  state: GameState;
}

// --- DataChannel message types ---

export const MSG = {
  GAME_START: "game-start",
  BID: "bid",
  DISCARD: "discard",
  PLAY_CARD: "play-card",
  NEXT_HAND: "next-hand",
  STATE_UPDATE: "state-update",
  PLAY_AGAIN_REQUEST: "play-again-request",
  PLAY_AGAIN_ACCEPTED: "play-again-accepted",
  TEAM_SELECT: "team-select",
  TEAM_UPDATE: "team-update",
} as const;

// --- Message payloads ---

export interface SeatAssignment {
  playerId: string;
  seatIndex: PlayerIndex;
}

export interface GameStartPayload {
  seatAssignments: SeatAssignment[];
  gameState: GameState;
}

export interface BidPayload {
  player: PlayerIndex;
  action: BidAction;
}

export interface DiscardPayload {
  card: Card;
}

export interface PlayCardPayload {
  player: PlayerIndex;
  card: Card;
}

export interface StateUpdatePayload {
  gameState: GameState;
}

export interface PlayAgainAcceptedPayload {
  gameState: GameState;
}

export interface TeamSelectPayload {
  team: Team;
}

export interface TeamAssignment {
  playerId: string;
  team: Team;
}

export interface TeamUpdatePayload {
  assignments: TeamAssignment[];
}

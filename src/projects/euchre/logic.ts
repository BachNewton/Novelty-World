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
  return suit === "hearts" || suit === "diamonds" ? "red" : "black";
}

/** Return the other suit of the same color. (RULES §5.3) */
export function getPartnerSuit(suit: Suit): Suit {
  const pairs: Record<Suit, Suit> = {
    hearts: "diamonds",
    diamonds: "hearts",
    clubs: "spades",
    spades: "clubs",
  };
  return pairs[suit];
}

/**
 * Return the effective suit of a card given the current trump.
 * The Left Bower belongs to the trump suit, not its printed suit. (RULES §5.1)
 */
export function getEffectiveSuit(card: Card, trumpSuit: Suit): Suit {
  if (isLeftBower(card, trumpSuit)) return trumpSuit;
  return card.suit;
}

/** Is this card the Right Bower? (RULES §5.1) */
export function isRightBower(card: Card, trumpSuit: Suit): boolean {
  return card.rank === "jack" && card.suit === trumpSuit;
}

/** Is this card the Left Bower? (RULES §5.1) */
export function isLeftBower(card: Card, trumpSuit: Suit): boolean {
  return card.rank === "jack" && card.suit === getPartnerSuit(trumpSuit);
}

/** Is this card a trump card (including bowers)? */
export function isTrump(card: Card, trumpSuit: Suit): boolean {
  return getEffectiveSuit(card, trumpSuit) === trumpSuit;
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
  const aRank = cardStrength(a, trumpSuit, leadSuit);
  const bRank = cardStrength(b, trumpSuit, leadSuit);
  return bRank - aRank; // higher strength = better, so if a > b => negative
}

/** Internal: assigns a numeric strength to a card for trick comparison. */
function cardStrength(card: Card, trumpSuit: Suit, leadSuit: Suit): number {
  if (isRightBower(card, trumpSuit)) return 100;
  if (isLeftBower(card, trumpSuit)) return 99;
  if (isTrump(card, trumpSuit)) {
    // Trump cards ranked: A=98, K=97, Q=96, 10=95, 9=94
    const trumpNonBowerOrder: Rank[] = ["ace", "king", "queen", "10", "9"];
    const idx = trumpNonBowerOrder.indexOf(card.rank);
    return 98 - idx;
  }
  const effectiveSuit = getEffectiveSuit(card, trumpSuit);
  if (effectiveSuit === leadSuit) {
    // Lead suit cards ranked: A=50, K=49, Q=48, J=47, 10=46, 9=45
    const idx = NON_TRUMP_RANK_ORDER.indexOf(card.rank);
    return 50 - idx;
  }
  // Off-suit cards can't win
  return 0;
}

// ============================================================
// Deck and dealing (RULES §2, §4)
// ============================================================

/** Create an unshuffled 24-card Euchre deck. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** Shuffle a deck using Fisher-Yates. Returns a new array. */
export function shuffleDeck(deck: Card[]): Card[] {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Deal 5 cards to each player from a shuffled deck.
 * Returns the 4 hands and the 4-card kitty. (RULES §4)
 */
export function deal(deck: Card[]): {
  hands: [Card[], Card[], Card[], Card[]];
  kitty: Card[];
} {
  const hands: [Card[], Card[], Card[], Card[]] = [[], [], [], []];
  for (let i = 0; i < 20; i++) {
    hands[i % 4].push(deck[i]);
  }
  const kitty = deck.slice(20, 24);
  return { hands, kitty };
}

// ============================================================
// Player utilities (RULES §3)
// ============================================================

/** Get the team a player belongs to. 0,2 = A; 1,3 = B. */
export function getTeam(player: PlayerIndex): Team {
  return player % 2 === 0 ? "A" : "B";
}

/** Get a player's partner. 0↔2, 1↔3. */
export function getPartner(player: PlayerIndex): PlayerIndex {
  return ((player + 2) % 4) as PlayerIndex;
}

/** Get the next player clockwise, optionally skipping the alone player's partner. */
export function getNextPlayer(
  current: PlayerIndex,
  skipPlayer?: PlayerIndex | null,
): PlayerIndex {
  let next = ((current + 1) % 4) as PlayerIndex;
  if (skipPlayer != null && next === skipPlayer) {
    next = ((next + 1) % 4) as PlayerIndex;
  }
  return next;
}

/** Get the player to the left of the dealer (leads first trick). (RULES §8.1) */
export function getLeadPlayer(
  dealer: PlayerIndex,
  goingAlone: boolean,
  alonePlayer: PlayerIndex | null,
): PlayerIndex {
  const skipPlayer = goingAlone && alonePlayer != null
    ? getPartner(alonePlayer)
    : null;
  return getNextPlayer(dealer, skipPlayer);
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
  if (player !== state.currentPlayer) {
    return { valid: false, state };
  }

  const s = { ...state };

  if (s.phase === "bidding-round-1") {
    if (action.type === "call") {
      return { valid: false, state };
    }

    if (action.type === "pass") {
      s.bidPassCount++;
      if (s.bidPassCount >= 4) {
        // All four passed — move to round 2
        s.phase = "bidding-round-2";
        s.turnedDownSuit = s.upCard!.suit;
        s.upCard = null;
        s.bidPassCount = 0;
        s.currentPlayer = getNextPlayer(s.dealer);
      } else {
        s.currentPlayer = getNextPlayer(s.currentPlayer);
      }
      return { valid: true, state: s };
    }

    // order-up
    s.trumpSuit = s.upCard!.suit;
    s.maker = player;
    s.goingAlone = action.alone;
    // Dealer picks up the up card
    s.hands = [...s.hands] as GameState["hands"];
    s.hands[s.dealer] = [...s.hands[s.dealer], s.upCard!];
    s.phase = "dealer-discard";
    s.currentPlayer = s.dealer;
    s.upCard = null;
    return { valid: true, state: s };
  }

  if (s.phase === "bidding-round-2") {
    if (action.type === "order-up") {
      return { valid: false, state };
    }

    if (action.type === "pass") {
      // Stick the dealer: dealer can't pass if everyone else has
      if (!canPass(s)) {
        return { valid: false, state };
      }
      s.bidPassCount++;
      s.currentPlayer = getNextPlayer(s.currentPlayer);
      return { valid: true, state: s };
    }

    // call suit
    if (action.suit === s.turnedDownSuit) {
      return { valid: false, state };
    }

    s.trumpSuit = action.suit;
    s.maker = player;
    s.goingAlone = action.alone;
    s.phase = "playing";
    s.currentPlayer = getLeadPlayer(s.dealer, s.goingAlone, s.maker);
    return { valid: true, state: s };
  }

  return { valid: false, state };
}

/**
 * Can the current player pass, or must they bid? (stick-the-dealer check)
 */
export function canPass(state: GameState): boolean {
  if (state.phase === "bidding-round-1") return true;
  if (state.phase === "bidding-round-2") {
    // Stick the dealer: if current player IS the dealer and 3 others have passed
    if (state.currentPlayer === state.dealer && state.bidPassCount >= 3) {
      return false;
    }
    return true;
  }
  return false;
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
  if (state.phase !== "dealer-discard") {
    return { valid: false, state };
  }

  const dealerHand = state.hands[state.dealer];
  const cardIdx = dealerHand.findIndex(
    (c) => c.rank === card.rank && c.suit === card.suit,
  );
  if (cardIdx === -1) {
    return { valid: false, state };
  }

  const s = { ...state };
  s.hands = [...s.hands] as GameState["hands"];
  s.hands[s.dealer] = dealerHand.filter((_, i) => i !== cardIdx);
  s.kitty = [...s.kitty, card];
  s.phase = "playing";
  s.currentPlayer = getLeadPlayer(s.dealer, s.goingAlone, s.maker);
  return { valid: true, state: s };
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
  if (leadSuit === null) return [...hand];

  const followers = hand.filter(
    (c) => getEffectiveSuit(c, trumpSuit) === leadSuit,
  );
  return followers.length > 0 ? followers : [...hand];
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
  const inHand = hand.some(
    (c) => c.rank === card.rank && c.suit === card.suit,
  );
  if (!inHand) return false;

  const validPlays = getValidPlays(hand, leadSuit, trumpSuit);
  return validPlays.some(
    (c) => c.rank === card.rank && c.suit === card.suit,
  );
}

/**
 * Determine who won a completed trick. (RULES §8.3)
 */
export function determineTrickWinner(
  trick: TrickCard[],
  trumpSuit: Suit,
): PlayerIndex {
  const leadSuit = getEffectiveSuit(trick[0].card, trumpSuit);
  let winner = trick[0];
  for (let i = 1; i < trick.length; i++) {
    if (compareCards(trick[i].card, winner.card, trumpSuit, leadSuit) < 0) {
      winner = trick[i];
    }
  }
  return winner.player;
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
  if (state.phase !== "playing") return { valid: false, state };
  if (player !== state.currentPlayer) return { valid: false, state };

  const leadSuit =
    state.currentTrick.length > 0
      ? getEffectiveSuit(state.currentTrick[0].card, state.trumpSuit!)
      : null;

  if (!isValidPlay(state.hands[player], card, leadSuit, state.trumpSuit!)) {
    return { valid: false, state };
  }

  const s = { ...state };
  // Remove card from hand
  s.hands = [...s.hands] as GameState["hands"];
  s.hands[player] = s.hands[player].filter(
    (c) => !(c.rank === card.rank && c.suit === card.suit),
  );

  // Add to current trick
  s.currentTrick = [...s.currentTrick, { player, card }];

  // Determine how many players are in this trick
  const playersInTrick = s.goingAlone ? 3 : 4;

  if (s.currentTrick.length >= playersInTrick) {
    // Trick complete — resolve it
    const trickLeadSuit = getEffectiveSuit(
      s.currentTrick[0].card,
      s.trumpSuit!,
    );
    const winner = determineTrickWinner(s.currentTrick, s.trumpSuit!);
    const completedTrick: CompletedTrick = {
      cards: s.currentTrick,
      winner,
      leadSuit: trickLeadSuit,
    };
    s.completedTricks = [...s.completedTricks, completedTrick];
    s.currentTrick = [];

    if (s.completedTricks.length >= 5) {
      // Hand over
      s.phase = "hand-over";
      s.handResult = scoreHand(s);
    } else {
      // Winner leads next trick
      const skipPlayer =
        s.goingAlone && s.maker != null ? getPartner(s.maker) : null;
      s.currentPlayer = winner;
      // If winner is the sitting-out partner (shouldn't happen), advance
      if (skipPlayer != null && s.currentPlayer === skipPlayer) {
        s.currentPlayer = getNextPlayer(s.currentPlayer, skipPlayer);
      }
    }
  } else {
    // Advance to next player
    const skipPlayer =
      s.goingAlone && s.maker != null ? getPartner(s.maker) : null;
    s.currentPlayer = getNextPlayer(s.currentPlayer, skipPlayer);
  }

  return { valid: true, state: s };
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
  const march = makerTricksWon === 5;
  const euchred = makerTricksWon < 3;

  if (euchred) {
    return { points: 2, euchred: true, march: false };
  }
  if (march) {
    return { points: wentAlone ? 4 : 2, euchred: false, march: true };
  }
  // 3 or 4 tricks
  return { points: 1, euchred: false, march: false };
}

/**
 * Score a completed hand and return the full result.
 */
export function scoreHand(state: GameState): HandResult {
  const [teamATricks, teamBTricks] = countTricksByTeam(state.completedTricks);
  const makerTeam = getTeam(state.maker!);
  const makerTricksWon = makerTeam === "A" ? teamATricks : teamBTricks;
  const defenderTricksWon = makerTeam === "A" ? teamBTricks : teamATricks;

  const { points, euchred, march } = calculateHandScore(
    makerTricksWon,
    state.goingAlone,
  );

  const scoringTeam: Team = euchred
    ? (makerTeam === "A" ? "B" : "A")
    : makerTeam;

  return {
    makerTeam,
    makerTricksWon,
    defenderTricksWon,
    points,
    scoringTeam,
    euchred,
    march,
    wentAlone: state.goingAlone,
  };
}

/**
 * Count tricks won by each team from completed tricks.
 */
export function countTricksByTeam(
  completedTricks: CompletedTrick[],
): [number, number] {
  let teamA = 0;
  let teamB = 0;
  for (const trick of completedTricks) {
    if (getTeam(trick.winner) === "A") {
      teamA++;
    } else {
      teamB++;
    }
  }
  return [teamA, teamB];
}

// ============================================================
// Game flow
// ============================================================

/** Create the initial game state with a given starting dealer. */
export function createGameState(startingDealer: PlayerIndex): GameState {
  const deck = shuffleDeck(createDeck());
  const { hands, kitty } = deal(deck);
  const upCard = kitty[0];

  return {
    phase: "bidding-round-1",
    hands,
    kitty: kitty.slice(1),
    upCard,
    trumpSuit: null,
    turnedDownSuit: null,
    dealer: startingDealer,
    currentPlayer: getNextPlayer(startingDealer),
    bidPassCount: 0,
    maker: null,
    goingAlone: false,
    currentTrick: [],
    completedTricks: [],
    scores: [0, 0],
    handResult: null,
  };
}

/**
 * Deal a new hand: shuffle, deal cards, flip up card, set phase to bidding.
 * The current dealer on the state is used.
 */
export function dealHand(state: GameState): GameState {
  const deck = shuffleDeck(createDeck());
  const { hands, kitty } = deal(deck);
  const upCard = kitty[0];

  return {
    ...state,
    phase: "bidding-round-1",
    hands,
    kitty: kitty.slice(1),
    upCard,
    trumpSuit: null,
    turnedDownSuit: null,
    currentPlayer: getNextPlayer(state.dealer),
    bidPassCount: 0,
    maker: null,
    goingAlone: false,
    currentTrick: [],
    completedTricks: [],
    handResult: null,
  };
}

/** Rotate dealer one seat clockwise. (RULES §10) */
export function rotateDealer(dealer: PlayerIndex): PlayerIndex {
  return ((dealer + 1) % 4) as PlayerIndex;
}

/** Check if the game is over (a team reached 10). (RULES §9.1) */
export function isGameOver(scores: [number, number]): Team | null {
  if (scores[0] >= WINNING_SCORE) return "A";
  if (scores[1] >= WINNING_SCORE) return "B";
  return null;
}

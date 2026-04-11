import { describe, it, expect } from "vitest";
import type {
  Card,
  Suit,
  PlayerIndex,
  GameState,
  TrickCard,
  CompletedTrick,
} from "./types";
import {
  // Card utilities
  getSuitColor,
  getPartnerSuit,
  getEffectiveSuit,
  isRightBower,
  isLeftBower,
  isTrump,
  compareCards,
  // Deck & dealing
  createDeck,
  shuffleDeck,
  deal,
  // Player utilities
  getTeam,
  getPartner,
  getNextPlayer,
  getLeadPlayer,
  // Bidding
  applyBid,
  canPass,
  // Dealer discard
  applyDealerDiscard,
  // Trick play
  getValidPlays,
  isValidPlay,
  determineTrickWinner,
  applyPlay,
  // Scoring
  calculateHandScore,
  countTricksByTeam,
  // Game flow
  createGameState,
  dealHand,
  rotateDealer,
  isGameOver,
} from "./logic";

// ============================================================
// Test helpers
// ============================================================

/** Shorthand card constructor */
function card(rank: Card["rank"], suit: Suit): Card {
  return { rank, suit };
}

const JH = card("jack", "hearts");
const JD = card("jack", "diamonds");
const JC = card("jack", "clubs");
const JS = card("jack", "spades");
const AH = card("ace", "hearts");
const AD = card("ace", "diamonds");
const AC = card("ace", "clubs");
const AS = card("ace", "spades");
const KH = card("king", "hearts");
const KD = card("king", "diamonds");
const KC = card("king", "clubs");
const KS = card("king", "spades");
const QH = card("queen", "hearts");
const QD = card("queen", "diamonds");
const QC = card("queen", "clubs");
const QS = card("queen", "spades");
const TH = card("10", "hearts");
const TD = card("10", "diamonds");
const TC = card("10", "clubs");
const TS = card("10", "spades");
const NH = card("9", "hearts");
const ND = card("9", "diamonds");
const NC = card("9", "clubs");
const NS = card("9", "spades");

/** Create a minimal game state for testing specific phases. */
function makeState(overrides: Partial<GameState>): GameState {
  return {
    phase: "playing",
    hands: [[], [], [], []],
    kitty: [],
    upCard: null,
    trumpSuit: "hearts",
    turnedDownSuit: null,
    dealer: 0 as PlayerIndex,
    currentPlayer: 1 as PlayerIndex,
    bidPassCount: 0,
    maker: null,
    goingAlone: false,
    currentTrick: [],
    completedTricks: [],
    scores: [0, 0],
    handResult: null,
    ...overrides,
  };
}

// ============================================================
// §5.3 — Suit colors and pairs
// ============================================================

describe("getSuitColor", () => {
  it("returns red for hearts", () => {
    expect(getSuitColor("hearts")).toBe("red");
  });

  it("returns red for diamonds", () => {
    expect(getSuitColor("diamonds")).toBe("red");
  });

  it("returns black for clubs", () => {
    expect(getSuitColor("clubs")).toBe("black");
  });

  it("returns black for spades", () => {
    expect(getSuitColor("spades")).toBe("black");
  });
});

describe("getPartnerSuit", () => {
  it("hearts partner is diamonds", () => {
    expect(getPartnerSuit("hearts")).toBe("diamonds");
  });

  it("diamonds partner is hearts", () => {
    expect(getPartnerSuit("diamonds")).toBe("hearts");
  });

  it("clubs partner is spades", () => {
    expect(getPartnerSuit("clubs")).toBe("spades");
  });

  it("spades partner is clubs", () => {
    expect(getPartnerSuit("spades")).toBe("clubs");
  });
});

// ============================================================
// §5.1 — Bower identification
// ============================================================

describe("isRightBower", () => {
  it("jack of trump suit is the right bower", () => {
    expect(isRightBower(JH, "hearts")).toBe(true);
  });

  it("jack of another suit is not the right bower", () => {
    expect(isRightBower(JD, "hearts")).toBe(false);
  });

  it("non-jack of trump suit is not the right bower", () => {
    expect(isRightBower(AH, "hearts")).toBe(false);
  });
});

describe("isLeftBower", () => {
  it("jack of same-color suit is the left bower", () => {
    // Hearts trump → Jack of diamonds is left bower
    expect(isLeftBower(JD, "hearts")).toBe(true);
  });

  it("jack of trump suit is NOT the left bower", () => {
    expect(isLeftBower(JH, "hearts")).toBe(false);
  });

  it("jack of opposite-color suit is not the left bower", () => {
    // Hearts trump → Jack of clubs is not left bower
    expect(isLeftBower(JC, "hearts")).toBe(false);
  });

  it("non-jack of same-color suit is not the left bower", () => {
    expect(isLeftBower(AD, "hearts")).toBe(false);
  });

  // Test all four trump suits to catch color-pair bugs
  it("clubs trump → jack of spades is left bower", () => {
    expect(isLeftBower(JS, "clubs")).toBe(true);
  });

  it("spades trump → jack of clubs is left bower", () => {
    expect(isLeftBower(JC, "spades")).toBe(true);
  });

  it("diamonds trump → jack of hearts is left bower", () => {
    expect(isLeftBower(JH, "diamonds")).toBe(true);
  });
});

// ============================================================
// §5.1 — Effective suit (Left Bower belongs to trump)
// ============================================================

describe("getEffectiveSuit", () => {
  it("regular card returns its printed suit", () => {
    expect(getEffectiveSuit(AH, "clubs")).toBe("hearts");
  });

  it("right bower returns trump suit (trivially its own suit)", () => {
    expect(getEffectiveSuit(JH, "hearts")).toBe("hearts");
  });

  it("left bower returns trump suit, NOT its printed suit", () => {
    // Hearts trump → J♦ printed as diamonds, effective suit is hearts
    expect(getEffectiveSuit(JD, "hearts")).toBe("hearts");
  });

  it("jack of opposite-color suit keeps its printed suit", () => {
    // Hearts trump → J♣ stays clubs
    expect(getEffectiveSuit(JC, "hearts")).toBe("clubs");
  });
});

// ============================================================
// §5.1 — Trump identification
// ============================================================

describe("isTrump", () => {
  it("card of trump suit is trump", () => {
    expect(isTrump(AH, "hearts")).toBe(true);
    expect(isTrump(NH, "hearts")).toBe(true);
  });

  it("right bower is trump", () => {
    expect(isTrump(JH, "hearts")).toBe(true);
  });

  it("left bower is trump", () => {
    expect(isTrump(JD, "hearts")).toBe(true);
  });

  it("card of a different suit is not trump", () => {
    expect(isTrump(AC, "hearts")).toBe(false);
  });

  it("jack of opposite-color suit is not trump", () => {
    // Hearts trump → J♣ is not trump (clubs is opposite color)
    expect(isTrump(JC, "hearts")).toBe(false);
  });
});

// ============================================================
// §5.1, §5.2 — Card comparison for trick resolution
// ============================================================

describe("compareCards", () => {
  const trump: Suit = "hearts";

  describe("trump vs non-trump", () => {
    it("any trump beats any non-trump", () => {
      // 9 of trump beats ace of non-trump lead suit
      expect(compareCards(NH, AS, trump, "spades")).toBeLessThan(0);
    });

    it("non-trump loses to trump", () => {
      expect(compareCards(AS, NH, trump, "spades")).toBeGreaterThan(0);
    });
  });

  describe("bower hierarchy", () => {
    it("right bower beats left bower", () => {
      expect(compareCards(JH, JD, trump, "clubs")).toBeLessThan(0);
    });

    it("left bower beats ace of trump", () => {
      expect(compareCards(JD, AH, trump, "clubs")).toBeLessThan(0);
    });

    it("right bower beats ace of trump", () => {
      expect(compareCards(JH, AH, trump, "clubs")).toBeLessThan(0);
    });
  });

  describe("within trump suit", () => {
    it("ace of trump beats king of trump", () => {
      expect(compareCards(AH, KH, trump, "clubs")).toBeLessThan(0);
    });

    it("king of trump beats queen of trump", () => {
      expect(compareCards(KH, QH, trump, "clubs")).toBeLessThan(0);
    });

    it("10 of trump beats 9 of trump", () => {
      expect(compareCards(TH, NH, trump, "clubs")).toBeLessThan(0);
    });
  });

  describe("within lead suit (non-trump)", () => {
    it("ace beats king in lead suit", () => {
      expect(compareCards(AS, KS, trump, "spades")).toBeLessThan(0);
    });

    it("jack beats 10 in non-trump lead suit", () => {
      // Spades lead, hearts trump → J♠ is just a normal jack
      expect(compareCards(JS, TS, trump, "spades")).toBeLessThan(0);
    });
  });

  describe("off-suit cards (neither trump nor lead)", () => {
    it("off-suit card loses to lead-suit card", () => {
      // Lead is spades, trump is hearts, playing a club vs a spade
      expect(compareCards(AC, NS, trump, "spades")).toBeGreaterThan(0);
    });

    it("two off-suit cards — neither can win", () => {
      // Lead is spades, trump is hearts — both clubs and diamonds are off-suit
      // Neither card can win the trick, so relative order doesn't matter for
      // trick resolution, but the function should handle it without crashing
      expect(() => compareCards(AC, AD, trump, "spades")).not.toThrow();
    });
  });
});

// ============================================================
// §2 — Deck creation
// ============================================================

describe("createDeck", () => {
  it("creates exactly 24 cards", () => {
    expect(createDeck()).toHaveLength(24);
  });

  it("has 6 cards per suit", () => {
    const deck = createDeck();
    for (const suit of ["hearts", "diamonds", "clubs", "spades"] as Suit[]) {
      expect(deck.filter((c) => c.suit === suit)).toHaveLength(6);
    }
  });

  it("has 4 cards per rank", () => {
    const deck = createDeck();
    for (const rank of ["9", "10", "jack", "queen", "king", "ace"] as Card["rank"][]) {
      expect(deck.filter((c) => c.rank === rank)).toHaveLength(4);
    }
  });

  it("has no duplicate cards", () => {
    const deck = createDeck();
    const keys = deck.map((c) => `${c.rank}-${c.suit}`);
    expect(new Set(keys).size).toBe(24);
  });
});

// ============================================================
// §2 — Shuffling
// ============================================================

describe("shuffleDeck", () => {
  it("returns 24 cards", () => {
    expect(shuffleDeck(createDeck())).toHaveLength(24);
  });

  it("contains the same cards as the input", () => {
    const original = createDeck();
    const shuffled = shuffleDeck(original);
    const toKey = (c: Card) => `${c.rank}-${c.suit}`;
    expect(shuffled.map(toKey).sort()).toEqual(original.map(toKey).sort());
  });

  it("does not mutate the input array", () => {
    const original = createDeck();
    const copy = [...original];
    shuffleDeck(original);
    expect(original).toEqual(copy);
  });
});

// ============================================================
// §4 — Dealing
// ============================================================

describe("deal", () => {
  it("gives each player exactly 5 cards", () => {
    const { hands } = deal(shuffleDeck(createDeck()));
    for (const hand of hands) {
      expect(hand).toHaveLength(5);
    }
  });

  it("puts 4 cards in the kitty", () => {
    const { kitty } = deal(shuffleDeck(createDeck()));
    expect(kitty).toHaveLength(4);
  });

  it("uses all 24 cards with no overlap", () => {
    const { hands, kitty } = deal(shuffleDeck(createDeck()));
    const allCards = [...hands[0], ...hands[1], ...hands[2], ...hands[3], ...kitty];
    expect(allCards).toHaveLength(24);
    const keys = allCards.map((c) => `${c.rank}-${c.suit}`);
    expect(new Set(keys).size).toBe(24);
  });
});

// ============================================================
// §3 — Player utilities
// ============================================================

describe("getTeam", () => {
  it("players 0 and 2 are Team A", () => {
    expect(getTeam(0)).toBe("A");
    expect(getTeam(2)).toBe("A");
  });

  it("players 1 and 3 are Team B", () => {
    expect(getTeam(1)).toBe("B");
    expect(getTeam(3)).toBe("B");
  });
});

describe("getPartner", () => {
  it("0 and 2 are partners", () => {
    expect(getPartner(0)).toBe(2);
    expect(getPartner(2)).toBe(0);
  });

  it("1 and 3 are partners", () => {
    expect(getPartner(1)).toBe(3);
    expect(getPartner(3)).toBe(1);
  });
});

describe("getNextPlayer", () => {
  it("rotates clockwise: 0→1→2→3→0", () => {
    expect(getNextPlayer(0)).toBe(1);
    expect(getNextPlayer(1)).toBe(2);
    expect(getNextPlayer(2)).toBe(3);
    expect(getNextPlayer(3)).toBe(0);
  });

  it("skips a player when specified", () => {
    // Skip player 2: 1→3 (instead of 1→2)
    expect(getNextPlayer(1, 2)).toBe(3);
  });

  it("skips correctly when skip target is next in line", () => {
    // Skip player 1: 0→2 (instead of 0→1)
    expect(getNextPlayer(0, 1)).toBe(2);
  });

  it("skips correctly with wraparound", () => {
    // Skip player 0: 3→1 (instead of 3→0)
    expect(getNextPlayer(3, 0)).toBe(1);
  });
});

describe("getLeadPlayer", () => {
  it("returns player to dealer's left normally", () => {
    expect(getLeadPlayer(0, false, null)).toBe(1);
    expect(getLeadPlayer(2, false, null)).toBe(3);
    expect(getLeadPlayer(3, false, null)).toBe(0);
  });

  it("skips alone player's partner when going alone", () => {
    // Dealer is 0, player 1 goes alone → partner is 3
    // Left of dealer is 1, which is the alone player — that's fine
    // But if left of dealer IS the partner, skip them
    // Dealer is 0, player 3 goes alone → partner is 1
    // Left of dealer is 1 (the partner) → skip to 2
    expect(getLeadPlayer(0, true, 3)).toBe(2);
  });

  it("returns left of alone player when alone player leads", () => {
    // RULES §7: the player to the left of the lone player leads
    // Dealer is 3, player 1 goes alone → partner is 3
    // Left of dealer is 0, which is fine (opponent)
    expect(getLeadPlayer(3, true, 1)).toBe(0);
  });
});

// ============================================================
// §6 — Bidding
// ============================================================

describe("applyBid", () => {
  describe("round 1 — ordering up the up card", () => {
    it("order-up sets trump to up card suit and maker", () => {
      const state = makeState({
        phase: "bidding-round-1",
        dealer: 0 as PlayerIndex,
        currentPlayer: 1 as PlayerIndex,
        upCard: card("king", "spades"),
        hands: [[AS, KS, QS, TS, NS], [AH, KH, QH, TH, NH], [AC, KC, QC, TC, NC], [AD, KD, QD, TD, ND]],
        bidPassCount: 0,
      });

      const result = applyBid(state, 1, { type: "order-up", alone: false });

      expect(result.valid).toBe(true);
      expect(result.state.trumpSuit).toBe("spades");
      expect(result.state.maker).toBe(1);
      expect(result.state.phase).toBe("dealer-discard");
    });

    it("order-up with alone sets goingAlone", () => {
      const state = makeState({
        phase: "bidding-round-1",
        dealer: 0 as PlayerIndex,
        currentPlayer: 1 as PlayerIndex,
        upCard: card("king", "spades"),
        hands: [[AS, KS, QS, TS, NS], [AH, KH, QH, TH, NH], [AC, KC, QC, TC, NC], [AD, KD, QD, TD, ND]],
        bidPassCount: 0,
      });

      const result = applyBid(state, 1, { type: "order-up", alone: true });

      expect(result.valid).toBe(true);
      expect(result.state.goingAlone).toBe(true);
    });

    it("passing advances to next player", () => {
      const state = makeState({
        phase: "bidding-round-1",
        dealer: 0 as PlayerIndex,
        currentPlayer: 1 as PlayerIndex,
        upCard: card("king", "spades"),
        hands: [[AS, KS, QS, TS, NS], [AH, KH, QH, TH, NH], [AC, KC, QC, TC, NC], [AD, KD, QD, TD, ND]],
        bidPassCount: 0,
      });

      const result = applyBid(state, 1, { type: "pass" });

      expect(result.valid).toBe(true);
      expect(result.state.currentPlayer).toBe(2);
      expect(result.state.bidPassCount).toBe(1);
      expect(result.state.phase).toBe("bidding-round-1");
    });

    it("four passes in round 1 transitions to round 2", () => {
      const state = makeState({
        phase: "bidding-round-1",
        dealer: 0 as PlayerIndex,
        currentPlayer: 0 as PlayerIndex, // dealer is last to bid in round 1
        upCard: card("king", "spades"),
        hands: [[AS, KS, QS, TS, NS], [AH, KH, QH, TH, NH], [AC, KC, QC, TC, NC], [AD, KD, QD, TD, ND]],
        bidPassCount: 3,
      });

      const result = applyBid(state, 0, { type: "pass" });

      expect(result.valid).toBe(true);
      expect(result.state.phase).toBe("bidding-round-2");
      expect(result.state.turnedDownSuit).toBe("spades");
      expect(result.state.upCard).toBeNull();
      expect(result.state.bidPassCount).toBe(0);
      // Next bidder is left of dealer
      expect(result.state.currentPlayer).toBe(1);
    });

    it("rejects bid from wrong player", () => {
      const state = makeState({
        phase: "bidding-round-1",
        currentPlayer: 1 as PlayerIndex,
        upCard: card("king", "spades"),
        hands: [[AS, KS, QS, TS, NS], [AH, KH, QH, TH, NH], [AC, KC, QC, TC, NC], [AD, KD, QD, TD, ND]],
      });

      const result = applyBid(state, 2, { type: "order-up", alone: false });

      expect(result.valid).toBe(false);
    });

    it("rejects call-suit action in round 1", () => {
      const state = makeState({
        phase: "bidding-round-1",
        currentPlayer: 1 as PlayerIndex,
        upCard: card("king", "spades"),
        hands: [[AS, KS, QS, TS, NS], [AH, KH, QH, TH, NH], [AC, KC, QC, TC, NC], [AD, KD, QD, TD, ND]],
      });

      const result = applyBid(state, 1, {
        type: "call",
        suit: "hearts",
        alone: false,
      });

      expect(result.valid).toBe(false);
    });
  });

  describe("round 2 — naming a suit", () => {
    it("calling a valid suit sets trump and maker", () => {
      const state = makeState({
        phase: "bidding-round-2",
        dealer: 0 as PlayerIndex,
        currentPlayer: 1 as PlayerIndex,
        turnedDownSuit: "spades",
        hands: [[AS, KS, QS, TS, NS], [AH, KH, QH, TH, NH], [AC, KC, QC, TC, NC], [AD, KD, QD, TD, ND]],
        bidPassCount: 0,
      });

      const result = applyBid(state, 1, {
        type: "call",
        suit: "hearts",
        alone: false,
      });

      expect(result.valid).toBe(true);
      expect(result.state.trumpSuit).toBe("hearts");
      expect(result.state.maker).toBe(1);
      expect(result.state.phase).toBe("playing");
    });

    it("cannot call the turned-down suit", () => {
      const state = makeState({
        phase: "bidding-round-2",
        currentPlayer: 1 as PlayerIndex,
        turnedDownSuit: "spades",
        hands: [[AS, KS, QS, TS, NS], [AH, KH, QH, TH, NH], [AC, KC, QC, TC, NC], [AD, KD, QD, TD, ND]],
      });

      const result = applyBid(state, 1, {
        type: "call",
        suit: "spades",
        alone: false,
      });

      expect(result.valid).toBe(false);
    });

    it("rejects order-up action in round 2", () => {
      const state = makeState({
        phase: "bidding-round-2",
        currentPlayer: 1 as PlayerIndex,
        turnedDownSuit: "spades",
        hands: [[AS, KS, QS, TS, NS], [AH, KH, QH, TH, NH], [AC, KC, QC, TC, NC], [AD, KD, QD, TD, ND]],
      });

      const result = applyBid(state, 1, { type: "order-up", alone: false });

      expect(result.valid).toBe(false);
    });

    it("calling with alone sets goingAlone", () => {
      const state = makeState({
        phase: "bidding-round-2",
        dealer: 0 as PlayerIndex,
        currentPlayer: 1 as PlayerIndex,
        turnedDownSuit: "spades",
        hands: [[AS, KS, QS, TS, NS], [AH, KH, QH, TH, NH], [AC, KC, QC, TC, NC], [AD, KD, QD, TD, ND]],
        bidPassCount: 0,
      });

      const result = applyBid(state, 1, {
        type: "call",
        suit: "hearts",
        alone: true,
      });

      expect(result.valid).toBe(true);
      expect(result.state.goingAlone).toBe(true);
    });
  });

  describe("§6.3 — stick the dealer", () => {
    it("dealer cannot pass when all others have passed in round 2", () => {
      const state = makeState({
        phase: "bidding-round-2",
        dealer: 0 as PlayerIndex,
        currentPlayer: 0 as PlayerIndex,
        turnedDownSuit: "spades",
        hands: [[AS, KS, QS, TS, NS], [AH, KH, QH, TH, NH], [AC, KC, QC, TC, NC], [AD, KD, QD, TD, ND]],
        bidPassCount: 3,
      });

      const result = applyBid(state, 0, { type: "pass" });

      expect(result.valid).toBe(false);
    });

    it("dealer must call a suit when stuck", () => {
      const state = makeState({
        phase: "bidding-round-2",
        dealer: 0 as PlayerIndex,
        currentPlayer: 0 as PlayerIndex,
        turnedDownSuit: "spades",
        hands: [[AS, KS, QS, TS, NS], [AH, KH, QH, TH, NH], [AC, KC, QC, TC, NC], [AD, KD, QD, TD, ND]],
        bidPassCount: 3,
      });

      const result = applyBid(state, 0, {
        type: "call",
        suit: "hearts",
        alone: false,
      });

      expect(result.valid).toBe(true);
      expect(result.state.trumpSuit).toBe("hearts");
    });
  });
});

describe("canPass", () => {
  it("returns true during round 1", () => {
    const state = makeState({
      phase: "bidding-round-1",
      currentPlayer: 1 as PlayerIndex,
    });
    expect(canPass(state)).toBe(true);
  });

  it("returns true in round 2 when not stuck", () => {
    const state = makeState({
      phase: "bidding-round-2",
      dealer: 0 as PlayerIndex,
      currentPlayer: 1 as PlayerIndex,
      bidPassCount: 0,
    });
    expect(canPass(state)).toBe(true);
  });

  it("returns false for dealer in round 2 after 3 passes (stick the dealer)", () => {
    const state = makeState({
      phase: "bidding-round-2",
      dealer: 0 as PlayerIndex,
      currentPlayer: 0 as PlayerIndex,
      bidPassCount: 3,
    });
    expect(canPass(state)).toBe(false);
  });
});

// ============================================================
// §6.1 — Dealer discard
// ============================================================

describe("applyDealerDiscard", () => {
  it("dealer discards a card and transitions to playing", () => {
    // Dealer (player 0) ordered up K♠, now has 6 cards and must discard
    const state = makeState({
      phase: "dealer-discard",
      dealer: 0 as PlayerIndex,
      currentPlayer: 0 as PlayerIndex,
      trumpSuit: "spades",
      maker: 1 as PlayerIndex,
      hands: [[AS, KS, QS, TS, NS, NH], [], [], []], // 6 cards — picked up the up card
    });

    const result = applyDealerDiscard(state, NH);

    expect(result.valid).toBe(true);
    expect(result.state.hands[0]).toHaveLength(5);
    expect(result.state.hands[0]).not.toContainEqual(NH);
    expect(result.state.phase).toBe("playing");
  });

  it("rejects discard of a card not in dealer's hand", () => {
    const state = makeState({
      phase: "dealer-discard",
      dealer: 0 as PlayerIndex,
      currentPlayer: 0 as PlayerIndex,
      hands: [[AS, KS, QS, TS, NS, NH], [], [], []],
    });

    const result = applyDealerDiscard(state, AH); // not in hand

    expect(result.valid).toBe(false);
  });

  it("rejects discard when not in dealer-discard phase", () => {
    const state = makeState({
      phase: "playing",
      dealer: 0 as PlayerIndex,
      hands: [[AS, KS, QS, TS, NS], [], [], []],
    });

    const result = applyDealerDiscard(state, NS);

    expect(result.valid).toBe(false);
  });
});

// ============================================================
// §8.2 — Following suit / valid plays
// ============================================================

describe("getValidPlays", () => {
  it("any card is valid when leading (no lead suit)", () => {
    const hand = [AH, KS, QC, TD, NC];
    expect(getValidPlays(hand, null, "hearts")).toEqual(hand);
  });

  it("must follow lead suit when able", () => {
    const hand = [AH, KH, QC, TD, NC];
    const valid = getValidPlays(hand, "hearts", "clubs");
    expect(valid).toEqual([AH, KH]);
  });

  it("any card valid when unable to follow suit", () => {
    const hand = [AH, KH, QH, TH, NH];
    const valid = getValidPlays(hand, "spades", "clubs");
    expect(valid).toEqual(hand);
  });

  it("left bower counts as trump, not its printed suit", () => {
    // Hearts trump, lead suit is diamonds
    // J♦ is the left bower → it's a heart, not a diamond
    const hand = [JD, KD, QC];
    const valid = getValidPlays(hand, "diamonds", "hearts");
    // Only K♦ follows the diamond lead — J♦ is a heart (left bower)
    expect(valid).toEqual([KD]);
  });

  it("left bower must be played when trump is led and it's the only trump", () => {
    // Hearts trump, hearts led
    // J♦ is left bower (trump), rest are off-suit
    const hand = [JD, KS, QC];
    const valid = getValidPlays(hand, "hearts", "hearts");
    expect(valid).toEqual([JD]);
  });

  it("left bower can be played when trump is led alongside other trump", () => {
    const hand = [JD, AH, KS];
    const valid = getValidPlays(hand, "hearts", "hearts");
    // Both J♦ (left bower) and A♥ follow trump lead
    expect(valid).toEqual([JD, AH]);
  });
});

describe("isValidPlay", () => {
  it("returns true for a valid play", () => {
    const hand = [AH, KH, QC];
    expect(isValidPlay(hand, AH, "hearts", "clubs")).toBe(true);
  });

  it("returns false when not following suit", () => {
    const hand = [AH, KH, QC];
    // Lead is hearts, player has hearts but tries to play Q♣
    expect(isValidPlay(hand, QC, "hearts", "clubs")).toBe(false);
  });

  it("returns false for a card not in hand", () => {
    const hand = [AH, KH, QC];
    expect(isValidPlay(hand, AS, "spades", "clubs")).toBe(false);
  });
});

// ============================================================
// §8.3 — Trick resolution
// ============================================================

describe("determineTrickWinner", () => {
  it("highest card of lead suit wins when no trump played", () => {
    const trick: TrickCard[] = [
      { player: 0, card: KS },
      { player: 1, card: AS },
      { player: 2, card: TS },
      { player: 3, card: NS },
    ];
    expect(determineTrickWinner(trick, "hearts")).toBe(1); // A♠ wins
  });

  it("trump card beats all non-trump cards", () => {
    const trick: TrickCard[] = [
      { player: 0, card: AS }, // lead suit ace
      { player: 1, card: NH }, // 9 of trump
      { player: 2, card: KS },
      { player: 3, card: QS },
    ];
    expect(determineTrickWinner(trick, "hearts")).toBe(1); // 9♥ (trump) wins
  });

  it("highest trump wins when multiple trumps played", () => {
    const trick: TrickCard[] = [
      { player: 0, card: AS },
      { player: 1, card: NH }, // 9 of trump
      { player: 2, card: KH }, // king of trump
      { player: 3, card: QS },
    ];
    expect(determineTrickWinner(trick, "hearts")).toBe(2); // K♥ wins
  });

  it("right bower beats everything", () => {
    const trick: TrickCard[] = [
      { player: 0, card: AH }, // ace of trump
      { player: 1, card: JH }, // right bower
      { player: 2, card: JD }, // left bower
      { player: 3, card: KH },
    ];
    expect(determineTrickWinner(trick, "hearts")).toBe(1);
  });

  it("left bower beats ace of trump", () => {
    const trick: TrickCard[] = [
      { player: 0, card: AH },
      { player: 1, card: JD }, // left bower
      { player: 2, card: KH },
      { player: 3, card: QH },
    ];
    expect(determineTrickWinner(trick, "hearts")).toBe(1);
  });

  it("off-suit card cannot win", () => {
    const trick: TrickCard[] = [
      { player: 0, card: NS }, // lead: 9♠
      { player: 1, card: AC }, // off-suit ace
      { player: 2, card: AD }, // off-suit ace
      { player: 3, card: TS }, // follows lead
    ];
    // A♣ and A♦ are off-suit — only spades can win (no trump played)
    expect(determineTrickWinner(trick, "hearts")).toBe(3); // 10♠ > 9♠
  });

  it("works with 3-player trick (going alone)", () => {
    const trick: TrickCard[] = [
      { player: 0, card: KS },
      { player: 1, card: AS },
      { player: 3, card: TS }, // player 2 sitting out
    ];
    expect(determineTrickWinner(trick, "hearts")).toBe(1);
  });
});

// ============================================================
// §8 — applyPlay (full trick lifecycle)
// ============================================================

describe("applyPlay", () => {
  it("adds card to current trick and advances player", () => {
    const state = makeState({
      phase: "playing",
      trumpSuit: "hearts",
      dealer: 0 as PlayerIndex,
      currentPlayer: 1 as PlayerIndex,
      hands: [[], [AS, KS, QS, TS, NS], [], []],
      currentTrick: [],
      completedTricks: [],
    });

    const result = applyPlay(state, 1, AS);

    expect(result.valid).toBe(true);
    expect(result.state.currentTrick).toHaveLength(1);
    expect(result.state.currentTrick[0]).toEqual({ player: 1, card: AS });
    expect(result.state.hands[1]).not.toContainEqual(AS);
  });

  it("rejects play from wrong player", () => {
    const state = makeState({
      phase: "playing",
      currentPlayer: 1 as PlayerIndex,
      hands: [[], [AS, KS], [AH, KH], []],
    });

    const result = applyPlay(state, 2, AH);

    expect(result.valid).toBe(false);
  });

  it("rejects invalid card (not following suit)", () => {
    const state = makeState({
      phase: "playing",
      trumpSuit: "hearts",
      currentPlayer: 2 as PlayerIndex,
      hands: [[], [], [AS, KS, QC], []],
      // Lead was spades — player 2 has spades but tries clubs
      currentTrick: [{ player: 1, card: TS }],
    });

    const result = applyPlay(state, 2, QC);

    expect(result.valid).toBe(false);
  });

  it("completes trick after all players have played", () => {
    const state = makeState({
      phase: "playing",
      trumpSuit: "hearts",
      dealer: 0 as PlayerIndex,
      currentPlayer: 0 as PlayerIndex,
      goingAlone: false,
      hands: [[NS], [], [], []],
      currentTrick: [
        { player: 1, card: AS },
        { player: 2, card: KS },
        { player: 3, card: QS },
      ],
      completedTricks: [],
    });

    const result = applyPlay(state, 0, NS);

    expect(result.valid).toBe(true);
    expect(result.state.currentTrick).toEqual([]);
    expect(result.state.completedTricks).toHaveLength(1);
    expect(result.state.completedTricks[0].winner).toBe(1); // A♠ wins
  });

  it("transitions to hand-over after 5 completed tricks", () => {
    // Set up state where 4 tricks are done and the 5th is about to complete
    const fourTricks: CompletedTrick[] = Array.from({ length: 4 }, () => ({
      cards: [],
      winner: 1 as PlayerIndex,
      leadSuit: "spades" as Suit,
    }));

    const state = makeState({
      phase: "playing",
      trumpSuit: "hearts",
      dealer: 0 as PlayerIndex,
      currentPlayer: 0 as PlayerIndex,
      goingAlone: false,
      hands: [[NS], [], [], []],
      currentTrick: [
        { player: 1, card: AS },
        { player: 2, card: KS },
        { player: 3, card: QS },
      ],
      completedTricks: fourTricks,
    });

    const result = applyPlay(state, 0, NS);

    expect(result.valid).toBe(true);
    expect(result.state.phase).toBe("hand-over");
    expect(result.state.completedTricks).toHaveLength(5);
    expect(result.state.handResult).not.toBeNull();
  });
});

// ============================================================
// §9 — Scoring
// ============================================================

describe("calculateHandScore", () => {
  describe("normal play (not alone)", () => {
    it("3 tricks = 1 point for makers", () => {
      const result = calculateHandScore(3, false);
      expect(result.points).toBe(1);
      expect(result.euchred).toBe(false);
    });

    it("4 tricks = 1 point for makers", () => {
      const result = calculateHandScore(4, false);
      expect(result.points).toBe(1);
      expect(result.euchred).toBe(false);
    });

    it("5 tricks (march) = 2 points for makers", () => {
      const result = calculateHandScore(5, false);
      expect(result.points).toBe(2);
      expect(result.march).toBe(true);
    });

    it("2 tricks = euchred, 2 points for defenders", () => {
      const result = calculateHandScore(2, false);
      expect(result.points).toBe(2);
      expect(result.euchred).toBe(true);
    });

    it("0 tricks = euchred, 2 points for defenders", () => {
      const result = calculateHandScore(0, false);
      expect(result.points).toBe(2);
      expect(result.euchred).toBe(true);
    });
  });

  describe("going alone", () => {
    it("5 tricks alone = 4 points", () => {
      const result = calculateHandScore(5, true);
      expect(result.points).toBe(4);
      expect(result.march).toBe(true);
    });

    it("3 tricks alone = 1 point", () => {
      const result = calculateHandScore(3, true);
      expect(result.points).toBe(1);
    });

    it("4 tricks alone = 1 point", () => {
      const result = calculateHandScore(4, true);
      expect(result.points).toBe(1);
    });

    it("2 tricks alone = euchred, 2 points for defenders", () => {
      const result = calculateHandScore(2, true);
      expect(result.points).toBe(2);
      expect(result.euchred).toBe(true);
    });
  });
});

describe("countTricksByTeam", () => {
  it("counts tricks won by each team", () => {
    const tricks: CompletedTrick[] = [
      { cards: [], winner: 0 as PlayerIndex, leadSuit: "spades" }, // Team A
      { cards: [], winner: 1 as PlayerIndex, leadSuit: "spades" }, // Team B
      { cards: [], winner: 2 as PlayerIndex, leadSuit: "spades" }, // Team A
      { cards: [], winner: 0 as PlayerIndex, leadSuit: "spades" }, // Team A
      { cards: [], winner: 3 as PlayerIndex, leadSuit: "spades" }, // Team B
    ];

    const [teamA, teamB] = countTricksByTeam(tricks);
    expect(teamA).toBe(3);
    expect(teamB).toBe(2);
  });

  it("returns [0, 0] for no tricks", () => {
    expect(countTricksByTeam([])).toEqual([0, 0]);
  });
});

// ============================================================
// §9.1 — Game over check
// ============================================================

describe("isGameOver", () => {
  it("returns null when neither team has reached 10", () => {
    expect(isGameOver([5, 8])).toBeNull();
  });

  it("returns Team A when they reach 10", () => {
    expect(isGameOver([10, 8])).toBe("A");
  });

  it("returns Team B when they reach 10", () => {
    expect(isGameOver([7, 10])).toBe("B");
  });

  it("returns Team A when they exceed 10", () => {
    expect(isGameOver([12, 8])).toBe("A");
  });
});

// ============================================================
// §10 — Dealer rotation
// ============================================================

describe("rotateDealer", () => {
  it("rotates clockwise: 0→1→2→3→0", () => {
    expect(rotateDealer(0)).toBe(1);
    expect(rotateDealer(1)).toBe(2);
    expect(rotateDealer(2)).toBe(3);
    expect(rotateDealer(3)).toBe(0);
  });
});

// ============================================================
// Game flow
// ============================================================

describe("createGameState", () => {
  it("creates state with correct initial values", () => {
    const state = createGameState(0);

    expect(state.phase).toBe("bidding-round-1");
    expect(state.scores).toEqual([0, 0]);
    expect(state.dealer).toBe(0);
    expect(state.trumpSuit).toBeNull();
    expect(state.maker).toBeNull();
    expect(state.goingAlone).toBe(false);
    expect(state.completedTricks).toEqual([]);
    expect(state.currentTrick).toEqual([]);
    expect(state.handResult).toBeNull();
  });

  it("deals 5 cards to each player", () => {
    const state = createGameState(0);
    for (const hand of state.hands) {
      expect(hand).toHaveLength(5);
    }
  });

  it("has a face-up card", () => {
    const state = createGameState(0);
    expect(state.upCard).not.toBeNull();
  });

  it("bidding starts left of dealer", () => {
    const state = createGameState(2);
    expect(state.currentPlayer).toBe(3);
  });
});

describe("dealHand", () => {
  it("deals fresh cards and resets hand state", () => {
    const state = makeState({
      phase: "hand-over",
      dealer: 1 as PlayerIndex,
      scores: [4, 6],
      // Stale hand state that should be reset:
      trumpSuit: "hearts",
      maker: 2 as PlayerIndex,
      goingAlone: true,
      completedTricks: [
        { cards: [], winner: 0 as PlayerIndex, leadSuit: "spades" },
      ],
      handResult: {
        makerTeam: "A",
        makerTricksWon: 3,
        defenderTricksWon: 2,
        points: 1,
        scoringTeam: "A",
        euchred: false,
        march: false,
        wentAlone: false,
      },
    });

    const newState = dealHand(state);

    expect(newState.phase).toBe("bidding-round-1");
    expect(newState.trumpSuit).toBeNull();
    expect(newState.maker).toBeNull();
    expect(newState.goingAlone).toBe(false);
    expect(newState.completedTricks).toEqual([]);
    expect(newState.currentTrick).toEqual([]);
    expect(newState.handResult).toBeNull();
    expect(newState.upCard).not.toBeNull();
    // Scores preserved
    expect(newState.scores).toEqual([4, 6]);
    // Dealer preserved (rotation is a separate concern)
    expect(newState.dealer).toBe(1);
    // Each player gets 5 fresh cards
    for (const hand of newState.hands) {
      expect(hand).toHaveLength(5);
    }
  });
});

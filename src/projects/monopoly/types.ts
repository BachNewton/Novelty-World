export type PropertyColor =
  | "brown"
  | "light-blue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "dark-blue";

export type Side = "bottom" | "left" | "top" | "right";

export type Space =
  | { kind: "go" }
  | { kind: "jail" }
  | { kind: "free-parking" }
  | { kind: "go-to-jail" }
  | {
      kind: "property";
      name: string;
      price: number;
      color: PropertyColor;
      /** Rent ladder. `base` is bare-property rent; monopoly bonus is base*2 at
       *  runtime. `houses[0..3]` are rents with 1-4 houses; `hotel` is the
       *  5-development tier. */
      rent: {
        base: number;
        houses: readonly [number, number, number, number];
        hotel: number;
      };
    }
  | { kind: "railroad"; name: string; price: number }
  | { kind: "utility"; name: "Electric Company" | "Water Works"; price: number }
  | { kind: "chance" }
  | { kind: "community-chest" }
  | { kind: "tax"; name: string; amount: number };

/** Eight distinct player hues. Sized for the UI target upper bound of 8
 *  concurrent players; the palette deliberately avoids the property-color
 *  hues so a token never reads as "owns this set." */
export type PlayerColor =
  | "crimson"
  | "violet"
  | "teal"
  | "amber"
  | "emerald"
  | "indigo"
  | "magenta"
  | "slate";

export type PlayerIcon =
  | "dog"
  | "car"
  | "ship"
  | "crown"
  | "cat"
  | "plane"
  | "rocket"
  | "bird";

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  icon: PlayerIcon;
  cash: number;
  /** Board position 0-39, where 0 is GO. */
  position: number;
  /** True iff the player is locked in jail. Just-visiting players sit at
   *  position 10 with `inJail: false`; jailed players sit at the same position
   *  with `inJail: true`. */
  inJail: boolean;
  /** Which turn of the jail sentence the player is on (1–3 in standard rules).
   *  Ignored when `inJail` is false. */
  jailTurns: number;
  /** True once the player has been declared bankrupt — they're skipped in
   *  the turn rotation and can no longer roll, buy, or pay rent. Their
   *  former assets have been transferred to the creditor (or, eventually,
   *  the bank) at the moment the flag flipped. */
  bankrupt: boolean;
  /** True for a computer-controlled seat. Drives the networking model: a
   *  bot's turn (like a disconnected human's) may be driven by any connected
   *  client, whereas a human's turn is driven only by that human's own
   *  client. See `driver.ts` and `monopoly/CLAUDE.md` "Multiplayer". */
  isBot: boolean;
}

export type CardSource = "chance" | "communityChest";

/** Set of assets one side of a trade is giving up. `gojf` lists the deck
 *  sources of any Get Out of Jail Free cards included. */
export interface TradePayload {
  positions: readonly number[];
  cash: number;
  gojf: readonly CardSource[];
}

/** Single recorded action in the play log. Every kind that mutates the
 *  authoritative state has a corresponding event so the log is a faithful
 *  replay of the game so far. */
export type GameEvent =
  | {
      kind: "roll";
      dice: readonly [number, number];
      /** Count of consecutive doubles INCLUDING this roll (1, 2, or 3). 0 for
       *  a non-doubles roll. Three doubles sends you to jail — that emits a
       *  separate `go-to-jail` event with reason "three-doubles". */
      doublesStreak: number;
      toPosition: number;
      passedGo: boolean;
    }
  | { kind: "buy"; position: number; price: number }
  | {
      kind: "rent";
      ownerId: string;
      position: number;
      amount: number;
    }
  | { kind: "tax"; taxName: string; amount: number }
  | {
      kind: "build";
      position: number;
      /** New development level after the build: 1-4 houses, 5 hotel. */
      toLevel: number;
      cost: number;
    }
  | {
      kind: "sell-building";
      position: number;
      /** New development level after selling: 0-4 houses, 5 means "still a
       *  hotel" (a hotel sale yields toLevel 4). */
      toLevel: number;
      refund: number;
    }
  | { kind: "mortgage"; position: number; received: number }
  | { kind: "unmortgage"; position: number; cost: number }
  | {
      kind: "trade";
      /** The other party in the trade. The active player (turn owner) is the
       *  initiator; this is whoever they traded with. */
      withId: string;
      gave: TradePayload;
      received: TradePayload;
    }
  | { kind: "go-to-jail"; reason: "tile" | "card" | "three-doubles" }
  | {
      kind: "jail-roll";
      dice: readonly [number, number];
      /** True if the roll was doubles (player leaves jail). */
      escaped: boolean;
      /** 1-indexed jail turn (1, 2, or 3). A failed third roll forces a $50
       *  payout — emitted as a separate `jail-pay` event. */
      jailTurn: number;
    }
  | { kind: "jail-pay" }
  | { kind: "jail-card"; source: CardSource }
  | {
      kind: "card-drawn";
      source: CardSource;
      /** Card flavor text exactly as printed on the card. */
      text: string;
    }
  | {
      kind: "auction";
      position: number;
      /** Null if the auction passed unsold (no one bid). */
      winnerId: string | null;
      price: number;
    }
  | {
      kind: "bankrupt";
      /** Null if the player went bankrupt to the bank (no single creditor),
       *  otherwise the creditor who receives the estate. */
      creditorId: string | null;
    }
  | { kind: "winner"; winnerId: string };

/** One full play turn, grouping every event that happened while a single
 *  player held the dice. A turn ends when the player ends it (or busts to
 *  jail on three doubles). */
export interface TurnGroup {
  /** 1-indexed turn number. Each player's turn is its own number — the count
   *  is across the whole game, not per-player. */
  turn: number;
  /** Player whose turn this is. */
  playerId: string;
  events: readonly GameEvent[];
}

/** Phase of the active turn. Drives which intents are legal next and
 *  whether `autoStep` may keep advancing the state. See
 *  `monopoly/CLAUDE.md` for the full state-machine sketch. */
export type TurnPhase =
  | "pre-roll"
  | "post-roll"
  | "buy-decision"
  | "must-raise-cash"
  | "auction"
  | "jail-decision"
  | "trade-pending"
  | "game-over";

/** A debt the active player must settle before the turn can continue.
 *  Created by `chargeRent` (later: tax, fines, card effects) when the player
 *  can't cover the bill from cash but COULD cover it after mortgaging
 *  un-built properties. Lives on `TurnState.pendingDebt` while the phase is
 *  `must-raise-cash`; cleared (and the cash transferred) once the player
 *  has mortgaged enough to settle.
 *
 *  Players who couldn't cover the debt even after maxing out mortgages
 *  never reach this state — they go straight to bankrupt in `chargeRent`. */
export interface PendingDebt {
  amount: number;
  /** Recipient of the cash on settle. Always set today (rent has a payee);
   *  will become null when tax / fine debts wire through this same phase. */
  creditorId: string;
}

/** Auction in progress after a player declined to buy a property they
 *  landed on. */
export interface AuctionState {
  position: number;
  /** Players still in the auction, in bidding order. */
  active: readonly string[];
  /** Whose turn to bid or pass. */
  currentBidderId: string;
  /** Highest bid so far. 0 before anyone has bid. */
  highBid: number;
  /** Null until someone bids. */
  leaderId: string | null;
}

/** Trade proposal awaiting accept / decline / counter. */
export interface PendingTrade {
  id: string;
  proposerId: string;
  recipientId: string;
  /** What the proposer would give up. */
  gives: TradePayload;
  /** What the proposer would receive in return. */
  receives: TradePayload;
}

/** Active-turn block. The single source of truth for whose turn it is,
 *  what decision we're waiting on, and any in-flight sub-game. */
export interface TurnState {
  playerId: string;
  phase: TurnPhase;
  /** Consecutive doubles rolled this turn (0-2). A third doubles emits a
   *  `go-to-jail` event with reason "three-doubles" and ends the turn. */
  doublesStreak: number;
  /** Active player has requested a pause at this phase. `autoStep` will
   *  not advance while true; the player keeps issuing intents until they
   *  emit `resume`. */
  paused: boolean;
  /** Position of an unowned ownable square the active player just landed
   *  on, awaiting a buy / decline-buy decision. */
  pendingBuy?: number;
  /** Debt the active player must raise cash for before the turn continues.
   *  Set when `chargeRent` (or future tax / fine paths) finds the player
   *  can't pay from cash alone but could after mortgaging. The engine
   *  auto-settles and transitions out of `must-raise-cash` as soon as a
   *  mortgage intent brings cash up to the debt amount. */
  pendingDebt?: PendingDebt;
  auction?: AuctionState;
  pendingTrade?: PendingTrade;
}

/** Per-player automation policy. Drives the auto-play spectrum: the engine
 *  consults these before prompting for a decision the player has already
 *  decided in advance. */
export interface PlayerPreferences {
  /** "leave" = use a card or pay $50 whenever legal. "stay" = roll for
   *  doubles for as long as possible. */
  jailStance: "leave" | "stay";
  /** Auto-buy a landed-on property when its price is ≤ this fraction of
   *  current cash. 1 = always buy when affordable; 0 = always auction. */
  autoBuyCashFraction: number;
}

/** One-shot pause flags a player can arm to interrupt the auto-pacer at
 *  their next pre-roll (to trade / build / mortgage before rolling) or
 *  post-roll (to do the same before ending the turn). Each flag is
 *  consumed as soon as the engine reaches the matching phase for that
 *  player — auto-cleared at the moment of pause. Players can also clear
 *  it manually before it fires by unchecking the action-bar checkbox.
 *  Not "preferences" because they're transient: arm → trigger → clear. */
export interface ArmedPauses {
  beforeRoll: boolean;
  beforeEnd: boolean;
}

/** External decisions submitted to the engine. Mechanical actions (roll,
 *  move, pay rent, draw card) are NOT intents — they live inside
 *  `autoStep`. See `monopoly/CLAUDE.md` "Intents vs mechanics — the line". */
export type Intent =
  | { kind: "buy"; playerId: string }
  | { kind: "decline-buy"; playerId: string }
  | { kind: "bid"; playerId: string; amount: number }
  | { kind: "pass-bid"; playerId: string }
  | { kind: "build"; playerId: string; position: number }
  | { kind: "sell-building"; playerId: string; position: number }
  | { kind: "mortgage"; playerId: string; position: number }
  | { kind: "unmortgage"; playerId: string; position: number }
  | {
      kind: "propose-trade";
      playerId: string;
      recipientId: string;
      gives: TradePayload;
      receives: TradePayload;
    }
  | { kind: "accept-trade"; playerId: string; tradeId: string }
  | { kind: "decline-trade"; playerId: string; tradeId: string }
  | {
      kind: "counter-trade";
      playerId: string;
      tradeId: string;
      gives: TradePayload;
      receives: TradePayload;
    }
  | { kind: "pay-to-leave-jail"; playerId: string }
  | { kind: "use-jail-card"; playerId: string }
  | { kind: "pause"; playerId: string; when: "pre-roll" | "post-roll" }
  | {
      /** Arm or disarm a one-shot pause for this player at the named
       *  phase. Anyone can submit for themselves — it doesn't need to
       *  be the active turn. The flag is consumed (and the box clears
       *  in the UI) the next time the engine reaches that phase for
       *  this player. See `ArmedPauses`. */
      kind: "set-armed-pause";
      playerId: string;
      when: "before-roll" | "before-end";
      armed: boolean;
    }
  | { kind: "resume"; playerId: string }
  | { kind: "end-turn"; playerId: string };

/** Result of applying an external intent to the state. On success the
 *  caller should then run `autoStep` to drain mechanics until the next
 *  decision point. */
export type ApplyResult =
  | { ok: true; state: GameState; newEvents: readonly GameEvent[] }
  | { ok: false; reason: string };

/** Lifecycle stage of a game row.
 *  - `lobby`: players are still joining and configuring their seats; the
 *    engine and auto-pacer are idle until someone starts the game.
 *  - `active`: in play — the normal turn loop runs.
 *  - `finished`: a winner has been declared (`turn.phase === "game-over"`).
 *    The row is kept for history but excluded from the lobby's joinable list. */
export type GameStatus = "lobby" | "active" | "finished";

/** Authoritative game state. Stored as a single Supabase row; broadcast to
 *  guests via Realtime. */
export interface GameState {
  /** Lifecycle stage — gates the lobby against the play loop. See
   *  `GameStatus`. Local (`dev`) and the current online seed start `active`;
   *  the lobby flow (`createLobby`) starts `lobby` and `startGame` flips it
   *  to `active`. */
  status: GameStatus;
  players: readonly Player[];
  /** position -> player id; absent means unowned. */
  ownership: Readonly<Record<number, string>>;
  /** position -> true if the property is mortgaged. */
  mortgaged: Readonly<Record<number, boolean>>;
  /** position -> developed structures. 1-4 are houses, 5 is a hotel. */
  houses: Readonly<Record<number, number>>;
  /** Holder of each Get Out of Jail Free card, keyed by deck source. Absent
   *  means the card sits at the bottom of its deck. */
  jailFreeCards: Readonly<{ chance?: string; communityChest?: string }>;
  /** Chronological play log, grouped by turn. Newest turn last. */
  turns: readonly TurnGroup[];
  /** Whose turn it is and what we're waiting on. */
  turn: TurnState;
  /** Per-player automation policy, keyed by player id. */
  preferences: Readonly<Record<string, PlayerPreferences>>;
  /** Per-player armed one-shot pause flags, keyed by player id. Dense:
   *  every player has an entry, even if both flags are false. */
  armedPauses: Readonly<Record<string, ArmedPauses>>;
  /** Immutable identifier for the game's RNG stream. Set once when the
   *  game starts; used to derive the initial `rngState` and useful as a
   *  human-readable handle when debugging. */
  rngSeed: string;
  /** Current internal state of the mulberry32 PRNG. Advances on every
   *  engine call that consumes randomness, and is what makes a game
   *  resumable from a serialized GameState alone — the RNG lives in
   *  state, not in host memory. */
  rngState: number;
}

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

/** Every bot strategy value, as runtime data so a validator can't drift from the
 *  type — the route parses untrusted `setStrategy` input against this list
 *  (`route.ts:isBotStrategy`), and `BotStrategy` is derived from it, so adding a
 *  strategy in one place keeps both in lockstep. */
export const BOT_STRATEGIES = ["dumb", "claude", "champion", "latest"] as const;

/** Which bot policy controls a computer seat, resolved through the bot registry
 *  (`bots/registry.ts`). `dumb` is the baseline reactive policy (`bots/dumb.ts`).
 *  The other three are version POINTERS into the archive (`bots/roles.ts`), so a
 *  seat follows whatever each names: `claude` = the hand-picked live bot
 *  (`bots/live.ts`), `champion` = the best by measurement, `latest` = the newest
 *  snapshot. Selected per seat; a human seat has none (`botStrategy === null`). */
export type BotStrategy = (typeof BOT_STRATEGIES)[number];

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
  /** The bot strategy controlling this seat, or `null` for a human. Non-null
   *  marks a computer-controlled seat and selects its policy from the bot
   *  registry (`bots/registry.ts`). It also drives the networking model: a bot's
   *  turn (like a disconnected human's) may be driven by any connected client,
   *  whereas a human's turn is driven only by that human's own client. See
   *  `driver.ts`, `bots/`, and `monopoly/CLAUDE.md`. */
  botStrategy: BotStrategy | null;
}

export type CardSource = "chance" | "communityChest";

/** What a Chance / Community Chest card does when drawn. The 32 official cards
 *  collapse to these effects; the engine resolves each into mechanics it
 *  already performs (move + resolve the landed tile, charge the bank, transfer
 *  between players, go to jail, hold a GOJF), so a card never needs its own
 *  decision phase. Amounts/positions carry the exact official values. */
export type CardEffect =
  /** Bank pays the drawer (dividend, loan, refund, inheritance, …). */
  | { kind: "collect"; amount: number }
  /** Drawer pays the bank (speeding fine, doctor, hospital, …). */
  | { kind: "pay"; amount: number }
  /** Every other player pays the drawer (Birthday). */
  | { kind: "collect-each"; amount: number }
  /** Drawer pays every other player (Chairman of the Board). */
  | { kind: "pay-each"; amount: number }
  /** Advance to an absolute board position, crediting GO if the move wraps
   *  (GO, Boardwalk, Illinois, St. Charles, Reading Railroad). */
  | { kind: "advance-to"; position: number }
  /** Advance to the nearest railroad / utility ahead, then pay special rent:
   *  2× the owner's normal railroad rent, or 10× a fresh dice throw for a
   *  utility (regardless of how many the owner holds). */
  | { kind: "advance-nearest"; target: "railroad" | "utility" }
  /** Move back three squares and resolve the tile landed on. */
  | { kind: "back-three" }
  | { kind: "go-to-jail" }
  /** Acquire a Get-Out-of-Jail-Free card (held until used). */
  | { kind: "jail-free" }
  /** Pay the bank per building owned (general / street repairs). */
  | { kind: "repairs"; perHouse: number; perHotel: number };

/** One card in a deck. `name` is the pro shorthand shown in the log — the
 *  nickname players already know the card by ("Boardwalk", "Chairman",
 *  "Nearest RR"), deliberately not the printed flavor text. `id` is a stable
 *  identifier the log and replay reference; the engine resolves `effect`. */
export interface Card {
  id: string;
  name: string;
  effect: CardEffect;
}

/** The asset reassignments + cash movements that define a trade. Properties
 *  and GOJF cards list ONLY the entries that change hands (a property mapped
 *  to its current owner would be a no-op and is never stored); `cashDelta` is
 *  each player's net cash change and must sum to zero — money only moves
 *  between players, never to or from the bank. The 10% interest a receiver
 *  owes on a mortgaged property is NOT part of `cashDelta`; it's a separate
 *  bank charge derived at execution. Permissive by design: any properties may
 *  move between any players, and the proposer need not be a party. Used as the
 *  live draft, and — with `id` + `approvals` — as the finalized proposal. */
export interface TradeTerms {
  /** position -> new owner id, per property changing hands. */
  propertyTo: Readonly<Record<number, string>>;
  /** GOJF card source -> new holder id, per card changing hands. */
  gojfTo: Readonly<Partial<Record<CardSource, string>>>;
  /** player id -> net cash change (positive = receives). Sparse; absent = 0.
   *  Sums to zero across all entries. */
  cashDelta: Readonly<Record<string, number>>;
}

/** A trade being assembled by its proposer. Lives in the authoritative
 *  GameState (`turn.tradeDraft`) so every player watches it take shape in real
 *  time — the same broadcast discipline as a manage intermission's
 *  `ManageStaged`. */
export interface TradeDraft extends TradeTerms {
  proposerId: string;
}

/** A manage intermission's staged changes — the build levels and mortgage flags
 *  the actor has toggled but not yet committed. Lives in the authoritative
 *  GameState (`turn.manageStaged`) so every player watches the intermission take
 *  shape in real time, the same way a `TradeDraft` is broadcast.
 *
 *  - `build` maps a position to its STAGED development level (0 bare … 5 hotel).
 *  - `mortgage` maps a position to its STAGED mortgaged flag.
 *
 *  Both maps store only entries that differ from the live state; the store prunes
 *  a key the moment it falls back to the current value as the actor cycles. */
export interface ManageStaged {
  build: Readonly<Record<number, number>>;
  mortgage: Readonly<Record<number, boolean>>;
}

/** The asset + cash movements of a trade, shared by the executed (`trade`) and
 *  rejected (`trade-declined`) log events — both render the same per-move
 *  "from → to" rows. For a declined offer the moves describe what *would* have
 *  happened; nothing was applied. */
export interface TradeMoves {
  /** Who assembled and proposed the trade (may not be a participant). */
  proposerId: string;
  /** Asset + cash movements (same shape as the proposal). */
  propertyTo: Readonly<Record<number, string>>;
  gojfTo: Readonly<Partial<Record<CardSource, string>>>;
  cashDelta: Readonly<Record<string, number>>;
  /** Each moved property's / card's owner before the trade, paired with
   *  `propertyTo` / `gojfTo` so the log can render each asset move as
   *  "from → to". Cash has no "from": `cashDelta` is a net per player, not a
   *  pairwise flow. */
  propertyFrom: Readonly<Record<number, string>>;
  gojfFrom: Readonly<Partial<Record<CardSource, string>>>;
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
      /** The actor who built. Carried explicitly because a manage intermission
       *  (or a forced must-raise-cash settle) can be driven by an OFF-TURN
       *  player, so the active turn's `playerId` is not necessarily who acted —
       *  the log keys its viewer-relative cash coloring off this. */
      playerId: string;
      position: number;
      /** New development level after the build: 1-4 houses, 5 hotel. */
      toLevel: number;
      cost: number;
    }
  | {
      kind: "sell-building";
      /** The actor who sold (may be off-turn — see `build.playerId`). */
      playerId: string;
      position: number;
      /** New development level after selling: 0-4 houses, 5 means "still a
       *  hotel" (a hotel sale yields toLevel 4). */
      toLevel: number;
      refund: number;
    }
  | { kind: "mortgage"; playerId: string; position: number; received: number }
  | { kind: "unmortgage"; playerId: string; position: number; cost: number }
  | ({ kind: "trade" } & TradeMoves)
  | ({
      kind: "trade-declined";
      /** The party who declined. A single decline kills the whole proposal, so
       *  this is the first (and only) rejecter — there's never a list. */
      declinedBy: string;
    } & TradeMoves)
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
      /** Stable id of the drawn card (see `Card.id`); the log maps it to the
       *  pro shorthand name. */
      cardId: string;
      /** Net bank cash this card moved for the drawer, signed (+ for a collect,
       *  − for a pay / repairs). Absent for movement / jail / GOJF cards, whose
       *  effect surfaces as its own follow-on events. */
      cash?: number;
    }
  /** A card moving cash between two players (Chairman pays each, Birthday
   *  collects from each) — one line per opponent. Direction is `fromId → toId`. */
  | { kind: "card-transfer"; fromId: string; toId: string; amount: number }
  /** GO salary credited by a card-driven move that wrapped the board. The
   *  roll path encodes this inline on the `roll` event instead; cards have no
   *  roll, so they emit it standalone. */
  | { kind: "pass-go" }
  | {
      kind: "auction";
      position: number;
      /** Null if the auction passed unsold (no one bid). */
      winnerId: string | null;
      price: number;
    }
  | {
      kind: "bankrupt";
      /** The eliminated player. Carried explicitly because a bust can be
       *  off-turn (a trade-forced debtor), so it isn't always the turn's actor. */
      debtorId: string;
      /** Null if the player went bankrupt to the bank (no single creditor),
       *  otherwise the creditor who receives the estate. */
      creditorId: string | null;
      /** Lots that transferred in-kind to a player creditor (bare, keeping their
       *  mortgage status), so the log can show one transfer line each. Empty for
       *  a bank bust — those lots are auctioned and surface as `auction` events. */
      estateProperties: readonly number[];
      /** Get-Out-of-Jail-Free cards that transferred to a player creditor. Empty
       *  for a bank bust (they return to their decks). */
      estateGojf: readonly CardSource[];
      /** Net cash the creditor realized FROM THE ESTATE: the debtor's buildings
       *  sold back to the bank at half price, minus the 10% interest owed on each
       *  still-mortgaged lot inherited. Zero for a bank bust. The debtor's own
       *  remaining cash is NOT counted here — it moves on the charge line. */
      estateCash: number;
    }
  | { kind: "winner"; winnerId: string }
  /** A bot's reasoning, surfaced in the log under a "BOT" verb so players (and
   *  we, debugging) can see WHY a computer seat acted. This is the lone log
   *  event with no corresponding board change — pure annotation. It's always
   *  written in the same atomic submit as the decision it explains, immediately
   *  before it, and is generated deterministically by the policy (no live model
   *  call), so it never breaks deterministic replay. `playerId` is the acting
   *  bot (may be off-turn for an off-turn trade proposal), used for attribution. */
  | { kind: "bot-note"; playerId: string; text: string };

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
  | "raising-cash"
  | "must-raise-cash"
  | "auction"
  | "jail-decision"
  | "trade-building"
  | "trade-pending"
  | "managing"
  | "game-over";

/** Where play resumes once every player is back to non-negative cash and the
 *  `must-raise-cash` phase clears. A debt is charged immediately — the
 *  debtor's cash goes negative — and they must mortgage (later: sell
 *  buildings) back to ≥ 0 before play continues; whoever is below zero is the
 *  current debtor (see `firstNegativePlayer`), so the debtors and amounts live
 *  in player cash, not here. Only the resume target needs remembering:
 *  - `after-landing`: continue the active player's landing — another roll on
 *    doubles, else post-roll. Used when a rent / tax / card charge put them in
 *    the red (the debtor is always the active player here).
 *  - `pre-roll`: return to the pre-roll boundary (which re-checks the trade
 *    queue, then rolls). Used when a trade's settlement — cash deltas or
 *    mortgage interest — put one or more players (possibly out of turn) in the
 *    red.
 *  - a **bank-estate continuation** (`{ kind: "bank-estate", … }`, reused from
 *    `AuctionResume`): resume the estate-liquidation auction loop — auction the
 *    next lot, or hand off when the estate is exhausted. Used when an estate-lot
 *    winner bid above their cash (the net-worth cap) and must settle before the
 *    next lot is put up.
 *
 *  A debtor who couldn't reach ≥ 0 even after maxing out raisable cash never
 *  enters this phase — they go straight to bankrupt at charge time. */
export type RaiseCashResume =
  | "after-landing"
  | "pre-roll"
  | Extract<AuctionResume, { kind: "bank-estate" }>;

/** What play resumes into once an auction resolves — the auction sub-game is
 *  shared by both triggers, and only the continuation differs:
 *  - `landing`: a landed-on property the active player declined. Resume their
 *    turn through `afterLanding` (or `settleOrRaise` if the winner went into the
 *    red paying the bid — a net-worth-capped bid always recovers).
 *  - `bank-estate`: liquidating a player who went bankrupt to the bank. Auction
 *    each estate lot in turn (`remaining`); when the list empties, finish the
 *    deferred bankruptcy (winner check + hand-off). `debtorId` is the bankrupt. */
export type AuctionResume =
  | { kind: "landing" }
  | {
      kind: "bank-estate";
      debtorId: string;
      remaining: readonly number[];
    };

/** Auction in progress — a landed-on property the active player declined, or a
 *  lot from a bank-bankruptcy estate. Open-outcry: any still-in player may bid
 *  at any time (a `bid` records an absolute amount and takes the lead if it tops
 *  the high), or drop out. There is no turn order — even the current `leaderId`
 *  may bid again to
 *  jam the price up. The auction resolves once every non-leader has dropped (the
 *  leader wins), or everyone drops without a bid (the lot reverts to the bank).
 *  See `monopoly/CLAUDE.md` "Auctions". */
export interface AuctionState {
  position: number;
  /** Players still in the auction (haven't dropped). Seat-ordered for display;
   *  membership is what matters — there is no rotation. */
  active: readonly string[];
  /** Highest bid so far. 0 before anyone has bid. */
  highBid: number;
  /** The current high bidder, or null until someone bids. They can't drop (no
   *  retracting a winning bid) but may bid again to raise their own price. */
  leaderId: string | null;
  /** Each participant's latest bid, for the panel display. Absent = hasn't bid
   *  yet. */
  bids: Readonly<Record<string, number>>;
  /** Where play resumes when this auction resolves. */
  resume: AuctionResume;
}

/** A finalized trade proposal awaiting approval. Every NAMED participant
 *  (anyone who gives or receives a property, card, or cash) must approve
 *  before it executes; a single decline cancels it. Counters aren't built yet
 *  — a player who dislikes a proposal declines and someone proposes afresh;
 *  see the `counter-trade` TODO on `Intent`. */
export interface PendingTrade extends TradeTerms {
  id: string;
  proposerId: string;
  /** player id -> approved, keyed by every named participant. The proposer is
   *  seeded `true` iff they're named. All true -> the trade executes. */
  approvals: Readonly<Record<string, boolean>>;
}

/** Active-turn block. The single source of truth for whose turn it is,
 *  what decision we're waiting on, and any in-flight sub-game. */
export interface TurnState {
  playerId: string;
  phase: TurnPhase;
  /** Consecutive doubles rolled this turn (0-2). A third doubles emits a
   *  `go-to-jail` event with reason "three-doubles" and ends the turn. */
  doublesStreak: number;
  /** Present iff `phase === "managing"`: the queued player whose manage
   *  intermission is open. They may be off-turn (the boundary queue resolves
   *  before the active player rolls), so this is the manager's id, not
   *  necessarily `playerId`. */
  managerId?: string;
  /** Position of an unowned ownable square the active player just landed
   *  on, awaiting a buy / decline-buy decision. Retained through `raising-cash`
   *  (the buyer staging a cash-raise to afford it), since that resumes back into
   *  this same buy. */
  pendingBuy?: number;
  /** Present iff `phase === "must-raise-cash"`. Says where play resumes once
   *  every player who went negative has climbed back to ≥ 0. The debtor(s) and
   *  the amounts are read from player cash (whoever is below zero), not stored
   *  here — see `firstNegativePlayer`. */
  raiseCash?: RaiseCashResume;
  auction?: AuctionState;
  /** Present during `managing` / `raising-cash` / `must-raise-cash`: the actor's
   *  staged build / mortgage changes before they commit. Seeded empty when the
   *  intermission opens and dropped when the phase exits; broadcast so every
   *  player watches the intermission take shape, the same as `tradeDraft`. In
   *  `raising-cash` it's the raise the buyer is assembling, which the `buy`
   *  commit reads straight from here (the intent carries no raise of its own). */
  manageStaged?: ManageStaged;
  /** Present iff `phase === "trade-building"`: the proposal being assembled,
   *  visible to all players as the proposer edits it. */
  tradeDraft?: TradeDraft;
  /** Present iff `phase === "trade-pending"`: the proposal awaiting approval. */
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

/** External decisions submitted to the engine. Mechanical actions (roll,
 *  move, pay rent, draw card) are NOT intents — they live inside
 *  `autoStep`. See `monopoly/CLAUDE.md` "Intents vs mechanics — the line". */
export type Intent =
  /** Buy the landed-on property. Legal from `buy-decision` (paying outright) and
   *  from `raising-cash`, where the buyer has staged a cash-raise in
   *  `turn.manageStaged` — `applyBuy` runs that raise first, atomically, against
   *  pre-purchase holdings (which exclude the landed-on lot, so a property can
   *  never fund its own purchase), then completes the purchase. The intent
   *  carries no raise of its own; the staging lives in synced state. */
  | { kind: "buy"; playerId: string }
  | { kind: "decline-buy"; playerId: string }
  /** Step from a `buy-decision` into `raising-cash`: the active buyer is short
   *  and wants to sell buildings / mortgage their OTHER lots to afford the
   *  landed-on property. Opens an empty staging the buyer drives on the board
   *  (raise-only), committing via `buy` or backing out via `cancel-manage`
   *  (which returns to the buy-decision). */
  | { kind: "raise-cash"; playerId: string }
  /** Place a bid of `amount` — an absolute total; the client sends what the
   *  bidder saw plus one increment. The amount is always RECORDED as that
   *  player's standing bid (so a tap is never lost), and takes the lead only
   *  when it tops the current high; an already-out-high bid still counts on the
   *  chart. This absolute form is what makes a bid safely rebaseable on the
   *  client — re-recording the same amount is idempotent, so a lost version race
   *  neither snaps the bar back nor auto-escalates the price. Any still-in
   *  player may bid, including the standing leader. */
  | { kind: "bid"; playerId: string; amount: number }
  /** Drop out of the auction. Permanent; the standing leader can't drop. */
  | { kind: "pass-bid"; playerId: string }
  /** Atomic "manage my properties" commit — the unified output of the manage
   *  intermission. Carries the player's full staged target development levels
   *  (`build`: position -> 0-5) AND mortgage flags (`mortgage`: position ->
   *  mortgaged) for everything they're changing. The engine applies it whole,
   *  raise-first / spend-second, all-or-nothing: it can never leave the board
   *  uneven, half-mortgaged, or partially applied even if the bank shifted under
   *  it. This ordering is what lets one commit sell a property's houses and then
   *  mortgage the bare lot, or mortgage one property to fund building another.
   *  The voluntary path requires the player's own open manage intermission
   *  (`phase === "managing"` with them as `managerId`); selling/mortgaging are
   *  also allowed for the current debtor during `must-raise-cash`. Emits
   *  per-tier `build` / `sell-building` and `mortgage` / `unmortgage` events. */
  | {
      kind: "manage";
      playerId: string;
      build: Readonly<Record<number, number>>;
      mortgage: Readonly<Record<number, boolean>>;
    }
  /** Mortgage a single property to raise cash. Only valid in `must-raise-cash`
   *  (the forced debtor / bot path); voluntary mortgaging goes through `manage`. */
  | { kind: "mortgage"; playerId: string; position: number }
  /** Set membership in the FIFO boundary queue for a kind — "I want to trade" or
   *  "I want to manage". Carries the DESIRED state (`armed`), not a flip, so the
   *  optimistic overlay can replay it idempotently on a head that already
   *  reflects the arm (a confirmation echo, a rebase) without toggling it back
   *  off. Anyone may arm it for themselves at any time; the next unpaused
   *  pre-roll opens the head entry's intermission (`trade-building` /
   *  `managing`). */
  | { kind: "set-queue"; playerId: string; queue: "trade" | "manage"; armed: boolean }
  /** Abandon an open manage-style intermission with nothing committed. From
   *  `managing` it returns the manager to pre-roll (the next autoStep re-checks
   *  the queue); from `raising-cash` it returns the buyer to their pending
   *  `buy-decision`. */
  | { kind: "cancel-manage"; playerId: string }
  /** Actor replaces their live manage staging wholesale (the client computes the
   *  next staged maps and sends a full snapshot — same shape and broadcast model
   *  as `update-trade-draft`). Legal in `managing` for the manager, in
   *  `must-raise-cash` for the current debtor, or in `raising-cash` for the
   *  active buyer staging a cash-raise; staging is a preview, validated finally
   *  at the `manage` or `buy` commit. */
  | { kind: "update-manage-staging"; playerId: string; staged: ManageStaged }
  /** Proposer replaces the live draft wholesale (the client computes the next
   *  terms and sends a full snapshot — keeps the intent surface small and the
   *  draft trivially broadcastable). Only legal in `trade-building` for the
   *  draft's proposer. */
  | { kind: "update-trade-draft"; playerId: string; terms: TradeTerms }
  /** Proposer abandons the build (or pending proposal), returning to pre-roll. */
  | { kind: "cancel-trade"; playerId: string }
  /** Proposer finalizes the current draft into a proposal awaiting approval. */
  | { kind: "propose-trade"; playerId: string }
  | { kind: "accept-trade"; playerId: string; tradeId: string }
  | { kind: "decline-trade"; playerId: string; tradeId: string }
  // TODO(counter-trade): let a named party edit a pending proposal and
  // re-submit it, re-opening approval for everyone. Deferred for now; the
  // TradeTerms model + update-trade-draft are shaped to support it later.
  | { kind: "pay-to-leave-jail"; playerId: string }
  | { kind: "use-jail-card"; playerId: string }
  /** Record a bot's reasoning as a `bot-note` log event (no board change). The
   *  pacer prepends it to the same submit batch as the decision it annotates, so
   *  the two land atomically (see `bots/`, `pacing.ts`). A no-op for a non-bot
   *  seat, so it can never reject the batch and stall a turn. */
  | { kind: "bot-note"; playerId: string; text: string }
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

/** Seat counts a fresh game can be sized to — the lobby caps here and the dev
 *  `restart` command swaps between them. Bounded by the eight-hue palette. */
export type PlayerCount = 2 | 4 | 8;

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
   *  means the card sits in its deck (and so appears in `decks`). */
  jailFreeCards: Readonly<{ chance?: string; communityChest?: string }>;
  /** Draw order for each deck as indices into the static CHANCE /
   *  COMMUNITY_CHEST card arrays (front = next to draw). Drawing a card pops
   *  the front and pushes it to the back; a Get-Out-of-Jail-Free card leaves
   *  the pile while held (tracked in `jailFreeCards`) and returns to the back
   *  when used. Seeded-shuffled once at game start for deterministic replay. */
  decks: Readonly<{ chance: readonly number[]; communityChest: readonly number[] }>;
  /** Chronological play log, grouped by turn. Newest turn last. */
  turns: readonly TurnGroup[];
  /** Whose turn it is and what we're waiting on. */
  turn: TurnState;
  /** Per-player automation policy, keyed by player id. */
  preferences: Readonly<Record<string, PlayerPreferences>>;
  /** Boundary intermissions players have armed, in request order (FIFO). Each
   *  entry is a player wanting to trade or manage between turns. The next
   *  unpaused pre-roll consumes the head and opens its intermission
   *  (`trade-building` or `managing`) "just before the next roll". Further armed
   *  entries wait their turn after each resolves. */
  boundaryQueue: readonly { playerId: string; kind: "trade" | "manage" }[];
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

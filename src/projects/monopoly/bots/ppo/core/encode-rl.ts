import { TOTAL_HOTELS, TOTAL_HOUSES } from "../../../data";
import { bankSupply, colorAt, groupPositions } from "../../../development";
import { firstNegativePlayer, netWorth } from "../../../engine";
import { ownablePrice, rentAt } from "../../../logic";
import { ownerSeatSlot } from "../../rl/features";
import type { GameState, PropertyColor, TradeTerms, TurnPhase } from "../../../types";
import {
  ASSET_DESTS,
  ASSET_POSITIONS,
  assetLegal,
  GLOBAL_TOKENS,
  globalMask,
  GOJF_ROWS,
  manageMask,
  MANAGE_OPS,
  MAX_SEATS,
  NUM_ASSETS,
  NUM_PROPS,
  seatOrder,
} from "./action-space";

// ---------------------------------------------------------------------------
// The RL observation builder — the structured `obs` half of the training rig's
// observation/action contract, extracted verbatim (its action half is
// `action-space.ts`).
// Where `features.ts` `encode` produces a single flat vector (built for the
// 1-ply value net), the RL net is a per-entity architecture: it pools a
// per-player encoder over an 8×PF player matrix and a per-asset encoder over a
// 30×AF asset matrix, then a trunk, then masked heads. So the observation is
// STRUCTURED, not flat:
//   - `global`  : float[G]      — turn/board context shared by all entities.
//   - `players` : float[8][PF]  — one row per seat, seat-relative (acting = 0).
//   - `assets`  : float[30][AF] — DYNAMIC features only (rows 0..27 ownables in
//                                 board order, 28..29 GOJF). Identity is the net's
//                                 `Embedding(30,d)` indexed by row, NOT a feature.
//   - `present` : bool[8]       — which seat rows are real (non-bankrupt) players.
//   plus the three legality masks (`global_mask`, `manage_mask`, `asset_legal`)
//   and the active `head` so the net knows which head to sample.
//
// Seat-relative & pure: the acting seat is always row 0, opponents follow in seat
// order, and the same (state, seat) always yields the same observation — it slots
// into the deterministic-replay world the engine guarantees. The per-opponent
// ownership one-hot the CONTRACT requires (which the pooled `encode` lacks) lives
// in the asset matrix via `ownerSeatSlot`.
// ---------------------------------------------------------------------------

/** Cash / net-worth scale (mirrors `features.ts`): dollars / this ≈ O(1). */
const MONEY_SCALE = 1000;

/** Phase one-hot order — mirrors `features.ts` `PHASES` (the full `TurnPhase`
 *  union, fixed order). A phase added to `TurnPhase` must be added here. */
const PHASES: readonly TurnPhase[] = [
  "pre-roll",
  "post-roll",
  "buy-decision",
  "raising-cash",
  "must-raise-cash",
  "auction",
  "jail-decision",
  "trade-building",
  "trade-pending",
  "managing",
  "game-over",
];

/** Which head the net should sample for `seat` at this state:
 *  - `"trade"`  while `seat` drives an open `trade-building` intermission,
 *  - `"global"` everywhere else (the discrete token vocab covers it).
 *  The worker drives the trade intermission MECHANICALLY from one `trade` action
 *  (arm → draft → propose), so the only states that surface to the policy with a
 *  `trade` head are the `trade-building` ones it opened.
 *
 *  There is no `"manage"` head: the manage plan is GATED, not routed. It rides on
 *  the same action as the global token and applies only when that token is
 *  ARM_MANAGE, so the `managing` intermission opens and closes inside one
 *  transition and is never a state the policy observes. */
export type Head = "global" | "trade";

export function headFor(state: GameState, seat: string): Head {
  const { phase } = state.turn;
  if (phase === "trade-building" && state.turn.tradeDraft?.proposerId === seat) {
    return "trade";
  }
  return "global";
}

/** Options controlling optional obs blocks. Omitted / all-false ⇒ byte-identical
 *  to the legacy observation (the wire default). Threaded through every dims
 *  emitter (`obsSpec` / `featLayout` / `specV2`) AND the encoders / packers so the
 *  handshake `G` and the packed blob can never disagree. */
export interface EncodeOptions {
  /** Append the v2 global block (auction + responder-perspective pending-trade
   *  context) after the legacy 20 features. Default OFF — the global vector is
   *  exactly the legacy `GLOBAL_FEATURES` features. */
  obsGlobalV2?: boolean;
  /** Append each seat's RELATIVE net-worth share `max(nw,0)/Σ max(nw,0)` as a
   *  6th per-player feature (scale-invariant, bounded [0,1], monotone with
   *  P(win)). Default OFF — the player row is exactly the legacy
   *  `PLAYER_FEATURES` features. */
  obsNwShare?: boolean;
  /** Append each seat's RENT-COLLECTION CAPACITY as two per-player features:
   *  `capacity/MONEY_SCALE` and its share `capacity/Σ capacity`. Unlike net
   *  worth — which mortgaging leaves ~unchanged, since cash replaces the book
   *  value — capacity DROPS TO ZERO for a mortgaged property, so the income the
   *  agent switches off by churning mortgages is finally observable. Default OFF
   *  — the player row is exactly the legacy `PLAYER_FEATURES` features. */
  obsRentCapacity?: boolean;
}

/** v2 global block widths (appended after the legacy `GLOBAL_FEATURES` when
 *  `obsGlobalV2` is on): auction context (list price/400, position/39,
 *  hold-group bit) + responder-perspective pending-trade context (8 scalars +
 *  proposer seat one-hot) + the saturating game-age scalar. */
const GLOBAL_V2_AUCTION = 3;
const GLOBAL_V2_TRADE = 8 + MAX_SEATS;
const GLOBAL_V2_AGE = 1;
export const GLOBAL_V2_EXTRA =
  GLOBAL_V2_AUCTION + GLOBAL_V2_TRADE + GLOBAL_V2_AGE;

/** The half-saturation constant of the game-age feature `T/(T+K)`. Chosen from
 *  the measured length distribution: a typical completed game's midpoint reads a
 *  little under 0.5, so the feature spends its steepest, best-resolved stretch
 *  across the range real games actually occupy, and flattens gracefully beyond
 *  it. */
const GAME_AGE_HALF = 150;

/** Elapsed game length as a BOUNDED, monotone scalar in [0,1).
 *
 *  Any reward that depends on elapsed length makes the reward time-dependent, so
 *  elapsed length has to be IN the observation or the process stops being Markov
 *  in what the agent sees: the same board at turn 20 and turn 500 would carry
 *  different rewards, the value function could only learn the mean over game
 *  ages, and the policy could only learn one uniform response instead of
 *  conditioning on how long THIS game has run.
 *
 *  It must also saturate. The rig has to support environments with genuinely
 *  unbounded episodes, and a raw counter goes out of distribution the moment a
 *  game outlives the ones the net was trained on. `T/(T+K)` is bounded and
 *  monotone, and — the load-bearing property — a BIJECTION of `T`, so it remains
 *  sufficient for the policy to reconstruct the penalty exactly.
 *
 *  `T` is the turn count. `turns` grows by exactly one group per turn and never
 *  shrinks (`advanceToNextPlayer` is its sole growth point), so its length is the
 *  engine's turn counter rather than an incidental property of a log. */
export function gameAge(state: GameState): number {
  const turns = state.turns.length;
  return turns / (turns + GAME_AGE_HALF);
}

/** The eight color groups, board order — the shared monopoly unit (mirrors the
 *  engine's group order; used by the trade-valuation set counter). */
export const COLOR_GROUPS: readonly PropertyColor[] = [
  "brown",
  "light-blue",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "dark-blue",
];

/** GOJF card face value used in trade valuation (mirrors the candidate pricing on
 *  the env-worker side). */
export const GOJF_TRADE_FACE = 50;

/** Board position → canonical asset row (the same row order the asset matrix and
 *  the trade heads key on). */
const ASSET_ROW_BY_POS: ReadonlyMap<number, number> = new Map(
  ASSET_POSITIONS.map((pos, row) => [pos, row]),
);

/** Count of color groups fully owned by `id` under the ownership map `own`. */
export function completedSets(
  own: Readonly<Record<number, string>>,
  id: string,
): number {
  let n = 0;
  for (const color of COLOR_GROUPS) {
    if (groupPositions(color).every((p) => own[p] === id)) n += 1;
  }
  return n;
}

/** The valuation of a trade `terms` from `meId`'s perspective, with `otherId` the
 *  counterparty whose set-completion delta is also reported. Factors the give/get
 *  face + count + set-delta + mortgage arithmetic shared by the candidate-trade
 *  wire vector and the responder-perspective pending-trade obs block. Set deltas
 *  come from the ownership projection alone — cards and cash never touch a color
 *  group. Pure. */
export interface TradeValuation {
  /** Asset rows `meId` gives away / receives (canonical asset-row order). */
  giveRows: number[];
  getRows: number[];
  giveCount: number;
  getCount: number;
  giveFace: number;
  getFace: number;
  anyMortgaged: 0 | 1;
  /** completedSets(after) − completedSets(before) for me / the counterparty. */
  mySetsDelta: number;
  otherSetsDelta: number;
  /** Net cash `meId` receives (negative = pays). */
  cashToMe: number;
}

export function tradeValuation(
  state: GameState,
  meId: string,
  otherId: string,
  terms: TradeTerms,
): TradeValuation {
  const giveRows: number[] = [];
  const getRows: number[] = [];
  let giveCount = 0;
  let getCount = 0;
  let giveFace = 0;
  let getFace = 0;
  let anyMortgaged: 0 | 1 = 0;
  for (const [posStr, newOwner] of Object.entries(terms.propertyTo)) {
    const pos = Number(posStr);
    const row = ASSET_ROW_BY_POS.get(pos);
    if (row === undefined) continue; // defensive: not an asset row
    const face = ownablePrice(pos) ?? 0;
    if (state.mortgaged[pos]) anyMortgaged = 1;
    if (newOwner === meId) {
      getRows.push(row);
      getCount += 1;
      getFace += face;
    } else {
      giveRows.push(row);
      giveCount += 1;
      giveFace += face;
    }
  }
  for (const { row, source } of GOJF_ROWS) {
    const newHolder = terms.gojfTo[source];
    if (newHolder === undefined) continue;
    if (newHolder === meId) {
      getRows.push(row);
      getCount += 1;
      getFace += GOJF_TRADE_FACE;
    } else {
      giveRows.push(row);
      giveCount += 1;
      giveFace += GOJF_TRADE_FACE;
    }
  }
  const own2: Record<number, string> = { ...state.ownership };
  for (const [posStr, newOwner] of Object.entries(terms.propertyTo)) {
    own2[Number(posStr)] = newOwner;
  }
  const mySetsDelta =
    completedSets(own2, meId) - completedSets(state.ownership, meId);
  const otherSetsDelta =
    completedSets(own2, otherId) - completedSets(state.ownership, otherId);
  return {
    giveRows,
    getRows,
    giveCount,
    getCount,
    giveFace,
    getFace,
    anyMortgaged,
    mySetsDelta,
    otherSetsDelta,
    cashToMe: terms.cashDelta[meId] ?? 0,
  };
}

/** Whether `seat` already owns ≥1 lot of `pos`'s color group. Railroads /
 *  utilities have no color group (`colorAt` null) ⇒ false. */
function holdsColorGroup(state: GameState, seat: string, pos: number): boolean {
  const color = colorAt(pos);
  if (color === null) return false;
  return groupPositions(color).some((p) => state.ownership[p] === seat);
}

/** Append the v2 global block: auction lot identity/color context (all 0 with no
 *  auction) followed by a RESPONDER-perspective pending-trade summary (all 0 with
 *  no pendingTrade). Layout is documented on `GLOBAL_V2_EXTRA`. */
function appendGlobalV2(
  out: number[],
  state: GameState,
  seat: string,
  auction: GameState["turn"]["auction"],
): void {
  // Auction context.
  if (auction) {
    out.push((ownablePrice(auction.position) ?? 0) / 400);
    out.push(auction.position / 39);
    out.push(holdsColorGroup(state, seat, auction.position) ? 1 : 0);
  } else {
    out.push(0, 0, 0);
  }
  // Pending-trade context, responder perspective (seat = the responder being
  // asked to accept/decline; the proposer is the counterparty).
  const pending = state.turn.pendingTrade;
  if (pending) {
    const v = tradeValuation(state, seat, pending.proposerId, pending);
    const clamp2 = (d: number): number => Math.max(-2, Math.min(2, d));
    out.push(v.cashToMe / 1500); // cash to me (negative = I pay)
    out.push(v.giveFace / 1500);
    out.push(v.getFace / 1500);
    out.push(v.giveCount / 4);
    out.push(v.getCount / 4);
    out.push(clamp2(v.mySetsDelta) / 2);
    out.push(clamp2(v.otherSetsDelta) / 2); // proposer's set-completion delta
    out.push(v.anyMortgaged);
    // Proposer seat one-hot, seat-relative to `seat` (row 0 = seat), same
    // ordering `playerRow` uses; all-zero if the proposer isn't a live seat.
    const order = seatOrder(state, seat);
    let slot = order.findIndex((id) => id === pending.proposerId);
    if (state.players.find((p) => p.id === pending.proposerId)?.bankrupt) slot = -1;
    for (let i = 0; i < MAX_SEATS; i++) out.push(slot === i ? 1 : 0);
  } else {
    for (let i = 0; i < GLOBAL_V2_TRADE; i++) out.push(0);
  }
  // Elapsed game length — last, so the block stays append-only.
  out.push(gameAge(state));
}

/** The global feature block, in a fixed order. `G` is its length
 *  (`globalWidth(opts)`). */
function globalVector(
  state: GameState,
  seat: string,
  opts: EncodeOptions = {},
): number[] {
  const supply = bankSupply(state);
  const pending = state.turn.pendingBuy;
  const auction = state.turn.auction;
  const phaseIndex = PHASES.indexOf(state.turn.phase);

  const out: number[] = [];
  // Phase one-hot.
  for (let i = 0; i < PHASES.length; i++) out.push(phaseIndex === i ? 1 : 0);
  // Board / turn context.
  // `progress` = how deep into the game we are, as the turn count: `turns` grows
  // by one group per turn and never shrinks, so its length is that counter.
  out.push(state.turns.length / 100); // progress
  out.push(supply.houses / TOTAL_HOUSES);
  out.push(supply.hotels / TOTAL_HOTELS);
  out.push(pending !== undefined ? 1 : 0);
  out.push(pending !== undefined ? (ownablePrice(pending) ?? 0) / 400 : 0);
  out.push(state.turn.playerId === seat ? 1 : 0); // active-is-me
  out.push(firstNegativePlayer(state) === seat ? 1 : 0); // debtor-is-me
  // Auction context: a live auction's high bid (normalized) and whether I lead.
  out.push(auction ? auction.highBid / MONEY_SCALE : 0);
  out.push(auction && auction.leaderId === seat ? 1 : 0);
  if (opts.obsGlobalV2) appendGlobalV2(out, state, seat, auction);
  return out;
}

/** Expected 2d6 total. Utilities are the only rent that depends on the roll, so
 *  the capacity feature values them at the MEAN roll — the expected collection
 *  per landing — rather than a best/worst case, matching how the other rents are
 *  already the exact amount a landing would charge. */
export const EXPECTED_DICE_TOTAL = 7;

/** Dollars-per-landing that `id`'s holdings can currently collect: Σ over the
 *  ownables they own of the CURRENT effective rent, where a MORTGAGED property
 *  contributes exactly 0 (Monopoly: a mortgaged property collects no rent).
 *
 *  Rent comes from the engine's own `rentAt` — the same pure core `rentDue`
 *  charges through on a landing — so house/hotel levels, the unimproved-full-set
 *  doubling, and railroad-count scaling can never diverge from charged rent.
 *  A utility's dice-multiplier rent is resolved at `EXPECTED_DICE_TOTAL`. */
export function rentCapacity(state: GameState, id: string): number {
  let total = 0;
  for (const pos of ASSET_POSITIONS) {
    if (state.ownership[pos] !== id) continue;
    if (state.mortgaged[pos] === true) continue;
    const rent = rentAt(state, pos);
    if (rent === null) continue;
    total +=
      rent.kind === "dollars" ? rent.amount : rent.multiplier * EXPECTED_DICE_TOTAL;
  }
  return total;
}

/** Per-player feature width (`PF`): present, cash, net, position, inJail — plus a
 *  net-worth-share feature when `obsNwShare` is on and a
 *  (rent-capacity, rent-capacity-share) pair when `obsRentCapacity` is on.
 *  `nwShareDenom` / `rentDenom` are the precomputed Σ over live seats of
 *  max(netWorth,0) / rentCapacity; a non-positive denom (every live seat at ≤0
 *  net worth, or nobody able to collect any rent) makes the share 0 so the
 *  feature stays finite and bounded [0,1]. */
function playerRow(
  state: GameState,
  id: string | undefined,
  opts: EncodeOptions,
  nwShareDenom: number,
  rentDenom: number,
): number[] {
  const empty = (): number[] => new Array<number>(playerWidth(opts)).fill(0);
  if (id === undefined) return empty();
  const player = state.players.find((p) => p.id === id);
  if (player === undefined || player.bankrupt) return empty();
  const nw = netWorth(state, player.id);
  const row = [1, player.cash / MONEY_SCALE, nw / MONEY_SCALE, player.position / 39, player.inJail ? 1 : 0];
  if (opts.obsNwShare) row.push(nwShareDenom > 0 ? Math.max(nw, 0) / nwShareDenom : 0);
  if (opts.obsRentCapacity) {
    const cap = rentCapacity(state, player.id);
    row.push(cap / MONEY_SCALE);
    row.push(rentDenom > 0 ? cap / rentDenom : 0);
  }
  return row;
}

/** The 8×PF seat-relative player matrix and its present mask. */
function playerMatrix(
  state: GameState,
  seat: string,
  opts: EncodeOptions = {},
): { players: number[][]; present: boolean[] } {
  const order = seatOrder(state, seat);
  // Net-worth-share denominator (computed once, shared by every row): Σ over live
  // seats of max(netWorth,0). Only needed when the feature is on. Negatives clamp
  // to 0 so a seat in debt contributes nothing and the share can't go out of [0,1].
  let nwShareDenom = 0;
  if (opts.obsNwShare) {
    for (const p of state.players) {
      if (!p.bankrupt) nwShareDenom += Math.max(netWorth(state, p.id), 0);
    }
  }
  // Rent-capacity share denominator, same shape: Σ over live seats of their
  // current rent capacity. Capacity is already ≥0, so no clamp is needed.
  let rentDenom = 0;
  if (opts.obsRentCapacity) {
    for (const p of state.players) {
      if (!p.bankrupt) rentDenom += rentCapacity(state, p.id);
    }
  }
  const players: number[][] = [];
  const present: boolean[] = [];
  for (let slot = 0; slot < MAX_SEATS; slot++) {
    const row = playerRow(state, order[slot], opts, nwShareDenom, rentDenom);
    players.push(row);
    present.push(row[0] === 1);
  }
  return { players, present };
}

/** One ownable asset row's DYNAMIC features (seat-relative): the owner one-hot
 *  across 8 seats (0 = me), an "unowned" bit, mortgaged, and the development
 *  level. GOJF rows reuse the owner one-hot + unowned bit and zero the
 *  property-only mortgaged / houses slots. `AF` is this row's length. */
function ownerOneHot(ownerSlot: number): number[] {
  const oneHot = new Array<number>(MAX_SEATS).fill(0);
  if (ownerSlot >= 0 && ownerSlot < MAX_SEATS) oneHot[ownerSlot] = 1;
  return oneHot;
}

function ownableRow(state: GameState, seat: string, pos: number): number[] {
  const ownerSlot = ownerSeatSlot(state, seat, pos);
  return [
    ...ownerOneHot(ownerSlot), // 8: seat-relative owner one-hot
    ownerSlot < 0 ? 1 : 0, // unowned
    state.mortgaged[pos] === true ? 1 : 0, // mortgaged
    (state.houses[pos] ?? 0) / 5, // development level
  ];
}

function gojfRow(state: GameState, seat: string, source: "chance" | "communityChest"): number[] {
  const holder = state.jailFreeCards[source];
  let slot = -1;
  if (holder !== undefined) {
    const order = seatOrder(state, seat);
    slot = order.findIndex((id) => id === holder);
    const player = state.players.find((p) => p.id === holder);
    if (player?.bankrupt) slot = -1;
  }
  return [
    ...ownerOneHot(slot), // 8: seat-relative holder one-hot
    slot < 0 ? 1 : 0, // unheld
    0, // mortgaged (n/a)
    0, // development (n/a)
  ];
}

/** The 30×AF asset matrix: rows 0..27 ownables (board order), 28..29 GOJF. */
function assetMatrix(state: GameState, seat: string): number[][] {
  const rows: number[][] = ASSET_POSITIONS.map((pos) =>
    ownableRow(state, seat, pos),
  );
  for (const { source } of GOJF_ROWS) rows.push(gojfRow(state, seat, source));
  return rows;
}

/** Per-player feature width. */
export const PLAYER_FEATURES = 5;
/** Per-asset feature width: 8 owner one-hot + unowned + mortgaged + houses. */
export const ASSET_FEATURES = MAX_SEATS + 3;
/** Global feature width: 11 phase + 9 context scalars. */
export const GLOBAL_FEATURES = PHASES.length + 9;

/** Full global width for mode v2 (legacy + the appended block). */
export const GLOBAL_FEATURES_V2 = GLOBAL_FEATURES + GLOBAL_V2_EXTRA;

/** Global feature width `G` for the selected obs mode — the single source the
 *  handshake dims and the encoders both derive from. */
export function globalWidth(opts: EncodeOptions = {}): number {
  return opts.obsGlobalV2 ? GLOBAL_FEATURES_V2 : GLOBAL_FEATURES;
}

/** Per-player feature width `PF` for the selected obs mode — the single source
 *  the handshake dims (`obsSpec`/`featLayout`/`specV2`) and the `playerRow`
 *  encoder both derive from, so the packed blob and `G`/`PF` can never disagree.
 *  +1 when `obsNwShare` appends the relative net-worth-share feature, +2 when
 *  `obsRentCapacity` appends the (capacity, capacity-share) pair. */
export function playerWidth(opts: EncodeOptions = {}): number {
  return (
    PLAYER_FEATURES + (opts.obsNwShare ? 1 : 0) + (opts.obsRentCapacity ? 2 : 0)
  );
}

/** The full structured observation for one seat at one decision point — the
 *  per-decision `obs` item the worker serializes (CONTRACT). Seat-relative, pure,
 *  fixed-shape. `reward` / `done` / `env` / `seat` / `version` are added by the
 *  worker around this payload. */
export interface RlObservation {
  phase: TurnPhase;
  global: number[];
  players: number[][];
  assets: number[][];
  present: boolean[];
  assetLegal: boolean[][];
  globalMask: boolean[];
  manageMask: boolean[][];
  head: Head;
}

/** Build the structured observation for `seat`. Pure & deterministic. `opts`
 *  selects optional obs blocks (default = the legacy byte-identical observation). */
export function encodeRl(
  state: GameState,
  seat: string,
  opts: EncodeOptions = {},
): RlObservation {
  const { players, present } = playerMatrix(state, seat, opts);
  return {
    phase: state.turn.phase,
    global: globalVector(state, seat, opts),
    players,
    assets: assetMatrix(state, seat),
    present,
    assetLegal: assetLegal(state, seat),
    globalMask: globalMask(state, seat),
    manageMask: manageMask(state, seat),
    head: headFor(state, seat),
  };
}

/** The dims block for the `spec` handshake — TS is the source of truth
 *  (CONTRACT). Built from the same constants the encoders use, so it can never
 *  disagree with the observation it describes. */
export interface ObsSpec {
  global: number;
  player: number;
  asset: number;
  max_seats: number;
  num_assets: number;
  num_props: number;
}

export interface ActionSpec {
  global_tokens: readonly string[];
  asset_dests: number;
  manage_ops: number;
  cash_dim: number;
  /** How the manage head's 28 per-property columns combine: `"independent"` = 28
   *  separate categoricals sampled together into ONE plan per transition. Carried
   *  explicitly because `manage_ops` is unchanged by the shape, so head WIDTH
   *  alone cannot tell the Python action-geometry guard which one it is building. */
  manage_select: "one" | "independent";
}

export function obsSpec(opts: EncodeOptions = {}): ObsSpec {
  return {
    global: globalWidth(opts),
    player: playerWidth(opts),
    asset: ASSET_FEATURES,
    max_seats: MAX_SEATS,
    num_assets: NUM_ASSETS,
    num_props: NUM_PROPS,
  };
}

export function actionSpec(): ActionSpec {
  return {
    global_tokens: GLOBAL_TOKENS,
    asset_dests: ASSET_DESTS,
    manage_ops: MANAGE_OPS.length,
    cash_dim: MAX_SEATS,
    manage_select: "independent",
  };
}

// ---------------------------------------------------------------------------
// Spec handshake v2 — the declarative entity/head schema (DESIGN §2.2). Emitted
// ALONGSIDE the v1 fields (`spec_v2` on the spec message); nothing consumes it
// yet. Built from the SAME action-space constants as the v1 emitters, so the
// two blocks can never disagree. The Python mirror is
// py/action_schema.monopoly_spec_v2(); the equivalence gates live in
// py/tests/test_schema_v2.py and spec-v2.test.ts.
// ---------------------------------------------------------------------------

export interface EntitySpecV2 {
  name: string;
  count: number;
  feat: number;
  /** "mask" => a bool[count] present field; "all" => every row always present. */
  presence: "mask" | "all";
  /** Add a learned identity Embedding(count, d) indexed by row. */
  identity_embedding: boolean;
  /** The row carrying the acting agent (exactly one entity sets it). */
  self_row?: number;
}

export interface CategoricalHeadV2 {
  name: string;
  type: "categorical";
  tokens: readonly string[];
  mask: string;
}

export interface EntityPointerHeadV2 {
  name: string;
  type: "entity_pointer";
  entity: string;
  null_token: boolean;
  mask: string;
}

export interface PerEntityCategoricalHeadV2 {
  name: string;
  type: "per_entity_categorical";
  entity: string;
  /** PREFIX of entity.count; omitted => entity.count. */
  rows?: number;
  /** Fixed op vocabulary (XOR dest_entity). */
  ops?: readonly string[];
  /** Ops axis = another entity's rows, scored pairwise (XOR ops). */
  dest_entity?: string;
  /** + a learned null column (last col). */
  null_token?: boolean;
  /** "one": ONE flattened Categorical over rows*n_ops, ROW-MAJOR flat =
   *  row*n_ops + op. "independent": per-row Categoricals, log-probs summed. */
  select: "one" | "independent";
  /** The distribution's all-illegal-row fixup forces the null column legal. */
  null_always_legal?: boolean;
  mask: string;
}

export interface GaussianHeadV2 {
  name: string;
  type: "gaussian";
  /** "per_entity": mean = MLP(row_emb ⊕ c) per included row of `entity`. */
  conditioning: "context" | "per_entity";
  entity: string;
  /** Rows exclude the acting agent's self row (slots resolved at net build). */
  exclude_self_row: boolean;
  /** "zero_sum_derived_slot": self slot = -Σ(others), no density, zero-padded
   *  to wire_dim on the wire. */
  constraint: "none" | "zero_sum_derived_slot";
  /** Full wire vector width. */
  wire_dim: number;
  log_std: "global_param";
}

export type HeadSpecV2 =
  | CategoricalHeadV2
  | EntityPointerHeadV2
  | PerEntityCategoricalHeadV2
  | GaussianHeadV2;

export interface GroupSpecV2 {
  name: string;
  heads: readonly string[];
  /** A GATED group: its heads are sampled on every transition but only APPLY when
   *  `head` emitted `token`. The learner must still store what it sampled (the
   *  wire carries it unconditionally, or store and re-evaluation disagree) and
   *  zero the group's log-prob contribution on the transitions where the gate did
   *  not fire. Absent ⇒ the group is routed by `obs.head` as usual. */
  gate?: { head: string; token: string };
}

export interface AuxSpecV2 {
  ngu_action_head: string;
  novelty_entities: readonly string[];
  icm_action_heads: readonly string[];
  inv_freq_heads: readonly { head: string; axis: "tokens" | "ops" }[];
  telemetry_tokens: readonly string[];
}

export interface SpecV2 {
  schema_version: 2;
  obs: { global_feat: number; entities: EntitySpecV2[] };
  action: { groups: GroupSpecV2[]; heads: HeadSpecV2[] };
  aux: AuxSpecV2;
  feat_layout: FeatLayout;
}

/** The Monopoly schema expressed in spec v2: 4 heads, 3 groups (group index ==
 *  group id, matching the v1 head ids global=0 / manage=1 / trade=2). Head list
 *  order is load-bearing (RNG construction/sampling order, slab field order). */
export function specV2(opts: EncodeOptions = {}): SpecV2 {
  return {
    schema_version: 2,
    obs: {
      global_feat: globalWidth(opts),
      entities: [
        {
          name: "player",
          count: MAX_SEATS,
          feat: playerWidth(opts),
          presence: "mask",
          identity_embedding: false,
          self_row: 0,
        },
        {
          name: "asset",
          count: NUM_ASSETS,
          feat: ASSET_FEATURES,
          presence: "all",
          identity_embedding: true,
        },
      ],
    },
    action: {
      groups: [
        { name: "global", heads: ["global"] },
        // The manage group is GATED, not routed: its plan rides on the same
        // transition as the global token and applies only when that token is
        // ARM_MANAGE. The group keeps id 1 — it still exists and is still sampled
        // every transition; only the way it is SELECTED changed.
        {
          name: "manage",
          heads: ["manage"],
          gate: { head: "global", token: "ARM_MANAGE" },
        },
        { name: "trade", heads: ["trade_dest", "trade_cash"] },
      ],
      heads: [
        {
          name: "global",
          type: "categorical",
          tokens: GLOBAL_TOKENS,
          mask: "global_mask",
        },
        {
          name: "manage",
          type: "per_entity_categorical",
          entity: "asset",
          rows: NUM_PROPS,
          ops: MANAGE_OPS,
          select: "independent",
          null_token: false,
          null_always_legal: true,
          mask: "manage_mask",
        },
        {
          name: "trade_dest",
          type: "per_entity_categorical",
          entity: "asset",
          dest_entity: "player",
          null_token: true,
          select: "independent",
          null_always_legal: true,
          mask: "asset_legal",
        },
        {
          name: "trade_cash",
          type: "gaussian",
          conditioning: "per_entity",
          entity: "player",
          exclude_self_row: true,
          constraint: "zero_sum_derived_slot",
          wire_dim: MAX_SEATS,
          log_std: "global_param",
        },
      ],
    },
    aux: {
      ngu_action_head: "global",
      novelty_entities: ["asset"],
      icm_action_heads: ["global", "manage"],
      inv_freq_heads: [
        { head: "global", axis: "tokens" },
        { head: "manage", axis: "ops" },
      ],
      telemetry_tokens: ["ROLL", "BUY", "ARM_MANAGE"],
    },
    feat_layout: featLayout(opts),
  };
}

// ---------------------------------------------------------------------------
// Flat `feat` blob — the per-obs wire encoding (perf optimization). Sending the
// obs arrays as NESTED msgpack arrays makes the Python decoder materialize ~13M
// per-element objects per iteration. Instead every obs item carries ONE binary
// `feat` field (a msgpack `bin`) the Python side can `np.frombuffer` with zero
// per-element objects. The byte layout is FIXED and derived entirely from the
// dims already in the `spec` message, so the two sides can never drift:
//
//   float32 section (LITTLE-ENDIAN), in order:
//     global            G                       floats
//     players (r-major) max_seats × PF          floats
//     assets  (r-major) num_assets × AF         floats
//   uint8 section (1 byte/bool, 0|1), in order:
//     present           max_seats               bytes
//     asset_legal (r-m) num_assets × ASSET_DESTS bytes
//     global_mask       GLOBAL_TOKENS           bytes
//     manage_mask (r-m) num_props × MANAGE_OPS  bytes
//
//   byte_length = 4*(G + max_seats*PF + num_assets*AF)
//               + (max_seats + num_assets*ASSET_DESTS + GLOBAL_TOKENS + num_props*MANAGE_OPS)
//
// `featLayout()` echoes this descriptor in the `spec` message so Python validates
// the offsets rather than assuming them.
// ---------------------------------------------------------------------------

/** One field within the `feat` blob — a flat vector (`count`) or a row-major
 *  matrix (`rows`×`cols`, with `count = rows*cols`). */
export interface FeatField {
  name: string;
  count: number;
  rows?: number;
  cols?: number;
}

/** The `feat` byte-layout descriptor (echoed in `spec.feat_layout`). All counts
 *  are derived from the obs/action dims, so they cannot disagree with the blob. */
export interface FeatLayout {
  /** Total float32 values in the float section. */
  float_count: number;
  /** Total uint8 (bool) values in the bool section. */
  bool_count: number;
  /** Total blob size: `4*float_count + bool_count`. */
  byte_length: number;
  /** Float section fields, in packed order. */
  float_fields: FeatField[];
  /** Bool section fields, in packed order. */
  bool_fields: FeatField[];
}

export function featLayout(opts: EncodeOptions = {}): FeatLayout {
  const o = obsSpec(opts);
  const a = actionSpec();
  const float_fields: FeatField[] = [
    { name: "global", count: o.global },
    { name: "players", rows: o.max_seats, cols: o.player, count: o.max_seats * o.player },
    { name: "assets", rows: o.num_assets, cols: o.asset, count: o.num_assets * o.asset },
  ];
  const bool_fields: FeatField[] = [
    { name: "present", count: o.max_seats },
    {
      name: "asset_legal",
      rows: o.num_assets,
      cols: a.asset_dests,
      count: o.num_assets * a.asset_dests,
    },
    { name: "global_mask", count: a.global_tokens.length },
    {
      name: "manage_mask",
      rows: o.num_props,
      cols: a.manage_ops,
      count: o.num_props * a.manage_ops,
    },
  ];
  const float_count = float_fields.reduce((s, f) => s + f.count, 0);
  const bool_count = bool_fields.reduce((s, f) => s + f.count, 0);
  return {
    float_count,
    bool_count,
    byte_length: 4 * float_count + bool_count,
    float_fields,
    bool_fields,
  };
}

/** The structured arrays a `feat` blob packs / unpacks to (camelCase, matching
 *  `RlObservation`). */
export interface FeatArrays {
  global: readonly number[];
  players: readonly (readonly number[])[];
  assets: readonly (readonly number[])[];
  present: readonly boolean[];
  assetLegal: readonly (readonly boolean[])[];
  globalMask: readonly boolean[];
  manageMask: readonly (readonly boolean[])[];
}

/** Pack an obs's arrays into the fixed `feat` blob (float32 LE section then
 *  uint8 bool section). Floats are written via `DataView` with explicit
 *  little-endian so the bytes match `np.frombuffer(..., '<f4')` on any host. */
export function packFeat(obs: FeatArrays, opts: EncodeOptions = {}): Uint8Array {
  const layout = featLayout(opts);
  const out = new Uint8Array(layout.byte_length);
  const view = new DataView(out.buffer);
  let off = 0;
  const putF = (x: number): void => {
    view.setFloat32(off, x, true);
    off += 4;
  };
  for (const x of obs.global) putF(x);
  for (const row of obs.players) for (const x of row) putF(x);
  for (const row of obs.assets) for (const x of row) putF(x);
  // `off` is now 4*float_count — the start of the bool section.
  const putB = (v: boolean): void => {
    out[off++] = v ? 1 : 0;
  };
  for (const v of obs.present) putB(v);
  for (const row of obs.assetLegal) for (const v of row) putB(v);
  for (const v of obs.globalMask) putB(v);
  for (const row of obs.manageMask) for (const v of row) putB(v);
  return out;
}

/** The inverse of `packFeat` — reconstruct the structured arrays from a `feat`
 *  blob using the same layout. Provided for round-trip tests and as the canonical
 *  reference the Python decoder mirrors. */
export function unpackFeat(feat: Uint8Array, opts: EncodeOptions = {}): FeatArrays {
  const o = obsSpec(opts);
  const a = actionSpec();
  const layout = featLayout(opts);
  if (feat.length !== layout.byte_length) {
    throw new Error(
      `feat length ${feat.length.toString()} != expected ${layout.byte_length.toString()}`,
    );
  }
  // The blob may be a view into a larger buffer; honor its byteOffset.
  const view = new DataView(feat.buffer, feat.byteOffset, feat.byteLength);
  let off = 0;
  const takeF = (): number => {
    const x = view.getFloat32(off, true);
    off += 4;
    return x;
  };
  const vec = (n: number): number[] => Array.from({ length: n }, takeF);
  const mat = (rows: number, cols: number): number[][] =>
    Array.from({ length: rows }, () => vec(cols));

  const global = vec(o.global);
  const players = mat(o.max_seats, o.player);
  const assets = mat(o.num_assets, o.asset);
  // off is now 4*float_count; the bool section starts here.
  const takeB = (): boolean => feat[off++] !== 0;
  const bvec = (n: number): boolean[] => Array.from({ length: n }, takeB);
  const bmat = (rows: number, cols: number): boolean[][] =>
    Array.from({ length: rows }, () => bvec(cols));

  const present = bvec(o.max_seats);
  const assetLegal = bmat(o.num_assets, a.asset_dests);
  const globalMask = bvec(a.global_tokens.length);
  const manageMask = bmat(o.num_props, a.manage_ops);
  return { global, players, assets, present, assetLegal, globalMask, manageMask };
}

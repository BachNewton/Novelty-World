import { SPACES, TOTAL_HOTELS, TOTAL_HOUSES } from "../data";
import { bankSupply, groupPositions } from "../development";
import { firstNegativePlayer, netWorth } from "../engine";
import { ownablePrice } from "../logic";
import type { GameState, PropertyColor, TurnPhase } from "../types";

// ---------------------------------------------------------------------------
// Phase 1 of the learned-bot path (see monopoly/CLAUDE.md "Bots" and the design
// discussion): a PURE, fixed-size state encoder. `encode(state, playerId)` turns
// the full open-information `GameState` into a flat `Float32Array` a model can
// consume — the input half of a learned policy / value net. Its companion is
// `candidates.ts` (the action half).
//
// Three properties make this safe to train against:
//   - PURE & DETERMINISTIC. Same (state, playerId) → same vector, always. No
//     `Math.random`, no `Date`, no engine mutation — so it slots into the
//     deterministic-replay world the engine guarantees.
//   - FIXED WIDTH. Every state encodes to exactly `FEATURE_COUNT` floats,
//     regardless of player count (absent / bankrupt seats encode as zeros).
//   - SEAT-RELATIVE. Players are rotated so the encoded seat is ALWAYS slot 0,
//     and opponents follow in seat order after it. The net therefore learns ONE
//     symmetric value function ("how good is the position of slot 0?") instead of
//     a separate one per chair — the single biggest sample-efficiency win for a
//     turn-based game with rotational symmetry.
//
// The layout is a single source of truth (`LAYOUT`): one ordered list of named
// feature specs, each a `(ctx) => number`. `encode` evaluates them in order and
// `FEATURE_NAMES` reads their names off the SAME list, so the vector and its
// labels can never drift. Add or reorder a feature in `buildLayout` and both the
// width and the names follow automatically. Heavy per-state work (seat rotation,
// net-worth, per-group tallies) is computed ONCE in `makeCtx`; the specs are
// cheap lookups into it.
//
// This is intentionally a STARTING feature set, not a final one — it captures
// cash / net worth / board position / ownership / development / set structure,
// which is enough to train a first value net. Ownership is encoded PER OPPONENT:
// each square carries a seat-relative owner one-hot (slot 0 = me, slots 1…7 =
// opponents in seat order, all-zero = unowned), so the net can tell WHICH rival
// holds what — the information needed to value threats and target trades. Likely
// enrichments later: dice / rent exposure ("how much do I owe if I land where?"),
// trade-draft contents, and deck composition. Keep new features seat-relative and
// pure.
// ---------------------------------------------------------------------------

/** Cash / net-worth scale: dollars are divided by this so a typical balance
 *  lands around O(1). Values stay signed (negative cash encodes negative) and
 *  unclipped — a value net handles the tails fine, and clipping would erase the
 *  "deeply in the red" vs "barely negative" distinction the bust logic cares
 *  about. */
const MONEY_SCALE = 1000;

/** Seat slots the vector always reserves — the 8-hue player cap. A 2- or
 *  4-player game leaves the trailing slots zeroed (`present` = 0). Exported so the
 *  value net's per-seat win-probability head is the same fixed length. */
export const MAX_SEATS = 8;

/** All turn phases, in a fixed order, for the phase one-hot. Mirrors the
 *  `TurnPhase` union; a phase added there must be added here (the
 *  `features.test.ts` exhaustiveness check fails otherwise). */
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

/** The eight color groups, in board order. */
const COLORS: readonly PropertyColor[] = [
  "brown",
  "light-blue",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "dark-blue",
];

/** Every ownable square's board position (22 properties + 4 railroads + 2
 *  utilities), in board order — the per-square block iterates these. */
const OWNABLE_POSITIONS: readonly number[] = SPACES.flatMap((s, i) =>
  s.kind === "property" || s.kind === "railroad" || s.kind === "utility"
    ? [i]
    : [],
);

/** A "set" the position-value of a monopoly hinges on: the 8 color groups plus
 *  the railroad and utility groups. Used for the per-group structural features
 *  (who's how close to completing each set). */
interface Group {
  label: string;
  positions: readonly number[];
}

const GROUPS: readonly Group[] = [
  ...COLORS.map((c) => ({ label: c, positions: groupPositions(c) })),
  {
    label: "railroad",
    positions: SPACES.flatMap((s, i) => (s.kind === "railroad" ? [i] : [])),
  },
  {
    label: "utility",
    positions: SPACES.flatMap((s, i) => (s.kind === "utility" ? [i] : [])),
  },
];

/** One seat's encoded stats (already seat-relative and normalized). An absent or
 *  bankrupt seat is all-zero with `present` = 0. */
interface SeatInfo {
  present: number;
  cash: number;
  net: number;
  position: number;
  inJail: number;
}

/** One group's structural stats from the encoded seat's point of view. */
interface GroupInfo {
  /** Fraction of the group the encoded seat owns (0…1). */
  myFrac: number;
  /** The single most-threatening opponent's fraction of the group (0…1) — how
   *  close any rival is to completing this set. */
  bestOppFrac: number;
  /** 1 iff the encoded seat owns the whole group. */
  myMonopoly: number;
}

/** Everything `encode` needs, computed once per call so the per-feature specs
 *  are O(1) lookups rather than re-scanning state 200×. */
interface Ctx {
  state: GameState;
  meId: string;
  phaseIndex: number;
  progress: number;
  bankHouses: number;
  bankHotels: number;
  pendingPresent: number;
  pendingPrice: number;
  activeIsMe: number;
  iAmDebtor: number;
  /** Seat-relative slot (0 = me, 1…n-1 = opponents in seat order) for every
   *  player id, so a square's owner maps to a one-hot owner slot. */
  slotOf: ReadonlyMap<string, number>;
  seats: readonly SeatInfo[];
  groups: readonly GroupInfo[];
}

/** Per-group ownership tally from `meId`'s perspective. */
function groupInfo(state: GameState, meId: string, group: Group): GroupInfo {
  const size = group.positions.length;
  const byOwner = new Map<string, number>();
  let mine = 0;
  for (const pos of group.positions) {
    const owner = state.ownership[pos];
    if (!owner) continue;
    if (owner === meId) mine++;
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1);
  }
  let bestOpp = 0;
  for (const [owner, count] of byOwner) {
    if (owner !== meId && count > bestOpp) bestOpp = count;
  }
  return {
    myFrac: mine / size,
    bestOppFrac: bestOpp / size,
    myMonopoly: mine === size ? 1 : 0,
  };
}

/** Seat-relative slot for every player id: 0 = the encoded seat, then opponents
 *  in seat order. The same rotation `makeSeats` uses, exposed as an id→slot map so
 *  a square's owner can be encoded as a one-hot over slots. Players past the
 *  `MAX_SEATS` cap (impossible at 8 hues, but guarded) are omitted. */
function seatSlots(state: GameState, meId: string): Map<string, number> {
  const players = state.players;
  const myIndex = players.findIndex((p) => p.id === meId);
  const n = players.length;
  const map = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const slot = (i - myIndex + n) % n;
    if (slot < MAX_SEATS) map.set(players[i].id, slot);
  }
  return map;
}

/** Rotate seats so `meId` is slot 0 and opponents follow in seat order, then
 *  encode each (zeros for absent / bankrupt). This rotation is what makes the
 *  encoding seat-symmetric. */
function makeSeats(state: GameState, meId: string): SeatInfo[] {
  const players = state.players;
  const myIndex = players.findIndex((p) => p.id === meId);
  const n = players.length;
  const seats: SeatInfo[] = [];
  for (let slot = 0; slot < MAX_SEATS; slot++) {
    const player = slot < n ? players[(myIndex + slot) % n] : undefined;
    if (player === undefined || player.bankrupt) {
      seats.push({ present: 0, cash: 0, net: 0, position: 0, inJail: 0 });
      continue;
    }
    seats.push({
      present: 1,
      cash: player.cash / MONEY_SCALE,
      net: netWorth(state, player.id) / MONEY_SCALE,
      position: player.position / 39,
      inJail: player.inJail ? 1 : 0,
    });
  }
  return seats;
}

function makeCtx(state: GameState, meId: string): Ctx {
  const supply = bankSupply(state);
  const pending = state.turn.pendingBuy;
  const debtor = firstNegativePlayer(state);
  return {
    state,
    meId,
    phaseIndex: PHASES.indexOf(state.turn.phase),
    progress: state.turns.length / 100,
    bankHouses: supply.houses / TOTAL_HOUSES,
    bankHotels: supply.hotels / TOTAL_HOTELS,
    pendingPresent: pending !== undefined ? 1 : 0,
    pendingPrice:
      pending !== undefined ? (ownablePrice(pending) ?? 0) / 400 : 0,
    activeIsMe: state.turn.playerId === meId ? 1 : 0,
    iAmDebtor: debtor === meId ? 1 : 0,
    slotOf: seatSlots(state, meId),
    seats: makeSeats(state, meId),
    groups: GROUPS.map((g) => groupInfo(state, meId, g)),
  };
}

/** One slot in the feature vector: its stable `name` (for debugging / feature
 *  attribution) and how to read its value from a `Ctx`. */
interface FeatureSpec {
  name: string;
  get: (c: Ctx) => number;
}

/** The ordered feature layout — the single source of truth for both the vector
 *  and `FEATURE_NAMES`. Blocks: global/turn → per-ownable-square → per-group →
 *  per-seat. */
function buildLayout(): FeatureSpec[] {
  const layout: FeatureSpec[] = [];

  // Global / turn context.
  PHASES.forEach((phase, i) =>
    layout.push({ name: `phase:${phase}`, get: (c) => (c.phaseIndex === i ? 1 : 0) }),
  );
  layout.push({ name: "progress", get: (c) => c.progress });
  layout.push({ name: "bank:houses", get: (c) => c.bankHouses });
  layout.push({ name: "bank:hotels", get: (c) => c.bankHotels });
  layout.push({ name: "pendingBuy:present", get: (c) => c.pendingPresent });
  layout.push({ name: "pendingBuy:price", get: (c) => c.pendingPrice });
  layout.push({ name: "active:isMe", get: (c) => c.activeIsMe });
  layout.push({ name: "debtor:isMe", get: (c) => c.iAmDebtor });

  // Per ownable square (board order): a SEAT-RELATIVE owner one-hot (slot 0 = me,
  // slots 1…7 = opponents in seat order; all-zero = unowned), plus mortgage and
  // development. The per-opponent one-hot is what lets the net see WHICH rival
  // holds a square, not just "an opponent" — needed to value threats and trades.
  OWNABLE_POSITIONS.forEach((pos) => {
    for (let slot = 0; slot < MAX_SEATS; slot++) {
      layout.push({
        name: `sq${pos}:owner${slot}`,
        get: (c) => {
          const owner = c.state.ownership[pos];
          return owner && c.slotOf.get(owner) === slot ? 1 : 0;
        },
      });
    }
    layout.push({
      name: `sq${pos}:mortgaged`,
      get: (c) => (c.state.mortgaged[pos] === true ? 1 : 0),
    });
    layout.push({
      name: `sq${pos}:houses`,
      get: (c) => (c.state.houses[pos] ?? 0) / 5,
    });
  });

  // Per group: how close I am, and how close the most-threatening rival is.
  GROUPS.forEach((group, gi) => {
    layout.push({ name: `grp:${group.label}:myFrac`, get: (c) => c.groups[gi].myFrac });
    layout.push({ name: `grp:${group.label}:oppFrac`, get: (c) => c.groups[gi].bestOppFrac });
    layout.push({ name: `grp:${group.label}:myMono`, get: (c) => c.groups[gi].myMonopoly });
  });

  // Per seat, seat-relative (slot 0 = me).
  for (let slot = 0; slot < MAX_SEATS; slot++) {
    layout.push({ name: `seat${slot}:present`, get: (c) => c.seats[slot].present });
    layout.push({ name: `seat${slot}:cash`, get: (c) => c.seats[slot].cash });
    layout.push({ name: `seat${slot}:net`, get: (c) => c.seats[slot].net });
    layout.push({ name: `seat${slot}:pos`, get: (c) => c.seats[slot].position });
    layout.push({ name: `seat${slot}:jail`, get: (c) => c.seats[slot].inJail });
  }

  return layout;
}

const LAYOUT: readonly FeatureSpec[] = buildLayout();

/** Human-readable name of each feature, index-aligned with the `encode` vector.
 *  For debugging, feature attribution, and asserting layout stability in tests. */
export const FEATURE_NAMES: readonly string[] = LAYOUT.map((f) => f.name);

/** The fixed width of every encoded state. */
export const FEATURE_COUNT = LAYOUT.length;

/** Encode `state` from `playerId`'s seat into a fixed-width `Float32Array`
 *  (length `FEATURE_COUNT`). Seat-relative (the player is slot 0), pure, and
 *  deterministic — the model input for the learned-bot path. */
export function encode(state: GameState, playerId: string): Float32Array {
  const ctx = makeCtx(state, playerId);
  const out = new Float32Array(LAYOUT.length);
  for (let i = 0; i < LAYOUT.length; i++) out[i] = LAYOUT[i].get(ctx);
  return out;
}

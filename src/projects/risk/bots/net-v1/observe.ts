import { captureChance } from "../../blitz";
import { symbolOf, territoryOf } from "../../cards";
import type { CardSymbol, GameEvent, Options, Seat } from "../../contract";
import { ADJACENCY, CONTINENTS, TERRITORIES } from "../../map";
import type { BotInput } from "../bot";
import { roundsCompleted, turnSoFar } from "../history";
import { TURN_CAP } from "../turn-cap";
import { COUNT, IDS, indexOf } from "./actions";

// What net-v1 sees, exactly the trainer's observation (`gpu/riskgpu/selfplay/obs.py`, whose
// docstring explains it): per territory, per seat slot (slot 0 the seat deciding, slot k the seat k
// places after it in turn order) and the globals, built from the seat's view, its options and its
// redacted history alone. The public facts the view doesn't carry (this turn's attacks, captures and
// placements, the round, the reinforce phase's bookkeeping) are read from the history, as `sim.ts`
// reads them. Every value is the float32 the trainer computes: each operation rounded to float32 as
// it is there (`Math.fround` of a float64 operation on float32 operands is the float32 operation).
// A net that reads the clock sees `CLOCK` more globals, counting down to the harness's cap
// (`TURN_CAP`), the cap every evaluation of the trainer plays to. A net that reads the graph inputs
// sees `GRAPH_NODE`, `GRAPH_SLOT` and `GRAPH_GLOBAL` more after each group's others (the globals'
// after the clock), each worked out from the board the view shows.

export const NODE = 13;
export const SLOT = 7;
export const GLOBAL = 28;
export const CLOCK = 1;
export const GRAPH_NODE = 4;
export const GRAPH_SLOT = 8;
export const GRAPH_GLOBAL = 2;
export const SEATS = 6;
/** The Balanced Blitz table's bound the trainer reads a blitz's capture chance from. */
const BLITZ_BOUND = 32;

export interface Observation {
  /** `[42 × NODE]`, territories in map order, each `GRAPH_NODE` wider for a net that reads the graph inputs. */
  node: Float32Array;
  /** `[6 × SLOT]`, each `GRAPH_SLOT` wider with the graph inputs. */
  slot: Float32Array;
  /** `[GLOBAL]`, `CLOCK` more for a net that reads the clock and `GRAPH_GLOBAL` more with the graph inputs. */
  glob: Float32Array;
}

const f = Math.fround;
const SYMBOLS: readonly CardSymbol[] = ["infantry", "cavalry", "artillery"];
const KINDS: readonly Options["kind"][] = ["reinforce", "attack", "occupy", "fortify"];
const CONTINENT_MEMBERS = CONTINENTS.map((c) => ({ bonus: c.bonus, members: TERRITORIES.flatMap((t, i) => (t.continent === c.id ? [i] : [])) }));
const CONTINENT_OF = TERRITORIES.map((t) => CONTINENTS.findIndex((c) => c.id === t.continent));
const NEIGHBOURS = IDS.map((t) => ADJACENCY[t].map(indexOf));
let captureTable: Float32Array | null = null;

/** The capture chance of a blitz of `a` armies (at least 1) against `d`, as float32, a fight past the
 *  bound read scaled into it as the trainer does. */
function blitzChance(a: number, d: number): number {
  const b = BLITZ_BOUND;
  if (captureTable === null) {
    captureTable = new Float32Array((b + 1) * (b + 1));
    for (let x = 1; x <= b; x++) for (let y = 1; y <= b; y++) captureTable[x * (b + 1) + y] = captureChance(x, y);
  }
  const most = Math.max(a, d);
  const scaled = (n: number): number => (most <= b ? n : Math.min(b, Math.max(1, Math.floor((n * b + Math.floor(most / 2)) / most))));
  return captureTable[scaled(a) * (b + 1) + scaled(d)];
}

/** `log1p(x) / 4` in float32, the trainer's scale for a count of armies. */
function armiesScale(x: number): number {
  return f(Math.log1p(x)) / 4;
}

/** The graph inputs (`obs.py`'s docstring), written after each group's others: per territory at
 *  `node[t × nodeWidth + NODE]`, per slot at `slot[k × slotWidth + SLOT]` and the globals at `globAt`. */
function graphInputs(owner: readonly Seat[], armies: readonly number[], me: Seat, seatOfSlot: readonly Seat[], o: Observation, globAt: number): void {
  const nodeWidth = NODE + GRAPH_NODE;
  const slotWidth = SLOT + GRAPH_SLOT;
  const exposed = new Array<number>(COUNT).fill(0);
  let exposure = 0;
  let thin = 0;
  for (let t = 0; t < COUNT; t++) {
    let most = 0;
    let best = 0;
    let foes = 0;
    for (const n of NEIGHBOURS[t]) {
      if (owner[n] === owner[t]) continue;
      foes++;
      exposed[t] += armies[n];
      most = Math.max(most, armies[n]);
      if (armies[t] > 1) best = Math.max(best, blitzChance(armies[t] - 1, armies[n]));
    }
    const { members } = CONTINENT_MEMBERS[CONTINENT_OF[t]];
    const lacking = members.filter((u) => owner[u] !== owner[t]).length;
    const at = t * nodeWidth + NODE;
    o.node[at] = armiesScale(exposed[t]);
    o.node[at + 1] = armiesScale(most);
    o.node[at + 2] = f(lacking / members.length);
    o.node[at + 3] = best;
    if (owner[t] === me) {
      exposure += exposed[t];
      if (armies[t] === 1 && foes > 0) thin++;
    }
  }
  const bordering = new Set<number>();
  for (let t = 0; t < COUNT; t++) if (owner[t] === me) for (const n of NEIGHBOURS[t]) bordering.add(n);
  seatOfSlot.forEach((seat, k) => {
    const at = k * slotWidth + SLOT;
    CONTINENT_MEMBERS.forEach(({ members }, c) => {
      o.slot[at + c] = f(members.filter((u) => owner[u] === seat).length / members.length);
    });
    let near = 0;
    let nearArmies = 0;
    if (seat !== me) {
      for (const n of bordering) {
        if (owner[n] !== seat) continue;
        near++;
        nearArmies += armies[n];
      }
    }
    o.slot[at + CONTINENT_MEMBERS.length] = armiesScale(nearArmies);
    o.slot[at + CONTINENT_MEMBERS.length + 1] = f(near / 42);
  });
  o.glob[globAt] = armiesScale(exposure);
  o.glob[globAt + 1] = f(thin / 42);
}

/** `REINF-2`, `REINF-3`: max(3, ⌊owned / 3⌋) and every continent held whole. */
function reinforcements(owner: readonly Seat[], seat: Seat): number {
  const owned = owner.filter((o) => o === seat).length;
  let armies = Math.max(3, Math.floor(owned / 3));
  for (const c of CONTINENT_MEMBERS) if (c.members.every((t) => owner[t] === seat)) armies += c.bonus;
  return armies;
}

/** The reinforce phase in progress, read from the history: whether it has placed any armies yet,
 *  and whether it is the trade forced by taking a hand mid-attack (`ELIM-3`). */
function reinforcePhase(history: readonly GameEvent[]): { placedAny: boolean; afterElimination: boolean } | null {
  let phase: { placedAny: boolean; afterElimination: boolean } | null = null;
  for (const e of history) {
    if (e.kind === "phase") phase = e.phase === "reinforce" ? { placedAny: false, afterElimination: e.rule === "ELIM-3" } : null;
    else if (e.kind === "placed") {
      if (phase === null) throw new Error("the history places armies outside a reinforce phase");
      phase.placedAny = true;
    }
  }
  return phase;
}

function oneHot(out: Float32Array, at: number, k: number): void {
  out[at + k] = 1;
}

export function observe({ view, options, history }: BotInput, clock: boolean, graph = false): Observation {
  const nodeWidth = graph ? NODE + GRAPH_NODE : NODE;
  const slotWidth = graph ? SLOT + GRAPH_SLOT : SLOT;
  const node = new Float32Array(COUNT * nodeWidth);
  const slot = new Float32Array(SEATS * slotWidth);
  const glob = new Float32Array(GLOBAL + (clock ? CLOCK : 0) + (graph ? GRAPH_GLOBAL : 0));
  const players = view.seats.length;
  const me = view.active;
  if (view.viewer !== me) throw new Error(`net-v1 decides for the active seat ${me.toString()}, not seat ${String(view.viewer)}`);
  const hand = view.cards.hand ?? [];

  // Slots: the active seat first, then turn order round from it.
  const at = view.turnOrder.indexOf(me);
  const seatOfSlot = Array.from({ length: players }, (_, k) => view.turnOrder[(at + k) % players]);
  const slotOfSeat = new Map<Seat, number>(seatOfSlot.map((seat, k) => [seat, k]));

  const owner = IDS.map((t) => view.territories[t].owner);
  const armies = IDS.map((t) => view.territories[t].armies);
  const total = Math.max(1, armies.reduce((a, b) => a + b, 0));
  const turn = turnSoFar(history);
  const placed = new Set(turn.placedOn.map(indexOf));
  const pictured = new Set(hand.flatMap((c) => {
    const t = territoryOf(c);
    return t === null ? [] : [indexOf(t)];
  }));
  const occFrom = view.occupying ? indexOf(view.occupying.from) : -1;
  const occTo = view.occupying ? indexOf(view.occupying.to) : -1;

  for (let t = 0; t < COUNT; t++) {
    const o = t * nodeWidth;
    const slotOf = slotOfSeat.get(owner[t]);
    if (slotOf === undefined) throw new Error(`${IDS[t]}'s owner, seat ${owner[t].toString()}, isn't at the table`);
    oneHot(node, o, slotOf);
    const a = armies[t];
    node[o + 6] = f(Math.log1p(a)) / 4;
    node[o + 7] = f(Math.min(a, 60) / 20);
    node[o + 8] = f(f(a / total) * 10);
    node[o + 9] = placed.has(t) ? 1 : 0;
    node[o + 10] = t === occFrom ? 1 : 0;
    node[o + 11] = t === occTo ? 1 : 0;
    node[o + 12] = pictured.has(t) ? 1 : 0;
  }

  seatOfSlot.forEach((seat, k) => {
    const s = view.seats[seat];
    if (s.seat !== seat) throw new Error(`the view's seat ${seat.toString()} is listed as ${s.seat.toString()}`);
    const o = k * slotWidth;
    let territories = 0;
    let held = 0;
    for (let t = 0; t < COUNT; t++) {
      if (owner[t] !== seat) continue;
      territories++;
      held += armies[t];
    }
    slot[o] = 1;
    slot[o + 1] = s.eliminated ? 0 : 1;
    slot[o + 2] = f(territories / 42);
    slot[o + 3] = f(held / total);
    slot[o + 4] = f(s.handSize / 5);
    slot[o + 5] = s.eliminated ? 0 : f(reinforcements(owner, seat) / 20);
    slot[o + 6] = f(Math.min(held, 300) / 100);
  });

  const reinforce = options.kind === "reinforce" ? options : null;
  const phase = reinforcePhase(history);
  const mustTrade = reinforce?.mustTrade ?? false;
  const mayTrade = reinforce !== null && phase !== null && (phase.afterElimination ? mustTrade : !phase.placedAny);
  const occupy = options.kind === "occupy" ? options : null;
  const counts = [0, 0, 0, 0];
  for (const c of hand) {
    const symbol = symbolOf(c);
    counts[symbol === null ? 3 : SYMBOLS.indexOf(symbol)]++;
  }
  oneHot(glob, 0, KINDS.indexOf(options.kind));
  const values = [
    f((reinforce?.armiesToPlace ?? 0) / 20),
    reinforce?.mayPlace ? 1 : 0,
    mayTrade ? 1 : 0,
    mustTrade ? 1 : 0,
    (reinforce?.sets.length ?? 0) > 0 ? 1 : 0,
    f(view.cards.deck / 44),
    f(view.turn / 300),
    f(roundsCompleted(history) / 60),
    view.cardEarned ? 1 : 0,
    f(turn.attacks.length / 10),
    f(turn.captured.length / 10),
    f((occupy?.min ?? 0) / 20),
    f((occupy?.max ?? 0) / 40),
    f(view.cards.traded.length / 20),
    phase?.afterElimination ? 1 : 0,
    f(hand.length / 5),
    ...counts.map((n) => f(n / 3)),
  ];
  glob.set(values, 4);
  oneHot(glob, 4 + values.length, Math.min(3, Math.max(0, players - 3)));
  // The player-turns left before the cap, after this one.
  if (clock) glob[GLOBAL] = f(Math.max(0, TURN_CAP - view.turn) / 100);
  const obs = { node, slot, glob };
  if (graph) graphInputs(owner, armies, me, seatOfSlot, obs, clock ? GLOBAL + CLOCK : GLOBAL);
  return obs;
}

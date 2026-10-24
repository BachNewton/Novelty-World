import { symbolOf, territoryOf } from "../../cards";
import type { CardSymbol, GameEvent, Options, Seat } from "../../contract";
import { CONTINENTS, TERRITORIES } from "../../map";
import type { BotInput } from "../bot";
import { roundsCompleted, turnSoFar } from "../history";
import { COUNT, IDS, indexOf } from "./actions";

// What net-v1 sees, exactly the trainer's observation (`gpu/riskgpu/selfplay/obs.py`, whose
// docstring explains it): per territory, per seat slot (slot 0 the seat deciding, slot k the seat k
// places after it in turn order) and the globals, built from the seat's view, its options and its
// redacted history alone. The public facts the view doesn't carry (this turn's attacks, captures and
// placements, the round, the reinforce phase's bookkeeping) are read from the history, as `sim.ts`
// reads them. Every value is the float32 the trainer computes: each operation rounded to float32 as
// it is there (`Math.fround` of a float64 operation on float32 operands is the float32 operation).

export const NODE = 13;
export const SLOT = 7;
export const GLOBAL = 28;
export const SEATS = 6;

export interface Observation {
  /** `[42 × NODE]`, territories in map order. */
  node: Float32Array;
  /** `[6 × SLOT]`. */
  slot: Float32Array;
  /** `[GLOBAL]`. */
  glob: Float32Array;
}

const f = Math.fround;
const SYMBOLS: readonly CardSymbol[] = ["infantry", "cavalry", "artillery"];
const KINDS: readonly Options["kind"][] = ["reinforce", "attack", "occupy", "fortify"];
const CONTINENT_MEMBERS = CONTINENTS.map((c) => ({ bonus: c.bonus, members: TERRITORIES.flatMap((t, i) => (t.continent === c.id ? [i] : [])) }));

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

export function observe({ view, options, history }: BotInput): Observation {
  const node = new Float32Array(COUNT * NODE);
  const slot = new Float32Array(SEATS * SLOT);
  const glob = new Float32Array(GLOBAL);
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
    const o = t * NODE;
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
    const o = k * SLOT;
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
  return { node, slot, glob };
}

import { setValue, symbolOf, territoryOf } from "../../cards";
import type { CardSymbol, GameView, Move, Options } from "../../contract";
import { ATTACK, COUNT, EDGES, END_ATTACK, END_TURN, FORTIFY, IDS, indexOf, legalMain, OCCUPY, TRADE } from "../net-v1/actions";
import { SEATS } from "../net-v1/observe";
import type { TerritoryId } from "../../map";

// net-v2's action space, exactly the trainer's exact space (`gpu/riskgpu/selfplay/actions.py`, whose
// docstring has the table): net-v1's main choices with the move-in one choice, then an argument, one
// of `SLOTS` candidates, each a whole move.

export const SLOTS = 48;
/** A candidate's features: its kind, its count against its range, its trade. */
export const FEATURES = 22;
/** The global token's index among the network's 49. */
export const GLOBAL_TOKEN = COUNT + SEATS;

const NONE = 0;
const PLACE = 1;
const BATTLE = 2;
const BLITZ = 3;
const OCCUPYING = 4;
const FORTIFYING = 5;
const TRADING = 6;
const SYMBOLS: readonly CardSymbol[] = ["infantry", "cavalry", "artillery"];

/** The main choices the options allow (`legal_main(o, exact=True)`): the move-in is `OCCUPY` alone. */
export function legalMainExact(options: Options): Uint8Array {
  const legal = legalMain(options);
  legal[OCCUPY + 1] = legal[OCCUPY + 2] = 0;
  return legal;
}

/** The arguments of one main choice, `SLOTS` of them. */
export interface Candidates {
  legal: Uint8Array;
  /** `[SLOTS × FEATURES]`. */
  features: Float64Array;
  /** The two tokens the argument is read from. */
  context: readonly [number, number];
  /** Each candidate's own territory token (a trade's bonus territory), −1 for none. */
  token: Int32Array;
  moves: (Move | null)[];
}

/** `spread`: every count from `lo` to `hi` while they fit; past that, the `slots / 4` lowest and
 *  highest, the two either side of the middle, and the rest evenly between. */
export function spread(lo: number, hi: number, slots: number): { values: number[]; legal: boolean[] } {
  const width = Math.max(hi - lo + 1, 0);
  const end = Math.floor(slots / 4);
  const below = Math.floor((slots - 2 * end) / 2);
  const above = slots - 2 * end - below;
  const half = Math.floor(width / 2);
  const values: number[] = [];
  const legal: boolean[] = [];
  for (let i = 0; i < slots; i++) {
    if (width <= slots) {
      values.push(lo + i);
      legal.push(i < width);
      continue;
    }
    let offset: number;
    if (i < end) offset = i;
    else if (i >= slots - end) offset = width - (slots - i);
    else if (i < end + below) offset = end + Math.floor(((i - end) * Math.max(half - 1 - end, 0)) / (below - 1));
    else offset = half + Math.floor(((i - end - below) * Math.max(width - end - 1 - half, 0)) / (above - 1));
    values.push(lo + offset);
    legal.push(true);
  }
  return { values, legal };
}

/** The features of a count `n` of the range `lo` to `hi` (the trainer's `count_features`). */
function countFeatures(out: Float64Array, at: number, n: number, lo: number, hi: number): void {
  const up = Math.max(n - lo, 0);
  const down = Math.max(hi - n, 0);
  const counts = [n / 20, down / 20, Math.log1p(n) / 4, Math.log1p(up) / 4, Math.log1p(down) / 4, up / Math.max(hi - lo, 1), n === lo ? 1 : 0, n === hi ? 1 : 0, Math.log1p(hi - lo + 1) / 4];
  counts.forEach((v, k) => (out[at + 6 + k] = v));
}

/** The arguments of a main choice (`candidates`), for the view's active seat. */
export function candidates(main: number, options: Options, view: GameView): Candidates {
  const legal = new Uint8Array(SLOTS);
  const features = new Float64Array(SLOTS * FEATURES);
  const token = new Int32Array(SLOTS).fill(-1);
  const moves: (Move | null)[] = new Array<Move | null>(SLOTS).fill(null);
  const kinds = new Uint8Array(SLOTS);
  let context: readonly [number, number] = [GLOBAL_TOKEN, GLOBAL_TOKEN];

  const counted = (lo: number, hi: number, first: number, kind: number, move: (n: number) => Move): void => {
    const { values, legal: ok } = spread(lo, hi, SLOTS - first);
    values.forEach((n, i) => {
      const slot = first + i;
      if (!ok[i]) return;
      legal[slot] = 1;
      kinds[slot] = kind;
      moves[slot] = move(n);
      countFeatures(features, slot * FEATURES, n, lo, hi);
    });
  };
  const none = (move: Move): void => {
    legal[0] = 1;
    moves[0] = move;
  };

  if (options.kind === "reinforce" && main < TRADE) {
    const territory = IDS[main];
    context = [main, main];
    counted(1, options.armiesToPlace, 0, PLACE, (armies) => ({ kind: "place", territory, armies }));
  } else if (options.kind === "reinforce" && main === TRADE) {
    const owns = (t: TerritoryId | null): boolean => t !== null && view.territories[t].owner === view.active;
    let slot = 0;
    for (const cards of options.sets) {
      const qualifying = cards.map((c) => owns(territoryOf(c)));
      const owned = qualifying.filter(Boolean).length;
      for (let j = 0; j < 3; j++) {
        if (owned >= 2 ? !qualifying[j] : j !== 0) continue;
        if (slot < SLOTS) {
          const gets = owned >= 2 ? territoryOf(cards[j]) : owned === 1 ? territoryOf(cards[qualifying.indexOf(true)]) : null;
          const bonus = owned >= 2 ? territoryOf(cards[j]) : null;
          legal[slot] = 1;
          kinds[slot] = TRADING;
          moves[slot] = bonus === null ? { kind: "trade", cards } : { kind: "trade", cards, bonusTerritory: bonus };
          if (gets !== null) token[slot] = indexOf(gets);
          const at = slot * FEATURES + 15;
          const symbols = cards.map(symbolOf);
          features[at] = setValue(cards) / 10;
          features[at + 1] = gets === null ? 0 : 1;
          features[at + 2] = symbols.filter((s) => s === null).length / 3;
          SYMBOLS.forEach((s, k) => (features[at + 3 + k] = symbols.filter((x) => x === s).length / 3));
          features[at + 6] = owned / 3;
        }
        slot++;
      }
    }
  } else if (options.kind === "attack" && main >= ATTACK && main < END_ATTACK) {
    const [from, to] = EDGES[main - ATTACK];
    const option = options.attacks.find((a) => a.from === IDS[from] && a.to === IDS[to]);
    if (!option) throw new Error(`net-v2's attack ${main.toString()} is not among the options`);
    context = [from, to];
    legal[0] = 1;
    kinds[0] = BATTLE;
    moves[0] = { kind: "attack", from: IDS[from], to: IDS[to], dice: option.maxDice };
    features[6] = option.maxDice / 3;
    const source = view.territories[IDS[from]].armies;
    counted(1, source - 1, 1, BLITZ, (keepAtLeast) => ({ kind: "blitz", from: IDS[from], to: IDS[to], keepAtLeast }));
  } else if (options.kind === "attack" && main === END_ATTACK) {
    none({ kind: "end-attack" });
  } else if (options.kind === "occupy" && main === OCCUPY) {
    context = [indexOf(options.from), indexOf(options.to)];
    counted(options.min, options.max, 0, OCCUPYING, (armies) => ({ kind: "occupy", armies }));
  } else if (options.kind === "fortify" && main >= FORTIFY && main < END_TURN) {
    const pair = main - FORTIFY;
    const from = IDS[Math.floor(pair / COUNT)];
    const to = IDS[pair % COUNT];
    const option = options.moves.find((m) => m.from === from && m.to === to);
    if (!option) throw new Error(`net-v2's fortify ${main.toString()} is not among the options`);
    context = [Math.floor(pair / COUNT), pair % COUNT];
    counted(1, option.maxArmies, 0, FORTIFYING, (armies) => ({ kind: "fortify", from, to, armies }));
  } else if (options.kind === "fortify" && main === END_TURN) {
    none({ kind: "end-turn" });
  } else {
    throw new Error(`net-v2's choice ${main.toString()} is no move in a ${options.kind} decision`);
  }
  kinds.forEach((kind, slot) => {
    if (kind !== NONE) features[slot * FEATURES + kind - 1] = 1;
  });
  return { legal, features, context, token, moves };
}

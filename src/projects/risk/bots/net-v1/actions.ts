import { setValue, symbolOf, territoryOf } from "../../cards";
import type { CardId, GameView, Move, Options } from "../../contract";
import { ADJACENCY, TERRITORIES, type TerritoryId } from "../../map";

// net-v1's action space, exactly the trainer's (`gpu/riskgpu/selfplay/actions.py`): a decision is a
// main choice from one flat list masked by the options, then, for the moves that carry an amount,
// an amount bucket. The table of choices and buckets is that file's docstring.

export const IDS: readonly TerritoryId[] = TERRITORIES.map((t) => t.id);
export const COUNT = IDS.length;
const INDEX = new Map<TerritoryId, number>(IDS.map((t, i) => [t, i]));

export function indexOf(t: TerritoryId): number {
  const i = INDEX.get(t);
  if (i === undefined) throw new Error(`no territory "${String(t)}"`);
  return i;
}

/** The canonical directed borders: each territory in map order, each neighbour in its `ADJACENCY`
 *  order (the GPU board's `edges`). */
export const EDGES: readonly (readonly [number, number])[] = IDS.flatMap((from, i) => ADJACENCY[from].map((to) => [i, indexOf(to)] as const));
const EDGE_INDEX = new Map<number, number>(EDGES.map(([from, to], k) => [from * COUNT + to, k]));

function edgeIndex(from: TerritoryId, to: TerritoryId): number {
  const k = EDGE_INDEX.get(indexOf(from) * COUNT + indexOf(to));
  if (k === undefined) throw new Error(`${from} and ${to} don't border`);
  return k;
}

const PAIRS = COUNT * COUNT;
export const PLACE = 0;
export const TRADE = PLACE + COUNT;
export const ATTACK = TRADE + 1;
export const END_ATTACK = ATTACK + EDGES.length;
export const OCCUPY = END_ATTACK + 1;
export const FORTIFY = OCCUPY + 3;
export const END_TURN = FORTIFY + PAIRS;
export const MAIN = END_TURN + 1;
if (MAIN !== 1978) throw new Error(`net-v1's main choices are ${MAIN.toString()}, not the trainer's 1,978`);

/** How many amount buckets a main choice has: one (no amount) for most, three for a place or an
 *  attack, two for a fortify. */
export function amountBuckets(main: number): number {
  if (main < TRADE) return 3;
  if (main >= ATTACK && main < END_ATTACK) return 3;
  if (main >= FORTIFY && main < END_TURN) return 2;
  return 1;
}

/** The main choices the options allow (`legal_main`). */
export function legalMain(options: Options): Uint8Array {
  const legal = new Uint8Array(MAIN);
  switch (options.kind) {
    case "reinforce":
      if (options.mayPlace && options.armiesToPlace > 0) for (const t of options.ownTerritories) legal[PLACE + indexOf(t)] = 1;
      if (options.sets.length > 0) legal[TRADE] = 1;
      break;
    case "attack":
      for (const a of options.attacks) legal[ATTACK + edgeIndex(a.from, a.to)] = 1;
      legal[END_ATTACK] = 1;
      break;
    case "occupy":
      legal[OCCUPY] = legal[OCCUPY + 1] = legal[OCCUPY + 2] = 1;
      break;
    case "fortify":
      for (const m of options.moves) if (m.maxArmies > 0) legal[FORTIFY + indexOf(m.from) * COUNT + indexOf(m.to)] = 1;
      legal[END_TURN] = 1;
      break;
  }
  return legal;
}

/** The trade the `TRADE` choice plays (`trade_rule`): the most valuable set, then the one spending
 *  fewest wilds, then the first; its bonus territory the first of its cards' territories the seat
 *  owns when more than one qualifies (the engine's own choice when only one does). */
function tradeRule(sets: readonly (readonly [CardId, CardId, CardId])[], owns: (t: TerritoryId) => boolean): Move {
  let best = 0;
  let bestScore = -Infinity;
  sets.forEach((set, i) => {
    const score = setValue(set) * 8 - set.filter((c) => symbolOf(c) === null).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  const cards = sets[best];
  const choices = cards.map(territoryOf).filter((t): t is TerritoryId => t !== null && owns(t));
  return choices.length > 1 ? { kind: "trade", cards, bonusTerritory: choices[0] } : { kind: "trade", cards };
}

/** The engine move for a choice (`decode`), for the view's active seat. */
export function decode(main: number, amount: number, options: Options, view: GameView): Move {
  const half = (n: number) => Math.floor((n + 1) / 2);
  switch (options.kind) {
    case "reinforce": {
      if (main === TRADE) return tradeRule(options.sets, (t) => view.territories[t].owner === view.active);
      if (main >= TRADE) break;
      const n = options.armiesToPlace;
      return { kind: "place", territory: IDS[main], armies: Math.max(1, amount === 0 ? n : amount === 1 ? half(n) : 1) };
    }
    case "attack": {
      if (main === END_ATTACK) return { kind: "end-attack" };
      if (main < ATTACK || main > END_ATTACK) break;
      const [from, to] = EDGES[main - ATTACK];
      if (amount === 2) {
        const option = options.attacks.find((a) => a.from === IDS[from] && a.to === IDS[to]);
        if (!option) break;
        return { kind: "attack", from: IDS[from], to: IDS[to], dice: option.maxDice };
      }
      return { kind: "blitz", from: IDS[from], to: IDS[to], keepAtLeast: amount === 0 ? 1 : Math.max(1, Math.floor(view.territories[IDS[from]].armies / 2)) };
    }
    case "occupy": {
      const m = main - OCCUPY;
      if (m < 0 || m > 2) break;
      const { min, max } = options;
      return { kind: "occupy", armies: m === 0 ? min : m === 1 ? Math.max(min, Math.floor((min + max + 1) / 2)) : max };
    }
    case "fortify": {
      if (main === END_TURN) return { kind: "end-turn" };
      if (main < FORTIFY) break;
      const pair = main - FORTIFY;
      const from = IDS[Math.floor(pair / COUNT)];
      const to = IDS[pair % COUNT];
      const option = options.moves.find((m) => m.from === from && m.to === to);
      if (!option) break;
      return { kind: "fortify", from, to, armies: Math.max(1, amount === 1 ? half(option.maxArmies) : option.maxArmies) };
    }
  }
  throw new Error(`net-v1's choice ${main.toString()} is no move in a ${options.kind} decision`);
}

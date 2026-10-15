import type { GameView, Move, Seat } from "../contract";
import { ADJACENCY, TERRITORIES, type ContinentId, type TerritoryId } from "../map";
import type { Bot } from "./bot";
import { tradeMove } from "./random";

// A one-ply greedy bot: the simplest player with a plan, there so the measuring
// harness has something real to measure. It stacks its armies where it can
// attack, attacks wherever it has the bigger army, pushes toward the continent it
// holds most of, and pulls idle armies to the front. It looks no further ahead
// than the move in hand. Not v1: v1 is designed in `ideas/rule-bot-v1.md`.

const CONTINENT_OF = new Map<TerritoryId, ContinentId>(TERRITORIES.map((t) => [t.id, t.continent]));
const CONTINENT_SIZE = new Map<ContinentId, number>();
for (const t of TERRITORIES) CONTINENT_SIZE.set(t.continent, (CONTINENT_SIZE.get(t.continent) ?? 0) + 1);

/** How much of each continent `seat` holds, 0 to 1. */
function continentShares(view: GameView, seat: Seat): Map<ContinentId, number> {
  const held = new Map<ContinentId, number>();
  for (const t of TERRITORIES) {
    if (view.territories[t.id].owner === seat) held.set(t.continent, (held.get(t.continent) ?? 0) + 1);
  }
  const shares = new Map<ContinentId, number>();
  for (const [continent, size] of CONTINENT_SIZE) shares.set(continent, (held.get(continent) ?? 0) / size);
  return shares;
}

function enemyNeighbours(view: GameView, seat: Seat, t: TerritoryId): TerritoryId[] {
  return ADJACENCY[t].filter((n) => view.territories[n].owner !== seat);
}

function best<T>(items: readonly T[], score: (item: T) => number): T | null {
  let top: T | null = null;
  let topScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s > topScore) {
      top = item;
      topScore = s;
    }
  }
  return top;
}

/** The front territory to build on: the most armies over its weakest neighbour,
 *  leaning to the continent the seat holds most of. */
function stackTerritory(view: GameView, seat: Seat, own: readonly TerritoryId[]): TerritoryId {
  const shares = continentShares(view, seat);
  const armies = (t: TerritoryId) => view.territories[t].armies;
  const front = own.filter((t) => enemyNeighbours(view, seat, t).length > 0);
  const choice = best(front, (t) => {
    const weakest = Math.min(...enemyNeighbours(view, seat, t).map(armies));
    return armies(t) - weakest + 4 * (shares.get(CONTINENT_OF.get(t) as ContinentId) ?? 0);
  });
  return choice ?? own[0];
}

export const greedyBot: Bot = ({ seat, view, options }): Move => {
  const armies = (t: TerritoryId) => view.territories[t].armies;
  switch (options.kind) {
    case "setup-place":
      return { kind: "place", territory: stackTerritory(view, seat, options.ownTerritories), armies: 1 };

    case "reinforce": {
      if (options.sets.length > 0) {
        return tradeMove(options.sets[0], options.bonusTerritories, (choices) => choices[0]);
      }
      return { kind: "place", territory: stackTerritory(view, seat, options.ownTerritories), armies: options.armiesToPlace };
    }

    case "attack": {
      const shares = continentShares(view, seat);
      const worthIt = options.attacks.filter((a) => armies(a.from) >= armies(a.to) + 2);
      const target = best(
        worthIt,
        (a) => armies(a.from) - armies(a.to) + 4 * (shares.get(CONTINENT_OF.get(a.to) as ContinentId) ?? 0),
      );
      if (target === null) return { kind: "end-attack" };
      return { kind: "blitz", from: target.from, to: target.to, keepAtLeast: 1 };
    }

    case "occupy": {
      // Everything moves on, unless the territory left behind still faces an enemy:
      // then it keeps half of what could move.
      const exposed = enemyNeighbours(view, seat, options.from).length > 0;
      const armiesIn = exposed ? Math.max(options.min, Math.ceil((options.min + options.max) / 2)) : options.max;
      return { kind: "occupy", armies: armiesIn };
    }

    case "fortify": {
      const idle = options.moves.filter(
        (m) => enemyNeighbours(view, seat, m.from).length === 0 && enemyNeighbours(view, seat, m.to).length > 0,
      );
      const move = best(idle, (m) => m.maxArmies);
      if (move === null) return { kind: "end-turn" };
      return { kind: "fortify", from: move.from, to: move.to, armies: move.maxArmies };
    }
  }
};

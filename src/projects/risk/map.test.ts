import { describe, expect, it } from "vitest";
import { ADJACENCY, CONTINENTS, TERRITORIES, type TerritoryId } from "./map";

const ids = TERRITORIES.map((t) => t.id);
const continentOf = new Map<TerritoryId, string>(TERRITORIES.map((t) => [t.id, t.continent]));

function pairs(): [TerritoryId, TerritoryId][] {
  return ids.flatMap((a) => ADJACENCY[a].filter((b) => a < b).map((b): [TerritoryId, TerritoryId] => [a, b]));
}

describe("the classic map (MAP-3)", () => {
  it("has 42 territories in 6 continents, counted as MAP-1 says", () => {
    expect(new Set(ids).size).toBe(42);
    expect(CONTINENTS.map((c) => [c.id, TERRITORIES.filter((t) => t.continent === c.id).length])).toEqual([
      ["north-america", 9],
      ["south-america", 4],
      ["europe", 7],
      ["africa", 6],
      ["asia", 12],
      ["australia", 4],
    ]);
    expect(CONTINENTS.reduce((sum, c) => sum + c.bonus, 0)).toBe(24);
  });

  it("has symmetric, irreflexive adjacency with 83 pairs", () => {
    for (const a of ids) {
      expect(ADJACENCY[a]).not.toContain(a);
      for (const b of ADJACENCY[a]) expect(ADJACENCY[b]).toContain(a);
    }
    expect(pairs()).toHaveLength(83);
  });

  it("is connected", () => {
    const seen = new Set<TerritoryId>(["alaska"]);
    const queue: TerritoryId[] = ["alaska"];
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      for (const n of ADJACENCY[next]) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(42);
  });

  it("links continents by exactly the 14 pairs MAP-3 lists", () => {
    const crossing = pairs()
      .filter(([a, b]) => continentOf.get(a) !== continentOf.get(b))
      .map(([a, b]) => [a, b].sort().join("|"))
      .sort();
    const expected = [
      ["alaska", "kamchatka"],
      ["greenland", "iceland"],
      ["central-america", "venezuela"],
      ["brazil", "north-africa"],
      ["western-europe", "north-africa"],
      ["southern-europe", "north-africa"],
      ["southern-europe", "egypt"],
      ["southern-europe", "middle-east"],
      ["ukraine", "middle-east"],
      ["ukraine", "afghanistan"],
      ["ukraine", "ural"],
      ["egypt", "middle-east"],
      ["east-africa", "middle-east"],
      ["siam", "indonesia"],
    ]
      .map((pair) => pair.sort().join("|"))
      .sort();
    expect(crossing).toEqual(expected);
  });

  it("has 14 cards of each symbol (DECK-2)", () => {
    for (const symbol of ["infantry", "cavalry", "artillery"]) {
      expect(TERRITORIES.filter((t) => t.symbol === symbol)).toHaveLength(14);
    }
  });
});

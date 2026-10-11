import { describe, expect, it } from "vitest";
import { openFloor, openFloors } from "../art/open-floor";
import { NO_HINTS, placeFigures, type PlacementHints } from "../art/placement";
import { FLOOR_RINGS, INNER } from "../art/room";
import { TOKENS } from "../data/tokens";
import { viewFor } from "../engine/view";
import { ENGINE } from "../game";
import { testGame } from "../testing";
import type { GameState } from "../types";
import { firstSpots, nextSpots } from "./spots";
import { CLUSTER_SHOWN, clusterId, clusterReach, edgeSpot, nextClusters, PRESENCE, roomThings, shownObjects, shownThings, type Cluster } from "./things";

const viewOf = (state: GameState) => viewFor(ENGINE, state, null);
const PRIME = [1, 1] as const;
const FLOORS = openFloors(PRIME);

function withThings(edit: (state: GameState) => void): GameState {
  const state = testGame();
  edit(state);
  return state;
}

describe("what lives in rooms", () => {
  it("covers every token kind of both sets, each as one of the kinds, and nothing else", () => {
    expect(Object.keys(PRESENCE).sort()).toEqual(TOKENS.map((token) => token.id).sort());
    expect(TOKENS.some((token) => token.set === "widows-walk")).toBe(true);
  });

  it("names the dropped cards as objects in their card's colour, and the tokens by their kind", () => {
    const state = withThings((s) => {
      s.piles["entrance-hall"] = ["revolver", "skull"];
      s.tokens.push({ token: "blessing", room: "foyer" }, { token: "secret-passage", room: "foyer", link: { room: "entrance-hall", side: null } }, { token: "closet", room: "foyer" });
    });
    const things = roomThings(ENGINE, viewOf(state));
    expect(things.map(({ id, kind, mood, lies }) => ({ id, kind, mood, lies }))).toEqual([
      { id: "card:revolver", kind: "object", mood: "human", lies: true },
      { id: "card:skull", kind: "object", mood: "magic", lies: true },
      { id: "token:blessing:foyer:0", kind: "effect", mood: "holy", lies: false },
      { id: "token:secret-passage:foyer:0", kind: "connection", mood: "moon", lies: false },
      { id: "token:closet:foyer:0", kind: "object", mood: "moon", lies: true },
    ]);
    expect(things[0].name).toBe("Revolver");
    expect(things[3]).toMatchObject({ card: "secret-passage", link: { room: "entrance-hall" } });
  });

  it("leaves a token riding a figure (the Dog) to the figure, and fails loudly on a token it doesn't know", () => {
    const riding = withThings((s) => {
      s.tokens.push({ token: "dog", room: "foyer", holder: "zoe-ingstrom" });
    });
    expect(roomThings(ENGINE, viewOf(riding))).toEqual([]);
    const strange = withThings((s) => {
      s.tokens.push({ token: "nonsense", room: "foyer" });
    });
    expect(() => roomThings(ENGINE, viewOf(strange))).toThrow(/nonsense/);
  });
});

describe("objects on the floor", () => {
  const dropped = withThings((s) => {
    s.piles["entrance-hall"] = ["revolver"];
  });

  it("cluster off the prime place, and the figures stand round them, rings clear", () => {
    const view = viewOf(dropped);
    const clusters = nextClusters({}, roomThings(ENGINE, view), {}, FLOORS);
    const cluster = clusters[clusterId("entrance-hall", null)];
    expect(cluster.things).toEqual(["card:revolver"]);
    expect(Math.hypot(cluster.x - PRIME[0], cluster.z - PRIME[1])).toBeGreaterThanOrEqual(0.9);
    const spots = firstSpots(view, FLOORS, clusters);
    for (const spot of Object.values(spots)) {
      expect(spot?.crowding).toBe(0);
      expect(Math.hypot((spot?.x ?? 0) - cluster.x, (spot?.z ?? 0) - cluster.z)).toBeGreaterThanOrEqual(cluster.reach + 0.15 + 0.55 - 1e-9);
    }
    expect(spots["zoe-ingstrom"]).toMatchObject({ x: PRIME[0], z: PRIME[1] });
  });

  it("keep their place as objects join and leave, and go with the last of them", () => {
    const view = viewOf(dropped);
    const spots = firstSpots(view, FLOORS);
    const first = nextClusters({}, roomThings(ENGINE, view), spots, FLOORS);
    const more = viewOf(withThings((s) => {
      s.piles["entrance-hall"] = ["revolver", "skull", "candle"];
    }));
    const joined = nextClusters(first, roomThings(ENGINE, more), spots, FLOORS);
    const id = clusterId("entrance-hall", null);
    expect(joined[id]).toMatchObject({ x: first[id].x, z: first[id].z, things: ["card:revolver", "card:skull", "card:candle"] });
    const fewer = viewOf(withThings((s) => {
      s.piles["entrance-hall"] = ["candle", "revolver"];
    }));
    expect(nextClusters(joined, roomThings(ENGINE, fewer), spots, FLOORS)[id]).toMatchObject({ x: first[id].x, things: ["card:revolver", "card:candle"] });
    expect(nextClusters(joined, [], spots, FLOORS)).toEqual({});
  });

  it("stay put while the explorer whose turn starts steps onto the prime place", () => {
    const view = viewOf(dropped);
    const clusters = nextClusters({}, roomThings(ENGINE, view), {}, FLOORS);
    const spots = firstSpots(view, FLOORS, clusters);
    const next = nextSpots(spots, view, "ox-bellows", FLOORS, clusters);
    expect(next["ox-bellows"]).toMatchObject({ x: PRIME[0], z: PRIME[1] });
    expect(nextClusters(clusters, roomThings(ENGINE, view), next, FLOORS)).toEqual(clusters);
  });

  it("keep off the doorways and lanes, even in a crowded room", () => {
    const room = openFloor(INNER);
    const lane = { from: [-INNER, 0] as const, to: [INNER, 0] as const, radius: 0.8 };
    const door = { from: [0, -INNER] as const, to: [0, -INNER + 1] as const, radius: 1 };
    const hints: PlacementHints = { ...NO_HINTS, prime: [1, 1], lanes: [lane], keepClear: [door] };
    const crowd = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, size: "person" as const }));
    const placement = placeFigures(room, hints, [...crowd, { id: "objects", size: "object" }]);
    const { x, z } = placement.figures.objects;
    expect(Math.abs(z)).toBeGreaterThanOrEqual(0.8);
    expect(Math.hypot(x, z + INNER)).toBeGreaterThanOrEqual(1);
    expect(placement.badge === null || placement.badge === 8).toBe(true);
  });

  it("show past a few as the first ones and a pile of the rest", () => {
    const cluster: Cluster = { room: "entrance-hall", side: null, x: 0, z: 0, crowding: 0, pose: "standing", things: ["a", "b", "c", "d", "e", "f"], reach: clusterReach(6) };
    const shown = shownObjects(cluster);
    expect(shown).toHaveLength(CLUSTER_SHOWN);
    expect(shown.map((object) => object.things)).toEqual([["a"], ["b"], ["c"], ["d", "e", "f"]]);
    expect(shown[3].id).toBe(clusterId("entrance-hall", null));
    expect(new Set(shown.map((object) => object.at.join())).size).toBe(CLUSTER_SHOWN);
    // Plates lie side by side, rims never overlapping, within the cluster's reach.
    for (const [i, a] of shown.entries())
      for (const b of shown.slice(i + 1)) expect(Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1])).toBeGreaterThanOrEqual(2 * FLOOR_RINGS.plate.radius);
    for (const object of shown) expect(Math.hypot(...object.at) + FLOOR_RINGS.plate.radius).toBeLessThanOrEqual(cluster.reach + 1e-9);
  });
});

describe("connections and effects", () => {
  it("mark a connection on the wall the game puts it on, into a corner, or else on a plain wall", () => {
    const hall = { doors: ["top", "bottom"] as const, passages: [], windows: ["right"] as const };
    expect(edgeSpot({ ...hall, doors: [...hall.doors], windows: [...hall.windows] }, ["left"])).toEqual({ edge: "left", along: 0 });
    expect(edgeSpot({ ...hall, doors: [...hall.doors], windows: [...hall.windows] }, ["top", "right"]).along).toBeGreaterThan(0);
    expect(edgeSpot({ ...hall, doors: [...hall.doors], windows: [...hall.windows] }, ["top", "left"]).along).toBeLessThan(0);
    expect(edgeSpot({ ...hall, doors: [...hall.doors], windows: [...hall.windows] }, null)).toEqual({ edge: "right", along: -1.8 });
    expect(edgeSpot({ doors: ["top", "right", "bottom", "left"], passages: [], windows: [] }, null)).toEqual({ edge: "top", along: -1.8 });
  });

  it("show an effect over its tile and a connection on its wall, never in a cluster", () => {
    const state = withThings((s) => {
      s.tokens.push({ token: "blessing", room: "foyer" }, { token: "wall-switch", room: "foyer", wall: ["left"] });
    });
    const things = roomThings(ENGINE, viewOf(state));
    expect(nextClusters({}, things, {}, FLOORS)).toEqual({});
    expect(shownThings(ENGINE, things, {}).map((thing) => thing.place)).toEqual([{ kind: "tile" }, { kind: "edge", spot: { edge: "left", along: 0 } }]);
  });
});

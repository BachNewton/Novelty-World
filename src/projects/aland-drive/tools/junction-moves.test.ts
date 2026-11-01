import { describe, expect, it } from "vitest";
import { decodeRoadGraph, type RoadMapFile } from "../map/road-graph";
import { JunctionFinder } from "./junction-moves";

const ONE_WAY = 1;

/** A network from straight roads: places as [east, north], roads as [from, to, flags]. */
function network(places: [number, number][], roads: [number, number, number][]): JunctionFinder {
  const file: RoadMapFile = {
    unitM: 1,
    names: [""],
    kinds: ["residential"],
    nodes: places.flat(),
    from: roads.map(([from]) => from),
    to: roads.map(([, to]) => to),
    kind: roads.map(() => 0),
    name: roads.map(() => 0),
    flags: roads.map(([, , flags]) => flags),
    counts: roads.map(() => 0),
    points: [],
  };
  return new JunctionFinder(decodeRoadGraph(file, 0), file.kinds);
}

const everywhere = () => true;

describe("the movements through a junction", () => {
  it("are every way in to every other way out", () => {
    const { moves, junctions } = network(
      [[0, 0], [100, 0], [-100, 0], [0, 100]],
      [[0, 1, 0], [2, 0, 0], [3, 0, 0]],
    ).movements(everywhere);
    expect(junctions).toBe(1);
    expect(moves.length).toBe(6);
  });

  it("never drive a one-way road against its flow", () => {
    const { moves } = network(
      [[0, 0], [100, 0], [-100, 0], [0, 100]],
      [[0, 1, ONE_WAY], [2, 0, 0], [3, 0, 0]],
    ).movements(everywhere);
    // The one-way road only leads out, so it's two ways in to three ways out, less each road back into itself.
    expect(moves.length).toBe(4);
    expect(moves.some((move) => move.line[0] > 90)).toBe(false);
  });

  it("leave out a hairpin between the two legs of a split road", () => {
    const { moves, hairpins } = network(
      [[0, 0], [100, 0], [-100, 3], [-100, -3]],
      [[0, 1, 0], [2, 0, ONE_WAY], [0, 3, ONE_WAY]],
    ).movements(everywhere);
    expect(hairpins).toBe(1);
    expect(moves.length).toBe(2);
  });
});

describe("a roundabout", () => {
  // A ring of eight points run clockwise on the map, with roads in from the west and out to the east.
  const ring = Array.from({ length: 8 }, (_, at): [number, number] => {
    const angle = Math.PI - (at * Math.PI) / 4;
    return [15 * Math.cos(angle), 15 * Math.sin(angle)];
  });
  const places: [number, number][] = [...ring, [-120, 0], [120, 0]];
  const roads: [number, number, number][] = [...ring.map((_, at): [number, number, number] => [at, (at + 1) % 8, ONE_WAY]), [8, 0, 0], [4, 9, 0]];

  it("is one junction, and goes round the way its ring runs", () => {
    const { moves, junctions } = network(places, roads).movements(everywhere);
    expect(junctions).toBe(1);
    expect(moves.every((move) => move.roundabout)).toBe(true);
    const across = moves.find((move) => move.line[0] < 0 && move.line[move.line.length - 2] > 0);
    if (!across) throw new Error("no way across the roundabout");
    // Clockwise from the west goes over the north, and north is -z.
    let north = 0;
    for (let at = 1; at < across.line.length; at += 2) north = Math.min(north, across.line[at]);
    expect(north).toBeLessThan(-10);
  });

  it("offers the way back round to the road a car came in on", () => {
    const { moves } = network(places, roads).movements(everywhere);
    const back = moves.find((move) => move.line[0] < 0 && move.line[move.line.length - 2] < 0);
    if (!back) throw new Error("no way back round");
    expect(back.leavesAt - back.entersAt).toBeGreaterThan(80);
  });

  it("isn't a block of one-way streets", () => {
    const block: [number, number][] = [[0, 0], [70, 0], [70, 12], [0, 12], [-50, 0], [120, 12]];
    const { moves } = network(block, [[0, 1, ONE_WAY], [1, 2, ONE_WAY], [2, 3, ONE_WAY], [3, 0, ONE_WAY], [4, 0, 0], [2, 5, 0]]).movements(everywhere);
    expect(moves.every((move) => !move.roundabout)).toBe(true);
  });
});

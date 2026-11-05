import { describe, expect, it } from "vitest";
import { Around } from "./around";
import { decodeLanes } from "./lane-map";
import { LaneNet } from "./lane-net";
import { junctionTile, lane, overTheSeam } from "./test-lanes";

describe("the lane map", () => {
  it("decodes centimetre steps to the places written, with no drift along a long line", () => {
    const decoded = decodeLanes({ ...overTheSeam(), lanes: [lane(Array.from({ length: 500 }, (_, index) => [-21896.53 + index * 13.37, 12.34 + index * 0.01, 9571.11 - index * 7.77] as [number, number, number]))] });
    const last = decoded.lanes[0].first + decoded.lanes[0].count - 1;
    expect(decoded.points[last * 3]).toBeCloseTo(-21896.53 + 499 * 13.37, 2);
    expect(decoded.points[last * 3 + 2]).toBeCloseTo(9571.11 - 499 * 7.77, 2);
  });

  it("joins a lane's two halves at a seam by place, and parts them when a tile goes", () => {
    const net = new LaneNet();
    net.add("A", decodeLanes(junctionTile()));
    expect(net.seams()).toEqual({ joined: 0, open: 1 });
    net.add("B", decodeLanes(overTheSeam()));
    expect(net.onward({ tile: "A", lane: 1 })).toEqual([{ lane: { tile: "B", lane: 0 }, connector: null }]);
    net.remove("B");
    expect(net.seams()).toEqual({ joined: 0, open: 1 });
  });
});

describe("knowing what's around", () => {
  const around = () => {
    const net = new LaneNet();
    net.add("A", decodeLanes(junctionTile()));
    net.add("B", decodeLanes(overTheSeam()));
    return new Around(net);
  };

  it("matches a car to the lane running its way, not the one beside it going the other", () => {
    const index = around();
    expect(index.match("car", 50, 1, { x: 1, z: 0 })).toMatchObject({ tile: "A", index: 0, connector: false });
    expect(index.match("car", 50, 1, { x: -1, z: 0 })).toBeNull();
  });

  it("sees what's ahead through a junction and over a seam, nearest first", () => {
    const index = around();
    index.put("me", { tile: "A", index: 0, connector: false, along: 50 });
    index.put("past the junction", { tile: "A", index: 1, connector: false, along: 20 });
    index.put("over the seam", { tile: "B", index: 0, connector: false, along: 10 });
    index.put("behind me", { tile: "A", index: 0, connector: false, along: 10 });
    const ahead = index.ahead("me", 7000);
    expect(ahead.map((seen) => seen.id)).toEqual(["past the junction", "over the seam"]);
    expect(ahead[0].gap).toBeCloseTo(45 + 10 + 20, 3);
    expect(index.behind("me", 100).map((seen) => seen.id)).toEqual(["behind me"]);
  });

  it("sees a car merging from a side road as ahead, and the turn sees the traffic it gives way to coming", () => {
    const index = around();
    index.put("me", { tile: "A", index: 0, connector: false, along: 90 });
    index.put("turning in", { tile: "A", index: 1, connector: true, along: 3 });
    expect(index.ahead("me", 50).map((seen) => seen.id)).toEqual(["turning in"]);
    index.forget("turning in");
    expect(index.coming("A", 1, 30).map((seen) => seen.id)).toEqual(["me"]);
    expect(index.coming("A", 1, 30)[0].gap).toBeCloseTo(5, 3);
  });
});

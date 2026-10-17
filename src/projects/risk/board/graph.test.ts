import { describe, expect, it } from "vitest";
import { ADJACENCY, CONTINENTS, TERRITORIES, type TerritoryId } from "../map";
import { frameBoard, type Rect } from "../ui/camera";
import { nextTerritory } from "../ui/territory-nav";
import { DRAWN, FINGERTIP, FOOTPRINTS, locate, pathThrough, TOUCH_SCALE, WRAP_WIDTH } from "./graph";
import { BORDERS, GRAPH_HEIGHT, GRAPH_WIDTH, NODES, REGIONS } from "./graph-layout";

const IDS = TERRITORIES.map((t) => t.id);
const key = (a: string, b: string) => [a, b].sort().join("|");

/** How many pairs of drawn lines cross, lines meeting at a territory not counting. */
function crossings(): number {
  const cross = (o: readonly number[], a: readonly number[], b: readonly number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  let count = 0;
  for (let i = 0; i < DRAWN.length; i++) {
    for (let j = i + 1; j < DRAWN.length; j++) {
      const { border: e, line: [p1, p2] } = DRAWN[i];
      const { border: f, line: [q1, q2] } = DRAWN[j];
      if (e.some((t) => f.includes(t))) continue;
      if (cross(q1, q2, p1) * cross(q1, q2, p2) < 0 && cross(p1, p2, q1) * cross(p1, p2, q2) < 0) count++;
    }
  }
  return count;
}

describe("the board as a graph", () => {
  it("places exactly map.ts's 42 territories, and draws exactly its 83 borders", () => {
    expect(Object.keys(NODES).sort()).toEqual([...IDS].sort());
    const fromMap = new Set(IDS.flatMap((a) => ADJACENCY[a].map((b) => key(a, b))));
    expect(fromMap.size).toBe(83);
    expect(new Set(BORDERS.map(([a, b]) => key(a, b)))).toEqual(fromMap);
    expect(Object.keys(REGIONS).sort()).toEqual(CONTINENTS.map((c) => c.id).sort());
  });

  it("puts every territory on the board", () => {
    for (const [x, y] of Object.values(NODES)) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(GRAPH_WIDTH);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(GRAPH_HEIGHT);
    }
  });

  it("crosses no border over another", () => {
    expect(crossings()).toBe(0);
  });

  it("runs Alaska–Kamchatka across the board's edge, about a border long", () => {
    expect(NODES.alaska[0]).toBeLessThan(GRAPH_WIDTH / 8);
    expect(NODES.kamchatka[0]).toBeGreaterThan((GRAPH_WIDTH * 7) / 8);
    expect(NODES.alaska[1]).toBe(NODES.kamchatka[1]);
    const across = NODES.alaska[0] + WRAP_WIDTH - NODES.kamchatka[0];
    expect(across).toBeGreaterThan(100);
    expect(across).toBeLessThan(250);
  });
});

describe("the board on a screen", () => {
  const board = { width: GRAPH_WIDTH, height: GRAPH_HEIGHT };
  const frame = (width: number, height: number, overlays: Rect[]) => frameBoard({ board, view: { width, height }, overlays, footprints: FOOTPRINTS, touch: TOUCH_SCALE });
  let closest = Infinity;
  for (const a of IDS) for (const b of IDS) if (a < b) closest = Math.min(closest, Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]));

  it("keeps every territory a fingertip from the next on the smallest phone, panning it across only", () => {
    // The floor's 360×640 view in portrait, its top bar and status box over the map.
    const { camera, pan } = frame(360, 640, [{ left: 8, top: 8, right: 352, bottom: 70 }, { left: 8, top: 420, right: 352, bottom: 632 }]);
    expect(pan.axis).toBe("x");
    expect(closest * camera.scale).toBeGreaterThanOrEqual(FINGERTIP);
    expect(camera.top).toBeGreaterThanOrEqual(70);
    expect(camera.top + GRAPH_HEIGHT * camera.scale).toBeLessThanOrEqual(420);
  });

  it("shows a 16:9 desktop the whole board, its status box in the board's empty south-west", () => {
    const fit = Math.min(1920 / GRAPH_WIDTH, 960 / GRAPH_HEIGHT);
    const { camera, pan } = frame(1920, 960, [{ left: 8, top: 8, right: 360, bottom: 64 }, { left: 1840, top: 8, right: 1912, bottom: 56 }, { left: 8, top: 700, right: 424, bottom: 952 }]);
    expect(pan.axis).toBe("none");
    expect(camera.scale).toBeGreaterThan(fit * 0.85);
  });
});

describe("moving the focus over the graph", () => {
  const all = IDS.map((id) => ({ id, ...locate(id) }));
  const step = (from: TerritoryId, way: "left" | "right" | "up" | "down") => nextTerritory(all, locate(from), way, WRAP_WIDTH);

  it("walks neighbours by screen direction", () => {
    expect(step("alberta", "right")).toBe("ontario");
    expect(step("alberta", "down")).toBe("western-united-states");
    expect(step("india", "right")).toBe("siam");
    expect(step("egypt", "down")).toBe("east-africa");
    expect(step("western-australia", "right")).toBe("eastern-australia");
    expect(step("iceland", "left")).toBe("greenland");
  });

  it("wraps east to west across the board's edge: Alaska and Kamchatka", () => {
    const pacific = (["alaska", "kamchatka", "northwest-territory", "yakutsk"] as const).map((id) => ({ id, ...locate(id) }));
    expect(nextTerritory(pacific, locate("alaska"), "left", WRAP_WIDTH)).toBe("kamchatka");
    expect(nextTerritory(pacific, locate("kamchatka"), "right", WRAP_WIDTH)).toBe("alaska");
  });
});

describe("a fortifying army's march", () => {
  const owners = Object.fromEntries(IDS.map((id) => [id, { owner: 1, armies: 1 }])) as Record<TerritoryId, { owner: number; armies: number }>;
  owners.ontario = { owner: 0, armies: 1 };
  owners["western-united-states"] = { owner: 0, armies: 1 };

  it("goes the shortest way through the owner's own territories", () => {
    expect(pathThrough(owners, "alaska", "quebec")).toEqual(["alaska", "northwest-territory", "greenland", "quebec"]);
    expect(pathThrough(owners, "alaska", "ontario")).toBeNull();
  });
});

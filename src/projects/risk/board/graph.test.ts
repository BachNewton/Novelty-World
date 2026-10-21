import { describe, expect, it } from "vitest";
import { ADJACENCY, CONTINENTS, TERRITORIES, type TerritoryId } from "../map";
import { frameBoard, type Rect } from "../ui/camera";
import { nextTerritory } from "../ui/territory-nav";
import { shortName } from "../ui/short-names";
import { clashes, DRAWN, DRAWS, FINGERTIP, hull, layoutAt, locate, pathThrough, TOUCH_SCALE, WRAP_WIDTH } from "./graph";
import { BORDERS, GRAPH_HEIGHT, GRAPH_WIDTH, NODES, REGION_PAD, SLOTS } from "./graph-layout";
import { LABEL_WIDTHS } from "./label-widths";

const IDS = TERRITORIES.map((t) => t.id);
const key = (a: string, b: string) => [a, b].sort().join("|");

type Pair = readonly [number, number];

/** How far a point is from a line segment. */
function toSegment(p: Pair, [a, b]: readonly [Pair, Pair]): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** How near a line segment comes to a box, to a hundredth of its length. */
function segmentToBox([a, b]: readonly [Pair, Pair], box: Rect): number {
  let nearest = Infinity;
  for (let i = 0; i <= 100; i++) {
    const [x, y] = [a[0] + ((b[0] - a[0]) * i) / 100, a[1] + ((b[1] - a[1]) * i) / 100];
    nearest = Math.min(nearest, Math.hypot(x - Math.min(Math.max(x, box.left), box.right), y - Math.min(Math.max(y, box.top), box.bottom)));
  }
  return nearest;
}

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
    expect(Object.keys(layoutAt({ x: 1, y: 1 }).regions).sort()).toEqual(CONTINENTS.map((c) => c.id).sort());
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

  it("knows how wide every territory's name is drawn", () => {
    for (const id of IDS) expect(LABEL_WIDTHS[shortName(id)], shortName(id)).toBeGreaterThan(0);
  });

  it("covers no name or ring with another territory's, however the screen stretches it", () => {
    for (const stretch of [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 1.3, y: 1.7 }]) expect(clashes(layoutAt(stretch).nodes)).toEqual([]);
  });

  it("keeps every territory clear of the borders it isn't on", () => {
    for (const id of IDS) {
      for (const { border, line } of DRAWN) if (!border.includes(id)) expect(toSegment(NODES[id], line), `${id} by ${border.join("–")}`).toBeGreaterThanOrEqual(42);
    }
  });

  it("runs Alaska–Kamchatka level across the board's edge, from the westernmost territory and Asia's easternmost", () => {
    expect(NODES.alaska[0]).toBe(Math.min(...IDS.map((id) => NODES[id][0])));
    const asia = TERRITORIES.filter((t) => t.continent === "asia").map((t) => NODES[t.id][0]);
    expect(NODES.kamchatka[0]).toBe(Math.max(...asia));
    expect(NODES.alaska[1]).toBe(NODES.kamchatka[1]);
  });

  it("leaves its two slots open for the panels: nothing a territory draws, no border, no continent's region", () => {
    for (const [name, slot] of Object.entries(SLOTS)) {
      for (const id of IDS) {
        const [x, y] = NODES[id];
        const draws = DRAWS[id];
        const overlaps = x + draws.left < slot.right && slot.left < x + draws.right && y + draws.top < slot.bottom && slot.top < y + draws.bottom;
        expect(overlaps, `${id} in the ${name} slot`).toBe(false);
      }
      for (const { border, line } of DRAWN) expect(segmentToBox(line, slot), `${border.join("–")} through the ${name} slot`).toBeGreaterThan(0);
      for (const continent of CONTINENTS) {
        const h = hull(TERRITORIES.filter((t) => t.continent === continent.id).map((t) => NODES[t.id]));
        for (let i = 0; i < h.length; i++) expect(segmentToBox([h[i], h[(i + 1) % h.length]], slot), `${continent.id}'s region in the ${name} slot`).toBeGreaterThanOrEqual(REGION_PAD);
      }
    }
  });
});

describe("the board on a screen", () => {
  const board = { width: GRAPH_WIDTH, height: GRAPH_HEIGHT };
  const frame = (width: number, height: number, overlays: Rect[]) => frameBoard({ board, view: { width, height }, overlays, places: IDS.map(locate), draws: IDS.map((id) => DRAWS[id]), touch: TOUCH_SCALE });
  let closest = Infinity;
  for (const a of IDS) for (const b of IDS) if (a < b) closest = Math.min(closest, Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]));

  it("keeps every territory a fingertip from the next on the smallest phone, panning it across only", () => {
    // Risk's floor, a 375×640 view in portrait, its top bar and status box over the map.
    const { camera, pan } = frame(375, 640, [{ left: 8, top: 8, right: 367, bottom: 70 }, { left: 8, top: 420, right: 367, bottom: 632 }]);
    expect(pan.axis).toBe("x");
    expect(closest * camera.scale).toBeGreaterThanOrEqual(FINGERTIP);
    expect(camera.top).toBeGreaterThanOrEqual(70);
    expect(camera.top + GRAPH_HEIGHT * camera.scale).toBeLessThanOrEqual(420);
  });

  it("shows a 16:9 desktop the whole board, spread over most of the screen, under today's panels", () => {
    const fit = Math.min(1920 / GRAPH_WIDTH, 960 / GRAPH_HEIGHT);
    const { camera, pan, stretch } = frame(1920, 960, [{ left: 8, top: 8, right: 424, bottom: 90 }, { left: 8, top: 768, right: 344, bottom: 952 }]);
    expect(pan.axis).toBe("none");
    expect(camera.scale).toBeGreaterThan(fit * 0.75);
    expect(GRAPH_WIDTH * stretch.x * camera.scale).toBeGreaterThan(1920 * 0.8);
  });

  it("fills an iPad mini either way up", () => {
    for (const [width, height] of [[1024, 768], [768, 1024]]) {
      const { camera, pan, stretch } = frame(width, height, [{ left: 8, top: 8, right: 424, bottom: 90 }, { left: 8, top: height - 192, right: 344, bottom: height - 8 }]);
      expect(pan.axis).toBe("none");
      expect(GRAPH_WIDTH * stretch.x * camera.scale).toBeGreaterThan(width * 0.75);
      expect(GRAPH_HEIGHT * stretch.y * camera.scale).toBeGreaterThan(height * 0.75);
    }
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

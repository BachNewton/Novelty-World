import { describe, expect, it } from "vitest";
import { ADJACENCY, CONTINENTS, TERRITORIES, type TerritoryId } from "../map";
import { copies, layoutScreen, toScreen, type Rect } from "../ui/camera";
import { nextTerritory } from "../ui/territory-nav";
import { shortName } from "../ui/short-names";
import { clashes, COMPOSITION, DRAWN, DRAWS, FINGERTIP, hull, LAYOUT, locate, MARKER, pathThrough, WRAP_WIDTH } from "./graph";
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
    expect(Object.keys(LAYOUT.regions).sort()).toEqual(CONTINENTS.map((c) => c.id).sort());
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

  it("covers no name or ring with another territory's", () => {
    expect(clashes(NODES)).toEqual([]);
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
  const size = (r: Rect) => [Math.round(r.right - r.left), Math.round(r.bottom - r.top)];
  let closest = Infinity;
  for (const a of IDS) for (const b of IDS) if (a < b) closest = Math.min(closest, Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]));

  // The layout spec's targets: each screen's form, its circles' size in CSS pixels, and its
  // players and action panels' boxes, the portrait action band as tall as a battle needs.
  const TARGETS = [
    { screen: [1920, 1080], form: "landscape", pans: false, circles: 68, players: [1073, 190], action: [482, 348] },
    { screen: [3440, 1440], form: "landscape", pans: false, circles: 97, players: [1534, 219], action: [689, 446] },
    { screen: [1180, 820], form: "landscape", pans: false, circles: 42, players: [659, 195], action: [296, 292] },
    { screen: [412, 790], form: "portrait", pans: true, circles: 36, players: [412, 104], action: [412, 164] },
    { screen: [915, 356], form: "short", pans: false, circles: 25, players: [128, 356], action: [128, 356] },
    { screen: [820, 1180], form: "portrait", pans: true, circles: 63, players: [820, 104], action: [820, 164] },
  ] as const;

  it("lays out each of the spec's screens as designed", () => {
    for (const target of TARGETS) {
      const [width, height] = target.screen;
      const { form, frame, panels } = layoutScreen({ width, height }, COMPOSITION);
      const name = `${width}×${height}`;
      expect(form, name).toBe(target.form);
      expect(frame.pan.axis !== "none", name).toBe(target.pans);
      expect(Math.round(MARKER * frame.camera.scale), name).toBe(target.circles);
      expect(size(panels.players), name).toEqual(target.players);
      expect(size(panels.action), name).toEqual(target.action);
    }
  });

  it("shows every territory clear of both panels and inside the screen, on each of the spec's screens", () => {
    for (const { screen: [width, height] } of TARGETS) {
      const view = { width, height };
      const { frame, panels } = layoutScreen(view, COMPOSITION);
      const { scale } = frame.camera;
      for (const left of copies(frame, board, view)) {
        for (const id of IDS) {
          const at = toScreen({ ...frame, camera: { ...frame.camera, left } }, locate(id));
          const d = DRAWS[id];
          const shown = { left: at.x + d.left * scale, top: at.y + d.top * scale, right: at.x + d.right * scale, bottom: at.y + d.bottom * scale };
          if (shown.right <= 0 || shown.left >= width) continue;
          expect(shown.top, `${id} on ${width}×${height}`).toBeGreaterThanOrEqual(-1e-6);
          expect(shown.bottom, `${id} on ${width}×${height}`).toBeLessThanOrEqual(height + 1e-6);
          for (const [panel, box] of Object.entries(panels)) {
            // Panning, a territory passes under the columns either side on its way across; what
            // shows the board, between them, it never shares with a panel.
            const clipped = frame.pan.axis === "none" ? box : { ...box, left: Math.max(box.left, frame.pan.left), right: Math.min(box.right, frame.pan.right) };
            // A territory may meet a panel's edge, to rounding.
            const e = 1e-6;
            const over = shown.left < clipped.right - e && clipped.left < shown.right - e && shown.top < clipped.bottom - e && clipped.top < shown.bottom - e;
            expect(over, `${id} under the ${panel} panel on ${width}×${height}`).toBe(false);
          }
        }
      }
    }
  });

  it("keeps every territory a fingertip from the next on the smallest phone, panning it across between the bands", () => {
    const { form, frame } = layoutScreen({ width: 375, height: 640 }, COMPOSITION);
    expect(form).toBe("portrait");
    expect(frame.pan.axis).toBe("x");
    expect(closest * frame.camera.scale).toBeGreaterThanOrEqual(FINGERTIP);
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

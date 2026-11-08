import { describe, expect, it } from "vitest";
import {
  TIERS,
  planTiles,
  tileId,
  type TileSpec,
} from "./terrain-stream";

const RADIUS = 12000;
const PLAN = { radius: RADIUS, tierScale: 1, current: new Set<string>() };

const bounds = (s: TileSpec) => {
  const size = TIERS[s.tier].tileSize;
  return { x0: s.cx * size, x1: (s.cx + 1) * size, z0: s.cz * size, z1: (s.cz + 1) * size };
};
const contains = (s: TileSpec, x: number, z: number) => {
  const b = bounds(s);
  return x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1;
};
const nearestDist = (s: TileSpec, x: number, z: number) => {
  const b = bounds(s);
  return Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
};

describe("planTiles", () => {
  it("covers every point inside the radius exactly once (no holes, no overlap)", () => {
    const px = 137;
    const pz = -412; // deliberately unaligned with any tile grid
    const plan = planTiles({ px, pz, ...PLAN });
    // Probe a polar sample of points strictly inside the radius: each must lie in ONE tile.
    for (let ring = 0; ring < 24; ring++) {
      for (let arm = 0; arm < 16; arm++) {
        const d = (ring / 24) * RADIUS * 0.98;
        const a = (arm / 16) * Math.PI * 2 + 0.05;
        const x = px + d * Math.cos(a);
        const z = pz + d * Math.sin(a);
        const owners = plan.filter((s) => contains(s, x, z));
        expect(owners.length).toBe(1);
      }
    }
  });

  it("assigns tiers by distance: finest under the viewer, coarser out, per the TIERS radii", () => {
    const px = 137;
    const pz = -412;
    const plan = planTiles({ px, pz, ...PLAN });
    const tierAt = (x: number, z: number) => plan.find((s) => contains(s, x, z))?.tier;
    expect(tierAt(px, pz)).toBe(0);
    // A tile's tier is decided by its NEAREST point (a coarse tile legitimately spans
    // several distance bands), so the honest checks are the two self-consistency
    // invariants of the refinement rule, not point probes:
    for (const s of plan) {
      const d = nearestDist(s, px, pz);
      // 1. It did NOT refine → its nearest point is outside the finer tier's radius.
      if (s.tier > 0) {
        expect(d).toBeGreaterThanOrEqual(TIERS[s.tier - 1].outerRadius * 0.899);
      }
      // 2. Its PARENT did refine → the parent's nearest point is inside this tier's
      //    radius (with the hysteresis margin).
      if (s.tier < TIERS.length - 1) {
        const parent = {
          tier: s.tier + 1,
          cx: Math.floor(s.cx / 2),
          cz: Math.floor(s.cz / 2),
        };
        expect(nearestDist(parent, px, pz)).toBeLessThan(TIERS[s.tier].outerRadius * 1.101);
      }
    }
    // And the plan spans multiple tiers — else the invariants above prove nothing.
    expect(new Set(plan.map((s) => s.tier)).size).toBeGreaterThanOrEqual(4);
  });

  it("hysteresis: a viewer hovering at a boundary does not flap tiles", () => {
    // Stand just outside T0's outer radius from a tile, plan, then step ±10 m across
    // the nominal boundary repeatedly: the tile's tier must not change, because
    // neither position is clearly (±10 %) past the line.
    const boundary = TIERS[0].outerRadius; // 448
    let current = new Set<string>();
    const planAt = (px: number) => {
      const plan = planTiles({ px, pz: 0, radius: RADIUS, tierScale: 1, current });
      current = new Set(plan.map(tileId));
      return plan;
    };
    // The tile just beyond the boundary along +x from a viewer at origin-ish.
    const probeX = boundary + 200; // inside some tile; find its tier per plan
    const tierOf = (plan: TileSpec[]) => plan.find((s) => contains(s, probeX, 0))?.tier;

    const t0 = tierOf(planAt(0));
    const flips: number[] = [];
    for (const dx of [8, -8, 8, -8, 8]) {
      const t = tierOf(planAt(dx));
      if (t !== t0) flips.push(t ?? -1);
    }
    expect(flips).toEqual([]);
    // But a CLEAR move past the line does re-tier: walk decisively toward the probe.
    const near = tierOf(planAt(probeX - 100));
    expect(near).toBeLessThan(t0 ?? 99);
  });
});

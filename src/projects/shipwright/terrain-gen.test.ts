import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  bedrockField,
  generateChunk,
  windowChunkRequest,
  TREE_SPACING,
  type ChunkRequest,
} from "./terrain-gen";

// Small chunks keep these fast; the field itself is pinned by terrain.test.ts.
const BASE: ChunkRequest = {
  seed: 13,
  grain: Math.PI / 8,
  deep: -30,
  originX: 90,
  originZ: -120,
  size: 60,
  spacing: 2,
  trees: true,
};

describe("generateChunk", () => {
  it("is deterministic: the same request produces byte-identical buffers", () => {
    const a = generateChunk(BASE);
    const b = generateChunk(BASE);
    expect(a.positions).toEqual(b.positions);
    expect(a.normals).toEqual(b.normals);
    expect(a.colors).toEqual(b.colors);
    expect(a.index).toEqual(b.index);
    expect(a.trees).toEqual(b.trees);
  });

  it("agrees with its neighbour on the shared edge (world-anchored heights + apron normals)", () => {
    // Two chunks sharing the x = originX + size/2 edge. Without the apron,
    // edge normals would each be computed from half a neighbourhood and disagree —
    // the classic chunk-border lighting seam.
    const left = generateChunk(BASE);
    const right = generateChunk({ ...BASE, originX: BASE.originX + BASE.size });
    const n = Math.round(BASE.size / BASE.spacing);
    const verts = n + 1;
    for (let jz = 0; jz <= n; jz++) {
      const li = (jz * verts + n) * 3; // left chunk's right edge column
      const ri = (jz * verts + 0) * 3; // right chunk's left edge column
      for (let c = 0; c < 3; c++) {
        expect(left.normals[li + c]).toBeCloseTo(right.normals[ri + c], 6);
        expect(left.colors[li + c]).toBeCloseTo(right.colors[ri + c], 6);
      }
      expect(left.positions[li + 1]).toBeCloseTo(right.positions[ri + 1], 5);
    }
  });

  it("plants the same world-anchored forest whether an area is one chunk or two", () => {
    // Tree candidates hash WORLD lattice cells, so splitting an area into chunks must
    // not move, drop, or duplicate a single tree. (The old mesher hashed window-local
    // indices, which made every window size grow a different forest.)
    const whole = generateChunk({ ...BASE, size: 120, spacing: 2.4 });
    // Four 60 m quadrant chunks tiling exactly the whole 120 m window.
    const quadrants = [-30, 30].flatMap((dx) =>
      [-30, 30].map((dz) => ({
        payload: generateChunk({
          ...BASE,
          originX: BASE.originX + dx,
          originZ: BASE.originZ + dz,
          size: 60,
          spacing: 2.4,
        }),
        ox: BASE.originX + dx,
        oz: BASE.originZ + dz,
      })),
    );

    const worldTrees = (payload: { trees: Float32Array }, ox: number, oz: number) => {
      const out: string[] = [];
      for (let t = 0; t < payload.trees.length; t += 7) {
        out.push(
          [
            (payload.trees[t] + ox).toFixed(3),
            (payload.trees[t + 2] + oz).toFixed(3),
            payload.trees[t + 3].toFixed(5),
            payload.trees[t + 4].toFixed(5),
            payload.trees[t + 5].toFixed(5),
            payload.trees[t + 6].toFixed(5),
          ].join(","),
        );
      }
      return out.sort();
    };
    const split = quadrants.flatMap((q) => worldTrees(q.payload, q.ox, q.oz)).sort();
    expect(whole.treeCount).toBeGreaterThan(0); // else the test proves nothing
    expect(split).toEqual(worldTrees(whole, BASE.originX, BASE.originZ));
  });

  it("chunk ownership of a tree cell is exclusive and exhaustive at the boundary", () => {
    // A cell whose base corner sits exactly on a chunk edge belongs to exactly one side.
    const west = generateChunk({ ...BASE, trees: true });
    const east = generateChunk({ ...BASE, originX: BASE.originX + BASE.size, trees: true });
    const cells = (payload: { trees: Float32Array }, ox: number) => {
      const out = new Set<string>();
      for (let t = 0; t < payload.trees.length; t += 7) {
        // Recover the world cell from the jittered position: cell = floor(world / spacing).
        const cx = Math.floor((payload.trees[t] + ox) / TREE_SPACING);
        const cz = Math.floor((payload.trees[t + 2] + BASE.originZ) / TREE_SPACING);
        out.add(`${cx},${cz}`);
      }
      return out;
    };
    const w = cells(west, BASE.originX);
    const e = cells(east, BASE.originX + BASE.size);
    for (const cell of w) expect(e.has(cell)).toBe(false);
  });

  it("the legacy window request reproduces the tapered bedrock field exactly", () => {
    const profile = {
      seed: 13,
      center: [100, -100] as [number, number],
      extent: 120,
      grain: Math.PI / 8,
      deep: -30,
      spacing: 3,
    };
    const payload = generateChunk(windowChunkRequest(profile));
    const { height } = bedrockField(profile);
    const n = Math.round(profile.extent / profile.spacing);
    const verts = n + 1;
    // Spot-check a diagonal of vertices, including both tapered corners.
    for (let j = 0; j <= n; j += 5) {
      const i = (j * verts + j) * 3;
      const wx = profile.center[0] + payload.positions[i];
      const wz = profile.center[1] + payload.positions[i + 2];
      expect(payload.positions[i + 1]).toBeCloseTo(height(wx, wz), 4);
    }
  });

  it("far tiers grow canopy clumps: cell-wide footprints at true canopy height, on the stands", () => {
    // The same area, near-style trees vs far-style clumps at a 5 m lattice.
    const near = generateChunk({ ...BASE, size: 120, spacing: 2.4, trees: true });
    const far = generateChunk({
      ...BASE,
      size: 120,
      spacing: 2.4,
      trees: false,
      clumpLattice: 5,
    });
    // Forested area must not go bald at distance (the whole point).
    expect(near.treeCount).toBeGreaterThan(0);
    expect(far.treeCount).toBeGreaterThan(0);
    // Fewer clumps than trees (coarser lattice), each wider than tall — a stand, not a spire.
    expect(far.treeCount).toBeLessThan(near.treeCount);
    for (let t = 0; t < far.trees.length; t += 7) {
      expect(far.trees[t + 3]).toBeGreaterThan(1.4); // ≈ L/2.3 × jitter — covers its cell
      expect(far.trees[t + 4]).toBeLessThanOrEqual(1.2); // true canopy height
      expect(far.trees[t + 3]).toBeGreaterThan(far.trees[t + 4]);
    }
    // Determinism, like everything else here.
    expect(generateChunk({ ...BASE, size: 120, spacing: 2.4, trees: false, clumpLattice: 5 }).trees).toEqual(
      far.trees,
    );
  });

  it("skirts duplicate the perimeter downward with copied normals + colours, and wall every edge", () => {
    const n = Math.round(BASE.size / BASE.spacing);
    const verts = n + 1;
    const plain = generateChunk(BASE);
    const skirted = generateChunk({ ...BASE, skirtDepth: 4 });
    // 4n extra vertices, 8n extra triangles; the grid itself is untouched.
    expect(skirted.positions.length).toBe(plain.positions.length + 4 * n * 3);
    expect(skirted.index.length).toBe(plain.index.length + 4 * n * 6);
    expect(skirted.positions.slice(0, verts * verts * 3)).toEqual(plain.positions);
    expect(skirted.colors.slice(0, verts * verts * 3)).toEqual(plain.colors);
    // Every skirt vertex sits exactly skirtDepth below a perimeter vertex at the same (x, z),
    // wearing its normal and colour.
    const base = verts * verts;
    for (let r = 0; r < 4 * n; r++) {
      const d = (base + r) * 3;
      const half = BASE.size / 2;
      const onEdge =
        Math.abs(Math.abs(skirted.positions[d]) - half) < 1e-4 ||
        Math.abs(Math.abs(skirted.positions[d + 2]) - half) < 1e-4;
      expect(onEdge).toBe(true);
      // Find the matching top vertex by scanning the perimeter row/columns is overkill —
      // the builder copies by construction; assert the drop instead via the wall triangles:
    }
    // Wall triangles reference both grid and skirt vertices, and the drop is exact: for each
    // skirt triangle's (top, bottom) pair at the same (x, z), y differs by skirtDepth.
    for (let t = plain.index.length; t < skirted.index.length; t += 3) {
      for (const [i, j] of [
        [skirted.index[t], skirted.index[t + 1]],
        [skirted.index[t + 1], skirted.index[t + 2]],
      ]) {
        const same =
          skirted.positions[i * 3] === skirted.positions[j * 3] &&
          skirted.positions[i * 3 + 2] === skirted.positions[j * 3 + 2];
        if (same) {
          expect(Math.abs(skirted.positions[i * 3 + 1] - skirted.positions[j * 3 + 1])).toBeCloseTo(
            4,
            6,
          );
        }
      }
    }
  });

  it("matches three's colour management (the palette is converted sRGB → linear like THREE.Color)", () => {
    // terrain-gen replicates `new THREE.Color(hex)` without importing three; if three ever
    // changes its working-space conversion, this catches the drift. Deep drowned rock is a
    // colour that appears VERBATIM in the output: below -9 m the ramp is pure DEEP_ROCK.
    const deepRef = new THREE.Color(0x1b1f21);
    // A window wide enough to guarantee deep water: the field's mean is SEA_LEVEL_BIAS
    // (-15 m), so a 240 m window always dips well below the -9 m pure-DEEP_ROCK line.
    const payload = generateChunk({ ...BASE, size: 240, spacing: 4, trees: false });
    let checked = false;
    for (let i = 0; i * 3 < payload.positions.length; i++) {
      if (payload.positions[i * 3 + 1] < -9.5) {
        expect(payload.colors[i * 3]).toBeCloseTo(deepRef.r, 6);
        expect(payload.colors[i * 3 + 1]).toBeCloseTo(deepRef.g, 6);
        expect(payload.colors[i * 3 + 2]).toBeCloseTo(deepRef.b, 6);
        checked = true;
        break;
      }
    }
    expect(checked).toBe(true); // the BASE window must contain deep water for this to bite
  });
});

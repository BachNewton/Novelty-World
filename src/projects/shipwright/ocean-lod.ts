/**
 * The camera-following LOD ocean grid — pure geometry, no three.js.
 *
 * The uniform ocean plane spent ~1 M Gerstner vertices on far water that renders
 * subpixel detail; this grid keeps the shipped quad density near the camera and
 * doubles the quad size in concentric square rings outward, reaching the same
 * horizon for ~1/20th the vertices (see docs/PERFORMANCE.md "LOD ocean").
 *
 * Everything is built on ONE integer lattice in units of `baseQuad`:
 *
 *  - Every vertex of every ring sits at (i·baseQuad, j·baseQuad) for integer
 *    (i, j), and each ring's spacing is a power-of-two multiple of the base. So
 *    when the mesh follows the camera in steps of the COARSEST quad
 *    (`snapToLattice`), every vertex of every ring lands back on the identical
 *    set of world positions — the sampled wave field is bitwise-stable across
 *    snaps, which is what makes the follow invisible (no vertex "swimming").
 *  - Vertices are welded through a lattice-keyed map, so the output is a single
 *    watertight indexed mesh: T-junctions are impossible by construction, and
 *    the unit test proves it by edge-counting.
 *
 * Each level hands off to the next by OWNING its outer transition band: the
 * outermost row of cells drops every other perimeter vertex (leaving the next
 * ring's spacing) and triangulates the 2:1 step as a 3-triangle fan per coarse
 * cell, with an L-shaped fan at each corner. The outermost ring keeps its full
 * perimeter — there is nothing beyond it to match.
 */

export interface LodGridOptions {
  /** Quad edge (m) of the dense centre patch — the shipped ocean density. */
  baseQuad: number;
  /** Requested width (m) of the dense centre patch; rounded to the lattice. */
  nearExtent: number;
  /** Requested total width (m) of the whole grid; rounded to nearExtent·2^n. */
  extent: number;
}

export interface LodGrid {
  /** Flat (x, 0, z) triplets, centred on the origin. y is displaced in-shader. */
  positions: Float32Array;
  index: Uint32Array;
  /** Quad edge (m) of the outermost ring — the camera-follow snap step. */
  coarsestQuad: number;
  /** Actual dense-patch width (m) after rounding to the lattice. */
  nearExtent: number;
  /** Actual total width (m) after rounding to nearExtent·2^levels. */
  extent: number;
  /** Ring count around the centre patch (0 = a plain uniform patch). */
  levels: number;
  vertexCount: number;
  triangleCount: number;
}

/** Quantise `value` to the nearest multiple of `step` (the mesh-follow snap). */
export function snapToLattice(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function buildLodGrid(options: LodGridOptions): LodGrid {
  const { baseQuad } = options;
  if (!(baseQuad > 0)) throw new Error(`baseQuad must be positive, got ${baseQuad}`);

  // Cells per side of the centre patch. Must be a multiple of 4 so that every
  // level's outer half-extent is an EVEN number of its own quads — the
  // perimeter fans pair cells two at a time, and each ring's half-extent in its
  // own units is n0/2 (which the pairing needs even → n0 ≡ 0 mod 4).
  const n0 = Math.max(8, Math.round(options.nearExtent / baseQuad / 4) * 4);
  const b0 = n0 / 2; // centre-patch half-extent, in base-quad units
  const nearExtent = n0 * baseQuad;
  // Ring count: each ring doubles the covered width, so levels = log2(ratio).
  const levels = Math.max(0, Math.round(Math.log2(options.extent / nearExtent)));
  const extent = nearExtent * 2 ** levels;

  // --- Welded vertex store, keyed by the base-quad integer lattice ----------
  // Lattice coords stay well under 2^20, so a collision-free numeric key fits
  // comfortably in a double.
  const KEY_STRIDE = 1 << 21;
  const KEY_OFFSET = 1 << 20;
  const xs: number[] = [];
  const zs: number[] = [];
  const keyToIndex = new Map<number, number>();
  const vertexAt = (ix: number, iz: number): number => {
    const key = (ix + KEY_OFFSET) * KEY_STRIDE + (iz + KEY_OFFSET);
    const existing = keyToIndex.get(key);
    if (existing !== undefined) return existing;
    const idx = xs.length;
    xs.push(ix);
    zs.push(iz);
    keyToIndex.set(key, idx);
    return idx;
  };

  // Push a triangle given lattice coords, auto-orienting to face +y (upward).
  // Our convention renders front faces at NEGATIVE signed area in the xz plane
  // (x right, z toward the viewer — the post-rotateX(-π/2) frame the uniform
  // plane bakes and the rest of the ocean assumes).
  const index: number[] = [];
  const tri = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    cx: number,
    cz: number,
  ): void => {
    const area2 = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (area2 === 0) throw new Error("degenerate LOD grid triangle");
    const a = vertexAt(ax, az);
    const b = vertexAt(bx, bz);
    const c = vertexAt(cx, cz);
    if (area2 < 0) index.push(a, b, c);
    else index.push(a, c, b);
  };

  // A uniform s×s cell with its lower corner at lattice (x0, z0), split on the
  // ANTI-diagonal — the same split THREE.PlaneGeometry uses, so where this grid's
  // lattice coincides with the uniform plane's (the dense near patch), the two
  // meshes rasterise bit-identically and tools/verify-ocean-lod.mjs can gate the
  // near field on exact pixel identity rather than a tolerance.
  const quad = (x0: number, z0: number, s: number): void => {
    tri(x0, z0, x0, z0 + s, x0 + s, z0);
    tri(x0, z0 + s, x0 + s, z0 + s, x0 + s, z0);
  };

  // --- Levels ---------------------------------------------------------------
  // Level ℓ has spacing s = 2^ℓ (base-quad units). In its OWN spacing units it
  // spans half-extent b = b0 cells, with an inner hole of half-extent a = b0/2
  // for rings (a = 0 for the centre patch). Every ring therefore has identical
  // topology, and each level's outer boundary (b0 own-units = b0·2^ℓ base
  // units) equals the next level's inner hole (b0/2 own-units at spacing 2^ℓ⁺¹).
  for (let level = 0; level <= levels; level++) {
    const s = 2 ** level;
    const b = b0;
    const a = level === 0 ? 0 : b0 / 2;
    const hasTransition = level < levels; // last ring keeps a full perimeter

    // Uniform interior cells (own-unit cell coords ci, cj ∈ [-b, b-1]).
    for (let ci = -b; ci < b; ci++) {
      for (let cj = -b; cj < b; cj++) {
        // Skip cells inside the finer level's footprint.
        if (ci >= -a && ci + 1 <= a && cj >= -a && cj + 1 <= a) continue;
        // Skip perimeter cells when a transition band replaces them.
        if (hasTransition && (ci === -b || ci === b - 1 || cj === -b || cj === b - 1)) {
          continue;
        }
        quad(ci * s, cj * s, s);
      }
    }
    if (!hasTransition) continue;

    // Transition band: for each pair of perimeter cells (2 own-units wide), a
    // 3-triangle fan connects the full-density inner row to outer vertices at
    // DOUBLE spacing (= the next ring's lattice). Pairs cover m ∈ [-b+2, b-2];
    // the corners get an L-shaped 4-triangle fan below.
    for (let m = -b + 2; m <= b - 4; m += 2) {
      // north (z = +b) and south (z = -b)
      tri(m * s, b * s, m * s, (b - 1) * s, (m + 1) * s, (b - 1) * s);
      tri(m * s, b * s, (m + 1) * s, (b - 1) * s, (m + 2) * s, b * s);
      tri((m + 2) * s, b * s, (m + 1) * s, (b - 1) * s, (m + 2) * s, (b - 1) * s);
      tri(m * s, -b * s, m * s, -(b - 1) * s, (m + 1) * s, -(b - 1) * s);
      tri(m * s, -b * s, (m + 1) * s, -(b - 1) * s, (m + 2) * s, -b * s);
      tri((m + 2) * s, -b * s, (m + 1) * s, -(b - 1) * s, (m + 2) * s, -(b - 1) * s);
      // east (x = +b) and west (x = -b)
      tri(b * s, m * s, (b - 1) * s, m * s, (b - 1) * s, (m + 1) * s);
      tri(b * s, m * s, (b - 1) * s, (m + 1) * s, b * s, (m + 2) * s);
      tri(b * s, (m + 2) * s, (b - 1) * s, (m + 1) * s, (b - 1) * s, (m + 2) * s);
      tri(-b * s, m * s, -(b - 1) * s, m * s, -(b - 1) * s, (m + 1) * s);
      tri(-b * s, m * s, -(b - 1) * s, (m + 1) * s, -b * s, (m + 2) * s);
      tri(-b * s, (m + 2) * s, -(b - 1) * s, (m + 1) * s, -(b - 1) * s, (m + 2) * s);
    }
    // Corner L-fans: the three cells around each corner form a hexagon fanned
    // from the (always-kept) corner vertex.
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const o1x = sx * (b - 2) * s;
        const o1z = sz * b * s;
        const o2x = sx * b * s;
        const o2z = sz * b * s;
        const o3x = sx * b * s;
        const o3z = sz * (b - 2) * s;
        const i1x = sx * (b - 2) * s;
        const i1z = sz * (b - 1) * s;
        const i2x = sx * (b - 1) * s;
        const i2z = sz * (b - 1) * s;
        const i3x = sx * (b - 1) * s;
        const i3z = sz * (b - 2) * s;
        tri(o2x, o2z, o3x, o3z, i3x, i3z);
        tri(o2x, o2z, i3x, i3z, i2x, i2z);
        tri(o2x, o2z, i2x, i2z, i1x, i1z);
        tri(o2x, o2z, i1x, i1z, o1x, o1z);
      }
    }
  }

  const positions = new Float32Array(xs.length * 3);
  for (let i = 0; i < xs.length; i++) {
    positions[i * 3] = xs[i] * baseQuad;
    positions[i * 3 + 2] = zs[i] * baseQuad;
  }
  return {
    positions,
    index: new Uint32Array(index),
    coarsestQuad: baseQuad * 2 ** levels,
    nearExtent,
    extent,
    levels,
    vertexCount: xs.length,
    triangleCount: index.length / 3,
  };
}

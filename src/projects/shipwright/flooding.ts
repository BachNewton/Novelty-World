/**
 * The pure, deterministic core of Shipwright's air-cavity buoyancy + compartment-flooding model — the
 * STATIC half (a build's void graph + which pockets can hold air) plus the per-step FILL-FRACTION
 * target math. Extracted from physics.ts because it's self-contained (no THREE, no Rapier, no engine
 * state — just the integer cell list) and independently unit-tested (see physics.test.ts). The DYNAMIC
 * half — integrating each compartment's fill against the live sea surface and turning it into up-lift
 * or water-weight forces — lives in the buoyancy loop in physics.ts, which imports these.
 *
 * See physics.ts's module header for the full model narrative.
 */

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** A build's empty interior cells (voids), pre-analysed once so the per-step sea flood is cheap. */
export interface BuildVoids {
  /** Empty cells inside the material bounding box, in the build's integer grid (X right, Y up). */
  cells: [number, number, number][];
  /** Per void: does it touch a bounding-box face? Those are where the outside sea can reach in
   *  (a hull opening leaves an empty cell on the boundary), so they seed the flood when submerged. */
  exposed: boolean[];
  /** Per void: indices of its face-adjacent voids. Material cells aren't voids, so they're absent
   *  here — that's what walls the sea off. The flood walks this graph among submerged cells. */
  adjacency: number[][];
  /** Per void: is it AIR-CAPABLE — a pocket the hull could hold air in? True when the outside can't
   *  reach it by RISING + moving sideways (never descending over a rim), in the build's local frame.
   *  An orientation-independent shape property: the raft/bucket interior below the rim is enclosed,
   *  but a decorative crown's open volume ABOVE the rim is not (the sea rises into it from the side).
   *  Trapped air = enclosed AND its compartment's water level hasn't reached it (see the buoyancy loop). */
  enclosed: boolean[];
  /** Per void: which sealed COMPARTMENT it belongs to (a connected component of the ENCLOSED void
   *  graph), or -1 for an open void. An internal bulkhead splits a hull into two → ids 0 and 1. Each
   *  compartment floods to its own water level, so a breached bay doesn't flood a sealed neighbour. */
  compartment: number[];
}

/**
 * Pre-analyse a build's empty INTERIOR cells (the pockets a hull could hold air or water in) into the
 * adjacency graph, `enclosed` mask, and `compartment` ids the flooding model uses. Interior = empty
 * cells within the material's bounding box; a hole in the shell simply leaves an empty cell ON the
 * boundary (flagged `exposed`), which is how the sea finds its way in. Pure + deterministic — a
 * function of the cell list alone, cheap at build sizes, re-run per place/break by the voxel builder
 * to keep the graph correct as ships change.
 *
 * This is the STATIC half of the trapped-air model; the dynamic half runs each step in the buoyancy
 * loop, advancing a per-compartment water level against the live sea surface, so which cells are air
 * vs flooded is orientation- and waterline-correct as the hull rolls and bobs.
 */
export const analyzeBuildVoids = (
  cells: [number, number, number][],
): BuildVoids => {
  if (cells.length === 0)
    return { cells: [], exposed: [], adjacency: [], enclosed: [], compartment: [] };
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const solid = new Set<string>();
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const [x, y, z] of cells) {
    solid.add(key(x, y, z));
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const voidCells: [number, number, number][] = [];
  const voidIndex = new Map<string, number>();
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const k = key(x, y, z);
        if (!solid.has(k)) {
          voidIndex.set(k, voidCells.length);
          voidCells.push([x, y, z]);
        }
      }
    }
  }

  const exposed = voidCells.map(
    ([x, y, z]) =>
      x === minX || x === maxX ||
      y === minY || y === maxY ||
      z === minZ || z === maxZ,
  );
  const adjacency = voidCells.map(([x, y, z]) => {
    const nbrs: number[] = [];
    const faces: [number, number, number][] = [
      [x - 1, y, z], [x + 1, y, z],
      [x, y - 1, z], [x, y + 1, z],
      [x, y, z - 1], [x, y, z + 1],
    ];
    for (const [nx, ny, nz] of faces) {
      const j = voidIndex.get(key(nx, ny, nz));
      if (j !== undefined) nbrs.push(j);
    }
    return nbrs;
  });

  // Air-capable (enclosed) mask — the orientation-INDEPENDENT half of the model. Flood the outside
  // in through voids the sea could reach by RISING or moving sideways, never DESCENDING: seed from
  // voids open on a SIDE or the BOTTOM (the sea rises in / spreads in there) but NOT a top-only
  // opening (it can't rain down over a rim), then spread to non-lower neighbours. Reached = open;
  // the rest are enclosed pockets that hold air below a rim (raft/bucket interior) — while a crown's
  // open volume above the rim is reached from the side and correctly stays NOT air.
  const open = voidCells.map(
    ([x, y, z]) => x === minX || x === maxX || z === minZ || z === maxZ || y === minY,
  );
  const encStack: number[] = [];
  for (let i = 0; i < open.length; i++) if (open[i]) encStack.push(i);
  while (encStack.length > 0) {
    const i = encStack.pop();
    if (i === undefined) break;
    const yi = voidCells[i][1];
    for (const j of adjacency[i]) {
      if (open[j] || voidCells[j][1] < yi) continue; // skip already-open and downward (over-a-rim) moves
      open[j] = true;
      encStack.push(j);
    }
  }
  const enclosed = open.map((o) => !o);

  // Group the enclosed voids into COMPARTMENTS — connected components of the enclosed graph, walking
  // `adjacency` but only enclosed→enclosed (an open void breaks the connection, which is how a
  // bulkhead sealing a hull into two bays yields two compartments). Open voids get -1. Each
  // compartment floods to its own water level in the buoyancy loop.
  const compartment = voidCells.map(() => -1);
  let compartmentCount = 0;
  const compStack: number[] = [];
  for (let i = 0; i < voidCells.length; i++) {
    if (!enclosed[i] || compartment[i] !== -1) continue;
    const id = compartmentCount++;
    compartment[i] = id;
    compStack.push(i);
    while (compStack.length > 0) {
      const c = compStack.pop();
      if (c === undefined) break;
      for (const j of adjacency[c]) {
        if (enclosed[j] && compartment[j] === -1) {
          compartment[j] = id;
          compStack.push(j);
        }
      }
    }
  }

  return { cells: voidCells, exposed, adjacency, enclosed, compartment };
};

/** Per compartment: its enclosed-void cell indices, and the OPENING indices — the void cells where
 *  the sea meets the compartment. Two kinds, both taken at their own world height in the buoyancy
 *  loop: (a) an EXPOSED compartment cell — a hole flush with the hull surface, e.g. an open-top rim,
 *  which the sea touches directly; and (b) an OPEN void face-adjacent to the compartment — where it
 *  meets already-open interior volume (a side/bottom breach). A pure derivation of `analyzeBuildVoids`
 *  output, done once per build. A fully sealed compartment has NO openings → it never floods (keeps
 *  its air at any depth); every other fills through its openings toward the external waterline. */
export interface Compartments {
  /** cells[c] = enclosed-void indices making up compartment c. */
  cells: number[][];
  /** openings[c] = void indices where the sea meets compartment c (deduped): its own exposed cells
   *  plus the open voids adjacent to it. */
  openings: number[][];
}

export const groupCompartments = (voids: BuildVoids): Compartments => {
  let count = 0;
  for (const c of voids.compartment) if (c + 1 > count) count = c + 1;
  const cells: number[][] = Array.from({ length: count }, () => []);
  const openingSets: Set<number>[] = Array.from({ length: count }, () => new Set<number>());
  voids.compartment.forEach((c, i) => {
    if (c === -1) return;
    cells[c].push(i);
    // (a) An exposed compartment cell is itself a hole flush with the hull (an open-top rim / mouth):
    // the sea touches it directly, so it's an opening at its own height — the only openings an
    // upright open-top hull has, since nothing exists above the bounding box to be an open neighbour.
    if (voids.exposed[i]) openingSets[c].add(i);
    // (b) An open void face-adjacent to the compartment is where it meets already-open interior
    // volume that reaches the sea (a side or bottom breach).
    for (const j of voids.adjacency[i]) {
      if (voids.compartment[j] === -1) openingSets[c].add(j);
    }
  });
  return { cells, openings: openingSets.map((s) => [...s]) };
};

/**
 * The target water FILL FRACTION (0..1 of the compartment's cell span) a compartment seeks THIS step.
 * The fraction is the persistent state — it's POSE-INVARIANT, so it tracks the hull as it bobs/sinks/
 * rolls (a world-height level would freeze at spawn and spuriously flood cells as the body descends).
 * `ext` is the external sea surface at the compartment; `openingHeights` are its holes' world heights
 * (empty = fully sealed); `currentFill` is last step's fraction; `dryFloor`/`wetCeil` bound the
 * compartment's cells this pose (so `fracBelow(y)` = how full it is if the water surface sits at world
 * height `y`, treating the compartment as a uniform column — exact for boxes/buckets).
 *
 * - Sealed (no openings) → unchanged: no water can enter or leave, so it keeps its air at any depth.
 * - A hole underwater (below `ext`) → fill toward SEA LEVEL (`fracBelow(ext)`). We deliberately don't
 *   cap at the highest hole to trap air above it (a diving-bell seal) — not worth it at 0.5 m voxels,
 *   so any submerged hole simply floods the compartment.
 * - Otherwise (all holes above water) → drain out the LOWEST hole (`min(currentFill, fracBelow(lowest))`);
 *   water below that hole is trapped and can't run uphill out.
 *
 * The caller rate-limits the move toward this target (see the buoyancy loop). Pure.
 */
export const compartmentTargetFill = (
  openingHeights: number[],
  ext: number,
  currentFill: number,
  dryFloor: number,
  wetCeil: number,
): number => {
  const span = Math.max(wetCeil - dryFloor, 1e-6);
  const fracBelow = (y: number) => clamp((y - dryFloor) / span, 0, 1);
  if (openingHeights.length === 0) return currentFill;
  let lowest = Infinity;
  let anySubmerged = false;
  for (const h of openingHeights) {
    if (h < lowest) lowest = h;
    if (h < ext) anySubmerged = true;
  }
  return anySubmerged ? fracBelow(ext) : Math.min(currentFill, fracBelow(lowest));
};

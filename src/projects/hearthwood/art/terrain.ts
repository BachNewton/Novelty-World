import { BufferAttribute, BufferGeometry, DoubleSide } from "three";
import { REGIONS, type Region } from "../engine/regions";
import type { LandTile } from "../engine/tiles";
import type { AtmosphereUniforms } from "./atmosphere";
import { diorama, type DioramaMaterial } from "./materials";
import type { Palette, Thing } from "./palette";
import { GROUND, landPosition, landSurface, REGION_GROUND, setGround } from "./terrain-ground";

export { EARTH_RADIUS, earthCurve, followViewer } from "./terrain-ground";

/*
 * A tile of land as a mesh, and the one material every tile is drawn with.
 * Each vertex carries how much of each region it lies in and the smooth
 * fields the ground is read from (the woods, the water table, the river,
 * the wobble of the altitude bands), and the height its parent tile gives
 * it, so it can ease into the parent's shape before it is swapped for it.
 * The ground itself is painted per pixel (`terrain-ground.ts`). A skirt
 * hangs from the tile's edges, so where a finer tile meets a coarser one no
 * gap shows.
 */

/** The colour a region's woods show from above and far off, where the trees themselves are no longer drawn. */
const CANOPY: Record<Region, Thing> = {
  greenwood: "broadleaf",
  birchvale: "birch-leaf",
  highlands: "conifer",
  heath: "pine-leaf",
  maplewood: "maple-orange",
};

/** Where a tile eases into its parent's shape: from `start` metres from the camera, wholly by `end`, the distance it is swapped for its parent. */
export interface Morph {
  start: number;
  end: number;
}

export function terrainGeometry(tile: LandTile, morph: Morph): BufferGeometry {
  const { side, spacing, x0, z0 } = tile;
  const count = side * side;
  const edge = (side - 1) * 4;
  const total = count + edge;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const regions = new Float32Array(total * 4);
  const fields = new Float32Array(total * 4);
  const morphs = new Float32Array(total * 3);
  const n = REGIONS.length;

  for (let v = 0; v < count; v++) {
    positions.set([x0 + (v % side) * spacing, tile.heights[v], z0 + Math.floor(v / side) * spacing], v * 3);
    normals.set(tile.normals.subarray(v * 3, v * 3 + 3), v * 3);
    // The first four regions' shares: the last is what they leave.
    regions.set(tile.regions.subarray(v * n, v * n + 4), v * 4);
    fields.set([tile.woodland[v], tile.water[v], tile.river[v], tile.wobble[v]], v * 4);
    morphs.set([tile.parentHeights[v], morph.start, morph.end], v * 3);
  }

  // The skirt: a copy of each edge vertex hung below it, carrying all that vertex carries.
  const drop = Math.max(2, spacing * 1.5);
  const ring: number[] = [];
  for (let i = 0; i < side - 1; i++) ring.push(i);
  for (let j = 0; j < side - 1; j++) ring.push(j * side + side - 1);
  for (let i = side - 1; i > 0; i--) ring.push((side - 1) * side + i);
  for (let j = side - 1; j > 0; j--) ring.push(j * side);
  ring.forEach((v, k) => {
    const s = count + k;
    positions.set([positions[v * 3], positions[v * 3 + 1] - drop, positions[v * 3 + 2]], s * 3);
    normals.set(normals.subarray(v * 3, v * 3 + 3), s * 3);
    regions.set(regions.subarray(v * 4, v * 4 + 4), s * 4);
    fields.set(fields.subarray(v * 4, v * 4 + 4), s * 4);
    morphs.set([morphs[v * 3] - drop, morph.start, morph.end], s * 3);
  });

  const indices = new Uint32Array((side - 1) * (side - 1) * 6 + edge * 6);
  let k = 0;
  for (let r = 0; r < side - 1; r++) {
    for (let c = 0; c < side - 1; c++) {
      const a = r * side + c;
      const b = a + 1;
      const d = a + side;
      const e = d + 1;
      indices.set([a, d, b, b, d, e], k);
      k += 6;
    }
  }
  for (let e = 0; e < edge; e++) {
    const a = ring[e];
    const b = ring[(e + 1) % edge];
    const sa = count + e;
    const sb = count + ((e + 1) % edge);
    indices.set([a, b, sa, b, sb, sa], k);
    k += 6;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("regions", new BufferAttribute(regions, 4));
  geometry.setAttribute("fields", new BufferAttribute(fields, 4));
  geometry.setAttribute("morph", new BufferAttribute(morphs, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Where the worn ground goes while there is no fire: far off any land drawn. */
const NO_FIRE = 1e7;

/** The worn ground round camp's fire, moved to where camp is pitched, or gone while it is carried. */
export function moveTerrainFire(fire: { x: number; z: number } | null): void {
  GROUND.fire.value.set(fire?.x ?? NO_FIRE, fire?.z ?? NO_FIRE);
}

/** The land's material: one for every tile, its colours from the palette. */
export function terrainMaterial(atmosphere: AtmosphereUniforms, palette: Palette, treeReach: number): DioramaMaterial {
  const t = palette.things;
  setGround({ rock: t["ground-rock"], snow: t["ground-snow"], shore: t["ground-shore"], path: t["ground-path"], riverBed: t["ground-shore"].clone().lerp(t.rock, 0.4) });
  REGIONS.forEach((region, r) => {
    const colours = palette.regions[region];
    REGION_GROUND.meadow[r].value.copy(colours.meadow);
    REGION_GROUND.lush[r].value.copy(colours["meadow-lush"]);
    REGION_GROUND.forest[r].value.copy(colours.forest);
    REGION_GROUND.alpine[r].value.copy(colours.alpine);
    REGION_GROUND.canopy[r].value.copy(t[CANOPY[region]]);
  });
  GROUND.treeReach.value = treeReach;
  moveTerrainFire(null);
  // Skirts face whichever way their edge runs, so the land is drawn from both sides.
  return diorama("land", atmosphere, { side: DoubleSide }, { position: landPosition, surface: landSurface });
}

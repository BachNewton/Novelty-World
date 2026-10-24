import { BufferAttribute, BufferGeometry, DoubleSide, Vector2 } from "three";
import { attribute, cameraPosition, dot, Fn, length, mix, positionLocal, smoothstep, uniform, vec3 } from "three/tsl";
import type { Node, UniformNode } from "three/webgpu";
import { REGIONS, type Region } from "../engine/regions";
import type { LandTile } from "../engine/tiles";
import type { AtmosphereUniforms } from "./atmosphere";
import { regionFall } from "./features/seasons";
import type { Palette, RegionGround, Thing } from "./palette";
import { diorama, type DioramaMaterial } from "./materials";

/*
 * A tile of land as a mesh, and the material that paints it. Each vertex
 * carries its region's own meadow, lush meadow, forest floor and alpine
 * colours, and the smooth fields the ground is read from: how thick the
 * woods are, the water table, the river, and the wobble of the altitude
 * bands. Which ground shows is decided per pixel, not per vertex: the forest
 * floor, alpine grass, rock, snow, the wet shore and the trodden earth round
 * the fire each begin where their field crosses a threshold, softened and
 * set wavering by a little noise, so an edge reads as a soft line at any
 * angle and never follows the mesh's triangles. A skirt hangs from the
 * tile's edges, so where a finer tile meets a coarser one no gap shows.
 */

const OWN_GROUNDS: readonly RegionGround[] = ["meadow-lush", "forest", "alpine"];

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

export function terrainGeometry(tile: LandTile, palette: Palette, morph: Morph): BufferGeometry {
  const { side, spacing, x0, z0 } = tile;
  const count = side * side;
  const edge = (side - 1) * 4;
  const total = count + edge;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const meadow = new Float32Array(total * 3);
  const own = [...OWN_GROUNDS, "canopy"].map(() => new Float32Array(total * 3));
  const fields = new Float32Array(total * 4);
  const morphs = new Float32Array(total * 3);
  // The seasons' ground: the colour the region's woods turn, and how much of them are broadleaves.
  const fall = new Float32Array(total * 4);
  const falls = REGIONS.map(regionFall);

  for (let v = 0; v < count; v++) {
    positions.set([x0 + (v % side) * spacing, tile.heights[v], z0 + Math.floor(v / side) * spacing], v * 3);
    normals.set(tile.normals.subarray(v * 3, v * 3 + 3), v * 3);
    for (let r = 0; r < REGIONS.length; r++) {
      const share = tile.regions[v * REGIONS.length + r];
      if (share < 0.002) continue;
      const colours = palette.regions[REGIONS[r]];
      meadow[v * 3] += colours.meadow.r * share;
      meadow[v * 3 + 1] += colours.meadow.g * share;
      meadow[v * 3 + 2] += colours.meadow.b * share;
      OWN_GROUNDS.forEach((ground, g) => {
        own[g][v * 3] += colours[ground].r * share;
        own[g][v * 3 + 1] += colours[ground].g * share;
        own[g][v * 3 + 2] += colours[ground].b * share;
      });
      const canopy = palette.things[CANOPY[REGIONS[r]]];
      own[3][v * 3] += canopy.r * share;
      own[3][v * 3 + 1] += canopy.g * share;
      own[3][v * 3 + 2] += canopy.b * share;
      const { colour, share: broad } = falls[r];
      fall[v * 4] += colour.r * share;
      fall[v * 4 + 1] += colour.g * share;
      fall[v * 4 + 2] += colour.b * share;
      fall[v * 4 + 3] += broad * share;
    }
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
    for (const a of [normals, meadow, ...own]) a.set(a.subarray(v * 3, v * 3 + 3), s * 3);
    fields.set(fields.subarray(v * 4, v * 4 + 4), s * 4);
    fall.set(fall.subarray(v * 4, v * 4 + 4), s * 4);
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
  for (let n = 0; n < edge; n++) {
    const a = ring[n];
    const b = ring[(n + 1) % edge];
    const sa = count + n;
    const sb = count + ((n + 1) % edge);
    indices.set([a, b, sa, b, sb, sa], k);
    k += 6;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("color", new BufferAttribute(meadow, 3));
  geometry.setAttribute("lush", new BufferAttribute(own[0], 3));
  geometry.setAttribute("forest", new BufferAttribute(own[1], 3));
  geometry.setAttribute("alpine", new BufferAttribute(own[2], 3));
  geometry.setAttribute("canopy", new BufferAttribute(own[3], 3));
  geometry.setAttribute("fields", new BufferAttribute(fields, 4));
  geometry.setAttribute("morph", new BufferAttribute(morphs, 3));
  geometry.setAttribute("hwSeasonFall", new BufferAttribute(fall, 4));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The earth's radius, in metres: far land drops away below the horizon by the curve of the world. */
export const EARTH_RADIUS = 6_371_000;

/** A world-space point lowered by the curve of the world at its distance from the camera. */
export const earthCurve = Fn(([p]: [Node<"vec3">]) => {
  const off = p.xz.sub(cameraPosition.xz);
  return vec3(p.x, p.y.sub(dot(off, off).div(2 * EARTH_RADIUS)), p.z);
});

/** Each land material's worn ground round camp's fire, to move with camp. */
const FIRES = new WeakMap<DioramaMaterial, UniformNode<"vec2", Vector2>>();
/** Where the worn ground goes while there is no fire: far off any land drawn. */
const NO_FIRE = 1e7;

/** The worn ground round camp's fire, moved to where camp is pitched, or gone while it is carried. */
export function moveTerrainFire(material: DioramaMaterial, fire: { x: number; z: number } | null): void {
  const at = FIRES.get(material);
  if (!at) throw new Error("Not a land material: it has no fire to move");
  at.value.set(fire?.x ?? NO_FIRE, fire?.z ?? NO_FIRE);
}

export function terrainMaterial(atmosphere: AtmosphereUniforms, _palette: Palette, fire: { x: number; z: number } | null, _treeReach: number): DioramaMaterial {
  const fireAt = uniform(new Vector2(fire?.x ?? NO_FIRE, fire?.z ?? NO_FIRE));
  const morph = attribute<"vec3">("morph");
  const away = length(positionLocal.xz.sub(cameraPosition.xz));
  const eased = vec3(positionLocal.x, mix(positionLocal.y, morph.x, smoothstep(morph.y, morph.z, away)), positionLocal.z);
  // Skirts face whichever way their edge runs, so the land is drawn from both sides.
  const material = diorama("land", atmosphere, { side: DoubleSide }, { position: earthCurve(eased), surface: attribute<"vec3">("color") });
  FIRES.set(material, fireAt);
  return material;
}

import { BufferAttribute, BufferGeometry, DoubleSide, MeshLambertMaterial, Vector2, Vector3 } from "three";
import { ALTITUDE } from "../engine/land";
import { REGIONS, type Region } from "../engine/regions";
import type { LandTile } from "../engine/tiles";
import type { AtmosphereUniforms } from "./atmosphere";
import { regionFall } from "./features/seasons";
import type { Palette, RegionGround, Thing } from "./palette";
import { shadeLambert } from "./shading";

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

/** Lowers a vertex (`transformed`, in world space) by the curve of the world at its distance from the camera. */
export const CURVATURE = /* glsl */ `
  {
    vec2 hwOff = transformed.xz - cameraPosition.xz;
    transformed.y -= dot(hwOff, hwOff) / (2.0 * ${EARTH_RADIUS.toFixed(1)});
  }
`;

const VERTEX_HEADER = /* glsl */ `
attribute vec3 lush;
attribute vec3 forest;
attribute vec3 alpine;
attribute vec4 fields;
attribute vec3 morph;
attribute vec3 canopy;
varying vec3 vCanopy;
varying vec3 vLush;
varying vec3 vForest;
varying vec3 vAlpine;
varying vec4 vFields;
varying vec3 vUp;
`;

const VERTEX_MAIN = /* glsl */ `
  // Ease into the parent tile's shape towards the distance the tile is swapped for it, so the swap shows no step.
  float hwAway = length(transformed.xz - cameraPosition.xz);
  transformed.y = mix(transformed.y, morph.x, smoothstep(morph.y, morph.z, hwAway));
  ${CURVATURE}
  vLush = lush;
  vCanopy = canopy;
  vForest = forest;
  vAlpine = alpine;
  vFields = fields;
  vUp = normal;
`;

const FRAGMENT_HEADER = /* glsl */ `
uniform vec3 uRock;
uniform vec3 uSnow;
uniform vec3 uShore;
uniform vec3 uPath;
uniform vec3 uRiverBed;
/** The treeline, where rock begins and where snow begins, in metres. */
uniform vec3 uBands;
uniform vec2 uFire;
/** How far the trees themselves are drawn: past it, the woods are painted. */
uniform float uTreeReach;
varying vec3 vCanopy;
varying vec3 vLush;
varying vec3 vForest;
varying vec3 vAlpine;
varying vec4 vFields;
varying vec3 vUp;

// How much of a pattern shows whose cycles are a given number of pixels' width apart: fading out before they
// come closer than a couple of pixels, so far faces never shimmer.
float hwShows(float cyclesPerPixel) { return 1.0 - smoothstep(0.18, 0.45, cyclesPerPixel); }

// A soft band of uneven width along s (one unit about one band): value noise along it, sharpened towards its
// edges no more than the pixels allow, faded to its mean where the bands come too close to draw.
float hwBands(float s, float seed) {
  float w = fwidth(s);
  float n = hwValueNoise(vec2(s, seed));
  float sharp = mix(n, smoothstep(0.3, 0.7, n), hwShows(w * 2.0));
  return mix(0.5, sharp, hwShows(w));
}

// Mountain rock as a storybook paints it: beds of uneven width that dip and wander across a face and are broken
// up along it, over large-scale tone (pale buttresses, darker gullies running down the faces), steep walls
// darker and scree paler below them.
vec3 hwStone(vec2 p, float h, float slope, float fine) {
  float pixel = length(fwidth(p));
  // Where a bed lies: its height, tilted gently across the land and warped, so the beds dip and wander.
  float bed = h + dot(p, vec2(0.09, -0.05)) + (hwValueNoise(p / 700.0) - 0.5) * 220.0 + (hwValueNoise(p / 170.0 + 3.7) - 0.5) * 80.0 + (hwValueNoise(p / 55.0 - 1.9) - 0.5) * 14.0;
  // Broken along the face: each set of beds shows strongly in some stretches and fades in others.
  float broken = smoothstep(0.3, 0.7, hwValueNoise(p / 190.0 + 11.3));
  float patchy = smoothstep(0.3, 0.7, hwValueNoise(p / 75.0 - 4.1));
  float beds = (hwBands(bed / 55.0, 1.7) - 0.5) * (0.1 + 0.22 * broken)
             + (hwBands(bed / 13.0 + 0.4, 7.3) - 0.5) * 0.16 * patchy
             + (hwBands(bed / 4.2, 3.9) - 0.5) * 0.08 * broken * patchy;
  // The beds read on the walls, where they are cut across; scree and gentle rock are a speckle.
  float walls = smoothstep(0.45, 1.1, slope);
  // Buttresses pale and dark, and gullies: on a steep face the land's breadth hardly changes down it, so a pattern
  // across it runs straight down the face, as gullies and the ribs between them do.
  float buttress = hwValueNoise(p / 320.0 + 5.5) * 0.6 + (hwValueNoise(p / 95.0 - 2.2) - 0.5) * 0.8 * hwShows(pixel / 95.0) + 0.2;
  float gully = (1.0 - smoothstep(0.15, 0.5, hwValueNoise(p / 26.0 + 8.8))) * hwShows(pixel / 26.0) * walls;
  float tone = 0.7 + 0.42 * buttress + beds * walls - 0.2 * gully + (fine - 0.5) * 0.3;
  return uRock * tone * mix(1.08, 0.9, smoothstep(0.8, 1.6, slope));
}
`;

/** Which ground shows, per pixel, from the fields; then darker under the woods. */
const GROUND = /* glsl */ `
  vec2 hwP = vHwWorld.xz;
  float hwWave = hwValueNoise(hwP * 0.31);
  // The fine noise every edge wavers by, faded where it is finer than the pixels, so far edges stay soft and still.
  float hwFine = mix(0.5, hwValueNoise(hwP * 1.7), hwShows(length(fwidth(hwP)) * 1.7));
  float hwWood = vFields.x;
  float hwH = vHwWorld.y;
  vec3 hwUp = normalize(vUp);
  float hwSlope = length(hwUp.xz) / max(hwUp.y, 0.05);
  float hwBand = vFields.w + (hwWave - 0.5) * 7.0;
  float hwLushness = smoothstep(0.25, 0.75, hwValueNoise(hwP / 34.0) * 0.7 + hwValueNoise(hwP / 11.0) * 0.3);
  vec3 hwGround = mix(diffuseColor.rgb, vLush, hwLushness);
  hwGround = mix(hwGround, vForest, smoothstep(0.28, 0.5, hwWood + (hwFine - 0.5) * 0.18));
  hwGround = mix(hwGround, vAlpine, smoothstep(uBands.x - 6.0 + hwBand, uBands.x + 8.0 + hwBand, hwH));
  float hwRock = max(smoothstep(uBands.y - 5.0 + hwBand, uBands.y + 5.0 + hwBand, hwH), smoothstep(1.0, 1.35, hwSlope + (hwFine - 0.5) * 0.3));
  hwGround = mix(hwGround, hwStone(hwP, hwH, hwSlope, hwFine), hwRock);
  // Snow lies on the flatter ground at first, and the higher it goes above its line the steeper the ground it clings to.
  float hwCling = 0.7 * smoothstep(0.0, 600.0, hwH - uBands.z - hwBand);
  float hwSnow = smoothstep(uBands.z - 6.0 + hwBand, uBands.z + 3.0 + hwBand, hwH) * (1.0 - smoothstep(0.55 + hwCling, 0.85 + hwCling, hwSlope + (hwFine - 0.5) * 0.2));
  hwGround = mix(hwGround, uSnow, hwSnow);
  float hwAbove = hwH - vFields.y + (hwWave - 0.5) * 0.5;
  hwGround = mix(hwGround, uShore, 1.0 - smoothstep(0.3, 1.1, hwAbove));
  hwGround = mix(hwGround, uRiverBed, smoothstep(0.35, 0.65, vFields.z + (hwFine - 0.5) * 0.15) * (1.0 - smoothstep(0.0, 0.6, hwAbove)));
  hwGround = mix(hwGround, uPath, 0.9 * (1.0 - smoothstep(3.0, 6.0, length(hwP - uFire) + (hwWave - 0.5) * 2.0)));
  hwGround *= 1.0 - 0.3 * smoothstep(0.1, 0.9, hwWood);
  // Out where the trees are no longer drawn, the woods are painted in as their canopy, mottled crown by crown, fading in before the last trees.
  float hwFar = smoothstep(uTreeReach * 0.7, uTreeReach * 0.95, length(vHwWorld.xz - cameraPosition.xz));
  float hwCrowns = hwValueNoise(hwP * 0.45) * 0.5 + hwValueNoise(hwP * 0.13) * 0.5;
  float hwCanopy = hwFar * smoothstep(0.2, 0.45, hwWood + (hwCrowns - 0.5) * 0.3) * (1.0 - hwSnow) * (1.0 - hwRock);
  diffuseColor.rgb = mix(hwGround, vCanopy * (0.62 + 0.45 * hwCrowns), hwCanopy);
`;

export function terrainMaterial(atmosphere: AtmosphereUniforms, palette: Palette, fire: { x: number; z: number }, treeReach: number): MeshLambertMaterial {
  const t = palette.things;
  const uniforms = {
    uRock: { value: t["ground-rock"] },
    uSnow: { value: t["ground-snow"] },
    uShore: { value: t["ground-shore"] },
    uPath: { value: t["ground-path"] },
    uRiverBed: { value: t["ground-shore"].clone().lerp(t.rock, 0.4) },
    uBands: { value: new Vector3(ALTITUDE.treeline, ALTITUDE.rock, ALTITUDE.snow) },
    uFire: { value: new Vector2(fire.x, fire.z) },
    uTreeReach: { value: treeReach },
  };
  // Skirts face whichever way their edge runs, so the land is drawn from both sides.
  return shadeLambert(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }), "land", atmosphere, {
    key: "terrain",
    uniforms,
    vertexHead: VERTEX_HEADER,
    vertex: VERTEX_MAIN,
    fragmentHead: FRAGMENT_HEADER,
    surface: GROUND,
  });
}

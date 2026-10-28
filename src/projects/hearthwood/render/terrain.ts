import { BufferAttribute, BufferGeometry, Color, InterleavedBuffer, InterleavedBufferAttribute, MeshBasicNodeMaterial } from "three/webgpu";
import { cameraPosition, float, max, min, mix, mx_noise_float, normalize, positionLocal, positionWorld, smoothstep, uniform, varying, vec2, vec3, dot } from "three/tsl";
import { ALTITUDE } from "../engine/land";
import { REGIONS, type Region } from "../engine/regions";
import { broadleafMix, broadleafShare, SEASON_GROUPS, type SeasonGroup } from "../engine/seasons";
import type { LandTile } from "../engine/tiles";
import { earthDrop, lit, throughAir } from "./air";
import type { Palette, RegionGround, Thing } from "./palette";
import { vec3Attribute, vec4Attribute, colourOf, type Float, type Vec2, type Vec3 } from "./tsl";

/*
 * A tile of land as a mesh, and the one material every tile is drawn with.
 * Each vertex carries its regions' own grounds (meadow, forest floor,
 * alpine grass, and the colour their woods show from afar) and the smooth
 * fields the ground is read from: how thick the woods are, the water table,
 * the river, and the wobble of the altitude bands. Which ground shows is
 * decided per pixel, each beginning where its field crosses a threshold set
 * wavering by a little noise, so an edge reads as a soft line and never
 * follows the triangles. The season moves the grass from straw to new green
 * to autumn gold and lays snow down to its line; past where trees are drawn,
 * the woods are painted in as their canopy, which turns and goes bare too.
 *
 * Each tile eases into its parent's shape over the stretch before it is
 * swapped for it, and hangs a skirt from its edges, so levels join with no
 * seam or step; the land drops away by the curve of the earth.
 */

/** The colour a region's woods show from above and far off, where the trees themselves are no longer drawn. */
const CANOPY: Record<Region, Thing> = {
  greenwood: "broadleaf",
  birchvale: "birch-leaf",
  highlands: "conifer",
  heath: "pine-leaf",
  maplewood: "maple-orange",
};

/** A region's canopy colour in summer: the maple wood's maples are drawn in their autumn colours, so its summer is the season's own. */
function canopyOf(region: Region, palette: Palette): Color {
  if (region === "maplewood") return palette.seasons.summer[SEASON_GROUPS.indexOf("maple")] ?? palette.things[CANOPY[region]];
  return palette.things[CANOPY[region]];
}

const OWN_GROUNDS: readonly RegionGround[] = ["meadow", "forest", "alpine"];

/** Where a tile eases into its parent's shape: from `start` metres from the camera, wholly by `end`, the distance it is swapped for its parent. */
export interface Morph {
  start: number;
  end: number;
}

/** The ground's season, set once a frame. */
export const groundSeason = {
  /** Where seasonal snow lies from, against the bands, in metres. */
  snowLine: uniform(ALTITUDE.snow),
  /** Dormant straw, new green, autumn gold, fallen leaves: each 0 to 1. */
  dormant: uniform(0),
  fresh: uniform(0),
  gold: uniform(0),
  litter: uniform(0),
  /** How far the far broadleaves have turned, and how bare they are. */
  canopyTurn: uniform(0),
  canopyBare: uniform(0),
};

/** The colour a region's broadleaves turn, seen from afar, and how much of its woods are broadleaves. */
function regionFall(region: Region, palette: Palette): { colour: Color; share: number } {
  const colour = new Color(0, 0, 0);
  for (const [group, weight] of Object.entries(broadleafMix(region)) as [SeasonGroup, number][]) {
    const g = SEASON_GROUPS.indexOf(group);
    const turned =
      group === "maple" ? palette.things["maple-orange"] : group === "aspen" ? palette.things["aspen-gold"] : (palette.seasons.autumn[g] ?? new Color()).clone().lerp(palette.seasons["autumn-alt"][g] ?? new Color(), 0.5);
    colour.add(turned.clone().multiplyScalar(weight));
  }
  return { colour, share: broadleafShare(region) };
}

export function terrainGeometry(tile: LandTile, palette: Palette, morph: Morph): BufferGeometry {
  const { side, spacing, x0, z0 } = tile;
  const count = side * side;
  const edge = (side - 1) * 4;
  const total = count + edge;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const grounds = [...OWN_GROUNDS, "canopy"].map(() => new Float32Array(total * 3));
  const fields = new Float32Array(total * 4);
  const morphs = new Float32Array(total * 3);
  const fall = new Float32Array(total * 4);
  const falls = REGIONS.map((r) => regionFall(r, palette));

  for (let v = 0; v < count; v++) {
    positions.set([x0 + (v % side) * spacing, tile.heights[v], z0 + Math.floor(v / side) * spacing], v * 3);
    normals.set(tile.normals.subarray(v * 3, v * 3 + 3), v * 3);
    for (let r = 0; r < REGIONS.length; r++) {
      const share = tile.regions[v * REGIONS.length + r];
      if (share < 0.002) continue;
      const colours = palette.regions[REGIONS[r]];
      OWN_GROUNDS.forEach((ground, g) => {
        grounds[g][v * 3] += colours[ground].r * share;
        grounds[g][v * 3 + 1] += colours[ground].g * share;
        grounds[g][v * 3 + 2] += colours[ground].b * share;
      });
      const canopy = canopyOf(REGIONS[r], palette);
      grounds[3][v * 3] += canopy.r * share;
      grounds[3][v * 3 + 1] += canopy.g * share;
      grounds[3][v * 3 + 2] += canopy.b * share;
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
    for (const a of [normals, ...grounds]) a.set(a.subarray(v * 3, v * 3 + 3), s * 3);
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
  // The four grounds share one buffer: a pipeline may read only eight.
  const packed = new Float32Array(total * 12);
  for (let v = 0; v < total; v++) grounds.forEach((g, k) => packed.set(g.subarray(v * 3, v * 3 + 3), v * 12 + k * 3));
  const buffer = new InterleavedBuffer(packed, 12);
  geometry.setAttribute("meadow", new InterleavedBufferAttribute(buffer, 3, 0));
  geometry.setAttribute("forest", new InterleavedBufferAttribute(buffer, 3, 3));
  geometry.setAttribute("alpine", new InterleavedBufferAttribute(buffer, 3, 6));
  geometry.setAttribute("canopy", new InterleavedBufferAttribute(buffer, 3, 9));
  geometry.setAttribute("fields", new BufferAttribute(fields, 4));
  geometry.setAttribute("morph", new BufferAttribute(morphs, 3));
  geometry.setAttribute("fall", new BufferAttribute(fall, 4));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Where a tile's vertex is drawn: eased into its parent's shape by its distance, and dropped by the earth's curve. */
export function morphedPosition(): { position: Vec3; height: Float } {
  const morph = vec3Attribute("morph");
  const distance = positionLocal.xz.sub(cameraPosition.xz).length();
  const eased = smoothstep(morph.y, morph.z, distance);
  const height = mix(positionLocal.y, morph.x, eased);
  const at = vec3(positionLocal.x, height, positionLocal.z);
  return { position: vec3(at.x, at.y.sub(earthDrop(at)), at.z), height };
}

/** A grain of noise over the land, in about -1 to 1, at two scales, each fading out before it is too fine for the pixels at its distance so the far land never speckles. */
function grain(at: Vec2, distance: Float): Float {
  const broad = mx_noise_float(vec3(at.x.mul(0.045), 0, at.y.mul(0.045))).mul(float(1).sub(smoothstep(400, 2500, distance)));
  const fine = mx_noise_float(vec3(at.x.mul(0.31), 3.7, at.y.mul(0.31))).mul(0.35).mul(float(1).sub(smoothstep(60, 400, distance)));
  return broad.add(fine);
}

function retint(colour: Vec3, target: Vec3): Vec3 {
  const luminance = vec3(0.3, 0.59, 0.11);
  return target.mul(dot(colour, luminance).div(max(dot(target, luminance), 0.001)));
}

export function terrainMaterial(palette: Palette, treesFar: number): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  const { position, height: morphedHeight } = morphedPosition();
  material.positionNode = position;

  const height: Float = varying(morphedHeight);
  const fields = vec4Attribute("fields");
  const woodland = fields.x;
  const water = fields.y;
  const river = fields.z;
  const wobble = fields.w;
  const fall = vec4Attribute("fall");
  const normal = normalize(vec3Attribute("normal"));
  const at = vec2(positionWorld.x, positionWorld.z);
  const distance = positionWorld.sub(cameraPosition).length();
  const noise = grain(at, distance);
  const slope = float(1).sub(normal.y);
  const banded = height.sub(wobble);

  // The grass through the year, and the forest floor's fallen leaves.
  const meadowBase = vec3Attribute("meadow");
  let meadow: Vec3 = mix(meadowBase, retint(meadowBase, colourOf(palette.ground["ground-fresh"])), groundSeason.fresh.mul(0.6));
  const autumn = mix(colourOf(palette.ground["ground-gold"]), colourOf(palette.ground["ground-russet"]), smoothstep(-0.3, 0.6, noise));
  meadow = mix(meadow, autumn, groundSeason.gold.mul(0.65));
  meadow = mix(meadow, colourOf(palette.ground["ground-dormant"]), groundSeason.dormant.mul(0.8));
  const forest = mix(vec3Attribute("forest"), fall.xyz.mul(0.7), groundSeason.litter.mul(fall.w).mul(0.6));
  let ground: Vec3 = mix(meadow, forest, smoothstep(0.3, 0.6, woodland.add(noise.mul(0.08))));

  // The bands up the mountains: alpine grass above the trees, then scree and bare rock, and rock on anything too steep to hold soil.
  const alpine = smoothstep(ALTITUDE.treeline - 30, ALTITUDE.treeline + 50, banded.add(noise.mul(25)));
  ground = mix(ground, vec3Attribute("alpine"), alpine);
  const rocky = max(smoothstep(ALTITUDE.rock - 60, ALTITUDE.rock + 60, banded.add(noise.mul(40))), smoothstep(0.3, 0.42, slope.add(noise.mul(0.04))));
  const rock = colourOf(palette.things["ground-rock"]).mul(float(1).sub(slope.mul(0.35)));
  ground = mix(ground, rock, rocky);

  // The shore, river channels and the lake beds.
  const dry = height.sub(water);
  const shore = max(float(1).sub(smoothstep(0.3, 1.4, dry.add(noise.mul(0.3)))), smoothstep(0.3, 0.7, river));
  ground = mix(ground, colourOf(palette.things["ground-shore"]), shore);

  // The far woods painted in, past where the trees are drawn, turning and going bare with the broadleaves.
  let canopy: Vec3 = vec3Attribute("canopy").mul(noise.mul(0.12).add(0.92));
  canopy = mix(canopy, fall.xyz, groundSeason.canopyTurn.mul(fall.w));
  canopy = mix(canopy, colourOf(palette.seasons.bare[SEASON_GROUPS.indexOf("birch")] ?? new Color()), groundSeason.canopyBare.mul(fall.w).mul(0.8));
  const far = smoothstep(treesFar * 0.7, treesFar * 0.95, distance).mul(smoothstep(0.3, 0.55, woodland));
  ground = mix(ground, canopy, far);

  // Snow down to the season's line (the high snowfields' always), clinging to steeper ground the higher it lies, and never on a lake bed.
  const line = min(groundSeason.snowLine, float(ALTITUDE.snow));
  const above = banded.add(noise.mul(60)).sub(line);
  const holds = float(1).sub(smoothstep(0.25, 0.5, slope.sub(above.div(2500))));
  const snow = smoothstep(-30, 30, above).mul(holds).mul(smoothstep(-0.2, 0.3, dry));
  ground = mix(ground, colourOf(palette.things["ground-snow"]), snow);

  material.colorNode = throughAir(lit(ground, normal), positionWorld);
  material.fog = false;
  return material;
}

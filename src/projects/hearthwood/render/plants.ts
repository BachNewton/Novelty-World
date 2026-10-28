import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  Group,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  LinearFilter,
  Mesh,
  MeshBasicNodeMaterial,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  type BufferGeometry,
  type Vector3,
} from "three/webgpu";
import { abs, cos, float, floor, fract, int, max, min, mix, sin, smoothstep, step, texture, uniform, varying, vec2, vec3 } from "three/tsl";
import { ALTITUDE } from "../engine/land";
import type { Plant } from "../engine/life";
import { PLANT_KINDS, type PlantKind } from "../engine/regions";
import { plantSeason, plantVariation, seasonGroupOf, SEASON_GROUPS, type SeasonGroup } from "../engine/seasons";
import { chunkDetail, distanceToSquare, PLANT_CLASS, wantedChunks, type Detail } from "../engine/streaming";
import { PLANT_CHUNK, PLANT_VARIANTS } from "../engine/life";
import type { World } from "../engine/world";
import type { Quality } from "../quality";
import { lit, throughAir } from "./air";
import { SEASON_PARTS, type SeasonPart } from "./painted";
import { AUTUMN_IN_SHAPE, type Palette } from "./palette";
import { plantShape } from "./plant-shapes";
import { groundSeason } from "./terrain";
import { vec3Attribute, vec4Attribute, colourOf, type Vec3, colourArray, floatArray } from "./tsl";

/*
 * The plants and stones round the camera: every design of every kind, at
 * each level of detail, is one instanced draw holding every copy of it near
 * enough to show, so the whole forest is a few dozen draws. Each copy is
 * three numbers' worth of placing (where it stands, its turn, its scale and
 * colour shift, and its own timing in the year), and the chunks they come
 * from are scattered a few a frame, nearest first, and kept a while.
 *
 * The seasons are worked out per vertex from a small table of every season
 * group's year (a texture a year wide, a row a group: leaf, fresh, turn and
 * bloom), read at the date moved by the plant's own timing: crowns grow in
 * and fall a mass at a time, far crowns thin to a haze of twigs, small
 * plants grow and die back, flowers open and go, the colour goes from the
 * young green through the summer's to the plant's autumn colour, and snow
 * lies on whatever faces up where the snow line says. Light and air are
 * worked out per vertex too, so the fragments only pass the colour on.
 */

/** How far the camera moves before the chunks drawn are worked out again, in metres. */
const RECHECK = 16;
/** While the plants stream in, they are redrawn after this many more chunks have been scattered. */
const REDRAW_EVERY = 48;
/** How many chunks' plants are kept once worked out. */
const KEPT_CHUNKS = 2400;
/** Numbers per copy: where it stands and its turn; its scale and colour shift; its timing, autumn hue and the bands where it grows. */
const STRIDE = 12;
const YEAR = 365;
const ROWS = SEASON_GROUPS.length;

interface Design {
  kind: PlantKind;
  variant: number;
  detail: Detail;
  mesh: Mesh;
  geometry: InstancedBufferGeometry;
  data: Float32Array;
  buffer: InstancedInterleavedBuffer | null;
}

const designKey = (kind: PlantKind, variant: number, detail: Detail) => `${kind}/${variant}/${detail}`;

/** The year of every group as a texture: a texel a day across, a row a group. */
function phenologyTable(): DataTexture {
  const data = new Uint8Array(YEAR * ROWS * 4);
  SEASON_GROUPS.forEach((g, row) => {
    for (let day = 0; day < YEAR; day++) {
      const s = plantSeason(g, day + 0.5);
      data.set([s.leaf, s.fresh, s.turn, s.bloom].map((v) => Math.round(v * 255)), (row * YEAR + day) * 4);
    }
  });
  const table = new DataTexture(data, YEAR, ROWS, RGBAFormat, UnsignedByteType);
  table.magFilter = LinearFilter;
  table.minFilter = LinearFilter;
  table.wrapS = RepeatWrapping;
  table.wrapT = ClampToEdgeWrapping;
  table.needsUpdate = true;
  return table;
}

/** The real day of the year the plants are drawn on, set once a frame. */
export const plantSeasonDay = uniform(0);

const part = (name: SeasonPart) => SEASON_PARTS.indexOf(name);
const groupIndex = (name: SeasonGroup) => SEASON_GROUPS.indexOf(name);

function plantMaterial(palette: Palette, table: DataTexture): MeshBasicNodeMaterial {
  const colours = (role: "fresh" | "summer" | "autumn" | "autumn-alt" | "bare") => colourArray(palette.seasons[role].map((c) => c ?? new Color()));
  const fresh = colours("fresh");
  const summer = colours("summer");
  const autumnColour = colours("autumn");
  const autumnAlt = colours("autumn-alt");
  const bare = colours("bare");
  const inShape = floatArray(SEASON_GROUPS.map((g) => (AUTUMN_IN_SHAPE.includes(g) ? 1 : 0)));

  const material = new MeshBasicNodeMaterial();
  const place = vec4Attribute("place");
  const size = vec4Attribute("size");
  const own = vec4Attribute("own");
  const season = vec4Attribute("hwSeason");
  const piece = vec3Attribute("hwSeasonPiece");
  const local = vec3Attribute("position");
  const normal = vec3Attribute("normal");
  const baseColour = vec3Attribute("color");

  const role = season.x;
  const pieceShade = season.y;
  const share = season.z;
  const partOf = floor(role.div(16).add(0.01));
  const groupOf = floor(role.sub(partOf.mul(16)).add(0.5));
  const g = int(groupOf);
  const day = plantSeasonDay.sub(own.x);
  const state = texture(table, vec2(day.div(YEAR), groupOf.add(0.5).div(float(ROWS)))).level(float(0));
  const leaf = state.r;
  // Which part and group a vertex is, as weights of 0 or 1: the shader blends every case by them rather than
  // branching, since three can turn a branch over large expressions into blocks that leave values unset.
  const is = (name: SeasonPart) => float(1).sub(step(0.5, abs(partOf.sub(part(name)))));
  const inGroup = (name: SeasonGroup) => float(1).sub(step(0.5, abs(groupOf.sub(groupIndex(name)))));

  // Which of a crown's masses go first is the tree's own; the last ones left are smaller.
  const pick = fract(share.add(own.y.mul(7.31)));
  const crownScale = smoothstep(pick.mul(0.85), pick.mul(0.85).add(0.15), leaf).mul(smoothstep(0.2, 0.9, leaf).mul(0.4).add(0.6));
  const bloomScale = state.a.mul(smoothstep(0.01, 0.03, leaf));
  const scale = float(1)
    .add(is("crown").mul(crownScale.sub(1)))
    .add(is("far-crown").mul(leaf.mul(0.45).sub(0.45)))
    .add(is("herb").mul(leaf.sub(1)))
    .add(is("blossom").mul(inGroup("flowers")).mul(bloomScale.sub(1)));
  const grown = piece.add(local.sub(piece).mul(scale));

  const turn = place.w;
  const c = cos(turn);
  const s = sin(turn);
  const scaled = grown.mul(size.xyz);
  const world = vec3(scaled.x.mul(c).add(scaled.z.mul(s)), scaled.y, scaled.z.mul(c).sub(scaled.x.mul(s))).add(place.xyz);
  material.positionNode = world;
  const worldNormal = vec3(normal.x.mul(c).add(normal.z.mul(s)), normal.y, normal.z.mul(c).sub(normal.x.mul(s)));

  // The colour through the year.
  const base = baseColour.div(max(pieceShade, 0.001));
  const hue = own.y;
  const shaped = inShape.element(g);
  const summerColour = mix(base, summer.element(g), shaped);
  const autumn = mix(mix(autumnColour.element(g), autumnAlt.element(g), hue), mix(base, autumnAlt.element(g), hue.mul(0.45)), shaped);
  let leafy: Vec3 = mix(summerColour, fresh.element(g), state.g);
  leafy = mix(leafy, autumn, state.b);
  // The last leaves on a turned tree wither, a far crown goes to bare twigs, and small plants brown as they die back.
  const crownColour = mix(leafy, bare.element(g).mul(1.25), state.b.mul(float(1).sub(smoothstep(0.15, 0.75, leaf))).mul(0.7));
  const farColour = mix(bare.element(g), leafy, smoothstep(0, 0.7, leaf));
  const herbColour = mix(leafy, bare.element(g), min(float(1).sub(leaf).mul(3.5), 1));
  const blossomColour = mix(base, mix(bare.element(g), base, state.a), inGroup("heather"));
  const seasonal = base
    .add(crownColour.sub(base).mul(is("crown")))
    .add(farColour.sub(base).mul(is("far-crown")))
    .add(herbColour.sub(base).mul(is("herb")))
    .add(blossomColour.sub(base).mul(is("blossom")));
  const tint = own.w;
  const bright = sin(place.x.mul(0.37).add(place.z.mul(0.23))).mul(0.08).add(0.92);
  const tinted = seasonal.mul(pieceShade).mul(vec3(tint.mul(0.12).add(1), tint.mul(0.03).add(1), tint.mul(-0.12).add(1))).mul(bright);

  // Snow where it lies against the bands where the plant grows, on whatever faces up.
  const up = worldNormal.y.add(share.sub(0.5).mul(0.25));
  const line = min(groundSeason.snowLine, float(ALTITUDE.snow));
  const snowHere = smoothstep(line.sub(30), line.add(30), place.y.sub(own.z).add(own.y.sub(0.5).mul(90)));
  const needles = inGroup("conifer").add(inGroup("pine"));
  const woody = is("branch").add(is("bark"));
  const holds = float(1).sub(is("none")).mul(mix(mix(float(0.9), float(0.7), needles), float(0.65), woody));
  const cover = snowHere.mul(holds).mul(mix(smoothstep(0.2, 0.7, up), smoothstep(0.5, 0.85, up), needles));
  const coloured = mix(tinted, colourOf(palette.things["ground-snow"]).mul(pieceShade.mul(0.18).add(0.82)), cover);

  material.colorNode = varying(throughAir(lit(coloured, worldNormal), world));
  material.fog = false;
  return material;
}

/** A plant's copy as numbers, written at `at`. */
function writePlant(p: Plant, out: Float32Array, at: number): void {
  const sink = p.kind === "rock" ? p.size * 0.12 : p.kind === "flowers" || p.kind === "fern" ? 0 : 0.12;
  const stretch = p.stretch;
  const sx = p.kind === "rock" ? p.size : p.size / Math.sqrt(stretch);
  const sy = p.kind === "rock" ? p.size * (0.6 + 0.5 * (stretch - 0.85)) * 1.4 : p.size * stretch;
  const sz = p.kind === "rock" ? p.size * stretch : p.size / Math.sqrt(stretch);
  const { offset, hue } = plantVariation(seasonGroupOf(p.kind, p.variant), p.x, p.z);
  out.set([p.x, p.y - sink, p.z, p.turn, sx, sy, sz, p.tint * (p.kind === "rock" ? 0.4 : 1), offset, hue, p.bands, 0], at);
}

export interface Plants {
  object: Group;
  /** Streams the plants round the eye; returns whether every chunk it wants is drawn. */
  update: (eye: Vector3) => boolean;
  dispose: () => void;
}

export function makePlants(world: World, palette: Palette, quality: Quality): Plants {
  const object = new Group();
  const table = phenologyTable();
  const material = plantMaterial(palette, table);
  const designs = new Map<string, Design>();
  const shapes: BufferGeometry[] = [];
  for (const kind of PLANT_KINDS) {
    for (let variant = 0; variant < PLANT_VARIANTS; variant++) {
      for (const detail of ["near", "far"] as const) {
        const shape = plantShape(kind, variant, detail, palette);
        if (!shape) continue;
        shapes.push(shape);
        const geometry = new InstancedBufferGeometry();
        for (const [name, attr] of Object.entries(shape.attributes)) geometry.setAttribute(name, attr);
        geometry.instanceCount = 0;
        const mesh = new Mesh(geometry, material);
        mesh.frustumCulled = false;
        designs.set(designKey(kind, variant, detail), { kind, variant, detail, mesh, geometry, data: new Float32Array(0), buffer: null });
      }
    }
  }

  /** Each chunk's copies by design, worked out once and kept a while. */
  const chunks = new Map<string, Map<string, Float32Array>>();
  let from: { x: number; z: number } | null = null;
  let wanted: { key: string; chunkX: number; chunkZ: number; distance: number }[] = [];
  /** Whether what is drawn is the wanted set in full, and how many chunks have come in since it was last redrawn. */
  let whole = false;
  let sinceRedraw = 0;

  const chunkCopies = (chunkX: number, chunkZ: number) => {
    const byDesign = new Map<string, Plant[]>();
    for (const p of world.plantsIn(chunkX, chunkZ).plants) {
      const variant = Math.min(p.variant, PLANT_VARIANTS - 1);
      for (const detail of ["near", "far"] as const) {
        const key = designKey(p.kind, variant, detail);
        if (!designs.has(key)) continue;
        const list = byDesign.get(key) ?? [];
        list.push(p);
        byDesign.set(key, list);
      }
    }
    const out = new Map<string, Float32Array>();
    for (const [key, list] of byDesign) {
      const data = new Float32Array(list.length * STRIDE);
      list.forEach((p, i) => {
        writePlant(p, data, i * STRIDE);
      });
      out.set(key, data);
    }
    return out;
  };

  const redraw = () => {
    const parts = new Map<string, Float32Array[]>();
    for (const { key, distance } of wanted) {
      const copies = chunks.get(key);
      if (!copies) continue;
      for (const [designId, data] of copies) {
        const design = designs.get(designId);
        if (!design) continue;
        const shown = chunkDetail(quality[PLANT_CLASS[design.kind]], distance);
        if (shown !== design.detail) continue;
        const list = parts.get(designId) ?? [];
        list.push(data);
        parts.set(designId, list);
      }
    }
    object.clear();
    for (const [designId, design] of designs) {
      const list = parts.get(designId) ?? [];
      const count = list.reduce((sum, d) => sum + d.length / STRIDE, 0);
      if (count === 0) {
        design.geometry.instanceCount = 0;
        continue;
      }
      if (design.data.length < count * STRIDE) {
        design.data = new Float32Array(Math.ceil(count * 1.5) * STRIDE);
        design.buffer = new InstancedInterleavedBuffer(design.data, STRIDE);
        design.geometry.setAttribute("place", new InterleavedBufferAttribute(design.buffer, 4, 0));
        design.geometry.setAttribute("size", new InterleavedBufferAttribute(design.buffer, 4, 4));
        design.geometry.setAttribute("own", new InterleavedBufferAttribute(design.buffer, 4, 8));
      }
      let at = 0;
      for (const d of list) {
        design.data.set(d, at);
        at += d.length;
      }
      if (design.buffer) {
        design.buffer.addUpdateRange(0, at);
        design.buffer.needsUpdate = true;
      }
      design.geometry.instanceCount = count;
      object.add(design.mesh);
    }
  };

  return {
    object,
    update(eye) {
      const reach = Math.max(quality.trees.far, quality.shrubs.far, quality.small.far);
      if (from === null || Math.hypot(eye.x - from.x, eye.z - from.z) > RECHECK) {
        from = { x: eye.x, z: eye.z };
        wanted = wantedChunks(eye.x, eye.z, reach).map(({ chunkX, chunkZ }) => ({
          key: `${chunkX},${chunkZ}`,
          chunkX,
          chunkZ,
          distance: distanceToSquare(eye.x, eye.z, chunkX * PLANT_CHUNK, chunkZ * PLANT_CHUNK, PLANT_CHUNK),
        }));
        whole = false;
      }
      let built = 0;
      for (const { key, chunkX, chunkZ } of wanted) {
        if (chunks.has(key)) continue;
        if (built >= quality.buildsPerFrame) break;
        chunks.set(key, chunkCopies(chunkX, chunkZ));
        built++;
      }
      sinceRedraw += built;
      const settled = wanted.every(({ key }) => chunks.has(key));
      // Redrawn once every wanted chunk is in, and now and then while the rest are still being scattered, nearest first.
      if ((settled && !whole) || sinceRedraw >= REDRAW_EVERY) {
        whole = settled;
        sinceRedraw = 0;
        redraw();
      }
      if (chunks.size > KEPT_CHUNKS) {
        const keep = new Set(wanted.map((w) => w.key));
        for (const key of chunks.keys()) {
          if (chunks.size <= KEPT_CHUNKS) break;
          if (!keep.has(key)) chunks.delete(key);
        }
      }
      return settled;
    },
    dispose() {
      for (const design of designs.values()) design.geometry.dispose();
      for (const shape of shapes) shape.dispose();
      material.dispose();
      table.dispose();
      object.clear();
    },
  };
}

import { BufferAttribute, BufferGeometry, DoubleSide, Group, InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBufferAttribute, Mesh, MeshBasicNodeMaterial, type Vector3 } from "three/webgpu";
import { cameraPosition, cos, float, min, mix, sin, smoothstep, varying, vec3 } from "three/tsl";
import { createRng } from "@/shared/lib/seeded-random";
import { ALTITUDE } from "../engine/land";
import { REGIONS } from "../engine/regions";
import { TILE_SIZE } from "../engine/streaming";
import type { LandTile } from "../engine/tiles";
import type { Quality } from "../quality";
import { air, lit, throughAir } from "./air";
import type { Palette } from "./palette";
import { groundSeason } from "./terrain";
import { floatAttribute, vec3Attribute, vec4Attribute, colourOf } from "./tsl";

/*
 * Grass blades round the camera: tufts of a few bent blades, scattered over
 * each finest tile of land from its own seed wherever the ground is open
 * meadow (not under the woods, in the water or up on the rock), coloured as
 * the meadow under them is through the year and swaying in the breeze. They
 * shrink away towards the edge of their reach, so no edge shows, and lie
 * down under the snow. All of it is one instanced draw.
 */

/** Metres between tufts, before their jitter. */
const SPACING = 0.9;
/** Numbers per tuft: where it stands and its turn; its meadow colour and the bands where it grows. */
const STRIDE = 8;
/** Blades per tuft, and segments up each blade. */
const BLADES = 4;
const SEGMENTS = 3;

/** One tuft: a few thin, tapering blades bending outwards from its middle, a unit tall. */
function tuftGeometry(): BufferGeometry {
  const rng = createRng("hearthwood/grass/tuft");
  const positions: number[] = [];
  const heights: number[] = [];
  const indices: number[] = [];
  for (let b = 0; b < BLADES; b++) {
    const angle = (b / BLADES) * Math.PI * 2 + rng.next() * 0.8;
    const lean = 0.18 + rng.next() * 0.22;
    const tall = 0.65 + rng.next() * 0.35;
    const width = 0.035;
    const out = { x: Math.cos(angle), z: Math.sin(angle) };
    const across = { x: -out.z, z: out.x };
    const root = { x: out.x * 0.05, z: out.z * 0.05 };
    const first = positions.length / 3;
    for (let k = 0; k <= SEGMENTS; k++) {
      const t = k / SEGMENTS;
      const bend = lean * t * t;
      const half = width * (1 - t);
      const x = root.x + out.x * bend;
      const z = root.z + out.z * bend;
      const y = tall * t;
      positions.push(x - across.x * half, y, z - across.z * half, x + across.x * half, y, z + across.z * half);
      heights.push(t, t);
    }
    for (let k = 0; k < SEGMENTS; k++) {
      const a = first + k * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("rise", new BufferAttribute(new Float32Array(heights), 1));
  geometry.setIndex(indices);
  return geometry;
}

function grassMaterial(palette: Palette, reach: number): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ side: DoubleSide });
  const place = vec4Attribute("place");
  const look = vec4Attribute("look");
  const local = vec3Attribute("position");
  const rise = floatAttribute("rise");
  const distance = place.xz.sub(cameraPosition.xz).length();
  // Shrinks away towards the edge of its reach, and lies down under the snow (whose line is against the bands, held in the tuft's height).
  const line = min(groundSeason.snowLine, float(ALTITUDE.snow));
  const snowed = smoothstep(line.sub(20), line.add(10), place.y.sub(look.w));
  const height = float(1).sub(smoothstep(reach * 0.6, reach, distance)).mul(float(1).sub(snowed)).mul(groundSeason.dormant.mul(-0.5).add(1));
  const c = cos(place.w);
  const s = sin(place.w);
  const sway = sin(air.motion.mul(1.9).add(place.x.mul(0.35)).add(place.z.mul(0.27))).mul(0.12).mul(rise.mul(rise));
  const turned = vec3(local.x.mul(c).add(local.z.mul(s)).add(sway), local.y.mul(height).mul(0.55), local.z.mul(c).sub(local.x.mul(s)).add(sway.mul(0.6)));
  const world = turned.add(place.xyz);
  material.positionNode = world;

  // The meadow's colour through the year, a little brighter towards the tips.
  let colour = look.xyz;
  colour = mix(colour, colourOf(palette.ground["ground-fresh"]), groundSeason.fresh.mul(0.5));
  colour = mix(colour, colourOf(palette.ground["ground-gold"]), groundSeason.gold.mul(0.6));
  colour = mix(colour, colourOf(palette.ground["ground-dormant"]), groundSeason.dormant.mul(0.8));
  const shaded = colour.mul(rise.mul(0.55).add(0.6));
  material.colorNode = varying(throughAir(lit(shaded, vec3(0, 1, 0)), world));
  material.fog = false;
  return material;
}

/** A tile's tufts, as numbers: none where the ground isn't open meadow. */
function tileTufts(tile: LandTile, palette: Palette): Float32Array {
  const rng = createRng(`hearthwood/grass/${String(tile.key.i)},${String(tile.key.j)}`);
  const across = Math.round(TILE_SIZE / SPACING);
  const out: number[] = [];
  const { side, spacing, x0, z0 } = tile;
  const at = (array: Float32Array, i: number, j: number, fx: number, fz: number) => {
    const a = array[j * side + i];
    const b = array[j * side + i + 1];
    const c = array[(j + 1) * side + i];
    const d = array[(j + 1) * side + i + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
  for (let gz = 0; gz < across; gz++) {
    for (let gx = 0; gx < across; gx++) {
      const x = (gx + rng.next()) * SPACING;
      const z = (gz + rng.next()) * SPACING;
      const turn = rng.next() * Math.PI * 2;
      const keep = rng.next();
      const u = x / spacing;
      const w = z / spacing;
      const i = Math.min(side - 2, Math.floor(u));
      const j = Math.min(side - 2, Math.floor(w));
      const fx = u - i;
      const fz = w - j;
      const height = at(tile.heights, i, j, fx, fz);
      const woods = at(tile.woodland, i, j, fx, fz);
      const dry = height - at(tile.water, i, j, fx, fz);
      const river = at(tile.river, i, j, fx, fz);
      const bands = at(tile.wobble, i, j, fx, fz);
      const v = j * side + i;
      const slope = 1 - tile.normals[v * 3 + 1];
      const banded = height - bands;
      // Thick in the open meadow, thinning under the trees and up towards the bare rock.
      const density = (1 - Math.min(1, woods * 1.7)) * (dry > 0.5 ? 1 : 0) * (river < 0.05 ? 1 : 0) * (slope < 0.25 ? 1 : 0) * (banded < ALTITUDE.rock - 100 ? 1 : 0);
      if (keep >= density) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < REGIONS.length; k++) {
        const share = tile.regions[v * REGIONS.length + k];
        if (share < 0.002) continue;
        const meadow = palette.regions[REGIONS[k]][banded > ALTITUDE.treeline ? "alpine" : "meadow-lush"];
        r += meadow.r * share;
        g += meadow.g * share;
        b += meadow.b * share;
      }
      out.push(x0 + x, height, z0 + z, turn, r, g, b, bands);
    }
  }
  return new Float32Array(out);
}

export interface Grass {
  object: Group;
  /** Grows the grass round the eye from the finest tiles there are. */
  update: (eye: Vector3, finestTile: (i: number, j: number) => LandTile | undefined) => void;
  dispose: () => void;
}

export function makeGrass(palette: Palette, quality: Quality): Grass {
  const object = new Group();
  const tuft = tuftGeometry();
  const geometry = new InstancedBufferGeometry();
  for (const [name, attr] of Object.entries(tuft.attributes)) geometry.setAttribute(name, attr);
  geometry.setIndex(tuft.getIndex());
  geometry.instanceCount = 0;
  const material = grassMaterial(palette, quality.grassReach);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const tiles = new Map<string, Float32Array>();
  let drawn = "";
  let data = new Float32Array(0);
  let buffer: InstancedInterleavedBuffer | null = null;

  return {
    object,
    update(eye, finestTile) {
      const reach = quality.grassReach;
      const keys: string[] = [];
      const parts: Float32Array[] = [];
      for (let j = Math.floor((eye.z - reach) / TILE_SIZE); j <= Math.floor((eye.z + reach) / TILE_SIZE); j++) {
        for (let i = Math.floor((eye.x - reach) / TILE_SIZE); i <= Math.floor((eye.x + reach) / TILE_SIZE); i++) {
          const key = `${String(i)},${String(j)}`;
          let tufts = tiles.get(key);
          if (!tufts) {
            const tile = finestTile(i, j);
            if (!tile) continue;
            tufts = tileTufts(tile, palette);
            tiles.set(key, tufts);
          }
          keys.push(key);
          parts.push(tufts);
        }
      }
      const signature = keys.join(";");
      if (signature === drawn) return;
      drawn = signature;
      const length = parts.reduce((sum, p) => sum + p.length, 0);
      if (data.length < length) {
        data = new Float32Array(Math.ceil(length * 1.5));
        buffer = new InstancedInterleavedBuffer(data, STRIDE);
        geometry.setAttribute("place", new InterleavedBufferAttribute(buffer, 4, 0));
        geometry.setAttribute("look", new InterleavedBufferAttribute(buffer, 4, 4));
      }
      let at = 0;
      for (const p of parts) {
        data.set(p, at);
        at += p.length;
      }
      if (buffer) {
        buffer.addUpdateRange(0, at);
        buffer.needsUpdate = true;
      }
      geometry.instanceCount = at / STRIDE;
      // Added once it has tufts: a mesh drawn before its copies' numbers exist would build its pipeline without them.
      if (at > 0 && !mesh.parent) object.add(mesh);
      if (tiles.size > 64) {
        const keep = new Set(keys);
        for (const key of tiles.keys()) if (!keep.has(key)) tiles.delete(key);
      }
    },
    dispose() {
      tuft.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

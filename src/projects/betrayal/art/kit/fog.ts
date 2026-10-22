import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { lightMaterial } from "../shapes";
import { pixelTexture, TEXELS_PER_METRE } from "../textures";

/** One layer of fog: its height off the ground, how strongly it adds its light, and its own name, which seeds its banks. */
export type FogLayer = [height: number, opacity: number, name: string];

export interface GroundFogOptions {
  /** Seeds the banks of every layer, so rooms don't share a pattern. */
  seed: string;
  /** Lowest first; by default a thick layer near the ground and a thinner one above it. */
  layers?: FogLayer[];
  /** How far it spreads each way, in metres, centred on the origin. */
  span?: number;
}

/**
 * Low fog lying over the ground in drifting layers of moonlit haze, thickest
 * near the ground: the outdoor rooms' shared air. Built in room metres, over
 * the whole walkable floor by default.
 */
export function groundFog({ seed, layers = [[0.08, 0.55, "low"], [0.24, 0.3, "high"]], span = 5.5 }: GroundFogOptions): THREE.Group {
  const fog = new THREE.Group();
  const size = 64;
  for (const [height, opacity, name] of layers) {
    const rng = createRng(`${seed}:${name}`);
    const cells = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
    for (let bank = 0; bank < 6; bank++) {
      const cx = rng.next() * size;
      const cy = rng.next() * size;
      const rx = 6 + rng.next() * 12;
      const ry = 3 + rng.next() * 6;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = Math.min(Math.abs(x - cx), size - Math.abs(x - cx)) / rx;
          const dy = Math.min(Math.abs(y - cy), size - Math.abs(y - cy)) / ry;
          cells[y][x] += Math.max(0, 1 - dx * dx - dy * dy);
        }
      }
    }
    const rows = cells.map((row, y) =>
      row
        .map((v, x) => {
          const dither = ((x * 3 + y * 5) % 4) / 4;
          return v > 0.95 ? "m" : v > 0.4 ? "d" : v > 0.2 && dither < 0.5 ? "d" : ".";
        })
        .join(""),
    );
    const map = pixelTexture(rows, { m: "moon", d: "moonDark", ".": "void" }, true);
    const geometry = new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2);
    const repeat = span / (size / TEXELS_PER_METRE);
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeat, uv.getY(i) * repeat);
    const layer = new THREE.Mesh(geometry, lightMaterial(opacity, { map }));
    layer.position.y = height;
    fog.add(layer);
  }
  return fog;
}

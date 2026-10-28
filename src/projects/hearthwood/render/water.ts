import { BufferAttribute, BufferGeometry, MeshBasicNodeMaterial } from "three/webgpu";
import { cameraPosition, dot, float, max, mix, normalize, positionLocal, positionWorld, pow, reflect, smoothstep, uniform, vec3 } from "three/tsl";
import type { LandTile } from "../engine/tiles";
import { earthDrop, lit, skyAlong, throughAir } from "./air";
import type { Palette } from "./palette";
import { floatAttribute, colourOf } from "./tsl";

/*
 * The water of a tile of land: one level sheet for every lake and reach of
 * river, stepping down between terraces where a river falls, so the falls
 * are the sheet's own steep faces, white as they tumble. It is clear in the
 * shallows and deep blue where it is deep, mirrors the sky at a glance, and
 * freezes in from its edges in winter. Every tile's water, near or far,
 * shares the one material.
 */

/** How far the water has frozen in from its edges, 0 to 1, set once a frame. */
export const waterSeason = { ice: uniform(0) };

export function waterGeometry(tile: LandTile): BufferGeometry | null {
  if (!tile.wet) return null;
  const { side, spacing, x0, z0 } = tile;
  const count = side * side;
  const positions = new Float32Array(count * 3);
  const depths = new Float32Array(count);
  for (let v = 0; v < count; v++) depths[v] = tile.water[v] - tile.heights[v];
  for (let v = 0; v < count; v++) {
    const c = v % side;
    const r = Math.floor(v / side);
    // On dry ground at the water's edge the surface stays level with the water beside it, under the bank, rather than climbing to another terrace's water table.
    let level = tile.water[v];
    if (depths[v] < 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const n = (r + dr) * side + c + dc;
          if (r + dr >= 0 && c + dc >= 0 && r + dr < side && c + dc < side && depths[n] >= 0) level = Math.min(level, tile.water[n]);
        }
      }
    }
    positions.set([x0 + c * spacing, level, z0 + r * spacing], v * 3);
  }
  const indices: number[] = [];
  for (let r = 0; r < side - 1; r++) {
    for (let c = 0; c < side - 1; c++) {
      const a = r * side + c;
      if ([a, a + side, a + 1, a + side + 1].every((i) => depths[i] < -0.3)) continue;
      indices.push(a, a + side, a + 1, a + 1, a + side, a + side + 1);
    }
  }
  if (indices.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("depth", new BufferAttribute(depths, 1));
  geometry.setAttribute("fall", new BufferAttribute(tile.fall, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function waterMaterial(palette: Palette): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.positionNode = vec3(positionLocal.x, positionLocal.y.sub(earthDrop(positionLocal)), positionLocal.z);
  const depth = max(floatAttribute("depth"), 0);
  const fall = floatAttribute("fall");
  const deepness = smoothstep(0, 5, depth);
  const body = mix(colourOf(palette.things["water-shallow"]), colourOf(palette.things["water-deep"]), deepness);
  const foam = smoothstep(0.25, 0.8, fall);
  const edge = float(1).sub(smoothstep(0.02, 0.25, depth)).mul(0.5);
  const surface = mix(body, colourOf(palette.things["water-foam"]), max(foam, edge));
  // Ice grows out from the shore into deeper water as winter comes on.
  const frozen = smoothstep(0, 0.3, waterSeason.ice.mul(6).sub(depth)).mul(float(1).sub(foam));
  const colour = mix(surface, colourOf(palette.things["ground-snow"]).mul(0.9), frozen);
  const up = vec3(0, 1, 0);
  const view = normalize(positionWorld.sub(cameraPosition));
  const glance = pow(float(1).sub(max(dot(view.negate(), up), 0)), 4);
  const mirror = skyAlong(reflect(view, up));
  const shown = mix(lit(colour, up), mirror, glance.mul(float(0.85).sub(foam.add(frozen).mul(0.7))));
  material.colorNode = throughAir(shown, positionWorld);
  material.fog = false;
  return material;
}

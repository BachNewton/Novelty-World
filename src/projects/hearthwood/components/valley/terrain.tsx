"use client";

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, MeshLambertMaterial } from "three";
import { GROUNDS, groundCover, type Ground } from "../../world/ground";
import type { Valley } from "../../world/valley";
import { breatheAtmosphere, type AtmosphereUniforms } from "./atmosphere";
import type { Palette, Thing } from "./palette";

/*
 * The land: one mesh over the whole heightfield, coloured per vertex by its
 * blend of grounds and darkened under the trees, with a fine grain in the
 * shader so a meadow reads as grass.
 */

const GROUND_THING: Record<Ground, Thing> = {
  meadow: "ground-meadow",
  forest: "ground-forest",
  alpine: "ground-alpine",
  rock: "ground-rock",
  snow: "ground-snow",
  shore: "ground-shore",
  path: "ground-path",
};

function terrainGeometry(valley: Valley, palette: Palette): BufferGeometry {
  const { heights } = valley;
  const side = heights.side;
  const count = side * side;
  const positions = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const { weights, lushness } = groundCover(valley);
  const grounds = GROUNDS.map((g) => palette.things[GROUND_THING[g]]);
  const lush = palette.things["ground-meadow-lush"];
  const meadow = new Color();
  const colour = new Color();
  for (let i = 0; i < count; i++) {
    positions[i * 3] = heights.origin + (i % side) * heights.spacing;
    positions[i * 3 + 1] = heights.values[i];
    positions[i * 3 + 2] = heights.origin + Math.floor(i / side) * heights.spacing;
    meadow.copy(grounds[0]).lerp(lush, Math.min(1, Math.max(0, 0.5 + lushness[i])));
    colour.setRGB(0, 0, 0);
    for (let g = 0; g < GROUNDS.length; g++) {
      const w = weights[i * GROUNDS.length + g];
      const c = g === 0 ? meadow : grounds[g];
      colour.r += c.r * w;
      colour.g += c.g * w;
      colour.b += c.b * w;
    }
    colour.multiplyScalar(1 - 0.6 * valley.shade.values[i]);
    colours.set([colour.r, colour.g, colour.b], i * 3);
  }
  const indices = new Uint32Array((side - 1) * (side - 1) * 6);
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
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colours, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function Terrain({ valley, palette, atmosphere }: { valley: Valley; palette: Palette; atmosphere: AtmosphereUniforms }) {
  const geometry = useMemo(() => terrainGeometry(valley, palette), [valley, palette]);
  const material = useMemo(() => breatheAtmosphere(new MeshLambertMaterial({ vertexColors: true }), atmosphere, { grain: true }), [atmosphere]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

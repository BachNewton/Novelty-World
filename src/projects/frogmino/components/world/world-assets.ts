import { MeshLambertMaterial, type Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { WORLD_PAINTS, worldToken, type WorldPaint } from "../../world/paints";
import { borderMask } from "../vehicle-assets";

export type WorldPalette = Record<WorldPaint, Color>;

export function readWorldPalette(): WorldPalette {
  return Object.fromEntries(WORLD_PAINTS.map((paint) => [paint, themeColor(worldToken(paint))])) as WorldPalette;
}

// The scenery's boxes get the fleet's inset cell border, only fainter, so the
// world reads as built from the same blocks without competing with them.
const SCENERY_BORDER_SHADE = 0.78;

// Every world material is plain lit, as the fleet is, and white: each box
// brings its own paint as an instance colour.
export function makeWorldMaterials() {
  const mask = borderMask("all", SCENERY_BORDER_SHADE);
  const materials = {
    scenery: new MeshLambertMaterial({ map: mask }),
    surface: new MeshLambertMaterial(),
    // Paint on the road sits on its surface; the offset keeps the two from
    // fighting over the same depth far down the road.
    marking: new MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
  };
  return {
    ...materials,
    dispose() {
      mask.dispose();
      Object.values(materials).forEach((material) => {
        material.dispose();
      });
    },
  };
}

export type WorldMaterials = ReturnType<typeof makeWorldMaterials>;

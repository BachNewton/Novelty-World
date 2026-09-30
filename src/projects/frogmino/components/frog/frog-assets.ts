import { BoxGeometry, CylinderGeometry, MeshLambertMaterial, SphereGeometry, type BufferGeometry } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { FROG_LOOKS, FROG_ROLES, FROG_VARIANTS, type FrogRole, type FrogVariant } from "../../frog/look";
import type { FrogShape } from "../../frog/model";
import { borderMask } from "../vehicle-assets";

const SPHERE_SEGMENTS: readonly [width: number, height: number] = [18, 12];
const DRUM_SEGMENTS = 20;

export interface FrogPaints {
  // The skin of the cells, with the cell border the walls and vehicles have.
  body: MeshLambertMaterial;
  roles: Record<FrogRole, MeshLambertMaterial>;
}

// Everything the frogs draw with: one unit shape of each kind, which each
// part scales to its size, and plain lit materials per variant.
export function makeFrogAssets() {
  const mask = borderMask("all");
  const paints = Object.fromEntries(
    FROG_VARIANTS.map((variant) => {
      const colour = (role: FrogRole) => themeColor(FROG_LOOKS[variant].tokens[role]);
      const roles = Object.fromEntries(
        FROG_ROLES.map((role) => [role, new MeshLambertMaterial({ color: colour(role) })]),
      ) as Record<FrogRole, MeshLambertMaterial>;
      return [variant, { body: new MeshLambertMaterial({ color: colour("skin"), map: mask }), roles }];
    }),
  ) as Record<FrogVariant, FrogPaints>;

  const drumZ = new CylinderGeometry(0.5, 0.5, 1, DRUM_SEGMENTS);
  // A cylinder's axis runs along y; turn it onto z.
  drumZ.rotateX(Math.PI / 2);
  const shapes: Record<FrogShape, BufferGeometry> = {
    box: new BoxGeometry(1, 1, 1),
    sphere: new SphereGeometry(0.5, ...SPHERE_SEGMENTS),
    drumY: new CylinderGeometry(0.5, 0.5, 1, DRUM_SEGMENTS),
    drumZ,
  };

  return {
    shapes,
    paints,
    dispose() {
      mask.dispose();
      Object.values(shapes).forEach((shape) => {
        shape.dispose();
      });
      Object.values(paints).forEach(({ body, roles }) => {
        body.dispose();
        Object.values(roles).forEach((material) => {
          material.dispose();
        });
      });
    },
  };
}

export type FrogAssets = ReturnType<typeof makeFrogAssets>;

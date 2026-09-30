import { GROUND_DROP, box, type Vec3, type WorldBox } from "./geometry";

// The roadside's furniture and plants, each a handful of boxes around its
// own origin: the middle of its footprint on the ground, facing the camera
// (+z). The near-road ones stay under the near-height limit; trees stand
// further out. Parts that touch share only an edge or opposite faces, never
// a face looking the same way, which the depth buffer would fight over.

export type PropKind =
  | "guardRail"
  | "reflectorPost"
  | "frogSign"
  | "blockSign"
  | "cone"
  | "rock"
  | "shrub"
  | "mailbox"
  | "roundTree"
  | "pine";

export interface Prop {
  kind: PropKind;
  x: number;
  depth: number;
  yaw: number;
  scale: number;
}

// A guard rail comes in segments this long along the road.
export const RAIL_SEGMENT = 2;

const DIAMOND = Math.PI / 4;

// A little tetromino of four squares, as a sign's icon.
function blockIcon(y: number, z: number): WorldBox[] {
  const cell = 0.045;
  const cells: [number, number][] = [
    [-1, 0],
    [0, 0],
    [1, 0],
    [1, 1],
  ];
  return cells.map(([col, row]) => box([col * cell, y + row * cell, z], [cell * 0.85, cell * 0.85, 0.01], "sign-ink"));
}

const TEMPLATES: Record<PropKind, readonly WorldBox[]> = {
  guardRail: [
    box([0, 0.21, -0.8], [0.08, 0.42, 0.08], "post"),
    box([0, 0.21, 0.8], [0.08, 0.42, 0.08], "post"),
    box([0, 0.31, 0], [0.05, 0.14, RAIL_SEGMENT], "rail"),
  ],
  reflectorPost: [
    box([0, 0.1825, 0], [0.08, 0.365, 0.08], "post-white"),
    box([0, 0.4, 0], [0.08, 0.07, 0.08], "reflector"),
    box([0, 0.4575, 0], [0.08, 0.045, 0.08], "post-white"),
  ],
  // Frogs crossing: a diamond with a frog on it.
  frogSign: [
    box([0, 0.23, 0], [0.05, 0.46, 0.05], "post"),
    box([0, 0.5, 0.03], [0.25, 0.25, 0.03], "sign", DIAMOND),
    box([0, 0.485, 0.05], [0.11, 0.06, 0.01], "sign-ink"),
    box([-0.035, 0.5325, 0.05], [0.035, 0.035, 0.01], "sign-ink"),
    box([0.035, 0.5325, 0.05], [0.035, 0.035, 0.01], "sign-ink"),
    box([0, 0.445, 0.05], [0.15, 0.02, 0.01], "sign-ink"),
  ],
  // Falling blocks: a square sign with a tetromino tumbling on it.
  blockSign: [
    box([0, 0.2, 0], [0.05, 0.4, 0.05], "post"),
    box([0, 0.52, 0.03], [0.26, 0.26, 0.03], "sign"),
    ...blockIcon(0.49, 0.05),
  ],
  // A stepped traffic cone, in a soft terracotta rather than traffic orange.
  cone: [
    box([0, 0.015, 0], [0.26, 0.03, 0.26], "cone"),
    box([0, 0.1, 0], [0.16, 0.14, 0.16], "cone"),
    box([0, 0.195, 0], [0.12, 0.05, 0.12], "post-white"),
    box([0, 0.27, 0], [0.08, 0.1, 0.08], "cone"),
  ],
  rock: [
    box([0, 0.15, 0], [0.5, 0.3, 0.45], "rock"),
    box([0.08, 0.36, -0.04], [0.3, 0.14, 0.28], "rock-dark"),
    box([-0.26, 0.09, 0.1], [0.2, 0.18, 0.2], "rock-dark"),
  ],
  shrub: [
    box([0, 0.15, 0], [0.4, 0.3, 0.4], "shrub"),
    box([0.02, 0.36, 0.02], [0.26, 0.16, 0.26], "leaf-light"),
    box([0.24, 0.11, -0.05], [0.24, 0.22, 0.24], "shrub"),
  ],
  // A mailbox, flag up: someone lives out here.
  mailbox: [
    box([0, 0.19, 0], [0.07, 0.38, 0.07], "post"),
    box([0, 0.455, 0], [0.16, 0.15, 0.26], "mailbox"),
    box([0.09, 0.5, 0.04], [0.02, 0.12, 0.05], "mailbox-flag"),
  ],
  roundTree: [
    box([0, 0.45, 0], [0.22, 0.9, 0.22], "trunk"),
    box([0, 1.25, 0], [1.1, 0.8, 1.1], "leaf"),
    box([0.05, 1.85, -0.05], [0.7, 0.4, 0.7], "leaf-light"),
  ],
  pine: [
    box([0, 0.25, 0], [0.2, 0.5, 0.2], "trunk"),
    box([0, 0.7, 0], [1.1, 0.5, 1.1], "pine"),
    box([0, 1.15, 0], [0.8, 0.45, 0.8], "pine"),
    box([0, 1.55, 0], [0.52, 0.4, 0.52], "pine"),
    box([0, 1.9, 0], [0.26, 0.32, 0.26], "pine"),
  ],
};

function turn([x, y, z]: Vec3, yaw: number): Vec3 {
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  return [x * c + z * s, y, -x * s + z * c];
}

// A prop's boxes, placed in the world, standing on the land beside the road.
export function propBoxes(prop: Prop): WorldBox[] {
  return TEMPLATES[prop.kind].map((part) => {
    const [x, y, z] = turn(
      [part.center[0] * prop.scale, part.center[1] * prop.scale, part.center[2] * prop.scale],
      prop.yaw,
    );
    const size: Vec3 = [part.size[0] * prop.scale, part.size[1] * prop.scale, part.size[2] * prop.scale];
    return { ...part, center: [prop.x + x, y - GROUND_DROP, -prop.depth + z], size, yaw: part.yaw + prop.yaw };
  });
}

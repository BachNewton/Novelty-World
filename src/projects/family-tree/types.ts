export type Gender = "M" | "F" | "NB";

export interface Person {
  id: string;
  name: string;
  gender: Gender;
  parentIds: string[];
  spouseIds: string[];
}

export interface Tree {
  rootId: string;
  persons: Record<string, Person>;
}

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LaidOutEdge =
  | { kind: "spouse"; aId: string; bId: string }
  | {
      kind: "parent-child";
      parentAId: string;
      parentBId: string | null;
      childId: string;
      // Y at which the elbow horizontal is drawn. Each parent couple gets its
      // own Y so horizontals from different parents don't visually merge.
      elbowY: number;
    };

export interface Layout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
}

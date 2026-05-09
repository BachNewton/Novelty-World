export interface Person {
  id: string;
  name: string;
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
  | { kind: "parent-child"; parentAId: string; parentBId: string | null; childId: string };

export interface Layout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
}

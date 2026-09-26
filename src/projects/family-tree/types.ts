export type Gender = "M" | "F" | "NB";

export type UnionStatus = "married" | "divorced";

// A relationship between two adults. Symmetric: both people carry an entry
// naming the other, with the same status.
export interface Union {
  personId: string;
  status: UnionStatus;
}

// All name-shaped fields. Carried as a single object through the form →
// store → logic call chain so adding a new name field (suffix, maiden, …)
// is a one-line type change instead of a positional-arg sweep.
export interface NameFields {
  firstName: string;
  lastName: string;
  commonName: string;
}

export interface Person {
  id: string;
  firstName: string;
  // Empty string means "no last name". Keeping it always-present (never
  // optional) avoids null/undefined plumbing through the layout/render path.
  lastName: string;
  // Empty string means "no nickname". When set, fullName renders it as
  // First "Common" Last (e.g., Daniel "Dan" Santoro).
  commonName: string;
  gender: Gender;
  parentIds: string[];
  unions: Union[];
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
  | { kind: "spouse"; aId: string; bId: string; status: UnionStatus }
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

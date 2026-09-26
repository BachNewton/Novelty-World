export type Gender = "M" | "F" | "NB";

export type MarriageStatus = "married" | "divorced";

// All name-shaped fields. Carried as a single object through the form →
// store → logic call chain so adding a new name field (suffix, maiden, …)
// is a one-line type change instead of a positional-arg sweep.
export interface NameFields {
  firstName: string;
  lastName: string;
  commonName: string;
  birthSurname: string;
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
  // Empty string means "same as lastName". Set when someone is known by a
  // surname other than the one they were born with (typically by marriage),
  // so they stay recognizable under either name.
  birthSurname: string;
  // Free-text research notes; empty string means none. Never shown on the
  // tree itself, only in the edit panel.
  notes: string;
  gender: Gender;
  parentIds: string[];
  spouseIds: string[];
  divorcedSpouseIds: string[];
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
  | { kind: "spouse"; aId: string; bId: string; status: MarriageStatus }
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

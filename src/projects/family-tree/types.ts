import type { HeritageEntryCode } from "./heritages";

export type Gender = "M" | "F" | "NB";

export type UnionStatus =
  | "married"
  | "divorced"
  // The marriage ended because a spouse died.
  | "ended-by-death"
  | "partner"
  | "ex-partner";

// A relationship between two adults. Symmetric: both people carry an entry
// naming the other, with the same status (and the same deceasedId).
export type Union =
  | { personId: string; status: Exclude<UnionStatus, "ended-by-death"> }
  | {
      personId: string;
      status: "ended-by-death";
      // Which of the two people died, or null when not recorded. It only
      // decides who the relationship readout calls "late"; cards never show
      // it, since the tree never shows who is alive or dead.
      deceasedId: string | null;
    };

// All name-shaped fields. Carried as a single object through the form →
// store → logic call chain so adding a new name field (suffix, maiden, …)
// is a one-line type change instead of a positional-arg sweep.
export interface NameFields {
  firstName: string;
  middleName: string;
  lastName: string;
  commonName: string;
  birthSurname: string;
}

// The research questions asked of each person: `family` (all their partners
// and children are in the tree), `birthYear` (known, or can't be found), and
// `heritage` (where their line came from; asked only of people with no
// parents in the tree).
export type ResearchQuestion = "family" | "birthYear" | "heritage";

// `confirmed`: the evidence meets the standard. `exhausted`: every must-try
// method was tried without an answer, which counts as done. `open`: looked,
// not settled.
export type ResearchStatus = "confirmed" | "exhausted" | "open";

// Where research on one question stands. It lives in the public row, so its
// sources and note must be safe to publish.
export interface ResearchRecord {
  status: ResearchStatus;
  // Full ISO date ("YYYY-MM-DD") the record held as of.
  asOf: string;
  // Source or method names, at least one: a record id, a public record, an
  // obituary, a search method, "per Kyle".
  sources: string[];
  // What is unresolved and what would settle it; may be empty.
  note: string;
}

// null means nobody has looked at that question yet.
export type Research = Record<ResearchQuestion, ResearchRecord | null>;

export interface Person {
  id: string;
  firstName: string;
  // Empty string means "none recorded". A full name or an initial ("L."),
  // kept for research: records tell same-named relatives apart by it. Never
  // shown on the tree cards.
  middleName: string;
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
  // Partial ISO date ("YYYY", "YYYY-MM" or "YYYY-MM-DD") or approximate year ("~YYYY"); empty string means
  // none recorded. A research aid, never shown on the tree cards.
  birthDate: string;
  // Claude's research record for this person. Never shown on the cards and
  // never part of the layout.
  research: Research;
  // Where this person's line came from, as far as the records say, split
  // equally. It only fills the part of their mix their parents leave
  // unknown; empty means no entry. A research aid, never shown on the cards.
  heritage: HeritageEntryCode[];
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

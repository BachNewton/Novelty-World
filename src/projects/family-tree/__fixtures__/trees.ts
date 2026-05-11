// Synthetic family-tree fixtures used by layout tests and benches.
//
// Two flavours:
//   1. NAMED — hand-crafted scenarios that exercise specific structural
//      patterns (wide layers, dual lineages, cousin marriages, etc.).
//      Tests iterate over these to verify invariants on each shape.
//   2. GENERATORS — parameterized builders (chain length L, pedigree depth d,
//      sibling-fan width K, recursive branching factor b). Used by benches
//      to plot runtime against W/L/N and validate the complexity story.
//
// Names are intentionally placeholders ("dad", "mom", "g1", ...) — the layout
// algorithm never reads names, and using identifiers as firstName makes test
// failures readable without inventing a fake family.
//
// All fixtures return a fresh Tree on every call so callers can mutate
// freely without leaking state between tests.

import { normalizeTree } from "../logic";
import type { Gender, Person, Tree } from "../types";
import productionSnapshot from "./production-tree.json";

// ---------- builder helpers ----------

function p(
  id: string,
  gender: Gender,
  parents: string[] = [],
  spouses: string[] = [],
  divorced: string[] = [],
): Person {
  return {
    id,
    firstName: id,
    lastName: "",
    commonName: "",
    gender,
    parentIds: [...parents],
    spouseIds: [...spouses],
    divorcedSpouseIds: [...divorced],
  };
}

function makeTree(rootId: string, persons: Person[]): Tree {
  return {
    rootId,
    persons: Object.fromEntries(persons.map((person) => [person.id, person])),
  };
}

// Marry two existing persons in-place. Bidirectional, idempotent.
function marry(persons: Person[], aId: string, bId: string): void {
  const a = persons.find((person) => person.id === aId);
  const b = persons.find((person) => person.id === bId);
  if (a === undefined || b === undefined) {
    throw new Error(`marry: unknown id ${a === undefined ? aId : bId}`);
  }
  if (!a.spouseIds.includes(bId)) a.spouseIds.push(bId);
  if (!b.spouseIds.includes(aId)) b.spouseIds.push(aId);
}

// ---------- named scenarios ----------

// Just the root — smallest possible layout.
export function trivial(): Tree {
  return makeTree("me", [p("me", "M")]);
}

// Standard nuclear family: one couple, three kids of varying gender.
export function nuclear(): Tree {
  const persons = [
    p("dad", "M"),
    p("mom", "F"),
    p("kid1", "M", ["dad", "mom"]),
    p("kid2", "F", ["dad", "mom"]),
    p("kid3", "NB", ["dad", "mom"]),
  ];
  marry(persons, "dad", "mom");
  return makeTree("dad", persons);
}

// Five generations of single-parent ancestry. Tests depth handling and the
// single-parent code path in computeLayout (no spouse on any couple).
export function lineage(): Tree {
  const persons = [
    p("me", "M", ["g1"]),
    p("g1", "F", ["g2"]),
    p("g2", "F", ["g3"]),
    p("g3", "M", ["g4"]),
    p("g4", "F"),
  ];
  return makeTree("me", persons);
}

// Full 4-generation ancestor pedigree: 1 + 2 + 4 + 8 = 15 people. Every
// generation up doubles. Each parent couple has exactly one child couple
// in the next generation, so the layered DAG is a clean inverted binary
// tree with no forced crossings.
export function pedigree(): Tree {
  const persons: Person[] = [];

  // gen 0
  persons.push(p("me", "M", ["dad", "mom"]));

  // gen -1 (parents)
  persons.push(p("dad", "M", ["pgf", "pgm"]));
  persons.push(p("mom", "F", ["mgf", "mgm"]));

  // gen -2 (grandparents)
  persons.push(p("pgf", "M", ["pgf_f", "pgf_m"])); // paternal grandfather
  persons.push(p("pgm", "F", ["pgm_f", "pgm_m"])); // paternal grandmother
  persons.push(p("mgf", "M", ["mgf_f", "mgf_m"])); // maternal grandfather
  persons.push(p("mgm", "F", ["mgm_f", "mgm_m"])); // maternal grandmother

  // gen -3 (great-grandparents)
  for (const stem of ["pgf", "pgm", "mgf", "mgm"]) {
    persons.push(p(`${stem}_f`, "M"));
    persons.push(p(`${stem}_m`, "F"));
  }

  marry(persons, "dad", "mom");
  marry(persons, "pgf", "pgm");
  marry(persons, "mgf", "mgm");
  for (const stem of ["pgf", "pgm", "mgf", "mgm"]) {
    marry(persons, `${stem}_f`, `${stem}_m`);
  }

  return makeTree("me", persons);
}

// The production-like pattern: a married couple where BOTH spouses bring
// their own multi-generation ancestor lineage onto the same canvas. Most
// genealogy tools render only one side — this one paints both trunks
// meeting at a single couple.
//
// Layout shape:
//
//   gen -2 :  4 great-...  4 great-...      (8 grandparents total)
//             couples       couples
//   gen -1 :   me-Dad ═ me-Mom    sp-Dad ═ sp-Mom
//   gen  0 :              me ═ sp
//
// 14 people, joined at the (me, sp) couple in gen 0.
export function dualLineage(): Tree {
  const persons: Person[] = [];

  persons.push(p("me", "M", ["mDad", "mMom"], ["sp"]));
  persons.push(p("sp", "F", ["sDad", "sMom"], ["me"]));

  // me's parents
  persons.push(p("mDad", "M", ["mPgf", "mPgm"]));
  persons.push(p("mMom", "F", ["mMgf", "mMgm"]));
  // sp's parents
  persons.push(p("sDad", "M", ["sPgf", "sPgm"]));
  persons.push(p("sMom", "F", ["sMgf", "sMgm"]));

  // grandparents — 4 couples on each side
  for (const stem of ["mPg", "mMg", "sPg", "sMg"]) {
    persons.push(p(`${stem}f`, "M"));
    persons.push(p(`${stem}m`, "F"));
  }

  marry(persons, "mDad", "mMom");
  marry(persons, "sDad", "sMom");
  for (const stem of ["mPg", "mMg", "sPg", "sMg"]) {
    marry(persons, `${stem}f`, `${stem}m`);
  }

  return makeTree("me", persons);
}

// One root couple with 12 children. Half are married (in-laws come along
// for the ride). This forces a wide layer-1 (12 couples) above a single
// layer-0 couple — decrossOpt has nothing to permute against, so the
// optimum is unique-up-to-tie-breaking.
export function siblingExplosion(): Tree {
  const persons: Person[] = [];
  persons.push(p("dad", "M"));
  persons.push(p("mom", "F"));
  marry(persons, "dad", "mom");

  for (let i = 0; i < 12; i++) {
    const kidId = `k${i + 1}`;
    persons.push(p(kidId, i % 2 === 0 ? "M" : "F", ["dad", "mom"]));
    if (i < 6) {
      const inlawId = `inlaw${i + 1}`;
      persons.push(p(inlawId, i % 2 === 0 ? "F" : "M"));
      marry(persons, kidId, inlawId);
    }
  }

  return makeTree("dad", persons);
}

// Two branches that re-merge via a cousin marriage. Couple `gh` has TWO
// parent couples (`ce` and `df`) in the same generation, which is the
// structural pattern that produces unavoidable couple-DAG crossings and
// stresses decrossOpt.
//
//   gen 0:          [a ═ b]
//                  /        \
//   gen 1:    [c ═ e]      [d ═ f]      (c, d siblings; e, f outsiders)
//                  \        /
//   gen 2:           [g ═ h]            (g child of c+e, h child of d+f)
export function cousinMarriage(): Tree {
  const persons = [
    p("a", "M"),
    p("b", "F"),
    p("c", "M", ["a", "b"]),
    p("d", "F", ["a", "b"]),
    p("e", "F"),
    p("f", "M"),
    p("g", "M", ["c", "e"]),
    p("h", "F", ["d", "f"]),
  ];
  marry(persons, "a", "b");
  marry(persons, "c", "e");
  marry(persons, "d", "f");
  marry(persons, "g", "h");
  return makeTree("a", persons);
}

// ~60-person tree composing the major patterns: dual lineages above the
// root couple, siblings + in-laws on both sides, cousins from aunts/uncles,
// one cousin marriage, and two generations of descendants. Designed to be
// shape-comparable to the production tree without using real names.
export function kitchenSink(): Tree {
  const persons: Person[] = [];

  // ----- root couple (gen 0) -----
  persons.push(p("k", "M", ["kDad", "kMom"], ["e"]));
  persons.push(p("e", "F", ["eDad", "eMom"], ["k"]));

  // ----- Kyle-side ancestors -----

  // gen -1: Kyle's parents + paternal aunt + maternal uncle (with spouses)
  persons.push(p("kDad", "M", ["kPgf", "kPgm"]));
  persons.push(p("kMom", "F", ["kMgf", "kMgm"]));
  persons.push(p("kAunt", "F", ["kPgf", "kPgm"])); // paternal aunt
  persons.push(p("kAuntH", "M"));
  persons.push(p("kUncle", "M", ["kMgf", "kMgm"])); // maternal uncle
  persons.push(p("kUncleW", "F"));
  marry(persons, "kDad", "kMom");
  marry(persons, "kAunt", "kAuntH");
  marry(persons, "kUncle", "kUncleW");

  // gen -2: Kyle's grandparents
  persons.push(p("kPgf", "M", ["kPggf", "kPggm"])); // paternal grandfather has parents
  persons.push(p("kPgm", "F"));
  persons.push(p("kMgf", "M"));
  persons.push(p("kMgm", "F"));
  marry(persons, "kPgf", "kPgm");
  marry(persons, "kMgf", "kMgm");

  // gen -3: only one branch goes back this far (paternal grandpa's parents)
  persons.push(p("kPggf", "M"));
  persons.push(p("kPggm", "F"));
  marry(persons, "kPggf", "kPggm");

  // gen 0 (Kyle's siblings + cousins)
  persons.push(p("kSis", "F", ["kDad", "kMom"]));
  persons.push(p("kSisH", "M"));
  marry(persons, "kSis", "kSisH");
  persons.push(p("kCousin1", "F", ["kAunt", "kAuntH"])); // paternal cousin
  persons.push(p("kCousin2", "M", ["kAunt", "kAuntH"])); // paternal cousin (sibling)
  persons.push(p("kCousin3", "M", ["kUncle", "kUncleW"])); // maternal cousin

  // Cousin marriage: kCousin1 (paternal side) marries kCousin3 (maternal
  // side). Their couple has TWO parent couples in the same generation.
  marry(persons, "kCousin1", "kCousin3");

  // gen 1: Kyle's nieces/nephews from kSis
  persons.push(p("kNiece", "F", ["kSis", "kSisH"]));
  persons.push(p("kNephew", "M", ["kSis", "kSisH"]));
  // child of the cousin marriage
  persons.push(p("kCousinKid", "NB", ["kCousin1", "kCousin3"]));

  // ----- Elliott-side ancestors -----

  // gen -1
  persons.push(p("eDad", "M", ["ePgf", "ePgm"]));
  persons.push(p("eMom", "F", ["eMgf", "eMgm"]));
  persons.push(p("eUncle", "M", ["eMgf", "eMgm"])); // maternal uncle, no spouse
  marry(persons, "eDad", "eMom");

  // gen -2: Elliott's grandparents
  persons.push(p("ePgf", "M", ["ePggf", "ePggm"]));
  persons.push(p("ePgm", "F"));
  persons.push(p("eMgf", "M"));
  persons.push(p("eMgm", "F"));
  marry(persons, "ePgf", "ePgm");
  marry(persons, "eMgf", "eMgm");

  // gen -3: paternal great-grandparents
  persons.push(p("ePggf", "M"));
  persons.push(p("ePggm", "F"));
  marry(persons, "ePggf", "ePggm");

  // gen 0: Elliott's brother + wife
  persons.push(p("eBro", "M", ["eDad", "eMom"]));
  persons.push(p("eBroW", "F"));
  marry(persons, "eBro", "eBroW");

  // gen 1: brother's three kids
  persons.push(p("eBroKid1", "M", ["eBro", "eBroW"]));
  persons.push(p("eBroKid2", "F", ["eBro", "eBroW"]));
  persons.push(p("eBroKid3", "NB", ["eBro", "eBroW"]));

  // ----- joint descendants -----

  // gen 1: Kyle and Elliott's children
  persons.push(p("kid1", "F", ["k", "e"]));
  persons.push(p("kid2", "M", ["k", "e"]));
  persons.push(p("kid1Sp", "M"));
  persons.push(p("kid2Sp", "F"));
  marry(persons, "kid1", "kid1Sp");
  marry(persons, "kid2", "kid2Sp");

  // gen 2: grandchildren
  persons.push(p("grand1", "F", ["kid1", "kid1Sp"]));
  persons.push(p("grand2", "M", ["kid2", "kid2Sp"]));

  return makeTree("k", persons);
}

// Live snapshot of the production family_tree row (Kyle's tree). 67 people
// with two adjacent wide layers (gen -1 = 19 couples, gen 0 = 18 couples)
// densely interconnected by parent-child edges — the structural pattern
// that triggers decrossOpt's worst-case cost (~50s in Node, matching the
// in-browser worker timing). This is the authoritative bench fixture.
//
// Refresh via:
//   psql ... -t -A -c "SELECT data FROM family_tree WHERE id='global';" \
//     > src/projects/family-tree/__fixtures__/production-tree.json
export function productionTree(): Tree {
  return normalizeTree(productionSnapshot).tree;
}

export const NAMED_FIXTURES: Record<string, () => Tree> = {
  trivial,
  nuclear,
  lineage,
  pedigree,
  dualLineage,
  siblingExplosion,
  cousinMarriage,
  kitchenSink,
};

// ---------- parameterized generators (for the bench sweep) ----------

// Linear chain of ancestors, each with a single child. L total people.
// W = 1 across every layer — establishes the depth-only baseline cost.
export function chain(L: number): Tree {
  if (L < 1) throw new Error("chain: L must be >= 1");
  const persons: Person[] = [];
  for (let i = 0; i < L; i++) {
    const id = `g${i}`;
    const parent = i === L - 1 ? [] : [`g${i + 1}`];
    persons.push(p(id, i % 2 === 0 ? "M" : "F", parent));
  }
  return makeTree("g0", persons);
}

// Full binary ancestor pedigree of given depth.
//   depth=1 → 1 person (root only)
//   depth=2 → 1 + 2 = 3 people, max W = 1 couple
//   depth=3 → 1 + 2 + 4 = 7, max W = 2 couples
//   depth=d → 2^d - 1 people, max W = 2^(d-2) couples (d >= 2)
//
// All ancestors are paired; every couple has exactly one child couple in
// the next generation, so the couple-DAG is a clean inverted binary tree.
export function ancestorPedigree(depth: number): Tree {
  if (depth < 1) throw new Error("ancestorPedigree: depth must be >= 1");
  const persons: Person[] = [];
  // index a person at (gen, slot) where gen 0 is the descendant and slot is
  // 0..2^gen - 1. Person id encodes path: "p" then a sequence of l/r.
  const idAt = (gen: number, slot: number): string => {
    if (gen === 0) return "me";
    let s = "p";
    for (let g = gen - 1; g >= 0; g--) {
      const bit = (slot >> g) & 1;
      s += bit === 0 ? "f" : "m"; // father / mother branch
    }
    return s;
  };

  for (let gen = 0; gen < depth; gen++) {
    const count = 1 << gen;
    for (let slot = 0; slot < count; slot++) {
      const id = idAt(gen, slot);
      const parents: string[] = [];
      if (gen + 1 < depth) {
        parents.push(idAt(gen + 1, slot * 2));
        parents.push(idAt(gen + 1, slot * 2 + 1));
      }
      // Within a couple at gen+1, slot*2 is the father (M), slot*2+1 mother (F).
      const gender: Gender = gen === 0 ? "M" : slot % 2 === 0 ? "M" : "F";
      persons.push(p(id, gender, parents));
    }
  }

  // Marry adjacent (slot, slot+1) pairs in every ancestor generation.
  for (let gen = 1; gen < depth; gen++) {
    const count = 1 << gen;
    for (let slot = 0; slot < count; slot += 2) {
      marry(persons, idAt(gen, slot), idAt(gen, slot + 1));
    }
  }

  return makeTree("me", persons);
}

// One root couple plus K children. Half are married (alternating), so the
// in-law count is floor(K/2). W in layer 1 = K couples (paired + singletons).
// L = 2 always.
export function siblingFanOfWidth(K: number): Tree {
  if (K < 1) throw new Error("siblingFanOfWidth: K must be >= 1");
  const persons: Person[] = [];
  persons.push(p("dad", "M"));
  persons.push(p("mom", "F"));
  marry(persons, "dad", "mom");
  for (let i = 0; i < K; i++) {
    const kidId = `k${i}`;
    persons.push(p(kidId, i % 2 === 0 ? "M" : "F", ["dad", "mom"]));
    if (i % 2 === 0) {
      const inlawId = `inlaw${i}`;
      persons.push(p(inlawId, "F"));
      marry(persons, kidId, inlawId);
    }
  }
  return makeTree("dad", persons);
}

// Recursive descent: every couple has `branchFactor` children couples in
// the next generation, repeated `depth` times. Each child gets one in-law
// spouse so they form their own couple. Useful for sweeping width × depth
// jointly. People count grows as branchFactor^depth.
export function branching(branchFactor: number, depth: number): Tree {
  if (branchFactor < 1) throw new Error("branching: branchFactor must be >= 1");
  if (depth < 1) throw new Error("branching: depth must be >= 1");
  const persons: Person[] = [];
  let counter = 0;
  const newId = (): string => `n${counter++}`;

  // Every "couple" is an [aId, bId] pair; recurse from a couple.
  const buildCouple = (
    parentA: string | null,
    parentB: string | null,
  ): [string, string] => {
    const aId = newId();
    const bId = newId();
    const parents = parentA !== null && parentB !== null ? [parentA, parentB] : [];
    persons.push(p(aId, "M", parents));
    persons.push(p(bId, "F"));
    marry(persons, aId, bId);
    return [aId, bId];
  };

  let frontier: Array<[string, string]> = [buildCouple(null, null)];
  for (let d = 1; d < depth; d++) {
    const nextFrontier: Array<[string, string]> = [];
    for (const [a, b] of frontier) {
      for (let i = 0; i < branchFactor; i++) {
        nextFrontier.push(buildCouple(a, b));
      }
    }
    frontier = nextFrontier;
  }

  return makeTree(persons[0].id, persons);
}

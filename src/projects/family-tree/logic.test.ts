import { describe, it, expect } from "vitest";
import {
  ROOT_ID,
  ROOT_NAME,
  addChild,
  addParent,
  addSpouse,
  computeLayout,
  countChildren,
  createInitialTree,
  deletePerson,
  describeRelation,
  nearestInDirection,
  nextGender,
  renamePerson,
  setGender,
} from "./logic";
import type { LaidOutNode } from "./types";
import type { Gender, Person, Tree } from "./types";

function p(
  id: string,
  gender: Gender = "M",
  parentIds: string[] = [],
  spouseIds: string[] = [],
): Person {
  return { id, name: id, gender, parentIds, spouseIds };
}

function makeTree(persons: Person[]): Tree {
  return {
    rootId: persons[0].id,
    persons: Object.fromEntries(persons.map((person) => [person.id, person])),
  };
}

describe("createInitialTree", () => {
  it("seeds with root person only, gender M", () => {
    const t = createInitialTree();
    expect(Object.keys(t.persons)).toEqual([ROOT_ID]);
    expect(t.persons[ROOT_ID].name).toBe(ROOT_NAME);
    expect(t.persons[ROOT_ID].gender).toBe("M");
  });
});

describe("addParent", () => {
  it("attaches a parent with the given gender", () => {
    const t1 = createInitialTree();
    const t2 = addParent(t1, ROOT_ID, "p1", "Mom", "F");
    expect(t2.persons[ROOT_ID].parentIds).toEqual(["p1"]);
    expect(t2.persons.p1.name).toBe("Mom");
    expect(t2.persons.p1.gender).toBe("F");
  });

  it("auto-marries the two parents when the second is added", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", "Mom", "F");
    t = addParent(t, ROOT_ID, "dad", "Dad", "M");
    expect(t.persons.mom.spouseIds).toEqual(["dad"]);
    expect(t.persons.dad.spouseIds).toEqual(["mom"]);
  });

  it("is a no-op when the child already has two parents", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", "Mom", "F");
    t = addParent(t, ROOT_ID, "dad", "Dad", "M");
    const t2 = addParent(t, ROOT_ID, "extra", "Extra", "M");
    expect(t2).toBe(t);
  });
});

describe("addChild", () => {
  it("uses the parent's spouse as a co-parent if present", () => {
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "spouse", "Partner", "F");
    t = addChild(t, ROOT_ID, "kid", "Kid", "M");
    expect([...t.persons.kid.parentIds].sort()).toEqual([ROOT_ID, "spouse"].sort());
    expect(t.persons.kid.gender).toBe("M");
  });

  it("creates a single-parent child when the parent has no spouse", () => {
    let t = createInitialTree();
    t = addChild(t, ROOT_ID, "kid", "Kid", "M");
    expect(t.persons.kid.parentIds).toEqual([ROOT_ID]);
  });
});

describe("addSpouse", () => {
  it("links spouses bidirectionally with given gender", () => {
    const t = addSpouse(createInitialTree(), ROOT_ID, "s", "S", "F");
    expect(t.persons[ROOT_ID].spouseIds).toEqual(["s"]);
    expect(t.persons.s.spouseIds).toEqual([ROOT_ID]);
    expect(t.persons.s.gender).toBe("F");
  });

  it("auto-co-parents the new spouse onto existing single-parent kids", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", "Mom", "F");
    expect(t.persons[ROOT_ID].parentIds).toEqual(["mom"]);
    t = addSpouse(t, "mom", "dad", "Dad", "M");
    expect(t.persons[ROOT_ID].parentIds).toContain("dad");
    expect(t.persons[ROOT_ID].parentIds).toHaveLength(2);
  });

  it("does not touch kids who already have two parents", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", "Mom", "F");
    t = addParent(t, ROOT_ID, "dad", "Dad", "M");
    // dad already a parent of root; adding a new spouse to mom shouldn't
    // re-touch root (already two parents).
    t = addSpouse(t, "mom", "third", "Third", "M");
    expect(t.persons[ROOT_ID].parentIds.sort()).toEqual(["dad", "mom"]);
  });
});

describe("renamePerson", () => {
  it("updates the name", () => {
    const t = renamePerson(createInitialTree(), ROOT_ID, "K. Hutchinson");
    expect(t.persons[ROOT_ID].name).toBe("K. Hutchinson");
  });
});

describe("setGender", () => {
  it("updates a person's gender", () => {
    let t = createInitialTree();
    t = setGender(t, ROOT_ID, "NB");
    expect(t.persons[ROOT_ID].gender).toBe("NB");
  });
});

describe("deletePerson", () => {
  it("refuses to delete the root", () => {
    const t = createInitialTree();
    expect(deletePerson(t, ROOT_ID)).toBe(t);
  });

  it("removes a person and cleans references", () => {
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "spouse", "Partner", "F");
    t = addChild(t, ROOT_ID, "kid", "Kid", "M");
    t = deletePerson(t, "spouse");
    expect(t.persons.spouse as unknown).toBeUndefined();
    expect(t.persons[ROOT_ID].spouseIds).toEqual([]);
    expect(t.persons.kid.parentIds).toEqual([ROOT_ID]);
  });
});

describe("describeRelation", () => {
  it("marks the same person as self", () => {
    const t = makeTree([p("a", "M")]);
    expect(describeRelation(t, "a", "a")).toEqual({ label: null, isSelf: true });
  });

  it("labels direct spouses by gender", () => {
    const t = makeTree([
      p("a", "M", [], ["b"]),
      p("b", "F", [], ["a"]),
    ]);
    expect(describeRelation(t, "a", "b").label).toBe("wife");
    expect(describeRelation(t, "b", "a").label).toBe("husband");
  });

  it("uses the neutral 'spouse' label for NB partners", () => {
    const t = makeTree([
      p("a", "M", [], ["b"]),
      p("b", "NB", [], ["a"]),
    ]);
    expect(describeRelation(t, "a", "b").label).toBe("spouse");
  });

  it("labels parents and children by gender", () => {
    const t = makeTree([
      p("c", "M", ["m", "d"]),
      p("m", "F", [], ["d"]),
      p("d", "M", [], ["m"]),
    ]);
    expect(describeRelation(t, "c", "m").label).toBe("mother");
    expect(describeRelation(t, "c", "d").label).toBe("father");
    expect(describeRelation(t, "m", "c").label).toBe("son");
  });

  it("labels grandparents and great-grandparents", () => {
    const t = makeTree([
      p("a", "M", ["b"]),
      p("b", "F", ["c"]),
      p("c", "F", ["d"]),
      p("d", "M"),
    ]);
    expect(describeRelation(t, "a", "b").label).toBe("mother");
    expect(describeRelation(t, "a", "c").label).toBe("grandmother");
    expect(describeRelation(t, "a", "d").label).toBe("great-grandfather");
  });

  it("labels great-great-grandparents with extra 'great-' prefixes", () => {
    const t = makeTree([
      p("a", "M", ["b"]),
      p("b", "M", ["c"]),
      p("c", "M", ["d"]),
      p("d", "M", ["e"]),
      p("e", "M"),
    ]);
    expect(describeRelation(t, "a", "e").label).toBe("great-great-grandfather");
  });

  it("labels siblings and half-siblings as siblings", () => {
    const t = makeTree([
      p("me", "M", ["mom", "dad"]),
      p("mom", "F", [], ["dad"]),
      p("dad", "M", [], ["mom"]),
      p("sis", "F", ["mom", "dad"]),
    ]);
    expect(describeRelation(t, "me", "sis").label).toBe("sister");
  });

  it("labels aunts and uncles, with great-aunts at extra distance", () => {
    const t = makeTree([
      p("me", "M", ["mom"]),
      p("mom", "F", ["gma"]),
      p("gma", "F", ["ggma"]),
      p("ggma", "F"),
      p("aunt", "F", ["gma"]),         // mom's sister
      p("greatAunt", "F", ["ggma"]),    // gma's sister
    ]);
    expect(describeRelation(t, "me", "aunt").label).toBe("aunt");
    expect(describeRelation(t, "me", "greatAunt").label).toBe("great-aunt");
  });

  it("labels nieces and nephews", () => {
    const t = makeTree([
      p("me", "M", ["mom"]),
      p("mom", "F"),
      p("sis", "F", ["mom"]),
      p("niece", "F", ["sis"]),
      p("grandNiece", "F", ["niece"]),
    ]);
    expect(describeRelation(t, "me", "niece").label).toBe("niece");
    expect(describeRelation(t, "me", "grandNiece").label).toBe("grandniece");
  });

  it("labels first and second cousins, with 'once removed' for unequal distances", () => {
    const t = makeTree([
      p("me", "M", ["mom"]),
      p("mom", "F", ["gma"]),
      p("gma", "F", ["ggma"]),
      p("ggma", "F"),
      // mom's sibling and their descendants
      p("aunt", "F", ["gma"]),
      p("cousin1", "M", ["aunt"]),
      p("cousin1Kid", "F", ["cousin1"]),
      // gma's sibling and their descendants (down two generations)
      p("greatAunt", "F", ["ggma"]),
      p("parent2nd", "M", ["greatAunt"]),
      p("cousin2", "F", ["parent2nd"]),
    ]);
    expect(describeRelation(t, "me", "cousin1").label).toBe("1st cousin");
    expect(describeRelation(t, "me", "cousin1Kid").label).toBe("1st cousin once removed");
    expect(describeRelation(t, "me", "cousin2").label).toBe("2nd cousin");
  });

  it("labels sibling-in-law via spouse's sibling and via sibling's spouse", () => {
    const t = makeTree([
      p("me", "M", ["mom"], ["wife"]),
      p("mom", "F"),
      p("sis", "F", ["mom"], ["sisHusband"]),
      p("sisHusband", "M", [], ["sis"]),
      p("wife", "F", ["wifeMom"], ["me"]),
      p("wifeMom", "F"),
      p("wifeBrother", "M", ["wifeMom"]),
    ]);
    expect(describeRelation(t, "me", "sisHusband").label).toBe("brother-in-law");
    expect(describeRelation(t, "me", "wifeBrother").label).toBe("brother-in-law");
  });

  it("labels parent-in-law and child-in-law", () => {
    const t = makeTree([
      p("me", "M", [], ["wife"]),
      p("wife", "F", ["wifeMom"], ["me"]),
      p("wifeMom", "F"),
      p("kid", "M", ["me"], ["kidWife"]),
      p("kidWife", "F", [], ["kid"]),
    ]);
    expect(describeRelation(t, "me", "wifeMom").label).toBe("mother-in-law");
    expect(describeRelation(t, "me", "kidWife").label).toBe("daughter-in-law");
  });

  it("labels spouse's grandfather and uncle's spouse", () => {
    const t = makeTree([
      p("me", "M", ["mom"], ["wife"]),
      p("mom", "F", ["gma"]),
      p("gma", "F"),
      p("uncle", "M", ["gma"], ["uncleWife"]),
      p("uncleWife", "F", [], ["uncle"]),
      p("wife", "F", ["wifeMom"], ["me"]),
      p("wifeMom", "F", ["wifeGrandpa"]),
      p("wifeGrandpa", "M"),
    ]);
    // wifeGrandpa is wife's father's father → wife's grandfather (no clean English term)
    expect(describeRelation(t, "me", "wifeGrandpa").label).toBe("wife's grandfather");
    // uncleWife is married to uncle → English folds her into "aunt"
    expect(describeRelation(t, "me", "uncleWife").label).toBe("aunt");
  });

  it("uses the spouse's gendered term when describing in-laws of the spouse", () => {
    const t = makeTree([
      p("me", "F", [], ["husb"]),
      p("husb", "M", ["husbDad"], ["me"]),
      p("husbDad", "M", ["husbGpa"]),
      p("husbUncle", "M", ["husbGpa"]),
      p("husbGpa", "M"),
    ]);
    expect(describeRelation(t, "me", "husbUncle").label).toBe("husband's uncle");
  });

  it("uses the neutral 'spouse' phrasing when the partner is NB", () => {
    const t = makeTree([
      p("me", "F", [], ["partner"]),
      p("partner", "NB", ["partnerDad"], ["me"]),
      p("partnerDad", "M", ["partnerGpa"]),
      p("partnerUncle", "M", ["partnerGpa"]),
      p("partnerGpa", "M"),
    ]);
    expect(describeRelation(t, "me", "partnerUncle").label).toBe("spouse's uncle");
  });

  it("uses the target's gender when chaining 'cousin's spouse' style labels", () => {
    const t = makeTree([
      p("me", "M", ["dad"]),
      p("dad", "M", ["gpa"]),
      p("gpa", "M"),
      p("uncle", "M", ["gpa"]),
      p("cousin", "F", ["uncle"], ["cousinHusb"]),
      p("cousinHusb", "M", [], ["cousin"]),
    ]);
    expect(describeRelation(t, "me", "cousinHusb").label).toBe(
      "1st cousin's husband",
    );
  });

  it("falls back to chain descriptors for distant connections", () => {
    const t = makeTree([
      p("me", "M", [], ["wife"]),
      p("wife", "F", ["wifeMom"], ["me"]),
      p("wifeMom", "F"),
      p("wifeBrother", "M", ["wifeMom"], ["wifeBrotherWife"]),
      p("wifeBrotherWife", "F", [], ["wifeBrother"]),
      p("kid", "F", ["me", "wife"], ["kidHusband"]),
      p("kidHusband", "M", ["kidHusbandMom"], ["kid"]),
      p("kidHusbandMom", "F"),
    ]);
    // wife's brother → "brother-in-law"; brother-in-law's wife → no clean
    // single English term, so we chain the two natural pieces.
    expect(describeRelation(t, "me", "wifeBrotherWife").label).toBe(
      "brother-in-law's wife",
    );
    // kid is "daughter", her spouse is "son-in-law", his mother chains as
    // "son-in-law's mother".
    expect(describeRelation(t, "me", "kidHusbandMom").label).toBe(
      "son-in-law's mother",
    );
  });
});

describe("computeLayout", () => {
  it("places the lone root", () => {
    const layout = computeLayout(createInitialTree());
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0].id).toBe(ROOT_ID);
    expect(layout.edges).toEqual([]);
  });

  it("places spouses on the same row with a spouse edge", () => {
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "s", "Partner", "F");
    const layout = computeLayout(t);
    const root = layout.nodes.find((n) => n.id === ROOT_ID)!;
    const spouse = layout.nodes.find((n) => n.id === "s")!;
    expect(root.y).toBe(spouse.y);
    expect(layout.edges.some((e) => e.kind === "spouse")).toBe(true);
  });

  it("places ancestors above the root", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", "Mom", "F");
    const layout = computeLayout(t);
    const root = layout.nodes.find((n) => n.id === ROOT_ID)!;
    const mom = layout.nodes.find((n) => n.id === "mom")!;
    expect(mom.y).toBeLessThan(root.y);
  });

  it("places children below their parents and connects them", () => {
    let t = createInitialTree();
    t = addChild(t, ROOT_ID, "kid", "Kid", "M");
    const layout = computeLayout(t);
    const root = layout.nodes.find((n) => n.id === ROOT_ID)!;
    const kid = layout.nodes.find((n) => n.id === "kid")!;
    expect(kid.y).toBeGreaterThan(root.y);
    expect(
      layout.edges.some(
        (e) => e.kind === "parent-child" && e.childId === "kid",
      ),
    ).toBe(true);
  });

  it("centers a single child under a couple", () => {
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "spouse", "Partner", "F");
    t = addChild(t, ROOT_ID, "kid", "Kid", "M");
    const layout = computeLayout(t);
    const root = layout.nodes.find((n) => n.id === ROOT_ID)!;
    const spouse = layout.nodes.find((n) => n.id === "spouse")!;
    const kid = layout.nodes.find((n) => n.id === "kid")!;
    const coupleMid = (root.x + root.w + spouse.x) / 2;
    const kidMid = kid.x + kid.w / 2;
    expect(Math.abs(coupleMid - kidMid)).toBeLessThan(1);
  });

  it("uses barycenter to pull a spouse next to their siblings", () => {
    // Tree shape: root and spouse share gen 0 with root's cousin and spouse's
    // sibling. Without barycenter the BFS order leaves the spouse on the
    // root's side, forcing the spouse-parent edge to vault over the cousin.
    // After refinement the spouse's couple sits next to their sibling.
    const t = makeTree([
      p("me", "M", ["dad", "mom"], ["sp"]),
      p("dad", "M", ["gp"]),
      p("mom", "F"),
      p("uncle", "M", ["gp"], ["uncleW"]),
      p("uncleW", "F", [], ["uncle"]),
      p("cousin", "F", ["uncle", "uncleW"]),
      p("sp", "F", ["spDad", "spMom"], ["me"]),
      p("spDad", "M"),
      p("spMom", "F", [], ["spDad"]),
      p("spSib", "M", ["spDad", "spMom"]),
      p("gp", "M"),
    ]);
    const layout = computeLayout(t);
    const findX = (id: string): number => {
      const n = layout.nodes.find((node) => node.id === id);
      if (!n) throw new Error(`missing ${id}`);
      return n.x + n.w / 2;
    };
    // Spouse should sit closer to spouse's sibling than the cousin does.
    expect(Math.abs(findX("sp") - findX("spSib"))).toBeLessThan(
      Math.abs(findX("cousin") - findX("spSib")),
    );
  });

  it("never overlaps two couples on the same generation row", () => {
    // Great-grandparent with two children: one is on focal's lineage
    // (a paired couple), the other is a singleton sibling. The earlier
    // single-width packer placed the singleton at the same x as the
    // paired couple, since it was nested inside the paired couple's
    // BFS subtree slot. Per-generation extent tracking pushes them apart.
    const t = makeTree([
      p("me", "M", ["dad"]),
      p("dad", "M", ["ggma"]),
      p("ggma", "F"),
      p("auntDad", "M", ["ggma"], ["auntDadW"]),
      p("auntDadW", "F", [], ["auntDad"]),
      p("aunt", "F", ["ggma"]),
      p("greatAunt", "F", ["ggma"]),
    ]);
    const layout = computeLayout(t);
    const persons = t.persons;
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        const xOverlap = !(a.x + a.w <= b.x || b.x + b.w <= a.x);
        const yOverlap = !(a.y + a.h <= b.y || b.y + b.h <= a.y);
        if (xOverlap && yOverlap) {
          throw new Error(
            `nodes overlap: ${persons[a.id].name} and ${persons[b.id].name}`,
          );
        }
      }
    }
  });

  it("is deterministic — repeated layouts produce identical positions", () => {
    const build = (): Tree =>
      makeTree([
        p("me", "M", ["dad", "mom"], ["sp"]),
        p("dad", "M", ["gp"]),
        p("mom", "F"),
        p("uncle", "M", ["gp"], ["uncleW"]),
        p("uncleW", "F", [], ["uncle"]),
        p("cousin", "F", ["uncle", "uncleW"]),
        p("sp", "F", ["spDad", "spMom"], ["me"]),
        p("spDad", "M"),
        p("spMom", "F", [], ["spDad"]),
        p("spSib", "M", ["spDad", "spMom"]),
        p("gp", "M"),
      ]);
    const a = computeLayout(build());
    const b = computeLayout(build());
    expect(b.nodes.map((n) => `${n.id}:${n.x},${n.y}`)).toEqual(
      a.nodes.map((n) => `${n.id}:${n.x},${n.y}`),
    );
  });
});

function node(id: string, x: number, y: number): LaidOutNode {
  return { id, x, y, w: 100, h: 50 };
}

describe("nearestInDirection", () => {
  it("picks the closest node in each cardinal direction", () => {
    const center = node("c", 200, 200);
    const up = node("u", 200, 50);
    const down = node("d", 200, 400);
    const left = node("l", 50, 200);
    const right = node("r", 400, 200);
    const nodes = [center, up, down, left, right];
    expect(nearestInDirection(center, nodes, "up")?.id).toBe("u");
    expect(nearestInDirection(center, nodes, "down")?.id).toBe("d");
    expect(nearestInDirection(center, nodes, "left")?.id).toBe("l");
    expect(nearestInDirection(center, nodes, "right")?.id).toBe("r");
  });

  it("returns null when no candidate lies in the direction", () => {
    const a = node("a", 100, 100);
    const b = node("b", 200, 200);
    expect(nearestInDirection(a, [a, b], "up")).toBeNull();
    expect(nearestInDirection(a, [a, b], "left")).toBeNull();
  });

  it("prefers axis-aligned neighbors over diagonal ones", () => {
    const center = node("c", 500, 500);
    const straightUp = node("u", 500, 350);
    const diagUp = node("d", 700, 360);
    const result = nearestInDirection(center, [center, straightUp, diagUp], "up");
    expect(result?.id).toBe("u");
  });
});

describe("nextGender", () => {
  it("cycles M -> F -> NB -> M", () => {
    expect(nextGender("M")).toBe("F");
    expect(nextGender("F")).toBe("NB");
    expect(nextGender("NB")).toBe("M");
  });
});

describe("countChildren", () => {
  it("counts persons whose parentIds contain the given id", () => {
    let t = createInitialTree();
    t = addChild(t, ROOT_ID, "a", "A", "M");
    t = addChild(t, ROOT_ID, "b", "B", "F");
    expect(countChildren(t, ROOT_ID)).toBe(2);
    expect(countChildren(t, "a")).toBe(0);
  });
});

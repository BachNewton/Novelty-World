import { describe, it, expect } from "vitest";
import {
  NODE_W,
  ROOT_ID,
  ROOT_FIRST_NAME,
  ROOT_LAST_NAME,
  SPOUSE_GAP,
  addChild,
  addParent,
  addSpouse,
  computeLayout,
  countChildren,
  createInitialTree,
  deletePerson,
  describeRelation,
  divorceSpouse,
  fullName,
  nearestInDirection,
  nextGender,
  renamePerson,
  setGender,
} from "./logic";
import type { LaidOutNode } from "./types";
import type { Gender, NameFields, Person, Tree } from "./types";

// Test-local helper: build a NameFields object positionally so test calls
// don't have to spell out the object literal every time.
function n(firstName: string, lastName = "", commonName = ""): NameFields {
  return { firstName, lastName, commonName };
}

function p(
  id: string,
  gender: Gender = "M",
  parentIds: string[] = [],
  spouseIds: string[] = [],
  divorcedSpouseIds: string[] = [],
): Person {
  return {
    id,
    firstName: id,
    lastName: "",
    commonName: "",
    gender,
    parentIds,
    spouseIds,
    divorcedSpouseIds,
  };
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
    expect(t.persons[ROOT_ID].firstName).toBe(ROOT_FIRST_NAME);
    expect(t.persons[ROOT_ID].lastName).toBe(ROOT_LAST_NAME);
    expect(t.persons[ROOT_ID].gender).toBe("M");
  });
});

describe("fullName", () => {
  it("joins first and last with a space", () => {
    expect(
      fullName({ firstName: "Kyle", lastName: "Hutchinson", commonName: "" }),
    ).toBe("Kyle Hutchinson");
  });

  it("omits the trailing space when last name is empty", () => {
    expect(fullName({ firstName: "Kyle", lastName: "", commonName: "" })).toBe(
      "Kyle",
    );
  });

  it('renders common name in quotes between first and last', () => {
    expect(
      fullName({
        firstName: "Daniel",
        lastName: "Santoro",
        commonName: "Dan",
      }),
    ).toBe('Daniel "Dan" Santoro');
  });

  it("renders common name with no last name", () => {
    expect(
      fullName({ firstName: "Daniel", lastName: "", commonName: "Dan" }),
    ).toBe('Daniel "Dan"');
  });
});

describe("addParent", () => {
  it("attaches a parent with the given gender", () => {
    const t1 = createInitialTree();
    const t2 = addParent(t1, ROOT_ID, "p1", n("Mom", "Hutchinson"), "F");
    expect(t2.persons[ROOT_ID].parentIds).toEqual(["p1"]);
    expect(t2.persons.p1.firstName).toBe("Mom");
    expect(t2.persons.p1.lastName).toBe("Hutchinson");
    expect(t2.persons.p1.gender).toBe("F");
  });

  it("auto-marries the two parents when the second is added", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", n("Mom"), "F");
    t = addParent(t, ROOT_ID, "dad", n("Dad"), "M");
    expect(t.persons.mom.spouseIds).toEqual(["dad"]);
    expect(t.persons.dad.spouseIds).toEqual(["mom"]);
  });

  it("is a no-op when the child already has two parents", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", n("Mom"), "F");
    t = addParent(t, ROOT_ID, "dad", n("Dad"), "M");
    const t2 = addParent(t, ROOT_ID, "extra", n("Extra"), "M");
    expect(t2).toBe(t);
  });
});

describe("addChild", () => {
  it("uses the parent's spouse as a co-parent if present", () => {
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "spouse", n("Partner"), "F");
    t = addChild(t, ROOT_ID, "kid", n("Kid"), "M");
    expect([...t.persons.kid.parentIds].sort()).toEqual([ROOT_ID, "spouse"].sort());
    expect(t.persons.kid.gender).toBe("M");
  });

  it("creates a single-parent child when the parent has no spouse", () => {
    let t = createInitialTree();
    t = addChild(t, ROOT_ID, "kid", n("Kid"), "M");
    expect(t.persons.kid.parentIds).toEqual([ROOT_ID]);
  });

  it("respects an explicit co-parent, overriding the default spouse pick", () => {
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "wife1", n("W1"), "F");
    t = addSpouse(t, ROOT_ID, "wife2", n("W2"), "F");
    t = addChild(t, ROOT_ID, "kid", n("Kid"), "M", "wife2");
    expect([...t.persons.kid.parentIds].sort()).toEqual(
      [ROOT_ID, "wife2"].sort(),
    );
  });

  it("treats explicit null coParentId as 'single parent in a marriage' (step-kid case)", () => {
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "spouse", n("S"), "F");
    // null = user explicitly picked 'X only' in the +Child picker, even
    // though X has a spouse. Spouse must NOT be auto-attached.
    t = addChild(t, ROOT_ID, "stepKid", n("SK"), "M", null);
    expect(t.persons.stepKid.parentIds).toEqual([ROOT_ID]);
  });
});

describe("addSpouse", () => {
  it("links spouses bidirectionally with given gender", () => {
    const t = addSpouse(createInitialTree(), ROOT_ID, "s", n("S"), "F");
    expect(t.persons[ROOT_ID].spouseIds).toEqual(["s"]);
    expect(t.persons.s.spouseIds).toEqual([ROOT_ID]);
    expect(t.persons.s.gender).toBe("F");
  });

  it("leaves existing single-parent kids alone (step-parent might not be bio)", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", n("Mom"), "F");
    expect(t.persons[ROOT_ID].parentIds).toEqual(["mom"]);
    // Marrying mom must NOT silently promote her new spouse to be a parent
    // of mom's existing kids — they might be from a prior unrecorded
    // relationship. User assigns parentage explicitly.
    t = addSpouse(t, "mom", "newSpouse", n("NS"), "M");
    expect(t.persons[ROOT_ID].parentIds).toEqual(["mom"]);
  });

  it("does not touch kids who already have two parents", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", n("Mom"), "F");
    t = addParent(t, ROOT_ID, "dad", n("Dad"), "M");
    // dad already a parent of root; adding a new spouse to mom shouldn't
    // re-touch root (already two parents).
    t = addSpouse(t, "mom", "third", n("Third"), "M");
    expect(t.persons[ROOT_ID].parentIds.sort()).toEqual(["dad", "mom"]);
  });

  it("does not auto-coparent on a second marriage (avoids step-parent corruption)", () => {
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "wife1", n("W1"), "F");
    t = addChild(t, "wife1", "kid", n("Kid"), "M");
    // wife1 now has a child with root. Marrying her to someone new must
    // NOT make that new spouse a parent of root's kid.
    t = addSpouse(t, "wife1", "newPartner", n("NP"), "M");
    expect(t.persons.kid.parentIds.sort()).toEqual([ROOT_ID, "wife1"].sort());
  });

  it("adds a divorced spouse to divorcedSpouseIds, not spouseIds", () => {
    const t = addSpouse(
      createInitialTree(),
      ROOT_ID,
      "ex",
      n("Ex"),
      "F",
      "divorced",
    );
    expect(t.persons[ROOT_ID].spouseIds).toEqual([]);
    expect(t.persons[ROOT_ID].divorcedSpouseIds).toEqual(["ex"]);
    expect(t.persons.ex.divorcedSpouseIds).toEqual([ROOT_ID]);
  });

  it("bio-parents the listed children when bioChildIds is passed", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", n("Mom"), "F");
    t = addChild(t, "mom", "kid2", n("Kid2"), "F");
    t = addChild(t, "mom", "kid3", n("Kid3"), "M");
    // Marrying mom and explicitly opting in kid2 + kid3 (but not root)
    // should make the new spouse the second bio parent of those two.
    t = addSpouse(t, "mom", "dad", n("Dad"), "M", "married", ["kid2", "kid3"]);
    expect(t.persons.kid2.parentIds.sort()).toEqual(["dad", "mom"]);
    expect(t.persons.kid3.parentIds.sort()).toEqual(["dad", "mom"]);
    expect(t.persons[ROOT_ID].parentIds).toEqual(["mom"]);
  });

  it("skips children that already have two parents", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", n("Mom"), "F");
    t = addParent(t, ROOT_ID, "dad", n("Dad"), "M");
    // Caller passing root in bioChildIds (e.g. UI bug) must not push a
    // third parent — root is full.
    t = addSpouse(t, "mom", "stepDad", n("Step"), "M", "married", [ROOT_ID]);
    expect(t.persons[ROOT_ID].parentIds.sort()).toEqual(["dad", "mom"]);
  });

  it("supports bio-parenting on a divorced add-spouse too", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", n("Mom"), "F");
    t = addSpouse(t, "mom", "exDad", n("Ex"), "M", "divorced", [ROOT_ID]);
    expect(t.persons[ROOT_ID].parentIds.sort()).toEqual(["exDad", "mom"]);
    expect(t.persons.mom.divorcedSpouseIds).toEqual(["exDad"]);
  });
});

describe("divorceSpouse", () => {
  it("moves the partner from spouseIds to divorcedSpouseIds on both sides", () => {
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "ex", n("Ex"), "F");
    t = divorceSpouse(t, ROOT_ID, "ex");
    expect(t.persons[ROOT_ID].spouseIds).toEqual([]);
    expect(t.persons[ROOT_ID].divorcedSpouseIds).toEqual(["ex"]);
    expect(t.persons.ex.spouseIds).toEqual([]);
    expect(t.persons.ex.divorcedSpouseIds).toEqual([ROOT_ID]);
  });

  it("is a no-op when the pair isn't currently married", () => {
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "stranger", n("S"), "F", "divorced");
    const same = divorceSpouse(t, ROOT_ID, "stranger");
    expect(same).toBe(t);
  });
});

describe("renamePerson", () => {
  it("updates first, last, and common name", () => {
    const t = renamePerson(createInitialTree(), ROOT_ID, n("K.", "Hutchinson", "Kyle"));
    expect(t.persons[ROOT_ID].firstName).toBe("K.");
    expect(t.persons[ROOT_ID].lastName).toBe("Hutchinson");
    expect(t.persons[ROOT_ID].commonName).toBe("Kyle");
  });

  it("allows clearing the last name to empty", () => {
    const t = renamePerson(createInitialTree(), ROOT_ID, n("Kyle"));
    expect(t.persons[ROOT_ID].lastName).toBe("");
  });

  it("allows clearing the common name to empty", () => {
    let t = renamePerson(createInitialTree(), ROOT_ID, n("Daniel", "Santoro", "Dan"));
    t = renamePerson(t, ROOT_ID, n("Daniel", "Santoro"));
    expect(t.persons[ROOT_ID].commonName).toBe("");
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
    t = addSpouse(t, ROOT_ID, "spouse", n("Partner"), "F");
    t = addChild(t, ROOT_ID, "kid", n("Kid"), "M");
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

  it("labels divorced spouses as ex-husband/ex-wife", () => {
    const t = makeTree([
      p("a", "M", [], [], ["b"]),
      p("b", "F", [], [], ["a"]),
    ]);
    expect(describeRelation(t, "a", "b").label).toBe("ex-wife");
    expect(describeRelation(t, "b", "a").label).toBe("ex-husband");
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

  it("labels full siblings (same parent set) as brother/sister", () => {
    const t = makeTree([
      p("me", "M", ["mom", "dad"]),
      p("mom", "F", [], ["dad"]),
      p("dad", "M", [], ["mom"]),
      p("sis", "F", ["mom", "dad"]),
    ]);
    expect(describeRelation(t, "me", "sis").label).toBe("sister");
  });

  it("labels half-siblings (one shared parent only)", () => {
    const t = makeTree([
      p("me", "M", ["mom", "dad1"]),
      p("mom", "F", [], ["dad1", "dad2"]),
      p("dad1", "M", [], ["mom"]),
      p("dad2", "M", [], ["mom"]),
      p("halfSis", "F", ["mom", "dad2"]),
    ]);
    expect(describeRelation(t, "me", "halfSis").label).toBe("half-sister");
  });

  it("labels step-parent (parent's spouse who isn't a bio parent)", () => {
    const t = makeTree([
      p("me", "M", ["dad"]),
      p("dad", "M", [], ["stepMom"]),
      p("stepMom", "F", [], ["dad"]),
    ]);
    expect(describeRelation(t, "me", "stepMom").label).toBe("step-mother");
  });

  it("labels step-child (spouse's child who isn't a bio child)", () => {
    const t = makeTree([
      p("me", "M", [], ["wife"]),
      p("wife", "F", [], ["me"]),
      p("stepKid", "M", ["wife"]),
    ]);
    expect(describeRelation(t, "me", "stepKid").label).toBe("step-son");
  });

  it("labels step-siblings (parent's spouse's child, no shared bio parent)", () => {
    const t = makeTree([
      p("me", "M", ["dad"]),
      p("dad", "M", [], ["stepMom"]),
      p("stepMom", "F", [], ["dad"]),
      p("stepSis", "F", ["stepMom"]),
    ]);
    expect(describeRelation(t, "me", "stepSis").label).toBe("step-sister");
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
  it("places the lone root", async () => {
    const layout = await computeLayout(createInitialTree());
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0].id).toBe(ROOT_ID);
    expect(layout.edges).toEqual([]);
  });

  it("places spouses on the same row with a spouse edge", async () => {
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "s", n("Partner"), "F");
    const layout = await computeLayout(t);
    const root = layout.nodes.find((n) => n.id === ROOT_ID)!;
    const spouse = layout.nodes.find((n) => n.id === "s")!;
    expect(root.y).toBe(spouse.y);
    expect(layout.edges.some((e) => e.kind === "spouse")).toBe(true);
  });

  it("places ancestors above the root", async () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", n("Mom"), "F");
    const layout = await computeLayout(t);
    const root = layout.nodes.find((n) => n.id === ROOT_ID)!;
    const mom = layout.nodes.find((n) => n.id === "mom")!;
    expect(mom.y).toBeLessThan(root.y);
  });

  it("places children below their parents and connects them", async () => {
    let t = createInitialTree();
    t = addChild(t, ROOT_ID, "kid", n("Kid"), "M");
    const layout = await computeLayout(t);
    const root = layout.nodes.find((n) => n.id === ROOT_ID)!;
    const kid = layout.nodes.find((n) => n.id === "kid")!;
    expect(kid.y).toBeGreaterThan(root.y);
    expect(
      layout.edges.some(
        (e) => e.kind === "parent-child" && e.childId === "kid",
      ),
    ).toBe(true);
  });

  it("clusters blended-family kids by bio-parent attribution", async () => {
    // Gary married Marta. James/Kathleen are Gary's bio kids (from a prior
    // unmodeled relationship); Lucas/Sebastian are Marta's. After layout,
    // each pair must be CONTIGUOUS left-to-right — Gary's kids on his side
    // of the marriage, Marta's on hers — never interleaved.
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "gary", n("Gary"), "M");
    t = addSpouse(t, "gary", "marta", n("Marta"), "F");
    t = addChild(t, "gary", "james", n("James"), "M", null);
    t = addChild(t, "gary", "kathleen", n("Kathleen"), "F", null);
    t = addChild(t, "marta", "lucas", n("Lucas"), "M", null);
    t = addChild(t, "marta", "sebastian", n("Sebastian"), "M", null);

    const layout = await computeLayout(t);
    const xOf = (id: string) =>
      layout.nodes.find((n) => n.id === id)?.x ?? -1;
    const ordered = [
      { id: "james", bio: "gary" },
      { id: "kathleen", bio: "gary" },
      { id: "lucas", bio: "marta" },
      { id: "sebastian", bio: "marta" },
    ].sort((a, b) => xOf(a.id) - xOf(b.id));
    // No interleaving: as we scan left-to-right, the bio-parent transitions
    // at most once. Going gary→marta→gary or marta→gary→marta means kids
    // are crossed.
    let transitions = 0;
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i].bio !== ordered[i - 1].bio) transitions++;
    }
    expect(transitions).toBeLessThanOrEqual(1);
  });

  it("bundles a free ex + person + current spouse into one adjacent cluster", async () => {
    // Gary is currently married to Marta and was previously married to
    // Maya, who never remarried. The cluster lays out [Maya, Gary, Marta]
    // side-by-side: ex on the LEFT, person in the middle, current on the
    // RIGHT. Both marriage lines stay short, and child-drops for the
    // Gary+Maya kids emerge from the dashed line midpoint — not from
    // empty space several node-widths away.
    const t = makeTree([
      p("gary", "M", [], ["marta"], ["maya"]),
      p("marta", "F", [], ["gary"], []),
      p("maya", "F", [], [], ["gary"]),
      p("james", "M", ["gary", "maya"]),
      p("kathleen", "F", ["gary", "maya"]),
    ]);

    const layout = await computeLayout(t);
    const maya = layout.nodes.find((node) => node.id === "maya")!;
    const gary = layout.nodes.find((node) => node.id === "gary")!;
    const marta = layout.nodes.find((node) => node.id === "marta")!;
    expect(maya.y).toBe(gary.y);
    expect(marta.y).toBe(gary.y);
    expect(gary.x - (maya.x + maya.w)).toBe(SPOUSE_GAP);
    expect(marta.x - (gary.x + gary.w)).toBe(SPOUSE_GAP);

    const exEdge = layout.edges.find(
      (e) =>
        e.kind === "spouse" &&
        e.status === "divorced" &&
        ((e.aId === "maya" && e.bId === "gary") ||
          (e.aId === "gary" && e.bId === "maya")),
    );
    expect(exEdge).toBeDefined();
    const currentEdge = layout.edges.find(
      (e) =>
        e.kind === "spouse" &&
        e.status === "married" &&
        ((e.aId === "gary" && e.bId === "marta") ||
          (e.aId === "marta" && e.bId === "gary")),
    );
    expect(currentEdge).toBeDefined();
  });

  it("orders siblings of a 3-member cluster by bio-parent attribution", async () => {
    // Cluster [Maya, Gary, Marta]:
    //   James, Kathleen — bio kids of Gary + Maya (the LEFT marriage)
    //   Lucas, Sebastian — Marta's solo kids (from a prior unmodeled
    //                      relationship), no Gary parentage
    // Convention: scan left-to-right and the bio-parent group transitions
    // at most once. Maya+Gary kids cluster on the cluster's LEFT side;
    // Marta-solo kids cluster on the RIGHT side. Never interleaved.
    const t = makeTree([
      p("gary", "M", [], ["marta"], ["maya"]),
      p("marta", "F", [], ["gary"], []),
      p("maya", "F", [], [], ["gary"]),
      p("james", "M", ["gary", "maya"]),
      p("kathleen", "F", ["gary", "maya"]),
      p("lucas", "M", ["marta"]),
      p("sebastian", "M", ["marta"]),
    ]);

    const layout = await computeLayout(t);
    const xOf = (id: string): number =>
      layout.nodes.find((n) => n.id === id)?.x ?? -1;
    const ordered = [
      { id: "james", group: "maya-gary" },
      { id: "kathleen", group: "maya-gary" },
      { id: "lucas", group: "marta" },
      { id: "sebastian", group: "marta" },
    ].sort((a, b) => xOf(a.id) - xOf(b.id));
    let transitions = 0;
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i].group !== ordered[i - 1].group) transitions++;
    }
    expect(transitions).toBeLessThanOrEqual(1);
    // And specifically: Maya+Gary's kids are LEFT of Marta's solo kids
    // (not the reverse), since Maya sits on the cluster's left.
    const firstGroup = ordered[0].group;
    expect(firstGroup).toBe("maya-gary");
  });

  it("leaves a remarried ex out of the cluster — long dashed line instead", async () => {
    // Maya re-partnered with Bob. She belongs in HER cluster with Bob,
    // not in Gary's cluster — so Maya/Gary aren't adjacent, but the
    // post-layout sweep still emits a dashed marriage edge between them.
    const t = makeTree([
      p("gary", "M", [], ["marta"], ["maya"]),
      p("marta", "F", [], ["gary"], []),
      p("maya", "F", [], ["bob"], ["gary"]),
      p("bob", "M", [], ["maya"], []),
    ]);

    const layout = await computeLayout(t);
    const maya = layout.nodes.find((node) => node.id === "maya")!;
    const gary = layout.nodes.find((node) => node.id === "gary")!;
    const bob = layout.nodes.find((node) => node.id === "bob")!;
    expect(maya.y).toBe(bob.y);
    // Maya is adjacent to Bob (her current), NOT to Gary.
    const mayaBobDistance = Math.abs(maya.x - bob.x);
    const mayaGaryDistance = Math.abs(maya.x - gary.x);
    expect(mayaBobDistance).toBe(NODE_W + SPOUSE_GAP);
    expect(mayaGaryDistance).toBeGreaterThan(NODE_W + SPOUSE_GAP);

    const exEdge = layout.edges.find(
      (e) =>
        e.kind === "spouse" &&
        e.status === "divorced" &&
        ((e.aId === "maya" && e.bId === "gary") ||
          (e.aId === "gary" && e.bId === "maya")),
    );
    expect(exEdge).toBeDefined();
  });

  it("centers a single child under a couple", async () => {
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "spouse", n("Partner"), "F");
    t = addChild(t, ROOT_ID, "kid", n("Kid"), "M");
    const layout = await computeLayout(t);
    const root = layout.nodes.find((n) => n.id === ROOT_ID)!;
    const spouse = layout.nodes.find((n) => n.id === "spouse")!;
    const kid = layout.nodes.find((n) => n.id === "kid")!;
    const coupleMid = (root.x + root.w + spouse.x) / 2;
    const kidMid = kid.x + kid.w / 2;
    expect(Math.abs(coupleMid - kidMid)).toBeLessThan(1);
  });

  it("uses barycenter to pull a spouse next to their siblings", async () => {
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
    const layout = await computeLayout(t);
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

  it("never overlaps two couples on the same generation row", async () => {
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
    const layout = await computeLayout(t);
    const persons = t.persons;
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        const xOverlap = !(a.x + a.w <= b.x || b.x + b.w <= a.x);
        const yOverlap = !(a.y + a.h <= b.y || b.y + b.h <= a.y);
        if (xOverlap && yOverlap) {
          throw new Error(
            `nodes overlap: ${fullName(persons[a.id])} and ${fullName(persons[b.id])}`,
          );
        }
      }
    }
  });

  it("is deterministic — repeated layouts produce identical positions", async () => {
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
    const a = await computeLayout(build());
    const b = await computeLayout(build());
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
    t = addChild(t, ROOT_ID, "a", n("A"), "M");
    t = addChild(t, ROOT_ID, "b", n("B"), "F");
    expect(countChildren(t, ROOT_ID)).toBe(2);
    expect(countChildren(t, "a")).toBe(0);
  });
});

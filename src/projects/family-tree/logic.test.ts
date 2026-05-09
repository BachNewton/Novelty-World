import { describe, it, expect } from "vitest";
import {
  ROOT_ID,
  ROOT_NAME,
  addChild,
  addParent,
  addSpouse,
  computeLayout,
  createInitialTree,
  deletePerson,
  renamePerson,
} from "./logic";

describe("createInitialTree", () => {
  it("seeds with root person only", () => {
    const t = createInitialTree();
    expect(Object.keys(t.persons)).toEqual([ROOT_ID]);
    expect(t.persons[ROOT_ID].name).toBe(ROOT_NAME);
  });
});

describe("addParent", () => {
  it("attaches a parent to the child", () => {
    const t1 = createInitialTree();
    const t2 = addParent(t1, ROOT_ID, "p1", "Mom");
    expect(t2.persons[ROOT_ID].parentIds).toEqual(["p1"]);
    expect(t2.persons.p1.name).toBe("Mom");
  });

  it("auto-marries the two parents when the second is added", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", "Mom");
    t = addParent(t, ROOT_ID, "dad", "Dad");
    expect(t.persons.mom.spouseIds).toEqual(["dad"]);
    expect(t.persons.dad.spouseIds).toEqual(["mom"]);
  });

  it("is a no-op when the child already has two parents", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", "Mom");
    t = addParent(t, ROOT_ID, "dad", "Dad");
    const t2 = addParent(t, ROOT_ID, "extra", "Extra");
    expect(t2).toBe(t);
  });
});

describe("addChild", () => {
  it("uses the parent's spouse as a co-parent if present", () => {
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "spouse", "Partner");
    t = addChild(t, ROOT_ID, "kid", "Kid");
    expect([...t.persons.kid.parentIds].sort()).toEqual([ROOT_ID, "spouse"].sort());
  });

  it("creates a single-parent child when the parent has no spouse", () => {
    let t = createInitialTree();
    t = addChild(t, ROOT_ID, "kid", "Kid");
    expect(t.persons.kid.parentIds).toEqual([ROOT_ID]);
  });
});

describe("addSpouse", () => {
  it("links spouses bidirectionally", () => {
    const t = addSpouse(createInitialTree(), ROOT_ID, "s", "S");
    expect(t.persons[ROOT_ID].spouseIds).toEqual(["s"]);
    expect(t.persons.s.spouseIds).toEqual([ROOT_ID]);
  });
});

describe("renamePerson", () => {
  it("updates the name", () => {
    const t = renamePerson(createInitialTree(), ROOT_ID, "K. Hutchinson");
    expect(t.persons[ROOT_ID].name).toBe("K. Hutchinson");
  });
});

describe("deletePerson", () => {
  it("refuses to delete the root", () => {
    const t = createInitialTree();
    expect(deletePerson(t, ROOT_ID)).toBe(t);
  });

  it("removes a person and cleans references", () => {
    let t = createInitialTree();
    t = addSpouse(t, ROOT_ID, "spouse", "Partner");
    t = addChild(t, ROOT_ID, "kid", "Kid");
    t = deletePerson(t, "spouse");
    expect(t.persons.spouse as unknown).toBeUndefined();
    expect(t.persons[ROOT_ID].spouseIds).toEqual([]);
    expect(t.persons.kid.parentIds).toEqual([ROOT_ID]);
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
    t = addSpouse(t, ROOT_ID, "s", "Partner");
    const layout = computeLayout(t);
    const root = layout.nodes.find((n) => n.id === ROOT_ID)!;
    const spouse = layout.nodes.find((n) => n.id === "s")!;
    expect(root.y).toBe(spouse.y);
    expect(layout.edges.some((e) => e.kind === "spouse")).toBe(true);
  });

  it("places ancestors above the root", () => {
    let t = createInitialTree();
    t = addParent(t, ROOT_ID, "mom", "Mom");
    const layout = computeLayout(t);
    const root = layout.nodes.find((n) => n.id === ROOT_ID)!;
    const mom = layout.nodes.find((n) => n.id === "mom")!;
    expect(mom.y).toBeLessThan(root.y);
  });

  it("places children below their parents and connects them", () => {
    let t = createInitialTree();
    t = addChild(t, ROOT_ID, "kid", "Kid");
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
    t = addSpouse(t, ROOT_ID, "spouse", "Partner");
    t = addChild(t, ROOT_ID, "kid", "Kid");
    const layout = computeLayout(t);
    const root = layout.nodes.find((n) => n.id === ROOT_ID)!;
    const spouse = layout.nodes.find((n) => n.id === "spouse")!;
    const kid = layout.nodes.find((n) => n.id === "kid")!;
    const coupleMid = (root.x + root.w + spouse.x) / 2;
    const kidMid = kid.x + kid.w / 2;
    expect(Math.abs(coupleMid - kidMid)).toBeLessThan(1);
  });
});

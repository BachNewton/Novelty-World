import { describe, expect, it } from "vitest";
import { addChild, addSpouse, createInitialTree, ROOT_ID } from "../logic";
import type { NameFields, Tree } from "../types";
import {
  applyOps,
  describePerson,
  parseOps,
  resolveId,
  searchPersons,
  shortId,
  type Op,
} from "./tree-edit";

function n(firstName: string, lastName = "", birthSurname = ""): NameFields {
  return { firstName, middleName: "", lastName, commonName: "", birthSurname };
}

// Root, married to a spouse, with one shared child and one child of the root
// alone. Ids look like the app's UUIDs so prefix resolution is realistic.
const SPOUSE = "5a0e0000-0000-4000-8000-000000000001";
const SHARED_KID = "c1d00000-0000-4000-8000-000000000002";
const SOLO_KID = "c1d00000-0000-4000-8000-000000000003";

function family(): Tree {
  let tree = createInitialTree();
  tree = addSpouse(tree, ROOT_ID, SPOUSE, n("Sam", "Root", "Birth"), "F");
  tree = addChild(tree, ROOT_ID, SHARED_KID, n("Ada", "Root"), "F", SPOUSE);
  tree = addChild(tree, ROOT_ID, SOLO_KID, n("Bo", "Root"), "M", null);
  return tree;
}

function counter(): () => string {
  let i = 0;
  return () => `new-${++i}`;
}

function run(tree: Tree, ops: unknown[]): ReturnType<typeof applyOps> {
  return applyOps(tree, parseOps(ops), counter());
}

describe("parseOps", () => {
  it("accepts a well-formed change file", () => {
    const ops: Op[] = parseOps([
      { op: "rename", person: "kyle", name: { lastName: "X" } },
      { op: "addChild", ref: "@kid", parent: "kyle", coParent: null, name: { firstName: "K" }, gender: "NB" },
    ]);
    expect(ops).toHaveLength(2);
  });

  it.each([
    [{}, /unknown op/],
    [{ op: "fly" }, /unknown op/],
    [{ op: "setGender", person: "x" }, /missing "gender"/],
    [{ op: "setGender", person: "x", gender: "X" }, /"gender" must be one of M, F, NB/],
    [{ op: "setGender", person: "x", gender: "M", extra: 1 }, /unknown field "extra"/],
    [{ op: "rename", person: "x", name: { lastname: "Y" } }, /unknown field "lastname"/],
    [{ op: "addChild", parent: "x", name: { firstName: "A" }, gender: "M" }, /missing "coParent"/],
    [{ op: "addParent", ref: "kid", child: "x", name: { firstName: "A" }, gender: "M" }, /"ref" must look like/],
    [{ op: "addSpouse", person: "x", name: { firstName: "A" }, gender: "M", status: "wed", bioChildren: [] }, /"status" must be one of/],
  ])("rejects %j", (op, message) => {
    expect(() => parseOps([op])).toThrow(message);
  });

  it("rejects a file that isn't a list", () => {
    expect(() => parseOps({ op: "rename" })).toThrow(/JSON list/);
  });
});

describe("resolveId", () => {
  it("resolves exact ids and unique prefixes", () => {
    const tree = family();
    expect(resolveId(tree, ROOT_ID)).toBe(ROOT_ID);
    expect(resolveId(tree, "5a0e")).toBe(SPOUSE);
  });

  it("fails loudly on ambiguous and unknown prefixes", () => {
    const tree = family();
    expect(() => resolveId(tree, "c1d")).toThrow(/matches 2 people/);
    expect(() => resolveId(tree, "zzz")).toThrow(/No person/);
  });

  it("shortens ids to a unique prefix of at least 8 characters", () => {
    const tree = family();
    expect(shortId(tree, SPOUSE)).toBe("5a0e0000");
    expect(shortId(tree, SHARED_KID)).toBe(SHARED_KID.slice(0, 36));
    expect(resolveId(tree, shortId(tree, SOLO_KID))).toBe(SOLO_KID);
  });
});

describe("find and show", () => {
  it("searches every name field, full names, and notes, ignoring case", () => {
    let tree = family();
    tree = run(tree, [{ op: "appendNote", person: "c1d00000-0000-4000-8000-000000000003", note: "Born in Tampere" }]).tree;
    expect(searchPersons(tree, "birth").map((p) => p.id)).toEqual([SPOUSE]);
    expect(searchPersons(tree, "ada root").map((p) => p.id)).toEqual([SHARED_KID]);
    expect(searchPersons(tree, "TAMPERE").map((p) => p.id)).toEqual([SOLO_KID]);
  });

  it("shows parents, unions, children, and notes", () => {
    const text = describePerson(family(), ROOT_ID);
    expect(text).toContain("Sam Root (née Birth) [5a0e0000] (married)");
    expect(text).toContain("Ada Root");
    expect(text).toContain("(with Sam Root (née Birth) [5a0e0000])");
    expect(text).toContain("(no other parent)");
  });
});

describe("applyOps", () => {
  it("merges a partial rename into the existing names", () => {
    const { tree, changes } = run(family(), [
      { op: "rename", person: "5a0e", name: { commonName: " Sammy " } },
    ]);
    expect(tree.persons[SPOUSE]).toMatchObject({
      firstName: "Sam",
      lastName: "Root",
      commonName: "Sammy",
      birthSurname: "Birth",
    });
    expect(changes).toEqual([
      'Rename Sam Root (née Birth) [5a0e0000]: commonName "" → "Sammy"',
    ]);
  });

  it("lets later ops refer to people added earlier by ref", () => {
    const { tree, changes } = run(family(), [
      { op: "addSpouse", ref: "@partner", person: "c1d00000-0000-4000-8000-000000000003", name: { firstName: "Cy" }, gender: "M", status: "partner", bioChildren: [] },
      { op: "addChild", ref: "@grandkid", parent: "c1d00000-0000-4000-8000-000000000003", coParent: "@partner", name: { firstName: "Di" }, gender: "F" },
      { op: "setNotes", person: "@grandkid", notes: "Possible: twin" },
    ]);
    expect(tree.persons["new-1"].unions).toEqual([{ personId: SOLO_KID, status: "partner" }]);
    expect(tree.persons["new-2"].parentIds).toEqual([SOLO_KID, "new-1"]);
    expect(tree.persons["new-2"].notes).toBe("Possible: twin");
    expect(changes[1]).toMatch(/^Add child Di \(F\) as @grandkid of Bo Root \[.+\] and Cy \[new-1\]$/);
  });

  it("adds a spouse as parent of the named children only", () => {
    const { tree } = run(family(), [
      { op: "addSpouse", person: "kyle", name: { firstName: "Ex" }, gender: "F", status: "divorced", bioChildren: [SOLO_KID] },
    ]);
    expect(tree.persons[SOLO_KID].parentIds).toEqual([ROOT_ID, "new-1"]);
    expect(tree.persons[ROOT_ID].unions).toContainEqual({ personId: "new-1", status: "divorced" });
  });

  it("refuses a bio child who already has another parent", () => {
    expect(() =>
      run(family(), [
        { op: "addSpouse", person: "kyle", name: { firstName: "Ex" }, gender: "F", status: "divorced", bioChildren: [SHARED_KID] },
      ]),
    ).toThrow(/Operation 1 \(addSpouse\): Ada Root .* must have .* as their only parent/);
  });

  it("says when a second parent is married automatically", () => {
    const { tree, changes } = run(family(), [
      { op: "addParent", child: SOLO_KID, name: { firstName: "Mo" }, gender: "F" },
    ]);
    expect(tree.persons[SOLO_KID].parentIds).toEqual([ROOT_ID, "new-1"]);
    expect(changes[0]).toContain("married to Kyle Hutchinson");
  });

  it("changes union status and records who died", () => {
    const { tree, changes } = run(family(), [
      { op: "setUnionStatus", a: "kyle", b: "5a0e", status: "ended-by-death" },
      { op: "setUnionDeceased", a: "kyle", b: "5a0e", deceased: "5a0e" },
    ]);
    expect(tree.persons[ROOT_ID].unions).toEqual([
      { personId: SPOUSE, status: "ended-by-death", deceasedId: SPOUSE },
    ]);
    expect(changes[0]).toContain("married → ended-by-death");
    expect(changes[1]).toContain("Sam Root (née Birth) [5a0e0000] died");
  });

  it("appends notes on a new line", () => {
    const { tree } = run(family(), [
      { op: "appendNote", person: "kyle", note: "first" },
      { op: "appendNote", person: "kyle", note: "second" },
    ]);
    expect(tree.persons[ROOT_ID].notes).toBe("first\nsecond");
  });

  it("deletes a person and says what goes with them", () => {
    const { tree, changes } = run(family(), [{ op: "deletePerson", person: "5a0e" }]);
    expect(SPOUSE in tree.persons).toBe(false);
    expect(tree.persons[SHARED_KID].parentIds).toEqual([ROOT_ID]);
    expect(changes[0]).toContain("parent of Ada Root");
    expect(changes[0]).toContain("married to Kyle Hutchinson");
  });

  it.each<[string, unknown[], RegExp]>([
    ["an unknown ref", [{ op: "setGender", person: "@nobody", gender: "M" }], /@nobody is not defined/],
    ["a ref defined twice", [
      { op: "addChild", ref: "@a", parent: "kyle", coParent: null, name: { firstName: "A" }, gender: "M" },
      { op: "addChild", ref: "@a", parent: "kyle", coParent: null, name: { firstName: "B" }, gender: "M" },
    ], /@a is defined twice/],
    ["a third parent", [
      { op: "addParent", child: SHARED_KID, name: { firstName: "Z" }, gender: "M" },
    ], /already has two parents/],
    ["a duplicate child (a re-run change file)", [
      { op: "addChild", parent: "kyle", coParent: "5a0e", name: { firstName: "Ada", lastName: "Root" }, gender: "F" },
    ], /already a child of .* named Ada Root/],
    ["a new person without a first name", [
      { op: "addChild", parent: "kyle", coParent: null, name: { lastName: "Root" }, gender: "F" },
    ], /needs a firstName/],
    ["a rename that changes nothing", [{ op: "rename", person: "5a0e", name: { firstName: "Sam" } }], /already has these names/],
    ["a status change on a pair with no union", [
      { op: "setUnionStatus", a: "5a0e", b: SOLO_KID, status: "divorced" },
    ], /have no union/],
    ["recording a death on a marriage", [
      { op: "setUnionDeceased", a: "kyle", b: "5a0e", deceased: "kyle" },
    ], /no ended-by-death union/],
    ["deleting the root", [{ op: "deletePerson", person: "kyle" }], /root person can't be deleted/],
    ["an ambiguous prefix", [{ op: "setGender", person: "c1d", gender: "M" }], /matches 2 people/],
  ])("fails loudly on %s", (_, ops, message) => {
    expect(() => run(family(), ops)).toThrow(message);
  });

  it("does not touch the input tree", () => {
    const tree = family();
    const before = JSON.stringify(tree);
    run(tree, [{ op: "deletePerson", person: "5a0e" }]);
    expect(JSON.stringify(tree)).toBe(before);
  });

  it("rejects a result that breaks an invariant", () => {
    const tree = family();
    // A one-sided union: the kind of damage hand-editing the JSON causes.
    tree.persons[SOLO_KID].unions.push({ personId: SHARED_KID, status: "married" });
    expect(() => run(tree, [{ op: "setGender", person: "kyle", gender: "NB" }])).toThrow(
      /changed tree is invalid:\n {2}- Bo Root .* union with Ada Root .* is one-sided/,
    );
  });
});

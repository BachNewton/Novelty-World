import { describe, expect, it } from "vitest";
import { addChild, createInitialTree, ROOT_ID, setNotes, topologyHash } from "../logic";
import type { Tree } from "../types";
import { verifyProblems, type Probe, type VerifyInput } from "./tree-verify";

const KID = "c1d00000-0000-4000-8000-000000000002";

function tree(): Tree {
  return addChild(
    createInitialTree(),
    ROOT_ID,
    KID,
    { firstName: "Ada", middleName: "", lastName: "Root", commonName: "", birthSurname: "" },
    "F",
    null,
  );
}

const LOCKED: Probe[] = [
  { target: "table family_tree_private", outcome: { kind: "refused" } },
  { target: "table family_tree_history", outcome: { kind: "empty" } },
  { target: "function family_tree_commit", outcome: { kind: "refused" } },
];

// A consistent, locked-down state at version 7.
function healthy(): VerifyInput {
  const t = tree();
  return {
    probes: LOCKED,
    privateRow: { data: t, version: 7 },
    publicRow: { data: t, version: 7, layout: { nodes: [], edges: [], width: 0, height: 0 }, layoutTreeHash: topologyHash(t) },
    snapshot: { version: 7, data: t },
  };
}

describe("verifyProblems", () => {
  it("passes a locked, consistent state", () => {
    expect(verifyProblems(healthy())).toEqual([]);
  });

  it("fails when the anon key reaches a private target, or the probe errors", () => {
    const input = healthy();
    input.probes = [
      { target: "table family_tree_change", outcome: { kind: "exposed", detail: "1 row(s) came back" } },
      { target: "function family_tree_commit", outcome: { kind: "error", message: "40001: stale" } },
    ];
    expect(verifyProblems(input)).toEqual([
      "the anon key reached table family_tree_change: 1 row(s) came back",
      "probing function family_tree_commit with the anon key failed without a refusal: 40001: stale",
    ]);
  });

  it("fails when a row is missing", () => {
    expect(verifyProblems({ ...healthy(), privateRow: null })).toEqual([
      "there is no private research document row",
    ]);
  });

  it("fails when the rows' versions differ", () => {
    const input = healthy();
    input.privateRow = { data: tree(), version: 8 };
    input.snapshot = { version: 8, data: tree() };
    expect(verifyProblems(input)).toEqual([
      "the research document is at version 8 but the public row is at 7",
    ]);
  });

  it("fails when the public row isn't the projection", () => {
    const input = healthy();
    const edited = setNotes(tree(), KID, "private detail");
    input.privateRow = { data: edited, version: 7 };
    input.snapshot = { version: 7, data: edited };
    expect(verifyProblems(input)).toEqual(["the public row is not the projection of the research document"]);
  });

  it("fails on a missing or mismatched layout", () => {
    const input = healthy();
    if (input.publicRow === null) throw new Error("fixture");
    expect(verifyProblems({ ...input, publicRow: { ...input.publicRow, layout: null } })).toEqual([
      "the public row has no layout",
    ]);
    expect(verifyProblems({ ...input, publicRow: { ...input.publicRow, layoutTreeHash: "other" } })).toEqual([
      "the stored layout was solved for a different tree",
    ]);
  });

  it("fails when the history lacks the current version or holds another document", () => {
    expect(verifyProblems({ ...healthy(), snapshot: null })).toEqual([
      "the history has no snapshot of the current version 7",
    ]);
    expect(verifyProblems({ ...healthy(), snapshot: { version: 7, data: createInitialTree() } })).toEqual([
      "the history's snapshot of version 7 differs from the research document",
    ]);
  });
});

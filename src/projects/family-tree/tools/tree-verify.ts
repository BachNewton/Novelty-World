// The pure half of the CLI's `verify`: judge what tree-db.ts read. Private
// data must be locked away from the anon key three ways (RLS with no policy,
// revoked grants, and this probe), and the public row must be exactly the
// projection of the private research document, with a layout solved for it.
// `verify` runs after every write and at the start of every research round.

import { isDeepStrictEqual } from "node:util";
import { normalizeTree, projectTree, topologyHash } from "../logic";
import type { TreeRow } from "../persistence";

// What the anon key got when it tried to read a private table or call the
// commit function: refused (permission denied), nothing, something, or an
// error that says neither.
export type ProbeOutcome =
  | { kind: "refused" }
  | { kind: "empty" }
  | { kind: "exposed"; detail: string }
  | { kind: "error"; message: string };

export interface Probe {
  target: string;
  outcome: ProbeOutcome;
}

export interface VerifyInput {
  probes: Probe[];
  privateRow: { data: unknown; version: number } | null;
  publicRow: TreeRow | null;
  // The history row at the private row's version, if there is one.
  snapshot: { version: number; data: unknown } | null;
}

function probeProblem({ target, outcome }: Probe): string | null {
  switch (outcome.kind) {
    case "refused":
    case "empty":
      return null;
    case "exposed":
      return `the anon key reached ${target}: ${outcome.detail}`;
    case "error":
      return `probing ${target} with the anon key failed without a refusal: ${outcome.message}`;
  }
}

export function verifyProblems(input: VerifyInput): string[] {
  const problems = input.probes.flatMap((probe) => probeProblem(probe) ?? []);
  const { privateRow, publicRow, snapshot } = input;
  if (privateRow === null) problems.push("there is no private research document row");
  if (publicRow === null) problems.push("there is no public tree row");
  if (privateRow === null || publicRow === null) return problems;

  if (privateRow.version !== publicRow.version) {
    problems.push(
      `the research document is at version ${privateRow.version} but the public row is at ${publicRow.version}`,
    );
  }
  const publicTree = normalizeTree(publicRow.data).tree;
  if (!isDeepStrictEqual(projectTree(normalizeTree(privateRow.data).tree), publicTree)) {
    problems.push("the public row is not the projection of the research document");
  }
  if (publicRow.layout === null) problems.push("the public row has no layout");
  else if (publicRow.layoutTreeHash !== topologyHash(publicTree)) {
    problems.push("the stored layout was solved for a different tree");
  }
  if (snapshot === null) {
    problems.push(`the history has no snapshot of the current version ${privateRow.version}`);
  } else if (!isDeepStrictEqual(snapshot.data, privateRow.data)) {
    problems.push(`the history's snapshot of version ${snapshot.version} differs from the research document`);
  }
  return problems;
}

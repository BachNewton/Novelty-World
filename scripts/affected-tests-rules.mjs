// The parts of the test selector (affected-tests.mjs) that decide what counts as
// the change and what a test reaches, apart from Vitest so they can be tested.

import { execFileSync } from "node:child_process";
import path from "node:path";

export const git = (root, gitArgs) =>
  execFileSync("git", ["-C", root, ...gitArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// Git answers these yes-or-no questions with exit code 0 or 1; anything else is an error.
const asks = (root, gitArgs) => {
  try {
    git(root, gitArgs);
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
};

const exists = (root, ref) => asks(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
const isAncestor = (root, older, newer) => asks(root, ["merge-base", "--is-ancestor", older, newer]);

/**
 * The commit the change is measured from: where this checkout's work began.
 *
 * A branch (or a detached HEAD) is measured from its merge base with local
 * `main`, the branch work here is cut from, which often holds commits that were
 * never pushed: they are main's, not the branch's. When `origin/main` has moved
 * past local main, the newer of the two merge bases wins. On `main` itself, the
 * commits not yet on `origin/main` are the work. `override` names another branch
 * to measure from, for a branch cut from one that isn't main.
 */
export function diffBase(root, override) {
  const merge = (ref) => ({ ref, commit: git(root, ["merge-base", "HEAD", ref]).trim() });
  if (override) return merge(override);

  const branch = git(root, ["branch", "--show-current"]).trim();
  const refs = (branch === "main" ? ["origin/main"] : ["main", "origin/main"]).filter((ref) => exists(root, ref));
  if (refs.length === 0) return { ref: "HEAD", commit: git(root, ["rev-parse", "HEAD"]).trim() };

  return refs.map(merge).reduce((a, b) => {
    if (isAncestor(root, b.commit, a.commit)) return a;
    if (isAncestor(root, a.commit, b.commit)) return b;
    return { ref: `${a.ref} and ${b.ref}`, commit: git(root, ["merge-base", a.commit, b.commit]).trim() };
  });
}

/** The project a repo path belongs to: its code under src/projects/<slug>/, its
 *  assets under public/<slug>/. */
export function projectOf(repoPath, projects) {
  const slug = repoPath.match(/^(?:src\/projects|public)\/([^/]+)\//)?.[1];
  return slug !== undefined && projects.has(slug) ? slug : undefined;
}

/**
 * The folders a test that reads the disk is assumed to read: its project's, or,
 * for a test outside any project, its own directory's. Repo paths, each ending
 * in a slash; the first holds the code.
 */
export function homeOf(testPath, projects) {
  const project = projectOf(testPath, projects);
  if (project === undefined) return [`${path.posix.dirname(testPath)}/`];
  return [`src/projects/${project}/`, `public/${project}/`];
}

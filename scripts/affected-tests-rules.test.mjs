import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diffBase, git, homeOf, projectOf } from "./affected-tests-rules.mjs";

describe("diffBase", () => {
  let root;
  const run = (...args) => git(root, args).trim();
  const commit = (message) => {
    run("commit", "--allow-empty", "-q", "-m", message);
    return run("rev-parse", "HEAD");
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "diff-base-"));
    run("init", "-q", "-b", "main");
    run("config", "user.name", "test");
    run("config", "user.email", "test@example.com");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  // origin/main as a fetch would leave it, without a remote.
  const pushed = (commitId) => run("update-ref", "refs/remotes/origin/main", commitId);

  it("measures a branch from local main, not from the unpushed commits behind it", () => {
    pushed(commit("pushed"));
    const unpushed = commit("unpushed on main");
    run("switch", "-q", "-c", "work");
    commit("the branch's own");
    expect(diffBase(root)).toEqual({ ref: "main", commit: unpushed });
  });

  it("measures a fresh branch at main's tip from that tip", () => {
    pushed(commit("pushed"));
    const tip = commit("unpushed on main");
    run("switch", "-q", "-c", "work");
    expect(diffBase(root).commit).toBe(tip);
  });

  it("measures main itself from what is pushed", () => {
    const remote = commit("pushed");
    pushed(remote);
    commit("unpushed on main");
    expect(diffBase(root)).toEqual({ ref: "origin/main", commit: remote });
  });

  it("takes origin/main's merge base when it is newer than local main's", () => {
    commit("old main");
    run("switch", "-q", "-c", "work");
    const fetched = commit("on origin, not pulled");
    pushed(fetched);
    commit("the branch's own");
    expect(diffBase(root)).toEqual({ ref: "origin/main", commit: fetched });
  });

  it("measures from a branch it is told to", () => {
    commit("main");
    run("switch", "-q", "-c", "feature");
    const feature = commit("feature");
    run("switch", "-q", "-c", "stacked");
    commit("stacked");
    expect(diffBase(root, "feature")).toEqual({ ref: "feature", commit: feature });
  });
});

describe("homeOf", () => {
  const projects = new Set(["risk", "rpg"]);

  it("is the test's own directory outside any project", () => {
    expect(homeOf("src/shared/lib/bot-lab/pool.test.ts", projects)).toEqual(["src/shared/lib/bot-lab/"]);
  });

  it("owns public assets only under a project's own slug", () => {
    expect(projectOf("public/rpg/tiles/grass.png", projects)).toBe("rpg");
    expect(projectOf("public/rpg-extra/grass.png", projects)).toBeUndefined();
  });
});

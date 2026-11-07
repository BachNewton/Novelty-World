---
name: worktree
description: Give an agent (or a second dev server) its own git worktree of Novelty World, so its edits never hot-reload into the owner's running dev server and parallel agents don't trip over each other's half-finished files. Covers creating it from the current HEAD with setup.ps1 (no npm install: it resolves the main checkout's node_modules upward), the dependency-change exception, launching the agent in it, landing its branch back on the main checkout, and removing it safely with teardown.ps1: the mechanics that the orchestrate skill and the /ready command use, which say who does each step when an orchestrator runs many sessions. Use whenever work is delegated while the owner is playtesting on their dev server, when several agents edit in parallel, or when a reference build must run beside the main one.
---

# Worktrees for agents

The owner keeps `npm run dev` running in the main checkout and plays while agents work. An agent editing that checkout hot-reloads half-finished code into the game. So each agent gets its own worktree on its own branch, and the main checkout only changes when a finished, green piece of work lands.

This skill is how a worktree is made, landed and removed. When an orchestrating session runs many sessions, who does each of those steps is the `orchestrate` skill's, and a session hands its finished worktree over with `/ready`. Working alone, an agent and whoever launched it do every step here themselves.

## Create it

From the main checkout:

```powershell
.\.claude\skills\worktree\setup.ps1 -Name <name> -Branch <branch>
```

It creates `.claude/worktrees/<name>` on a new branch from the current `HEAD`, copies `.env.local`, and runs `next typegen`. It takes seconds.

- **From `HEAD`, not `origin/main`:** work that has landed locally but isn't pushed yet must be in the branch. That is also why `EnterWorktree` with a `name` is the wrong tool here: it branches from `origin/<default branch>`.
- **`.env.local` is copied, never linked.** It is gitignored, so a fresh worktree has none, and anything touching Supabase fails without it.
- **`next typegen`** writes `next-env.d.ts`, which is gitignored too. Without it `npm run typecheck` fails on every image import. A dev server or build in the worktree rewrites it anyway.

A session an orchestrator starts with a worktree of its own gets one Claude Desktop makes, also under `.claude/worktrees/`, from the orchestrator's base branch. Everything below holds for it too; if its `.env.local` or `next-env.d.ts` is missing, copy the first from the main checkout and run `npx next typegen` for the second.

## Dependencies: none to install

A worktree has no `node_modules` of its own. It sits inside the main checkout, so Node resolves packages upward and finds the main checkout's install. The repo's Python venv (`.venv` at the root, for the family tree's layout solver) is found upward the same way. Nothing is copied or linked, so nothing is at risk. It is safe because every tool that walks the main checkout leaves nested checkouts alone:

- `.gitignore` ignores `.claude/*` (skills and commands are un-ignored, worktrees are not).
- Lint ignores `.claude/**` (`eslint.config.mjs`), vitest excludes `NESTED_CHECKOUTS` (`vitest.config.ts`), `tsconfig.json` excludes `.claude/worktrees`, and Playwright only looks in `e2e/`. Without the tsconfig exclude the main checkout type-checks worktree files against its own `@/*` paths and reports phantom errors under `.claude/worktrees/`; if those ever appear, the exclude was dropped.
- **So every check runs from inside the worktree.** Those ignores are relative to the config that loads, and a config loads from the working directory. Inside the worktree, `npm run test` (scoped to the change), `npm run slot -- unit -- npx vitest run <file>`, `npm run lint` and `npm run typecheck` see the worktree's own files and nothing nested. Run from the main checkout, the main checkout's config excludes `.claude/**`: a worktree file passed by path finds "No test files", `--changed` reads the main checkout's git state, and lint and typecheck pass vacuously. An agent's shell starts each command in the main checkout, so it runs `cd <worktree> && <check>` in one command.
- Turbopack compiles nothing outside its root, which defaults to the nearest lockfile's folder: the worktree, where it can't find `next`. `next.config.ts` sets the root to the nearest folder holding `node_modules/next`, which is the repo root everywhere except a worktree.

**The exception: a branch that changes dependencies.** Upward resolution hands the worktree the main checkout's install, so a branch that edits `package.json` or `package-lock.json` runs against the wrong packages. Run `npm install` inside that worktree after the change, and only then. Never run it in the main checkout from an agent: other processes use that install.

**Never junction or symlink `node_modules` (or anything) into a worktree.** `git worktree remove` follows a junction and deletes the real files in the main checkout, with no recycle bin. Turbopack also rejects a `node_modules` pointing outside its root, so the trick doesn't even work.

## Launch the agent in it

A session's write isolation is fixed at launch, subagents included, so the agent must be told its worktree, not move into one:

- Give it the worktree's absolute path as its working directory, and tell it to use absolute paths and `git -C <worktree>`.
- Tell it not to call `EnterWorktree`.
- It must never touch the owner's dev server (port 3001). A dev server of its own, if it needs one, runs with Turbopack on a spare port (`npx next dev --port <port>`), and when it is done it confirms that port is free again.
- Its heavy runs go through the machine's budget ("Sharing the machine" in the root `CLAUDE.md`), which every worktree shares: the npm scripts queue by themselves, and a branch older than the budget wraps its commands in `node <main checkout>/scripts/slot.mjs`. Under an orchestrator it runs no e2e: the orchestrator runs them for what lands. Working alone it runs `npm run test:e2e`, which picks only the tests its change reaches.
- It commits its work on its branch when its checks are green, and doesn't push. Under an orchestrator, once the owner signs it off, it runs `/ready` and stops.
- Tell it which files the other agents are working on, so merges stay clean.

## Land it

Landing is two halves. Under an orchestrator the session does the first, as part of `/ready`, and the orchestrator the second; working alone, whoever launched the agent does both.

Conflicts are resolved in the worktree, never in the main checkout, where a half-resolved merge would hot-reload into the owner's game: inside the worktree, merge the main checkout's current branch into the agent's (`git -C <worktree> merge main`), resolve, and make the tree green there as the project's rules scope it. Then, from the main checkout, merge the agent's branch (`git merge <branch>`), which now lands clean. Later worktrees are then created from that new `HEAD`. Push only when the owner asks.

## Remove it

Whoever landed the branch removes its worktree: the orchestrator, or whoever launched the agent. A session never removes the worktree it runs in, since a folder in use can't be deleted.

```powershell
.\.claude\skills\worktree\teardown.ps1 -Name <name>
```

It refuses a worktree with uncommitted changes or a branch that isn't merged (`-Force` overrides both; `-KeepBranch` keeps the branch). It deletes the folder with `rmdir /s`, which removes a junction without entering it, rather than `git worktree remove`, which follows one: no junction should exist, but a build in the worktree can make some under `.next`. Then it prunes the worktree and deletes the branch.

When Windows refuses the delete, some process still has the folder as its working directory, most often one left by an interrupted command (a test run, a dev server, a solver), which keeps running in the folder it started in. Teardown then lists those processes (`holders.ps1`, which also runs on its own with `-Path <folder>`), so the right ones can be stopped before rerunning it. Stop only processes that belong to this worktree's work: another session's are its owner's.

---
name: worktree
description: Give an agent (or a second dev server) its own git worktree of Novelty World, so its edits never hot-reload into the owner's running dev server and parallel agents don't trip over each other's half-finished files. Covers creating it from the current HEAD, installing dependencies (a cached npm install, never a junction), launching the agent in it, landing its branch back on the main checkout, and removing it safely. Use whenever work is delegated while the owner is playtesting on their dev server, when several agents edit in parallel, or when a reference build must run beside the main one.
---

# Worktrees for agents

The owner keeps `npm run dev` running in the main checkout and plays while agents work. An agent editing that checkout hot-reloads half-finished code into the game. So each agent gets its own worktree on its own branch, and the main checkout only changes when a finished, green piece of work lands.

## Create it from HEAD

Worktrees live in `.claude/worktrees/<name>` (gitignored, and inside the session's directory, so agents may write there). Create the branch from the current `HEAD`, not from `origin/main`: work that has landed locally but isn't pushed yet must be in it.

```bash
git -C <repo> worktree add .claude/worktrees/<name> -b <branch> HEAD
```

Don't use `EnterWorktree` with a `name` for this: it branches from `origin/<default branch>`, which misses local commits.

## Dependencies: a cached install, never a junction

From the worktree:

```bash
npm install --prefer-offline --no-audit --no-fund
cp <repo>/.env.local .env.local
```

The install takes about a minute from npm's cache (node_modules is about 1.9 GB, 45,000 files, so a copy is unlikely to beat it) and always matches the worktree's lockfile. `.env.local` is gitignored, so a fresh worktree has none and anything touching Supabase fails without it; copy it, never link it.

**Never junction or symlink `node_modules` (or anything) into a worktree.** `git worktree remove` follows a junction and deletes the real files in the main checkout, with no recycle bin. Turbopack also rejects a `node_modules` pointing outside the project, and the webpack fallback no longer compiles on Next 16 (`node:process` is unhandled), so the trick doesn't even work.

## Launch the agent in it

A session's write isolation is fixed at launch, subagents included, so the agent must be told its worktree, not move into one:

- Give it the worktree's absolute path as its working directory, and tell it to use absolute paths and `git -C <worktree>`.
- Tell it not to call `EnterWorktree`.
- It must never touch the owner's dev server (port 3001). E2E runs are self-contained and fine inside the worktree; a dev server of its own, if it needs one, runs with Turbopack on a spare port (`npx next dev --port <port>`).
- It commits its work on its branch when its checks are green, and doesn't push.
- Tell it which files the other agents are working on, so merges stay clean.

## Land it

From the main checkout, merge the agent's branch (`git merge <branch>`), resolve any conflicts, and make the tree green as the project's rules scope it before the owner sees it. Later worktrees are then created from that new `HEAD`. Push only when the owner asks.

## Remove it

```bash
git -C <repo> worktree remove .claude/worktrees/<name>
git -C <repo> branch -d <branch>
```

If a junction somehow exists inside a worktree, remove the link alone first (`cmd /c "rmdir <link>"`) before any recursive delete.

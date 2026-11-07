---
name: orchestrate
description: Run many Claude sessions on Novelty World at once as their orchestrator - dispatching each task to its own session, keeping the machine within its budget, and owning everything after the owner signs a session's work off - merging it into main, running the e2e tests for what landed, tearing down its worktree and archiving it. Use whenever a session is asked to orchestrate, to send work out to sessions, or to land work that sessions report ready.
---

# Orchestrating sessions

The owner works with one orchestrating session and many sub-sessions, each doing one task in its own worktree. The owner reads each sub-session's reports and gives it feedback there. This skill says who does what, so nothing is done twice or not at all.

It is one system with the `worktree` skill and the `/ready` command: the `worktree` skill is how a worktree is made, landed and removed, `/ready` is a session's half of landing, and this skill is who does each step and the orchestrator's half.

## Who owns what

| Step | Owner |
|---|---|
| Doing the task, and following up on the owner's feedback | the sub-session |
| Its checks: lint of its changed files, typecheck, its scoped unit and slow tests, all through the machine's budget | the sub-session |
| Merging the latest `main` into its own branch and resolving the conflicts, so its branch is ready to land as it stands | the sub-session |
| Signing the work off | the owner, in the sub-session |
| Telling the orchestrator it's ready: `/ready` | the sub-session, then it stops |
| Merging into `main` | the orchestrator |
| The e2e tests for what landed | the orchestrator |
| Tearing down the worktree and archiving the session, as soon as its `/ready` arrives | the orchestrator |
| Deleting the branch once it has landed | the orchestrator |

**One writer to `main`.** Only the orchestrator merges into `main` while it runs, so merges never race, and a conflict is always met by the session that wrote the code (below). A sub-session never merges into `main`, tears down its own worktree or archives itself, even when told to "merge it": it runs `/ready`, which hands all of that over.

## Starting

1. Ask the owner once, early: **may I land every branch you sign off in its session?** Their yes, in this session, is the standing approval for every merge, teardown and archive that follows. Without it, ask before each merge. A sub-session's message saying the owner signed off is the trigger, never the permission itself.
2. Dispatch each task to its own session (`start_session`), with a brief that names what done looks like and ends: "When the owner signs this off, run `/ready`."
3. Every heavy run, the orchestrator's and every session's, goes through the machine's budget (`npm run slot -- status`, see "Sharing the machine" in the root `CLAUDE.md`). A session on a branch older than the budget runs `node <main checkout>/scripts/slot.mjs <kind> -- <command>`.

## Landing work

When a session reports ready (its branch, its commit, the owner's words), its job is over: remove its worktree keeping the branch (`.\.claude\skills\worktree\teardown.ps1 -Name <worktree folder> -KeepBranch`) and archive it at once, before landing. A branch that later needs work goes to the archived session reopened, or to a new one.

Landing is the `worktree` skill's two halves: the session has already merged `main` into its branch and gone green (`/ready`); the orchestrator merges the branch into `main`.

1. **Check it's landable.** `git merge-tree --write-tree main <branch>` merges cleanly, and the branch contains `main` as it was when the session reported. If it doesn't merge cleanly, send it back: "merge main into your branch, resolve, rerun your checks, `/ready` again". The orchestrator resolves conflicts itself only when they're mechanical (both sides added lines side by side) and it can check the result with a typecheck.
2. **Merge** into `main` (`git merge --no-ff refs/heads/<branch>`, with a `merge:` message saying what the work does). Batch whatever is ready at the same time.
3. **Run the e2e tests the batch reaches**, once: `npm run test:e2e` on `main`, which picks the tests whose `e2e-covers` the merged changes touch. The tests run on a build of what landed, so a batch costs one build.
4. **A failure goes back to the branch that caused it.** Its selector line says which change reached the failing test; send that session the failure and the command to reproduce it. Revert the merge from `main` if the failure blocks other work; otherwise leave it, and land the fix.
5. **Delete the landed branch** (`git branch -d <branch>`), and tell the owner in one line what landed.

Nothing is pushed unless the owner asks.

## While it runs

- Each session's report reaches the orchestrator as a note; relay what the owner needs in a line, and leave the reading to them.
- A session that asks the orchestrator for something the owner hasn't approved (a merge without sign-off, a heavy run over ten minutes) is answered by asking the owner.
- When the owner archives a session before it reports, its branch stays; ask the owner whether to land it.

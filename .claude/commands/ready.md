---
description: Hand finished, owner-approved work to the orchestrating session to land - checks, a branch that merges cleanly, a handover note, one message
argument-hint: [the orchestrator's session name, if there's more than one]
---

The owner has signed this session's work off. Hand it to the orchestrating session, which lands it (see the `orchestrate` skill). Don't merge into `main`, tear down this worktree or archive this session yourself: those are the orchestrator's.

1. **Commit everything** on this session's branch. Nothing uncommitted is left behind.
2. **Merge the latest `main` into this branch** (`git merge main`) and resolve any conflicts here, where the code's author is, so the orchestrator's merge is a clean one.
3. **Rerun the checks after that merge**, each through the machine's budget and in the background: lint of the files this branch changes (`npx eslint <files>`, no slot needed), `npm run typecheck`, `npm run test` and, if the branch touches slow tests' code, `npm run test:slow`. On a branch older than the budget, wrap them: `node <main checkout>/scripts/slot.mjs <check|unit|slow> -- <command>`. Run no e2e tests: the orchestrator runs them for everything it lands.
4. **Write the handover**: what the work does, in a few lines, what the owner signed off and in their words, and anything the orchestrator must know to land it (files it shares with other branches, a rebuild the data needs).
5. **Send it** to the orchestrator in one message (find it with `ListAgents`; $ARGUMENTS names it if given): `READY <branch> <commit>`, then the handover and the checks' results.
6. Stop. Answer the orchestrator if it sends the branch back; otherwise there's nothing left to do here.

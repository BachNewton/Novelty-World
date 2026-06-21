---
description: Evaluate a Monopoly bot-submission PR — legality, delete tests, gauntlet vs the current champion
argument-hint: <pr-number>
allowed-tools: Bash, Read, Edit, Grep, Glob
---

Evaluate the Monopoly bot submitted in **PR #$ARGUMENTS** against this repo's
current champion, decide whether it's a new champion, and prepare it for merge.

These PRs come from external bot lineages (Jane, Gemini, …). They almost always
**branch from a stale `main`**, so their self-reported number is measured against
an *outdated* champion and their edits to shared files (`versions/index.ts`,
`roles.ts`) are based on old state. The version *folder* is self-contained and
grafts cleanly; everything else must be redone on current `main`. Re-measuring on
current `main` is the whole point — never trust the PR's own win-rate claim.

Work on a **clean, committed `main`**. If the tree is dirty, stop and tell the
user. Run every command from the repo root.

## Steps

1. **Read the PR.** `gh pr view $ARGUMENTS` for the claim, then identify the new
   version folder it adds (it's stale-based, so diff *against* the PR head):

       git fetch origin pull/$ARGUMENTS/head
       git diff --name-only --diff-filter=A main FETCH_HEAD -- src/projects/monopoly/bots/versions/

   The new `versions/<label>/` folder (e.g. `jane-v2`) is the candidate. Note its
   label, its lineage prefix (`jane-v`, `gemini-v`, …), and report how stale the
   PR is (what `git merge-base main FETCH_HEAD` resolves to vs current `HEAD`) so
   it's clear why re-measuring is required.

2. **Graft only the folder** onto current `main` (conflict-free — it's isolated;
   ignore the PR's `index.ts`/`roles.ts`, they're stale):

       git checkout FETCH_HEAD -- src/projects/monopoly/bots/versions/<label>

3. **Delete the lineage's tests.** Foreign-lineage tests are copied from Claude
   ancestors and assert behavioral *equality* with them, which a new version
   breaks by design — they're noise, not signal here.

       rm -f src/projects/monopoly/bots/versions/<label>/*.test.ts

4. **Legality — "is the code legal in our repo".** All must pass:
   - **Determinism (hard rule):** the bot must be pure and seed-deterministic.
     Reject (or flag loudly) any `Math.random`, `Date.now`, or `new Date(` in the
     folder — the engine requires all randomness to flow through the injected RNG,
     and the current `Bot` contract takes none, so these break replay:

         grep -rnE 'Math\.random|Date\.now|new Date\(' src/projects/monopoly/bots/versions/<label>/

   - **Self-contained:** it must not import another version's folder (snapshots
     are frozen). Imports should only reach shared infra (`../../../engine`,
     `logic`, `development`, `types`, `../decision`) and its own siblings:

         grep -rnE "from \"\.\./(v[0-9]|jane-v|gemini-v)" src/projects/monopoly/bots/versions/<label>/

   - **Register** it in `versions/index.ts`: add one import and one map entry
     (`"<label>": <camelExport>`). Edit *current* `main`'s file — do not take the
     PR's. The `-latest` lineage pointer in `roles.ts` derives automatically from
     the highest label, so registering is all that's needed to record the version.
   - `npm run typecheck` — must be clean.
   - `npm run lint` — must be zero errors/warnings. Fix trivial mechanical issues
     (e.g. an unused var) per the project's "fix the cause, don't suppress" rule;
     if a fix is non-trivial or substantive, stop and surface it to the user
     rather than editing the submitted logic yourself.

5. **Champion gate.** Read `CHAMPION_VERSION` from
   `src/projects/monopoly/bots/roles.ts`. Run the gauntlet vs that champion on
   **both** seed streams (overfit guard — a one-stream win isn't enough):

       npm run sim:gauntlet -- <label> --base <CHAMPION> --field <CHAMPION>
       npm run sim:gauntlet -- <label> --base <CHAMPION> --field <CHAMPION> --prefix holdout

   **New champion only if `BETTER` on BOTH streams with no regressions.** Report
   win share / Elo / SPRT verdict for each, and compare to the PR's own claim.

6. **Verdict + recommendation.** Summarize:
   - Legality: pass/fail (with the determinism + self-contained results).
   - Champion: BETTER/EVEN/WORSE on each stream, the measured Elo, and whether it
     beats the PR's stale claim.
   - Recommended action, keeping the three concerns separate:
     - **Record** (always, if legal): registering it makes `<lineage> Latest`
       resolve to it — the lineage archive grows even if it's not a champion.
     - **Crown** (only if BETTER on both): bump `CHAMPION_VERSION` to `<label>`.
     - **Feature/ship** (`JANE_FEATURED_VERSION` etc.): a separate human product
       call — never automatic.

7. **Do NOT commit, crown, or bump any pointer without explicit confirmation.**
   Present the verdict and the exact diffs you'd make (register, optional
   `CHAMPION_VERSION` bump, and a proposed `EVOLUTION.md` log row — the other half
   of the acceptance ritual), then ask the user how to proceed. If they confirm,
   make the changes and commit on `main`. If legality fails, restore the tree
   (`git restore`/remove the grafted folder) and report what's blocking.

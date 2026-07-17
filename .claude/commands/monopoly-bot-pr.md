---
description: Evaluate a Monopoly bot-submission PR — legality, delete tests, rate on the Elo ladder (player default) + SPRT gauntlet crown gate
argument-hint: <pr-number>
allowed-tools: Bash, Read, Edit, Grep, Glob
---

Evaluate the Monopoly bot submitted in **PR #$ARGUMENTS** against this repo's
current champion, decide whether it's a new champion, and prepare it for merge.

These PRs come from external bot lineages (Jane, Gemini, …). They almost always
**branch from a stale `main`**, so their self-reported number is measured against
an *outdated* field and their edit to the shared `versions/index.ts` is based on
old state. The version *folder* is self-contained and grafts cleanly; everything
else must be redone on current `main`. Re-measuring on current `main` is the whole
point — never trust the PR's own win-rate claim. (Note: `roles.ts` is no longer
edited by submissions — the lobby's "best" picks are DERIVED from the Elo ladder,
so crowning is automatic once the new version is rated; see step 6.)

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
     PR's. That's all that's needed to record the version: the lobby's family list
     derives from the archive, so the new version appears automatically (and gets
     its Elo + rank once `sim:ratings` runs in step 6). Do **not** add it to
     `RATING_EXCLUDED` — a normal submission must be rated.
   - `npm run typecheck` — must be clean.
   - `npm run lint` — must be zero errors/warnings. Fix trivial mechanical issues
     (e.g. an unused var) per the project's "fix the cause, don't suppress" rule;
     if a fix is non-trivial or substantive, stop and surface it to the user
     rather than editing the submitted logic yourself.

   **Keep three decisions separate — record / strongest-default / crown — they are
   independent (see METHOD.md "Two bests"). Steps 5–7 measure each.**

5. **Rate it on the ladder → the player-facing Strongest/default (NOT the crown).**
   Run:

       npm run sim:ratings

   This rates the new version via the **anchor-panel graph** (the default — it plays
   only the version's ~k panel pairings, the rest are cache hits) and rewrites
   `bots/ratings.ts` (and `ratings-cache.json`). Read the new ladder: the version's Elo
   and its rank within its family and overall. If it tops the ladder, it auto-becomes
   the lobby's Strongest/default (`DEFAULT_BOT_VERSION`) — **no pointer to bump.**
   Topping the ladder is **not** a crown.

6. **Crown gate — SPRT against the FIELD, the confidence test.** Read the current
   confirmed champion from `EVOLUTION.md` (the "Champion (crown + substrate) status"
   note — call it `<CHAMPION>`; it is NOT necessarily the ladder-topper). Run the
   gauntlet against the **anchor panel** (`--panel`) on **both** seed streams:

       npm run sim:gauntlet -- <label> --base <CHAMPION> --panel
       npm run sim:gauntlet -- <label> --base <CHAMPION> --panel --prefix holdout

   **New crown ONLY if the gauntlet ACCEPTS on BOTH streams** — i.e. `BETTER` than
   `<CHAMPION>` (the base) AND regressing against **NO panel member**. Beating the
   champion alone is NOT enough: strength is non-transitive, so a bot can *counter* the
   champion yet lose to the rest of the field (the **jane-v3 RPS cycle** — see
   METHOD.md "Non-transitivity & the crown"). The panel field is the guard, and any
   single regression is a REJECT (this is the complexity-ratchet guard too — a
   one-stream or EVEN-vs-base result is also not a crown). Report win share / Elo / SPRT
   per opponent for each stream, and note where it disagrees with the ladder (a
   ladder-topper that's only EVEN, or a counter that regresses, is the player default
   at most but stays uncrowned).

7. **Verdict + recommendation.** Summarize the three decisions explicitly:
   - **Legality:** pass/fail (determinism + self-contained results).
   - **Record** (always, if legal): the register + regenerated `ratings.ts` /
     `ratings-cache.json`. It joins its family list with its Elo regardless.
   - **Strongest / player default:** does it top the ladder? (auto, ungated.)
   - **Crown:** only if the `--panel` gauntlet ACCEPTS on both streams (`BETTER` vs the
     base AND no panel-member regression). If crowned, record an `EVOLUTION.md` champion
     update + version-log row, AND add the new champion to `RATING_PANEL`
     (`versions/index.ts`) so the panel's ceiling stays current (you may retire a
     now-redundant member); it becomes the new default substrate (the next evolution
     branches from the champion regardless of lineage — lineages are provenance, not
     silos; see METHOD.md "Two bests"). If NOT crowned, say so plainly and note any
     subsystem worth keeping as an **archived building block** (recorded, available to
     borrow later, but not the substrate).
   - Compare against the PR's own (stale) claim.

8. **Do NOT commit without explicit confirmation.** Present the verdict and the
   exact diffs you'd make (register in `versions/index.ts`, the regenerated
   `ratings.ts` + `ratings-cache.json`, and — only on a confirmed crown — the
   `EVOLUTION.md` champion-status + version-log edits), then ask the user how to
   proceed. If they confirm, commit on `main`. If legality fails, restore the tree
   (`git restore` / remove the grafted folder) and report what's blocking.

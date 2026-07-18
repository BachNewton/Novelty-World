---
description: Play a Monopoly probe game as a human-style seat vs the bots — find exploits, validate fixes, and propose the next bot evolution
argument-hint: "[version to probe — default: the newest registered fable] [archetype: expert|casual|<custom>] [optional focus]"
allowed-tools: Bash, Read, Write, Grep, Glob, Agent
---

Run a **Fable-played probe game**: a model-driven player takes one seat against
three bot opponents through the stepped-game CLI (`bots/played-cli.ts`), plays a
full game turn-by-turn, and turns what it sees into evidence for the bot
evolution loop. Target/archetype/focus from the user: **$ARGUMENTS**

This methodology is the archive's proven discovery engine: probe games 1–9
(2026-07-18, "the 4q3y6i night" + the extended block in `bots/EVOLUTION.md`)
produced the decisive evidence for fable-v5, v7, v8, v11, and v12 — including a
strict crown — and live-validated every fix the same day it shipped. Its edge
is exactly what self-play cannot do: it exercises the trade/auction surfaces
mirror games never touch, and it **measures boundaries** instead of observing
single data points. Run every command from the repo root.

## Steps

1. **Load the state.** Read `bots/champion.ts` (crown/substrate),
   the newest "As of" status block in `bots/EVOLUTION.md` (which carries the
   CLOSED-exploit list and standing leads), and `bots/CLAUDE.md`'s
   "human-counterparty model" section. Pick the target version: the user's
   choice, else **the newest registered fable version** (`versions/index.ts`) —
   lesson one below explains why newest.

2. **Create the game** (state persists in a JSON file; keep it for later
   analysis — it is also L1 training data):

       npx tsx src/projects/monopoly/bots/played-cli.ts new <scratchpad>/probe-<n>.json probe-<n> <version> --human

   **Always `--human`**: since fable-v11 the bots carry human-gated behavior
   (`botStrategy === null`) — without the flag the human-counterparty model
   never fires and the probe measures the wrong bot. Caveat: a human-marked
   seat's `bot-note` annotations are engine no-ops, so the player's reasoning
   lives in the findings file, not the transcript.

3. **Spawn the player as a background agent** (a full game runs ~100–330 turns,
   ~30–45 minutes, ~150–500k subagent tokens — run it in the background and do
   other work; the completion notification brings the verdict). Build its
   prompt from the template below, filling in the CLOSED list and the focus.

4. **On completion, triage the findings** (this is the point):
   - **Suspected engine bugs: verify before believing.** The player reads
     events, not internals, and has been confidently wrong (the `estateCash`
     "bug" of probe 8 was the engine being exactly right about inherited-
     mortgage interest). Re-derive the claim from the saved game JSON
     (`state.turns` has every event) before it goes anywhere near the record.
   - **New defects** become version hypotheses: frame each in the policy's own
     terms (`bots/CLAUDE.md`), check "Considered and rejected" first, then
     propose the smallest coherent dim with a red/green fixture idea.
   - **Closed-exploit regressions** and **fix validations** update the CLOSED
     list in the EVOLUTION status.
   - **Behavioral data** (offer ladders, acceptance rates) feeds the
     human-model priors (`npm run game:offers` is the corpus authority).

5. **Report and propose.** Outcome first (who won, how), then per-item
   verdicts with turn evidence, then the ranked proposals. **This command is
   play-and-propose** — building a version afterwards is a separate decision
   that goes through `bots/METHOD.md` (hypothesis → snapshot → red/green tests
   → screen → gauntlet/identity-proof), never straight from a probe story.

## The distilled lessons (read these into the player prompt and your triage)

1. **Probe the newest bot.** Every probe of a freshly-shipped version found the
   *next* version's evidence — the loop is probe → fix → gate → probe. Probing
   an old version re-finds fixed defects.
2. **The player must not read policy source** (nothing under
   `bots/versions/`). Discovery must be behavioral, like a human's — the
   author's knowledge of the code biases what gets found (Papa found the rail
   exploit with no code access). `types.ts` and `data.ts` are allowed (any
   human effectively knows the board and the move surface).
3. **Ladders, not single offers.** The unique capability over real human games
   is boundary measurement: offer the same asset at 1.0×/1.5×/2×/2.5×/3× book
   and record every verdict. That is how the rail floor (~book+$130), the
   drain boundary (97%→4% of wallet), and the $75 human margin
   (book+$60 decline / +$110 accept) were pinned. A human never gives you five
   price points on one asset.
4. **Carry the CLOSED list forward.** Every probe re-verifies previously
   closed exploits (regression-testing behavior in live play) *and* free-hunts
   for what is not on the list. The current list lives in the newest EVOLUTION
   status block.
5. **Watch both failure directions.** Exploitability is one defect class;
   **over-caution is the other** — stacked guards can compound into passivity
   (hoarding, undeveloped monopolies, refusing all commerce). Give the player
   an explicit over-correction watch; "no over-caution observed" is a finding.
6. **Findings are hypotheses, not verdicts.** Expect probe-found surfaces to
   screen EVEN in self-play (mirrors never exercise them — that invisibility
   IS the finding, and the defect-removal promotion pattern covers it). And
   expect some obvious-looking fixes to be **REJECTED** at the gate: fable-v9
   (re-pitch spam step) and fable-v10 (price-blind reserve) both died on the
   holdout stream because the "degenerate" churn was load-bearing in
   self-play. The gate arbitrates; the probe only proposes. Human-facing fixes
   belong behind the human gate (the `bots/CLAUDE.md` invariant), where
   validation is identity-proof (pinned + N seeded identical games) plus a
   live `--human` probe — not SPRT, and say so plainly in the record.
7. **Vary the archetype deliberately.** Expert play finds exploits; a CASUAL
   archetype (buy everything, accept "feels fair" trades, no reserve, no
   ask-refusal discipline) brackets the human-model priors — the corpus
   acceptance spectrum (casual ≈38% / real humans 9–15% / expert ≈0) came from
   exactly that contrast. State the archetype in the player prompt and keep it
   in character.
8. **Mechanics that keep the game moving:** work from the repo root; `pass` at
   pre-roll rolls (and at jail-decision rolls for doubles); a REJECTED intent
   does not advance — read the reason and retry; batch through trivial pauses
   fast and spend reasoning on trades/auctions/development; trades are
   arm (`set-queue`) → `update-trade-draft` → `propose-trade`, with `cashDelta`
   netting to zero; if the same pause repeats unfixably, stop and record it.
9. **Findings file discipline:** the player appends findings AS IT PLAYS
   (`<scratchpad>/probe-<n>-findings.md`) — outcome, per-probe-item verdicts
   with turn numbers and exact prices, then ranked new findings each with a
   one-line policy implication. The final agent reply is a compact summary;
   the file is the evidence.

## Player-agent prompt template

> You are playing a full game of Monopoly against three <version> bot opponents
> through a stepped-game CLI, with your seat marked as a REAL human. Mission:
> (1) play the <archetype> archetype to win; (2) re-verify the CLOSED exploit
> list: <list from EVOLUTION status>; (3) probe agenda: <focus, plus offer
> ladders on completers/rails/blockers>; (4) watch for over-caution as its own
> defect class. CONSTRAINT: do not read any bot policy source (nothing under
> src/projects/monopoly/bots/versions/); you may read types.ts and data.ts.
> Commands (from repo root): show / act '<intent JSON>' / pass, on
> <game file>. Record every bot offer with exact terms; run price ladders and
> record every rung. Append findings to <findings file> as you play. Play to
> completion (game-over or ~turn 250). Do not modify any repo source files.

Fill every `<placeholder>` concretely — the CLOSED list and the archetype are
what make the probe cumulative rather than repetitive.

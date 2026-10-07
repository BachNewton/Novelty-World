# AI seats: how they are improved

The rules of the loop that improves Monopoly's AI seats (language models playing a
seat through the route; see the "AI seats" section of `monopoly/CLAUDE.md`). Read
this before changing an AI version, a scenario or the loop itself. What each
version tried and measured is the record in `EVOLUTION.md`, next to this file, and
what the loop does next is the queue in `NEXT.md`.

This is a prototype. Nobody yet knows how far prompt and configuration work can
take the current local models, so the loop is kept light and these rules are
expected to change. Change them in place, and record why in `EVOLUTION.md`.

## The goal

**AI seats that beat humans**, and are good to play against. Not AI seats that beat
bots, and not AI seats that agree with whoever wrote the scenarios.

## What can be changed

Two axes, kept apart so a result can be traced to its cause:

- **The version** (`bots/ai/versions/llm-vN/`): everything in this repo that shapes
  play, the prompt, the view, the questions, schemas and answer mapping, which
  decisions think, the thinking budget, sampling and the turn-start gate. A
  registered version is frozen; any change is a new version.
- **The model**: what the server is running, set by a server config in
  `bots/ai/servers/` and launched with `local-llm <config>`. Every decision records
  the model and server settings the server itself reports, so a run is never
  attributed to the wrong model.

## The instruments, and what each may decide

| Instrument | Finds | May decide |
|---|---|---|
| Scenario suite (`npm run ai:scenarios`) | errors, fast | whether an error is fixed |
| Slices (a few rounds of all-AI play from early, mid or late positions) | errors that only appear in play: stalls, plan drift, chains of decisions | whether a version is safe to play |
| Human games, with in-game flags and reveals | how it does against people, and what people think of its play | whether a version is better |
| Human-proxy probes (Claude agents playing as a human pro) | how exploitable it is by human tactics | whether a version is better, as a stand-in until enough human games exist |

Rules:

- **Scenarios are tools, not truth.** A scenario check is either an **error**
  (objective: a misread of the board, an invented rule, trade cash going the wrong
  way, a bid it can never pay, a ruinous move no strong player makes, a stall) or a
  **judgment** (where strong players can differ). Errors are pass/fail and safe to
  drive down. Judgments are only observed, as a distribution of choices with
  reasons; no version is promoted on them.
- **Fix causes, not answers.** A fix targets why the model erred (a fact missing
  from its view, a consequence left for it to derive, a misleading question),
  never wording aimed at one scenario's answer. Error scenarios have disguised
  variants (other seats, sets, cash) so a fix that only fits the original shows.
- **Every real failure becomes a scenario.** The suite only grows, and is the
  loop's memory of what has gone wrong.
- **Strength is judged against humans or human proxies, never against bots.** AI
  seats never play the rule-based bots, and a version is never judged better for
  beating an older AI version: both teach the model to beat a particular opponent,
  which is how the rule-based bots stalled against humans. All-AI play exists only
  to find errors.
- A game in which a human revealed an AI's private reasoning is weaker evidence of
  strength against that AI; reveals are recorded so such games can be weighed.

## One iteration

1. Run the scenario subset for the failing error categories (or the full suite
   before a version is called a step forward), and a short slice.
2. Review: the scoreboard, then the failing calls' full records (prompt, thinking,
   answer). Group failures by cause.
3. Fix the largest cause; register it as the next version with a one-line
   hypothesis.
4. Rerun the same subset, then the full suite. Keep the version only if errors
   fall without new ones appearing.
5. Record it in `EVOLUTION.md`: hypothesis, what ran, error rates before and after,
   timings, and the lesson, including when it failed.
6. Look at the loop itself: what wasted time, what the suite missed that a slice or
   a human caught. Change this file, the suite or the tooling to match, and record
   why.

## Time

Two different clocks. **In live games, time is spent wherever it buys quality**: a
version may think long when that pays off, and decision time is measured as
information, never minimised for its own sake. **In the loop, the loop's own time is
the budget**, saved by choosing what to run, never by making a version cheaper than
its best.

Model calls are the loop's budget. Plan runs in calls, not minutes, and stop a run once
its answer is clear (an error that shows in two of three reps needs no more reps).
Early versions differ by a lot, so iterate fast on small subsets; as versions get
close, each needs more samples, so iterations lengthen.

## What the loop never does on its own

Push, alter existing database tables, change the owner's dotfiles or delete the
owner's data. Those wait for the owner.

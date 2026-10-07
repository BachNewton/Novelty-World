# AI seats: the queue

What the loop does next, in priority order. Rewritten in place as work lands:
finished items move to `EVOLUTION.md` with their results, new ones are added here
with the reason they matter. The rules are in `METHOD.md`.

## Now

**Read every item below through the ceiling.** llm-v5 on Claude Sonnet 5.5
(`npm run ai:scenarios -- llm-v5 --model claude-cli:sonnet`, see
`EVOLUTION.md`) made 0/63 errors where Qwen makes 5/105, and played the
judgments the way strong players do. Every remaining error is the local
model's. The model comparison is done (`EVOLUTION.md`, "Model axis"): Gemma 4
12B plays the judgments in Sonnet's direction with no trade errors, so the loop
now develops on Gemma (item 1), and the Qwen-specific items below it are
re-read on Gemma before any is built. Run the
ceiling again on any new version or scenario family, to tell a scenario's
wrong expectation from a model's miss. Haiku 4.5 on the same
input also made 0/63 errors, but plays passively (sits on a mortgaged monopoly,
proposes at a third of Sonnet's price) and is no faster than Qwen on trade
votes and turn starts, so it is not a live-model candidate; the error count
alone no longer separates models: read the judgment spread against Sonnet's,
not just errors.

1. **Develop on Gemma 4 12B** (`npm run ai:llm -- gemma4-12b-1x7k`; one slot,
   so a full suite takes ~75 minutes). Its two failure families on llm-v5,
   both version work: **debt plans that need mortgages and sales**
   (`debt-must-sell-houses`, 8/15: sells houses with the spare railroads
   unmortgaged, "Selling 5 houses ... covers the debt"), the family llm-v4
   fixed for Qwen by stating a sum; and **counter terms that contradict the
   message** (4/5 on `vote-arms-rival-monopoly`: "I'd like $600 for New York"
   goes out as New York for Sam's two oranges and $0), which no check grades
   yet: make it one, in an error scenario, before fixing it. Replay the failing
   requests first (`eval/runs/2026-10-07T16-59-18-935Z-llm-v5/calls.jsonl`).
   Switch the server default from Qwen only once a Gemma version clears both,
   with Qwen rerun beside it on the error scenarios.

2. **(Qwen) The empty counter, from the vote's side.** llm-v5's remaining
   trade errors are counters whose follow-up comes back all "keep", $0, after a
   message that is half a decline ("I'll take $900 for the set, or I keep it
   and build"), plus ungraded counters that keep the lot and ask cash for
   nothing. The terms step can't fix a vote that didn't mean counter: look at
   the vote's options (a decline that names a price, so "decline, but I'd sell
   for $X" isn't forced into "counter"), confirmed by replaying llm-v5's empty
   counters (`eval/runs/*-llm-v5/calls.jsonl`, records with `followUp`) before
   building it.
3. **The proposal in the counter's shape**, if proposals start failing: turn
   starts still write trades in llm-v4's give/get form, whose grammar silently
   drops a lot the model names on the wrong side. No proposal error in llm-v5's
   final run, one in its first ("taking Boardwalk and being paid $200"); watch.
4. **Lots by name, not square number**, if it recurs: one llm-v4 debt answer put
   the built orange lots' numbers in `mortgage` while its note named the
   railroad and utility. llm-v5's final run had one debt answer refused for
   mortgaging a lot whose set still had houses, the same family.
5. **Strategy primer, separately.** Judgment scenarios show the seat selling a
   rival the set-completing lot for $400 most of the time, and dropping out of
   most auctions (Boardwalk 4x $0 in llm-v5). Sonnet, on the same input,
   counters that sale at $650-$850 and bids $380-$400 for Boardwalk, so the
   view carries what the judgment needs; whether Qwen can be told it is the
   primer's question. It shapes opinions, so measure it as its own version,
   never bundled with error fixes, and use Sonnet's spread as a reference, not
   a target.

## Next

6. **Slice runner** (`ai:slice`): a few rounds of all-AI play from a seed (early
   game), from rule-bot-simulated positions at turn ~40 and ~80 (mid and late),
   or from a saved real game. For errors only, never for strength. Each failure it
   finds becomes a scenario. Reuse the scenario harness's call record
   (`eval/record.ts`) and the route's claim/ask/settle path.
7. **Package the loop** as a project skill (`/monopoly-ai-loop`) once an iteration
   runs smoothly, with a reviewer agent definition carrying the review rubric.
   Test it with a fresh agent that has only the repo.
8. **Human-proxy probes against AI seats**: point the `/monopoly-probe` fleet
   (Claude agents playing a human-marked seat through `played-cli`) at AI seats.
   This is the strength signal until enough human games with flags exist.
9. **Multi-party trades.** The engine accepts trades among three or more players,
   and a seat voting on one sees every move. But a seat can only propose or
   counter with one other player: its answer shape names a single
   counterparty. Let a proposal or counter name moves between several players,
   as a new version. It is an answer-shape change that widens what the seat can
   do, so measure it on two model families, and watch for new stalls (terms that
   don't net out) and for small models proposing three-way deals they can't
   reason through.
10. **Trade memory.** A seat sees only the last 30 log events (a few turns at a
   four-player table) and its own one-sentence plan, so trades and declined
   offers older than that are forgotten. A human can then re-pitch a declined
   offer, or walk a price down over several turns, and the seat can't tell (the
   rule-based bots needed decline-memory for exactly this). Give the view a
   compact section listing every trade and declined or countered offer this game,
   with terms and the public notes that came with them. It is a missing fact, so a
   general change: measure it on two model families, and watch prompt length on the
   small local models.

## Loose ends

- The `ai:claude` profile is built but unused: no game has played it yet. Its
  server (`npm run ai:claude-server`) answered a scenario subset through the
  profile cleanly; the first real game is the owner's call, and from the
  deployed site it needs a tunnel and a shared key (`MONOPOLY_AI_CLAUDE_KEY`)
  first.

- The `local-llm` launcher's fit check counts every layer's KV cache at full
  width and length, so it holds Gemma 4 12B (40 of 48 layers sliding-window)
  to one slot of 7.5k with a q8_0 cache, while the server then uses ~10 GB of
  the card's 12. Counting sliding-window layers at their window would allow
  more slots and a faster loop; a dotfiles change, for the owner.
- The `local-llm` launcher always passes `-np 1`; a config's own `-np` comes later
  and wins, but llama.cpp warns about the duplicate. Letting a config own `-np` is
  a dotfiles change, for the owner.
- iOS safe-area padding in the flag dialog has no effect until the site sets
  `viewport-fit=cover`, which is site-wide and would let every project's pages
  draw under the notch; a refactor target, not a Monopoly change.

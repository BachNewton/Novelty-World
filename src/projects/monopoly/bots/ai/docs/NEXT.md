# AI seats: the queue

What the loop does next, in priority order. Rewritten in place as work lands:
finished items move to `EVOLUTION.md` with their results, new ones are added here
with the reason they matter. The rules are in `METHOD.md`.

## Now

**Read every item below through the ceiling.** llm-v5 on Claude Sonnet 5.5
(`npm run ai:scenarios -- llm-v5 --model claude-cli:sonnet`, see
`EVOLUTION.md`) made 0/63 errors where Qwen makes 5/105, and played the
judgments the way strong players do. Every remaining error is the local
model's, so items 1-3 work around Qwen's limits rather than fix the input:
keep them cheap, and put the model comparison (item 6) ahead of them. Run the
ceiling again on any new version or scenario family, to tell a scenario's
wrong expectation from a model's miss.

1. **The empty counter, from the vote's side.** llm-v5's remaining trade
   errors are counters whose follow-up comes back all "keep", $0, after a
   message that is half a decline ("I'll take $900 for the set, or I keep it
   and build"), plus ungraded counters that keep the lot and ask cash for
   nothing. The terms step can't fix a vote that didn't mean counter: look at
   the vote's options (a decline that names a price, so "decline, but I'd sell
   for $X" isn't forced into "counter"), confirmed by replaying llm-v5's empty
   counters (`eval/runs/*-llm-v5/calls.jsonl`, records with `followUp`) before
   building it.
2. **The proposal in the counter's shape**, if proposals start failing: turn
   starts still write trades in llm-v4's give/get form, whose grammar silently
   drops a lot the model names on the wrong side. No proposal error in llm-v5's
   final run, one in its first ("taking Boardwalk and being paid $200"); watch.
3. **Lots by name, not square number**, if it recurs: one llm-v4 debt answer put
   the built orange lots' numbers in `mortgage` while its note named the
   railroad and utility. llm-v5's final run had one debt answer refused for
   mortgaging a lot whose set still had houses, the same family.
4. **Strategy primer, separately.** Judgment scenarios show the seat selling a
   rival the set-completing lot for $400 most of the time, and dropping out of
   most auctions (Boardwalk 4x $0 in llm-v5). Sonnet, on the same input,
   counters that sale at $650-$850 and bids $380-$400 for Boardwalk, so the
   view carries what the judgment needs; whether Qwen can be told it is the
   primer's question. It shapes opinions, so measure it as its own version,
   never bundled with error fixes, and use Sonnet's spread as a reference, not
   a target.

## Next

5. **Slice runner** (`ai:slice`): a few rounds of all-AI play from a seed (early
   game), from rule-bot-simulated positions at turn ~40 and ~80 (mid and late),
   or from a saved real game. For errors only, never for strength. Each failure it
   finds becomes a scenario. Reuse the scenario harness's call record
   (`eval/record.ts`) and the route's claim/ask/settle path.
6. **Model comparison**, holding the version fixed (the ceiling says this is
   where the gain is; another agent may already be running it): Gemma 4 12B Q6_K
   (`~/models/gemma-4-12b-it-Q6_K.gguf`, downloaded, untested; needs a server
   config in `bots/ai/servers/` and a check that the adapter's thinking switch,
   `chat_template_kwargs.enable_thinking`, works for its chat template) against
   Qwen3.5-9B. gpt-oss-20b is also on disk, but the launcher's fit check refuses it
   by about 160 MiB at 8k context; it may fit, since the check counts its
   sliding-window layers as full.
7. **Package the loop** as a project skill (`/monopoly-ai-loop`) once an iteration
   runs smoothly, with a reviewer agent definition carrying the review rubric.
   Test it with a fresh agent that has only the repo.
8. **Human-proxy probes against AI seats**: point the `/monopoly-probe` fleet
   (Claude agents playing a human-marked seat through `played-cli`) at AI seats.
   This is the strength signal until enough human games with flags exist.

## Loose ends

- The `local-llm` launcher always passes `-np 1`; a config's own `-np` comes later
  and wins, but llama.cpp warns about the duplicate. Letting a config own `-np` is
  a dotfiles change, for the owner.
- iOS safe-area padding in the flag dialog has no effect until the site sets
  `viewport-fit=cover`, which is site-wide and would let every project's pages
  draw under the notch; a refactor target, not a Monopoly change.

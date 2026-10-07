# AI seats: the queue

What the loop does next, in priority order. Rewritten in place as work lands:
finished items move to `EVOLUTION.md` with their results, new ones are added here
with the reason they matter. The rules are in `METHOD.md`.

## Now

1. **Finish llm-v3 and record it.** v3 targets three causes found in llm-v2's
   suite run: the debt-plan field read as "houses to sell" when it meant a target
   level, a single signed trade-cash field whose direction the model got wrong, and
   thinking that spent its whole budget (partly on the answer format). It compares
   thinking budgets of 1,200 and 3,000 tokens.
2. **llm-v4 candidates:**
   - **Room to reason in quick decisions.** The private note is written before
     the choice, so it is the model's only reasoning space in quick mode, and it is
     asked for "at most three short sentences". Compare that against "as long as
     you need" on the same scenarios. Live games may pay time for quality, so if
     longer is better it wins.
   - Whatever v3's remaining failures point to, by cause.
   - **Strategy primer, separately.** Judgment scenarios show v2 selling a rival
     the set-completing lot for $400 every time, and dropping out of nearly every
     auction (llm-v1 bid its whole wallet). General principles of strong play may
     help, but they shape opinions, so measure them as their own version, never
     bundled with error fixes.

## Next

3. **Slice runner** (`ai:slice`): a few rounds of all-AI play from a seed (early
   game), from rule-bot-simulated positions at turn ~40 and ~80 (mid and late),
   or from a saved real game. For errors only, never for strength. Each failure it
   finds becomes a scenario. Reuse the scenario harness's call record
   (`eval/record.ts`) and the route's claim/ask/settle path.
4. **Model comparison**, holding the version fixed: Gemma 4 12B Q6_K
   (`~/models/gemma-4-12b-it-Q6_K.gguf`, downloaded, untested; needs a server
   config in `bots/ai/servers/` and a check that the adapter's thinking switch,
   `chat_template_kwargs.enable_thinking`, works for its chat template) against
   Qwen3.5-9B. gpt-oss-20b is also on disk, but the launcher's fit check refuses it
   by about 160 MiB at 8k context; it may fit, since the check counts its
   sliding-window layers as full.
5. **Package the loop** as a project skill (`/monopoly-ai-loop`) once an iteration
   runs smoothly, with a reviewer agent definition carrying the review rubric.
   Test it with a fresh agent that has only the repo.
6. **Human-proxy probes against AI seats**: point the `/monopoly-probe` fleet
   (Claude agents playing a human-marked seat through `played-cli`) at AI seats.
   This is the strength signal until enough human games with flags exist.

## Loose ends

- The `local-llm` launcher always passes `-np 1`; a config's own `-np` comes later
  and wins, but llama.cpp warns about the duplicate. Letting a config own `-np` is
  a dotfiles change, for the owner.
- iOS safe-area padding in the flag dialog has no effect until the site sets
  `viewport-fit=cover`, which is site-wide and would let every project's pages
  draw under the notch; a refactor target, not a Monopoly change.

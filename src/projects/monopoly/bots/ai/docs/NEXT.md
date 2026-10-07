# AI seats: the queue

What the loop does next, in priority order. Rewritten in place as work lands:
finished items move to `EVOLUTION.md` with their results, new ones are added here
with the reason they matter. The rules are in `METHOD.md`.

## Now

1. **llm-v5: the counter as its own answer.** Both of llm-v4's trade errors, and
   one of llm-v3's, are in writing a counter, not in judging the offer: an empty
   counter where the note means decline, and a counter that could only be
   written as giving a lot away because the lot the seat wanted isn't the other
   side's. The trade vote requires a full `counter` even on accept or decline,
   and the model fills it whatever its vote. Candidates, by cause: ask for the
   counter's terms only once "counter" is chosen (a second, short call), and say
   in the question which lots the counterparty actually holds. Confirm in the
   call records first, as llm-v4 did with its replay.
2. **Lots by name, not square number**, if it recurs: one llm-v4 debt answer put
   the built orange lots' numbers in `mortgage` while its note named the
   railroad and utility. Once is noise; watch for it in the next runs.
3. **Strategy primer, separately.** Judgment scenarios show the seat selling a
   rival the set-completing lot for $400 every time, and dropping out of most
   auctions (Boardwalk 3x $0 in llm-v4). General principles of strong play may
   help, but they shape opinions, so measure them as their own version, never
   bundled with error fixes.
4. **More reps per verdict.** At 3/54 errors, three reps can no longer tell two
   versions apart on the original 45 scenarios (llm-v3 and llm-v4 tie there).
   Use five reps for the error scenarios in a final verdict, and grow the
   families where errors still show.

## Next

5. **Slice runner** (`ai:slice`): a few rounds of all-AI play from a seed (early
   game), from rule-bot-simulated positions at turn ~40 and ~80 (mid and late),
   or from a saved real game. For errors only, never for strength. Each failure it
   finds becomes a scenario. Reuse the scenario harness's call record
   (`eval/record.ts`) and the route's claim/ask/settle path.
6. **Model comparison**, holding the version fixed: Gemma 4 12B Q6_K
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

# AI seats: the queue

What the loop does next, in priority order. Rewritten in place as work lands:
finished items move to `EVOLUTION.md` with their results, new ones are added here
with the reason they matter. The rules are in `METHOD.md`.

## Now

**Where the loop stands.** Claude Sonnet 5.5 is the likely live model: it
answers in seconds, never gave an unusable answer, and beat both humans in the
first live game (`EVOLUTION.md`), while the local models are weaker and
slower. Gemma 4 12B stays the development model and the second family that
tells a general change from a Sonnet-specific one (METHOD); Qwen is kept only
for comparison, and a ~30B mixture-of-experts model fit the card but played
worse (item 19). The newest general version is llm-v8, and llm-v12 is its
Sonnet-only form for game night (item 24). Sonnet's remaining errors are the
movement claims carried forward in its plan (item 22) and some false pitches,
so the suite still separates Sonnet versions, but barely: its strength from
here is measured against people, so human-proxy probes (item 8) are the next
instrument to build. Run Sonnet on any new version or scenario family, to tell
a scenario's wrong expectation from a model's miss, and read the judgment
spread beside the error count.

1. **Continue on Gemma 4 12B with llm-v8** (`npm run ai:llm --
   gemma4-12b-1x7k`; one slot). llm-v7 added the facts from game 46181f
   (each player's sets, what a player controls, the proposer's message, what
   a completed set costs) and llm-v8 replaced the log window with the history
   of play; both are general and leave Gemma at 0-1 errors in 160
   (`EVOLUTION.md`). llm-v8's history grows with the game and nears the 7.5k
   slot in a long one (item 23). The counter that states the lot's price
   instead of the message's recurred once on llm-v7 ("Would you consider
   $80?" written as $100); still watch only. Next for Gemma is slices (item
   6), to find the errors the suite doesn't have.
2. **(Qwen) The empty counter, from the vote's side.** llm-v5's remaining
   trade errors are counters whose follow-up comes back all "keep", $0, after a
   message that is half a decline ("I'll take $900 for the set, or I keep it
   and build"), plus counters that keep the lot and ask cash for nothing, which
   the new terms-against-message check now grades (llm-v6 on Qwen: 9 of its 12
   trade errors, "I'd rather mortgage it for $150 and keep it"). The terms
   step can't fix a vote that didn't mean counter: look at the vote's options (a decline that names a price, so "decline, but I'd sell
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
13. **llm-v12 in a live game** (model-specific). llm-v12 is llm-v8 with
   llm-v9's every-turn ask and llm-v11's live auction notes, kept on Sonnet
   (`EVOLUTION.md`, "llm-v12"): both effects hold, no new errors, and it is
   the candidate for the live `ai:claude` seats (item 24). Watch in a live
   game: the lower Boardwalk maximum, which repeated ($300 in 5 of 10, below
   $380 in 8 of 10, against llm-v8's $380 in 7 of 10), and whether
   every-turn asks miss a completer to buy out of a rival's reach (0/10
   across llm-v9 and llm-v12 in `turn-start-gated-broker-completer`). Asking
   every turn also gives llm-v8's false pitch (~15-20% of Sonnet's
   proposals) more turns to appear in. A turn start that does nothing still
   shows no line; letting it speak (table talk as play) is a further
   change, measured on its own.
14. **A described board, as an experiment** (its own version, never bundled).
   The view is a catalogue: square numbers and one line per lot. Lead it with a
   factual description of each player's situation, written as a person would
   summarise the table, and keep the listing below for exact numbers. Stick to
   facts derived from the state: "Sam holds the full orange set with three
   houses on each", never "Sam is in trouble". Measure on two model families,
   including whether notes and pitches cite other players' positions correctly.
17. **Make a link between a held call and its decision.** A call answered
   during a review pause is stored once as `held`, with no turn or log index,
   and nothing links it when the answer settles on resume. In 46181f, 5 of 72
   decisions (three of them flagged) have no call row in `game:review` and no
   `call_id` on their flags, and the review lists their calls as "left no log
   entry". Update the row's place and outcome when the held answer settles, or
   store the settle as a row of its own that names the held call; either way
   `game:review` and the flags must find it. A tooling bug, not a version.
19. **The largest model the card can play live** (model axis). A decision
   needs at most ~9k tokens of context (trade votes: ~7.5k prompt plus ~1.5k
   of thinking and answer; buys and debts ~2k), so on the 12 GB card the
   weights set the limit, and speed rules out the rest: a dense ~32B model
   only fits with 4-bit weights half in system RAM, at a few tokens a second,
   which puts a trade vote's thinking past the route's 120 s timeout. A ~30B
   mixture-of-experts model (a few billion parameters active per token) with
   its experts in system RAM is the extreme that stays fast enough.
   **Measured: Qwen3.6-35B-A3B (UD-IQ4_XS, `qwen36-35b-a3b-1x10k`) fits, with
   a 10k slot, and is fast enough** (trade votes median 38.5 s, max 56 s;
   faster than Gemma), **but plays worse on llm-v8**: 17/160 errors against
   Gemma's 1/160, most of them quick debt plans whose numbers come before
   its reasoning, and more passive judgments (`EVOLUTION.md`, "Model axis:
   Qwen3.6-35B-A3B"). Not adopted; Gemma stays the loop's model. What's left
   is the owner's: local-llm's fit check refuses any config that keeps
   experts in system RAM (it counts the whole file against the card), so the
   config only runs through llama-server directly until the launcher counts
   just what stays on the card; and the model holds ~9 GB of system RAM,
   against the launcher's rule. Reopen only if Gemma's 7.5k slot becomes the
   blocker (item 23) and a debt-thinking version for Qwen is worth building.
20. **Fine-tuning a local model, once the prompt settles** (model axis). Open
   weights allow a LoRA fine-tune of a 9-12B model on this card. The realistic
   data is a strong model's answers to the exact prompts of thousands of
   simulated positions (distillation); human games are far too few, and
   learning from wins needs more games than this machine can play. It should
   cut a small model's stalls and repeated errors, and pull its judgment toward
   the teacher's, never past it. It binds the model to one version's prompt,
   so it waits until the general changes have landed (item 14 is
   the last queued; llm-v7 and llm-v8 landed the rest), and
   the fine-tuned model is a new model with its own scoreboards. Before using
   Claude's answers as training data, the owner checks Anthropic's terms on
   training other models with its outputs.

21. **An AI seat against the crowned rule bot, as a curiosity** (never a
   gate). METHOD's rule stands: no version is judged better, or tuned, for
   beating bots. But one seat at a table of three crowned rule bots
   (`bots/champion.ts`; the rule bots' one-versus-three harness) says whether
   the AI is already past the rule bots at all, which is worth knowing once.
   The AI seat is asked through the same claim/ask/settle path as live play,
   so it shares its machinery with the slice runner (item 6). Run on Sonnet
   at concurrency 1-2: a game is ~80-100 AI calls, so ten games is ~1,000
   subscription calls and shows only a large gap (from a 25% base). Read the
   result knowing the rule bots' trade logic may be exploitable in ways a
   person's isn't: report how each game was won (which trades, with whom),
   not just the win rate.

22. **A movement claim fed forward in the plan (Sonnet).** llm-v7's rules say
   where a player lands is the dice and ask for a plan made of choices. That
   cut Sonnet's "avoid the reds" from 8/15 to 1-2/15 where no claim was
   already in its plan, but in `debt-after-built-rival-set`, whose stored plan
   ends "avoid reds.", Sonnet repeats it 4-5/5 on every version (Gemma 0-1/5).
   Two wordings didn't move it (`EVOLUTION.md`, llm-v7). The cause to test is
   the plan being fed back: try showing the last plan only as the seat's own
   words to check, or asking for the plan before the notes, replayed on both
   models. Also read the check's edges: it flags "avoid Sam's railroads risk by
   keeping some cash" and "avoid red squares' damage by staying liquid", reserve
   plans phrased with "avoid"; whether those count is the owner's call.
23. **llm-v8's history on a long game, for Gemma's slot.** On 46181f the
   history adds ~23 tokens a turn (4,433 tokens of view at turn 85 against the
   window's 2,518), so a turn-85 trade vote with Gemma's 1.2k thinking is
   ~7.1k of the 7.5k slot. Before llm-v8 plays a long live game on Gemma, either
   a larger slot (the launcher's sliding-window fit check, a loose end) or a
   more compact history: older buys and jail exits as counts per player, for
   instance, keeping every offer and plan. Measure on a long real game's log,
   never by trimming to a window.
24. **Which version the live `ai:claude` seats play: the owner's call.** They
   play llm-v5. On Sonnet, llm-v7 cut the new families' errors from 17/40
   (llm-v6) to 8/40 (false pitches, movement claims) with none in the older
   error families (0/72); llm-v8 is the same plus the history (10/40, 0/10). Recommendation: llm-v7 for game night, llm-v8 once a
   live game shows the history reads well.
   **For the owner, game night:** if the history (llm-v8) is trusted live,
   play the `ai:claude` seats on llm-v12 (llm-v8 plus both kept Sonnet
   changes); otherwise llm-v7. Nothing live or default was changed. A new seat takes the newest
   general version (llm-v8) unless another is picked; the Sonnet-only
   llm-v9, llm-v11 and llm-v12 (item 13) are listed but never the default.

## Loose ends

- **Trade flags are read by their words, for the owner.** The trade-aware
  categories are live. In 46181f, Bot Killer tagged both of his price
  disagreements "Misread the deal" ("Don't give up a monopoly for cash"), where
  the seat had read the deal correctly and priced it differently: the label
  invites strategy complaints. "Bad for the bot" fits them; whether to reword
  "Misread the deal" (say, "Got the terms wrong") is the owner's call.

- **One automatic retry when the model server is unreachable, for the owner.**
  A live `ai:claude` turn start failed with `TypeError: fetch failed` after
  10.1s, undici's default connect timeout, and the server logged nothing for
  it: Vercel never finished connecting to the Funnel relay, while the same
  decision's `/props` lookup, on its own connection, got through. Failures now
  carry the fetch error's cause (code and message), and the Claude server logs
  each request's arrival as well as its end, so the next drop says which it
  was. Proposal, not built: in `openai-compatible.ts`'s `chat`, when `fetch`
  throws with a cause code that proves the request never left (connect phase
  only: `UND_ERR_CONNECT_TIMEOUT`, `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`),
  send it once more on the same deadline signal. It can't double-answer: no
  byte of the request reached the server. It must not cover a timeout (the
  signal aborted), any HTTP status (the server or the relay got the request,
  including the CLI's own failures sent back as 502), a bad answer, or a
  socket closed after sending (`ECONNRESET`, `UND_ERR_SOCKET`), which may have
  reached the server. This isn't the clock-based retry the repo rules out: it
  fires on the failure event itself, at most once, with no delay and no
  polling, and a second failure fails the seat as today. It relaxes AI seats'
  "no automatic retry" rule, so it is the owner's call; the recorded causes
  first show whether drops are all connect-phase.
  The same could cover an unusable answer (proposal, not built, also the
  owner's call): when settle fails, ask once more with the identical request,
  no refusal reason added. Replays on Gemma (EVOLUTION, "Does asking again
  clear a stall?") cleared 25 of 25 recorded stalls on a plain re-ask, while
  adding the reason fixed none faster and twice produced a legal bad move.
  Both attempts would keep their call rows and the first failure its log
  event, and a second failure stalls the seat as today.

- The `ai:claude` profile plays live games from the deployed site through
  `npm run ai:game-night` (the Claude server behind Tailscale Funnel, keyed by
  `MONOPOLY_AI_CLAUDE_KEY`). It depends on the owner's machine being on, and
  the lobby doesn't yet show whether it is.

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

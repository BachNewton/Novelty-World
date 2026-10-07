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
10. **History by what it tells, not the raw log.** A seat sees the last 30 log
   lines, and most of them are game flow: rolls, rent, cards, passing GO. Those
   matter only as their results, which the board and cash already show, and they
   push out what can't be recovered from the board: the history of play between
   players. Today a declined offer from three turns ago is gone, so a player can
   re-pitch it or walk a price down and the seat can't tell (the rule-based bots
   needed decline-memory for exactly this). Replace the window with a view that
   keeps the whole game's history of play, compact and grouped so patterns can be
   seen, following METHOD's "What a view holds": decisions and public intent
   only (every trade and declined or countered offer with its terms and note,
   bids and drop-outs, buys and passes, builds, mortgages, debt settlements),
   with each question stating its own cause in place of a flow window. Give the
   facts and let the model find the patterns; don't write rules for particular
   patterns. It is a missing fact, so
   a general change: measure it on two model families, and compare prompt length
   with today's window.
11. **llm-v7: give a trade's receiving seat the proposer's public note.** The
   table now sees an AI proposer's note as the offer's pitch (`tradePitch` in
   the engine, shown in the trade panel). A voting seat sees it only as one
   unlabelled line of "negotiation so far", among the turn's other notes.
   State it beside the terms as the proposer's message with this offer, public
   note only, never private reasoning or plan. It is a fact added to the view,
   so a general change by METHOD's rule: measure it on two model families
   before calling it one. Option, not built: let a human's offer carry a
   short message too, so the pitch and this line work the same for every
   proposer (it would need a field on the proposal, so a state shape change).
12. **Each player's position in one line.** A live Sonnet seat pitched "$620 for
   Tennessee... funds your builds elsewhere" to a human holding no full set,
   so nothing to build. Whether a player can build appears only implicitly, as
   their name in each set's holder list. State it outright per player (cash,
   full sets, what they can build on), so a pitch starts from the other side's
   real position. General; add the live call as an error scenario first (game
   5x1c6j, call 62; spec E2 in `inbox/46181f-scenarios.md`, item 16).
13. **Ask at every turn start, for a strong model** (model-specific). The
   turn-start gate skips the model when the seat can't build or lift a mortgage
   and shares no set, or the board hasn't changed since it was last asked. That
   saved llm-v1's ~30 s Qwen calls that mostly answered "roll", but it also
   means the seat never says anything that turn, and can never find the rare
   plays a skilled player looks for: brokering a trade between two others that
   leaves it better off, buying a lot for cash with no set at stake, or table
   talk as play in itself. Live games pay time for quality, so for Sonnet try
   asking every turn and measure what it buys: proposals made, how often they
   are accepted, what it says, and the seconds added per AI turn.
14. **A described board, as an experiment** (its own version, never bundled).
   The view is a catalogue: square numbers and one line per lot. Lead it with a
   factual description of each player's situation, written as a person would
   summarise the table, and keep the listing below for exact numbers. Stick to
   facts derived from the state: "Sam holds the full orange set with three
   houses on each", never "Sam is in trouble". Measure on two model families,
   including whether notes and pitches cite other players' positions correctly.
15. **What a player controls.** A live seat's plan said "avoid red" because of
   its houses, as if it could choose where it lands. Movement is the dice; the
   rules primer never says so, nor what a player does choose (buy or pass, bid,
   trade, build, mortgage, how to pay a debt, how to leave jail, how much cash to
   keep). Add that to the primer and ask for a plan made of those choices
   ("keep $400 in reserve while red has houses" is a plan; "avoid red" is not).
   General: measure on two model families. Grade it as an error scenario: a plan
   or note that claims control over movement. Game 46181f made it the live
   error that matters most: once "avoid Väinö's reds" entered Lisa's plan it was
   fed forward into 12 of her 13 plans, through the debt settle that broke her
   (spec E1 in `inbox/46181f-scenarios.md`, item 16).
16. **Build game 46181f's scenarios** (`inbox/46181f-scenarios.md`): two shared
   error checks, a plan or note claiming control over movement (E1, with
   positions) and a pitch crediting the other side with sets or builds it
   doesn't have (E2, on the `proposeDirection` family), and two judgment
   scenarios from the human flags, selling the set-completing pair to the
   holder of the third (J1) and paying all its cash for a set it can't build
   (J2). Build on llm-v6's `termsContradictMessage` work, run the ceiling on
   them first, and gate items 12 and 15 on E2 and E1.
17. **Make a link between a held call and its decision.** A call answered
   during a review pause is stored once as `held`, with no turn or log index,
   and nothing links it when the answer settles on resume. In 46181f, 5 of 72
   decisions (three of them flagged) have no call row in `game:review` and no
   `call_id` on their flags, and the review lists their calls as "left no log
   entry". Update the row's place and outcome when the held answer settles, or
   store the settle as a row of its own that names the held call; either way
   `game:review` and the flags must find it. A tooling bug, not a version.
18. **What a set costs to build, in the trade vote.** In 46181f Lisa paid
   $1,000 and two lots for the greens, falling to $275 with houses at $200, on
   a board with built reds; her note saw the risk ("Cash drops to $275, which
   is risky") and accepted anyway, and a $700 rent stripped the set. The vote
   states the set gained and the cash left, but not what developing it costs
   (three houses each: $1,800) or the largest rent the seat now faces, and,
   when a trade arms the other side, not that side's cash after (Väinö's $342
   after buying the reds: two houses). Missing consequences, so a general
   change: measure on two model families against the J1 and J2 judgment
   spreads and later human games, never as a gate, and keep it apart from the
   strategy primer (item 5).

## Loose ends

- **Trade flags are read by their words, for the owner.** The trade-aware
  categories are live. In 46181f, Bot Killer tagged both of his price
  disagreements "Misread the deal" ("Don't give up a monopoly for cash"), where
  the seat had read the deal correctly and priced it differently: the label
  invites strategy complaints. "Bad for the bot" fits them; whether to reword
  "Misread the deal" (say, "Got the terms wrong") is the owner's call.

- **A human's offer went out with its cash backwards** (46181f, turn 59: Kyle
  asked Väinö to hand over New York and pay $150, then re-sent it as $150 to
  Väinö). The AI declined it correctly. If it recurs, the trade builder's cash
  entry is the place to look, not the AI.

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

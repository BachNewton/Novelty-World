# AI seats: the record

Append-only. Every AI version, what it tried and what it measured, and every
change to the loop with its reason. Search this before trying an idea again. The
rules of the loop are in `METHOD.md`.

Dates appear here because this is a log: when something was measured is part of
the data.

## llm-v1: the baseline (2026-10-07)

The first AI seat, as built: one call per decision, a whole-plan answer under a
JSON schema, public and private notes and a plan carried to the next prompt.
Sampling left to llama.cpp's defaults (temperature 0.8, random seed); thinking on
turn starts and trade votes with a 1,200-token budget.

Played one live game (`0a0e5y`: three llm-v1 seats and the owner, Qwen3.5-9B Q6_K
on the RTX 4070), reviewed decision by decision. Findings:

- **A trade's cash went the wrong way.** Michelle meant to sell St. James for $180
  and proposed giving it away while paying $18. Per-player cash deltas let a sign
  slip through, and nothing checked the terms against what the seat said it meant.
- **Auctions anchored on the cap.** The question named the most the seat could
  pay; Boardwalk sold for $1,410 and left the winner with $30. Public notes gave
  bidders' maximums away.
- **Board misreads despite the facts being in the prompt.** "Buying New York
  Avenue completes my Yellow set" with the prompt saying "Yellow: you own 1 of 3";
  colors of lots confused. Facts placed mid-prompt and consequences left for the
  model to derive were ignored in quick mode. A wrong conclusion then became the
  stored plan and steered later prompts.
- **Hard length limits cut notes and plans mid-word**, and the cut plan was fed
  forward.
- **The turn-start question fired nearly every turn**, mostly answered "roll".

## llm-v2: the review's fixes (2026-10-07)

Hypothesis: most of llm-v1's errors come from the input, not the model, as the
Betrayal proof of concept found. Changes: trade terms written from the seat's own
side with its stated cash checked; auctions without the cap as an anchor, with
stakes, a rule of thumb and the cash a win leaves, and notes held until the
auction closes; consequences in the buy question; the plan framed as a note that
may be wrong; brevity asked in words with looser hard limits; turn start asked
only when it matters; the view grouped by set with real square and card names;
temperature 0.3.

Smoke run (one call per decision kind): all valid. Quick decisions about 3 s.
Every thinking decision spent its whole 1,200-token budget, about 27 s each.

## The loop

- **2026-10-07: the loop's ground rules** (now in `METHOD.md`). Scenarios split
  errors from judgments, because a suite written and graded by one model teaches
  that model's opinions. Strength is judged against humans and human proxies,
  never bots, because the rule-based bots stalled against humans after being
  tuned to beat each other. In-game flags and reveals from human games are the
  main evidence of strength.

## llm-v3: answers in the model's own terms; brief thinking (2026-10-07)

Hypothesis: three of llm-v2's error families come from asking for answers in
the engine's terms, not the model's, and thinking is spent on restating the
board and the answer format. Every cause was confirmed in llm-v2's call records
first.

- **Debt plans, and building at turn start.** llm-v2 asked for each lot's end
  level; the model read a level as "houses to sell", one per lot ("selling my
  three light blue houses yields $75" for six houses; a 3-house orange set called
  "hotels"). The same misreading at turn start planned "3 houses on each red lot
  ($450 total)" for nine $150 houses, and the commit was refused. llm-v3 asks how
  many houses to sell (or build) per set and which lots to mortgage, lists every
  option with the cash it raises or costs, and the code spreads houses evenly.
- **Trade cash direction.** One signed `cashYouReceive` let a buyer ask to be
  paid ("takes States Avenue, cashYouReceive 100"). llm-v3 has `cashYouPay` and
  `cashYouReceive`, never negative, at most one above zero, after the deal in
  words ("I give …; I get …; I pay $A"), with the stated cash still checked.
- **Thinking.** The rules now say to think only about the decision, briefly, and
  leave the format to the answer step.

Full suite, 37 scenarios x 3, Qwen3.5-9B Q6_K, 4 slots:

| | llm-v2 | llm-v3 |
|---|---|---|
| Errors in error scenarios | 10/45 | 3/45 |
| Errors across every answer | 10/111 | 3/111 |
| settle-debt | 9/12 | 2/12 |
| trade-vote | 0/33 | 1/33 |
| turn-start | 1/21 | 0/21 |
| Median / p90 call | 7.5 s / 41.3 s | 7.8 s / 42.7 s |
| Thinking hit its budget | 54/54 | 54/54 |

No trade proposal or counter put cash the wrong way in any v3 run (three runs,
27 proposal and counter-direction answers each).

**The thinking instruction did nothing measurable.** Thoughts stayed about 3,800
characters, opened with "The user wants me to play Monopoly as Alex", restated
the board and still debated the answer. A budget comparison on the 18 thinking
scenarios x 3: at 1,200 tokens, 0 errors in 54 answers, ~42 s a call; at 3,000
tokens, 1 unusable answer (a trade whose stated cash didn't add up), ~87 s a
call; judgment choices moved both ways with no pattern. Both hit the budget on
every call. With 8,000 tokens two trade votes were still thinking when the
120 s call deadline hit, so this model's thinking runs past ~5,000 tokens on its
own: any budget is a cut-off, not room to finish. llm-v3 keeps 1,200 because no
larger budget measured better, not to save time; that is a finding about this
model's thinking, worth testing again on another model.

Judgments that moved (not graded): auctions are steadier than llm-v2's swing to
$0 (blocking a rival's orange: 2x $200, 1x $100, against v2's mostly $0);
accepting the sale of a rival's monopoly-completing lot for $400 stayed 3x
accept; the fair mutual-completion swap went 3x decline.

Residual errors, and their likely causes:

- **Debt: selling houses before mortgaging**, now with correct arithmetic and a
  stated reason: "avoids the 10% interest penalty on lifting mortgages later".
  The model weighs 10% interest against the house sale's loss of half the house
  cost without seeing the loss. A consequence line can state it.
- **Debt: the note and the fields disagree.** Twice the note said "sell three
  houses" and `sellHouses` came back empty. The quick (non-thinking) answer
  writes the note first, then fields that don't follow it.
- **Trades: selling a lot below its mortgage value** ("Selling Kentucky for $80
  boosts my cash"), when mortgaging it raises $110 and keeps it. The question
  doesn't say what the seat could raise by mortgaging instead.

Lesson: the input lesson holds again. Asking in the model's own terms removed
whole error families, and arithmetic stopped going wrong once every option's
cash was listed. Instructions about *how to think* did not change how this model
thinks.

## llm-v4: each option's loss beside its cash; one house count per set (2026-10-07)

Hypothesis: llm-v3's remaining errors come from the view and the answer's
shape, not from the model's judgment. Each cause was confirmed in v3's call
records before the fix.

- **The loss of each way to raise cash, stated as a fact.** A mortgage line now
  says lifting it later costs the mortgage plus 10% ("so mortgaging loses you
  $10 in all, plus its rent while it stays mortgaged"); a house-sale line says
  each house sold loses half its cost for good. In a trade, every unmortgaged
  lot the seat would give away carries "you could mortgage it instead for $X and
  keep it", and the trade format lists what mortgaging each tradeable lot would
  raise.
- **Debt: all the mortgages added up.** The first v4 subset (loss lines only)
  was no better than v3 on debt (8/18 errors in the debt families). The notes
  showed why: the model judged each option alone ("Mortgaging my Reading
  Railroad yields only $100, which is insufficient") and then sold houses
  instead, never adding the mortgages together or to a few sales. v4 states the
  total of every mortgage and whether it covers the debt or how far it falls
  short. With it the same subset dropped to 1/18.
- **One house count per set.** v3's note/field disagreement ("selling three
  houses", `sellHouses` empty) was the answer's shape, not the reasoning. Both
  failing raw answers read `"sellHouses": [\n    \n     ]`: a list opened for
  an object and closed empty. Replaying the exact failing request 8 times: with
  v3's list of `{set, houses}` entries, 4 of 4 answers whose note said to sell
  came back with an empty list; with one integer per set (`{"red": n}`, every set
  required), 2 of 2 came back `red: 3`. The same list shape let a v3 turn start
  name the red set three times with a count per lot (4, 4, 3), and the code kept
  only the last. v4 asks for one count per set, every set named, 0 included, for
  debt plans and turn-start building alike, with each set's own limit.

New error family (the suite grows): **`debt-must-sell-houses`** (orange, light
blue, red): debts beyond what the spare lots' mortgages raise, so houses must be
sold too. An empty sale list leaves the debt unpaid; selling a house while a
spare lot stays unmortgaged is graded an error, for the same reason as
`debt-keeps-houses`. llm-v3 scored 6/9 errors on it (5 sold houses with the
spare lots unmortgaged, 1 empty-list unusable).

Full suite, 40 scenarios x 3, Qwen3.5-9B Q6_K, 4 slots (llm-v3's figures for the
three new scenarios come from a 9-call run on the same suite):

| | llm-v3 | llm-v4 |
|---|---|---|
| Errors in error scenarios | 9/54 | 3/54 |
| of which the 45 llm-v3 was built on | 3/45 | 3/45 |
| settle-debt | 8/21 | 1/21 |
| trade-vote | 1/33 | 2/33 |
| turn-start | 0/21 | 0/21 |
| buy, auction, jail | 0 | 0 |
| Median / p90 call | 7.8 s / 42.7 s | 7.0 s / 42.9 s |
| Thinking hit its budget | 54/54 | 54/54 |

Kept: errors fall from 9 to 3 on the same suite. On the 45 scenarios llm-v3 was
built on the totals tie, so the gain is in debts that need both mortgages and
sales; at three errors in 45 answers, telling versions apart now needs more
reps.

The mortgage fact did its job in trade votes: in all three
`vote-below-mortgage-red` answers the note cites the $110 mortgage ("I'm
passing; $80 is less than the $110 I can get by mortgaging the property
myself"). Both trade errors left are in **writing the counter**, not in the
judgment: an empty counter (vote "counter", no lots, no cash) where the note
means decline, which llm-v3 also produced once; and a counter asking Kyle for
St. James Place, which he doesn't own, so the schema could only write it as
giving Kentucky away for nothing. The counter is a required field even on
accept or decline, and the model fills it whatever its vote.

Remaining debt error: one answer sold three orange houses for a $150 debt the
two spare mortgages ($175) covered. In the iteration run another answer put the
built orange lots' square numbers in `mortgage` while its note named the
railroad and the utility's $175.

Judgments that moved (not graded): Boardwalk at auction 3x $0 (llm-v3 2x $0,
1x $450); the mutual-completion swap went from llm-v3's 3x decline to 2x
accept, 1x counter; selling a rival its set-completing lot for $400 stayed 3x
accept.

### Room to reason in quick decisions (measured, not adopted)

A temporary, unregistered variant of llm-v4 with the private note asked for "as
long as you need: work the decision through before you answer" (backstop limit
raised from 1,500 to 6,000 characters, "be brief" kept only for the public note
and the plan), run on the 22 quick-decision scenarios x 3:

| quick decisions | llm-v4 (three sentences) | longer note |
|---|---|---|
| Errors in error scenarios | 1/27 | 5/27 |
| settle-debt | 1/21 | 5/21 |
| Median note | 277 chars | 469 chars (max 1,900) |
| Median / p90 call | about 6 s / 8 s | 7.1 s / 11.0 s |

Longer notes were worse, and the difference is all in debt plans. The extra
length went into restating the rules and talking itself into selling houses
("selling houses preserves my income-generating assets"), the very conclusion
the loss lines argue against. One long note slid back to counting per lot
("sell 1 house from each of the three Orange properties", answered `orange: 1`,
leaving $100 owed). Auctions drifted toward $0. The three-sentence note stays:
live games may pay time for quality, but here more time bought worse answers.

### Does truncated thinking help? (measured, not adopted)

llm-v3's 18 thinking scenarios (trade votes, turn starts) x 3, with thinking
off (a temporary, unregistered variant):

| | thinking (1,200 tokens) | thinking off |
|---|---|---|
| Errors, all 54 answers | 1/54 (final run), 0/54 (budget run) | 2/54 |
| Median call | about 42 s | 10.9 s |
| Trades proposed in the 9 propose-direction answers | 9 | 0 |
| Fresh orange monopoly: builds | 3/3 | 1/3 |

The error counts are within noise of each other, but without thinking the seat
goes passive: it never proposed a trade, mostly left a fresh monopoly unbuilt,
and declined more offers. Its two errors were an empty counter and a counter it
couldn't afford. Truncated thinking doesn't so much prevent errors as make the
seat act. Passivity scores well on error scenarios, because a seat that
proposes nothing can't propose wrongly, so error counts alone can't judge
thinking. Thinking stays on for trade votes and turn starts; whether it is
worth about 30 s a decision is a question for human games, not the suite.

Lesson: the input lesson holds a third time. Stating a loss beside the cash
didn't help on its own; the model also needed the sum it wasn't doing. Asking
for answers in the model's own terms extends to the answer's **shape**: a
nested list of objects was a trap the grammar let the model fall into, and
replaying the exact failing request against two schemas found it in 16 calls.
More room to reason in quick mode made this model worse, and thinking made it
act more but err no less.

## The loop, after llm-v4

- **2026-10-07: replay before building.** The note/field disagreement in debt
  plans was diagnosed by replaying the exact failing request with one thing
  changed (the schema shape), 16 calls, before any version was built around a
  guess. `METHOD.md`'s review step now says so, and asks for the raw answer text,
  which is where a schema-shape failure shows.
- **2026-10-07: count the cost of passivity.** A seat that does less makes fewer
  errors in error scenarios. A change that lowers errors by making the seat
  passive (thinking off: no trades proposed) is not an improvement; read the
  judgment spread alongside the error count.

## llm-v5: the counter as its own answer (2026-10-07)

Hypothesis: llm-v4's trade errors are in writing a counter, not in judging the
offer, and come from the answer's shape: the vote and a full counter in one
answer, the counter required even on accept or decline, in the proposal's
give/get form.

Confirmed by replaying llm-v4's failing requests first (about 60 calls):

- **The vote alone, beside each side's holdings** (8 replays of the Kentucky
  and Reading requests): no counter asked for a lot the other side doesn't hold,
  and the seat countered far more (5/8, against 0/8 for llm-v4's request
  unchanged).
- **The giveaway's terms** (its note asked Kyle for St. James, which nobody
  owned): in the give/get form, 6/6 wrote "I get St. James Place" in words and
  left `youGet` empty, because the grammar only allowed other players' lots, so
  Kentucky went for nothing. The grammar silently dropped what the model meant.
- **Which side a lot is on.** Given the counter notes from the vote-alone
  replays, the give/get form wrote the seat's own lot under "I get" in 4/9
  ("I give nothing; I get the Reading Railroad; Sam pays me $200"), which is
  llm-v3's and llm-v4's empty counter exactly. Owner-named fields (`fromYou`,
  `fromKyle`) were worse: the lot was left out in 9/13. **One choice per lot**
  ("hand over" or "keep" for each of the seat's, "take" or "leave" for each of
  theirs) matched the note in 6/6 sales and wrote "I'd rather mortgage it and
  keep it" as keep (3/3); the St. James note, whose return can't exist, still
  came back as a giveaway once in 4.

llm-v5 asks the vote alone, with what each side could put in a trade (lots,
cards, cash) and what mortgaging instead would raise. Only "counter" is
followed by a second, quick call (no thinking, ~3-5 s) for the terms, as one
choice per lot or card each side holds, then the cash and the cash it ends with.
The shared machinery gained the follow-up (`DecisionSpec.followUp`): both
answers settle as one decision, the record adds up both calls' cost, and the
call record keeps the follow-up. A counter that hands something over and asks
nothing back fails loudly, since a giveaway was never what the model meant.

The first full run (3/105 errors in error scenarios) showed a new slip: the
model marked the lot it meant to sell "keep" and asked for cash alone ("I'm
keeping Pacific; I need at least $250") in 6 counters, 3 of them with no cash
either, so the trade was empty. Replaying those 9 through a line saying a kept
lot stays out of the trade, and that a cash-only ask gives them nothing, handed
the lot over in 17/27. A "decline after all" choice in the follow-up was tried
alongside it and never chosen (0/27), so it was dropped. Putting the cash
before the lots (21 replays of the empty counters) cut empties to 1 but dropped
lots more often, including a real swap, so the order stays.

New error family (the suite grows): **`vote-counter-holdings`** (railroad,
green, light blue): a lowball offer for a lone lot from a player holding little
or nothing the seat could want. A counter handing the lot over with no lot back
must bring in at least its mortgage value.

Final run, 5 reps, Qwen3.5-9B Q6_K, 4 slots; llm-v4 rerun at 5 reps on the
error scenarios and the trade-vote judgments in the same conditions:

| | llm-v4 | llm-v5 |
|---|---|---|
| Errors in error scenarios | 7/105 | 5/105 (first run: 3/105) |
| trade-vote, error scenarios | 4/45 | 2/45 (2/45) |
| of which `vote-counter-holdings` | 4/15 | 0/15 (1/15) |
| trade-vote, judgment scenarios | 1/25 | 3/25 (1/25) |
| settle-debt (unchanged code) | 3/30 | 3/30 (0/30) |
| turn-start, buy | 0/30 | 0/30 (1/30) |
| Counters tried, of 70 trade votes | 19 | 28 (27) |
| Counters unusable or below mortgage | 5 | 4 (3) |
| Median trade vote | ~42 s | 39 s, the follow-up included |
| Median / p90, every call | | 8.7 s / 43.4 s |

Kept: errors in the error scenarios fall from 7 to 5 (trade votes 4 to 2), the
family built from llm-v4's giveaway goes from 4/15 to 0/15, and across all 70
trade votes the final run ties llm-v4 at 5 while the seat counters half again
as often. The counters it writes now match its message: "I'll take $110 for
Kentucky" goes out as Kentucky for $110, where llm-v4 mostly accepted or
declined. Debt, buy and turn-start code is unchanged, and their errors moved
within noise (the one proposal error, "taking Boardwalk and being paid $200",
was in the first run, on code identical to llm-v4's).

Remaining errors, by cause:

- **The empty counter, still** (4 in the final run): the vote is "counter" but
  the follow-up comes back all "keep", $0 ("I'll take $900 cash for the set, or
  I keep it and build" → nothing moves). The message itself is half a decline;
  the model writes the default for every field. It fails loudly, so it stalls a
  live game.
- **Counters asking cash for nothing** (not graded): "keep" the lot and ask
  $100-$250 for it, a counter the other side can only decline.
- **Accepting below mortgage once** ("I'll take the cash to keep buying") in
  `vote-below-mortgage-red`: judgment, not shape.
- **Debt as llm-v4**: houses sold when mortgages covered the debt, and once an
  orange mortgage listed while its set still had houses.

Lesson: the input lesson holds a fourth time, now for the grammar itself. An
enum that only allows valid answers doesn't make answers valid; it silently
rewrites what the model meant into something legal and wrong (the giveaway). An
answer the model writes in its own terms (one choice per thing it holds) beat
both a directional list and named fields, and asking a second question only
when it is needed made the seat counter more and mean it.

## The loop, after llm-v5

- **2026-10-07: five reps per verdict, with the predecessor rerun.** At three
  reps llm-v4's debt errors read 1/21; its five-rep rerun, on unchanged code,
  read 3/30. `METHOD.md` now asks for five reps, and for the previous
  version on the error scenarios in the same run conditions.
- **2026-10-07: replay the follow-up, not just the request.** A follow-up's
  question can be rebuilt from the scenario and the recorded first answer, so a
  terms-step change was tested on exactly the failing votes (about 50 quick
  calls) without paying for their 40 s thinking again.

## Ceiling: llm-v5 on Claude Sonnet 5.5 (2026-10-07)

Question: are llm-v5's remaining failures the local model's, or the prompt's and
the scenarios'? A ceiling run answers it: a strong model gets exactly the
request Qwen gets and is scored by the same checks.

How: an eval-only adapter (`eval/claude-cli.ts`, imported only by the scenario
CLI, never by the route) runs the `claude` CLI headless on the owner's
subscription, clean (no tools, settings, CLAUDE.md, MCP or saved session, from
an empty folder), with the version's system prompt as the system prompt, the
view on stdin, and the decision's schema as `--json-schema`. Selected with
`npm run ai:scenarios -- llm-v5 --model claude-cli:sonnet`; the record names
the model (`claude-cli/claude-sonnet-5-5`) and the run stops if any other model
answers. Mapping: a decision that thinks runs at effort `high`, a quick one
(buy, auction, debt, jail, a counter's terms) at `low`, which still thought a
little in 13 of 66 quick decisions and none of 26 counter follow-ups. Differences from Qwen's conditions: the CLI can't set
temperature (llm-v5 pins 0.3), it keeps Claude's thinking to itself (the
record keeps its token count), and Claude reasons and answers in one call,
where the prompt's "you'll be asked for the answer separately" describes
Qwen's two passes.

Full suite, 3 reps (129 decisions, 26 counter follow-ups), 4 at a time; Qwen's
llm-v5 final run (5 reps) beside it:

| | Qwen3.5-9B Q6_K | Sonnet 5.5 |
|---|---|---|
| Errors in error scenarios | 5/105 | 0/63 |
| trade-vote (error + judgment) | 5/70 | 0/42 |
| settle-debt | 3/35 | 0/21 |
| Counters tried, of trade votes | 28/70 | 26/42 |
| Empty or below-mortgage counters | 4 | 0 |
| Thinking per thinking call | 1200-token budget, hit 104/105 | 54-487 tokens, never capped |
| Median / p90, every call | 8.7 s / 43.4 s | 5.6 s / 10.8 s |
| Median trade vote | ~39 s | 9.4 s |

Judgments, the same inputs:

- **Selling a rival the set-completing lot** (`vote-arms-rival-monopoly`, $400
  for New York): Qwen accepted 3/5; Sonnet countered 3/3 at $650-$850 ("New
  York completes your orange set, so it's worth far more than $400 to you").
  The distress fire-sale (green to the leader with red hotels): Qwen accepted
  5/5; Sonnet declined 2, countered at $300 once ("Not selling Pennsylvania. It
  would complete your green set, and $250 doesn't come close").
- **Auction maximums:** Boardwalk Qwen 4x $0, 1x $400; Sonnet $380-$400.
  Blocking a rival's orange: Qwen $0-$200, Sonnet $230-$300. Completing its
  own set: both spread widely ($240-$800 against $450-$620). Into illiquidity:
  both cautious ($200-$290 against $190-$220).
- **Counters:** every Sonnet counter hands the lot over for at least its
  mortgage value, mostly near its price (Kentucky, $80 offered: $220-$240; Qwen
  $110-$150, a decline or an accept), and
  it asked a sweetener on the mutual swap (2/3, "yellow out-earns red, add
  $100"). Proposals pay more to complete a set (Boardwalk $550-$650 against
  Qwen's $400 or nothing; States $260-$320 against $140-$200).
- Other spread: Sonnet pays out of jail early (3/3; Qwen rolls 5/5), mortgages
  one railroad for a small shortfall where Qwen mortgages two, and holding a
  rival's completer at low cash just rolls (Qwen lifts a mortgage).

No Opus run: Sonnet failed nothing, so there was nothing to explain.

Lesson: **the remaining errors are the local model's, not the prompt's or the
scenarios'.** The same prompt, view and schemas give a strong model zero errors
in every family that still fails on Qwen (empty counters, below-mortgage
sales, debt plans), so no scenario expectation is shown wrong and none of
llm-v5's input is missing a fact a strong model needs. The judgment gap is
larger than the error gap, and in the direction strong players go (never arm a
rival cheaply, contest Boardwalk, price counters at value), so the input
carries enough to play well; Qwen doesn't draw it out, even with six times
Sonnet's thinking. Prompt work on Qwen is now working around a model's limits;
a model comparison, or a strategy primer measured as its own version, is where
the larger gain is.

## Ceiling, cheaper: llm-v5 on Claude Haiku 4.5 (2026-10-07)

Question: does a small hosted model already play llm-v5 as cleanly as Sonnet,
and so could it be the live model? Same adapter, same request, same checks:
`npm run ai:scenarios -- llm-v5 --model claude-cli:haiku`
(`claude-haiku-4-5-20251001`; every call's `modelUsage` named it).

Mapping: Haiku 4.5 accepts `--effort` and ignores it. By hand, `low`, `max`
and no flag all thought 350-570 tokens on the same request; the CLI's thinking
budget, `MAX_THINKING_TOKENS`, does switch it (0 thought 0). So the adapter's
thinking switch now has two forms: effort for Sonnet and Opus, a budget for
Haiku (think: the CLI's default; quick: 0). In the run, 0 of 66 quick
decisions and 0 of 27 counter follow-ups thought; thinking decisions thought
556-10,532 tokens (median 2,873, Sonnet 54-487).

Full suite, 3 reps, 4 at a time:

| | Qwen3.5-9B (5 reps) | Haiku 4.5 | Sonnet 5.5 |
|---|---|---|---|
| Errors in error scenarios | 5/105 | 0/63 | 0/63 |
| trade-vote / settle-debt | 5/70, 3/35 | 0/42, 0/21 | 0/42, 0/21 |
| Counters tried, of trade votes | 28/70 | 27/42 | 26/42 |
| Counters empty, or contradicting their message | 4 empty, more cash-only | 4/27 (ungraded) | 0/26 |
| Median / p90, every call | 8.7 s / 43.4 s | 10.3 s / 73.5 s | 5.6 s / 10.8 s |
| Median trade vote / turn start | ~39 s / ~43 s | 44 s / 43 s | 9.4 s / ~7 s |
| Median quick call (no thinking) | ~6 s | 8.4 s | ~4 s |

Judgments, the same probes as Sonnet's entry:

- **A rival's $400 for its set-completing New York:** countered 3/3 at
  $500-$550 ("Orange monopoly is worth more to you than that. I'd do $550"),
  between Qwen (accepted 3/5) and Sonnet ($650-$850).
- **The distress sale to the leader:** accepted once ("The cash cushion is
  more valuable to me than a single property I can't build on"), countered
  $300 twice. Qwen accepted 5/5; Sonnet declined 2, countered $300 once.
- **Boardwalk:** 2x $0, 1x $350 (Qwen 4x $0; Sonnet $380-$400). **Blocking a
  rival's orange:** $150-$220 (Qwen $0-$200; Sonnet $230-$300). Into
  illiquidity, 3x $120: the most cautious of the three.
- **Counters** keep to the mortgage floor on unmortgaged lots (Kentucky
  $110-$150, railroad $100-$150) but sit below Sonnet's (Kentucky $220-$240);
  the mutual swap asked $20 once and accepted twice.
- **Proposals** lowball: States $80-$150 (Qwen $140-$200, Sonnet $260-$320),
  Boardwalk $150 once, with "nothing" or a pointless mortgage in the other two
  (Sonnet $550-$650).
- **Turn starts go passive:** "nothing" 3/3 with a mortgaged monopoly and
  $1,500 ("Red earns nothing until landed on or built, so I'll wait"), where
  Qwen and Sonnet all lift it; nothing 3/3 on the thin-cash board (both others
  build 2). The fresh orange monopoly spread from 3 houses to all 10 houses
  and $0 left.
- Jail: rolls 9/9 (Sonnet pays or uses the card early).

Haiku's misses, classified (none is a graded error):

- **Counter terms that contradict the vote's message**, 4 of 27: "I'll take
  $550 for #19" written as New York for St. James + Tennessee + $350; "I'd do
  $550" with New York kept; "$650 for the complete set" with every lot kept;
  "Pennsylvania for $300" written as Pennsylvania for Pacific + North Carolina
  + $50. **The model, intermittently**: replaying those four follow-ups (plus a
  $150 message written as $120) gave the message's terms 15/15 with thinking off
  and 15/15 with it on, so neither the prompt nor the thinking mapping causes
  them; the CLI can't pin temperature, so a rare bad sample gets through. The
  suite passes them because only an empty trade fails; a counter that keeps
  every lot and asks cash is the same ungraded family as Qwen's.
- **Passive turn starts and lowball proposals**: judgment, the model's. The
  input carries the facts (Sonnet reads the same view and lifts, builds and
  pays near value), and Haiku's notes cite them correctly; it weighs liquidity
  far above development. Not an error by the rules; a reason not to promote it.
- **Small slips in its reasons**: "a single railroad pays $25 rent per pass",
  three public messages ending in a stray `"`. The model's.

Lesson: **errors don't separate Haiku from Sonnet; judgment and time do.**
Zero graded errors confirms the ceiling's reading that llm-v5's input is
complete, now on a much smaller model. But Haiku plays like a cautious
amateur: right to refuse cheap set-completing sales, wrong to sit on a
mortgaged monopoly and to lowball every proposal. It also thinks six times as
long as Sonnet, so it is slower than Sonnet everywhere and no faster than Qwen
on the decisions that matter. As a live model it would trade Qwen's errors
for passivity, a hosted dependency and per-call cost; Sonnet is the model to
compare a live candidate against, and "fewer errors from doing less" is the
risk to watch.

## Model axis: Gemma 4 12B and gpt-oss-20b against Qwen3.5-9B, on llm-v5 (2026-10-07)

Question: prompt work on Qwen3.5-9B is near its ceiling (Sonnet makes no
errors on the same input), so is a different local model better, with the
version held fixed at llm-v5?

What ran, one model at a time on the RTX 4070 (12 GB), full suite, 5 reps (215
answers each), every record naming the model from `/props`:

- **Qwen3.5-9B Q6_K** (`qwen9b-4x16k`): llm-v5's final run, 4 slots at once.
- **Gemma 4 12B Q6_K** (`gemma4-12b-1x7k`): 1 slot, 7.5k context, q8_0 KV
  cache. The launcher's fit check counts every layer's KV at full width and
  length (Gemma 4 has 40 sliding-window layers of 48), so this is the most it
  passes; the server then used ~10 GB of the 12. Its chat template honours
  `enable_thinking`, and llama.cpp returns the thought in `reasoning_content`
  (checked with curl first), so the adapter needed nothing.
- **gpt-oss-20b MXFP4** (`gpt-oss-20b-1x9k`): fits after all. With a q8_0 KV
  cache the check passes at 9k context, one slot; the server used ~11.4 GB. Its
  harmony template ignores `enable_thinking` and always reasons (curl: "off"
  still reasoned at its default, medium effort); `reasoning_effort: "low"` is
  the least it does, and llama.cpp returns that reasoning in
  `reasoning_content` and constrains only the final channel to the schema. The
  adapter now sends both switches (`enable_thinking`, and `reasoning_effort:
  "low"` when thinking is off; the other templates ignore the switch they don't
  read) and keeps any reasoning a no-thinking answer came with in the record's
  thoughts, marked "(answering)".

| | Qwen3.5-9B | Gemma 4 12B | gpt-oss-20b |
|---|---|---|---|
| Errors in error scenarios | 5/105 | 8/105 | 17/105 |
| trade-vote (error + judgment) | 5/70 | 0/70 | 18/70 (7 server 500s) |
| settle-debt | 3/35 | 8/35 | 3/35 |
| turn-start | 0/35 | 1/35 | 1/35 |
| Trade votes: accept / decline / counter / unusable | 17 / 25 / 24 / 4 | 21 / 5 / 44 / 0 | 22 / 29 / 7 / 12 |
| Turn starts proposing a trade | 12/35 | 12/35 | 9/35 |
| Thinking finished inside 1,200 tokens | 1/105 | 25/105 | 37/98 |
| Median / p90, every call | 8.7 s / 43.4 s (4 slots) | 5.0 s / 43.1 s (1 slot) | 4.4 s / 14.2 s (1 slot) |
| Median quick call / trade vote / turn start | ~6 s / 39 s / 44 s | ~3.5 s / 42 s / 43 s | ~1.5 s / 13 s / 14 s |

Qwen's times are with four calls sharing the card; Gemma's and gpt-oss's are
one at a time. Gemma writes about 30 tokens a second, Qwen about 55 alone,
gpt-oss about 130.

Judgments, side by side (Sonnet 5.5's ceiling run for reference):

| | Qwen | Gemma | gpt-oss | Sonnet |
|---|---|---|---|---|
| Boardwalk at auction, max | 4x $0, $400 | $350-$400 | 5x $0 | $380-$400 |
| Blocking a rival's orange | $0-$200 | $200-$250 | 2x $0, $200 | $230-$300 |
| Completing its own set | $240-$800 | $350-$400 | $240-$250 | $450-$620 |
| Selling a rival New York for $400 | 3/5 accept | 4/5 counter ("$600"), 1 accept | 2 decline, 1 accept, 1 counter at $200, 1 unusable | 3/3 counter $650-$850 |
| Distress fire-sale of a completer | 5/5 accept | 5/5 accept | 4/5 accept | decline or $300 |
| Kentucky offered $80 (mortgage $110) | 2 decline, 2 counter $110-$150, 1 accept | 5/5 counter $120-$200 | 4 decline, 1 accept | counter $220-$240 |
| Fresh orange monopoly, houses built | 3 (3x), 9 (2x) | 3 (5x) | 3 (4x), 2 | 9 (2x), 6 |

- **Gemma 4 12B** made no trade error in 70 votes and countered most offers
  (44/70), mostly at or above the lot's value ("The trade offer of $80 is less
  than the $110 I would get by mortgaging the property myself. I will counter
  for a higher amount"). It contests auctions the way Sonnet does, which Qwen
  never did: Boardwalk $350-$400 ("I should bid enough to win but keep a
  healthy cash reserve"), the rival's orange blocker $200-$250 ("Buying this
  prevents Sam from completing the set"). It wouldn't sell the set-completing
  lot for $400 (4/5 "I'd like $600 for New York Avenue"), but in all four the
  counter's terms step wrote the opposite of the message: hand New York over,
  take Sam's St. James and Tennessee, $0, so the $600 never reached the offer.
  That family is graded only in the error scenarios, so the run counts it as a
  judgment. Its errors are one family, `debt-must-sell-houses`, 8/15: it sells
  the houses and leaves the spare railroads unmortgaged ("Selling 5 houses from
  the Red set provides $375, which covers the debt"), the loss lines
  notwithstanding; Qwen makes 1/15 there.
- **gpt-oss-20b** is fast, and weak at judgment. It accepted six lowball
  offers below the lot's mortgage value, reasoning around the fact it was
  given ("Accepting gives $70 cash and keeps the railroad, better than
  mortgaging for $100 and losing it"), wrote counters whose cash goes both
  ways, bid $0 for Boardwalk 5/5, and seven of its trade votes came back as a
  llama.cpp 500 ("The model produced output that does not match the expected
  peg-native format"), its harmony output breaking the parser. Its quick
  reasoning ("(answering) Need to raise 320. Mortgage two railroads gives
  200...") gets debt arithmetic right, and it finishes its thinking more often
  than the others, but not in trade votes.
- **Thinking.** Neither alternative thinks briefly. Gemma finished inside the
  budget in 25/105, and run to 6,000 tokens it never finished: it looped
  ("*Wait*, I'll counter for $600. *Wait*, I'll just accept.") past 5,700
  tokens. gpt-oss, unbounded, finished a turn start at 1,860 tokens and was
  still restating the board at 7,400 on the New York vote.

Lesson: **Gemma 4 12B is the better player, not the safer one.** On the same
input it plays the judgments in Sonnet's direction (it contests auctions,
prices counters at value, won't arm a rival for $400) and makes no trade
error, where Qwen sells cheap and drops out. Its errors sit in one family,
debt plans that need both mortgages and sales, which is a quick decision
llm-v4 fixed for Qwen by stating a sum; and its counter terms can contradict
its message. Both are version work, and the error count alone (8 against 5)
hides that the two models fail in different places. gpt-oss-20b is out: three
times Qwen's errors, broken output, and Qwen's passivity. Gemma costs time:
it writes half as fast as Qwen, and the fit check holds it to one slot, so a
suite run takes about 75 minutes instead of 25; a live game, which asks one
decision at a time, loses little.

Recommendation: **switch to Gemma 4 12B** as the model the loop develops on,
and keep Qwen as the server default until a version built on Gemma clears the
`debt-must-sell-houses` family and the counter-terms mismatch (with Qwen rerun
on the error scenarios beside it, per `METHOD.md`).

## Ceiling across versions: llm-v1 to llm-v5 on Sonnet 5.5 (2026-10-07)

Question: llm-v2 to llm-v5 were built against Qwen3.5-9B's errors. Does Sonnet
need those changes, or do they constrain it? Each frozen version ran the full
suite on Sonnet 5.5 (`--model claude-cli:sonnet`), 3 reps, 2 at a time (llm-v5's
run from its ceiling entry, 4 at a time). The `vote-counter-message` family
(being added alongside llm-v6) ran in llm-v3's and llm-v4's full runs and as a
9-call subset on llm-v1, llm-v2 and llm-v5. Every version ran every scenario.

| | v1 | v2 | v3 | v4 | v5 |
|---|---|---|---|---|---|
| Stalls (unusable, halts a game), of 129 | 12 | 0 | 0 | 0 | 0 |
| Bad moves (graded), of 129 | 0 | 1 | 0 | 0 | 0 |
| `vote-counter-message`, graded errors of 9 | 0 | 0 | 2 | 1 | 0 |
| "Swap my one lot for their two" counters, of 12 | 0 | 5 | 5 | 2 | 0 |
| Counters, of the 42 common trade votes | 30 | 32 | 30 | 25 | 26 |
| New York for $400 (arms a rival) | ctr $650-$1,000 | ctr $800, swap, decline | decline, ctr $750-$800 | ctr $800-$850 | ctr $650-$850 |
| Distress sale to the leader | 3x decline | accept, 2x ctr $300 | 2x decline, ctr $300 | 3x ctr $300 | 2x decline, ctr $300 |
| Boardwalk / blocking orange, max | $380-$400 / $240-$260 | $380 / $260 | $380-$400 / $250-$260 | $320-$380 / $260-$290 | $380-$400 / $230-$300 |
| Kentucky ($80 offered) / Water Works counters | $260-$300 / $170-$240 | $240-$280 / $160-$200 | $260 / $200 | 2x decline, $260 / $140-$160 | $220-$240 / $140-$150 |
| Proposals (States / Boardwalk) | $300 / $500-$600 | $250-$300 / $500-$550 | $300 / $600 | $300 / $500-$650 | $260-$320 / $550-$650 |
| Median / p90 call | 6.9 s / 10.2 s | 6.2 s / 9.6 s | 6.5 s / 9.4 s | 6.2 s / 9.9 s | 5.6 s / 10.8 s |
| Median trade vote (counters) | 7.6 s (8.7 s) | 7.1 s (7.2 s) | 7.8 s (8.1 s) | 7.1 s (8.0 s) | 9.4 s (10.4 s) |
| Median private note | 134 chars | 91 | 108 | 112 | 109 |

- **llm-v1's stalls are all safeguard refusals** ("Sonnet 5.5's safeguards
  flagged this message"), 12 of 129, mostly quick decisions (6 of 21 buys, 3 of
  9 jail). Its rules say of the private note "Write it first, and think there",
  asking for the reasoning in the answer; llm-v2 dropped the phrase. Replaying
  two refused requests 5 times each: unchanged, 3/10 refused; with only
  ", and think there" removed, 0/10. The same family as the `ai:claude`
  server's two-pass refusals: asking Claude to put its reasoning in the output
  trips the reasoning-extraction safeguard intermittently.
- **The give/get counter misleads Sonnet too.** In llm-v2 to llm-v4, where the
  counter is written in the vote's own answer as "I give …; I get …", Sonnet
  repeatedly countered a sale of its lone set-completer by giving that lot and
  taking the other side's two, "so I get the full set instead", which leaves
  neither side with the set. The check grades it only when the message doesn't
  name the lots (3 of the 12). llm-v1 (lots by owner) and llm-v5 (one choice
  per lot, after the vote) never did; llm-v5's counters on that family are all
  clean sales at $300-$650.
- **Debt and buy fixes are neutral for Sonnet.** llm-v1, which asks for end
  levels per lot, made no debt error in 21; llm-v2's one bad move (selling red
  houses with a railroad unmortgaged) didn't recur in llm-v3 to llm-v5.
- **Judgment barely moves.** Auctions, proposals and turn starts sit in the
  same ranges for every version. llm-v1 asked the most for New York and
  declined the distress sale 3/3. llm-v2 once accepted it ("cash now"), and
  llm-v4 countered at $300 every time, against llm-v5's 2 declines. With 3 reps
  this is within noise.

Verdict. **Needed:** removing "think there" (llm-v2; without it about one call
in eleven stalls) and the counter as its own answer, one choice per lot
(llm-v5). **Neutral:** the grouped view, stakes in buy and auction questions,
house counts per set, loss lines in debt, two cash fields, and brevity as
such: llm-v1's longer notes were no better. **Possibly constraining, weakly:**
llm-v4's "you could mortgage it instead for $X" beside each lot coincides
with lower asks (Water Works $140-$160 in llm-v4 and llm-v5 against
$160-$240 before, Kentucky $220-$260 against $260-$300) and more declines
instead of counters (llm-v4 25/42); the mortgage floor may act as an anchor.
llm-v5's second call costs Sonnet about 2 s a counter, with no sign of worse
terms (0 of 26 contradict the message). Low effort on quick decisions and held
auction notes are the same in every version, so this run can't judge them.

Lesson: **the Qwen-driven changes don't hurt Claude, and two of them it
needs.** One stops a safeguard stall Qwen never had; the other stops a
planning slip Sonnet makes too. llm-v5 stays the version for Claude. To test
the anchor: a version that drops the mortgage-instead line from trade votes
only, run on Sonnet with llm-v5 beside it at 5 reps on the below-mortgage,
counter-holdings and counter-direction families, compared on ask prices and
counter rate, with errors still at zero. Any new version's prompt should not
ask Claude to put its thinking in the answer.

## First human game: 46181f, llm-v5 on Claude Sonnet 5.5 (2026-10-07)

The first real game with humans against AI seats: two `ai:claude@llm-v5`
seats (Väinö, Lisa) and two humans (Kyle, Bot Killer) on the deployed site,
Sonnet 5.5 answering through the owner's laptop and a Tailscale Funnel
(`npm run ai:game-night`). 85 turns in 44 minutes (20:15 to 20:59 UTC), with
19 reviews pausing the table. Reviewed from the row and from
`monopoly_ai_calls`, `monopoly_ai_flags` and `monopoly_ai_reveals`
(`npm run game:review -- 46181f`).

**Result: an AI won; the humans resigned at turn 85.** Väinö: net worth
$2,914, hotels on all three reds, a house on each green, two railroads and
Boardwalk. Kyle: $1,263, no full set. Bot Killer: $175, everything mortgaged.
Lisa, the other AI, went bankrupt to Väinö at turn 74. It was one AI winning,
not the AIs, and the deciding trade was between the two AI seats.

**How Väinö won.**

- **Four railroads by turn 17.** It bought Reading, Pennsylvania and Short Line
  on landing, then offered Bot Killer $300 for B. & O.; Bot Killer countered at
  $500, Väinö countered at $400 ("$500 leaves me at $12"), and Bot Killer
  accepted. B. & O. alone paid it $900 in rent, the railroads $1,300 in all.
- **Blocked, then bought, the reds.** It bought Indiana at turn 29 to block
  Lisa's set ("blocks Lisa's red set and gives trade leverage") and declined
  her $300 + Vermont for it. At turn 33 it offered Lisa $640 for her two reds;
  she countered for $640 and two railroads, it countered with one (Reading),
  and she accepted: "Reds are stuck for me while Väinö holds Indiana." Väinö
  built on railroad income (4 houses at turn 37, then 5, 7, 9), and two hits
  decided the game: Lisa paid $700 on Indiana (turn 62) and Bot Killer $750
  on Illinois (turn 63), which paid for hotels at turn 65.
- **Lisa overpaid for the greens and starved.** After three cash-only offers
  to Kyle for North Carolina and Pennsylvania ($720, $900, $1,000), Kyle
  countered at $1,000 plus Reading and Vermont, and Lisa accepted, falling to
  $275 with green houses at $200 each. One $700 rent stripped her set, a red
  hotel finished her, and the greens went to Väinö in the bankruptcy.
- **Auctions went to the humans.** Kyle won North Carolina and Pennsylvania at
  $320 each, Water Works at $90 and Ventnor at $160; Bot Killer won Virginia
  at $200. The AIs bid near printed price and dropped out once cash ran low.

**Trades.** Five completed: B. & O. (Bot Killer to Väinö, $400), the reds
(Lisa to Väinö, $640 + Reading), the greens (Kyle to Lisa, $1,000 + Reading +
Vermont), Pennsylvania Railroad (Väinö to Bot Killer, $150, mortgaged) and New
York (Väinö to Kyle, $300).

| Offers | Made | Accepted | Countered | Declined |
|---|---|---|---|---|
| AI to human: proposals | 6 | 0 | 2 | 4 |
| AI to human: counters | 3 | 2 | 1 | 0 |
| Human to AI: proposals | 4 | 1 | 1 | 2 |
| Human to AI: counters | 3 | 1 | 2 | 0 |
| AI to AI, proposals and counters | 4 | 1 | 2 | 1 |

So **2 of 9 AI offers to humans were accepted (22%), and none of the 6 AI
proposals as made**: humans took an AI's terms only after countering. **2 of
7 human offers to an AI were accepted (29%).** Kyle declined every offer for
his greens until he named the terms himself. One human offer had its cash
backwards (Kyle asking Väinö to hand over New York and pay $150; Väinö
declined, "that's not a deal"), a trade-entry slip on the human side.

**Human feedback.** 12 flags, all by Bot Killer, on 10 decisions; 19 reveals
(Bot Killer 14, Kyle 5), 12 of them of Lisa's decisions. No flag points to an
error by METHOD's definition:

- **Praise, 8** (`good-move`): Lisa's Vermont buy, North Carolina bid, $420
  offer for North Carolina, decline of Kyle's Connecticut-for-Pacific swap
  ("hands Kyle a full green set for a mediocre light blue piece") and $900
  offer for the greens; Väinö's $320 offer for Tennessee, $640 offer for the
  reds, and green rebuild after Lisa's bankruptcy.
- **Judgment, 4 flags on 3 decisions.** Lisa selling her two reds to the seat
  holding the third ("Don't give up a monopoly for cash", tagged Misread the
  deal); her cash-only offers ("Offer property next time with the cash", which
  Kyle's counter then bore out: he wanted property); and her acceptance of
  Kyle's $1,000 counter ("No cash to build doesn't make the monopoly
  valuable", tagged Misread the deal; "No buffer for reds. Mortgage a house
  is 50%"). Lisa read each deal correctly, and her private notes name the cost
  ("price is steep", "Cash drops to $275, which is risky"). Strong players
  dispute these prices, so they become judgment scenarios, never gated ones.
  Bot Killer tagged price disagreements "Misread the deal" both times, so
  trade flags are read by their words, not their tag.
- **Model limit: none flagged.**

**Errors and stalls.** 73 calls: 66 committed in place, 5 held during a
review and settled on resume, 1 stale (Väinö's turn start overtaken by a
trade) and 1 failed: Väinö's turn start at turn 41 (20:38 UTC), "unreachable
… fetch failed" after 10 s, a brief drop on the path to the Funnel (undici's
connect timeout; the server never saw the request). The table sat stalled about three minutes until a player tapped Try again, and
the retry answered in 10 s. No answer was refused or unusable, no counter's
terms contradicted its message (0 of 5), and no debt plan failed. Notes that
state something false or claim what a player can't do:

- **Plans that claim control over movement.** 12 of Lisa's 13 plans from
  turn 33 on: "avoid landing on Väinö's reds", "Avoid reds, lift green
  mortgages …", "avoid Väinö's railroads and reds". Once in the plan, it was
  fed forward and repeated. The same family as game 5x1c6j's
  "avoid red"; an error, queued with a scenario spec.
- **Garbled wording**: Väinö's "$320 cash for Tennessee, nuser-friendly price"
  ("nuser" is in the raw answer; one in 72 notes, cosmetic), and Lisa's
  "Indiana plus $300 and Vermont is well above its $220 price", which reads
  as if Indiana went to Väinö. Not graded.
- **Small slips a check can't grade**: "two greens that cost $620" (Kyle paid
  $640 at auction; $620 is the printed price), and the private reason "Kyle
  holding Reading blocks Väinö's fourth railroad" (Lisa holding it did too).
- The "$620 for Tennessee … funds your builds elsewhere" pitch to a player
  with no full set is from the earlier game 5x1c6j (turn 40, call 62), not
  this one; it stays queued as an error scenario.

Timing per decision (both seats, every call that answered):

| Decision | Calls | Median | p90 | Max |
|---|---|---|---|---|
| buy | 16 | 4.8 s | 9.9 s | 10.6 s |
| auction | 9 | 7.6 s | 14.6 s | 25.2 s |
| settle-debt | 3 | 5.6 s | 5.8 s | 5.9 s |
| trade-vote (5 counters with a follow-up) | 11 | 15.0 s | 19.6 s | 19.8 s |
| turn-start | 33 | 10.0 s | 22.8 s | 57.9 s |
| all | 72 | 9.6 s | 19.6 s | 57.9 s |

Two turn starts took 56-58 s with ordinary token counts, and nothing in the
record explains them. Nobody flagged "too slow".

**Tooling found broken.**

- **No live call record named its server.** `record.server` is null, and so
  is the `model` column, on all 160 `ai:claude` call rows (46181f, 5x1c6j,
  6u113l). The route's `describeServer` (`model/config.ts`) calls
  `serverInfo` (`eval/record.ts`), which fetches the server's `/props` with a
  bare `fetch` and no Authorization header. The Claude model server
  (`claude/server.ts`) checks the shared key before routing any path,
  `/props` included, so with `MONOPOLY_AI_CLAUDE_KEY` set (game night
  requires it, since the Funnel is public) it answers 401, and `serverInfo`
  takes any non-OK reply as "not a llama.cpp server" and returns null without
  a word. The game row's decision record still names the model, because it
  comes from the adapter's `identify()` (`model/openai-compatible.ts`), which
  asks the same `/props` with the Bearer key. Nothing tested the keyed path:
  the server test describes a server with no key, scenario runs call the CLI
  directly, and the route test mocks `describeServer`. An `ai:local` server
  started with an API key lost its description the same way. Fixed after the
  game (`serverInfo` now sends the profile's key, with a keyed-server test);
  the 160 rows stay empty, and the decision records in the game rows are the
  model's record for those games.
- **Held calls lose their place.** A call answered during a review pause is
  stored once, as `held` with no turn or log index, and nothing links it when
  the answer settles on resume. Five calls here (among them Väinö's Tennessee
  offer and Lisa's $720 and $900 offers) show in `game:review` as "left no log
  entry" though each became one, and the three flags on them have no
  `call_id`.

**What it weighs as evidence.** One game, so a sign, not a verdict, and
weaker than it looks in three ways. The win came from an AI-to-AI deal (Lisa
selling Väinö the reds) and an AI's bankruptcy, so it measures the two seats
together, not either one against the humans. Reveals were heavy: 19, and per
METHOD the whole table saw each one, including the private reasoning behind
offers made to the revealer (Lisa's "Kyle is cash-poor, so I'll raise my
offer" was opened twice, and Kyle later named his price and got it). Reveals
favour the humans, so they don't inflate the AI's result, but they make the
game weak evidence of how a seat plays unseen. And the humans gave Väinö its
engine: B. & O. for $400 completed the railroads that funded the reds.

Lessons:

- **Sonnet on llm-v5 can win a real game against people.** It made no error
  a check could grade in 73 calls (the movement-control plans are the one
  family left), the humans praised more decisions than they faulted, and its
  trade talk read as human enough to negotiate with: humans countered rather
  than declined.
- **Its weakness against humans is valuation under pressure, not reading the
  board.** Every critical flag was about price: selling the set-completing
  pair, and paying all its cash for a set it then couldn't build. Escalating
  cash-only offers to a human who just waits ($720, $900, $1,000) let him name
  the terms. These are judgments: record them as judgment scenarios with
  Sonnet's spread, and look at what the vote states (the cost of building the
  set it gains, beside the cash a deal leaves) rather than telling the seat a
  price.
- **In a mixed table, AI-to-AI trades decide games.** Read a human game's
  result per seat, and count a win fed by another AI seat as weaker evidence.
- **Check a live record's fields once per new setup.** The server field was
  null for every Claude game, and nobody noticed until a review needed it.

## llm-v6: terms in words first; the debt plan in steps (2026-10-07, on Gemma 4 12B)

The first version developed on Gemma 4 12B (`gemma4-12b-1x7k`, one slot).
Hypothesis: Gemma's two llm-v5 failure families come from the answers'
shapes, not from its judgment.

**A new check first.** No check graded a counter whose terms contradict its
message, so `judge` (`eval/scenario.ts`) now fails any proposal or counter, in
every scenario, judgment ones included, whose terms contradict the seat's own
public note (`termsContradictMessage`): a dollar amount the message asks that
the terms don't move, a lot the terms move that the message never mentions (by
any distinctive word, square number or group, so loose wording passes), or
cash asked with nothing handed over. A new error family gates it,
**`vote-counter-message`** (red, yellow, light blue): a rival holding two of a
set offers a fair-looking price for the seat's third, where counters are likely
and the rival holds lots the terms could name. Re-judging every llm-v5 record
on disk with the check (no model calls) found it in every model but Sonnet:

| llm-v5 records | Contradicting terms, of counters and proposals |
|---|---|
| Sonnet 5.5 | 0/35 |
| Haiku 4.5 | 5/32 ("I'll take $550 for #19" written as $350 and two lots; "$650 for the complete set" with every lot kept) |
| Gemma 4 12B | 6/56 (4x "$600 for New York" written as New York for St. James + Tennessee and $0) |
| Qwen3.5-9B | 3/36 final run, 12/40 first run (mostly "I'd rather mortgage it and keep it" written as cash for nothing) |
| gpt-oss-20b | 3/16 |

Every flagged case read as a real contradiction; none was the check
misreading loose wording.

Causes, from replaying the failing requests (temperature 0.3; Gemma repeats
itself almost exactly on a replayed follow-up):

- **Counters.** The follow-up asked for each lot's choice before any cash, and
  Gemma's lot choices drifted from its message: on the four New York requests
  it took the rival's two oranges and wrote $0, 12/12. Cash first fixed those
  (12/12 $600) but is the order llm-v5 rejected for dropping lots on Qwen.
  Recipient-named choices ("Sam gets it" / "you keep it") changed nothing
  (4/4 still wrong). A first field, **the counter in one sentence** ("I hand
  over ...; I take ...; Sam pays me $A"), fixed 12/12 with the order kept. In
  the first subset it still once wrote "I take Atlantic and Ventnor" after "$500
  for Marvin Gardens" (4/4 on replay); putting the price before "I take" in the
  sentence's template fixed that (4/4) and the original failures (14/14).
- **Debt plans.** Gemma's note, written first, reached for whichever one
  option covered the debt alone ("Selling 5 houses from the Red set provides
  $375, which covers the debt"). Stating what's left after every mortgage
  ("the $120 left takes 2 Red houses") helped the orange set but not the red
  (4/9 still sold with a railroad kept); listing the two complete plans with
  what each loses fixed orange and light blue but red still sold 5 (8/9 wrong).
  **The answer's order** did it: the mortgages first, then `stillOwed` (the
  debt left after them), then the sales, with the notes last, gave the
  cheapest plan on every replay (12/12 on the failing red, orange and light
  blue requests; the keeps-houses positions still mortgaged only).

llm-v6 is llm-v5 with those two changes, both answer shapes:

- the counter's follow-up opens with `termsInWords`, "I hand over <lots>;
  <name> pays me $A (or: I pay $B, or: no cash); I take <their lots>",
  matching the message, before the lot choices and cash;
- the debt plan is answered `mortgage`, `stillOwed`, `sellHouses`, then the
  notes (`planFirstSchema`); `stillOwed` is a working step, not checked.

Final run, Gemma 4 12B, full suite, 5 reps (230 answers); llm-v5 is its own
5-rep Gemma run from the model-axis entry, re-judged with the new check, plus
5 reps on the new family in the same conditions:

| Gemma 4 12B | llm-v5 | llm-v6 |
|---|---|---|
| Errors in error scenarios | 17/120 | 1/120 |
| `debt-must-sell-houses` (3 sets) | 8/15 | 0/15 |
| `vote-counter-message` (new) | 8/15 | 0/15 |
| Other trade-vote error scenarios | 1/45 | 1/45 |
| Contradicting terms in judgment scenarios | 5 | 0 |
| Counters, of trade votes | 44/70 | 56/85 |
| `vote-arms-rival-monopoly` | 4 counter "$600" (terms $0 + two lots), 1 accept | 4 counter $600 (terms $600), 1 accept |
| Debt plans, houses sold where they must be | 3-6 houses | 2, the fewest that cover it |
| Median quick call / debt / trade vote / turn start | 3.3 s / 4.1 s / 42 s / 43 s | 3.4 s / 4.6 s / 40 s / 44 s |

The one error left: "$50 is a bit low for the Railroad; would you consider
$150?" written as "Sam pays me $200" (the lot's price). Judgments held: auctions
$350-$400 for Boardwalk and $200-$220 to block the rival's orange, a fresh
orange monopoly built (3 houses, 3x), 14/15 proposals on the propose-direction
family; no sign of a seat doing less.

**Classification (METHOD.md): both changes are general.** Both are answer
shapes, measured on two families: on Sonnet 5.5 (`--model claude-cli:sonnet`,
concurrency 2, 3 reps, the debt and counter families and the counter-heavy
judgments) llm-v6 made 0/45 and then, with the final template, 0/18 errors;
its counter prices didn't move (New York $650-$900, against llm-v5's
$650-$850), and its debt plans sell the fewest houses that cover the debt.
On Qwen3.5-9B (4 slots, 5 reps, trade-vote and debt error families,
the new family and the New York judgment), llm-v6 made 13/95 against llm-v5's
8/95 (final run, re-judged) and 9/80 (first run, re-judged, before the new
family existed): somewhat worse than either llm-v5 run, but in llm-v5's
vote-side family, not the terms step. 9 of its 12 trade errors ask cash and
hand nothing over, most after a message that means keep ("I'd rather mortgage
it for $150 and keep it"); llm-v5 wrote those as an empty, unusable counter or
the same cash-for-nothing, which the new check now grades. Debt on Qwen: 1/30
(llm-v5 3/30 and 0/30). By METHOD's rule (helped or neutral on a local and a
hosted family: Gemma and Sonnet) both changes count as general; Qwen's trade
votes are the caveat, and item 2 of `NEXT.md` is where they get fixed.

Kept: on Gemma, errors in the error scenarios fall from 17 to 1 in 120, with
no new family and no drop in counters or proposals. The loop continues on
Gemma 4 12B.

Lesson: **for a model without thinking, the answer's order is its
reasoning.** Facts in the question (the remainder after mortgages, two
complete plans with their losses) moved Gemma part of the way; asking for the
plan in the order a strong player works it moved it all the way, on every
model tried. The same held for counters: a first field that restates the
message in the terms' own form carries it into the fields. And a check
written for one model's failure found the same failure in four of five
models' records, at zero model cost, by re-judging what was already on disk.

## The loop, after llm-v6

- **2026-10-07: re-judge the records before running anything.** A new check
  can be scored on every past run for free: rebuild each scenario, settle the
  recorded answer (and follow-up) again, and judge it. That measured the
  terms-against-message check on five models' llm-v5
  records without a model call, and gave llm-v5's half of the verdict on every
  old scenario; only the new family needed fresh llm-v5 calls.
- **2026-10-07: on a single-slot model, iterate on replays, not suites.** A
  replayed Gemma follow-up or debt plan costs 3-10 s and repeats almost
  exactly at temperature 0.3, so five shapes were compared in about 150 quick
  calls; the subset and full runs were only for the verdict.

## Does asking again clear a stall? Replays on Gemma 4 12B (2026-10-08)

A stall is a decision whose answer can't settle (refused by the engine, a plan
that leaves debt, cash that doesn't add up, an empty counter), so the game
waits on Try again. The question: does a plain re-ask converge, and does it
converge faster when the retry says why the last answer was refused?

The records: 3,322 scenario calls in `eval/runs/` across all versions and
models hold 42 stalls, leaving aside network failures (2 Qwen timeouts, 7
gpt-oss server 500s for output that broke its format) and Sonnet's 13
safeguard refusals, which arrive as server errors.

| Model | Calls | Stalls |
|---|---|---|
| Qwen3.5-9B | 1,713 | 33 |
| gpt-oss-20b | 219 | 8 |
| Gemma 4 12B | 499 | 1 |
| Sonnet 5.5 / Haiku 4.5 (claude-cli) | 886 | 0 (plus 13 safeguard refusals) |

By cause: an empty counter or proposal (`trade is empty`, 14), a manage plan
the engine refuses (nothing to change, insufficient cash, houses before
mortgages, sell-only: 11), a debt plan leaving debt (5), trade cash that
doesn't add up or runs both ways (8), a lot assigned to its own owner or not
the counterparty's (3), a counter that gives a lot for nothing (1).

What ran: 25 distinct failing requests (llm-v1 to llm-v5, every cause; 24
first failed on Qwen or gpt-oss, and llm-v5's turn-start-holds-rival-completer
on both Gemma and gpt-oss), rebuilt from their scenarios (24 of 25 prompts
byte-identical to the record) and put through the route's ask and settle steps on Gemma 4 12B,
one at a time. Arm A re-asks the identical request, up to 3 times; arm B adds
one user message, "Your previous answer was refused: <reason>. Answer
again.", carrying the latest refusal. 64 calls in all.

| | Converged | Mean attempts | Legal but graded a bad move |
|---|---|---|---|
| A: the same request | 25/25 | 1.00 | 5 |
| B: plus the refusal reason | 25/25 | 1.08 | 7 |

- **Asked plainly, Gemma answered every request validly the first time**,
  whichever model had stalled on it. Most stalls are a weaker model's, not the request's.
- **The reason made things worse, not faster.** On llm-v3's
  turn-start-holds-rival-completer (Qwen's cash that didn't add up), arm B
  failed twice (the same cash slip, then asking for a lot the other side
  doesn't own) before a valid third answer; the same request asked plainly
  passed 7 of 7. On llm-v4's and llm-v5's debt-keeps-houses, "sell the set's
  buildings before mortgaging" steered Gemma into selling 3 houses that a
  mortgage would have covered: a valid answer and a worse move.
- **Gemma's own one stall doesn't repeat**: that request (llm-v5) passed 8
  of 8 replays. Sonnet's only stalls, llm-v1's safeguard refusals, were
  already replayed in the ceiling entry above: 3 of 10 identical re-asks
  refused, so a plain retry clears them too.

Caveat: no Qwen server was up, so Qwen's own stalls weren't re-asked on
Qwen; a weaker model may fail the same request repeatedly at temperature
0.3, which this can't show.

Lesson: **a stall on a working model is a rare, non-repeating slip, and a
plain re-ask clears it.** Telling the model why it was refused adds a second
instruction that competes with the question's own, and the model follows
the newest words: it fixed nothing a re-ask didn't and
twice traded a refusal for a legal bad move.

## Scenarios from 46181f and 5x1c6j: two shared checks (2026-10-08)

Built from `inbox/46181f-scenarios.md` (now deleted; NEXT items 12, 15 and
16). Two checks join `termsContradictMessage` in `judge`, run on every answer,
judgment scenarios included (`eval/scenario.ts`):

- **`claimsMovement`**: a note or plan that tells the seat to avoid, stay off,
  steer clear of, keep away from or dodge a board place (a color group, the
  railroads, utilities or hotels, a lot's name, possessives included). Skipped
  for a seat in jail and any sentence about jail. Every fixture from the spec
  passes.
- **`pitchCreditsMissingSet`**: on a proposal or counter, a public note that
  credits the other side with building, houses or a full set ("your builds",
  "build on your pinks") when they hold no full set and the terms don't
  complete one. Negated sentences pass. A first version also flagged "fund
  your next purchases"; it now needs building words after "fund your".

New error families (5 reps each per version): `turn-start-propose-pitch-*`
(5x1c6j call 62's table, red and dark-blue disguises, and a contrast where the
holder has the full light blues, so the pitch is true), `turn-start-movement-*`
(a rival's four railroads; a rival's dark-blue hotels) and
`debt-after-built-rival-set` (46181f call 149, with its stored plan "...;
avoid reds.") plus an orange-hotel disguise. Judgment families:
`vote-sell-pair-to-blocker` (J1, call 122, with its whole negotiation and
pitch), `vote-overpay-for-set` (J2, call 132, with the earlier cash offers)
and their variants, and `vote-repitched-lower` (two: a rival walks down an
offer the seat declined 16 turns earlier, behind 32 lines of ordinary play,
for item 10). Scenario trades now carry an id that names their place in the
log, as the engine's do, so a version can read the pitch.

Re-judging what was on disk: Gemma's llm-v6 suite (230 answers) and Sonnet's
llm-v6 subset have no movement claim or false pitch; Sonnet's llm-v5 suite has
three movement claims, all in judgment scenarios on hotel boards ("avoid the
orange and red hotels"); one Qwen llm-v6 plan said "avoid landing on
railroads until I can lift the mortgage".

llm-v6 baseline on the new families (5 reps):

| llm-v6 | Gemma 4 12B | Sonnet 5.5 |
|---|---|---|
| Pitch family (20) | 0 | 4 ("money to build on your pink set", "build on your light blues") |
| Movement, turn starts (10) | 1 ("avoid Sam's hotels") | 3 |
| Movement, debt (10) | 0 | 10 (5/5 with the fed-forward plan, 5/5 without) |
| Error scenarios | 1/40 | 17/40 |

The ceiling fails the new checks far more than Gemma: Sonnet writes the
idiom ("avoid reds") and the friendly pitch; Gemma's notes rarely do. Both
errors are real by the spec's definition, and both are Sonnet's live
failures, so for once the ceiling is the model the scenarios gate.

## llm-v7: facts added to the view (2026-10-08)

Hypothesis: the pitch, plan and trade errors come from facts the view leaves
for the model to derive. llm-v6 plus:

- **Each player's position** (item 12) on their player line: "no full set",
  or "full sets: Red (houses 3/3/3), Dark blue (unbuilt, a lot mortgaged);
  can build on Red".
- **What a player controls** (item 15): the rules say where you land is the
  dice and list a player's choices; the plan is asked for as "made of your
  choices".
- **The proposer's message** (item 11): a trade vote states "<proposer>'s
  message with this offer: ..." (`tradePitch`, the public note only), or that
  they sent none.
- **What a completed set costs** (item 18): a trade that completes a set says
  what three houses a lot costs and the cash its new owner would start with
  ("Sam would have $342 after this trade: enough for 2 houses on Red at $150
  each"), and the vote states the largest rent on the board.
- **A built set's lots in a debt** (found here): the debt question said
  "Mortgages: none" when the only spare lots sat in a built set, and Sonnet on
  llm-v7 then sold the houses alone, leaving the debt unpaid, 4/5 (llm-v6
  5/5 found the plan anyway). It now says what those lots raise once the
  set's houses are sold. Written first as "after selling them all, mortgaging
  raises ...", it broke Gemma 5/5: its debt answer lists mortgages first, so
  it mortgaged all three greens and sold one house, which the engine refused.
  Stated as a coupling ("a plan that mortgages any of them must also sell all
  2 of its houses, for +$200"), both models gave the right plan 5/5.

Two wordings were measured and dropped on the way. The no-set line first read
"no full set, so nothing to build on": Gemma, reasoning "I can't build on it
anyway", accepted three below-mortgage offers in `vote-counter-holdings`
(llm-v6 0/15); replayed with the phrase removed, 1/10. It is now the plain
fact. And on Sonnet's fed-forward "avoid reds" plan, neither asking for the
plan "made of your choices (...). Where you land is the dice" in its field
description nor "check it against the board and the rules above, and keep only
what you can choose" on the stored plan moved it (5/5 and 5/5): reverted.

Final runs, 5 reps, error families plus the new judgment families (Gemma:
190 answers, the debt families re-run after the coupling wording; Sonnet:
the new families at 5 reps and the older error families and eight judgments
at 3):

| Errors | Gemma llm-v6 | Gemma llm-v7 | Sonnet llm-v6 | Sonnet llm-v7 |
|---|---|---|---|---|
| Older error families | 1/120 | 1/120 | 0/48 (+ llm-v5 0/63) | 0/72 |
| Pitch family | 0/20 | 0/20 | 4/20 | 2/20 |
| Movement, turn starts | 1/10 | 0/10 | 3/10 | 0/10 |
| Movement, debt | 0/10 | 0/10 | 10/10 | 6/10 |
| Unusable, contradicting or movement answers in the new judgments | 4/20 | 5/30 | 6/20 | 0/30 |

The remaining Sonnet movement errors are almost all the fed-forward case
(`debt-after-built-rival-set`, 5/5 then 4-5/5 on every rerun): with no claim in
its stored plan, the primer took Sonnet from 8/15 to 1-2/15. Gemma's judgment
unusables are its own (`vote-overpay-for-set-yellow`: a counter asking the
$150 seller to pay, refused by the engine, 4/5 on both versions).

Judgments, beside the errors (no sign of a seat doing less):

- Gemma proposals on the propose families: 31/35 (llm-v6), 29/35 (llm-v7);
  Illinois $150-$300 then $200-$300. Counters on the trade-vote error
  families were as frequent as before.
- J1, the stuck reds: Gemma 4 accept, 1 counter (llm-v6) and 3 accept, 2
  counter at $640 plus two railroads (llm-v7). Sonnet spread wide on both:
  2 accept, 1 decline, counters at $500-$780 (llm-v6); 1 accept, 2 decline,
  counters at $800-$850 (llm-v7; an earlier llm-v7 run, before the final
  wording, accepted 4/5).
- J2, all its cash for the greens: 5/5 accept on both models and both
  versions. Stating the $1,800 to build them and the $250 top rent moved
  nothing; this is a judgment for human games to settle.
- Sonnet on the older judgments: Boardwalk $380 (3x), blocking the orange
  $230-$260, arming a rival's orange countered at $650-$800 or declined, the
  same as llm-v5 and llm-v6.

**Classification (METHOD.md): general.** Every change is a fact added to the
view, and the version helped or was neutral on both families: Gemma's errors
held at their floor (1/160, against llm-v6's 2/160) with the same play, and Sonnet's
fell from 17/40 to 8/40 on the new families with no new error elsewhere.
Two wordings that hurt one model were dropped (above), not kept for the other.
The one model-specific finding is the fed-forward plan: Sonnet repeats a
claim it finds in its own stored plan even with the primer; that is item 15's
remainder.

## llm-v8: the history of play in place of the log window (2026-10-08)

Hypothesis (item 10, METHOD's "What a view holds"): the 30-line log window is
mostly rolls, rent and cards, which the board already shows, and it pushes
out what the board can't: a declined offer from a few turns back. llm-v7 with
the window replaced by the whole game's history of decisions and public
intent (`versions/llm-v8/history.ts`), grouped: trade offers and how they were
answered, auctions (who passed, who won, at what), lots bought at the printed
price (one line per player), building, selling and mortgaging (one line per
plan, with the levels it left), leaving jail (per player), and the rest
(bankruptcies, a seat that couldn't decide, notes no decision followed). Each
note sits beside the decision it explains. Nothing happening to players
appears. Since the window is gone, each question states its own cause
(`causes.ts`): the debt says what charged it ("You owe this after paying $700
rent on Indiana Avenue to Sam"), an auction who landed on the lot and passed,
the jail question how the seat got there; the turn start loses its "recent
trade offers", which the history holds whole.

**Prompt length**, game 46181f's real log (llama.cpp's tokenizer, the view
and rules without the question):

| Turn | llm-v7 (30-line window) | llm-v8 (history) |
|---|---|---|
| 40 | 2,623 tokens | 3,300 |
| 60 | 2,687 | 4,004 |
| 85 (the game's end) | 2,518 | 4,433 |

The window holds steady; the history grows with the game, ~23 tokens a turn
here (20 trade offers, 25 buys, 18 build and mortgage plans, 10 jail exits).
A trade vote adds ~1.5k for its question and Gemma's thinking budget 1.2k, so
at turn 85 a vote is ~7.1k of the 7.5k slot `gemma4-12b-1x7k` gives: a longer
or more trade-heavy game would overflow it. On Sonnet it is no concern.

Runs, 5 reps, the same sets as llm-v7:

| Errors | Gemma llm-v7 | Gemma llm-v8 | Sonnet llm-v7 | Sonnet llm-v8 |
|---|---|---|---|---|
| Older error families | 1/120 | 0/120 | 0/72 (3 reps) | not re-run: no log in them, so the view is llm-v7's |
| Pitch family | 0/20 | 0/20 | 2/20 | 2/20 |
| Movement, turn starts | 0/10 | 0/10 | 0/10 | 2/10 |
| Movement, debt | 0/10 | 1/10 | 6/10 | 6/10 |
| Unusable or flagged answers in the new judgments | 5/30 | 4/30 | 0/30 | 0/30 |

Judgments: where the history matters, `vote-repitched-lower` (a rival walks
an offer down after the seat refused it with a stated price), llm-v8's seats
use it. Sonnet: "Sam, you offered $550 earlier and now $420? Illinois
completes your set, so it's $800 or I keep it"; llm-v7 declined as often
(8/10 on both) without being able to say why. Gemma on llm-v8 countered
8/10, at $500-$600 (declined 1, accepted 1), where llm-v7 declined 5,
accepted 2 and countered 3 (one at $200 plus the rival's two lots). Gemma's proposals held (29/35 on both
versions; the Boardwalk families lowest, 4/10 against 7/10). J1 and J2
didn't move (Gemma accepts J2 3-5/5 throughout; Sonnet 5/5).

**Classification: general, neutral on errors.** A fact change, neutral on
both families' error counts; what it adds shows in the judgments, where both
models now cite the history. The cost is length, which matters only on the
single 7.5k Gemma slot (above): a longer game needs a larger slot or a more
compact history before llm-v8 plays live on Gemma.

## The loop, after llm-v8

- **2026-10-08: a scenario family whose ceiling fails is still an error
  family.** Sonnet failed the new movement and pitch checks far more than
  Gemma, which inverts the usual reading of the ceiling: here the scenarios
  measure the live model's own failure. The ceiling rule stands for telling a
  wrong expectation from a miss; it doesn't make the ceiling's answers right.
- **2026-10-08: a fix's wording can help one model and break another, so
  every fix is replayed on both before a run.** The debt line that cured
  Sonnet's unpaid plans broke Gemma 5/5, because Gemma's answer order put the
  mortgages first; the version's other parts were run for two hours on the
  broken wording before it showed. Replay the changed decision on both
  models first (5 calls each), then run.
- **2026-10-08: a shared single slot halves the loop's speed.** Another
  agent's replays shared the Gemma slot for an hour; trade votes went from
  ~40 s to ~75 s each. Plan Gemma runs in calls, and expect the wall clock to
  double when the slot is shared.

## Three Sonnet-specific experiments on llm-v8 (2026-10-08)

Built for the live `ai:claude` seats, so each is **model-specific**: one change
to llm-v8, measured on Claude Sonnet 5.5 only (`--model claude-cli:sonnet`,
two calls at a time, 5 reps per scenario beside llm-v8 in the same runs, 10
where a judgment moved). Each imports the rest of the frozen llm-v8 instead of
copying it. They are listed in `MODEL_SPECIFIC` (`versions/index.ts`), so a
new seat still defaults to llm-v8, the newest general version. 290 decisions
(~405 CLI calls with counter follow-ups) in all.

### llm-v9: ask at every turn start (NEXT item 13). Kept, for Sonnet.

Hypothesis: llm-v8's gate (ask only when the seat can build or lift a
mortgage, or shares a color set and the board changed) hides plays a skilled
player finds. Four new judgment scenarios, `turn-start-gated-*`, are turn
starts where llm-v8 makes no call (the harness now records those as "not
asked", 20/20 for llm-v8): a quiet board, a broker chance (a rival holds two
oranges, a $90 player holds New York), cash for a lot (the seat holds three
railroads, a $70 player the fourth: railroads aren't a color set, so llm-v8
never asks) and an unchanged board (holds Illinois beside a rival's two
reds, asked four turns ago).

| llm-v9, 5 reps each | What it did |
|---|---|
| Quiet board | 5 roll |
| Broker (New York) | 5 roll; none saw the completer |
| Cash for a railroad | 5 proposals, $240-$280 for Short Line ($200 printed), pitched to the $70 player's need for cash |
| Unchanged board | 4 roll, 1 offers $500 for the rival's two reds |

Errors 0/20 (no false pitch, no movement claim). Median 5.6 s per call, p90
7.2 s: that is what every AI turn start adds. Table talk: a turn start that
does nothing still shows no line (llm-v8's rule), and its notes would have
been "Rolling." anyway, so asking buys plays, not chat. Kept: 6 of 20 asks
found a real play the gate never offers, none was a bad one, and the cost is
seconds on Sonnet (on a 30-40 s local model it would not be worth it, which
is why it is model-specific).

### llm-v10: no "mortgage it instead for $X" in trades. Dropped.

Hypothesis: llm-v4's mortgage line (beside each lot the seat would give away,
and as a list of what mortgaging each lot raises, in votes, counters and
proposals) anchors Sonnet's asks low. llm-v10 removes both. Ran the trade-vote
error families (below-mortgage, counter-holdings, counter-message: 45
answers) and the judgments J1, J2, repitched and arms-rival.

| Sonnet 5.5 | llm-v8 | llm-v10 |
|---|---|---|
| Errors, trade-vote error families | 1/45 | 0/45 |
| Errors, all answers (incl. the 10-rep judgments) | 4/110 (terms naming another price than the message) | 1/100 (a movement claim) |
| Sales below the mortgage value | 0 | 0 (the guard isn't needed on Sonnet) |
| Counters that sell, error families | 27/45 | 32/45 |
| Mean ask, Pacific / Marvin / Kentucky / Water Works | $330 / $688 / $255 / $146 | $372 / $780 / $270 / $172 |
| Ask, Connecticut (counter-message) | $450 x5 | $400-$420 |
| `vote-arms-rival-monopoly` (10 reps) | 7 counter $700-$1,000, 3 decline | 1 counter $900, 9 decline |
| J1, the stuck reds (10) | 6 accept, 1 decline, 3 counter | 8 accept, 2 counter |
| J1 orange (10) | 9 sell the pair (+ railroads, $400-$640), 1 buys New York | 3 sell, 7 buy New York instead |
| Repitched New York (10) | 7 counter $650-$700, 3 decline | 5 counter, 5 decline |
| J2 (5) | 5 accept | 5 accept |

The asks rose a little in four families and fell in one: no clear anchor.
What moved is elsewhere: without the line, Sonnet counters a rival's
set-completing offer far less (1/10 against 7/10) and accepts more of the J1
sale a human flagged in 46181f (8/10 against 6/10). Its fewer errors are the
counters it no longer makes (every llm-v8 error was a counter's terms), which
METHOD rules out as progress. Dropped and unregistered; the code is in commit
9d8d1fc. Lesson: the line does more than set a floor; it reminds a strong
model it can keep the lot and still raise cash, which seems to be what makes it
counter rather than accept or walk away.

### llm-v11: auction notes shown live. Kept, for Sonnet.

llm-v2 began holding an AI seat's auction note until the auction closes
(`holdAuctionNotes`, `held.ts`), because weaker models wrote their maximum
into it. llm-v11 shows it at once (`holdAuctionNotes: false`) and its
question says so ("shown to the table at once, while the auction runs"). A
new shared check, `leaksAuctionMax` (`eval/scenario.ts`), fails a note the game
shows while the auction runs that names an amount within $20 of the seat's
maximum; a held note can't leak, so it never fires on llm-v2 to llm-v10.
Ran the five auction judgments (Boardwalk and own-set at 10 reps).

| Sonnet 5.5 | llm-v8 (held) | llm-v11 (live) |
|---|---|---|
| Notes naming a dollar amount | 0/35 | 0/35 |
| `leaksAuctionMax` | n/a (0 would have leaked) | 0/35 |
| Maximum given in words ("up to face value", Mediterranean at its $60 face) | 1/5 | 3/5 |
| Boardwalk maximum (10) | $380 x7, $400 x2, $360 | $300 x6, $380 x3, $360 |
| Completes own set (10) | median $480 | median $455 |
| Blocks a rival, cheap lot, into illiquidity | $230-$260, $60, $180-$200 | $230-$260, $60, $190-$240 |

Sonnet's notes stay table talk with no figure in them ("Illinois completes my
set, I'm bidding"), held or not, and no bluff appeared. The one way it gives a
maximum away is "face value" on a lot whose maximum is its price, which costs a
$60 lot nothing. Its Boardwalk maximum fell ($300 in 6 of 10), a judgment, not
an error: watch it in live games. Kept: the crutch isn't needed on Sonnet, and
the table sees what the seat says while it bids.

Lesson: **a crutch built for a weak model can be measured off a strong one
cheaply**, but removing it can move judgment as well as errors, as the
mortgage line showed: read the spread, not only the error count.

## llm-v12: llm-v9 and llm-v11 together, for Sonnet (2026-10-08). Kept.

NEXT item 13's candidate for the live `ai:claude` seats: llm-v8 asked at
every turn start (llm-v9's `turnStartOwed`) with its auction notes shown live
(llm-v11's specs, `holdAuctionNotes: false`). It imports all three frozen
versions and adds nothing of its own, so it is **model-specific** like its
parts and listed in `MODEL_SPECIFIC`; a new seat still defaults to llm-v8.

Hypothesis: the two changes touch different decisions, so each effect holds as
it did alone and the combination adds no error. The run confirmed the first
half before any answer was read: every request llm-v12 sent is byte-identical
to its parent's in the same scenario (the gated turn starts to llm-v9's, the
auctions to llm-v11's, the turn-start error scenarios to llm-v8's). What
differs below is sampling.

Ran on Claude Sonnet 5.5 (`--model claude-cli:sonnet`, two calls at a time):
the four gated turn starts and five auctions at 5 reps (Boardwalk and own-set
at 10), every error scenario once, then the six turn-start error scenarios
whose single pass failed, at 5 reps for llm-v8 and 4 more for llm-v12 in the
same conditions. 141 decisions, ~149 CLI calls with counter follow-ups.

| Sonnet 5.5, 5 reps | llm-v9 alone | llm-v12 |
|---|---|---|
| Quiet board | 5 roll | 5 roll |
| Broker (New York) | 5 roll | 5 roll; still none sees the completer |
| Cash for a railroad | 5 proposals, $240-$280 | 5 proposals, $240-$280; 1 false pitch ("gives you a quick boost to build on your own sets") |
| Unchanged board | 4 roll, 1 offer | 5 roll |
| Plays found / errors | 6/20, 0/20 | 5/20, 1/20 |
| Turn-start time, median / p90 | 5.6 s / 7.2 s | 6.4 s / 7.4 s |

| Sonnet 5.5 | llm-v8 (held) | llm-v11 (live) | llm-v12 (live) |
|---|---|---|---|
| Notes naming a dollar amount | 0/35 | 0/35 | 0/35 |
| `leaksAuctionMax` | n/a | 0/35 | 0/35 |
| "Face value" on Mediterranean | 1/5 | 3/5 | 3/5 |
| Boardwalk maximum (10) | $380 x7, $400 x2, $360 | $300 x6, $380 x3, $360 | $300 x5, $380 x2, $320, $330, $340 |
| Completes own set (10), median | $480 | $455 | $560 ($420-$600) |
| Blocks a rival / cheap lot / into illiquidity | $230-$260 / $60 / $180-$200 | $230-$260 / $60 / $190-$240 | $230-$260 / $60 / $200-$250 |

Errors, all 32 error scenarios once: 4/32, all in the two turn-start
families llm-v8 already fails on Sonnet (false pitches 2/4, movement claims
2/2); buys, trade votes, proposal direction and debts 0/26. Re-run in the same
conditions on those six scenarios, whose requests are llm-v8's to the byte:

| Turn-start error families, Sonnet | llm-v8 (5 reps) | llm-v12 (1 + 4 reps) |
|---|---|---|
| False pitch ("gives you money to build on your pinks") | 3/20 | 4/20 |
| Movement claim ("avoid Sam's railroads if possible") | 3/10 | 3/10 |

No new error family, and the old ones at llm-v8's rate. The one gated-turn
error is the same false pitch: asking every turn gives Sonnet more pitches to
write, so the llm-v8 pitch rate (~15-20% of proposals) now applies to more
turns. That is llm-v8's error, carried, not llm-v12's.

**Boardwalk, v11's open question: it repeats.** $300 in 5 of 10 and below
$380 in 8 of 10, against llm-v8's $380 in 7 of 10, on a request identical to
llm-v11's. So the live-note sentence, not chance, lowers Sonnet's Boardwalk
maximum. Its notes hint why: telling the table "only below its price" or "not
above its value" seems to commit it to a cap it then honours. Still a
judgment, not an error; nothing was changed to chase it. Its own-set maximum
moved the other way (median $560 against $455 and $480), so the sentence
doesn't simply lower bids.

**Verdict: kept, for Sonnet.** Each effect holds as it did alone (plays at
turn starts the gate skips, no leaked maximum), and the combination adds no
error. Lesson: when a combined version's parts touch disjoint decisions,
comparing its requests to its parents' proves the combination before any
answer is spent, and leaves only sampling to measure.

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

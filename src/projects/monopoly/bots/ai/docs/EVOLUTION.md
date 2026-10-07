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

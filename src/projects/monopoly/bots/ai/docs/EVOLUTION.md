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

# Scenarios from game 46181f (and 5x1c6j)

Specs for the scenario suite (`bots/ai/eval/scenarios.ts`), written for the
agent building the next version. They were not built in place because
`eval/scenario.ts`, `eval/scenarios.ts` and `eval/scenarios.test.ts` had
another agent's uncommitted work (llm-v6's `termsContradictMessage` and the
`vote-counter-message` family) when the game was reviewed. Build them on top
of that work, then delete this file and move what landed into `EVOLUTION.md`.

The game and its review are in `EVOLUTION.md`, "First human game: 46181f".
Call ids are `monopoly_ai_calls.id`; read a call's full prompt and answer with
`npm run game:review -- 46181f --prompts`, or straight from the table
(read-only). Game 5x1c6j's row is gone, but its 86 call rows remain.

Two are **error** checks (gated), two are **judgment** scenarios (observed
only, never pass or fail). Run every one on Sonnet as the ceiling first, to
tell a wrong expectation from a model's miss.

## E1. A plan or note that claims control over movement (error)

**Seen.** Lisa (46181f, calls 122, 123, 131, 132, 134, 135, 139, 142, 148,
149, 152, 155): "avoid landing on Väinö's reds", "Avoid reds, lift green
mortgages when cash allows", "avoid Väinö's railroads and reds". Once in the
plan it was fed forward and repeated in 12 of her 13 plans from turn 33 on.
5x1c6j: "avoid James's green set" (call 52), "avoid Dev's railroads" (77,
80), "avoid Frank's orange" (84), "keep cash up to avoid Dev's railroads"
(86). Movement is the dice; no player chooses where they land.

**Why it is an error.** It states a choice the rules don't offer. Fed
forward as the plan, it displaces a real plan (a cash reserve, a mortgage
order, staying in jail), which is NEXT item 15's point.

**The check.** A shared check like `termsContradictMessage`, run on every
scenario (both kinds), over the public note, private note and plan of the
answer (`o.resolution`): an error when any of them tells the seat to avoid,
stay off, steer clear of, keep away from or dodge a board place. A board
place is a color group (by name, singular or plural: "red", "reds", "the
oranges", "dark blues"), a lot by any distinctive word of its name, "the
railroads", "the utilities", "hotels", or a possessive of one ("Väinö's
reds", "his orange set"), with "landing on" optionally between the verb and
the place.

Must flag (unit-test fixtures, verbatim from the calls above):

- "Use the cash to buy unowned lots and trade with Kyle for the greens or light blues; avoid landing on Väinö's reds."
- "Avoid reds, lift green mortgages when cash allows, then rebuild."
- "Keep building green; avoid Väinö's railroads and reds; lift Electric mortgage later."
- "Lift North Carolina and Pennsylvania as cash allows, then build houses on green; avoid the reds."
- "Stay liquid, keep building light blue when cash allows, avoid Frank's orange."

Must not flag (also verbatim): the object is a choice, or the sentence weighs
odds rather than claiming control.

- "Pursue Indiana Avenue for the red set and build houses; avoid trades that complete another player's set."
- "If he declines, keep reds and look for other trades or build elsewhere; avoid handing him a monopoly cheaply."
- "Keep building houses on the reds with incoming rent and avoid mortgaging."
- "Collect red rent, lift mortgages, keep building reds, avoid giving Kyle orange."
- "Only $275, so one house ($200) is affordable and boosts green rent. Risk on reds is small this roll, and selling the house plus mortgaging Electric covers the worst case."
- "Red squares are far from my position, so building one house ($200) and keeping $180 is safe enough."
- "Keep $400 in reserve while red has houses."

**Jail is the exception.** In a jail decision (and a turn start asked before
one), staying in jail to stay off a dangerous board is a real choice: "Staying
in jail is safe from Dev's railroads" (5x1c6j, call 80) is a plan, not a
claim. Skip the check when the asked state has the seat in jail, or accept
the place when the same text names staying in jail.

**Positions.** Every scenario carries the check, but these make the
temptation strongest. Each is an error scenario whose `error` is this check
(plus the shared ones):

- `debt-after-built-rival-set`, the original: a settle-debt just after a big
  rent. Turn 62; the seat holds the three greens with a house on Pacific and
  North Carolina, and Electric mortgaged; it had $170 and paid $700 rent on a
  rival's reds at three houses each, so it is $530 short (46181f call 149: it
  sold both houses and mortgaged all three greens). The seat's last plan, stored in its
  AI state, is "Build greens when cash reaches $200+ above a buffer; avoid
  reds.", so the scenario also tests whether a fed-forward claim is repeated.
- Disguised variants: the oranges with hotels held by another seat and the
  seat owing $950 with the yellows built; all four railroads with one rival
  and the seat at turn start with $180 (no stored plan); the dark blues with
  hotels and the seat holding the light blues at two houses, $300.
- `turn-start-thin-cash-dangerous-board` (exists) gets the check through the
  shared path; no change needed.

## E2. A pitch that credits the other side with what it doesn't have (error)

**Seen.** 5x1c6j, call 62 (turn 40): Frank ($1,399, St. James and New York,
one railroad) proposed $620 for Dev's Tennessee with the pitch "Dev, $620 for
Tennessee is more than three times its price, and it funds your builds
elsewhere." Dev held Baltic, Tennessee, Illinois, Atlantic, Ventnor and two
railroads: no full set, so nothing to build. (Wrongly remembered as 46181f;
46181f's pitches were factual.) NEXT item 12 asks for this scenario before its
fix.

**Why it is an error.** It states a fact about the counterparty's position
that the board contradicts. A human reads it as a misread, or as a pitch that
doesn't know the table.

**The check.** On a proposal or counter only (`proposedTerms(o)` non-null): an
error when the public note credits the counterparty with building, houses or
a full set ("your builds", "build on your …", "your houses", "fund(s) your
building", "your monopoly", "your full set", "develop your …") while, in the
asked state, the counterparty holds no full set and the terms don't complete
one for them. Negations are true statements and pass: "two greens you can't
build on", "you have nothing to build".

**Positions.** The `proposeDirection` family (owns two of a set, the third
with a cash-poor player) already sets up this pitch; add the check to its
`error`, and add:

- `turn-start-propose-pitch-orange`, the original: turn 40, the seat holds St.
  James, New York and a railroad with $1,399; the counterparty holds
  Tennessee, Illinois, Atlantic, Ventnor, Baltic and two railroads with $191
  and no full set.
- Disguised variants: the seat holds Kentucky and Illinois, the counterparty
  Indiana plus two pinks and $150; the seat holds Park Place, the counterparty
  Boardwalk plus two light blues and $220.
- A contrast variant where the counterparty does hold a full set (the light
  blues, unbuilt), so a "funds your houses" pitch is true and must pass. It
  keeps the check honest: the error is the false claim, not the argument.

## J1. Selling the set-completing pair to the seat that holds the third (judgment)

**Seen.** 46181f, call 122 (turn 33): Lisa ($560) held Kentucky, Illinois,
Vermont, Electric and Pacific; Väinö ($982) held Indiana and all four
railroads, plus New York and Atlantic. After two counters, Väinö offered $640
and Reading for both reds, and Lisa accepted ("Reds are stuck for me while
Väinö holds Indiana"). The prompt stated "Väinö would own 3 of 3 Red, a full
set". Väinö built the reds and won; Bot Killer flagged it: "Don't give up a
monopoly for cash".

**Position.** `vote-sell-pair-to-blocker`: that table, with the offer pending
(the reds to the rival, Reading and $640 to the seat). Record the vote and,
for a counter, the terms (cash asked, lots asked). Variant: two oranges
against a holder of the third with three railroads and $900, offered $520 and
a railroad.

**Read.** Judgment: a strong player can sell a stuck pair for enough. Sonnet
accepted live; compare its spread over five reps with what human flaggers say,
and watch whether stating the rival's cash after the trade ($342 here, two
houses' worth) moves it.

## J2. Paying all its cash for a set it can't then build (judgment)

**Seen.** 46181f, call 132 (turn 42): Lisa ($1,275) held Pacific, Reading,
Vermont and Electric; Kyle ($192) held North Carolina and Pennsylvania.
After three cash-only offers ($720, $900, $1,000) Kyle countered: the two
greens for $1,000 plus Reading and Vermont. Lisa accepted, leaving $275, on a
board where Väinö's reds had 2, 2 and 1 houses (rent $250, $250, $100) and
three railroads. She built one house and was stripped by a $700 rent twenty
turns later. Bot Killer: "No cash to build doesn't make the monopoly
valuable"; "No buffer for reds. Mortgage a house is 50%".

**Position.** `vote-overpay-for-set`: that table, with Kyle's counter pending.
Record the vote, the counter's cash, and the cash the answer leaves. Variant:
the seat holds one yellow and $1,100, a cash-poor player offers the other two
for $900 plus the seat's two railroads, on a board with built oranges.

**Read.** Judgment. Watch it beside a version that states, in the vote, what
building the gained set costs (three houses each: $1,800 for the greens) and
the largest rent on the board, next to "Your cash would go from $1,275 to
$275". That is a missing consequence, a general change, and the judgment
spread is how it is read, never a gate.

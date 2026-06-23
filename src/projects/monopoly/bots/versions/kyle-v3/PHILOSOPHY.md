# Kyle Bot — Philosophy

A plain-language record of how the Kyle bot plays, written so anyone can read it
without reading the code. `policy.ts` / `match-value.ts` / `trades.ts` are the
exact wiring of what's described here; when the strategy changes, this file
changes with it.

The Kyle bot is its own family (`kyle-vN`), started from scratch. It begins
simple and grows one deliberate rule at a time.

- **kyle-v1** — blank baseline; defers to the game's defaults everywhere.
- **kyle-v2** — buying & paying: always buy what you can afford; mortgage to
  complete sets; never sell houses.
- **kyle-v3** — kyle-v2 **plus trading**, and one unified value scale, described
  below.

## kyle-v3

kyle-v3 keeps everything kyle-v2 does (buying, auctions, raising cash, settling
debt) and adds a **trade engine**. It still doesn't build houses — that's the
next version's job.

### The one value scale: MATCH_VALUE

Earlier versions carried two color tables. kyle-v3 replaces them with a single
**MATCH_VALUE** ladder — one most-valuable-first ranking of every "match" worth
having:

> orange · red · light-blue · **4 railroads** · pink · yellow · **3 railroads** ·
> dark-blue · green · **2 railroads** · brown · **1 railroad** · utilities

A color counts only at the *full* monopoly (one rung each); every railroad count
is its own rung, because railroad rent climbs with each one you own. Utilities
sit dead last. This one list drives **both** the mortgage order and trade value.

### Mortgaging (the order Kyle gives things up)

When Kyle needs cash, he mortgages in two passes, each **least-valuable-first**:

1. **Non-set lots first** — loose properties, partial railroad holdings, and
   utilities — weakest first. So junk and low-value loose lots go before your
   good loose lots.
2. **Then completed sets** — full monopolies and a full four-railroad holding —
   again weakest first, so a brown monopoly goes before an orange one and your
   best set is protected the longest.

He never breaks the set he's completing *this turn*, and he never sells houses
(a lot with a building in its group simply can't be mortgaged; the game's default
only sells houses as the last forced-debt resort).

### Trading

A **match** is completing a color monopoly or reaching a railroad count. Its
value is its MATCH_VALUE rung. Utilities are never a match. The "distance"
between two matches is how far apart they sit on the ladder.

**Kyle accepts a trade** offered to him when **all** of these hold:

- **He completes a match** (a monopoly, or a higher railroad count). If a trade
  doesn't finish a set for him, he's not interested — no matter how much cash or
  property comes with it.
- **The matches are close.** No *other* party in the deal completes a match more
  than **(number of completers − 1)** rungs *above* his. In a straight two-party
  trade that means the other side's set must be within one rung of his; a
  three-completer deal allows two; and so on. Only sets *better* than his count
  against him — he's perfectly happy when others come out worse.
- **It doesn't break a set he already holds.** He'll never give up a property
  from a monopoly he owns, or any railroad he holds, even to complete a better
  set. (Loose lots and 2-of-3 near-sets are fair game to give away.)
- **He doesn't lose cash to another player.** He'll happily *receive* cash, and
  he'll pay the bank's 10% interest on a mortgaged property he takes in — but he
  never pays a rival a cent.

He doesn't care about the *number* of properties (he'll give two to get one), and
on the receiving end he doesn't care whether he got the best or worst set in the
deal — only that the rules above are met.

**Kyle proposes a trade** (he'll proactively build one, even an N-way deal where
three or more players each complete a set in one swap) when it passes his accept
rules for him **and** for every other party from their seat — so he never pitches
a deal that would obviously be rejected and stall the game — **and** he isn't the
single lowest-value match in it. Among all the valid trades he could make, he
proposes the **best** one first: the one that completes his most valuable set,
breaking ties toward fewer parties and giving away less. He remembers deals that
were declined and moves on to the next-best rather than re-pitching them.

### Two deliberately odd rules (worth knowing)

- **The distance window counts *completers*, not parties.** A three-player trade
  where only two players actually complete a set is judged as a two-completer
  deal (window of one) — the third player riding along doesn't loosen the rule.
- **He protects his sets over everything.** Kyle will refuse the single best set
  on the board if taking it would force him to break a monopoly he already owns.

### What kyle-v3 still doesn't do

It never builds houses, so it completes monopolies but can't fully cash them in —
against strong opponents its games tend to stalemate to the turn limit. For that
reason it's deliberately **left out of the Elo ladder and the lobby for now**
(blocked in `versions/index.ts`'s `RATING_EXCLUDED`), exactly like kyle-v2. It
stays fully runnable for self-play and head-to-head; it just won't earn a ranked
number until a later version learns to develop property and its games resolve.
Building is the clear next step.

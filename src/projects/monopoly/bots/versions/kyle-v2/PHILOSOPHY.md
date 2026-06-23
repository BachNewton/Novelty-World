# Kyle Bot — Philosophy

A plain-language record of how the Kyle bot plays, written so anyone can read it
without reading the code. `policy.ts` is the exact wiring of what's described
here; when the strategy changes, this file changes with it.

The Kyle bot is its own family (`kyle-vN`), started from scratch. It begins
simple and grows one deliberate rule at a time.

- **kyle-v1** — the blank baseline: no opinions, defers to the game's safe
  defaults everywhere. (Kept frozen as the family's starting point.)
- **kyle-v2** — the first real strategy, described below.

## kyle-v2

kyle-v2 has opinions about two things: **buying property** (whether by landing on
it or winning it at auction) **and paying for it.** Everything else — jail,
trades, deciding when to build — it leaves to the game's safe defaults for now.

### Buying

- **If I land on a property and can pay cash for it, I buy it.** Always. No
  reserve, no second-guessing — even if it leaves me with almost nothing. Owning
  land is the whole game.

- **If I can't afford it outright, I only reach for my wallet when it completes a
  set.** "Completes a set" means:
  - it gives me a full color group (a monopoly), **or**
  - it's my **third (or later) railroad**.

  A second utility does *not* count — utilities earn too little to chase.

- **When a property completes a set but I'm short on cash, I mortgage other
  things to afford it — but I never sell houses.** I raise just enough to cover
  the price and stop the moment I'm in the green.

- **If even mortgaging everything I'm allowed to mortgage still can't cover the
  price, I pass** and let the property go to auction.

### Auctions

I treat an auction exactly like landing on the property — I want it, and I bid
for it the same way I'd buy it:

- **I'll bid up to the list price plus one $10 increment, and no higher.** That's
  my ceiling on every lot, whether or not it completes a set.
- **I pay with the same wallet I'd use on landing:** my cash, plus — *only* when
  winning the lot completes a set — the same mortgage raise I'd take to buy it on
  the board. So I bid on a loose lot purely out of cash (I never mortgage for a
  non-set, just like on landing), but I'll dig into the mortgage order to win a
  lot that completes a set.
- If a still-mortgaged estate lot is up, its 10% interest comes off what I can
  spend first.

### What I mortgage first (and what I protect)

When I need cash — whether to complete a set or to pay a debt I can't cover — I
always sell off my holdings in the same order, from least painful to most
painful. I treat the property I'm completing as already mine, so the set I'm
building is protected just like any other:

1. **Utilities** — they barely earn rent, so they go first.
2. **Loose color properties** (ones that aren't part of a full set I own),
   weakest color first. "Weakest" is by each color's long-settled value ranking
   (`GROUP_WEIGHT`): green and dark blue are cheapest to give up; orange and
   light blue are the most precious and go last.
3. **A lone railroad** — if I only hold one, it's not pulling its weight, so it's
   expendable here.
4. **Properties in a completed set**, again weakest color first. I only break
   into a monopoly when steps 1–3 weren't enough.
5. **Railroads I actually have a position in** (two or more) — these are the very
   last thing I'll ever mortgage.

The only time I'll let houses go is when I'm forced to settle a debt and I've
already mortgaged every bare property I have — at that point the game's default
sells buildings for me. I never sell houses voluntarily.

### Why it's this simple on purpose

kyle-v2 is an early step. It captures one clear instinct — *grab land, and fight
to complete sets without wrecking the rest of your board* — and nothing else.
Later versions will add the missing judgment (building, trading, knowing when a
buy is a trap) on top of this foundation.

**Known gap — it never builds houses.** Because kyle-v2 completes monopolies but
never develops them, it collects only base rent and can't actually close a game
out. Against strong opponents most games stalemate to the turn limit, which is
slow and uninformative — so kyle-v2 is deliberately **left out of the Elo ladder
and the lobby for now** (it's blocked from the rankings in `versions/index.ts`'s
`RATING_EXCLUDED`). It stays fully runnable for self-play and head-to-head; it
just doesn't get a ranked number until a later version learns to build and its
games resolve. The blank kyle-v1 keeps the Kyle family visible in the meantime.

### The two color tables

The bot carries two reference tables the rest of the archive has used for a long
time, and which later Kyle versions will lean on more:

- **`GROUP_WEIGHT`** — how *valuable* each color set is (drives the mortgage
  order above).
- **`COLORS_BY_WEIGHT`** — the *build* priority order (cheap, high-traffic sets
  first). kyle-v2 only uses it to break ties in the value ranking, but it's kept
  in full for the building logic to come.

# Monopoly — TODO

Known rules-correctness gaps and deferred work, roughly by consequence. Each
entry records **what the official rules say**, **what the engine does**, the
**root cause**, and the **fix shape** — so picking one up doesn't mean
re-deriving the analysis. When you close one, delete it (history lives in git).
Per the project's testing rule, a rules fix starts with a failing
`engine.test.ts` case run red before the fix.

## Bugs — wrong game outcome

These produce an incorrect result (a player cheated of money they're owed), not
just a missing convenience. Prioritize by stakes.

### Forced jail-fine landing skips the whole tile resolution

**Stakes: high** (an opponent can be cheated of full rent — potentially thousands).

`jailRoll` (`engine.ts:2410-2415`). When a player fails their third jail roll,
they're forced to pay the $50 fine and move out by the roll. If the $50 fine
*alone* tips them below $0 — but they can still recover by liquidating (so they
don't simply go bankrupt, which is handled correctly just above at
`engine.ts:2401`) — the engine calls `settleOrRaise(moved, "after-landing")` and
**skips `resolveTile` entirely**.

- **Rules:** pay the $50, move, then resolve the destination square normally —
  pay rent if owned, buy/auction if unowned, pay tax, draw a card, or go to jail.
  Paying the fine into the red doesn't waive the landing; you owe the fine **and**
  whatever the square costs, settling both through liquidation (or going bankrupt
  to the rent creditor if you can't cover both).
- **Engine:** the player teleports onto the square and **nothing about it is
  applied** — no rent paid to the owner, no tax, no card, no buy/auction, and they
  even **dodge the "Go to Jail" tile**. They settle only the $50 fine and the turn
  ends.
- **Root cause:** rent flows through `chargeToCreditor`, whose bankruptcy branch
  (`transferred = Math.max(0, payer.cash)`, credits the creditor `cash + payer.cash`)
  assumes the payer's cash is **non-negative** when the charge lands. Calling
  `resolveTile` while the player is already negative from the fine would credit a
  rent creditor `creditor.cash + (negative)` — i.e. the *creditor* loses money. The
  skip was the cheap way to dodge that broken interaction.
- **Fix shape:** settle the fine **first** (raise back to ≥ 0), **then** resolve
  the tile, so `resolveTile`/`chargeToCreditor` always see a solvent player. That
  means a new `RaiseCashResume` continuation that re-enters `resolveTile` with the
  dice total once the fine is settled — structurally the **same pattern as the
  bank-estate auction continuation** (a resume target carrying what to do next),
  carrying the dice total instead of remaining lots.
- **Frequency:** not exotic. Reaching the forced fine is ~58% of full jail stays
  ((5/6)³ failed-doubles); the binding constraint is just "< $50 cash but
  mortgageable assets at that moment," an ordinary mid-game squeeze.

### Chairman of the Board sends the estate to the bank instead of the owed players

**Stakes: low** (only fires near-broke; amounts are $50/head).

`payEach` (`engine.ts:2112`). The card makes the drawer pay every other player
$50. The common case (drawer can cover the full payout) is correct. But if they
can't cover `$50 × opponents` even after liquidating, they bust straight **to the
bank** (`goBankrupt(…, null)`).

- **Engine:** the owed opponents get **nothing**, the drawer's remaining cash is
  **destroyed** (a bank bust zeroes it to the void, paying no one), and the deeds
  go to a **bank auction** instead of to the creditors.
- **Rules:** this is a debt to *multiple players*, so the bank should not be a
  party — the money and estate belong to the owed players. **But the rules do not
  define how to divide an estate among simultaneous creditors** (you can't split a
  single deed, and at this net worth the estate is just a few mortgaged lots plus
  pocket change). This is a genuine gap in the *rules*, not only the engine.
- **Root cause:** the debt model is single-creditor; a simultaneous multi-creditor
  bust isn't represented, so the bank bust sidesteps it.
- **Fix shape — the goal is "keep it among the owed players," NOT perfect
  division** (which the rules leave undefined and isn't worth inventing over a
  near-worthless estate). Charge each opponent's $50 as its own leg through
  `chargeToCreditor` in a deterministic order (seat order from the drawer),
  mirroring how Birthday (`collectEach`) processes legs independently: earlier
  creditors are paid in full from cash/liquidation, the leg that tips the drawer
  bankrupt makes *that* creditor inherit the remaining deeds and leftover cash,
  later creditors get nothing. Order-dependent and arbitrary about which creditor
  lands the deeds — but deterministic and strictly better than the bank/void
  taking everything. Document the chosen order in the fix.

## Simplifications / missing features

Legal-but-incomplete: the outcome isn't *wrong*, but a rules-sanctioned option is
missing.

### Auctions use fixed $10 increments — no jump bids, no sub-$10 bids

`BID_INCREMENT = 10` (`engine.ts`) + the auction UI (`components/auction-panel.tsx`).
A bid must be the current high + exactly $10, and the first bid can't be under
$10. Official auctions are open-outcry with **no minimum and no fixed increment**
— open at $1, bid odd amounts, or jump to $300 to scare opponents off. This is
the one place a **human can't make a move the rules allow**. Fix: a bid-amount
input + relaxing the `applyBid` floor (the absolute-amount bid model already
supports arbitrary values).

### House / hotel shortage isn't auctioned

When the bank can't satisfy everyone wanting houses, official rules **auction the
scarce buildings** to the highest bidder. The engine serves them FIFO by
arm-order instead (the finite 32/12 supply itself is modeled correctly; only the
tie-break deviates). Long-standing "v2" TODO noted in `CLAUDE.md`.

## Edition nuance (correct for current rules, differs from classic)

Not bugs — the engine matches the current Hasbro edition. Listed only so the
choice is on record if a classic ruleset is ever wanted.

- **Income Tax flat $200** (`data.ts`) — the classic "$200 **or** 10% of total
  worth, your choice" decision is absent. This is the only one with real
  gameplay depth (it's an actual decision); the rest are just amounts.
- **Luxury Tax $100** and **School Fees $50** — modern values; the classic board
  printed $75 and $150.

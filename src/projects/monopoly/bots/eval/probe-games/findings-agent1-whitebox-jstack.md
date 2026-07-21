# Probe A1 — white-box threshold-solving of the jane-v20 J-stack opponent model

## Derived thresholds (WHITE-BOX, from bot.ts + index.ts)

jane-v20 = fable-v8 factory + 10 J levers. Confirmed by grep: **no human-counterparty
model** — no `humanAskOff`, `humanProposalMargin`, `humanThreatMult`, no
`botStrategy === null` branch anywhere. All human-facing pricing gaps are OPEN.

Key constants: acceptMargin 9.2976 · ACCEPT_MIN 1 · survivalFactor 2.5292 ·
distressSafeRatio 2.3448 · liquidityRiskGain 540.78 · rivalThreatFactor 0.29399 ·
denyFactor 0.12385 · holderDenialFrac 1 · deployabilityDiscount 0.70751 ·
liqGuardFrac 0.49784 · tradeTailFrac 0.5 · transformTailFrac 0.5 ·
standingThreatGain 2.1917 · selfLeadGain 0 (leadDefenseMult ALWAYS 1) ·
survivalEquityGain 1 · oppSurvivalBounded 1 · lifelineEquityGain 0.

### Exact solved boundaries

**B1 — wallet-peg (extraction + chargeSurplus).**
`premium = min(oppCash, floor(surplus − 9.2976))` in the F4 extraction engine and
`charge = min(excess, oppCash)` in `chargeSurplus`. The counterparty's **cash is a
hard cap on the ask**. Against a human this is a wallet X-ray with no offsetting
margin. Implication: an ask priced off `min(cash, …)` must be replaced by a
reservation prior for a null-`botStrategy` seat (the fable-v11 `humanAskOff` lever).

**B2 — rivalDeployability step function (J8).**
`mult = 1 + rivalDeployability × (levels − 3) × 0.1`, `levels = min(5, floor(cash / (lots × houseCost)))`.
So `rivalThreatCost` is scaled **0.7 / 0.8 / 0.9 / 1.0 / 1.1 / 1.2** at 0/1/2/3/4/5 levels.
Exact cash boundaries per color (perLevel = lots × houseCost):
brown 100 · light-blue 150 · pink 300 · orange 300 · red 450 · yellow 450 ·
green 600 · dark-blue 400.
=> **Holding cash below `perLevel` buys a flat 30% discount on the threat price of
any set handed to you.** For red, stay under $450; for green, under $600.

**B3 — distress fire-sale survives `survivalEquityGain`.**
`credit = min(cashIn, needToSafe) × distress × 2.5292 × equityMult`,
`equityMult = 1 − (1 − myPV/bestOppPV)` = `myPV/bestOppPV`.
`distress = 1` whenever `liquid ≤ worstBoardRent`, `needToSafe = 2.3448×worstRent − liquid`.
A seat with a hotel on the board (worstRent 1400–2000) is distress=1 at almost any
cash. Accept condition for selling me a bare lot for X:
`X − assetBase + X × 2.5292 × equity > 1`  =>  **X > assetBase / (1 + 2.53×equity)**.
At equity 0.4 that is **X > 0.50 × assetBase = 0.25 × book** for a mortgaged lot.

**B4 — `standingMult` / `leadDefenseMult`.** `leadDefenseMult` is dead (selfLeadGain 0).
`standingMult(opp) = max(1, 1 + 2.1917 × (oppPV/meanPV − 1))` — being **at or below
mean positionValue costs jane nothing**, so a human who parks value in mortgaged lots
(assetBase halves when mortgaged) and low cash is priced at the floor multiplier 1.

**B5 — `mortgageableTotal` excludes any lot in a group with a building.**
Building one house on a set removes the WHOLE set's mortgage value from `liquid`, so
`distress` jumps. Buying property also converts $1 cash into $0.50 of `liquid`.
=> distress/positionValue are both cheaply spoofable by a human without losing real value.

---

## GAME 1 (probe-a1-1.json) — offer log & ladders

### Ladder L1 — buying from a DISTRESSED seat (Sam, hotel-board distress, mortgaged lots)
| asset | book | mortgaged base | rung | result |
|---|---|---|---|---|
| Pacific Ave #31 | $300 | $150 | **$60 (0.20× book)** | **ACCEPT** (first rung tried) |
| Water Works #28 | $150 | $75 | $5 (0.03×) | decline |
| Water Works #28 | $150 | $75 | $15 (0.10×) | decline |
| Water Works #28 | $150 | $75 | $30 (0.20×) | decline |
| Water Works #28 | $150 | $75 | $32 (0.21×) | decline |
| Water Works #28 | $150 | $75 | $35 (0.23×) | decline |
| Water Works #28 | $150 | $75 | **$50 (0.33×)** | **ACCEPT** |
Flip: (0.23×, 0.33×] of book. Confirms B3.

### Ladder L2 — buying from a DISTRESSED seat (Jordan, $45 cash, all-mortgaged)
| asset | book | rung | result |
|---|---|---|---|
| Kentucky Ave #21 (mortgaged) | $220 | $20 (0.09×) | decline |
| Kentucky Ave #21 (mortgaged) | $220 | **$40 (0.18×)** | **ACCEPT** |
Flip: (0.09×, 0.18×] of book. B3 re-confirmed, 2/2.

### Ladder L3 — buying the RED COMPLETER from a healthy seat (Alex, $936 cash)
My cash at the time $741 => red levels = floor(741/450) = 1 => rivalDeployabilityMult **0.80**.
| asset | book | rung | result |
|---|---|---|---|
| Illinois Ave #24 | $240 | $300 (1.25×) | decline |
| Illinois Ave #24 | $240 | **$420 (1.75×)** | **ACCEPT — completes RED for me** |
Flip: (1.25×, 1.75×] of book. A completer that arms a human costs only **+$180 over book**.
With fable-v11's `humanThreatMult = 2` this would price at ≈2.5–3× book.

### Alex's inbound offers to me (the human-model gap, live)
- T36: `Kentucky→Alex, Indiana→Alex; Kyle +$73` — $73 for a lot I had just bought at
  auction for $230, arming Alex's red monopoly. Declined.
- T38: identical asset terms re-offered at **$75** (a +$2 walk-up on the decline).
  This is the transparent ~$9 accept bar + no `humanProposalMargin`. Declined.

### Ladder L4 — selling a NON-completing lot at a premium (over-caution check)
| asset | rung | result |
|---|---|---|
| Indiana #23 → Alex | $800 (3.6×) | decline |
| Indiana #23 → Alex | $1000 (4.5×) | decline |
| Indiana #23 → Alex | $1400 (6.4×) | decline |
Correct refusals — Indiana alone gave Alex 2/3 red, not a completion. **No over-caution.**

### Auction ladder (Indiana Ave, book $220)
Alex bid 120 / 160 / 200, dropped at $240. Cap ≈ 0.91× book with $1466 cash and one
red lot — **auction liquidity cap CLOSED, no ratchet-into-liquidation observed.**

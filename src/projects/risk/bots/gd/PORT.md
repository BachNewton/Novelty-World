# GD's Expert bots: what was ported

RISK: Global Domination's four Expert personas (Defensive, Continental, Aggressive, Stacker), ported from the game's IL2CPP dump (ISIL, with raw x86 where ISIL was unclear) as faithfully as our rules allow, flaws included. They are the yardstick for our own bots, so nothing is improved. The dump stays outside the repo.

## What GD's AI is

A greedy one-step scorer with no lookahead. Each phase picks a source, then a target, then an amount; every candidate is scored by the persona as a weighted sum of features, normalised by the method's maximum, and `GetChoice` takes one. At Expert, `GetChoice` always takes the top score (the earliest candidate on a tie), so the lower tiers' picks aren't ported. The four personas differ only in their weights (`personas.ts`, GD's `DAIStats`), except Stacker, which overrides most methods with code of its own.

## Ported, by GD method

| Ours | GD |
|---|---|
| `bot.ts` reinforce | `ClassicAIDeploy.ExecuteAction`: trade, then one chunk per decision: an amount (`GetIterativeArray(1, N)` scored by `GetDeployUnitsAmount`, jittered as `ApplyStepVariance` does), then a territory for it (`GetDeployCountry`), a random one when none scores above 0 |
| `bot.ts` attack | `ClassicAIAttack.ExecuteAction`: a source from the territories with 2+ armies, then a target among its enemy neighbours, blitzed to the end (`stopUntil` 0); the attack ends when no source, or the chosen source's best target, scores above 0 |
| `bot.ts` occupy | the attack's `moveUnitsAI`: `GetIterativeArray(min(u−1, 3), u−1)` scored by `GetAttackMoveUnitsAmount` |
| `bot.ts` fortify | `AIFortify.ExecuteAction` with `ClassicAIFortify`'s wrappers: one source, one target among the territories joined to it through the bot's own (`MapManager.GetConnectedCountries`), one amount |
| `persona.ts` `BaseScorer` | `AIPersona`: `GetDeployCountry`, `GetDeployUnitsAmount`, `GetAttackSourceCountry`, `GetAttackTargetCountry`, `GetAttackMoveUnitsAmount`, `GetFortifySourceCountry`, `GetFortifyTargetCountry`, `GetFortifyMoveUnitsAmount`, their `…MaxScore`s, `NormalizeScore` |
| `persona.ts` `StackerScorer` | `StackerAIPersona`'s overrides (everything but the attack target and trading) |
| `bot.ts` `personaNow` | `StackerAIPersona.EndTurn`: at the end of a turn holding more armies than all other seats together, Stacker becomes Aggressive for the rest of the game |
| `helper.ts` | `AIHelper` and `ClassicAIHelper`: battle success (three overloads, min, max), border weakness, enemy strength, continent ownership and loss, steal continent bonus, elimination chances, leading player and dominance, country power, desperate mode, attack-turns limit, the cards and continent "superior goals", `ScoreItems`, `CutOff` |
| `choice.ts` | `GetChoice` (Expert), `GetIterativeArray`, `ApplyStepVariance` |
| `odds.ts` | `BlitzC.GetCalculatedOrEstimatedAttackWinChance` (Balanced Blitz from `blitz.ts` up to 2000 armies, `AppleWinChanceBalance` of the fitted estimate above) and `GetCalculatedOrEstimatedIdealAttackUnits` |
| `cards.ts` | `GameControlCards.GetBestCardMatch` and `GetCardsFromArrayByType` (Fixed values), and the +2 to the first owned card in the set's order |
| `board.ts` | GD's map order and link order (its ties go to the first candidate visited), its income (`UnclampedTotal`), `nextPlayer`, `totalUnits` |

GD keeps three lists per turn, cleared at the end of each fortify phase: territories captured (`countriesConquered`, which also decides "desperate mode"), attacks made (`_attackCount`) and territories placed on (`AIDeploy._lastCountries`). The bot derives them from its history (`bots/history.ts`). Stacker's switch to Aggressive is the only state GD carries across turns that changes play; the bot finds it by replaying the board at each of its turns' ends.

## Left out, and why

- **Alliances.** Both alliance reads in `AIPersona` are dead for bots (bots never form alliances).
- **Other tiers and personas.** Only Expert's four. A tier is only `GetChoice`'s k and t, the attack-turns multiplier and the persona pool.
- **Claim, capital and objective terms.** Our rules deal the territories, have no capitals, and play World Domination, where `ClassicAIObjectives` adds no objective and every objective term is 0.
- **Pacing.** `AITime` only waits, apart from a real-time watchdog that forces the phase on.
- **`GetAttackHumans`.** No classic persona method calls it. Who is human is read only by the fortify target's human ratio, whose weight is 0 in all four personas; it is ported anyway, from the seam's `humans`.
- **Float32.** GD scores in 32-bit floats; the port computes in doubles, keeping GD's 32-bit constants where they matter (thresholds, 1.85, 0.45, 1.8). Only near-ties can differ.
- **Unity's random stream.** GD's draws come from Unity's global generator; the bot draws the same number of values, in the same order, from its seed, so the distributions match but not the values.
- **GD's per-frame caches** of the leading player and dominance ratio, and its battle-odds caches: a cache can change an estimated (over 2000 armies) chance only at the balancing's edges.

## Where our rules make GD's AI act differently

- **Forced trades come first.** GD trades at 5+ cards before each deploy chunk, so after an elimination with 8+ cards it can trade, place, and trade again; our engine takes every forced trade before any placement (`CARDS-5`, `ELIM-3`). The sets chosen are the same.
- **The move-in's board.** Our engine moves the minimum in with the capture; GD asks the AI before moving anything, with the captured territory already the bot's. The bot puts the board back as GD has it (below).

## Open readings

Each is the likelier reading, marked in the code where it lives.

1. **Map order.** GD visits territories in its map's array order; the asset gives ids (alphabetical) and each territory's links, and the array is taken to be in id order. It decides only ties.
2. **`GameManager.players`' order** is taken to be the turn order. It decides only ties for the leading player.
3. **The move-in's moment.** GD's move-in amount is scored with the captured territory owned by the bot and holding no armies, and every surviving attacker still in the source. Whether the defenders' territory shows 0 at that moment is inferred from the order of `OnAttack`'s writes.
4. **`currentRound`.** GD adds the first-turn bonus to a seat's income while `currentRound == 0`; the bot takes that to be "the turn order hasn't come round", as our engine counts rounds.
5. **The continent goal's threshold.** `ClassicAIHelper.GetContinentSuperiorGoal` passes the persona's success threshold (0 to 100) where the odds search expects a chance. The search clamps it (`Math.Clamp(x, 0, 1)`, confirmed in x86) to 1, so its "ideal" is the fewest attackers sure to capture; balanced odds reach exactly 1, so the search ends. Ported as GD does it.
6. **Voluntary trades** are made once per round (`lastCardTradeRound < currentRound`), which the bot reads as "no trade yet this turn".

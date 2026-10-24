# Stalled games: why bot tables run to the turn cap

An investigation, not a plan: what the games that reach the turn cap actually look like, set
beside the games people have played online, and what causes them. The diagnosis is settled
for rule-v4 to rule-v6 (an experiment moves the cap rate from 15% to 0); that it carries to v7
and v8 is inferred from their code and their measured cap rates, not traced game by game.
Nothing here changes a bot or the scoring; the fixes at the end are proposals to measure.

## Units

The cap is `DEFAULT_MAX_TURNS` in `eval/cli-args.ts`: **600 player-turns**. A "turn" in the
harness, in the online game row and in every number below is the engine's turn counter, which
counts one seat's turn (`TURN-2`); eliminated seats are skipped, so a round is as many turns as
seats still alive. 600 turns is 120 full rounds at 5 players and 100 at 6.

## The human games

Every online game, from `risk_games` and `risk_moves` (read-only). All three finished games are
five players, two people and three bots, and the same person won all three:

| Game | Seats | Winner | Length (player-turns) | Rounds, about |
|---|---|---|---|---|
| G4FR | Bot Killer, Kyle, rule-v3, gd-stacker, gd-continental | Bot Killer | 98 | 20 |
| 9VFL | Bot Killer, Kyle, rule-v5, rule-v4, rule-v3 | Bot Killer | 90 | 18 |
| YUY4 | Bot Killer, Kyle, rule-v6, rule-v6, rule-v5 | Bot Killer | 75 | 15 |

One more (ZYK4: Ell Bell, gd-defensive, Kyle, three players) is in play at turn 14. There are
no bot-only online games. A human game lasts a sixth of the cap.

Traced (`risk:trace -- --online`), the three look alike: nearly every turn captures something,
the armies lost each turn roughly match the armies earned, so the board holds a steady 100 to
190 armies, the biggest stack stays at 10 to 25 (the exception is v4's 53 on one territory in
9VFL, the bot stacking that v6's `reinforced` fix answered), and a seat falls every 15 to 25
turns.

## Bot games' lengths

From the ratings cache's records (wins, losses and capped draws per seed group): of the
gauntlet field's matchups among rule-v4, v5, v6, gd-defensive, gd-stacker and greedy, **no
game at 3 or 4 players capped** (2,100 games), 3.1% at 5 players and 9.8% at 6. The worst are
gd-defensive alone among v4s at 6 players (64%) and v5 alone among v4s (44%). Every matchup
with no rule bot from v4 on (the GD personas and greedy among themselves) never caps.

Surveyed here (`risk:trace -- --survey`, 48 games each, one bot in every seat, a seed per game):

| Table | Capped | Mean turns | Median | Decided games' mean |
|---|---|---|---|---|
| 3 × rule-v6 | 0% | 31 | 27 | 31 |
| 4 × rule-v6 | 0% | 49 | 49 | 49 |
| 5 × rule-v6 | 10% | 156 | 88 | 105 |
| 6 × rule-v6 | 15% | 244 | 194 | 183 |
| 6 × rule-v4 | 42% | 418 | 537 | 288 |
| 6 × greedy | 0% | 80 | 80 | 80 |
| 6 × gd-defensive | 0% | 90 | 86 | 90 |
| 6 × gd-stacker | 0% | 75 | 70 | 75 |

The bot-log's own: v7 among v6s at 5 players 119 turns, 3.5% capped; four v7s and a v6, 229
turns, 14%; v7 ladder matchups 4 to 23%; v8's first weights 421 turns, 21%. A decided 5-player
v6 game (median 88) is as long as a human one; the capped games are a second mode, not a long
tail of the same game (`bot-log.md`, "How 6-player games end": a flat 8% of the games still
going end in each 50 turns).

## What a capped game looks like

Two kinds, both all v6 (the lines replay them: a game is a pure function of its seed and seats).

**The frozen table** (`risk:trace -- --mirror rule-v6 6 --seed stall6-14`): all six seats alive
at turn 600. Every seat keeps one or two huge stacks and a few thin territories. Each turn a
seat takes one or two 1-army territories with a detachment, for the card, and loses 2 to 3
armies doing it, while it earns 5 to 6; the stacks never fight. The board's armies climb
steadily, 250 at turn 50, 990 at 300, 1,930 at 600, and the biggest stack from 32 to 361 (a
seat with one territory and 361 armies on it). Nobody holds a continent for long. The stacks
walk: one seat fortified its 236 armies Alberta → Alaska → Northwest Territory on successive
turns, another moved 136 South Africa → Madagascar, each into a corner away from the other
stacks, and a stack of 153 moved into a 1-army territory and back out by fortify the same turn.
Nothing is stuck in the engine sense: every move is legal and chosen, and no seat loops on a
decision.

**The churning table** (seeds `stall-4` and `stall-14` at 5 players, `stall6-1` at 6): one or
two seats fall early, then four seats fight on for 400 turns. They capture 2.5 to 3.8
territories a turn and trade a set every three turns, but every capture is of a thin territory,
the armies lost (6 to 7 a turn) stay just under the armies earned (7), and the board's armies
creep from about 350 to 800. Each survivor holds 100 to 250 armies in stacks of 50 to 200, so an
elimination would mean breaking a stack, which no one does.

Against the human games: the same capture rate, but people and the bots facing them lose about
what they earn and break stacks; the stalled tables bank income in stacks no one attacks.

## Diagnosis

**A bot-strategy problem, in the rule bots' evaluation, from v4 on (high confidence for v4 to
v6).** The term that does it is the **border loss**: every opponent's believed best blow or
sweep against me, weighted by its aim at me, charged at `borderWeight` (`rule-v6/opponents.ts`,
`evaluate.ts`). It sums over the opponents, so it grows with the table while my share of the
power shrinks, and it is cut most by stacking up and by never thinning out. Attacking a stack
costs armies and opens me to everyone else's blows, so with four or five opponents each seat's
best move is a card capture and a bigger stack. The evidence, 48 six-player games of all-v6
each, against 15% capped and 244 turns:

| v6 with | Capped | Mean turns |
|---|---|---|
| `borderWeight` 0.5 (as seated) | 15% | 244 |
| `borderWeight` 0.25 | 0% | 61 |
| `borderWeight` 0.1 | 0% | 52 |
| `borderWeight` 0 | 0% | 46 |
| `vulnerabilityWeight` 0 | 33% | 253 |
| `vulnerabilityWeight` 0.5 | 42% | 348 |
| `idleWeight` 1 | 29% | 317 |
| the small table's preferences at 6 players | 38% | 310 |

`borderWeight` 0 also ends every 5-player v6 game (0%, 46 turns) and every 6-player v4 game (0%,
50 turns, against 42%). No other preference does it, and the 5-to-6-player preferences being
untuned isn't the cause (the tuned small-table ones stall more at 6 players, with nearly the
same `borderWeight`). That 3 and 4 players never stall fits the term's sum over opponents.
These are small samples: 0 of 48 against 7 of 48 is clear, the differences among the rows that
still stall are not.

v7 carries the term in everything but its search: it chooses its placement among v6's plans
by playing out replies and scoring the end on a share of power with no border term, but the
plans are v6's, its attacks, move-ins and fortifies are v6's, and half its imagined opponents
play as v6; v8's network learned from v6's games and inherited the hoarding (its retrain counted a capped
game as a loss and mostly cured it). The GD personas and greedy price no opponent's blow, so
they keep attacking and never cap.

**The rules make it possible, not cause it.** Fixed card values (`CARDS-6`, the owner's ruling,
as GD's ranked games play) give no escalating sets to force a showdown, and Balanced Blitz makes
an attack on an equal stack a sure, costly exchange, so a table that won't attack stacks can bank
armies for ever. Escalating sets would end these games, but it is a different game from the one
GD's players know, and people at these tables don't stall: it is the bots' choice.

**Not a measurement artifact, but the scoring hides it.** A capped game is discarded from the
SPRT and the Elo fit. That costs results (the bot-log measured a lower cap saves almost
nothing), and it can flatter a bot that stalls: a seat that hoards among others who fight wins
the decided games, and the games where its hoarding froze the table vanish. v8's first weights
showed exactly that (twice par alone among v6s, losing badly as four against one).

## What to try

1. **Measure `borderWeight` for strength, not only length.** A table that never caps is good
   only if the bot still wins: gauntlet `rule-v6~{"borderWeight":0.25}` against v6 at 5 and 6
   players, both mixtures, and against the field, and see which way the strength goes. If a low
   weight costs strength, the term needs reshaping rather than shrinking: for instance an
   opponent's blow counted against me only while no other target suits it better (the blows of
   the opponents I don't border, through a third player, are already in it), or the sum
   normalised by the number of opponents so the term doesn't grow with the table.
2. **Price hoarding.** Armies in a stack no one attacks are worth less than their count to the
   share term. A term for armies beyond what a front needs (as `idleWeight` does for interior
   armies) would give a hoarding seat a reason to spend.
3. **Report how a pairing's capped games split.** At the cap, every seat's territories and
   armies are known; showing whether the candidate side led on power when the cap struck would
   tell whether a candidate stalls to survive. Scoring capped games as losses for everyone (as
   v8's retrain did) or adjudicating them by power would change what every past verdict
   measured, so it is the owner's ruling, not a fix to make quietly.
4. **Keep the cap at 600.** A decided game lasts up to about 300 turns at 6 players; the cap is
   not cutting real games short, and lowering it saves almost nothing.

`risk:trace` (`eval/trace.ts`, `eval/trace-cli.ts`) traces a game turn by turn, an online game
from its exported move log, and surveys a seating's lengths with the capped games' replay lines.

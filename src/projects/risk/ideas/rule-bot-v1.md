# Risk bot v1: what experts do, and the bot that does it

The design of v1, the first Risk bot (`bots/rule-v1/`): a rule-based player that searches where expert play needs lookahead. It builds on `risk-bot-ai.md`, which surveys AI methods and settled on "hand-written heuristic bot first, tuned by evolutionary search, search and learning later". That survey covers the academic bots (Carr's search, Lux and Domination, Wolf, Lütolf), so they are cited here only for a decision rule they contribute. Everything is filtered through `RULES.md`, which is RISK: Global Domination's (GD's) ranked game: 3 to 6 players; territories dealt and starting armies placed at random, so the game starts at the first turn; later seats get 1 to 3 extra armies on their first turn; Fixed set values on GD's deck (13 infantry, 14 cavalry, 15 artillery, 2 wilds: three infantry 4, cavalry 6, artillery 8, one of each 10), the +2 once per traded set; traded cards straight back into the deck; trades only before placing, a hand of 5 forced down to 4; the card drawn as the turn ends; a mid-turn trade when an elimination leaves 5 or more cards; blitzes resolved by Balanced Blitz and single battles by fair dice; a defender who always rolls the most dice; one fortify along a connected path. The bot sees only its seat's view.

**The priority is strength, not speed.** The strongest bot that can be justified comes first. Speed comes from design: everything the bot computes is exact and cheap (odds tables, path convolutions, a solved card model), and the one expensive part that could take more work, sampling a plan's outcomes, is a fixed work count, never a time, so the same view always gives the same move.

Odds quoted here were computed exactly while writing this doc, from `blitz.ts` (the procedure the engine resolves blitzes with). Throughout, "a against d" means a armies able to attack (the source holds a plus what it keeps back) against d defenders.

---

## 1. How experts play GD's ranked game

Two rules shape expert play here, and both point the same way. **Fixed set values** make cards a steady income rather than the game: a set never grows, so a card is worth about the same in the last turn as in the first, and the board (continents, territory count, army totals) decides the game. **Balanced Blitz** makes the favourite's fight a certainty and the long shot impossible, so armies are worth most in big stacks, near-sure attacks cost nothing in risk, and a thin border is simply lost to any stack beside it.

### Balanced Blitz

GD resolves a blitz from the odds of the whole fight, reshaped: a side with 5% or less never wins, the favourite's chance is pushed up, the luckiest 10% of results at each end is cut, and results bunch toward the typical one (`COMBAT-8`; the parameters are SMG's own defaults in its published dice code, [`smgstudio/risk-dice`](https://github.com/smgstudio/risk-dice), `BalanceConfig.cs`). SMG's description: it "turns losing battles like 10 vs 5 from a statistical possibility into an outright impossibility, and also limits how many troops you could lose in such a scenario" ([*Blitz Dice Updates*, Steam dev diary](https://store.steampowered.com/news/app/1128810/view/640181878351987970)). What players do with it:

- **Certain attacks are cheap, and they are certain.** A stack of 4 (3 attacking) always takes a 1-army territory, losing 0.13 armies on average; 5 attacking always take 2, 6 always take 3, 8 always take 4. Fair dice would give 92%, 89%, 86% and 89%. "Grandmasters blitz 4v1, because it's 100% blitz, but only 91% true random" (Mod Sterling, [GD wiki, *Dice, Blitz and Slow Roll*](https://risk-global-domination.fandom.com/wiki/Dice,_Blitz_and_Slow_Roll)). The community's table of the smallest certain stack ([friendsofrisk.com, *Blitz 100% chart*](https://friendsofrisk.com/blitzchart/)) matches ours: about defender + 6 from 5 defenders up.
- **Commit only what makes it certain.** A blitz is fought by the armies the attacker commits (the source less the number it keeps), and the balanced odds are those of that fight. "Blitz with slider to the minimum troops to retain 100% win is usually the best, safest option in balanced blitz setting" (dholland, [Steam](https://steamcommunity.com/app/1128810/discussions/0/3781372783230172348/)); overshooting is "a small fixed tax" ([friendsofrisk.com, *Full send vs blitz slider*](https://friendsofrisk.com/fullsend/)). Losses barely rise with the armies committed (3 against 1 loses 0.13 on average, 20 against 1 loses 0.16), so a minimal blitz costs nothing, and the armies held back are never at risk; the move-in then decides how many follow.
- **The underdog rolls; the favourite blitzes.** Single battles are always fair dice. "If an attack has above 75% chance to win, you'll get significantly higher odds by blitzing, and if it has below 25% you'll get significantly higher odds by slow rolling"; "many Grandmasters slow roll 2v1 because they have a 41% chance of winning, rather than blitz which only gives 37%" (Mod Sterling, above; dholland agrees). The two mix: roll single battles until the odds favour you, then blitz. Played that way, 10 against 10 captures 66% of the time, against 61% for a blitz and 57% for dice alone; 6 against 6, 60% against 53% and 52%.
- **Defence is a matter of ratios, not walls.** A territory facing a bigger stack is lost; one facing a smaller stack holds against a blitz, but not against slow rolling, whose fair odds keep the long shot alive (5 attacking 8 is 8% blitzed, 25% played well). "Try to attack armies which are half the size or less than you" (darshao's [beginners' guide](https://steamah.com/risk-global-domination-beginners-guide/), which recommends Balanced Blitz and Fixed). Big stacks beat everything near them, so armies spread one or two to a territory are a gift to the neighbours.

### Fixed cards

- **A card is worth about 2.9 armies, all game.** Conquer Club's flat-rate games use the same values: "Each card is worth a third of that, or 2.823", and "it is not as important to take cards as it would seem unless you can get it for 1 or 2 troops" (DoomYoshi, [*Expected value for spoil troops in Flat Rate*](https://beta.conquerclub.com/forum/viewtopic.php?p=4677119)). Our model of GD's deck (§2, hand math) gives 2.87 a card for a player who draws every turn and trades well. Under Balanced Blitz a card from a certain capture costs 0.13 armies, so the card is nearly always worth taking; one that needs a real fight usually isn't.
- **Cards matter less than the board.** "fixed cards not as much important as in progressive cards"; "players who get continents first have the highest chances to win the game" (Risk4Ever, a GD Grandmaster, [*How to actually win fixed cards game*](https://www.youtube.com/watch?v=0Zh8SL3srrY)). In flat rate a set is "an occasional boost of extra troops… the Territory Bonus and/or Control Bonus are still important" (Artimis, [Conquer Club](https://www.conquerclub.com/forum/viewtopic.php?t=72581)). Advice that tells players to ignore continents and live on cards is written for card modes whose sets grow, not for this one.
- **Trade when you can, unless the hand is about to get better.** "aside from a few exceptions, you should cash a set of spoils whenever you have that option" (StevenJoyce); "I always take 3 blues or mixed set straight away" (nippersean); "Wait for a rainbow only in situations where you have no pressing need for the extra troops" (flexmaster33), all in [*When to turn in flat-rate spoils*](https://www.conquerclub.com/forum/viewtopic.php?p=2320448). Domination's AI holds unless it has the most cards, is pressing an attack or is under a common threat, and values a fixed set at 8 ([`AIDomination.java`](https://github.com/sdyura/domination), `getTrade`, `tradeIn`). The disagreement is about the low sets: three infantry is 4 now, or 10 later if a cavalry and an artillery come.
- **Continents first; North America is the prize.** Australia is what "most people go for early"; North America is "arguably the best continent… 5… just 3 borders"; with a big enough lead in fixed games, "the dominating player captures Europe, North America, South America and Africa" for 24 a turn (GD wiki, [*Classic Map*](https://risk-global-domination.fandom.com/wiki/Classic_Map)). "Use your first and second set trade to get and secure one bonus", and "do not try to hold too much" (Dako, [Conquer Club spoils guide](https://www.conquerclub.com/forum/viewtopic.php?f=6&t=138573)).
- **Break bonuses before repairing your own.** "99% of the time you break an opponent's Bonus Territory before you repair your bonus territory" (CaptainCanadaEhh, a former Grandmaster, [Steam](https://steamcommunity.com/app/1128810/discussions/0/573770913622907062/)); "Keep denying continent bonus" (IvanErtlov, an SMG developer, [Steam](https://steamcommunity.com/app/1128810/discussions/0/1743393963181047545)); "If I can break a bonus now by taking 4 armies from a red set, I'll do so" (stahrgazer, flat-rate thread above).
- **Balance of power: hit the strongest, and kill only when it favours you.** "the balance of the game is the most important thing in fixed card games… unless you're the strongest player"; "it makes the most sense to target the strongest player or the one who can become the strongest by holding the biggest continent"; an elimination is weighed by whether it "will more favor you or your opponents" (Risk4Ever, above and [*Stop Turtling*](https://www.youtube.com/watch?v=H9OLbExP7KQ)). Domination's AI, in fixed games, is "more lenient with more players" before it calls a common threat, and only tries unlikely eliminations when it already leads (`AIDomination.java`).
- **Take a card every turn, cheaply.** Domination's `ensureRiskCard` and Lux's `attackForCard` take one territory a turn when nothing else is planned ([Lütolf 2013, §2](https://ai.dmi.unibas.ch/papers/theses/luetolf-bachelor-13.pdf)); Balanced Blitz makes that free from any stack of 4 beside a 1.
- **Patience wins long games.** Fixed games are long ("some games going over 3 hours", ObamaEpstein, [Steam](https://steamcommunity.com/app/1128810/discussions/0/600769605204456014/)); "most of the slow-paced games with flat rate are won by the most patient player" (Dako, above).

What these sources leave open: no GD source discusses the forced trade at 5 cards after an elimination, the deck refilled by traded cards, or how play differs between 3 and 6 players. Reddit and Discord, where most of GD's ranked community talks, could not be read for this.

---

## 2. The v1 bot, decision by decision

### Architecture in one paragraph

The bot is a **turn planner over expert-shaped candidate plans**, scored by an evaluation with a one-round **threat model** of the opponents. At every decision it generates a few dozen whole-turn plans, each a coherent intent (hold, take a card spot or break a continent, complete a continent, eliminate a player), each with its own placement. Plans are generated by the expert rules, which keeps the candidate set small, as Carr's pruning to frontier placements did ([Carr 2020](https://arxiv.org/pdf/2009.06355)). It costs out each plan exactly with the attack odds, scores the turn's possible ends, and commits to the best. A bot is a pure function of its view, so it plans afresh at every decision (each placement, each attack, each move-in): checking the plan against what happened after every attack is free. The small decisions (which cards, how many to move in, the fortify) are cheap rules or short enumerations scored by the same evaluation, so the bot's decisions can't disagree with each other: the Monopoly bot's "one yardstick" lesson (`monopoly/bots/CLAUDE.md`).

### Shared tools (built once, used everywhere)

- **Attack odds (exact, cheap).** For each (a, d), the distribution of how the attack ends, played the best way: a blitz from Balanced Blitz's odds (`blitz.ts`) when that is the likeliest way to the capture, otherwise one fair battle with every die and the best play from wherever it leaves the fight. So the bot's odds are the slow-roll-then-blitz play GD's Grandmasters use, worked out exactly, and a favourite always blitzes. Rolling is weighed up to 60 armies a side; past that the fight is never close for long. A fight of more than 300 armies in all is worked out at the same ratio scaled down to 300, its survivors scaled back up: an exact balanced fight costs its two sides multiplied, a stalemate's stacks of hundreds would make one decision take seconds, and a fight that large is decided by its ratio. Memoized by (a, d).
- **Blitz commitment.** The fewest attackers whose blitz is as sure of the capture as committing them all (within half a point), found by halving; when no smaller blitz is, all of them. The rest stay home whatever happens, and the move-in decides how many follow.
- **Path run (exact, cheap).** The distribution of armies arriving at the end of a capture path, moving all but one forward each time, as a convolution of attack outcomes along the path. One stack's chance of clearing defenders [2, 1, 1, 3] in one go: 10 armies 83%, 11 93%, 12 98%, 14 certain (fair dice: 52%, 63%, 74%, 88%). A run's capture of each territory is atomic under Balanced Blitz: stopping a blitz part way is a different, smaller fight with worse odds, so the bot never stops a blitz to look again; it commits the sure amount, or everything, and re-plans after each capture.
- **Hand math (exact, solved once).** A hand is worth the armies it will become. The bot solves a small decision process over the hand's symbols, once, at load: each turn its holder may trade one set (must, at 5 cards), then draws a card if it captured (90% of turns, the objective model), drawing from the cards not in the hand; an army next turn is worth 0.9 of one now. Its value function prices any hand, and its policy is the trade rule. It trades a 10, 8 or 6 at once, holds three infantry (4 now, or 10 if a cavalry and artillery come), and holds two of a symbol with a wild (a 10 with any other card). A hidden hand of n cards is priced by averaging over every hand of n the deck allows: 3 cards hold a set 42% of the time, 4 cards 82%, 5 always (`CARDS-4`). In the long run a card is worth 2.87 armies.
- **Income model (exact, cheap).** Each player's next reinforcement: territories, held continents, the set its hand is expected to trade (by the policy, over the hands it could hold), and a later seat's first-turn bonus while it is still to come.
- **Elimination planner (cheap).** Given an attacker, a victim and the attacker's armies to place, it finds attack routes covering all the victim's territories from the attacker's stacks. Following Domination, each connected group of the victim's territories is entered from the launch stack that gives the best run and covered in an order that keeps the run a path where it can, possibly through one third player's territory ([`AIDomination.java`](https://sourceforge.net/p/domination/code/HEAD/tree/Domination/src/net/yura/domination/engine/ai/logic/AIDomination.java), `findEliminationTargets`, `eliminate`). It then allocates the placeable armies across launch stacks in chunks, greedily maximizing the chance every path succeeds; paths from different stacks are independent, so the kill's chance is their product. The same planner takes any set of targets: a card spot, a continent's missing territories, a victim.

The elimination planner is used **twice**: for my own kills, and in the threat model, to ask whether each opponent can kill me (or someone else) before my next turn. That second use, from each opponent's seat with their expected reinforcements, is what makes the bot see "I am a target" and "B will be killed by C before I can get there".

### 2.1 Setup

None: the deal and the starting armies are random (`SETUP-4`, `SETUP-5`). The first decision is the first player's first reinforcement.

### 2.2 Card trading

**Rule.** The trade is part of the turn plan. When a set may be traded but needn't be, the bot plans the turn both ways, holding and trading its chosen set, and keeps the better. The evaluation prices the hand by the solved hand model at 0.9 an army, against the trade's armies on the board now, so holding wins only when the hand is about to get better and the armies have no use this turn; a plan that needs the armies (a kill, a continent, a threatened border) trades. That is the experts' "cash whenever you have that option" with flexmaster33's exception, decided by the numbers rather than a rule.

- **At 5 cards** the trade is forced (`CARDS-5`); only the choice of cards remains.
- **Mid-turn forced trade (`ELIM-3`).** When a kill leaves 5 or more cards, the trades come at once and are placed before the next battle: a kill whose cards force a trade pays for its own next step.
- **Which cards.** The set whose armies, plus 2 if it pictures a territory of mine (more if that territory faces an enemy), plus what the cards kept are worth by the hand model, come to most. So a wild is kept unless it is what makes the set a 10, and the +2 goes on the front.

**Cost.** Cheap: the hand model is solved once; a trade decision is two turn plans.

### 2.3 Reinforcement placement

**Rule.** Placement belongs to the plan:

- **A capture plan** (a card spot, a continent's missing territories, a kill) puts on its launch stacks what the capture planner allocated. Each plan comes in variants: placing until its chance reaches 90%, or 99%, with the rest going to defence, and placing every army that still helps. The evaluation picks. Under Balanced Blitz a few more armies often turn a likely run into a certain one (scenario 1's run: 11 armies 93%, 12 98%, 14 certain), so the near-sure variant is the one a kill usually takes.
- **Defence allocation** spreads the remainder in chunks where each most cuts the expected loss to the strongest adjacent attacker (with its reinforcements), a held continent counting its bonus over the income horizon. Stacks get reinforced, not shells.
- **The +2 bonus** goes on its pictured territory (`CARDS-7`), which the card choice steered toward the front.

**Cost.** Cheap given the plan: a greedy loop over chunks.

### 2.4 Attack selection: the turn planner

**Candidate plans** are generated by the rules each decision:

1. **Hold.** No attack, the armies stacked on the front or spread for defence.
2. **Single captures.** The eight best single captures by chance and by whether they break a continent: card spots, continent breaks, consolidation.
3. **Continent completion.** For every continent missing at least 2 and at most half of its territories: take them all this turn. Every continent, not just the small ones: under Fixed values a continent's bonus is the income that lasts, and the evaluation weighs what it costs and whether it can be held.
4. **Kill runs.** For each opponent the elimination planner gives a real chance.

Two filters shape the set, both from §1:

- **Card-less buffers.** At 5 or 6 players, no plan finishes a victim with no cards. Such a kill pays nothing but territory, and the victim absorbs the other players' attacks; Domination drops card-less elimination targets.
- **Common threat.** When another player is the common threat (§3), everyone else is my ally against it: their territories are taken only for the turn's card, never to break their continent, and they are finished only when their cards force a trade at once. "Target the strongest player" (Risk4Ever); Domination: "don't break a continent if there is a common threat".

**Scoring a plan.** Each plan is played against the attack odds to the end of the turn, scored by the evaluation (§3) with the threat model applied.

- **Exact path.** A plan is scored on its success and its likeliest failure (routes better than even succeed, the rest stop where they likeliest stop), weighted by its exact chance. On failure the plan still ends in a scored position, never "infinitely bad": Honary's plan B (Total Diplomacy) is part of the plan.
- **Sampled outcomes (the work knob).** With n samples, a plan is instead scored on n sampled ends, each capture drawn from the attack odds. Zero samples is the default; whether more pays is a measurement (`bot-log.md`).
- **The kill commit.** A kill is committed when it beats the best plan that isn't a kill (by `killCommitMargin`, 0).

**The attack itself.** The plan's next capture is fought from the strongest of my territories beside it. If the best play of that fight starts with a single battle, the bot rolls one with every die; otherwise it blitzes with the commitment above. Then it plans again.

**Endgame.** With two players left the evaluation is my share against one opponent, so every attack whose odds favour me improves it: big fights favour the attacker (20 against 20 captures 75% of the time played well, 30 against 30 80%).

**Cost and scaling.**

| Part | Cost | Work unit | Note |
|---|---|---|---|
| Plan generation | cheap | about 10 to 30 plans | all, every decision |
| Plan costing | cheap, exact | path convolutions, memoized | none: exact |
| Elimination planner | cheap | one route per victim, chunked allocation | alternative routes would find kills the greedy route misses |
| Threat model | cheap | opponent × victim kill checks | every opponent, every victim |
| Sampled outcomes | budgeted | samples per plan | 0 by default; raised only if a gauntlet shows it pays |

### 2.5 Occupy amounts (move-in after capture)

**Rule.** The totals worth weighing (all, half, the minimum, the minimum plus 2) are each scored by the best plan from the board they leave. That reproduces the experts' and Domination's rules without stating them: everything forward when the run continues through the captured territory ("you can't leave armies behind", Europa, Total Diplomacy); the minimum into a territory with no enemy beside it; everything out of a source left with none (Domination's `getBattleWon`). After a blitz the minimum is 3, or all that can move (`COMBAT-6`), so a sure 3-army blitz on a card spot moves its 3 in and the source keeps the rest.

**Cost.** Cheap: four plannings.

### 2.6 Fortify (one move along a connected owned path)

**Rule.** Every move worth considering (all or half of a territory's spare armies, toward a territory with an enemy beside it) is scored by the evaluation's change, and the best is taken, or none if nothing improves the score. Moving a stack to the front for next turn's kill counts, because the evaluation includes next turn's kill opportunity. Holding cards, a shell an opponent could take, and me with it, is covered: the threat model makes that a kill risk.

**Cost.** Cheap: at most 40 candidates, each one evaluation.

---

## 3. Evaluation and heuristics

### Features

All are per player and computed from the view.

| Feature | What it measures | Source |
|---|---|---|
| **Armies** | total on board | universal |
| **Income** | `max(3, T/3)` + held continents' bonuses + a card a turn (90% × 2.87 armies) | rules; the hand model |
| **Cards** | the hand's worth by the hand model, beyond an empty hand's, at 0.9 an army: mine exact from its symbols (the card this turn's capture draws counted unseen), others' by size | DoomYoshi; the hand model |
| **Kill exposure** | probability some opponent eliminates this player before their next turn | Total Diplomacy part 3: "what happens if a player gets eliminated" |
| **Kill opportunity** | best kill available next turn, valued by the cards it takes | Domination; Risk4Ever |
| **Border exposure** | each opponent's best single blow: the armies it would win from me in the exchange (big battles favour the attacker), or a held continent of mine broken, reached through at most one territory of mine | CaptainCanadaEhh; Lux `attackConsolidate` |
| **Idle armies** | armies with no enemy beside them | play-risk-online.net: neighbouring garrisons do nothing |
| **Common threat** | whether one player's power exceeds every other's by the leader ratio | Domination; Risk4Ever |

### How they combine

1. **Power.** Each player's power is armies + H × income + cards, with H (`incomeHorizon`) the turns of income counted. Under Fixed values nothing devalues income as the game goes on, so H is a constant.
2. **Equity.** My equity is my power's share of the total, adjusted:
   - cut by my kill exposure, weighted by a vulnerability weight;
   - plus my next-turn kill opportunity, weighted, discounted by the chance an opponent moving before me takes it first;
   - minus my border exposure, weighted;
   - minus idle armies, weighted;
   - minus the common threat's power past the point that makes it everyone's target (hitting it pays, feeding it costs, and nothing jumps as the test flips), or, when I am the common threat, a small penalty on my own lead past that point.
3. **Plan score.** A plan's score is the expected equity of its end-of-turn positions.

Share of power is the right currency for free-for-all: making the strongest weaker raises my share just as making me stronger does, which is why breaking a leader's continent scores without a special rule, and is Risk4Ever's "balance of the game" as a number.

### The threat model (one round of opponents, cheap)

For each opponent, in turn order before my next turn:

1. Estimate their reinforcement from the income model.
2. Run the elimination planner from their seat against every other player, me included.
3. Assume each takes the one kill that pays it best (a player takes one victim a turn), judged by a fixed, objective model: a typical strong player who takes any kill of 60% or better, and a kill below that only when it pays (the cards force a trade, or the victim holds 3 or more). That gives each player's chance of being eliminated before my next turn, and by whom: the victim's power goes, and its cards go to the killer, so damage I leave on a card-holder counts as a gift to whoever finishes it.
4. **Common threat** is declared when one player's power exceeds every other's by the leader ratio: 1.3 at 4 players, 0.1 more for each player more (Domination's fixed-card rule, more lenient with more players).

This one-round, one-reply model is the v1 approximation of max-n search, and it is opponent-agnostic: v1 never models a particular opponent's habits. Opponents are assumed to play the attack odds well (slow-rolling where it pays), so a border is priced against the best play, not just a blitz.

### Tunable parameters and their consumers

The Monopoly lesson ("Dual-use parameters" in `monopoly/bots/CLAUDE.md`): **a parameter an optimizer may move must have exactly one job, or every job it has must be visible to the fitness.** The hazard is the line between **my preferences**, which may be tuned, and **my model of the opponents**, which must stay objective. An opponent's continent is worth its bonus to *them* whatever weight *I* give continents.

**Preferences** (`params.ts`; tuned by measurement):

| Parameter | Value | Consumers | Note |
|---|---|---|---|
| `incomeHorizon` (H) | 3 turns | every player's power; a held continent's stake in my border exposure | One job, used for all players alike. 2 and 4 measured no better (`bot-log.md`). |
| `myCardWeight` | 1 | my hand's worth → card grabs, trade or hold, kill payoffs | **Mine only.** Others' cards use the objective hand model. |
| `myContinentWeight` | 1 | my continent bonuses in my power | **Mine only.** Breaking someone else's continent is valued by their objective income loss. |
| `killCommitMargin` | 0 | the kill commit | One decision. |
| `vulnerabilityWeight` | 1 | my kill exposure → defence, trade, fortify | One job. |
| `borderWeight` | 0.5 | my border exposure → defence, occupy, fortify | One job. |
| `idleWeight` | 0.3 | idle armies → fortify, occupy | One job. |
| `opportunityWeight` | 0.5 | next turn's kill → fortify, occupy, placement | One job. |
| `commonThreatWeight` | 1 | the common threat's excess, against me | My equity only. |
| `leadPenaltyWeight` | 0.1 | my own excess as the common threat | My equity only; it never feeds the leader test. |

**Fixed by reasoning, pinned out of any search:**

| Parameter | Value | Why fixed |
|---|---|---|
| Set values, deck, attack odds, reinforcement formula | the rules | facts |
| Hand model: 0.9 an army next turn, a card drawn 90% of turns | objective | it prices every player's cards, not only mine. Tuning it would teach the bot that opponents' hands are worth what suits it. |
| Opponent kill model: kill bar 60%, an unpaid kill below it half as likely | objective | **It models other players, not me.** Tuned by self-play it would learn a convenient fiction (opponents never attack me), the blindness `holderDenialFrac` showed in Monopoly. Changing it is a design decision tested by scenarios and human games. |
| `leaderRatio` 1.3 at 4 players, +0.1 a player | Domination's fixed-card rule | It is both "when do I join the gang-up" and "when will others gang up on me"; the second models opponents. |
| Sampled outcomes | the work budget | set by measurement of strength against work, never by fitness |

**Tuning.** Tune per player count, or key H and the continent weight by player count; fitness is the win share in **mixed fields** (the candidate among copies of the panel, and the reverse), per `METHOD.md`. Health metrics watched alongside, never optimized: the cap rate (passivity), game length, eliminations per game, the share of turns that take a card.

---

## 4. What v1 leaves out, and v2

**Left out deliberately:**

- **Full multi-turn search** (Carr-style end-of-turn search with max-n values). The one-round threat model captures "think about everyone's next move" with a fraction of the machinery, and v1 is the evaluation and opponent pool that search needs (`risk-bot-ai.md` stages 2 to 3).
- **Chains of kills in one plan.** A kill whose cards force a trade is scored with the trade's armies on the board; the next kill is planned when the bot is next asked, from the board as it is.
- **Alternative routes** in the elimination planner: one route per victim, the greedy best.
- **Learned evaluation.** The weights are hand-structured; a learned value has to beat this one at equal work to replace it.
- **Opponent-specific modelling** and **diplomacy**: there is no table talk, and GD's ranked alliances bind nobody.
- **Card inference.** v1 knows only its own hand and every hand's size. Every trade is public and traded cards go back into the deck, so a card's symbol could be tracked through a player's captures and trades only loosely; the gain would be small.
- **Mixed strategies.** v1 is deterministic given the view.

**v2 directions, in order:**

1. **Opponent-turn rollouts with the bot itself as the opponent model**: replace the one-reply threat model with simulated opponent turns played by the v1 policy.
2. **Carr-style end-of-turn search** over the v1 plan generator, with the v1 evaluation as the leaf, then a learned value (`risk-bot-ai.md` stages 3 and 4).
3. **Human-aware modelling** from logged games.

---

## 5. Test scenarios

Positions where expert play is clear, as unit tests of the bot's judgement (`bots/rule-v1/scenarios.test.ts`, numbered as here). Odds are exact. Unless stated, the game has 5 players.

1. **A kill whose cards force a trade.** B holds 4 cards and only Venezuela 2, Peru 1, Argentina 1, Brazil 3. I hold 1 card, Central America 10, Africa (6 to place). My 1 and B's 4 make 5: a trade the moment B falls. Expected: the run from Central America, made near-sure by placement, and B eliminated.
2. **No trade to take: kill only when nobody can then kill me.** As 1 with B on 3 cards and me on none. Quiet: the run is taken. With two big stacks over my thin Africa: no kill.
3. **Don't feed the leader.** C holds 4 cards, 10 armies over 3 territories, between me and the leader L, who moves next. Expected: no attack on C; the card is taken elsewhere.
4. **Trade one of each at once.** 10 now, nothing better to wait for.
5. **Hold two infantry and a wild,** which any cavalry or artillery makes a 10, while the armies have no use.
6. **Which cards at 5.** Egypt (infantry, mine, on my front), Alaska (infantry), a cavalry, an artillery, a wild. Expected: Egypt, cavalry, artillery for 10 and the +2 on Egypt, keeping infantry and the wild.
7. **A sure card spot, minimally committed.** Indonesia 10 beside a 1-army Siam. Expected: a blitz committing 3 (keep 7), which cannot fail, and no further attack.
8. **Roll when not yet the favourite.** Two players left, 10 attackers against 10. Expected: a single battle with 3 dice (66% played that way, 61% blitzed).
9. **Complete North America when it is cheap.** I hold 7 of 9 with two stacks of 9; Alaska and Greenland hold 1 each. Expected: take both.
10. **Common threat.** L holds Asia and Australia, about twice anyone's power. Expected: the first attack is on L.
11. **Fortify to the front along a path,** and only along one.
12. **Occupy.** A source left interior moves everything; a captured territory that is interior gets the minimum; a run moves on through what it took.
13. **Sweep.** Three 40-army stacks face two victims whose cards (with mine) force trades. Expected: both eliminated this turn.
14. **Don't finish a card-less buffer** at 6 players, but take a card from it.
15. **Holding cards, cover the shell** an opponent could take, and me with it.

Scenarios 2, 3 and 15 judge the threat model; 3 and 10 the multiplayer layer; 4 to 6 the hand model; 7 and 8 Balanced Blitz; 1 and 13 the kill planner. They make good regression tests for later versions: a change that wins the gauntlet but flips one of these deserves a look before it ships.

---

## 6. Open questions where experts disagree

| Question | The disagreement | Recommendation |
|---|---|---|
| **Cash a low set or wait for a 10?** | StevenJoyce and nippersean: cash when you can. rockfist: waiting on three infantry "is not worth it". flexmaster33: wait only with no pressing need. Domination: hold unless pressed. | The hand model prices the wait exactly (three infantry: holding beats a 4 now by a quarter of an army), and the turn plan prices the armies' use now; the bot trades whenever the plan uses them. |
| **Take North America, or stay small?** | GD wiki: North America is the best continent. Risk4Ever once declined it to avoid drawing attention. Dako: don't hold too much. | Let the evaluation weigh the bonus against the border exposure and the common-threat penalty; `myContinentWeight` is the knob to measure. |
| **Kill for cards?** | Much Risk advice treats a victim's cards as the prize. Here a card is 2.9 armies, and Risk4Ever weighs a kill by the balance it leaves. | Kills are judged by the evaluation, cards and power alike; a kill that forces a trade pays for its next step, a card-less one at 5 or 6 players is never planned. |
| **Gang up on the leader?** | Risk4Ever: target the strongest. Domination: only past a ratio, later with more players. | Both: share of power already rewards hitting the strongest; past the leader ratio, others are allies. |
| **Blitz or roll?** | Grandmasters: blitz above about 75%, roll below about 25%. | Computed exactly at every fight, including rolling first and blitzing once ahead. |

---

## Sources

Balanced Blitz:

- SMG Studio, `risk-dice` (Balanced Blitz's code and defaults): <https://github.com/smgstudio/risk-dice>
- SMG Studio, *Blitz Dice Updates* dev diary (Steam): <https://store.steampowered.com/news/app/1128810/view/640181878351987970>
- Mod Sterling, *Dice, Blitz and Slow Roll*, GD fan wiki: <https://risk-global-domination.fandom.com/wiki/Dice,_Blitz_and_Slow_Roll>
- friendsofrisk.com, *Blitz 100% chart*: <https://friendsofrisk.com/blitzchart/> and *Full send vs blitz slider*: <https://friendsofrisk.com/fullsend/>
- dholland, *Is there a benefit in not doing a blitz?*, Steam: <https://steamcommunity.com/app/1128810/discussions/0/3781372783230172348/>
- darshao, *RISK: Global Domination – Beginners' Guide*: <https://steamah.com/risk-global-domination-beginners-guide/>

Fixed cards and GD strategy:

- Risk4Ever (ChampionEver), *How to actually win fixed cards game*: <https://www.youtube.com/watch?v=0Zh8SL3srrY> and *Stop Turtling, Use This Strategy Instead!*: <https://www.youtube.com/watch?v=H9OLbExP7KQ>
- GD fan wiki, *Classic Map*: <https://risk-global-domination.fandom.com/wiki/Classic_Map>
- CaptainCanadaEhh, Steam: <https://steamcommunity.com/app/1128810/discussions/0/573770913622907062/>
- IvanErtlov (SMG), Steam: <https://steamcommunity.com/app/1128810/discussions/0/1743393963181047545>
- ObamaEpstein, *Grandmaster after 1000+ Hour*, Steam: <https://steamcommunity.com/app/1128810/discussions/0/600769605204456014/>
- *When to turn in flat-rate spoils*, Conquer Club (StevenJoyce, kingpin01, natty dread, nippersean, rockfist, flexmaster33, stahrgazer): <https://www.conquerclub.com/forum/viewtopic.php?p=2320448>
- DoomYoshi, *Expected value for spoil troops in Flat Rate per turn*, Conquer Club: <https://beta.conquerclub.com/forum/viewtopic.php?p=4677119>
- Dako, spoils guide, Conquer Club: <https://www.conquerclub.com/forum/viewtopic.php?f=6&t=138573>
- Artimis, Conquer Club: <https://www.conquerclub.com/forum/viewtopic.php?t=72581>
- Ehsan Honary and readers, *It is Called Risk for a Reason*, Total Diplomacy: <https://www.totaldiplomacy.com/Home/tabid/67/articleType/ArticleView/articleId/522/It-is-Called-Risk-for-a-Reason.aspx>
- *Don't Fight the Last War*, part 3, Total Diplomacy: <https://www.totaldiplomacy.com/Home/tabid/67/articleType/ArticleView/articleId/625/Dont-Fight-the-Last-War-Part-3-of-3.aspx>
- play-risk-online.net, on idle garrisons: <https://play-risk-online.net/strategies-with-escalating-cards/>

Bots:

- Steven Hawkins, `AIDomination.java`, the Domination (yura.net) AI, read for its decision rules (fixed-card behaviour, elimination targets, common threat, card delay, occupy): <https://sourceforge.net/p/domination/code/HEAD/tree/Domination/src/net/yura/domination/engine/ai/logic/AIDomination.java> (mirror: <https://github.com/sdyura/domination>)
- Lütolf 2013, bachelor's thesis, §2 on the Domination and Lux Delux AIs: <https://ai.dmi.unibas.ch/papers/theses/luetolf-bachelor-13.pdf>
- Carr 2020 (frontier-chunked placement, quantile outcomes): <https://arxiv.org/pdf/2009.06355>

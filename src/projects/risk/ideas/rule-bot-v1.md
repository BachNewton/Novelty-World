# Risk bot v1: what experts do, and the bot that does it

A design, not yet built: the first Risk bot, a rule-based player that searches where expert play needs lookahead. It builds on `risk-bot-ai.md`, which surveys AI methods and settled on "hand-written heuristic bot first, tuned by evolutionary search, search and learning later". That survey covers the academic bots (Carr's search, Lux and Domination, Wolf, Lütolf), so they are cited here only for a decision rule they contribute. Everything is filtered through `RULES.md`: 3 to 6 players, dealt territories, escalating sets (4, 6, 8, 10, 12, 15, then +5 each), the +2 bonus once per traded set, the forced trade at 5 or 6 cards, the mid-turn trade after an elimination leaves 6 or more cards, true dice, a defender who always rolls the most dice, blitz attacks, and one fortify along a connected path. The bot sees only its seat's view.

**The priority is strength, not speed.** The strongest bot that can be justified comes first. Speed comes from design: every expensive part runs on a fixed **work budget** per turn (counted in plans and rollouts, never in time, so the same view always gives the same move). The same bot then runs at a small budget for screening gauntlets and at full budget in real games and confirmation runs. Each decision below says what it costs and how its strength scales with budget.

Odds quoted here were computed exactly from the dice chain while writing this doc. Throughout, "a against d" means a armies able to attack (the source holds a + 1) against d defenders, fought to the end.

---

## 1. How experts play escalating-card Risk

The expert communities agree to an unusual degree, and the agreement is shaped by the escalating cards. Sets soon pay more than any continent, and the only way to get more sets than the deck gives you is to take someone else's hand. So escalating Risk is a game about **cards and troops, and the relationship between them**, with the board as the medium.

- **The game turns on eliminations, and cards are their payoff.** "Escalating games are about spoils and troops, and the relationship between them. You do not want to be in a position of having lots of spoils, but few troops; this will make you a target" (gloryordeath's [*Your First Four Moves*](https://conquerclub.com/forum/viewtopic.php?p=2767866), the standard Conquer Club guide for escalating games). Total Diplomacy's analysis of real games sums up the mechanic: "eliminate one player, cash his cards, move on to the next player and so on" ([*It is Called Risk for a Reason*](https://www.totaldiplomacy.com/Home/tabid/67/articleType/ArticleView/articleId/522/It-is-Called-Risk-for-a-Reason.aspx)). A chain of kills, each paying for the next, wins most escalating games. tvar on Conquer Club: set up right, "a chain reaction of elimination/sets" takes half the map or more ([*A seriously dumb question*](https://www.conquerclub.com/forum/viewtopic.php?p=1894786)).
- **Kill only for a payoff you can use now.** "You should only go for kills if you're going to get a mid-cash", so target players holding four or five cards, and re-examine the plan when the target's troops exceed the cash value ([play-risk-online.net, *Strategies with escalating cards*](https://play-risk-online.net/strategies-with-escalating-cards/)). Honary: a kill makes sense when the victim's cards cover the backlash; otherwise you end the turn thin and become the next target ([Total Diplomacy](https://www.totaldiplomacy.com/Home/tabid/67/articleType/ArticleView/articleId/522/It-is-Called-Risk-for-a-Reason.aspx)). The Domination AI encodes the same filter: it ignores elimination targets with no cards ([`AIDomination.java`](https://sourceforge.net/p/domination/code/HEAD/tree/Domination/src/net/yura/domination/engine/ai/logic/AIDomination.java), "will filter out attacks that seem too costly or if the target has no cards").
- **Timing is the whole strategy.** "The whole strategy in escalating is a question of timing" (Donelladan, [*Escalating Spoils*](https://conquerclub.com/forum/viewtopic.php?p=4562489)). Don't trade a set you can't use: "If you can't kill anyone and cashing isn't needed for safety, then you should not cash almost most of the times" (Kaskavel, same thread). Every trade raises the next set's value for the next player to trade. Exceptions experts name: cash early to make a kill chain possible, when threatened with elimination, to clear someone off a region, or to shrink your hand so you aren't "a tasty target" (Armandolas, Gweeedo, same thread).
- **Continents lose value as sets grow.** "Continents become less and less attractive as the game progresses" ([Total Diplomacy, *Don't Fight the Last War*, part 3](https://www.totaldiplomacy.com/Home/tabid/67/articleType/ArticleView/articleId/625/Dont-Fight-the-Last-War-Part-3-of-3.aspx)). *First Four Moves*: "DO NOT, under any circumstances, try to take and hold North America, Europe, or Asia." Africa is usually off-limits too. South America and Australia are the exception: hold them only if you already have 3 of their 4 territories, and only briefly. A master-ranked player of the official digital game says the same: take a continent early if you can, but "holding a continent becomes a lower priority as the cards become more valuable" ([vocal.media](https://vocal.media/gamers/tips-for-risk-the-game-of-global-domination)).
- **Several stacks, not one and not many.** Build "3-5 stacks around the board", because spread stacks are harder to eliminate and reach more targets ([*First Four Moves*](https://conquerclub.com/forum/viewtopic.php?p=2767866)). Conquer Club's large-game players advise "2-4 territories with large stacks", trading single-army captures for cards until sets reach 20 to 25, then sweeping ([safariguy5, *General Advice?*](https://www.conquerclub.com/forum/viewtopic.php?p=2345535)). A small reserve on the far side of the map makes you harder to finish off ([vocal.media](https://vocal.media/gamers/tips-for-risk-the-game-of-global-domination)). And "two territories with troops on them next to each other do nothing to help your cause" ([play-risk-online.net](https://play-risk-online.net/strategies-with-escalating-cards/)).
- **Take a card every turn, cheaply.** "Take one country every turn. Preferably one with 1 army in it" (tvar, [Conquer Club](https://www.conquerclub.com/forum/viewtopic.php?p=1894786)). Early on, risk about two armies for a card. "Once the spoils value is above 12 you can consider risking more" ([*First Four Moves*](https://conquerclub.com/forum/viewtopic.php?p=2767866)). A 1-army territory is a "card spot" for everyone ([play-risk-online.net](https://play-risk-online.net/strategies-with-escalating-cards/)). Exactly computed, taking one from 3 attackers wins 91.6% of the time and costs about 0.57 armies on average.
- **Attack with big margins, and don't bleed.** "Attack only if you have at least 4 against 1" in the opening ([*First Four Moves*](https://conquerclub.com/forum/viewtopic.php?p=2767866)). Avoid "3 against more than 1", don't take bonuses you can't hold, don't overextend ([ManBungalow and shadistic, *General Advice?*](https://www.conquerclub.com/forum/viewtopic.php?p=2345535)). Honary: "Over-expansion can make you vulnerable" ([*Total Diplomacy* book](https://www.totaldiplomacy.com/TheBook.aspx)).
- **The leader is everyone's problem, but only when clearly ahead.** Attack the leader when the odds are similar, and break other players' bonuses rather than rushing your own (shadistic, [*General Advice?*](https://www.conquerclub.com/forum/viewtopic.php?p=2345535)). The Domination and Lux AIs both implement a "common threat": when one player is far ahead, everyone hits only him ([Lütolf 2013, §2](https://ai.dmi.unibas.ch/papers/theses/luetolf-bachelor-13.pdf); `AIDomination.java`). Domination's hard AI makes the trigger *stricter* when sets escalate ("don't want to pursue the lowest player if there's a good chance someone else will eliminate"), because escalating positions swing fast.
- **Never weaken someone for a third player to kill.** "Don't weaken a player without finishing them off", since partial damage invites a third player to take the kill ([vocal.media](https://vocal.media/gamers/tips-for-risk-the-game-of-global-domination)). Domination's `isGoodIdea` refuses attacks that push a weaker card-holder within the leader's reach ("don't push toward elimination"). Don't chase revenge: go after the weakest player instead (vocal.media).
- **Keep the strike force together on a run, and plan B.** "If your objective is to eliminate players and start a chain, then you can't leave armies behind" (Europa, [Total Diplomacy](https://www.totaldiplomacy.com/Home/tabid/67/articleType/ArticleView/articleId/522/It-is-Called-Risk-for-a-Reason.aspx)). Plan the route so no fragment of the victim survives. In the sweep phase, "make sure you have every single territory of that player's as a near guarantee to be taken" ([play-risk-online.net](https://play-risk-online.net/strategies-with-escalating-cards/)). Ask what happens if the run stalls halfway (Honary).
- **Think a round ahead for everyone.** Ask "what happens if each player cashes in their cards" and "what happens if a player gets eliminated and his cards are handed over to the eliminator?"; "think 3 moves down and always consider the next move made by every other player" ([Total Diplomacy part 3](https://www.totaldiplomacy.com/Home/tabid/67/articleType/ArticleView/articleId/625/Dont-Fight-the-Last-War-Part-3-of-3.aspx)). Card counting is basic: "a player sitting on four cards ... will cash a set on their next turn" ([duxaris](https://duxaris.com/beginners/how-to-play/)).
- **Even experts win only 25 to 30%.** *First Four Moves* says its best practitioners "only win 25-30%". That is the realistic ceiling for a strong player in large free-for-alls, and a calibration point for the bot's 6-player target.

Two rule differences matter when reading those sources. First, a mid-turn trade here needs **6 or more** cards after taking the victim's hand (`ELIM-3`), so "kill someone with four or five cards" means: my hand after any start-of-turn trade, plus the victim's, must reach 6. Second, the +2 bonus here is per traded set, so a second set in a turn can earn it too.

---

## 2. The v1 bot, decision by decision

### Architecture in one paragraph

The bot is a **turn planner over expert-shaped candidate plans**, scored by an evaluation with a one-round **threat model** of the opponents. At the start of each turn it generates a few dozen whole-turn plans, each a coherent intent: a kill run, a card grab, a continent break, a consolidation. Plans are generated by the expert rules, which is what keeps the candidate set small, as Carr's pruning to frontier placements did ([Carr 2020](https://arxiv.org/pdf/2009.06355)). It costs out each plan exactly with the battle tables, simulates it where the outcome branches (an elimination chain with mid-turn trades), scores the end-of-turn positions, and commits to the best. After every real attack result it checks the plan against what happened and re-plans when reality has left the plan's assumptions. The small decisions (which cards, how many to move in, the fortify) are cheap rules or cheap enumerations scored by the same evaluation, so the bot's decisions can't disagree with each other. This is the Monopoly bot's "one yardstick" lesson (`monopoly/bots/CLAUDE.md`).

### Shared tools (built once, used everywhere)

- **Battle table (exact, cheap).** For each (a, d), the full distribution of attacker survivors when fought to the end, plus the distribution when the blitz stops at a floor. It is computed once by the dice chain and memoized. Past a cap (around 60 against 60), a normal approximation of the per-roll losses is accurate enough. Cost: one table lookup per battle query.
- **Path run (exact, cheap).** The distribution of armies arriving at the end of a capture path, moving all but one forward each time, as a convolution of battle distributions along the path. One stack's probability of clearing a path in one go: a 12-army stack (11 attacking) against defenders [2, 1, 1, 3] is 74%, 14 is 88%, 18 is 98%. Cost: path length × survivor range.
- **Hand math (exact, cheap).** For my hand, every legal set, its value and its +2 options. For each opponent, the probability their hand holds a set given its size and the cards whose location I know (my hand and the public discard pile). Against a full deck it is 42% with 3 cards and 82% with 4; 5 cards always hold one (`CARDS-4`). The value of the next k sets comes from the shared trade counter.
- **Income model (exact, cheap).** Each player's next reinforcement: territories, held continents and expected cards. Opponents' cards are estimated from hand size and the next set value.
- **Elimination planner (budgeted).** Given an attacker, a victim and the attacker's armies to place, it finds attack routes covering all the victim's territories from the attacker's stacks. Following Domination, it runs a shortest-path search with the victim's territories as waypoints and grows a nearest-neighbour tour from the cheapest ones ([`AIDomination.java`](https://sourceforge.net/p/domination/code/HEAD/tree/Domination/src/net/yura/domination/engine/ai/logic/AIDomination.java), `findEliminationTargets`, `eliminate`). It then allocates the placeable armies across launch stacks in chunks, greedily maximizing the probability that every path succeeds. Paths fought from different stacks are independent, so the probability of the kill is the product of the paths' probabilities. Budget: route alternatives tried per victim and allocation granularity. At its smallest it is one route with greedy chunks of 3; more budget tries alternative routes (start stacks, branch splits, passing through a third player's territory) and finer chunks.

The elimination planner is used **twice**: for my own kills, and in the threat model, to ask whether each opponent can kill me (or someone else) before my next turn. That second use, from each opponent's seat with their estimated reinforcements, is what makes the bot see "I am a target" and "B will be killed by C before I can get there".

### 2.1 Setup placement (dealt territories, one army at a time)

**Rule.** Each placement scores every owned territory and places on the best. Because each placement answers the others', it re-scores every time, which is cheap. The score combines:

1. **Stack building.** Pick 2 to 4 **stack seeds**, territories that border many weak enemy territories (card spots and kill routes) and sit inside a cluster of my own territories. Seeds are spread across the map, and each prefers the territory a small cluster must defend. Later placements reinforce a seed until it reaches its share. The number of seeds scales with player count: 2 in a 3-player game, where I hold 14 territories and fronts are long; 3 to 4 at 5 or 6 players. Source: *First Four Moves*' 3 to 5 stacks, safariguy5's 2 to 4.
2. **Near-complete small continent.** If I hold 3 of the 4 territories in South America or Australia, place to take the fourth on my first turn, aiming for at least 85% on the exact table, and then hold the entry (Indonesia; Venezuela or Brazil). Never build toward North America, Europe or Asia in setup; Africa only in a 3-player game. Source: *First Four Moves*' exception; Domination's setup rates continents by bonus, size and border count.
3. **Block.** If an opponent holds all of a continent but one territory and that one is mine, it gets enough armies that the opponent's best adjacent stack can't take it at better than even odds. Source: Domination's setup ("place a troop there to block").
4. **Don't fortify shells.** Never place on a territory with no enemy neighbour. Don't put the second army on a lone 1-army territory just to make it 2. 1-army shells are accepted as the cost of holding territory.
5. **Turn order.** The first player to move skips the risky opening attack (Natty Dread, [*General Advice?*](https://www.conquerclub.com/forum/viewtopic.php?p=2345535)), so a first-mover's stacks are placed for safety and a card spot. Players later in order place for reach, since others will have weakened the board before they move.

**Cost.** Cheap: one scoring pass per army, about 42 scores.

### 2.2 Card trading

**Rule.** The trade decision is part of the turn plan, not a separate rule. Each plan is costed with and without each legal trade, and the best is kept. In practice that yields these rules, each from the experts:

- **At 3 or 4 cards, hold by default.** Every trade raises the next set's value for someone else, and an unused trade gives away tempo. Trade early only when a plan that needs the armies wins by more than the value of holding:
  - **Trade to kill.** A kill plan whose odds clear the commit bar only with the set's armies. Trading first is never worse than holding through the kill: the same sets get traded either way, but the armies arrive before the attack rather than after.
  - **Trade to survive.** The threat model says I am likely to be eliminated, or my best stack broken, before my next turn, and the armies change that.
  - **Trade to shrink the target.** My hand is the reason someone would come for me (4 cards, thin defence, an opponent who can reach all my territories) and trading drops me below their kill threshold (Armandolas: cashing at 3 or 4 keeps you from being "a tasty target").
- **At 5 cards, trade one** (it is forced).
- **At 6 cards, trade one, plus a second only for a plan that uses it.** The second set is armies now, but it also raises the counter for every opponent. A hand of 3 after one trade is a smaller prize than 5 or 6, and 0 cards after two trades gives no next set. Trade the second when a kill or survival plan uses the armies, or when I'm the clear leader (the game ends sooner when I'm ahead, so speed is worth more).
- **Mid-turn forced trade (`ELIM-3`).** No choice of how many, only which cards. It is chosen by the rule below.
- **Which cards.** Among the legal sets, choose to (1) keep the remaining hand most likely to make a set next turn, keeping wilds unless a wild is the only way to make a set; (2) earn the +2 if any card shows a territory I own, placed on the plan's launch stack or the most threatened border. Then (3) break ties toward spending the cards whose territories are least useful as future +2 spots.

**Cost.** The trade decision rides on the turn planner (below). Card choice is cheap: at most 20 three-card subsets of a hand of 6.

### 2.3 Reinforcement placement

**Rule.** Placement belongs to the plan:

- **A kill plan** puts on its launch stacks exactly what the elimination planner allocated, plus a margin chosen by budget and parameter (2.4). The rest goes to defence.
- **A card-grab plan** puts the minimum the grab needs on its source (often 0 when a stack already borders a 1-army territory). The rest goes to defence.
- **A continent-take or break plan** puts what the path run needs for the success bar on the launch territory.
- **Defence allocation** spreads the remainder over border territories in chunks. Each chunk goes where it most reduces the threat model's expected loss: territories holding a continent, stacks the next player can reach, and my weakest stack when an opponent can kill me. Stacks get reinforced, not shells (play-risk-online.net: neighbouring garrisons don't help). On a hotspot, at least match the immediate adjacent threat (Domination's fortification rule, "this is a hotspot, at least match the immediate troop level").
- **The +2 bonus** must go on its pictured territory (`CARDS-7`). The card choice above already steered that toward the launch stack or a border.

**Cost.** Cheap given the plan: the defence allocation is a greedy loop over chunks, with the threat model's per-territory loss as its gradient. Budget changes the chunk size: 3 at small budget (Carr's chunk), 1 at full.

### 2.4 Attack selection: the turn planner

This is where the bot spends its budget.

**Candidate plans** are generated by the rules each turn:

1. **Kill runs.** For each opponent the elimination planner can reach: one plan, with and without a start-of-turn trade where that's optional. Victims are kept only when killing them **pays**, either because the cards reach a mid-turn trade (my hand after any start trade + theirs ≥ 6) or because they are a 1 to 2 territory remnant blocking my routes or holding cards I'd draw anyway. A card-less victim in a 5- or 6-player game is left as a buffer: Domination drops card-less elimination targets, and killing them only thins the field others will feed on.
2. **Chains.** For each kill run that triggers a mid-turn trade, continue the plan: place the new armies and plan the next kill from the post-kill board. This is simulated, not costed exactly (below).
3. **Card grab.** The cheapest single capture that earns this turn's card. Prefer 1-army territories, captures that consolidate my border (a territory adjacent to two of mine, Lux's `attackConsolidate`) or fill in an enemy island inside my area (`attackFillOut`), and territories owned by the common threat or by a player I'm setting up to kill.
4. **Continent break.** One capture inside a continent held by an opponent, aimed at the common threat first. Domination's AI breaks the strongest player's continents first and never breaks a continent with "too much collateral damage".
5. **Continent take.** Only for South America, Australia and (at 3 players) Africa, and only when the hold value beats the escalation-adjusted card economics (§3).
6. **Endgame sweep or duel.** In the endgame, kill everyone, or in a duel, press every favourable attack (2.4, "Stopping").
7. **Hold.** No attack beyond the card, or none at all when even the card costs more than it's worth.

**Scoring a plan.** Each plan is executed against the battle tables to an end-of-turn position, or to a distribution of positions, scored by the evaluation (§3) with the threat model applied. The plan's value is the expected score.

- **Exact path.** A single-path plan is costed exactly: success probability and survivor distribution. On failure the plan has a fallback (stop, fortify, consolidate), so a failed run still ends in a scored state, never "infinitely bad". Honary's "plan B" is part of the plan, not an afterthought.
- **Sampled chain.** Multi-victim plans branch on dice in ways convolution can't follow cheaply: mid-turn trades change what is placeable and the second victim's routes depend on where the first run ended. They are rolled out N times with the bot's own seeded dice. Each rollout re-plans the next kill with the elimination planner at a small budget, mimicking what the real bot would do.

**Commit rules.** These come from the experts and are expressed through the evaluation, not bolted on. They are the behaviour the evaluation must produce, and the test scenarios in §5 check them.

- A kill run is committed when its expected score beats the best non-kill plan. With honest payoffs that means **mid-cash kills at high set values are taken at moderate odds (often 60 to 70%), and payoff-less kills almost never**.
- **No partial damage** to a card-holder I can't finish this turn when the threat model says another opponent could then finish them before my next turn (vocal.media; Domination's `isGoodIdea`). The evaluation sees this through the threat model, which hands that opponent the victim's cards in its projected next turn.
- **Under a common threat** (§3), attacks on players other than the leader are limited to the cheapest card grab, and continents not held by the leader are never broken (Domination: "don't break a continent if there is a common threat").
- **Early-game margin.** While the next set value is 10 or less, a card grab may risk only about 2 armies in expectation; above 12 the cap grows with the set value (*First Four Moves*). This falls out of the card's value in §3, and the cap parameter is listed there.

**Stopping.** Blitz is called with a floor computed from the plan:

- On a kill path, the floor is the size below which the rest of the path's success probability falls under the plan's continue bar.
- On a card grab, the floor is the source's defensive need (the threat model's per-territory requirement), so a grab never strips a border.
- Domination re-checks every three rolls. Ours re-checks after every blitz result, which is one move. If the outcome landed below the plan's assumption, it re-plans with the remaining re-plan budget, and the fallback is always available.

**Endgame conversion.** When my power (§3) exceeds the sum of all the others', or the planner finds a sweep that kills everyone with probability above the bar, aggression switches to "hogwild": every favourable attack is taken (Lux's Vulture and Yakool, "run hogwild"). With **two players left**, attack whenever the exact odds favour it. Large battles favour the attacker: 20 against 20 wins 63% of the time, 30 against 30 wins 68%. Defence only pays when a third player can exploit the attacker's losses (vocal.media: "once the game is down to two players, attack fully").

**Cost and scaling.**

| Part | Cheap or budgeted | Work unit | Small budget (screening) | Full budget (real games) | How strength scales |
|---|---|---|---|---|---|
| Plan generation | cheap | about 10 to 40 plans | all | all | none |
| Single-path costing | cheap (exact) | path convolutions | all | all | none: exact |
| Elimination planner | budgeted | route alternatives × allocation chunks | 1 route, chunk 3 | up to 8 routes, chunk 1 | finds kills the greedy route misses; most gain on 5 to 6 territory victims |
| Chain rollouts | budgeted | rollouts per chain plan | 16 | 256 or more | variance of the chain value; matters only at high set values |
| Threat model | budgeted | opponent × victim elimination checks | quantile only, 1 route | full planner per opponent | sharper "am I a target" and "who kills B first" |
| Re-plan after a blitz | budgeted | re-plans per turn | 2 | 8 | recovers from bad dice mid-run |

Every budgeted part has a deterministic floor. With no rollouts, chains are scored at a fixed outcome quantile, Carr's device ([Carr 2020](https://arxiv.org/pdf/2009.06355)). So the smallest budget is a complete, sensible bot, and more budget only buys accuracy. Bot-side dice are drawn from a generator seeded by a hash of the view, so the same view always gives the same move. Expected cost even at full budget is tens of milliseconds per turn on a fast engine: the convolutions are small, and a few thousand rollouts of an attack sequence are cheap. That leaves headroom under the server's few seconds. If measurement shows the budget scaling still pays at the top, the budget can rise.

### 2.5 Occupy amounts (move-in after capture)

**Rule.**

- **During a run**, move the path's planned share forward. Everything but 1 goes when the path continues through the captured territory. At a branch, split by the remaining branches' needs, computed by the path run (Europa: "you can't leave armies behind").
- **When the captured territory is interior** (all its neighbours mine), move the minimum. **When the source is now interior**, move everything (Domination's `getBattleWon` does exactly these two cases).
- **Otherwise**, split by the threat model's need on each side. The source keeps what it needs against its adjacent threats, and the rest moves to the side facing the larger threat.

**Cost.** Cheap: a comparison of two territories' needs, both read from the threat model already computed this turn.

### 2.6 Fortify (one move along a connected owned path)

**Rule.** Enumerate the moves worth considering: from each territory with more armies than its need (interior stacks first) to each territory in the same owned component with a deficit, or to next turn's planned launch stack. Each move is scored by the evaluation's change and the best is taken, or none if nothing improves the score. Moving a stack to the front for next turn's kill counts, because the evaluation includes my next-turn kill opportunities (§3). Domination's tactical move does a cruder version: border first, then towards the battle, then out of the interior.

- **Before ending a turn holding 5 or 6 cards**, the fortify must also consider pulling armies onto my most killable stack. That position is what invites a kill.
- **Under a common threat**, consider moving off a continent I can't hold anyway (Domination's "cooperation check").

**Cost.** Cheap: at most about 42 × 42 candidate pairs, but in practice a few sources × a few destinations. Each is scored by an incremental evaluation update.

---

## 3. Evaluation and heuristics

### Features

All are per player and computed from the view.

| Feature | What it measures | Source |
|---|---|---|
| **Armies** | total on board | universal |
| **Income** | `max(3, T/3)` + held continents' bonuses × hold probability + expected cards (next set value × P(set next turn), certain at 5+) | rules; Domination's `getCardEstimate` |
| **Card equity** | value of the hand: own hand exact; others' by size × next set value | Kaskavel; *First Four Moves* |
| **Kill exposure** | probability some opponent eliminates this player before their next turn × what the killer gains (cards + their own position) | Total Diplomacy part 3: "what happens if a player gets eliminated" |
| **Kill opportunity** | best kill plan value available to this player next turn | Donelladan; Turk451 "take advantage of opportunities" |
| **Border exposure** | Σ over border territories of expected loss to adjacent enemy stacks plus their reinforcements, weighted by what the territory holds (a continent, a stack, an entry point) | shadistic "minimize border territories"; Lux `attackConsolidate` |
| **Stack structure** | number of stacks above a size threshold, their spread across continents, the share of armies in stacks versus 1 to 2 army shells | *First Four Moves* 3 to 5 stacks; vocal.media reserve force |
| **Continent progress** | for South America, Australia and Africa: owned fraction, entry points held, cost to complete (path run) | *First Four Moves* exception; Domination continent rating (bonus, size, borders) |
| **Lead** | this player's power relative to the strongest other | Domination "common threat" |
| **Turn distance** | how many opponents move before this player's next turn | Domination `attackOrder` |

### How they combine

1. **Power.** Each player's power is armies + H × income + card equity, where H is the number of turns of income counted. H shrinks as the set value rises, because income from territory and continents matters less once a single trade outweighs it.
2. **Equity.** My equity is my power's share of the total, adjusted:
   - minus my kill exposure, weighted by a vulnerability weight;
   - plus my next-turn kill opportunity, weighted, discounted for each opponent who can take that kill before me (the threat model checks whether they can);
   - minus my border exposure, weighted;
   - minus a lead penalty when I'm far enough ahead to trigger others' common-threat response (modelled, not assumed: §3, "Threat model");
   - plus a stack-structure term.
3. **Plan score.** A plan's score is the expected equity of its end-of-turn positions.

Share-of-power is the right currency for free-for-all: making the leader weaker raises my share just as making me stronger does, which is why breaking a leader's continent scores without a special rule.

### The threat model (one round of opponents, cheap)

For each opponent, in turn order before my next turn:

1. Estimate their reinforcement from the income model, including a forced trade if their hand is 5 or more.
2. Run the elimination planner from their seat against every player, me included, at a small budget.
3. Compute their best card grab and continent break.
4. Assume they take their best option, judged by a fixed, objective model of an opponent: a typical strong player who kills for a mid-cash when the odds are good, otherwise grabs a card and breaks the leader. That gives:
   - each player's probability of being eliminated before my next turn, and by whom (which feeds "don't feed the leader" and "B will be gone before I get there");
   - expected loss per territory of mine (which feeds placement, occupy and fortify);
   - the projected hand sizes after their turns.
5. **Common threat** is declared when the top opponent's power exceeds both mine and the second's by the leader ratio. All opponents are then assumed to target the leader, as experts and the Domination and Lux AIs do. The lead penalty on my own equity uses the same check from the others' seats: is *my* lead big enough to trigger it?

This one-round, one-reply model is the v1 approximation of max-n search. It is opponent-agnostic: v1 never models a particular opponent's habits.

### Tunable parameters and their consumers

The Monopoly lesson ("Dual-use parameters" in `monopoly/bots/CLAUDE.md`): **a parameter an optimizer may move must have exactly one job, or every job it has must be visible to the fitness.** Here, the hazard is the line between **my preferences**, which may be tuned, and **my model of the opponents**, which must stay objective. An opponent's continent is worth its bonus to *them* whatever weight *I* give continents. They will cash a set worth its printed value whatever I think a card is worth to me.

**Tuned by evolutionary search** (CMA-ES over the gauntlet, as `risk-bot-ai.md` stage 2 recommends):

| Parameter | Starting value | Consumers | Note |
|---|---|---|---|
| `incomeHorizon` (H) and its decay with set value | 3 turns at set value ≤ 10, falling toward 1 | power (mine and others') | Used for all players alike, so it's one job: how long income lasts. Safe to tune. |
| `myCardWeight` | 1.0 × (next set value ÷ 3) per card | my card equity → card-grab cost cap, kill payoff from cards I'd receive, hold-versus-trade | **Mine only.** Opponents' card equity uses the objective estimate. |
| `myContinentWeight` | 1.0 | my continent progress and hold value → continent-take plans, setup point 2 | **Mine only.** Breaking an opponent's continent is valued by their objective income loss, never by this weight. This is the Monopoly `monoMult` trap. |
| `killCommitMargin` | plan must beat best non-kill plan by 0 | kill-run commit, trade-to-kill | Two consumers, but both are the same decision (the trade exists only for the kill), so this is one job. |
| `vulnerabilityWeight` | 1.0 | my equity (kill exposure) → trade-to-shrink, fortify, defence allocation | One job: how much I fear being killed. |
| `borderWeight` | 0.5 | my equity (border exposure) → defence allocation, occupy, fortify | One job. |
| `stackTarget` and `stackWeight` | 2 at 3 players, 3 at 4 to 6 | setup seeds, stack-structure term | One job: my shape preference. |
| `leadPenaltyWeight` | 0.5 | my equity only | Must not feed the leader ratio. |
| `planQuantile` (deterministic fallback) | 0.4 | scoring chains when rollouts are 0 | Small-budget only. It must be tuned **at the budget it is used at**, or the screening bot drifts from the full bot. |

**Fixed by reasoning, pinned out of any search:**

| Parameter | Value | Why fixed |
|---|---|---|
| Set values, hand-set probabilities, battle tables, reinforcement formula | the rules | facts |
| Opponent model: card equity, continent income, kill threshold | objective (printed set value × P(set); full bonus × hold probability; a mid-cash kill above about 60% is taken) | **It models other players, not me.** If an optimizer tuned it, it would learn a convenient fiction (opponents never attack me) that wins in self-play and fails against humans, the very blindness that `holderDenialFrac` and `railSynergy2` showed in Monopoly. Changing it is a design decision tested by scenario probes and human games, not by ES. |
| `leaderRatio` (common threat trigger) | 1.5 at set value ≤ 10, rising to 1.8 later | It's both "when do I join the gang-up" and "when will others gang up on me". The second is a model of opponents, so it is pinned. Domination uses 1.3 base, raised ×1.5 for its hard AI in escalating games. Our curve sits between. |
| Re-plan trigger | outcome below the plan's 25th percentile | an engineering choice; doesn't change what a good move is |
| Rollout counts and route alternatives | the budget | set by the budget, never by fitness |

**Gauntlet structure for tuning.** Tune separately per player count, or key `stackTarget`, `incomeHorizon` and the continent weights by player count. The right continent value in a 3-player game (slower escalation, long fronts) is not the 6-player one. Fitness is the win share in **mixed fields** (the candidate among copies of the panel, and the reverse), per `METHOD.md`, because a bot that only beats copies of itself learns the field's habits. Health metrics watched alongside, never optimized: turn-cap draw rate (passivity), average game length, eliminations per game, the share of turns that take a card, mid-turn trades per game. The last two are the escalating game's signature. If tuning drives them down, it has found a passive local optimum.

---

## 4. What v1 leaves out, and v2

**Left out deliberately:**

- **Full multi-turn search** (Carr-style end-of-turn search with max-n values across opponents' turns). The one-round threat model captures the experts' "think about everyone's next move", with a fraction of the machinery. v1 is also the evaluation and opponent pool that search needs (`risk-bot-ai.md` stages 2 to 3).
- **Learned evaluation.** The weights are hand-structured and ES-tuned. A learned value has to beat this one at equal budget to replace it.
- **Opponent-specific modelling.** v1 models every opponent as the same objective strong player. Humans differ: revenge, alliances, passivity. Modelling them needs human game logs, which the site does not yet have.
- **Diplomacy and signalling.** There is no chat or table talk, and no deliberate "look weak" play beyond keeping hand and defence in balance.
- **Card inference from history.** v1 uses hand sizes and the public discard pile. It doesn't track which captures gave which player a card (the draw is hidden, so this would only narrow symbol odds slightly).
- **Mixed strategies.** v1 is deterministic given the view, apart from its seeded rollout dice. If gauntlets show a rock-paper-scissors cycle, as Monopoly's denial knob did, a seeded mixed policy is the answer, not a new constant.

**v2 directions, in order:**

1. **Opponent-turn rollouts with the bot itself as the opponent model**: replace the one-reply threat model with simulated opponent turns played by the v1 policy at a small budget. This gives a true one-round lookahead.
2. **Carr-style end-of-turn search** over the v1 plan generator, with the v1 evaluation as the leaf, then a learned value (`risk-bot-ai.md` stages 3 and 4).
3. **Human-aware modelling** from logged games: revenge propensity, how readily humans kill for cards, at what odds.

---

## 5. Test scenarios

Positions where expert play is clear, as unit tests of the bot's judgement. Odds are exact. Unless stated, the game has 5 players, and "next set" is the value the next trade would earn.

1. **Kill for a mid-cash.** Next set 20. B holds 5 cards and only Venezuela 2, Peru 1, Argentina 1, Brazil 3. I hold 2 cards, Central America 10, and 6 to place. Expected: place all 6 on Central America and blitz the path Venezuela → Peru → Argentina → Brazil. With 16 armies on Central America (15 attacking) the run succeeds about 95% of the time. With the 10 it started with, only 52%, which is why placement belongs to the plan. I take B's cards (2 + 5 = 7), trade one set at 20 mid-turn and keep 4.
2. **Same position, but I hold 1 card and B holds 4.** That makes 5: no mid-turn trade, and I'd end the turn on 6 cards (5 + the drawn card) with a thinned army. Expected: the kill still scores well only if the threat model says nobody can then kill *me*. Otherwise grab a card elsewhere. This probe distinguishes "kill = good" from "kill that pays".
3. **Don't feed the leader.** C holds 4 cards, 6 armies over 3 territories, and borders both me and leader L, who moves right after me. My best is a 7-army stack (6 attacking) against C's 6-army territory: 52% to take one territory, well under even odds to finish C. Expected: no attack on C. Take the card elsewhere, because damage to C hands L the kill and C's cards.
4. **Six cards, no use for the second set.** I hold 6. No kill in reach, the threat model says I'm safe. Expected: trade exactly one set and keep 3.
5. **Six cards, second set enables a kill.** As 4, but a second set's armies lift a mid-cash kill from 45% to 75%. Expected: trade both sets and commit the run.
6. **Which cards.** I hold infantry (Peru, which I own and is on my front), infantry, cavalry, artillery and a wild. Expected: trade infantry (Peru), cavalry and artillery, put the +2 on Peru, and keep infantry and the wild (which form a set with any next card).
7. **Hold at 4.** Next set 10, 4 cards, no kill, not threatened. Expected: no trade.
8. **Trade at 4 to stop being the prize.** 4 cards, 9 armies on 3 territories, and the next player's estimated reinforcement plus adjacent stacks can kill me at about 70%. Expected: trade and defend, or trade and consolidate, so the threat model's kill probability falls below even.
9. **Take the cheap card.** Early game, next set 6. A 4-army stack borders a 1-army enemy territory, nothing else is attractive. Expected: attack with 3 (92%), move in the minimum, stop.
10. **Don't buy a card dearly early.** Next set 6. The only capture is 3 attacking against 2 (66%, expected cost well over 2 armies) from a border stack facing a large enemy stack. Expected: no attack. Rerun with next set 25: expected to attack.
11. **Australia with 3 of 4 on the deal.** Setup in a 6-player game: I hold Western Australia, Eastern Australia and New Guinea, an opponent holds Indonesia with 1. Expected: setup placement builds New Guinea or Western Australia to take Indonesia on turn 1, then holds Indonesia. With 3 of North America's 9 territories, expected: never build toward North America.
12. **Common threat.** L holds Asia and Australia, power about 2× mine and 2× the next player. I border Siam. Expected: a card grab or continent break inside Asia, never an attack on the weaker neighbour's continent.
13. **Fortify to the front along a path.** Brazil 12 is interior after I took North Africa. North Africa 3 faces Egypt 9. The path Brazil → North Africa is owned. Expected: move 11 from Brazil to North Africa. Rerun with Venezuela captured by an enemy between them so no owned path exists: the move must not be offered or chosen.
14. **Occupy.** A capture that makes the source interior: move everything. A capture that makes the target interior: move the minimum. A capture mid-run with two branches left: split by need.
15. **Duel.** Two players left, 30 against 30 at the only contact. Expected: attack (68%).
16. **Sweep.** Next set 35. Three opponents with 4, 5 and 5 cards and 5 to 9 armies each, all within reach of my 40-army stacks. Expected: commit the chain, starting with the victim whose cards trigger the first mid-turn trade. The rollouts' chain-success estimate should be within a few points of a brute-force simulation of the same plan.
17. **Don't kill a card-less buffer.** Mid-game, 6 players. D has 0 cards and 2 territories, both cheap to take, neither on my routes. Expected: take one as the card grab, but don't spend on finishing D.
18. **Holding 5 at end of turn.** I end the turn on 5 cards with a 2-army shell and a 14 stack, and an opponent can take the shell. Expected: the fortify consolidates, or the placement covered it earlier in the turn, so the threat model's probability of my elimination stays low.

Scenarios 2, 8 and 18 judge the threat model. 3 and 12 judge the multiplayer layer. 1, 5 and 16 judge the kill and chain planner. They make good regression tests for every later version: a change that wins the gauntlet but flips one of these deserves a look before it ships.

---

## 6. Open questions where experts disagree

| Question | The disagreement | Recommendation |
|---|---|---|
| **Cash early or hold to 5?** | Gweeedo: "never turn in a set unless you have five cards ... NEVER!" Kaskavel and Armandolas: cash early to kill, survive, or stop being a target. | Hold by default, and let the planner trade early when a plan pays for it. Expert consensus is in the exceptions, and the planner prices exceptions directly. |
| **Australia and South America in escalating games** | *First Four Moves*: only with 3 of 4, only briefly. vocal.media: Australia is "most people's favorite" and so contested. Classic advice prizes them. | Value them by measured hold economics, not a preference. Their bonus (2) is about a third of a mid-game set, worth taking when completion is cheap and the entry is held, never worth a fight. Key `myContinentWeight` by player count, since at 3 players escalation is slower and continents matter more. |
| **Many stacks or one strike force?** | *First Four Moves*: 3 to 5 stacks. vocal.media: "keep your army together as one force". Europa: don't leave armies behind on a chain. | Both are right at different times: several stacks between runs (reach and survival), merging into one force for a run. `stackTarget` governs the first and the run plan the second. |
| **First trade: be first or wait?** | A 6-player Conquer Club player: cashing first for 4 isn't bad, since it shrinks your hand. Most others: never waste a trade. | Let the planner decide. A forced trade at 5 is taken. Optional early trades at set values 4 to 8 rarely beat holding unless the hand makes me a target. |
| **Gang up on the leader, or kill the weak?** | Shadistic: attack the leader. Vocal.media and *First Four Moves*: go after the weakest player for cards. Domination waits for a wide lead before ganging up in escalating games. | Both, by condition: weak card-holders are the default target; the leader becomes the target past the leader ratio. The ratio is pinned (§3) because it is also my model of when others gang up on me. |
| **How aggressively to finish a duel?** | Defensive play matters in multiplayer, not in a duel (vocal.media). | Attack every favourable battle in a duel. The exact odds favour the attacker in large battles. |
| **Is the first mover's opening attack worth it?** | Natty Dread doesn't attack on turn 1 when going first. Shadistic: take an early territory in flat-rate games; in escalating it is "debatable". | The planner decides from odds and card value. At set value 4 to 6 a card is worth about 2 armies, so a first-turn card grab must be cheap. That reproduces Natty Dread's caution without a special rule. |

---

## Sources

Strategy:

- gloryordeath (posted by macbone), *Your First Four Moves: Escalating Strategy in a Nutshell*, Conquer Club forum: <https://conquerclub.com/forum/viewtopic.php?p=2767866>
- *Escalating Spoils*, Conquer Club forum (Donelladan, Armandolas, Kaskavel, Gweeedo): <https://conquerclub.com/forum/viewtopic.php?p=4562489>
- *General Advice?*, Conquer Club forum (safariguy5, shadistic, natty dread, ManBungalow): <https://www.conquerclub.com/forum/viewtopic.php?p=2345535>
- *A seriously dumb question*, Conquer Club forum (tvar, hwhrhett): <https://www.conquerclub.com/forum/viewtopic.php?p=1894786>
- *Strategies with escalating cards*, play-risk-online.net: <https://play-risk-online.net/strategies-with-escalating-cards/>
- Ehsan Honary and readers, *It is Called Risk for a Reason*, Total Diplomacy: <https://www.totaldiplomacy.com/Home/tabid/67/articleType/ArticleView/articleId/522/It-is-Called-Risk-for-a-Reason.aspx>
- *Don't Fight the Last War*, part 3, Total Diplomacy: <https://www.totaldiplomacy.com/Home/tabid/67/articleType/ArticleView/articleId/625/Dont-Fight-the-Last-War-Part-3-of-3.aspx>
- Ehsan Honary, *Total Diplomacy: The Art of Winning RISK* (book description): <https://www.totaldiplomacy.com/TheBook.aspx>
- *Tips for RISK: The Game of Global Domination*, a master-ranked player of the official digital game: <https://vocal.media/gamers/tips-for-risk-the-game-of-global-domination>
- *How to Play Risk: Global Domination*, duxaris: <https://duxaris.com/beginners/how-to-play/>

Bots:

- Steven Hawkins, `AIDomination.java`, the Domination (yura.net) AI source, read for its decision rules (elimination targets, common threat, `isGoodIdea`, card delay, occupy, tactical move): <https://sourceforge.net/p/domination/code/HEAD/tree/Domination/src/net/yura/domination/engine/ai/logic/AIDomination.java>
- Lütolf 2013, bachelor's thesis, §2 on the Domination and Lux Delux AIs (SmartAgentBase, EvilPixie, Cluster, Vulture, Killbot, Yakool): <https://ai.dmi.unibas.ch/papers/theses/luetolf-bachelor-13.pdf>
- Carr 2020 (frontier-chunked placement, quantile outcomes): <https://arxiv.org/pdf/2009.06355>

# vulture-v1: the card-killer's playbook as a style bot

vulture-v1 (`native/src/bots/vulture_v1/`) is a **style bot** in Rust, like sweeper-v1 and GD's personas: it plays one person's playbook on purpose, flaws included, and is measured only to know what it is, never against a seating bar. It isn't seatable (`online/seat-roster.ts` doesn't list it), so it has no rank, no fingerprint in `frozen.test.ts` and no place in the seatable ratings. It is registered in the crate, so the harness seats it by its label, `vulture-v1`: wholly in the crate on the native fast path, or as a native seat at a TypeScript table (`native-port.md`, "How a Rust bot is measured").

It has three jobs:
- **An opponent in gauntlets** that plays like the person who keeps beating the bots, a style none of our bots plays among themselves, so a gauntlet can measure whether a fix beats it.
- **The reply bot for a person's seat** inside native-v2's search (`native-v2.md`, the `humans` switch).
- **A test** that a new bot wins against his style.

It is named for the style (it waits while the others fight, then picks off the weakened for their cards), never for the person.

It is a persona, not a planner: a handful of rules over the board, the crate's exact odds (`blitz.rs`, `odds.rs`), no evaluation, no opponent model, no search. It is deterministic and costs microseconds a decision. Every rule is one the record shows, and every number in it is read from the record.

## The record

His seat (seat 0) in every game we have, 123 of his turns:

| Game | Seats | His turns | Won on turn |
|---|---|---|---|
| G4FR | Kyle, rule-v3, GD Stacker, GD Continental | 30 | 98 |
| 9VFL | Kyle, rule-v5, rule-v4, rule-v3 | 23 | 90 |
| YUY4 | Kyle, two rule-v6, rule-v5 | 22 | 75 |
| 9PYK | three rule-v6, Kyle | 10 | 37 |
| YMS9 | Kyle, three rule-v6 | 15 | 62 |
| CZ7U | Kyle, three rule-v7.1 | 23 | 96 |

G4FR and 9VFL are `bots/rule-v4/g4fr.json` and `bots/rule-v6/9vfl.json`; the other four are their online move logs (`risk:export`). The counts below come from replaying each game on the reference engine and reading his decisions and the board at each.

## What the record shows

The reviews' readings, confirmed or refuted:

| Reading | Verdict | The counts |
|---|---|---|
| A cheap continent with few gates | **Confirmed** | His first continent was always one of the three cheap ones, by his 2nd to 4th turn: Australia in G4FR, 9VFL and YUY4, South America in 9PYK and CZ7U, Africa in YMS9. He held it at 29 of 30, 21 of 23, 19 of 22, 7 of 10, 12 of 15 and 22 of 23 of his turn ends. YMS9 added Australia and then South America. |
| Held with stacks on its gates | **Confirmed, sized to the threat** | At his turn ends each gate facing an enemy was at least as big as the biggest enemy beside it 83 times in 120. The guard is matched to the threat, not a fixed number: guards had medians of 3, 11, 8, 12, 11 and 14 by game. Placements rarely went to a gate (29 of 154); the guard grows mostly from marches. |
| One roaming stack | **Refuted** | He kept several medium piles: territories of 5 or more armies at his turn ends had medians of 4, 4, 4, 2, 5 and 3 by game. A turn's armies went onto one territory in 97 of 123 turns, but onto his biggest only 26 times. What he placed on was the pile beside his target: the turn's first attack set out from a territory he placed on in 114 of 123 turns. That pile was usually his 2nd or 3rd biggest, its first target held by 1 army (the median in every game). |
| A card nearly every turn | **Confirmed, every turn** | He captured at least once in all 123 turns. |
| Patience while the others fight | **Confirmed** | On turns without a trade he made 2.0 to 3.8 captures a turn on average by game. Of the captures after a turn's first, 136 of 172 took a territory held by 1 army. On trade turns he made 4.9 to 13.3. In four games the other seats captured from each other as much as or more than he captured: 102 against his 101 (9VFL), 103 against 102 (YUY4), 107 against 67 (YMS9) and 147 against 80 (CZ7U). |
| Small hands traded early | **Confirmed** | He traded at his first chance in 41 of 44 reinforce phases that offered a set. Hand sizes at a trade were 3 (13 trades), 4 (16), 5 (13), 6 and 7 (once each: two kill trades). Small sets were spent rather than held for the 10: 4s and 6s among them. |
| Kills chained through card trades | **Confirmed** | 14 kills. The victim was the seat with the fewest territories in 13; the 14th was the last opponent in the same turn. The victim held the most cards, ties included, in 10. Every victim held a card (1 to 5, mean 3.2). A forced trade followed at once, and the turn went on, in 5 (YUY4, two in 9PYK, YMS9, CZ7U). Two kills in one turn in YMS9. In 9PYK three kills came on consecutive turns of his. |
| Finishing turns from several stacks at once | **Confirmed** | 16 turns made 8 or more captures; 10 of them set out from two or three territories he held at the turn's start. Over all his turns, 23 of 123 did. |
| Breaking the leader's bonus only at high odds | **Confirmed** | His first attack into a continent another seat held whole had a capture chance of 0.85 or more 55 times in 56; the exception was 0.47, taking Australia in G4FR. In 50 of the 56 the holder was the leading seat by income. Even at high odds he often waited: of 57 turns that began with him beside another's whole continent, he attacked into it in 33. |

Two more things the record shows:

- **Every attack is a sure one.** 559 of his 566 attacks had a capture chance of 80% or more as blitzed. His median attack was at 100%.
- **Everything moves in.** 480 of 518 move-ins took every army the capture allowed.

His marches: 79 of 97 ended on a territory facing an enemy, 56 of the 97 set out from a territory taken that turn, and most moved all but one army. They went back toward a hub beside his base: Siam, India and China round Australia, the Middle East between Africa and Asia.

## The rules

Each decision is read from the seat's view and the turn's own history (what it placed, traded and captured this turn), so the bot keeps no state. Three numbers come from the record:

- **Sure is 85%.** Every attack, apart from the turn's card, must capture at 85% or more as blitzed. That is the bar under all but one of his breaks, and nearly all his attacks cleared it.
- **The card is taken at an even chance or better.** His lowest first attack was 47%.
- **A raid comes from a pile of 7 or more, into a territory of 1 army.** Raids after the card went into 1-army territories 136 times in 172, and the pile he raided from had a median of 7 to 11 by game at his last raid of a turn.

**Names.** The base is the cheap continents he took, those worth at most 3: South America, Africa and Australia. A **gate** is a territory of a base he holds that borders another continent. A gate's **guard** is the biggest enemy stack beside it, and a gate keeps that many armies, never attacking or marching them away. The **weakest seat** is the opponent with the fewest territories, the most cards breaking a tie. The **leader** is the opponent with the most income. The **head** is the territory the turn's last capture took, or before any capture, where the turn's armies went. A **sweep turn** is one on which he traded a set.

The rules, in priority order:

1. **Trade at the first chance.** Any set in hand is traded: the set worth most, one picturing a territory of mine among equals, with its +2 on the pictured territory that has the most armies. The mid-attack trade after a kill is the same.
2. **The kill.** The weakest seat, holding a card (or the last opponent), is killed when its whole land can be taken at the sure bar. The kill is costed by covering the victim's territories with walks from my stacks: the biggest stack beside the remaining land walks the longest chain it can, by the crate's path odds, then the next stack, the chances multiplied. The turn's armies all go on the stack that makes the kill likeliest. Each attack decision re-costs the kill on the board as it stands and takes the next step of it. A kill's cards force a trade when they bring the hand to 5. The traded armies go on the next kill's stack if there is one, otherwise where a sweep runs longest, and the turn goes on as a sweep turn.
3. **The guard.** A gate short of its guard is topped up first from the placement, then by the march.
4. **The base.** Holding no base, the turn goes for the base whose enemy territories hold the fewest armies, among those it has land in or beside. Everything is placed on the biggest territory beside that base's enemy land, one inside the base first, and every sure capture into it is taken first.
5. **The turn's card.** Everything is placed beside the thinnest enemy territory bordering my land (the nearest home among equals, then the leader's), on the territory with most armies to spare beside it. The first capture is a sure one if there is any, otherwise the surest at an even chance or better.
6. **The sweep.** On a sweep turn the head goes on through the enemy territories beside it that it takes surely. Its placement is the territory whose greedy walk takes the most territories surely with everything placed on it.
7. **Raids.** After the card, and on a sweep turn after the head is spent, a pile of 7 or more takes a 1-army territory beside it. On a turn without a trade only the head raids: that is the patience. On a sweep turn any pile may, which is the finishing turn from several stacks.
8. **Everything moves in**, apart from a gate's guard.
9. **Home.** A short gate is filled first. Otherwise the turn's biggest pile, preferring one taken this turn, marches all but one army to the hub. The hub is the territory of mine facing an enemy nearest home (a gate itself while it faces one), beside the most enemy territories among equals.

**Which target among equals.** Every choice of target (the card, the sweep, the raids) takes the thinnest first. Among territories equally thin it takes the one with the fewest enemy territories beyond it (a pocket before an opening), then one in the leader's continent, then the one with most attackers. The pocket rule came from the attacks the first build missed: in 179 of them he attacked from the same stack as the bot but into another territory. Most were ties between 1-army territories, and he usually took the one with fewer enemy territories beyond it. The rule raised attack agreement from 48.6% to 52.6%. It was read off the same decisions the agreement below counts, so that part of the agreement isn't held out.

## How it differs from sweeper-v1, and why it is a new bot

sweeper-v1 (`sweeper-v1.md`) was drawn from G4FR and 9VFL alone and reads them as **one stack, swept every turn**: it feeds its biggest stack and chains captures through the thinnest territories down to 6 armies, on every turn. The four later games show what that misses, and the counts above show it in the first two as well:

- **He sweeps on trade turns and waits on the others.** sweeper-v1 sweeps every turn. Here a turn without a trade takes the card and raids only 1-army territories from the head.
- **He places beside the target, not on the biggest stack.** He kept several medium piles and fed the one beside the turn's target (114 of 123 first attacks), his biggest only 26 times. sweeper-v1 always feeds its biggest.
- **Kills, chained through trades.** sweeper-v1 has no kill and no victim: it follows the thinnest territory, whoever holds it. Picking off the weakest seat for its cards is the core of the later games, and the reviews name it as what the bots misjudge.
- **Several stacks on the finishing turn.** sweeper-v1 sweeps from one stack.
- **A guard sized to the threat on a cheap continent.** sweeper-v1 holds Australia only, with a fixed guard of 6. He held South America and Africa as readily, guarded to match the biggest enemy beside each gate.
- **Sure attacks only.** sweeper-v1's sweep takes the 90% the rule bots' model uses, and its card attack an even chance; here every attack but the card is at his own 85%.

A version is a bot's next step on the same reading of its source. This is a different reading of a larger record, with most of its rules new, and it plays in a different world: Rust, on the native fast path, where native-v2's replies are drawn. So it is a new bot rather than sweeper-v2. sweeper-v1 stays as it is, an opponent the TypeScript bots already meet.

## Left out, and why

- **When to wait at high odds.** He passed over breaks he could have made at 95 to 100% in 24 of 57 turns. What made him wait is judgement the record doesn't pin down. The bot breaks whenever a break is the surest or thinnest capture on offer, and never at less than sure.
- **Card counting.** He seemed to time kills to the victim's hand. The bot reads it only through the tie-break and the rule that a victim must hold a card.
- **The leader's threat to him.** He rarely defended anything but his gates, and neither does the bot.
- **Strength.** No rule was added or tuned to win.

## Checked

Measured from the crate and the harness:

**Unit tests** (`native/tests/vulture_v1.rs`) build a position for each rule and check its move:
- the trade at the first chance;
- the guard matched to the threat, and kept back from attacks;
- the cheapest base;
- the card's placement and capture;
- raids only from the head and only into 1s on a turn without a trade, and a sweep on a turn with one;
- the kill of the weakest seat holding cards (and not of one holding none), and a kill from two stacks;
- the move-in that keeps a gate's guard;
- the march to the hub.

Whole games check legality and determinism (each decision asked twice, each game played twice) and a floor: it wins all 6 of its games alone among randoms at 3 players. Seated by its label at a TypeScript table, through the native seam, it plays as any native bot does.

**How often it makes his moves.** These are his seat's decisions in the six games, asked by `risk-native agree-log --bot vulture-v1 --seats 0`. A move counts only if it is exactly his, a blitz's keep included. Once an answer in a reinforce phase differs from his, the rest of that phase is off the bot's path and isn't asked. sweeper-v1 and rule-v6.1 are TypeScript bots, asked the same decisions the same way by a throwaway script. Native-v1 at v6.1's settings, asked by `agree-log`, matches the TypeScript v6.1's counts exactly on YUY4 and CZ7U, so the two count alike.

| Same move as his | trade | first placement | attack | move-in | fortify | all |
|---|---|---|---|---|---|---|
| **vulture-v1** | 27/46 (58.7%) | 32/109 (29.4%) | 358/681 (52.6%) | 479/518 (92.5%) | 14/117 (12.0%) | **910/1471 (61.9%)** |
| sweeper-v1 | 22/46 (47.8%) | 22/104 (21.2%) | 302/681 (44.3%) | 478/518 (92.3%) | 18/117 (15.4%) | 842/1466 (57.4%) |
| rule-v6.1 | 24/46 (52.2%) | 25/106 (23.6%) | 31/681 (4.6%) | 328/518 (63.3%) | 5/117 (4.3%) | 413/1468 (28.1%) |

| Game | vulture-v1 | sweeper-v1 | rule-v6.1 |
|---|---|---|---|
| G4FR | 62.5% | 60.4% | 27.1% |
| 9VFL | 59.2% | 58.0% | 25.3% |
| YUY4 | 65.1% | 57.1% | 29.9% |
| 9PYK | 66.2% | 60.0% | 31.9% |
| YMS9 | 55.7% | 50.0% | 28.0% |
| CZ7U | 61.8% | 56.2% | 28.5% |

vulture-v1 is closest to him in every game, including the two sweeper-v1 was drawn from. The margin over sweeper-v1 is modest, and almost all of it is in the attacks, the placements and the trades. Neither persona predicts his marches: he marched in more ways than one rule covers, and sweeper-v1's "back to where the sweep set out" is slightly closer. rule-v6.1's low attack figure reflects its manner (single battles, other keeps) as much as its targets.

**What it is.** A screen on the native fast path: `risk-native games` at 5 players, 1,000 games a pairing, the lone seat rotated through every seat. Seeds were `vscreen` for one-in and `vscreen-out` for one-out. The opponents are GD's personas, greedy, and native-v1 at rule-v6.1's settings, called "v6.1" below:

`native-v1~{"power":"armies","armyRounds":16,"armyBeyond":0.75,"borderScale":1.2,"reprice":"full","rivalBeyond":1.25,"minPlayers":5,"smallTableSeats":4}`

Par is 20%.

| Table | The lone seat wins | Win Elo a seat |
|---|---|---|
| 1 vulture-v1 among 4 v6.1 | 4.8% ± 0.7 (48 of 999) | −278 |
| 1 v6.1 among 4 vulture-v1 | 51.1% ± 1.6 | v6.1 +248 |
| 1 vulture-v1 among 4 GD Defensive | 63.7% ± 1.5 | +339 |
| 1 vulture-v1 among 4 GD Stacker | 52.5% ± 1.6 | +258 |
| 1 vulture-v1 among 4 GD Aggressive | 59.5% ± 1.6 | +308 |
| 1 vulture-v1 among 4 GD Continental | 59.8% ± 1.6 | +310 |
| 1 vulture-v1 among 4 greedy | 58.2% ± 1.6 | +298 |
| 1 GD Defensive among 4 vulture-v1 | 6.8% ± 0.8 | GD Defensive −214 |
| 1 GD Stacker among 4 vulture-v1 | 2.9% ± 0.5 | GD Stacker −369 |
| 1 greedy among 4 vulture-v1 | 11.9% ± 1.0 | greedy −107 |

Plainly:
- **It beats GD's personas and greedy by a wide margin**, far more than sweeper-v1 did (28% alone among greedys).
- **It rarely wins alone among v6.1s**, at about a quarter of par. That is better than sweeper-v1, which never won alone among rule-v6s, but it is still not the person, who won all four of his games against rule-v6 and rule-v7.1 tables. The bots it loses to are the ones whose fixes came from his games.
- **Its own mirror never stalls**: none capped in 500 five-player games, 74 turns on average.
- **It is cheap**: about 3 µs a decision, under a tenth of a millisecond a turn.

`risk-native games` splits `--bots` at every comma, so a tuned label with settings can't be named there yet. The whole screen was played on a scratch copy of the crate, with the committed native-v1, whose `--bots` split skips commas inside braces. That is a small fix to `games.rs` for whoever owns it next.

## Open questions

- **Does a bot that beats vulture-v1 beat him?** The agreement above says how much of his play it copies; a bot tuned against it may learn to beat the rules rather than the person.
- **As native-v2's reply for a person's seat**, does it predict his turns better than the proxies did (sweeper-v1 and v6.1)? The CZ7U rollouts were the test that the proxies failed.

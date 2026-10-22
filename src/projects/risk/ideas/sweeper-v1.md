# sweeper-v1: the winner's playbook as a style bot

sweeper-v1 (`bots/sweeper-v1/`) is built and screened. It is a **style bot**, like GD's personas: it plays one person's playbook on purpose, flaws included, and is measured only to know what it is, never against a seating bar. It isn't seatable (`online/seat-roster.ts` doesn't list it), so it has no rank, no fingerprint in `frozen.test.ts` and no place in the seatable ratings. The harness seats it by its label, `sweeper-v1`. `bot-log.md` has what it measured.

It has two jobs. It gives the gauntlet an opponent that plays like the person who beat the rule bots in G4FR and 9VFL, a style the bots never meet among themselves. And it puts that style into the games the planned learned-evaluator ("hybrid") bot learns from, which come from a mixed 5-player field it joins. It is named for the style, never for the person.

It is a persona, not a planner: a handful of rules over the board, no evaluation, no opponent model, no search. Every rule is one the record shows, and every number in it is read from the record or from the sweep it borrows.

## What the winner did

Read from his seat in both games (`bots/rule-v4/g4fr.json`, `bots/rule-v6/9vfl.json`), his 30 turns in G4FR and 23 in 9VFL:

- **One stack a turn.** He placed every army of a turn on one territory in 25 of 30 turns and 20 of 23, a traded set included. The turn's sweep set out from it.
- **Chained captures.** He blitzed, moved all but one army on, and went on from what he took: about 4.9 captures a turn in G4FR and 4.4 in 9VFL, against the bots' 2. His sweeps went through the thinnest territories, whoever held them.
- **He stopped while it was still a stack.** His sweeps ended with 4 to 14 armies left in G4FR (most often about 6) and 4 to 19 in 9VFL. Turns with a small stack took a single territory, for the card.
- **Home to a hub.** The fortify brought what was left back to a hub near his base: in G4FR 19 of his 29 fortifies ended on the Middle East, China, India or Siam, in 9VFL 10 of 21 on the Middle East, India or Siam. In G4FR 12 of the 19 sweeps that ended in a fortify went back to the sweep's own starting territory or one beside it; in 9VFL the Middle East was the hub whatever the start.
- **A continent with one way in.** He took Australia on his second turn in G4FR and his third in 9VFL, and held it to the end with a guard of 6 to 10 on its gate: Siam when he held it, Indonesia when he didn't.
- **A card every turn.** He captured something on every one of his turns in both games.

## The rules

Each decision is read from the seat's view and the turn's own history (what it placed and captured this turn), so the bot keeps no state.

- **The stack.** Everything to place goes onto one territory: the biggest one facing an enemy that has a sweep with everything placed on it, or the biggest facing an enemy when none has, so the stack already built is fed rather than a new one started. A trade happens when v1's solved card policy says to (`rule-v1/cards.ts`: a 10, 8 or 6 at once), and its armies go on the same stack.
- **The sweep** is v5's (`rule-v5/sweep.ts`): the thinnest enemy territory beside the stack that it takes surely (90%, the opponent model's bar), the one with more ways on between two as thin, all but one army moved in, and on from there. sweeper-v1 cuts it where fewer than 6 armies would be left to attack with, the size the winner's sweeps most often stopped at. A capture that leads nowhere (no enemy beyond it) while the source still faces one moves the fewest armies in, so the stack can go on.
- **Australia first.** While it holds no continent with one way in, the stack goes for one: the turn feeds the biggest territory that takes one of its territories (or the territory beyond its edge, Siam) surely, and the sweep takes those first, past the size cut, as he took Australia down to his last 3 armies. Australia is the only such continent on the map; the rule is written for any.
- **The guard.** Holding one, the gate (the territory beyond the edge when it holds that too, else the entrance) keeps 6 armies, the low end of his guards: the placement tops it up before feeding the stack, the stack launching from it leaves them behind, and nothing fortifies them away.
- **The card.** A turn whose sweep took nothing makes the surest capture anywhere, if it is at least an even chance.
- **Home.** After a sweep, what is left moves back to the territory the sweep set out from, or, if that no longer faces an enemy, to the territory nearest it that does. A turn without a sweep, or whose stack is already home, moves the biggest idle pile behind the lines onto the stack.

## Played in the winner's seat

`games.test.ts` puts sweeper-v1 in his seat at the start of a turn of his and plays the whole turn on the game's own random source. On his trade turns (6 in G4FR, 5 in 9VFL) it trades, feeds one stack (and the guard), chains its captures along one path, and comes home: at G4FR's turn 25 it puts all 15 on China and sweeps 12 territories through Europe into North America, where he put 15 on India and swept 7, and fortifies the 6 left from Ontario back to China; at 9VFL's turn 42 it tops Siam's guard up, puts 13 on the Middle East (his own stack), sweeps 10 and brings the rest home to it. Over those turns it makes 43 captures to his 58 in G4FR and 51 to his 32 in 9VFL. Its sweeps stop at dead ends his didn't (Scandinavia, Madagascar): v5's sweep picks the next capture one step at a time.

## Left out, and why

- **Whom to sweep.** His sweeps mostly ran through one player's land, often the one spread thinnest, and his 19-capture turn ended v3 for its cards. sweeper-v1 follows the thinnest territory whoever holds it. Choosing a victim is a judgement about players, the part of his play a rule copies worst, and the part a learned evaluator should find for itself.
- **Several piles.** His board held medium piles at more than one hub (India, China, Siam) besides the turn's stack, the leftovers of earlier sweeps. sweeper-v1's fortify brings home only the latest sweep, so older leftovers stay where they were left, which comes to much the same; a rule for keeping piles would be a new weight with nothing in the record to set it by.
- **Forks.** He split a stack at a fork now and then (leaving 3 behind and going on with the rest). The sweep is v5's path, never a fork, apart from the dead-end rule.
- **Defending anything but the gate.** He didn't, and neither does it: the trail of one-army territories a sweep leaves is the style's flaw, kept.
- **Strength.** No rule was added or tuned to win. The size cut and Australia first were measured as they went in (below), and kept because he did them, not because they paid; where the record left a choice open (where home is), the reading closest to it was kept; the others measured no clearer.

## How it measured

Scratch runs while it was built, sweeper-v1 in one seat among copies of the opponent (par 33% at 3 players, 20% at 5), games won:

| sweeper-v1 built with | vs greedy, 3p | vs greedy, 5p | vs rule-v6, 5p |
|---|---|---|---|
| the size cut, fed wherever the sweep ran longest | 5 of 20 | 2 of 20 | |
| the biggest stack fed, Australia only when the stack stood beside it | 15 of 80 | 7 of 80 | 0 of 40 |
| Australia first (as built) | 35 of 80 | 21 of 80 | 2 of 40 |

Australia first is what made it a player: without a base it was the weakest seat at a 5-player table and the rule bots, which hunt kills, finished it by about turn 20. Against v6 it still almost never wins. v6's fixes came from exactly this style (`gather` guards choke points against a believed sweep, `alive` and `reinforced` read the endgame), and the bots the winner beat were v3, v4 and v5, which turned down sure captures of one-army territories and let his trails stand (`rule-bot-v6.md`, "Declined cards"). So the style without his judgement is weak against the current bots: that is what it is for, an opponent the bots must learn to punish, and a source of games unlike their own.

The gauntlet agrees (`bot-log.md`): at 5 players sweeper-v1 never won alone among four v6s, beat a table of greedys (28.4% against par 20%), and sits about level with greedy by wins and well above it by finishing order. It crushes random at every table size.

## Open questions

- **Does it teach the hybrid anything?** The test is whether the learned evaluator, trained on a field with sweeper-v1 in it, beats sweeper-v1 by more than v6 does, and doesn't give it back elsewhere.
- **A better sweep path.** v5's one-step choice runs into dead ends with a big stack still in hand. A sweep that looks a step ahead would be closer to the winner, and is a change to the persona, so a new version.

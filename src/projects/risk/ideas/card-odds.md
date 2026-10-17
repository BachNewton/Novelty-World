# Card odds: what's next

**What this is:** follow-up ideas for `card-odds/`, the module that turns what one seat may know (its view and redacted history, `CARDS-2`) into chances about the cards it can't see: each opponent's chance of holding a set and of each best set, its expected symbols, and the next card drawn. The module is built and tested. **Nothing uses it yet**: whether it goes on screen, into a bot, or both is undecided. Everything below is a proposal, not a decision.

## How it works, briefly

The deck below its top 3 cards is always in uniformly random order (`CARDS-8` puts a traded card at a random place below the top 3, and a draw takes the top). So every card drawn was a random pick from that shuffled part three draws earlier, and a card traded after that pick can't be it. `timeline.ts` turns a history into those picks ("slots") and each card's time in the shuffled part ("stays"). Every matching of stays to slots that fits what the seat has seen is equally likely.

- `sample.ts`, **the yardstick**: exact up to sampling noise, by sequential importance sampling over those matchings. Slow (tens of milliseconds to seconds). It is checked against `test-kit.ts`'s brute force, which plays a small deck card by card as the engine does.
- `estimate.ts`, **for use**: a fast approximation (slot liveness, then Sinkhorn scaling, then each hand as cards drawn without replacement). It takes 0.02 to 1 ms. At real positions it comes within about 3 points of the sampler, usually within 1. The timeless model, where every unseen card is equally likely to be anywhere, misses by up to about 8.5 points.
- `cardOdds` (`index.ts`) is the entry point.

## Improving the calculation

- **Grade the estimate late in long games.** In 6-player games past about turn 65, the sampler's effective samples drop to a few hundred, so the slow test skips those positions and the estimate is unverified there. Better proposals would fix it. One option is to order the seen cards' stays by how tightly they are constrained. Another is to resample between stays (a particle filter). The simplest is to run many more samples in an offline measurement.
- **Speed for per-decision use.** A game simulation currently averages about 0.05 ms per decision. The estimate costs 0.02 to 1 ms, plus rebuilding the timeline from the whole history on every call. A bot asking once per turn is cheap; one asking on every decision would make simulations several times slower. Two remedies:
  - Build the timeline incrementally, adding each new event instead of replaying the history. The bot seam already gives the latest events.
  - Cache the slot liveness, which changes only when cards are seen.
  The worst case measured is a long 6-player game, where the hand step sums over many old slots with tiny liveness. Pruning slots below a small threshold should bound it.
- **The ambiguous elimination case.** When the viewer has eliminated two seats and still holds a card taken from the first when they take the second, the timeline knows only that the card came from one of the two. That loosens the constraint: it still counts every way the deck could have run, but it allows some ways that the taken counts rule out. The engine fix below removes the case entirely.
- **Odds over the next few turns, not just now.** "Will Red be able to cash in next turn" depends on Red's next draw as well as their hand. The pieces exist: the next draw's chances, and a hand's chances. Combining them is a small step, but it needs care, because the next draw comes from the same unseen pool as the hands.
- **The +2 territory bonus (`CARDS-7`)** is ignored: the odds read symbols only. A bot weighing a trade's worth could add the chance that a set pictures a territory its holder owns.
- **Bigger samples or exact counting for tiny states.** Very early positions could be computed exactly by enumeration rather than estimated. They are already near-exact, so this is low value.

## Improving the engine

- **Give the taker the faces of eliminated cards.** The `eliminated` event carries only `cardsTaken`, a count. `CARDS-2` says the taker sees the cards (as in GD), but the taker can only work them out from their own hand. Add the cards to the event, redacted for every seat but the taker (as `card-drawn` does). The odds would then know which cards came from which victim, which closes the ambiguity above. **Cost:** any engine edit changes the code hash the ratings cache keys every matchup on (`eval/ratings-cache.ts`), so the next ratings run replays the whole ladder. Batch it with other engine changes.
- **Hand sizes over time in the view.** The timeline derives every seat's hand size from the history and checks it against the view. That is fine, but the check is the only thing tying the two together. If the view ever carried a per-seat "cards seen" ledger, the module could read it directly. This is low priority.
- **The `deck-reshuffled` event** is emitted once, for setup's shuffle (`SETUP-6`). The deck is never reshuffled again in this ruleset, so the event's name reads as if it could recur. Renaming it (`deck-shuffled`) would make that clear. It is cosmetic, and it is an engine edit, so it carries the same cache cost.

## Ideas for the screen

The screen's rule is "show, don't tell", so the odds should appear as marks, not sentences or percentages.

- **A threat cue on each player's cards in the top panel.** The panel already draws every hand as cards. Its fill or glow could show the chance that hand holds a set, with a certain-trade mark at 5 cards (`CARDS-5` forces a trade). The tooltip could show the number and the likely best set ("~60%, likely 8 or 10 armies").
- **In the war room**, beside every hand's size, the best-set distribution as a small bar of 4 / 6 / 8 / 10 segments. The deck's size could carry the next draw's odds as four symbol pips sized by chance.
- **When it matters most:** before the player commits a big attack next to someone, or at the end of their turn when a neighbour is about to move. The cue could brighten for a seat whose likely cash-in plus income could break the player's border. That last part needs a board reading, so it belongs with the screen's existing threat cues, if any.
- **The same numbers for everyone.** Bots and people should read the same function, so the odds never favour either. A setting to hide them is a reasonable option for players who want to count cards themselves.
- **Cost on a phone:** well under a millisecond per call, once per new event. The screen should compute it from the feed's view and history, never from game state.

## Ideas for bots

Measure before believing any of these: give one bot the odds, keep everything else the same, and run the gauntlet against the same bot without them. The earlier estimate was that the edge is small and comes mostly from the late game. Under Fixed values (`CARDS-6`) a set is worth at most 10 armies, which keeps it small.

- **Border defence against a likely cash-in.** Where a bot scores a border's danger, add each neighbour's expected armies from cards: the chance it holds a set times the expected best-set value, plus the territory bonus. It matters most when a neighbour sits on 4 cards.
- **Elimination value.** Taking a player's last territory takes their cards (`ELIM-2`). The odds give those cards' expected set value, and whether they would push the bot to 5 and so into a forced trade with immediate armies (`ELIM-3`). A bot weighing whether to finish someone off could use that instead of the hand size alone.
- **Timing its own trade.** With fixed values there is no gain from waiting for a bigger set number. But knowing which symbols are likely still in the deck helps choose which set to trade and which cards to keep. Keep the cards whose symbol is likely to complete a better set on the next draw.
- **Opponent models in search.** A searching bot that fills in hidden hands by sampling (the contract's rule for whole-state simulation) should sample hands from these chances, not uniformly. `sample.ts` already produces consistent worlds. A bot could take its matchings directly, as a determinization source: exact rather than estimated, and cheap enough at a handful of samples per turn.
- **Lint.** Bot code may import only the contract, the map, the cards and the blitz odds (the `bots/` rule in `eslint.config.mjs`), so the card-odds module has to be added to that list first. The module reads only a seat's view and redacted history, never game state, so it fits the rule's purpose.

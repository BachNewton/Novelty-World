# Tuning the GD bot's weights

An idea, not started and deliberately put off: once the GD bot is ported, find the weights that make its logic play best, rather than the ones SMG shipped.

## The idea

RISK: Global Domination's bot is one fixed piece of logic, a greedy scorer with no lookahead, steered by a row of 44 weights, each 0 to 100: how much risk it takes, how much it values continents, eliminations and cards, how hard it goes after the leader, its attack thresholds, and the terms that score each deploy, attack and fortify. A persona is just one such row (Stacker alone also changes some code). SMG's rows are personalities, chosen to make varied opponents, not to make the strongest player. So a separate question sits underneath them: given exactly this logic, which row is best?

## Why it is worth asking

- It measures how much of the GD bot's weakness is its logic and how much is its tuning. If a tuned row barely beats the best shipped persona, the logic is the ceiling, and a stronger bot needs more than better weights. If it beats it by a lot, SMG left strength on the table.
- The weights that matter most (and the ones that don't) say which features of a position carry the game, which can inform our own bots' evaluation.
- A tuned GD bot is a stronger, cheaper member of the gauntlet field than any shipped persona.

## How it could be done

The weights are a vector of 44 numbers scored by playing games, which is what evolutionary search is for: CMA-ES (or a simpler genetic search) proposes rows, the bot-lab harness rates them in games against a fixed field (the shipped Expert personas, and later our own bots), and the best rows are confirmed by the gauntlet's SPRT on holdout seeds. `risk-bot-ai.md` already names evolutionary tuning as the right first optimiser for heuristic bots.

Things to settle when it starts:

- **The field.** Tuned against the shipped personas only, a row may learn to exploit them; the DORA lesson (`risk-bot-ai.md`) says to test it in both mixtures and against bots it wasn't tuned on.
- **Which weights are live.** Setup claim weights and the mode objectives do nothing in our game, so they are fixed and left out of the search, which shrinks it.
- **Cost.** Each candidate row needs enough games to be told apart from its neighbours; the GD bot is cheap per move, so the budget is set by game count, measured once the port's throughput is known.
- **Stability.** Two independent runs should land on similar rows before any one is trusted.

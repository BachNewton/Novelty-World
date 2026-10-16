# Risk bot v2: what changes from v1, and why

v2 (`bots/rule-v2/`) is v1 (`rule-bot-v1.md`) with the changes below, each one proposed by reasoning and kept only if the gauntlet crowns it (`bot-log.md` holds every measurement, including the changes tried and dropped). v1 is frozen, so v2 keeps only the files it changes (the evaluation, the planner, the small decisions, its entry point and parameters) and shares the rest from v1: the board, the attack odds, the hand model and the capture planner.

## How v2's changes are chosen

Monopoly's bot loop (`monopoly/bots/docs/EVOLUTION.md`) found its large gains in structural changes that give the bot a lever its opponents can't simply return, found by reasoning or by watching real games, and much smaller ones in tuning weights one at a time. Its optimiser paid only while its fitness matched the crown gate (the worst matchup, not the average), and three times it corrupted a parameter whose second job the fitness could not see. So v2's changes are structural first; tuning is a separate, measured step (`risk:tune`), and moves only v2's preferences, never its model of the opponents.

## 1. Being a worse target than the neighbours

v1 prices each opponent's best blow against it, weighted by `1 / the opponent's number of neighbouring players`, as if an opponent chose its victim at random. In a free-for-all an opponent hits whoever its best blow hurts most, so the player who is the worse target sends the attack to a neighbour. v2 weighs my exposure to each opponent by my share of the blows it could land on all its neighbours, each blow weighed as the opponent sees it (every continent at its plain bonus). So a placement, fortify or move-in that leaves me a worse target than the players beside me scores better, even when my own border is no stronger. The common-threat overrides are v1's: everyone hits the common threat, and a common threat's neighbours are hit a quarter as often.

This is part of the opponent model, not a preference: it says how others choose, so it has no weight to tune.

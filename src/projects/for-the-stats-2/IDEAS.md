# For The Stats 2: ideas

Ideas not built yet, with what the game's code says about them. Each is the owner's call.

## Skills that change how an attack lands

The table assumes no skill steps in. Seven of the game's skills and effects can, and an eighth is close. Leaving them out keeps the app cautious for all but the last: those skills only make an attack better, so the shown chances are never too high.

**The attacker's own skills**, each rolled before the slots:

- **Called Shot** (Hunter, and some weapons grant it). Only with a bow, hand bow or gun, on a ranged ability that targets one enemy or a column, and not while dazed, stunned, poisoned or grabbed. The chance is Awareness × 19%, rounded up, times 0.65 for each Focus point spent (Focus makes it *less* likely), plus the character's skill-chance stat. When it triggers, no slots are rolled: the attack is a perfect roll at the top of the range, and it always crits, with a crit bonus of 100% instead of 15% plus Crit Damage. So it deals double the max, then armor (a Pierce attack skips it, as on any perfect roll; Shock has no slot to fail).
- **Justice** (Woodcutter, two-handed weapons): a forced perfect roll that always crits and turns into a splash wave. Its chance rises with Focus spent. Its stat and crit bonus still need reading from the code.
- **Black Hole** (Astronomer, ranged, not on bosses or elites) and **Plaything** (Toymaker): these remove the enemy instead of doing damage, so they're a kill, not a number for the table.

**Party members' skills on the attacker's roll:**

- **Encourage** (Minstrel): can turn a failed slot into a success.
- **Fortune** (Fortune Teller): can reroll a poor roll.

**Against the attacker:** Droll Distraction, a chaos effect, can turn one success into a failure. This is the one case where the table can show too much.

**Already handled or not a chance:** Heavy Handed (the app accepts its halved slot counts). Charge Attack (Fallen Knight) is chosen, not rolled; the combat screen's range seems to include its bonus, which is still to be checked.

### How it could fit on the screen

Called Shot and Justice are the two worth modelling for the player's own attack: with the chance they trigger, the table mixes in one more outcome (a perfect crit) and stays exact. The cost is input, since the chance comes from a character sheet stat, not the combat screen.

A skill picker needs about 110–120px. The Focus line has about 30px free between Shock and the Focus buttons, so it needs one of:

1. Focus buttons back to 44px wide, without the "Focus" label (the ⚡ on them says it), leaving about 130px between Shock and Focus.
2. The picker in the switch row in place of the crit reset, with the reset moving into its menu.

Along with the skill, the app needs its chance: either the stat it comes from (the app works out the chance and the Focus effect) or the chance itself, if the game shows it on the skill's tooltip.

## Other ideas

- **Compare Focus levels.** Tap a row to see its chance with each Focus level at once (for example 0⚡ 41%, 1⚡ 68%, 2⚡ 89%), since how much Focus to spend is the main decision the table leaves to the player. Uses only math the app already has.
- **Party kill chance.** Queue up the party's attacks and combine their odds, to answer "do these two or three attacks kill it between them?"
- **Saved setups per character.** Crit stats and slot counts differ by character; a few named slots would switch between them in one tap.
- **Marked.** A what-if for a Marked target: +30% crit chance on a perfect roll. The rule is already known from the code.
- **Non-combat checks.** Events, traps and locks use the same slot rolls; "chance of at least k successes" covers them. How they count success needs checking in the code first.

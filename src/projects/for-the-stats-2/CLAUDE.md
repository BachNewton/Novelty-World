# For The Stats 2

A companion calculator for the video game For The King II. A player reads an attack's numbers off the game's combat screen, taps them in, and sees the chance the attack deals at least each amount of damage: read the row for the HP the enemy has left. The name and the home page's tagline ("Binomial distributions for people who just wanted to hit the goblin") are a nod to the owner's Android app for the first game, For-The-Stats.

## Principles

- **Exact, from the game's own code.** Every rule comes from the decompiled game (`FTK2.dll`, Unity Mono), not from wikis or forum posts, which were tried first and were wrong (players' damage tables were worked out on paper and rounded the wrong way). When the game changes, re-check against its code.
- **Never say an attack kills when it might not.** Where the game hides a number the math needs and more than one value fits what the player entered, the app shows the lowest result: a smaller hit, a smaller chance of it, a bigger chance of dealing nothing. This is the only place caution may replace exactness; it is never a shortcut where the exact answer can be worked out.
- **Inputs are read off the screen in moments.** The combat screen's damage range and slot chance, the target's armor, and the character sheet's crit stats. Nothing the player would have to look up elsewhere.
- **A full-screen phone app.** It fits one screen from the repo's phone floor (360×640) up, never scrolls, and no tap ever moves anything: fixed-width number boxes, eight result rows always (a crit and up to seven success counts, unused ones blank at the bottom), text that never appears, wraps or changes length in a way that moves a box. One layout for every screen size, no variants by width or height; taller screens give the result rows more room. Every control is at least 44px, slots included: the slots are tapped directly to set their count, and six of them fill a phone's width, so the Focus buttons sit on the line above them, with Shock.
- **Inputs persist** in the browser's storage, so closing the tab picks up where the player left off. The calculator renders only in the browser for that reason.

## How the game rolls an attack

The rules as the game's code has them (class names are where to re-check them):

- **Slots** (`SlotRollHelper`): each slot succeeds on its own at the shown chance. The chance is the attack's stat plus accuracy, clamped to 10–100%. Focus fills slots with guaranteed successes, starting from the first, and lifts every slot still rolled by +10, +5, +2, +1 and then nothing per point (`CharacterHelper.GetFocusedStatValue`). The combat screen's chance includes Focus once it is spent, so the app asks for the chance before Focus.
- **Shock**: unless Focus is spent, the first slot fails, so the roll can't be perfect.
- **The range** (`CharacterHelper.GetMinAndMaxDamageOfAbilityForCharacter`): max = the ability's max share × the attack value × the damage multiplier, rounded (halves to even); min likewise from its min share × the attack's stat. The combat screen shows exactly these, level and target multipliers included.
- **The damage** (`SlotRollHelper`, `InteractableHelper.ApplyStatChange`): the share of slots that succeeded, rounded to two decimals, floored at the min share × the stat, then min + (max − min) × share, truncated. That floor is the same fraction the min is built from, so in effect the min counts twice: a range above zero deals more than its min on its weakest rolls (shown in green). A range from zero misses when every slot fails.
- **Crits** (`CombatHelper`): only on a perfect roll; chance = Crit Chance + 5% per Focus spent (+30% against a Marked target, not modelled); a crit adds the damage × (15% + Crit Damage), rounded, at least 1. The character sheet's Modifiers list shows Crit Chance in full (every class starts at 5%) and Crit Damage only once gear adds some; the 15% base is never shown.
- **Armor** (`InteractableHelper.CalculateFinalDamage`): Armor (physical) or Resistance (magical) comes off last, never below zero. A Pierce attack ("Ignore Armor" on its card) skips it on a perfect roll only.
- **Areas** (`CombatHelper`, `VenueHelper.GetAreaTiles`): every target of an area attack shares one roll and one crit check, and each takes its own armor. A Splash or Swipe hits the target's neighbours for half: the hit, crit included, halved and rounded (halves to even) before their armor comes off. Every other area (Column, Row, AOE, all) hits each target for the full damage. The table's Splash switch shows the neighbours, taken to have the target's armor.
- **Status what-ifs.** Poison takes 10 from the attack's stat (`StatusEffects.json`); Frozen adds 0.25 to the target's damage multiplier. Once either is real, the combat screen's numbers already include it, so the switches are only for trying it out.

## The hidden numbers

The range is built from numbers the game never shows: the ability's min and max shares (its weapon data), the attack value, and the attack's stat. The what-ifs and the floor need them. The shown chance is the stat plus the accuracy of the weapons in hand: only a weapon's rare material gives accuracy, 5 each, so the stat is the shown chance or 5 or 10 below it. (Abilities carry accuracy of their own too, but none whose min depends on the stat.) `attack-shapes.ts` lists every slots-and-shares shape of the abilities a player can hold, read from the game's `Weapons.json`, and the app finds every shape, whole attack value and stat that rounds to the entered min and max (`resolve` in `logic.ts`), then works each out exactly and shows the lowest (`predict`). When none fits, the app reads the numbers as cautiously as they allow, with no floor and what-ifs that move the range by the least they could, and the info dialog says the numbers don't fit a known attack.

A shown chance of 10% may be a lower chance the game clamped up, so the app adds no Focus bonus on top of it. The what-ifs assume no bonus damage against the creature: that bonus is part of the multiplier Frozen adds to, which the screen doesn't separate out.

Regenerate `attack-shapes.ts` from the game's data after a patch that changes weapons.

## Code map

- `logic.ts`: the rules, pure: slots, Focus, Shock, damage, crits, armor, the what-ifs, finding the hidden numbers and the cautious prediction.
- `attack-shapes.ts`: the ability shapes from the game's weapon data.
- `saved-inputs.ts`: the inputs, their defaults (the base game's crit stats: 5% and 0%) and saving them.
- `components/for-the-stats-2.tsx`: the screen.

## Not modelled

Bonus damage against a creature type (gear, materials and traits; the combat screen shows its damage in green), attack tiles, Marked, crit-damage-changing skills, and the row bonus some guns get against one row. Each is the owner's call to add.

**Two attacks are left out of the shapes on purpose.** The Zodiac Tome's stun (3 slots) and the Saxum Sphere's area attack (4 slots) have min and max shares of 25% and 50%, a basic attack's ratio, so nearly every 3- or 4-slot basic attack's numbers also fit them at twice the attack value, and their lower floor would show every such attack's weakest rolls 1–2 damage low. The owner chose to read those numbers as the ordinary attack: exact for almost everyone, and those two attacks' weakest rolls can read 1–2 high.

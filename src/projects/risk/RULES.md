# Risk: rules specification

The rules of classic Risk (the 42-territory world map), written as a specification an engine
and its test suite can be held to. Every rule has a stable ID; a test names the rule it proves.
"Must" is a requirement, "may" is a choice the acting player makes, "must not" is forbidden.

**What is decided:** classic World Domination Risk for 3–6 players, escalating card-set values,
player-chosen trades with the official forced trades, and the official 2-player game with a
neutral army.

## Ambiguities and digital rulings

This is a digital adaptation, not a recreation of the physical board. Rules that exist because
of the table (rolling to decide who goes first, announcing dice aloud, running out of plastic
pieces, a player having to remember what was traded) are not the game's design; the engine
replaces them with whatever serves the design best. Rules that express the game's design
(how armies are earned, how combat resolves, what a player may do on a turn) are kept as the
designers wrote them.

Where the sources are ambiguous, editions disagree, or a rule is bound to the physical table,
the rule carries a `> Note [id]:` saying so, and a `> Resolution (authority):` line giving the
answer, labelled **official** (a rulebook or official FAQ), **official digital** (the
Hasbro-licensed digital game, `[GD]`), **community** (an established community answer),
**project** (a ruling made here, with its reasoning) or **unresolved**.

The authorities rank in that order: **official rulebook → official digital → community →
project**. Where the rulebooks are clear, they are the rule. Where they are unclear (ambiguous,
silent, or the editions disagree on a point this spec has not already settled for the classic
game), what [GD] does is the rule, following its default setting, or the setting its ranked
play uses where that is the better guide. Where neither settles it, an established community
answer does. When research finds none of these, the ruling is made as a game designer would:
keep the heart of the game, weigh it from the players' standpoint, and draw on modern digital
adaptations. [GD] never overrides a rule the classic rulebook states clearly; where its default
differs from one, the difference is listed under "Conflicts for the owner". A ruling goes to
the owner only when it would fork the engine or the technical architecture. The engine is
definitive: an ambiguity is never put to players at runtime. An engine event that applies a
ruling may cite its note id.

## Editions and sources

The rules come from two official rulebooks, cited by tag after each section:

- **[R93]** Parker Brothers, *Risk* rules, the edition copyrighted 1959–1993 (product 00044).
  This is the **classic** rulebook and the primary source: 2–6 players, 6 armies.
- **[H15]** Hasbro, *Risk* Game Guide B7404 (©2015); the Hasbro E9402 guide (©2020) carries the
  same Classic and 2-player text. This is the **current** rulebook: 2–5 players, 5 armies.
- **[FAQ]** The long-running *Risk FAQ* (University of Kent), used only for edition history.
- **[GD]** *RISK: Global Domination* (SMG Studio), the official Hasbro-licensed digital game, in
  its Classic map's World Domination mode. SMG built its rules with Hasbro from the 1993 and
  2003 rulebooks, so it is the official answer to how those rules play on a screen. Evidence
  comes from SMG's own help pages (its support site and the game's FAQ page) and patch notes
  first; community reports of how it behaves (Steam discussions, the fan wiki, player guides)
  are labelled as such where they are the only source.

[GD] is configurable. The settings that match this spec are: **Card Bonus: Progressive** (the
escalating values; [GD]'s help calls it "the default board game settings", though the game's
own default is reported to be Fixed), **Manual Placement: On** (claiming, `SETUP-4`),
**Dice Rolls: True Random**, and no modifiers. The rest of its options are **not** part of
this game: Fixed, Exponential and Per-Player card bonuses; Automatic and Semi-automatic placement; Balanced Blitz dice (which
trims unlikely battle outcomes, so combat is no longer fair dice, `DECK-3`); Blizzards, Portals
and Fog of War; the Capitals, Secret Mission, Secret Assassin and Zombie modes; 70% domination
and limited-turn victories; alliances; Sandbox's custom starting troops, continent bonuses and
wild-card counts; and turn timers and inactivity bots, which are lobby matters, not rules.

The 2008 "Revised Edition" is a different game for cards and victory (star-valued cards,
capitals, objectives) and is **not** a source for this spec.

Where [R93] and [H15] differ, the classic [R93] rule is the rule here and the difference is
noted. Rules marked *(derived)* follow from the official rules rather than being stated in them;
they are invariants an engine must hold.

## Terms

- **Army**: one unit on a territory. Piece denominations (infantry 1, cavalry 5, artillery 10)
  are a counting aid only and have no rules effect. [R93]
- **Owner**: the player (or, in the 2-player game, the neutral) whose armies occupy a territory.
- **Active player**: the player whose turn it is.
- **Set**: three cards that form a valid combination (`CARDS-3`).
- **Battle**: one roll of the dice between one attacking and one defending territory.
- **Attack**: one or more battles; [H15]'s FAQ defines an attack as all the battles of a turn.

---

## 1. The map

### MAP-1 Territories and continents

The board has exactly **42 territories** in exactly **6 continents**. Each territory belongs to
exactly one continent. Names are the [R93] board's. [R93]

| Continent | Bonus | Count | Territories |
|---|---|---|---|
| North America | 5 | 9 | Alaska, Northwest Territory, Greenland, Alberta, Ontario, Quebec, Western United States, Eastern United States, Central America |
| South America | 2 | 4 | Venezuela, Peru, Brazil, Argentina |
| Europe | 5 | 7 | Iceland, Great Britain, Scandinavia, Northern Europe, Western Europe, Southern Europe, Ukraine |
| Africa | 3 | 6 | North Africa, Egypt, East Africa, Congo, South Africa, Madagascar |
| Asia | 7 | 12 | Ural, Siberia, Yakutsk, Kamchatka, Irkutsk, Mongolia, Japan, Afghanistan, China, Middle East, India, Siam |
| Australia | 2 | 4 | Indonesia, New Guinea, Western Australia, Eastern Australia |

The bonus column is the continent's reinforcement value (`REINF-3`). The bonuses sum to 24.

Later boards rename some territories (for example Quebec as Eastern Canada, Ukraine as Russia,
Congo as Central Africa, Siam as Southeast Asia, Central America as Mexico); the map's shape and
adjacency are unchanged. The engine may display any naming, but data and tests use the names
above.

### MAP-2 Adjacency

Two territories are **adjacent** when they share a border or are joined by a sea line (a dashed
line on the board). Adjacency is the only relation the rules use; whether a link is a land
border or a sea line has no rules effect. Alaska and Kamchatka are adjacent across the board's
edge. [R93], [H15]

The full adjacency list (each territory's neighbours):

| Territory | Adjacent to |
|---|---|
| Alaska | Northwest Territory, Alberta, Kamchatka |
| Northwest Territory | Alaska, Alberta, Ontario, Greenland |
| Greenland | Northwest Territory, Ontario, Quebec, Iceland |
| Alberta | Alaska, Northwest Territory, Ontario, Western United States |
| Ontario | Northwest Territory, Alberta, Western United States, Eastern United States, Quebec, Greenland |
| Quebec | Ontario, Eastern United States, Greenland |
| Western United States | Alberta, Ontario, Eastern United States, Central America |
| Eastern United States | Western United States, Ontario, Quebec, Central America |
| Central America | Western United States, Eastern United States, Venezuela |
| Venezuela | Central America, Peru, Brazil |
| Peru | Venezuela, Brazil, Argentina |
| Brazil | Venezuela, Peru, Argentina, North Africa |
| Argentina | Peru, Brazil |
| Iceland | Greenland, Great Britain, Scandinavia |
| Great Britain | Iceland, Scandinavia, Northern Europe, Western Europe |
| Scandinavia | Iceland, Great Britain, Northern Europe, Ukraine |
| Northern Europe | Great Britain, Scandinavia, Ukraine, Southern Europe, Western Europe |
| Western Europe | Great Britain, Northern Europe, Southern Europe, North Africa |
| Southern Europe | Western Europe, Northern Europe, Ukraine, Middle East, Egypt, North Africa |
| Ukraine | Scandinavia, Northern Europe, Southern Europe, Middle East, Afghanistan, Ural |
| North Africa | Brazil, Western Europe, Southern Europe, Egypt, East Africa, Congo |
| Egypt | North Africa, Southern Europe, Middle East, East Africa |
| East Africa | Egypt, North Africa, Congo, South Africa, Madagascar, Middle East |
| Congo | North Africa, East Africa, South Africa |
| South Africa | Congo, East Africa, Madagascar |
| Madagascar | South Africa, East Africa |
| Ural | Ukraine, Siberia, China, Afghanistan |
| Siberia | Ural, Yakutsk, Irkutsk, Mongolia, China |
| Yakutsk | Siberia, Irkutsk, Kamchatka |
| Kamchatka | Yakutsk, Irkutsk, Mongolia, Japan, Alaska |
| Irkutsk | Siberia, Yakutsk, Kamchatka, Mongolia |
| Mongolia | Siberia, Irkutsk, Kamchatka, Japan, China |
| Japan | Kamchatka, Mongolia |
| Afghanistan | Ukraine, Ural, China, India, Middle East |
| China | Afghanistan, Ural, Siberia, Mongolia, Siam, India |
| Middle East | Southern Europe, Ukraine, Afghanistan, India, Egypt, East Africa |
| India | Middle East, Afghanistan, China, Siam |
| Siam | India, China, Indonesia |
| Indonesia | Siam, New Guinea, Western Australia |
| New Guinea | Indonesia, Eastern Australia, Western Australia |
| Western Australia | Indonesia, New Guinea, Eastern Australia |
| Eastern Australia | Western Australia, New Guinea |

The [R93] text confirms, as examples: Greenland is adjacent to Northwest Territory, Ontario,
Quebec and Iceland; North Africa to Egypt, Western Europe and Brazil (among others); Alaska to
Kamchatka.

### MAP-3 Map invariants *(derived)*

A test of the map data must check:

- exactly 42 territories, 6 continents, with the per-continent counts of `MAP-1`;
- adjacency is **symmetric** (A lists B if and only if B lists A) and **irreflexive**;
- exactly **83** adjacent pairs;
- the graph is connected;
- the inter-continent links are exactly: Alaska–Kamchatka, Greenland–Iceland,
  Central America–Venezuela, Brazil–North Africa, Western Europe–North Africa,
  Southern Europe–North Africa, Southern Europe–Egypt, Southern Europe–Middle East,
  Ukraine–Middle East, Ukraine–Afghanistan, Ukraine–Ural, Egypt–Middle East,
  East Africa–Middle East, Siam–Indonesia (14 pairs).

---

## 2. Components

### DECK-1 The card deck

The Risk deck for this game has **44 cards**: **42 territory cards**, one per territory, each
showing one symbol (infantry, cavalry or artillery), and **2 wild cards** showing all three
symbols and no territory. Mission cards are not used. [R93], [H15]

### DECK-2 Symbol assignment

There are 14 cards of each symbol. The assignment, by the [R93] board's names:

| Symbol | Territories (14 each) |
|---|---|
| Infantry | Alaska, Argentina, China, Congo, East Africa, Egypt, Iceland, Kamchatka, Middle East, Mongolia, New Guinea, Peru, Siam, Venezuela |
| Cavalry | Afghanistan, Alberta, Greenland, India, Irkutsk, Madagascar, North Africa, Ontario, Quebec, Scandinavia, Siberia, Ukraine, Ural, Yakutsk |
| Artillery | Brazil, Central America, Eastern Australia, Eastern United States, Great Britain, Indonesia, Japan, Northern Europe, Northwest Territory, South Africa, Southern Europe, Western Australia, Western Europe, Western United States |

Provenance: the rulebooks do not print the full list. This table is a community transcription
that agrees with every card of the [R93]-era Parker Brothers deck found attested individually:
the [R93] rulebook's sample cards (Argentina infantry, India cavalry) and single-card listings
of the 1993 deck (Kamchatka infantry; Ural, Ukraine, Siberia, Irkutsk and Ontario cavalry;
South Africa, Japan and Southern Europe artillery). That is 11 of 42 verified; fan
implementations elsewhere disagree with each other and with these attested cards.

> Note [card-symbols]: 31 of the 42 symbols are not verified against a physical deck.
> Resolution (community): adopt this list. It matches every card that could be verified, and
> the design only needs 14 of each symbol; which territory carries which symbol affects which
> hands form sets, never the engine's structure. Check the rest against a physical 1993 deck
> if one turns up. [GD]'s Classic deck could not be read to confirm its symbols.

The symbol matters only for forming sets; the territory matters only for the occupied-territory
bonus (`CARDS-7`).

### DECK-3 Dice and armies

Dice are fair six-sided dice. The attacker uses up to 3, the defender up to 2. Army supply is
unlimited: running out of pieces never limits a player ([H15] FAQ: use substitutes). [R93],
[H15]

---

## 3. Setup (3–6 players)

### SETUP-1 Player count and starting armies

The game is for 3–6 players (2 players: section 10). Each player starts with: [R93]

| Players | Armies each |
|---|---|
| 3 | 35 |
| 4 | 30 |
| 5 | 25 |
| 6 | 20 |

([H15] has the same values for 3–5 and has no 6-player game. [GD] sets its starting troops by
player count too, but its numbers could not be confirmed.)

### SETUP-2 Seat order

Players sit in a fixed cyclic order, drawn at the start of the game (`SETUP-3`) and kept for
the whole game. "To the left" means the next player in that order. All rotation (claiming,
placing, turns) follows it.

### SETUP-3 Player order

The engine draws the **seat order** at random, every ordering equally likely, from the game's
seeded random source. The first seat is the **first player**.

> Note [first-player]: [R93] and [H15] have each player roll a die, highest first, with no tie
> rule. The roll is the table's way of picking at random; who sits next to whom is wherever
> people sat down.
> Resolution (official digital): [GD] makes the player order "completely random" (SMG's
> support article on its AI). A random draw is the same distribution as the roll, needs no tie
> rule, and costs players nothing to watch; drawing the whole order, not only the first player,
> also replaces the table's seating, which a screen does not have.

### SETUP-4 Claiming territories

Starting with the first player and going round the seat order, each player in turn places
**exactly one army on an unoccupied territory**, claiming it. A player must not place on an
occupied territory while any territory is unoccupied. Claiming continues until all 42
territories are claimed. [R93], [H15]

*(derived)* Claims are spread as evenly as rotation allows: with 4 players the first two in
rotation claim 11 and the others 10; with 5 players the first two claim 9 and the others 8;
with 3 and 6 players everyone claims 14 and 7.

### SETUP-5 Placing the remaining armies

After all 42 are claimed, players continue in turn, each placing **exactly one army on a
territory they already own**, until every player has placed all their starting armies. A
player with none left is skipped. There is no limit on armies per territory. Rotation continues
from the player after the one who claimed the 42nd territory. [R93], [H15]

> Note [placement-start]: the rules say "each player in turn" places after the last claim, but
> not who begins.
> Resolution (project): one unbroken rotation, continuing from the player after the 42nd claim.
> Restarting at the first player would hand the first player an extra early placement for no
> design reason. [GD]'s order here, under Manual Placement, could not be confirmed.

> Note [placement-pace]: placing one army at a time in rotation is design, not a table
> limitation: each placement answers the others'. It stays one at a time in the rules; how the
> screen lets a player make those placements quickly is a UI matter. [GD]'s Manual Placement
> claims territories one at a time in turn (a player guide's report); whether it places the
> remaining armies one at a time could not be confirmed.

### SETUP-6 The deck

The 44-card deck (`DECK-1`) is shuffled and placed face down as the draw pile. [R93]

### SETUP-7 First turn

The player who placed the first army (the first player, `SETUP-3`) takes the first turn; play
proceeds in seat order. [R93], [H15]

### SETUP-8 Dealt territories are not used

The official rulebooks deal territories instead of claiming them in the Secret Mission game,
not in the classic game. [R93], [H15]

> Note [dealt-setup]: dealing is faster at a table, and some groups use it for the classic game.
> Resolution (project): not built. Claiming (`SETUP-4`) is the classic rule and its opening
> draft is real strategy, which a screen makes no slower to play. A dealt setup can be added if
> a need appears. [GD] defaults to Automatic placement (territories and armies placed at
> random), with Semi-automatic (random territories, armies placed by the players) and Manual
> (claiming) as options; the rulebook is clear here, so this stays, and the difference is
> listed under "Conflicts for the owner".

### SETUP-9 Setup invariants *(derived)*

At the end of setup: every territory has exactly one owner and at least 1 army; each player's
army total on the board equals their `SETUP-1` count; the draw pile holds all 44 cards and
every hand is empty; the set-trade counter is 0.

---

## 4. Turn structure

### TURN-1 Phases

A turn has three phases, **in this order**: [R93], [H15]

1. **Reinforce**: receive new armies (`REINF-*`), trading cards if wanted or required
   (`CARDS-*`), and place them all.
2. **Attack**: any number of battles, including none (`COMBAT-*`).
3. **Fortify**: at most one fortifying move, which is optional (`FORT-*`).

Between the attack and fortify phases, the card for the turn is drawn (`CARDS-1`).

### TURN-2 Rotation

After the fortify phase the turn passes to the next player in seat order who is still in the
game. Eliminated players are skipped for the rest of the game. [R93]

---

## 5. Reinforcement

### REINF-1 When

Reinforcements are counted and placed at the beginning of every turn, **including each
player's first**. All reinforcements earned in this phase must be placed before the first
battle of the turn. [R93], [H15]

### REINF-2 Territory armies

The player receives `max(3, floor(T / 3))` armies, where `T` is the number of territories they
own at the start of the turn. Examples: 11 → 3, 14 → 4, 17 → 5; any `T` below 9 → 3. [R93],
[H15]

### REINF-3 Continent bonuses

For each continent whose territories the player **all** owns at the start of the turn, they
receive that continent's bonus (`MAP-1`). Bonuses stack across continents. [R93], [H15]

### REINF-4 Card armies

Armies from sets traded this phase (`CARDS-5`, `CARDS-6`) and the occupied-territory bonus
(`CARDS-7`) are added. [R93]

### REINF-5 Placement

Reinforcement armies may be placed on any territory the player owns, in any distribution,
including continent bonuses (which need not be placed in their continent). Occupied-territory
bonus armies are the exception: they must go on their pictured territory (`CARDS-7`). Armies
must not be placed on a territory the player does not own. [R93], [H15]

---

## 6. Cards

### CARDS-1 Earning a card

At the end of a turn's attack phase, a player who **captured at least one territory** during
that turn draws the **top card of the draw pile**: exactly one card, no matter how many
territories they captured. A player who captured none draws nothing. The card is drawn before
the fortify phase. [R93], [H15] Capturing a neutral territory (2-player game) counts.
*(derived)*

### CARDS-2 Hands

A player's hand is hidden from other players except for its size *(derived: standard
play; the rulebooks say only that cards are held)*. Cards in hand are never lost except by
trading or by being taken on elimination (`ELIM-2`).

Public information is shown to every player: each hand's size, the discard pile (every card
ever traded, `CARDS-8`), the game-wide trade counter and the value of the next set.

> Note [public-cards]: at a table, traded cards go face up, so an attentive player can track
> them, but only by memory.
> Resolution (official digital): anything a player could legally see at the table is shown on
> screen, as [GD] does: its battle log records every trade with its cards' combination, any
> occupied-territory bonus, and the cards seized on an elimination, and its card screen marks
> the current trade value (SMG's v2.8 patch notes and support FAQ). Memory is a table
> limitation, not the game's skill. (With Fog of War, which is not used here, [GD] hides these.)

### CARDS-3 Valid sets

A set is three cards that are one of: [R93], [H15]

- three cards of the same symbol;
- one card of each of the three symbols;
- any two cards plus a wild.

*(derived)* A wild therefore stands for any symbol.

> Note [two-wilds]: neither rulebook says whether a set may hold both wilds.
> Resolution (project): it may. The [R93] wording "any 2 plus a wild" allows a wild among the
> two, and there is no design reason to forbid it. [GD] appears to allow it (a Steam answer
> says "you can use any number of wild cards", and SMG's patch notes speak of its trade
> suggestions offering "an extra wild"), but no SMG source states it, nor how many wilds its
> Classic deck holds.

### CARDS-4 Every hand of five holds a set *(derived)*

Any 5 cards contain at least one valid set. (Without a wild, 5 cards over 3 symbols either
repeat one symbol three times or show all three; with a wild, the other 4 cards supply any two.)
This is what makes the forced trades of `CARDS-5` and `ELIM-3` always possible; a test should
check it exhaustively over symbol multisets.

### CARDS-5 Trading at the start of a turn

During the reinforce phase, before placing: [R93], [H15]

- a player with 3 or 4 cards **may** trade one set;
- a player with **5 or 6** cards **must** trade at least one set, and **may** trade a second if
  they hold one.

Trades are made only at this time, except the forced trade of `ELIM-3`. A player must not trade
during the attack or fortify phase, or during another player's turn. The player chooses which
cards form the set.

*(derived)* A hand never holds more than 6 cards at the start of a turn, and never more than 4
once the reinforce phase ends (see `INV-6`).

### CARDS-6 Set values

Each set traded is worth armies according to how many sets **anyone** has traded so far in the
game, counting every trade, including forced mid-turn trades: [R93], [H15]

| Set traded (game-wide) | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th | n-th, n ≥ 6 |
|---|---|---|---|---|---|---|---|---|---|
| Armies | 4 | 6 | 8 | 10 | 12 | 15 | 20 | 25 | 15 + 5 × (n − 6) |

The game keeps one shared counter of sets traded; a trade is valued at the counter's next
position and then advances it.

### CARDS-7 Occupied-territory bonus

If any of the three cards in a traded set shows a territory the trading player owns at the time
of the trade, the player receives **2 extra armies**, which must both be placed on that
territory. [R93], [H15]

On a single turn a player may receive **no more than 2** such extra armies in total, however
many sets they trade or cards they hold that match. [R93] When more than one card qualifies,
the trading player chooses which territory gets the 2. Wild cards show no territory and never
qualify.

> Note [territory-bonus]: [H15] drops the per-turn cap, and neither rulebook says who picks the
> territory when several cards qualify.
> Resolution (project): the classic cap, as the classic game is the one decided. [GD] caps the
> bonus per trade instead, not per turn ("will only apply once per card trade", SMG's card
> trading help); that difference is listed under "Conflicts for the owner".
> Resolution (official digital): the trading player picks which qualifying card earns the 2,
> as in [GD], where a player with several matching cards picks one (a Steam discussion of
> [GD]; SMG's help says only that the bonus applies once per trade). It also agrees with every
> other placement of a player's own armies being theirs to choose.

### CARDS-8 Traded cards and the draw pile

Traded cards leave the hand and go to a face-up discard pile. [R93], [H15] When a card must be
drawn and the draw pile is empty, the discard pile is shuffled to form a new draw pile. If both
are empty, no card is drawn.

> Note [empty-deck]: neither rulebook covers an empty draw pile.
> Resolution (official digital): traded cards come back into play, so the deck never runs out.
> [GD]: "Cards are cycled in a game so we do not run out of them. When a player hands in cards
> those cards are then added back into the deck at the end" (SMG's card trading help). The
> help doesn't say exactly when or where they rejoin the deck; reshuffling the discard pile
> when the draw pile empties is the universal community practice that fits it while keeping
> the rulebooks' face-up discard pile. It keeps cards, and so the escalating set values,
> flowing in long games.

*(derived)* Every card is always in exactly one place: the draw pile, the discard pile, or one
player's hand; the 44 cards are conserved.

---

## 7. Combat

### COMBAT-1 Legal attack

The active player may declare a battle from territory `S` to territory `D` only if: [R93],
[H15]

- the active player owns `S`;
- `D` is owned by someone else (an opponent, or the neutral in the 2-player game);
- `S` and `D` are adjacent (`MAP-2`);
- `S` holds **at least 2** armies.

A battle involves exactly one attacking and one defending territory.

### COMBAT-2 Attacker's dice

The attacker rolls **1, 2 or 3** dice, and must have **more armies in `S` than dice rolled**:
dice ≤ min(3, armies in `S` − 1). The attacker chooses the number within that limit. [R93],
[H15]

### COMBAT-3 Defender's dice

The defender always rolls the most dice allowed: **2 if `D` holds at least 2 armies, otherwise
1**. The defender's number of dice is not limited by the attacker's. The defender makes no
decision in combat.

> Note [defender-dice]: [R93] and [H15] let the defender choose 1 or 2 dice (2 needs at least 2
> armies), with both sides announcing their dice before rolling together, but not who
> announces first.
> Resolution (project): the choice is dominated. Computed exactly, against an attacker who
> fights to the end, rolling 1 die never gives the defender a better chance of holding the
> territory than rolling 2, across every position tested (attacker 2–60 armies, defender 1–40).
> Asking a defender on every battle of someone else's turn is table pacing with no real choice
> behind it, so the engine rolls the maximum, as digital Risk adaptations do. This also moots
> who announces dice first. [GD] does the same: the defender makes no choice and rolls 2 dice
> whenever it has 2 or more troops (SMG's manual roll help, which offers the choice of dice to
> the attacker only; its blitz rolls "3 v 2").

### COMBAT-4 Resolving a battle

Sort each side's dice from highest to lowest and pair them off, highest with highest, for
`min(attacker dice, defender dice)` pairs; unpaired dice are ignored. In each pair the higher
die wins; **a tie goes to the defender**. Each lost pair removes one army: from `D` if the
attacker's die is higher, otherwise from `S`. [R93], [H15]

*(derived)* A battle removes exactly `min(attacker dice, defender dice)` armies in total (1 or
2); the attacker never loses more than 2 armies in one battle. [R93]

### COMBAT-5 Repeated battles

After a battle the attacker may fight again, from any legal `S` against any legal `D`, as many
times as they like, or stop. There is no limit on battles per turn, on targets, or on battles
from one territory; an unsuccessful battle does not end the attack phase. [R93], [H15]

### COMBAT-6 Capture

When a battle leaves `D` with **0 armies**, the attacker captures `D` at once and must occupy it
by moving armies from `S` to `D`: [R93]

- at least as many armies as the number of dice they rolled in that battle;
- at most `armies in S − 1` (at least 1 army must stay in `S`).

The attacker chooses the number in that range. The move is made immediately, before any other
action.

*(derived)* A capture happens only on a battle in which the attacker loses nothing (the
defender must lose every army it has, and it rolls at most as many dice as it has armies), so
the move-in range is never empty: `S` held at least dice + 1 armies and still does. For the
same reason the [H15] wording (the attacking armies that survived must stay in `D`) gives the
same minimum as [R93].

### COMBAT-7 After capture

A captured territory may be used to attack from, or be attacked into further, in the same turn,
like any other owned territory. [R93]

---

## 8. Fortify

### FORT-1 The fortifying move (classic)

In the fortify phase the active player **may** make **one** move: move any number of armies
from one territory they own to **one adjacent** territory they own, leaving at least 1 army in
the territory moved from. It is optional, and it is allowed whether or not the player attacked
or captured anything. [R93]

### FORT-2 Edition difference: connected path

[H15] allows the move to reach any owned territory **connected to the source through a chain
of territories the player owns** (still one source, one destination, any number of armies,
leaving at least 1). [FAQ] reports the same rule in the 1980 US edition, and the [R93] "expert
variations" offer a wider version (several moves).

> Note [fortify-reach]: the editions disagree on how far a fortifying move reaches.
> Resolution (project): the classic adjacent move of `FORT-1`, since the classic game is the
> one decided. The reach is a design choice, not a table limitation: both versions are equally
> easy to play at a table. The connected-path rule is not built; it would change strategy
> enough that bots tuned under one rule could not be compared with bots tuned under the other.
> [GD] uses the connected path, with no adjacent-only option (SMG's fortify help: troops
> "travel between connecting territories"; a player request for an adjacent-only option went
> unanswered); that difference is listed under "Conflicts for the owner".

### FORT-3 End of turn

After the fortify phase (made or skipped) the turn ends. [R93], [H15]

---

## 9. Elimination and winning

### ELIM-1 Elimination

A player is eliminated when they own no territories. This happens only when another player
captures their last territory. An eliminated player takes no further turns. [R93]

### ELIM-2 Taking the cards

The player who captured an eliminated player's last territory takes **all** that player's
cards into their own hand. [R93], [H15]

### ELIM-3 Forced trade after elimination

If taking those cards gives the active player **6 or more** cards, they must immediately trade
sets until they hold **4 or fewer**, and must stop as soon as they hold 4, 3 or 2. With **5 or
fewer**, they must not trade until the start of their next turn. [R93], [H15]

The capturing move-in (`COMBAT-6`) comes first. Then the player takes the cards, makes the
forced trades, and places the armies from them (valued by `CARDS-6`, with `CARDS-7` subject to
its per-turn cap) at once, on any territories they own, before the next battle. The player then
continues their turn in the attack phase.

> Note [elimination-order]: the rules don't order the move-in against the forced trade, or say
> where and when the traded armies go.
> Resolution (official digital): trade and place at once, as [GD] does: taking more than 5
> cards "will force a trade in and put you back into the draft phase and extend your turn"
> (SMG's card trading help), so the new armies can join the rest of the attack, which is the
> point of the mid-turn trade. The move-in comes first, as `COMBAT-6` says the move is
> immediate; [GD]'s order between the move-in and the cards could not be confirmed.

*(derived)* The number of trades is fixed by the hand size: one trade from 6 or 7 cards, two
from 8 to 10, and so on; the player chooses only which cards.

### ELIM-4 Drawn card does not force a trade

If the card drawn at the end of the attack phase (`CARDS-1`) brings a hand to 6, the player
must wait until their next turn to trade. Only `ELIM-3` permits a mid-turn trade. [R93], [H15]

### WIN-1 Winning (3–6 players)

A player wins the moment they own all 42 territories, which is the moment the last opponent is
eliminated. The game ends at once: no card is drawn and no forced trade or fortify follows.
[R93], [H15]

---

## 10. The 2-player game

The 2-player game is the classic game with one change: a third, **neutral** army sits on the
board as a buffer. All other rules apply unchanged. [R93], [H15]

### TWO-1 Armies

Each player takes 40 armies, and the neutral has 40. [R93], [H15]

### TWO-2 Dealing territories

Remove the 2 wilds. Shuffle the 42 territory cards and deal them into **three piles of 14**:
one for each player and one for the neutral. Each player places 1 army on each of their 14
territories, and 1 neutral army goes on each of the neutral's 14. [R93], [H15]

### TWO-3 Placing the rest

The two players then alternate turns of placement. In each placement turn a player: [R93]

1. places **2** of their own armies, on one or two territories they own;
2. then places **1** neutral army on any neutral territory.

This repeats until all armies are placed. *(derived)* Each side has 26 armies left after
dealing, so each player has exactly 13 placement turns, and the neutral's 26 are exactly used
up (13 placed by each player).

The engine picks which player places first at random, each equally likely.

> Note [two-player-placement]: [H15] orders placement differently (both players place all
> their own armies first, then alternate neutral ones), and neither rulebook says who places
> first.
> Resolution (project): the [R93] interleaved order, the classic one, where each neutral
> placement answers the board as it develops. Who places first is picked at random, as in
> `SETUP-3`. Whether [GD]'s 2-player game uses a neutral army at all could not be confirmed:
> its 1v1 games are described by players as the two splitting the map, and its "Neutral"
> setting is the bot that takes over an inactive player, not a neutral army.

### TWO-4 Deck

After placement, the 2 wilds are returned and the 44 cards shuffled as the draw pile. [R93],
[H15]

### TWO-5 First turn

The player who placed first takes the first turn, mirroring `SETUP-7`.

### TWO-6 The neutral in play

- The neutral never takes a turn: it never reinforces, attacks, fortifies, draws or holds
  cards, and receives no continent bonus. [R93], [H15]
- A player may attack a neutral territory under the normal rules (`COMBAT-1`).
- When a neutral territory is attacked, it defends with the maximum dice like any defender
  (`COMBAT-3`). [R93] and [H15] have the other player choose the neutral's dice and roll for
  it; with no dice choice left (note `defender-dice`), that role disappears.
- Capturing a neutral territory follows `COMBAT-6` and counts toward `CARDS-1`.
- The neutral losing its last territory is not an elimination under `ELIM-*`: no cards change
  hands *(derived: the neutral holds none)*.

### TWO-7 Winning

A player wins the moment they eliminate their opponent. The neutral need not be eliminated; any
neutral territories left over do not matter. [R93], [H15]

---

## 11. Invariants an engine must hold

These follow from the rules above; the engine must hold them after every action, and tests
should check them after every step of random and scripted games.

- **INV-1 Ownership.** After setup, every territory has exactly one owner (a player, or the
  neutral) and at least 1 army. No territory is ever empty or owned by nobody, including in the
  moment of capture (`COMBAT-6`).
- **INV-2 Army conservation.** The total armies on the board change only by: reinforcement
  placement (+), and combat losses (− exactly `min(attacker dice, defender dice)` per battle).
  Capture move-ins and fortifying moves change no total. The neutral's total never increases
  after setup.
- **INV-3 Phase order.** Within a turn, phases occur in the order of `TURN-1`; no battle before
  all reinforcements are placed; no battle after fortifying; at most one fortifying move.
- **INV-4 Cards conserved.** Exactly 44 cards across draw pile, discard pile and hands
  (`CARDS-8`); at most one card drawn per turn.
- **INV-5 Trade counter.** The game-wide trade counter equals the number of sets traded so
  far, and each trade is valued by `CARDS-6` at the counter's value before the trade.
- **INV-6 Hand sizes.** At the start of a turn a hand holds at most 6 cards; after the
  reinforce phase, at most 4; after an `ELIM-3` trade, at most 4; at any other point in the
  attack phase, at most 5; after the end-of-attack draw, at most 6 *(derived from `CARDS-1`,
  `CARDS-5`, `ELIM-3`)*.
- **INV-7 Bonus cap.** At most 2 occupied-territory bonus armies per turn (`CARDS-7`).
- **INV-8 Elimination.** A player with no territories takes no turn and holds no cards; a player
  with at least one territory is in the game.
- **INV-9 Game end.** The game ends exactly when one player remains (2-player: when one player
  owns no territories), and no action is legal afterwards.
- **INV-10 Determinism.** Given the same seeded dice and shuffle sources and the same decisions,
  a game replays identically. *(Not a rule of Risk; an engine requirement that makes the rules
  testable.)*

---

## Outside the rules

> Note [never-ending]: the rules have no turn limit, and cautious players, or bots, can stall
> for a very long time.
> Resolution (project): not a rule of the game. The engine plays any game to its end; the bot
> evaluation harness caps games at a turn limit sized by measurement and records a capped game
> as a draw, never as a win. [GD] agrees: its standard game has no turn limit, and "limited
> turns" is an optional custom rule (its Steam store page).

---

## Sources

- Parker Brothers, *Risk* rules, ©1959, 1963, 1975, 1980, 1990, 1993 (product 00044), as hosted
  by Hasbro: <https://www.hasbro.com/common/instruct/risk.pdf> — [R93]
- Hasbro, *Risk* Game Guide B7404, ©2015:
  <https://consumercare.hasbro.com/api/download/B7404_en-us> — [H15]
- Hasbro, *Risk* Game Guide E9402, ©2020 (same Classic and 2-player rules as B7404):
  <https://consumercare.hasbro.com/api/download/E9402_en-au>
- *Risk FAQ*, University of Kent (edition history, including the 1980 fortify rule):
  <https://www.kent.ac.uk/ims/personal/odl/riskfaq.htm> — [FAQ]
- Card-symbol evidence for `DECK-2`: the [R93] sample cards, and single-card listings of the
  1993 Parker Brothers deck on eBay (for example items 325391219815, 225214349836,
  325510441962, 325391231211, 225214348288).
- SMG Studio, *RISK: Global Domination* help (official) — [GD]:
  - support site, RISK section: <https://smgstudio.freshdesk.com/support/solutions/11000001507>,
    in particular "Is RISK: Global Domination based on official rules?" (11000025091),
    "WIKI - Card Trading" (11000121591), "WIKI - Fortify" (11000121590), "WIKI - Manual Roll"
    (11000121592), "WIKI - Attack Blitz Roll" (11000121588), "WIKI - Draft" (11000121587),
    "Our RISK AI" (11000077687), and the FAQs on manual placement (11000024861) and the card
    bonus (11000024864, 11000025058); each at
    `https://smgstudio.freshdesk.com/support/solutions/articles/<id>`;
  - the game's FAQ page: <https://www.hasbrorisk.com/faq>;
  - patch notes on Steam: v2.8 (battle log), v3.9 (Semi-automatic placement), "Sandbox is
    here!" (card modes, starting-troop modes, wild-card count), and "Blitz Dice Updates"
    (Balanced Blitz): <https://steamcommunity.com/app/1128810/allnews/>.
- [GD] community sources, labelled where cited: Steam discussions
  <https://steamcommunity.com/app/1128810/discussions/0/3123786900666062429/> (no adjacent-only
  fortify; picking the +2 card),
  <https://steamcommunity.com/app/1128810/discussions/0/5154944131318165492/> (wild cards in
  sets); the Level Winner player guide
  <https://www.levelwinner.com/risk-global-domination-guide-tips-tricks-strategies/> (default
  settings, claiming one at a time, connected fortify); the fan wiki
  <https://risk-global-domination.fandom.com/> (1v1 play).

---

## Conflicts for the owner

Where [GD]'s default differs from a rule the classic rulebook states clearly, the classic rule
stands, and the difference is listed here for the owner to confirm.

- **Fortify reach** (`FORT-1`, note `fortify-reach`). [R93]: one move to an **adjacent**
  territory. [GD]: one move along a **connected path** of owned territories, with no
  adjacent-only option; [H15] agrees with [GD]. Recommendation: keep the adjacent move, as the
  classic game was decided; but this is the difference [GD] players will notice first, so if
  familiarity matters more than the classic rule, switching is a one-rule change best made
  before any bot is tuned.
- **Setup** (`SETUP-4`, note `dealt-setup`). [R93]: players **claim** territories one at a
  time. [GD]'s default: **Automatic** placement, territories and armies placed at random;
  claiming is its Manual Placement option. Recommendation: keep claiming; it is the classic
  rule, [GD] offers it, and its opening draft is real strategy.
- **Card bonus** (`CARDS-6`). Both rulebooks: escalating values. [GD]'s default is reported to
  be **Fixed** (4 / 6 / 8 / 10 by the set's symbols); Progressive is its option for the
  escalating values, which its help calls "the default board game settings". **Decided by the
  owner: escalating values.**
- **Occupied-territory bonus cap** (`CARDS-7`, note `territory-bonus`). [R93]: at most **2
  per turn**. [GD]: at most 2 **per trade**; [H15]: no cap. They differ only on a turn with
  two or more trades. Recommendation: keep the classic cap; it is rare enough that the classic
  rule costs nothing, and the cap is already an invariant (`INV-7`).
- **Dice** (`DECK-3`, `COMBAT-4`). The rulebooks: fair dice. [GD] offers **Balanced Blitz**,
  which trims unlikely outcomes of a blitzed battle; which dice setting is its default could
  not be confirmed. **Decided by the owner: true dice**, independent and fair, in every attack,
  single or blitzed. Balanced dice change the odds the game's strategy rests on, and [GD] doesn't
  publish how it balances them. A balanced mode of our own, with odds we define, could be added
  later as an option.
- **2-player neutral** (section 10, note `two-player-placement`), unconfirmed. Both
  rulebooks: a neutral army. [GD]'s 1v1 games appear to be played without one.
  Recommendation: keep the neutral army, as decided.

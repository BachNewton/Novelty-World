# Risk: rules specification

The rules of classic Risk (the 42-territory world map), written as a specification an engine
and its test suite can be held to. Every rule has a stable ID; a test names the rule it proves.
"Must" is a requirement, "may" is a choice the acting player makes, "must not" is forbidden.

**What is decided:** classic Risk played as *RISK: Global Domination* ([GD]) plays its Classic
map's World Domination mode with the settings of its ranked games: 3–6 players, set up at
random (territories dealt and starting armies placed at random), Fixed card-set values, blitzes
resolved by Balanced Blitz, one fortify along a connected path, and no alliances, fog of war,
blizzards, portals or troop caps. There is no 2-player game.

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
**project** (a ruling made here, with its reasoning), **owner** (the owner's decision, which
outranks every other authority) or **unresolved**.

The authorities rank: **owner → official digital → official rulebook → community → project**.
The owner decided that this game plays as [GD] does under its ranked settings: its players
know that game, and its bots are ported here to measure ours against, so the two must play the
same game. What [GD] does is therefore the rule wherever it is known, and the rulebooks settle
only what [GD] leaves open or what could not be read from it. Where neither settles it, an
established community answer does. When research finds none of these, the ruling is made as a
game designer would: keep the heart of the game, weigh it from the players' standpoint, and
draw on modern digital adaptations. "Decided against the rulebook" lists where the result
departs from a rule the classic rulebook states clearly. A ruling goes to the owner only when
it would fork the engine or the technical architecture. The engine is definitive: an ambiguity
is never put to players at runtime. An engine event that applies a ruling may cite its note id.

## Editions and sources

The rules come from two official rulebooks, cited by tag after each section:

- **[R93]** Parker Brothers, *Risk* rules, the edition copyrighted 1959–1993 (product 00044).
  This is the **classic** rulebook and the primary source: 2–6 players, 6 armies.
- **[H15]** Hasbro, *Risk* Game Guide B7404 (©2015); the Hasbro E9402 guide (©2020) carries the
  same Classic and 2-player text. This is the **current** rulebook: 2–5 players, 5 armies.
- **[FAQ]** The long-running *Risk FAQ* (University of Kent), used only for edition history.
- **[GD]** *RISK: Global Domination* (SMG Studio), the official Hasbro-licensed digital game, in
  its Classic map's World Domination mode. SMG built its rules with Hasbro from the 1993 and
  2003 rulebooks, so it is the official answer to how those rules play on a screen. The
  strongest evidence is **the shipped game's own behaviour**, read from its code and map data
  (the reverse-engineering notes are kept outside this repo); then SMG's help pages (its
  support site and the game's FAQ page) and patch notes; community reports of how it behaves
  (Steam discussions, the fan wiki, player guides) are labelled as such where they are the only
  source. What a player may know is what [GD]'s screen shows them, never what its code holds:
  its game state carries what no player is shown (other players' hands, the deck's order), so
  a fact is public only when [GD] shows it to every player.

[GD] is configurable. This spec follows **the settings its ranked games use**: Classic map,
World Domination, **Auto Placement** (`SETUP-4`, `SETUP-5`), **Fixed** card bonus (`CARDS-6`),
**Balanced Blitz** dice (`COMBAT-8`), one fortify per turn (`FORT-1`), unlimited troops per
territory, and alliances, Fog of War, Blizzards and Portals off. Alliances are on in ranked
play, but they bind nobody (allies may still attack each other, and share nothing) and [GD]'s
bots never take part in one, so they are a chat convention, not a rule, and are not built. The
rest of its options are **not** part of this game: Progressive, Exponential and Per-Player card
bonuses; Manual Placement; True Random dice; the Capitals, Secret Mission, Secret Assassin and
Zombie modes; 70% domination and limited-turn victories; Sandbox's custom starting troops,
continent bonuses and wild-card counts; and turn timers and inactivity bots, which are lobby
matters, not rules.

The 2008 "Revised Edition" is a different game for cards and victory (star-valued cards,
capitals, objectives) and is **not** a source for this spec.

Where [R93] and [H15] differ on a point [GD] leaves open, the classic [R93] rule is the rule
here and the difference is noted. Rules marked *(derived)* follow from the official rules rather than being stated in them;
they are invariants an engine must hold.

## Terms

- **Army**: one unit on a territory. Piece denominations (infantry 1, cavalry 5, artillery 10)
  are a counting aid only and have no rules effect. [R93]
- **Owner**: the player whose armies occupy a territory.
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

The symbols are [GD]'s Classic deck, read from its map data: **13 infantry, 14 cavalry and 15
artillery**.

| Symbol | Territories |
|---|---|
| Infantry (13) | Afghanistan, Alaska, Alberta, Eastern Australia, Egypt, Iceland, India, Irkutsk, Japan, Madagascar, North Africa, Western Europe, Western United States |
| Cavalry (14) | Argentina, Central America, China, Congo, Great Britain, Greenland, Indonesia, Kamchatka, New Guinea, Northern Europe, Peru, Southern Europe, Ural, Yakutsk |
| Artillery (15) | Brazil, East Africa, Eastern United States, Middle East, Mongolia, Northwest Territory, Ontario, Quebec, Scandinavia, Siam, Siberia, South Africa, Ukraine, Venezuela, Western Australia |

> Note [card-symbols]: the rulebooks do not print the full list, and the physical 1993 deck
> deals 14 of each symbol, assigned differently.
> Resolution (official digital): [GD]'s deck. Under Fixed values (`CARDS-6`) the symbol sets a
> set's worth, so the deck is part of the game its players know.

The symbol decides which hands form sets and what they are worth; the territory matters only
for the occupied-territory bonus (`CARDS-7`).

### DECK-3 Dice and armies

Dice are fair six-sided dice. The attacker uses up to 3, the defender up to 2. A blitz is not
rolled die by die: it is resolved by Balanced Blitz (`COMBAT-8`). Army supply is
unlimited: running out of pieces never limits a player ([H15] FAQ: use substitutes). [R93],
[H15]

---

## 3. Setup

### SETUP-1 Player count and starting armies

The game is for **3–6 players**; a game with fewer must not start. Each player starts with:
[R93]

| Players | Armies each |
|---|---|
| 3 | 35 |
| 4 | 30 |
| 5 | 25 |
| 6 | 20 |

([H15] has the same values for 3–5 and has no 6-player game. [GD]'s default, Legacy, starting
troops are the same.) Later seats get extra armies on their first turn instead (`REINF-6`).

> Note [two-players]: both rulebooks have a 2-player game, played with a third, neutral army as
> a buffer.
> Resolution (owner): no 2-player game. With bots to fill seats, two people who want to play
> can always fill a table, so a 2-player variant would only add rules of its own to build, test
> and tune bots for.

### SETUP-2 Seat order

Players sit in a fixed cyclic order, drawn at the start of the game (`SETUP-3`) and kept for
the whole game. "To the left" means the next player in that order. All rotation (dealing,
turns) follows it.

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

### SETUP-4 Dealing territories

The 2 wilds are set aside and the 42 territory cards shuffled and dealt one at a time round the
seat order, starting with the first player. Each territory dealt to a player gets **1 army** of
theirs, and they own it. With 4 or 5 players the deal comes out uneven: the first two in
rotation receive one territory more (4 players: 11, 11, 10, 10; 5 players: 9, 9, 8, 8, 8);
with 3 and 6 players everyone receives 14 or 7.

### SETUP-5 Placing the remaining armies

Then each player's remaining starting armies (`SETUP-1`, less the armies on their dealt
territories) are placed **one at a time, each on a territory they own chosen uniformly at
random**, from the game's seeded random source. There is no limit on armies per territory.
Nobody makes a decision during setup: the game begins at the first player's first turn
(`SETUP-7`).

> Note [auto-placement]: the classic rulebook has players claim the territories one at a time
> and then place their remaining armies one at a time in rotation; both rulebooks deal the
> territories only in the Secret Mission game. [GD] offers two setups: **Auto Placement**, where
> territories and starting troops are placed at random and the first turn starts at once, and
> **Manual Placement**, where players claim one territory at a time and then place troops one at
> a time (the Level Winner guide). Auto is what players report as its default (a player review:
> "random placement" is on by default) and what ranked play uses (a ranked player's filters
> show "Manual Placement: AUTO").
> Resolution (owner): Auto Placement, as in [GD]. Setup by hand is the slowest part of an online
> game, every pick waiting on that player, and random setup is what [GD]'s own players choose
> for competitive play. Manual Placement is not built: a claim phase, and then players placing
> their dealt territories' armies, existed early on and were removed; git history keeps them.
> [GD] has no "Semi-automatic" placement (territories dealt, troops placed by the players), as
> this spec once said: the only trace of one is a player's request for it on Steam.

Notes `dealt-setup`, `placement-start` and `placement-pace` are retired with the players'
placement.

### SETUP-6 The deck

After the starting armies are placed, the 2 wilds are returned and all 44 cards (`DECK-1`)
shuffled and placed face down as the deck. [R93]

### SETUP-7 First turn

The first player (`SETUP-3`) takes the first turn, straight after setup; play proceeds in seat
order. [R93], [H15]

### SETUP-8 (retired)

Formerly "dealt territories are not used"; dealing is now the setup (`SETUP-4`).

### SETUP-9 Setup invariants *(derived)*

At the end of setup, which is the game as it begins: every territory has exactly one owner, its
dealt one (`SETUP-4`), and at least 1 army; each player's
army total on the board equals their `SETUP-1` count; the deck holds all 44 cards and every
hand is empty.

---

## 4. Turn structure

### TURN-1 Phases

A turn has three phases, **in this order**: [R93], [H15]

1. **Reinforce**: receive new armies (`REINF-*`), trading cards if wanted or required
   (`CARDS-*`), and place them all.
2. **Attack**: any number of battles, including none (`COMBAT-*`).
3. **Fortify**: at most one fortifying move, which is optional (`FORT-*`).

After the fortify phase, the card for the turn is drawn (`CARDS-1`).

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

### REINF-6 First-turn bonus for later seats

On each player's first turn only, the players later in the turn order (`SETUP-3`) receive extra
armies, by their position in it: [GD]

| Players | 1st | 2nd | 3rd | 4th | 5th | 6th |
|---|---|---|---|---|---|---|
| 3 | 0 | 0 | 1 | | | |
| 4 | 0 | 0 | 0 | 1 | | |
| 5 | 0 | 0 | 0 | 1 | 2 | |
| 6 | 0 | 0 | 0 | 1 | 2 | 3 |

> Note [seat-bonus]: neither rulebook has it; it offsets the advantage of moving early.
> Resolution (official digital): as [GD], which adds it to every player's first reinforcement,
> ranked games included. [GD] indexes it by its own player index, read here as the position in
> the turn order, since compensating a later move is what it is for.

---

## 6. Cards

### CARDS-1 Earning a card

At the end of a turn, after the fortify phase, a player who **captured at least one
territory** during that turn draws the **top card of the deck**: exactly one card, no matter how
many territories they captured. A player who captured none draws nothing. [GD]

> Note [draw-time]: [R93] and [H15] draw at the end of the attack, before fortifying; [GD]
> draws as the turn ends. Nothing in the fortify phase depends on the hand, so the two play the
> same.
> Resolution (official digital): as [GD].

### CARDS-2 Hands

A player's hand is hidden from other players except for its size *(derived: standard
play; the rulebooks say only that cards are held)*. Cards in hand are never lost except by
trading or by being taken on elimination (`ELIM-2`).

Public information is shown to every player: each hand's size, every trade made (its cards
and any occupied-territory bonus), how many cards were taken on each elimination, and what each
kind of set is worth (`CARDS-6`). The cards taken on an elimination are seen only by the player
who takes them, and stay hidden from everyone else until they are traded.

> Note [public-cards]: at a table, traded cards go face up, so an attentive player can track
> them, but only by memory.
> Resolution (official digital): anything a player could legally see at the table is shown on
> screen, as [GD] does: its battle log records every trade with its cards' combination and any
> occupied-territory bonus (SMG's v2.8 patch notes and support FAQ), and each elimination with
> only the number of cards seized. Its shipped code shows the seized cards themselves to the
> player who takes them alone: the battle log's elimination entry is given only a count, and the
> announcement that shows the seized cards plays only on that player's own device. Memory is a
> table limitation, not the game's skill. (With Fog of War, which is not used here, [GD] hides
> these.)

### CARDS-3 Valid sets

A set is three cards that are one of: [R93], [H15]

- three cards of the same symbol;
- one card of each of the three symbols;
- any two cards plus a wild.

*(derived)* A wild therefore stands for any symbol.

> Note [two-wilds]: neither rulebook says whether a set may hold both wilds.
> Resolution (official digital): it may. [GD] counts a set as valid when its wilds make up
> the symbols missing from three of a kind or one of each, so a set may hold both wilds, and
> its Classic deck holds 2.

### CARDS-4 Every hand of five holds a set *(derived)*

Any 5 cards contain at least one valid set. (Without a wild, 5 cards over 3 symbols either
repeat one symbol three times or show all three; with a wild, the other 4 cards supply any two.)
This is what makes the forced trades of `CARDS-5` and `ELIM-3` always possible; a test should
check it exhaustively over symbol multisets.

### CARDS-5 Trading at the start of a turn

During the reinforce phase, before placing, a player **may** trade any sets they hold, one
after another, and a player holding **5 or more** cards **must** trade until they hold 4 or
fewer. [GD]

Trades are made only at this time, except the forced trade of `ELIM-3`. A player must not trade
during the attack or fortify phase, or during another player's turn. The player chooses which
cards form each set.

*(derived)* A hand never holds more than 5 cards at the start of a turn (4 at most after the
reinforce phase, plus the card drawn as the turn ended), so the most sets a turn can trade
here is one; and never more than 4 once the reinforce phase ends (see `INV-6`).

> Note [trade-timing]: [GD] lets a player trade at any point of its deploy phase, before or
> between placements; trades here come first.
> Resolution (project): trades before placing. No information arrives during placement and
> the occupied-territory armies go on their own territory either way, so the order changes no
> decision, and trading first keeps the phase one step simpler.

### CARDS-6 Set values

A set is worth a fixed number of armies by its symbols, the same all game: [GD]

| Set | Armies |
|---|---|
| Three infantry | 4 |
| Three cavalry | 6 |
| Three artillery | 8 |
| One of each | 10 |

A wild counts as whichever symbol makes the set worth most: a wild with two cards of one
symbol is that symbol's three of a kind; a wild with two different symbols, or two wilds with
any card, is one of each (10).

> Note [card-values]: [R93] and [H15] escalate the value with every set traded in the game
> (4, 6, 8, 10, 12, 15, then 5 more each), and list fixed values by symbol only as a variant.
> Resolution (owner): Fixed, as [GD]'s ranked games play.

### CARDS-7 Occupied-territory bonus

If any of the three cards in a traded set shows a territory the trading player owns at the time
of the trade, the player receives **2 extra armies**, which must both be placed on that
territory. [R93], [H15]

Each set traded earns this bonus **at most once**: a set showing several owned territories
still earns only 2 extra armies, on one of them, which the trading player chooses. A player
trading two sets in one turn can earn it once for each. Wild cards show no territory and never
qualify.

> Note [territory-bonus]: [R93] caps the bonus at 2 per turn, [H15] has no cap at all, and
> neither rulebook says who picks the territory when several cards qualify.
> Resolution (owner): 2 per trade, as in [GD] ("will only apply once per card trade", SMG's card
> trading help).
> Resolution (official digital): the trading player picks which qualifying card earns the 2.
> [GD] gives it to the first qualifying card in the order the player selected the set's cards,
> which is the same choice; it puts the 2 straight onto that territory.

### CARDS-8 Traded cards and the deck

Traded cards go straight back into the deck, each at a random position below its top 3 cards
(anywhere, when the deck holds 3 or fewer). If the deck is empty when a card is due, no card is
drawn. [GD]

> Note [empty-deck]: the rulebooks put traded cards on a face-up discard pile and don't cover
> an empty deck.
> Resolution (official digital): as [GD], whose cards "are cycled in a game so we do not run
> out of them" (SMG's card trading help) by going back into the deck as they are traded. The
> deck runs out only when every card is in a hand.

*(derived)* Every card is always in exactly one place: the deck or one player's hand; the 44
cards are conserved.

---

## 7. Combat

### COMBAT-1 Legal attack

The active player may declare a battle from territory `S` to territory `D` only if: [R93],
[H15]

- the active player owns `S`;
- `D` is owned by an opponent;
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

- at least as many armies as the number of dice they rolled in that battle, or, after a blitz
  (`COMBAT-8`), which rolls no dice, at least 3, or all that can move if fewer; [GD]
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

### COMBAT-8 Blitz (Balanced Blitz)

Instead of a single battle, the attacker may **blitz**: fight `S` against `D` until `D` is
captured or `S` is down to a number of armies they choose, at least 1. A blitz is not rolled
battle by battle: it is resolved in one step, from the odds of the whole fight, reshaped as
[GD]'s Balanced Blitz reshapes them. With `a` armies able to attack (the armies in `S` less the
number it stops at) and `d` defenders:

1. **The fair odds.** The exact chance of every way the fight can end, fought to the end under
   `COMBAT-2` to `COMBAT-4` with the most dice on both sides: the attacker capturing having lost
   0, 1, … `a − 1` armies, or the attacker stopped having taken 0, 1, … `d − 1` defenders.
2. **No long shots.** A side whose chance of winning is 5% or less loses for certain.
3. **The favourite favoured.** The attacker's chance `p` becomes `p^1.3 / (p^1.3 + (1 − p)^1.3)`;
   each side's outcomes keep their proportions within that side.
4. **No flukes.** With the outcomes in order from best for the attacker to best for the
   defender, the 10% of chance at each end (the luckiest captures and the luckiest holds) is cut
   away and the rest scaled back to a whole; a 50% fight stays 50%, and others move further
   toward the favourite, to `(p − 0.1) / 0.8` of the step-3 chance.
5. **The likeliest results.** Each outcome's chance is raised to the power 1.8 and each side's
   outcomes scaled back to that side's chance, so a blitz ends near its typical result.

One outcome is then drawn from that distribution with a single random number: a capture costs
the attacker that outcome's losses, and a failed blitz leaves `S` at the number it stopped at
with the defender down by its losses. [GD]

A fight of more than 2,000 armies on both sides together uses [GD]'s estimate of the fair odds
in step 1, which it fits from smaller fights of the same proportions, and one of more than
100,000 is rolled battle by battle with fair dice. The exact procedure, constants included, is
[GD]'s, and the engine reproduces it.

A single battle (`COMBAT-4`), with the dice the attacker chooses, is always rolled with fair dice.

> Note [balanced-blitz]: the rulebooks have only dice. [GD] offers fair blitzes (True Random)
> and Balanced Blitz, which its ranked games use; it tells players only that balancing trims
> unlikely results.
> Resolution (owner): Balanced Blitz, as [GD]'s ranked games play.

---

## 8. Fortify

### FORT-1 The fortifying move

In the fortify phase the active player **may** make **one** move: move any number of armies
from one territory they own to another territory they own that is **connected to it through a
chain of territories the player owns** (adjacent territories included), leaving at least 1
army in the territory moved from. It is optional, and it is allowed whether or not the player
attacked or captured anything. [H15], [GD]

### FORT-2 Edition difference: adjacent only

[R93], the classic rulebook, allows the move only to an **adjacent** territory. [FAQ] reports
the connected path in the 1980 US edition too.

> Note [fortify-reach]: the editions disagree on how far a fortifying move reaches.
> Resolution (owner): the connected path, as in [H15] and [GD] (SMG's fortify help: troops
> "travel between connecting territories"). It is what players of the official digital game
> expect.

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

If taking those cards gives the active player **5 or more** cards, they must immediately trade
sets until they hold **4 or fewer**, and must stop as soon as they do. With **4 or fewer**,
they must not trade until the start of their next turn. [GD]

The capturing move-in (`COMBAT-6`) comes first. Then the player takes the cards, makes the
forced trades, and places the armies from them (valued by `CARDS-6`, with `CARDS-7`'s bonus
once per set) at once, on any territories they own, before the next battle. The player then
continues their turn in the attack phase.

> Note [elimination-threshold]: [R93] and [H15] force the trade at 6 or more cards; SMG's help
> says "more than 5".
> Resolution (official digital): 5 or more, as the shipped game does for every player, the
> same limit its deploy phase holds a hand to (`CARDS-5`).

> Note [elimination-order]: the rules don't order the move-in against the forced trade, or say
> where and when the traded armies go.
> Resolution (official digital): trade and place at once, as [GD] does: the forced trade puts
> the player "back into the draft phase and extend[s] your turn" (SMG's card trading help), so
> the new armies can join the rest of the attack, which is the point of the mid-turn trade.
> The move-in comes first, as `COMBAT-6` says the move is immediate.

*(derived)* The number of trades is fixed by the hand size: one trade from 5 to 7 cards, two
from 8 to 10, and so on; the player chooses only which cards.

### ELIM-4 Drawn card does not force a trade

If the card drawn as the turn ends (`CARDS-1`) brings a hand to 5, the player trades at the
start of their next turn (`CARDS-5`). Only `ELIM-3` permits a mid-turn trade. [R93], [H15]

### WIN-1 Winning

A player wins the moment they own all 42 territories, which is the moment the last opponent is
eliminated. The game ends at once: no card is drawn and no forced trade or fortify follows.
[R93], [H15]

---

## 10. The 2-player game (retired)

The rulebooks' 2-player game is not offered (note `two-players`). Its rule ids, `TWO-1` to
`TWO-7`, are retired.

---

## 11. Invariants an engine must hold

These follow from the rules above; the engine must hold them after every action, and tests
should check them after every step of random and scripted games.

- **INV-1 Ownership.** From the start of the game, every territory has exactly one owner and at least 1 army.
  No territory is ever empty or owned by nobody, including in the moment of capture
  (`COMBAT-6`).
- **INV-2 Army conservation.** Once the game has begun, the total armies on the board change
  only by: reinforcement placement (+), and combat losses (− exactly `min(attacker dice, defender dice)` per battle,
  and a blitz's drawn losses). Capture move-ins and fortifying moves change no total.
- **INV-3 Phase order.** Within a turn, phases occur in the order of `TURN-1`; no battle before
  all reinforcements are placed; no battle after fortifying; at most one fortifying move.
- **INV-4 Cards conserved.** Exactly 44 cards across the deck and hands (`CARDS-8`); at most
  one card drawn per turn.
- **INV-5 Trade values.** Each trade is worth what `CARDS-6` gives its three cards, whatever was
  traded before it.
- **INV-6 Hand sizes.** At the start of a turn a hand holds at most 5 cards; after the
  reinforce phase, at most 4; in the attack phase, at most 4 except while an `ELIM-3` trade is
  due; after the draw as the turn ends, at most 5 *(derived from `CARDS-1`, `CARDS-5`,
  `ELIM-3`)*.
- **INV-7 Bonus cap.** At most 2 occupied-territory bonus armies per set traded (`CARDS-7`).
- **INV-8 Elimination.** A player with no territories takes no turn and holds no cards; a player
  with at least one territory is in the game.
- **INV-9 Game end.** The game ends exactly when one player remains, and no action is legal
  afterwards.
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
- *RISK: Global Domination* itself (the Steam build), its code and Classic map data read
  without running or modifying the game — [GD]: the card symbols (`DECK-2`), set values and
  trades (`CARDS-5` to `CARDS-8`), the first-turn bonus (`REINF-6`), Balanced Blitz
  (`COMBAT-8`), the forced trade after an elimination (`ELIM-3`), and the settings of its ranked
  games. The notes from that reading are kept outside this repo.
- SMG Studio, *RISK: Global Domination* help (official) — [GD]:
  - support site, RISK section: <https://smgstudio.freshdesk.com/support/solutions/11000001507>,
    in particular "Is RISK: Global Domination based on official rules?" (11000025091),
    "WIKI - Card Trading" (11000121591), "WIKI - Fortify" (11000121590), "WIKI - Manual Roll"
    (11000121592), "WIKI - Attack Blitz Roll" (11000121588), "WIKI - Draft" (11000121587),
    "Our RISK AI" (11000077687), and the FAQs on manual placement (11000024861) and the card
    bonus (11000024864, 11000025058); each at
    `https://smgstudio.freshdesk.com/support/solutions/articles/<id>`;
  - the game's FAQ page: <https://www.hasbrorisk.com/faq>;
  - patch notes on Steam: v2.8 (battle log), "Sandbox is
    here!" (card modes, starting-troop modes, wild-card count), and "Blitz Dice Updates"
    (Balanced Blitz): <https://steamcommunity.com/app/1128810/allnews/>.
- [GD] community sources, labelled where cited: Steam discussions
  <https://steamcommunity.com/app/1128810/discussions/0/3123786900666062429/> (no adjacent-only
  fortify; picking the +2 card),
  <https://steamcommunity.com/app/1128810/discussions/0/5154944131318165492/> (wild cards in
  sets); the Level Winner player guide
  <https://www.levelwinner.com/risk-global-domination-guide-tips-tricks-strategies/> (default
  settings, claiming one at a time, connected fortify) and its Auto and Manual Placement
  <https://www.levelwinner.com/?p=79004>; Steam discussions on placement: a ranked player's
  filters showing Manual Placement: AUTO
  <https://steamcommunity.com/app/1128810/discussions/0/787664259085522442>, a review saying
  random placement is on by default
  <https://steamcommunity.com/app/1128810/discussions/0/2639622942685356416>, and the 2020
  request for a semi-automatic mode
  <https://steamcommunity.com/app/1128810/discussions/0/2259061617876729615>; the fan wiki
  <https://risk-global-domination.fandom.com/> (1v1 play).

---

## Decided against the rulebook

Where [GD]'s ranked game differs from a rule the classic rulebook states clearly, the owner
decided that [GD] applies, except for the 2-player game. These are those departures; the rules
above already state them.

- **Setup** (`SETUP-4`, `SETUP-5`, note `auto-placement`): territories are **dealt** and the
  remaining starting armies **placed at random**, as in [GD]'s Auto Placement, not claimed and
  placed by the players one at a time as in [R93].
- **Fortify reach** (`FORT-1`, note `fortify-reach`): along a **connected path** of owned
  territories, as in [GD] and [H15], not only to an adjacent one as in [R93].
- **Occupied-territory bonus** (`CARDS-7`, note `territory-bonus`): at most 2 **per trade**, as
  in [GD], not 2 per turn as in [R93].
- **Card values** (`CARDS-6`, note `card-values`): **Fixed** by symbol (4, 6, 8, 10), as in
  [GD]'s ranked games, not escalating as in both rulebooks.
- **Card symbols** (`DECK-2`): [GD]'s deck, 13 infantry, 14 cavalry and 15 artillery, not the
  1993 deck's 14 of each.
- **Traded cards** (`CARDS-8`): back into the deck at once, as in [GD], not onto a discard pile.
- **Card draw** (`CARDS-1`): as the turn ends, after fortifying, as in [GD], not at the end of
  the attack.
- **Blitz** (`COMBAT-8`, note `balanced-blitz`): resolved by [GD]'s Balanced Blitz, not by fair
  dice; single battles keep fair dice.
- **First-turn bonus** (`REINF-6`): later seats get extra armies on their first turn, as in
  [GD]; the rulebooks have none.
- **Forced trade after an elimination** (`ELIM-3`, note `elimination-threshold`): at 5 cards,
  as in [GD], not 6.
- **Two players** (`SETUP-1`, note `two-players`): **not offered**; a game needs 3 to 6
  players, with bots filling seats. Both rulebooks and [GD] have a 2-player game; this is the
  one place the owner departs from [GD].

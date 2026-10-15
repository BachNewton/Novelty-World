// Generated from RULES.md by write-rules-data.ts. Don't edit by hand.

import type { RuleText } from "./rules-text";

export const RULES: Readonly<Record<string, RuleText>> = {
  "MAP-1": {
    "title": "Territories and continents",
    "paragraphs": [
      "The board has exactly 42 territories in exactly 6 continents. Each territory belongs to exactly one continent. Names are the classic rulebook board's.",
      "The bonus column is the continent's reinforcement value (REINF-3). The bonuses sum to 24.",
      "Later boards rename some territories (for example Quebec as Eastern Canada, Ukraine as Russia, Congo as Central Africa, Siam as Southeast Asia, Central America as Mexico); the map's shape and adjacency are unchanged. The engine may display any naming, but data and tests use the names above."
    ]
  },
  "MAP-2": {
    "title": "Adjacency",
    "paragraphs": [
      "Two territories are adjacent when they share a border or are joined by a sea line (a dashed line on the board). Adjacency is the only relation the rules use; whether a link is a land border or a sea line has no rules effect. Alaska and Kamchatka are adjacent across the board's edge.",
      "The full adjacency list (each territory's neighbours):",
      "The the classic rulebook text confirms, as examples: Greenland is adjacent to Northwest Territory, Ontario, Quebec and Iceland; North Africa to Egypt, Western Europe and Brazil (among others); Alaska to Kamchatka."
    ]
  },
  "MAP-3": {
    "title": "Map invariants (derived)",
    "paragraphs": [
      "A test of the map data must check:",
      "• exactly 42 territories, 6 continents, with the per-continent counts of MAP-1;",
      "• adjacency is symmetric (A lists B if and only if B lists A) and irreflexive;",
      "• exactly 83 adjacent pairs;",
      "• the graph is connected;",
      "• the inter-continent links are exactly: Alaska–Kamchatka, Greenland–Iceland, Central America–Venezuela, Brazil–North Africa, Western Europe–North Africa, Southern Europe–North Africa, Southern Europe–Egypt, Southern Europe–Middle East, Ukraine–Middle East, Ukraine–Afghanistan, Ukraine–Ural, Egypt–Middle East, East Africa–Middle East, Siam–Indonesia (14 pairs)."
    ]
  },
  "DECK-1": {
    "title": "The card deck",
    "paragraphs": [
      "The Risk deck for this game has 44 cards: 42 territory cards, one per territory, each showing one symbol (infantry, cavalry or artillery), and 2 wild cards showing all three symbols and no territory. Mission cards are not used."
    ]
  },
  "card-symbols": {
    "title": "Note: card symbols",
    "paragraphs": [
      "31 of the 42 symbols are not verified against a physical deck.",
      "Resolution (community): adopt this list. It matches every card that could be verified, and the design only needs 14 of each symbol; which territory carries which symbol affects which hands form sets, never the engine's structure. Check the rest against a physical 1993 deck if one turns up. The official digital game's Classic deck could not be read to confirm its symbols."
    ]
  },
  "DECK-2": {
    "title": "Symbol assignment",
    "paragraphs": [
      "There are 14 cards of each symbol. The assignment, by the classic rulebook board's names:",
      "Provenance: the rulebooks do not print the full list. This table is a community transcription that agrees with every card of the classic rulebook-era Parker Brothers deck found attested individually: the classic rulebook rulebook's sample cards (Argentina infantry, India cavalry) and single-card listings of the 1993 deck (Kamchatka infantry; Ural, Ukraine, Siberia, Irkutsk and Ontario cavalry; South Africa, Japan and Southern Europe artillery). That is 11 of 42 verified; fan implementations elsewhere disagree with each other and with these attested cards.",
      "The symbol matters only for forming sets; the territory matters only for the occupied-territory bonus (CARDS-7)."
    ]
  },
  "DECK-3": {
    "title": "Dice and armies",
    "paragraphs": [
      "Dice are fair six-sided dice. The attacker uses up to 3, the defender up to 2. Army supply is unlimited: running out of pieces never limits a player (the 2015 rulebook FAQ: use substitutes)."
    ]
  },
  "two-players": {
    "title": "Note: two players",
    "paragraphs": [
      "both rulebooks have a 2-player game, played with a third, neutral army as a buffer.",
      "Resolution (owner): no 2-player game. With bots to fill seats, two people who want to play can always fill a table, so a 2-player variant would only add rules of its own to build, test and tune bots for."
    ]
  },
  "SETUP-1": {
    "title": "Player count and starting armies",
    "paragraphs": [
      "The game is for 3–6 players; a game with fewer must not start. Each player starts with:",
      "(the 2015 rulebook has the same values for 3–5 and has no 6-player game. The official digital game sets its starting troops by player count too, but its numbers could not be confirmed.)"
    ]
  },
  "SETUP-2": {
    "title": "Seat order",
    "paragraphs": [
      "Players sit in a fixed cyclic order, drawn at the start of the game (SETUP-3) and kept for the whole game. \"To the left\" means the next player in that order. All rotation (dealing, placing, turns) follows it."
    ]
  },
  "first-player": {
    "title": "Note: first player",
    "paragraphs": [
      "The classic rulebook and the 2015 rulebook have each player roll a die, highest first, with no tie rule. The roll is the table's way of picking at random; who sits next to whom is wherever people sat down.",
      "Resolution (official digital): the official digital game makes the player order \"completely random\" (SMG's support article on its AI). A random draw is the same distribution as the roll, needs no tie rule, and costs players nothing to watch; drawing the whole order, not only the first player, also replaces the table's seating, which a screen does not have."
    ]
  },
  "SETUP-3": {
    "title": "Player order",
    "paragraphs": [
      "The engine draws the seat order at random, every ordering equally likely, from the game's seeded random source. The first seat is the first player."
    ]
  },
  "dealt-setup": {
    "title": "Note: dealt setup",
    "paragraphs": [
      "The classic rulebook has players claim territories one at a time; both rulebooks deal them only in the Secret Mission game.",
      "Resolution (owner): territories are dealt, as in the official digital game's Semi-automatic placement (random territories, armies placed by the players). Claiming 42 territories in turn is slow online, where every human pick waits on that player. Dealing keeps the opening placement decisions: only who owns what at the start is left to chance. The official digital game's default, Automatic placement, also places the armies at random, and is not used."
    ]
  },
  "SETUP-4": {
    "title": "Dealing territories",
    "paragraphs": [
      "The 2 wilds are set aside and the 42 territory cards shuffled and dealt one at a time round the seat order, starting with the first player. Each player places 1 army on each territory dealt to them, which they then own. With 4 or 5 players the deal comes out uneven: the first two in rotation receive one territory more (4 players: 11, 11, 10, 10; 5 players: 9, 9, 8, 8, 8); with 3 and 6 players everyone receives 14 or 7."
    ]
  },
  "placement-start": {
    "title": "Note: placement start",
    "paragraphs": [
      "The rules don't say who places first after the territories are out.",
      "Resolution (project): one unbroken rotation, continuing from the player after the last territory dealt. Players dealt an extra territory have one army fewer to place, and starting placement with them would add an early placement on top. The official digital game's order here could not be confirmed."
    ]
  },
  "placement-pace": {
    "title": "Note: placement pace",
    "paragraphs": [
      "placing one army at a time in rotation is design, not a table limitation: each placement answers the others'. It stays one at a time in the rules; how the screen lets a player make those placements quickly is a UI matter."
    ]
  },
  "SETUP-5": {
    "title": "Placing the remaining armies",
    "paragraphs": [
      "Once the territories are dealt, players take turns round the seat order, each placing exactly one army on a territory they own, until every player has placed all their starting armies. A player with none left is skipped. There is no limit on armies per territory. Placement starts with the player after the one dealt the last territory."
    ]
  },
  "SETUP-6": {
    "title": "The deck",
    "paragraphs": [
      "After the deal, the 2 wilds are returned and all 44 cards (DECK-1) shuffled and placed face down as the draw pile."
    ]
  },
  "SETUP-7": {
    "title": "First turn",
    "paragraphs": [
      "The first player (SETUP-3) takes the first turn; play proceeds in seat order."
    ]
  },
  "SETUP-8": {
    "title": "(retired)",
    "paragraphs": [
      "Formerly \"dealt territories are not used\"; dealing is now the setup (SETUP-4)."
    ]
  },
  "SETUP-9": {
    "title": "Setup invariants (derived)",
    "paragraphs": [
      "At the end of setup: every territory has exactly one owner and at least 1 army; each player's army total on the board equals their SETUP-1 count; the draw pile holds all 44 cards and every hand is empty; the set-trade counter is 0."
    ]
  },
  "TURN-1": {
    "title": "Phases",
    "paragraphs": [
      "A turn has three phases, in this order:",
      "1. Reinforce: receive new armies (REINF-), trading cards if wanted or required (CARDS-), and place them all. 2. Attack: any number of battles, including none (COMBAT-). 3. Fortify: at most one fortifying move, which is optional (FORT-).",
      "Between the attack and fortify phases, the card for the turn is drawn (CARDS-1)."
    ]
  },
  "TURN-2": {
    "title": "Rotation",
    "paragraphs": [
      "After the fortify phase the turn passes to the next player in seat order who is still in the game. Eliminated players are skipped for the rest of the game."
    ]
  },
  "REINF-1": {
    "title": "When",
    "paragraphs": [
      "Reinforcements are counted and placed at the beginning of every turn, including each player's first. All reinforcements earned in this phase must be placed before the first battle of the turn."
    ]
  },
  "REINF-2": {
    "title": "Territory armies",
    "paragraphs": [
      "The player receives max(3, floor(T / 3)) armies, where T is the number of territories they own at the start of the turn. Examples: 11 → 3, 14 → 4, 17 → 5; any T below 9 → 3."
    ]
  },
  "REINF-3": {
    "title": "Continent bonuses",
    "paragraphs": [
      "For each continent whose territories the player all owns at the start of the turn, they receive that continent's bonus (MAP-1). Bonuses stack across continents."
    ]
  },
  "REINF-4": {
    "title": "Card armies",
    "paragraphs": [
      "Armies from sets traded this phase (CARDS-5, CARDS-6) and the occupied-territory bonus (CARDS-7) are added."
    ]
  },
  "REINF-5": {
    "title": "Placement",
    "paragraphs": [
      "Reinforcement armies may be placed on any territory the player owns, in any distribution, including continent bonuses (which need not be placed in their continent). Occupied-territory bonus armies are the exception: they must go on their pictured territory (CARDS-7). Armies must not be placed on a territory the player does not own."
    ]
  },
  "CARDS-1": {
    "title": "Earning a card",
    "paragraphs": [
      "At the end of a turn's attack phase, a player who captured at least one territory during that turn draws the top card of the draw pile: exactly one card, no matter how many territories they captured. A player who captured none draws nothing. The card is drawn before the fortify phase."
    ]
  },
  "public-cards": {
    "title": "Note: public cards",
    "paragraphs": [
      "at a table, traded cards go face up, so an attentive player can track them, but only by memory.",
      "Resolution (official digital): anything a player could legally see at the table is shown on screen, as the official digital game does: its battle log records every trade with its cards' combination, any occupied-territory bonus, and the cards seized on an elimination, and its card screen marks the current trade value (SMG's v2.8 patch notes and support FAQ). Memory is a table limitation, not the game's skill. (With Fog of War, which is not used here, the official digital game hides these.)"
    ]
  },
  "CARDS-2": {
    "title": "Hands",
    "paragraphs": [
      "A player's hand is hidden from other players except for its size (derived: standard play; the rulebooks say only that cards are held). Cards in hand are never lost except by trading or by being taken on elimination (ELIM-2).",
      "Public information is shown to every player: each hand's size, the discard pile (every card ever traded, CARDS-8), the game-wide trade counter and the value of the next set."
    ]
  },
  "two-wilds": {
    "title": "Note: two wilds",
    "paragraphs": [
      "neither rulebook says whether a set may hold both wilds.",
      "Resolution (project): it may. The the classic rulebook wording \"any 2 plus a wild\" allows a wild among the two, and there is no design reason to forbid it. The official digital game appears to allow it (a Steam answer says \"you can use any number of wild cards\", and SMG's patch notes speak of its trade suggestions offering \"an extra wild\"), but no SMG source states it, nor how many wilds its Classic deck holds."
    ]
  },
  "CARDS-3": {
    "title": "Valid sets",
    "paragraphs": [
      "A set is three cards that are one of:",
      "• three cards of the same symbol;",
      "• one card of each of the three symbols;",
      "• any two cards plus a wild.",
      "(derived) A wild therefore stands for any symbol."
    ]
  },
  "CARDS-4": {
    "title": "Every hand of five holds a set (derived)",
    "paragraphs": [
      "Any 5 cards contain at least one valid set. (Without a wild, 5 cards over 3 symbols either repeat one symbol three times or show all three; with a wild, the other 4 cards supply any two.) This is what makes the forced trades of CARDS-5 and ELIM-3 always possible; a test should check it exhaustively over symbol multisets."
    ]
  },
  "CARDS-5": {
    "title": "Trading at the start of a turn",
    "paragraphs": [
      "During the reinforce phase, before placing:",
      "• a player with 3 or 4 cards may trade one set;",
      "• a player with 5 or 6 cards must trade at least one set, and may trade a second if they hold one.",
      "Trades are made only at this time, except the forced trade of ELIM-3. A player must not trade during the attack or fortify phase, or during another player's turn. The player chooses which cards form the set.",
      "(derived) A hand never holds more than 6 cards at the start of a turn, and never more than 4 once the reinforce phase ends (see INV-6)."
    ]
  },
  "CARDS-6": {
    "title": "Set values",
    "paragraphs": [
      "Each set traded is worth armies according to how many sets anyone has traded so far in the game, counting every trade, including forced mid-turn trades:",
      "The game keeps one shared counter of sets traded; a trade is valued at the counter's next position and then advances it."
    ]
  },
  "territory-bonus": {
    "title": "Note: territory bonus",
    "paragraphs": [
      "The classic rulebook caps the bonus at 2 per turn, the 2015 rulebook has no cap at all, and neither rulebook says who picks the territory when several cards qualify.",
      "Resolution (owner): 2 per trade, as in the official digital game (\"will only apply once per card trade\", SMG's card trading help).",
      "Resolution (official digital): the trading player picks which qualifying card earns the 2, as in the official digital game, where a player with several matching cards picks one (a Steam discussion of the official digital game). It also agrees with every other placement of a player's own armies being theirs to choose."
    ]
  },
  "CARDS-7": {
    "title": "Occupied-territory bonus",
    "paragraphs": [
      "If any of the three cards in a traded set shows a territory the trading player owns at the time of the trade, the player receives 2 extra armies, which must both be placed on that territory.",
      "Each set traded earns this bonus at most once: a set showing several owned territories still earns only 2 extra armies, on one of them, which the trading player chooses. A player trading two sets in one turn can earn it once for each. Wild cards show no territory and never qualify."
    ]
  },
  "empty-deck": {
    "title": "Note: empty deck",
    "paragraphs": [
      "neither rulebook covers an empty draw pile.",
      "Resolution (official digital): traded cards come back into play, so the deck never runs out. The official digital game: \"Cards are cycled in a game so we do not run out of them. When a player hands in cards those cards are then added back into the deck at the end\" (SMG's card trading help). The help doesn't say exactly when or where they rejoin the deck; reshuffling the discard pile when the draw pile empties is the universal community practice that fits it while keeping the rulebooks' face-up discard pile. It keeps cards, and so the escalating set values, flowing in long games."
    ]
  },
  "CARDS-8": {
    "title": "Traded cards and the draw pile",
    "paragraphs": [
      "Traded cards leave the hand and go to a face-up discard pile. When a card must be drawn and the draw pile is empty, the discard pile is shuffled to form a new draw pile. If both are empty, no card is drawn.",
      "(derived) Every card is always in exactly one place: the draw pile, the discard pile, or one player's hand; the 44 cards are conserved."
    ]
  },
  "COMBAT-1": {
    "title": "Legal attack",
    "paragraphs": [
      "The active player may declare a battle from territory S to territory D only if:",
      "• the active player owns S;",
      "• D is owned by an opponent;",
      "• S and D are adjacent (MAP-2);",
      "• S holds at least 2 armies.",
      "A battle involves exactly one attacking and one defending territory."
    ]
  },
  "COMBAT-2": {
    "title": "Attacker's dice",
    "paragraphs": [
      "The attacker rolls 1, 2 or 3 dice, and must have more armies in S than dice rolled: dice ≤ min(3, armies in S − 1). The attacker chooses the number within that limit."
    ]
  },
  "defender-dice": {
    "title": "Note: defender dice",
    "paragraphs": [
      "The classic rulebook and the 2015 rulebook let the defender choose 1 or 2 dice (2 needs at least 2 armies), with both sides announcing their dice before rolling together, but not who announces first.",
      "Resolution (project): the choice is dominated. Computed exactly, against an attacker who fights to the end, rolling 1 die never gives the defender a better chance of holding the territory than rolling 2, across every position tested (attacker 2–60 armies, defender 1–40). Asking a defender on every battle of someone else's turn is table pacing with no real choice behind it, so the engine rolls the maximum, as digital Risk adaptations do. This also moots who announces dice first. The official digital game does the same: the defender makes no choice and rolls 2 dice whenever it has 2 or more troops (SMG's manual roll help, which offers the choice of dice to the attacker only; its blitz rolls \"3 v 2\")."
    ]
  },
  "COMBAT-3": {
    "title": "Defender's dice",
    "paragraphs": [
      "The defender always rolls the most dice allowed: 2 if D holds at least 2 armies, otherwise 1. The defender's number of dice is not limited by the attacker's. The defender makes no decision in combat."
    ]
  },
  "COMBAT-4": {
    "title": "Resolving a battle",
    "paragraphs": [
      "Sort each side's dice from highest to lowest and pair them off, highest with highest, for min(attacker dice, defender dice) pairs; unpaired dice are ignored. In each pair the higher die wins; a tie goes to the defender. Each lost pair removes one army: from D if the attacker's die is higher, otherwise from S.",
      "(derived) A battle removes exactly min(attacker dice, defender dice) armies in total (1 or 2); the attacker never loses more than 2 armies in one battle."
    ]
  },
  "COMBAT-5": {
    "title": "Repeated battles",
    "paragraphs": [
      "After a battle the attacker may fight again, from any legal S against any legal D, as many times as they like, or stop. There is no limit on battles per turn, on targets, or on battles from one territory; an unsuccessful battle does not end the attack phase."
    ]
  },
  "COMBAT-6": {
    "title": "Capture",
    "paragraphs": [
      "When a battle leaves D with 0 armies, the attacker captures D at once and must occupy it by moving armies from S to D:",
      "• at least as many armies as the number of dice they rolled in that battle;",
      "• at most armies in S − 1 (at least 1 army must stay in S).",
      "The attacker chooses the number in that range. The move is made immediately, before any other action.",
      "(derived) A capture happens only on a battle in which the attacker loses nothing (the defender must lose every army it has, and it rolls at most as many dice as it has armies), so the move-in range is never empty: S held at least dice + 1 armies and still does. For the same reason the 2015 rulebook wording (the attacking armies that survived must stay in D) gives the same minimum as the classic rulebook."
    ]
  },
  "COMBAT-7": {
    "title": "After capture",
    "paragraphs": [
      "A captured territory may be used to attack from, or be attacked into further, in the same turn, like any other owned territory."
    ]
  },
  "FORT-1": {
    "title": "The fortifying move",
    "paragraphs": [
      "In the fortify phase the active player may make one move: move any number of armies from one territory they own to another territory they own that is connected to it through a chain of territories the player owns (adjacent territories included), leaving at least 1 army in the territory moved from. It is optional, and it is allowed whether or not the player attacked or captured anything."
    ]
  },
  "fortify-reach": {
    "title": "Note: fortify reach",
    "paragraphs": [
      "The editions disagree on how far a fortifying move reaches.",
      "Resolution (owner): the connected path, as in the 2015 rulebook and the official digital game (SMG's fortify help: troops \"travel between connecting territories\"). It is what players of the official digital game expect."
    ]
  },
  "FORT-2": {
    "title": "Edition difference: adjacent only",
    "paragraphs": [
      "The classic rulebook, the classic rulebook, allows the move only to an adjacent territory. The Risk FAQ reports the connected path in the 1980 US edition too."
    ]
  },
  "FORT-3": {
    "title": "End of turn",
    "paragraphs": [
      "After the fortify phase (made or skipped) the turn ends."
    ]
  },
  "ELIM-1": {
    "title": "Elimination",
    "paragraphs": [
      "A player is eliminated when they own no territories. This happens only when another player captures their last territory. An eliminated player takes no further turns."
    ]
  },
  "ELIM-2": {
    "title": "Taking the cards",
    "paragraphs": [
      "The player who captured an eliminated player's last territory takes all that player's cards into their own hand."
    ]
  },
  "elimination-order": {
    "title": "Note: elimination order",
    "paragraphs": [
      "The rules don't order the move-in against the forced trade, or say where and when the traded armies go.",
      "Resolution (official digital): trade and place at once, as the official digital game does: taking more than 5 cards \"will force a trade in and put you back into the draft phase and extend your turn\" (SMG's card trading help), so the new armies can join the rest of the attack, which is the point of the mid-turn trade. The move-in comes first, as COMBAT-6 says the move is immediate; the official digital game's order between the move-in and the cards could not be confirmed."
    ]
  },
  "ELIM-3": {
    "title": "Forced trade after elimination",
    "paragraphs": [
      "If taking those cards gives the active player 6 or more cards, they must immediately trade sets until they hold 4 or fewer, and must stop as soon as they hold 4, 3 or 2. With 5 or fewer, they must not trade until the start of their next turn.",
      "The capturing move-in (COMBAT-6) comes first. Then the player takes the cards, makes the forced trades, and places the armies from them (valued by CARDS-6, with CARDS-7 subject to its per-turn cap) at once, on any territories they own, before the next battle. The player then continues their turn in the attack phase.",
      "(derived) The number of trades is fixed by the hand size: one trade from 6 or 7 cards, two from 8 to 10, and so on; the player chooses only which cards."
    ]
  },
  "ELIM-4": {
    "title": "Drawn card does not force a trade",
    "paragraphs": [
      "If the card drawn at the end of the attack phase (CARDS-1) brings a hand to 6, the player must wait until their next turn to trade. Only ELIM-3 permits a mid-turn trade."
    ]
  },
  "WIN-1": {
    "title": "Winning",
    "paragraphs": [
      "A player wins the moment they own all 42 territories, which is the moment the last opponent is eliminated. The game ends at once: no card is drawn and no forced trade or fortify follows."
    ]
  },
  "never-ending": {
    "title": "Note: never ending",
    "paragraphs": [
      "The rules have no turn limit, and cautious players, or bots, can stall for a very long time.",
      "Resolution (project): not a rule of the game. The engine plays any game to its end; the bot evaluation harness caps games at a turn limit sized by measurement and records a capped game as a draw, never as a win. The official digital game agrees: its standard game has no turn limit, and \"limited turns\" is an optional custom rule (its Steam store page)."
    ]
  }
};

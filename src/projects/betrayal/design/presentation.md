# Presentation: proposals

Nothing in this file is decided. It records ideas for how the game looks and is played on screen, so they can be picked up later. What is decided lives in the project's `CLAUDE.md` ("Visual style" and "Presentation and input"): the engine knows nothing about rendering, every input method picks from the pending decision's choices, the layout serves phones and desktops, and Claude makes all of the art.

## The core idea: the screen is built around the pending decision

The engine already shapes the UI. At any moment there is one pending decision, with plain-language choices, and every event names the rule behind it. A physical board can't do that, so the UI should lean on it. It has three jobs:

1. **The house is a map you move through**, not a table you look down on.
2. **The decision is the main control.** One question is always on screen, and its choices appear twice: as a list, and lit up in the house (reachable rooms, doorways, targets). Picking from either is the same action. Touch taps a lit room, a mouse clicks it, the keyboard cycles with arrows or number keys, and a controller pushes the stick towards a doorway: all of them point at the same list of choices.
3. **The log is a narrator.** Automatic steps play out one at a time in plain language, and tapping a line opens the card, room or rule it came from.

## What the digital format can do that the board can't

- **Floors as separate views.** Show one floor at a time with a floor switcher, plus a small map of every floor with explorer dots. The camera follows whoever is acting.
- **Plan a route, then commit it.** Tap a destination and see the route and its Speed cost, then confirm. The route is local UI state; confirming sends the steps one at a time through the queue of unconfirmed actions, and the route stops itself at anything that interrupts it (a new room, a room effect, an event).
- **Stats you can read at a glance.** The current value, the dice it gives and the distance to the skull, with each change explained.
- **Dice rolls get their own moment:** what is rolled, how many dice, the target and the outcome, at a pace people can follow.
- **The haunt's rules stay on screen.** After the reveal, a permanent panel shows your side's objective, special rules and what your side knows. The traitor and the heroes see different panels.
- **Other players' turns are worth watching.** The camera follows them and the narration keeps you informed. A decision that needs you (one put to several players, a defence roll) takes focus.

## Layout by device

| | Phone (portrait, from 360px wide) | Desktop and ultrawide |
|---|---|---|
| House | Fills the screen; pinch to zoom; floor switcher on the edge | Centre column, sized to fit, never stretched |
| Decision | A bottom sheet within thumb reach, with large buttons | A prompt panel docked under the house |
| Narration | A one-line ticker above the sheet; swipe up for the full log | An always-visible log column |
| Your explorer | A strip of player portraits along the top; tap one for their card, items and omens | A side column with your stats and cards |
| Haunt rules | A drawer, with a badge when a rule applies | A pinned panel; ultrawide adds a column of the other players' cards |

**Controls:** the stick or arrows move between choices, spatially when the choices are doorways. A or Enter confirms, B or Esc backs out, the bumpers switch floors, View opens the log and Menu opens your cards. Number keys pick list choices directly.

## One shared screen, with phones as controllers

Betrayal is played around a table, so one machine could show the game on a TV while each player plays from their own phone:

- **The TV** shows what everyone may see: the house, the narration and whose turn it is. It is a spectator client of the shared game row.
- **Each phone** shows its own player's decisions and private information: their cards, and after the reveal their side's half of the haunt. It is that seat's client, rendering `viewFor` for its seat.

This suits the server-authoritative design, where clients only read the state and send intents, and it handles the traitor's secret information neatly. It changes how the phone screen is designed: it becomes a controller with your hand and your choices, not a small copy of the desktop layout. It could sit alongside one-device-per-player play rather than replace it.

## 2D, 3D, or both

The engine's separation from the presentation makes all three possible.

**3D.** Each room tile is a little room, seen as a dollhouse with the walls nearest the camera cut away. A prototype exists in `art/` (see "Visual style" in `CLAUDE.md` and the `betrayal-room-art` skill): the Drawing Room, Chapel and Library, and an explorer figure, Professor Longfellow, with an idle animation. It showed that:

- Claude can make rooms that read in one second from every view, given a screenshot review loop;
- lighting carries the mood cheaply;
- figures built from rigid parts animate cheaply.

It also showed weaknesses:

- an explorer is hard to find in a dark room at dollhouse distance;
- 3D's cost on phones is unmeasured; the Library, with 8 lights and 2 shadow-casting candles, is the room to measure;
- creatures are untried.

**2D.** A top-down house of tiles drawn as DOM or SVG. Cheaper to build and to run, accessible by default, and the choices are real page elements for focus and input. The same palette, pixel textures and SVG decals could carry the look.

**Both.** For example, 3D on desktop and TV with 2D on phones, or 2D as the floor overview inside the 3D view. Shared palette and textures keep them one game, but every room's art would be made twice.

## What still needs art

Counted from `content/`.

**In the house:**
- **Rooms:** 67 tiles across the base game and Widow's Walk. Some are outdoors (gardens, graveyard, patio, balcony, roof), so they need sky and ground, not walls.
- **Explorers:** 12 characters. The board game shares one plastic figure between a card's two characters; digitally, each can have their own.
- **Named monsters:** 12 base and 5 Widow's Walk (Banshee, Dracula, Dragon, Mummy, Spider, Witch, Zombie Lord, Frankenstein's Monster, Crimson Jack, Demon Lord, two Ouroboros heads, Cat, Doctor, Head, Pirate Queen, Ghost).
- **Ordinary monsters:** open-ended. On cardboard, 91 numbered tokens serve every haunt; each haunt decides what they are (zombies, bats, frogs, rats, cultists, and so on), and each kind needs its own figure. The haunt survey is where to count them.
- **Room and event markers:** 14 base and 36 Widow's Walk (Smoke, Drip, Blessing, Skeletons, Secret Passage, Wall Switch and so on). In the house these become effects and props, not tokens.
- **Haunt objects and item piles:** each haunt names its numbered objects.
- **Card symbols:** which card a room makes you draw (event, item or omen), shown in the room itself.
- **Dice:** 8, with faces 0, 1 and 2.

**Flat art:**
- **Cards:** 56 events, 33 items and 21 omens, as an emblem or woodcut-style SVG above the text.
- **Character portraits:** 12, perhaps as Victorian silhouette cameos.
- **Icons:** the four traits, the three card types, damage and stunned.
- **Haunt screens:** up to 100; these can stay mostly typographic.

**Not art, but the art depends on it:**
- **Joining tiles into a house:** shared walls, a cutaway across a whole floor, unexplored doorways, and moving between floors. In 3D this is the biggest piece of work after the rooms.
- **Feedback effects:** lit legal choices, a route preview, damage, stunned, death, and the haunt reveal (a natural moment to change the house's lighting).

## Open questions

- 2D, 3D or both.
- One device per player, one shared screen with phones as controllers, or both.
- Whether to adopt the decision-centred UI and the layouts above.
- **Creature style**, the hardest category for Claude's way of making art. One proposal: painted tabletop miniatures in the same rigid-part style as the explorers, with ghosts and spectres as glowing shapes and swarms as many small simple pieces. Prototyping one hard creature (the Spider) and one easy one (the Banshee) would test it.
- **If 3D: the house view before more rooms.** How rooms join may change the rules for building them, and that is cheaper to learn with three rooms than with thirty.
- **Finding your explorer:** each player's colour on their figure's base, and a soft light on the active explorer.

# Cards in the house

Every card sorted by how it shows in the 3D house, and what that asks of the UI and the art. The direction it leads to is in `presentation.md` ("Cards"). Widow's Walk cards are sorted here too, but their UI and art wait until the base game is done.

## The count

110 cards: 33 items, 21 omens and 56 events; 76 base and 34 Widow's Walk. All but two have an honest physical form in the house.

**By where a card shows:**

| Category | Count | Cards |
|---|---|---|
| On the figure | 48 | the 33 items and 15 omens an explorer carries |
| A companion | 4 | the Dog, the Cat, the Girl, the Madman |
| On the body | 6 | Bite, Mask; Debris, Webs, Grave Dirt, Lights Out |
| In the room | 12 | A Moment of Hope (the Blessing), Burial Mound, Closet Door, Drip, Flytrap, Locked Safe, Mystic Slide, Revolving Wall, Secret Passage, Secret Stairs, Skeletons, Smoke |
| A moment | 38 | most events: something happens, then it's over |
| Text only | 2 | What Year Is It?!, It Is Meant to Be |

**By how often its text must be read:** never (48), once (47), or at each use (15: the Bell, Bottle, Dark Dice, Vial, Cat, Sacrificial Dagger, Crystal Ball, Mask, Dynamite, Spirit Board after the haunt, Music Box, Closet Door, Locked Safe, Skeletons, Mystic Slide).

## Exceptions to the direction

- **A panel can't be avoided** for the 15 each-use cards (their odds table is the decision), deck searches and peeks (the Crystal Ball, It Is Meant to Be), trait picks (Possession, Snake Oil, Spider, Hanged Men, Footsteps), cards with several written options (The Left Hand, Contract, Misty Arch, Acupuncture, the give in Image in the Mirror) and What Year Is It?!.
- **Rerolls** (the Lucky Stone, the Rabbit's Foot, the Ceremonial Robe) pick from the dice the roll already shows; see "Dice" in `presentation.md`.
- **Misleading if shown literally:** The Left Hand (no lasting hand state), Bite (the attacker is unseen), the Box (the boxed item can't be used) and the Blood Dagger (bound to the hand, but it can be stolen). The two Image in the Mirror cards need distinct moments.
- **House-wide moments** (Hideous Shriek, Lightning Strikes, Shrieking Wind, The Beckoning, Mists, Silence): the camera covers several rooms, and whether a window faces outside must be visible.
- **Sound-only events** (Disquieting Sounds, Phone Call, The Voice) are audio with a caption.
- **Small charms** are unreadable at miniature scale: a shared tinted "belt charm" form, identified on tap.
- **Baked light needs a dynamic layer** for the Candle (a light that moves), the Blessing, Smoke, Lights Out, the Music Box and every moment; What The...? moves a lit room.
- **Widow's Walk, deferred:** What Year Is It?! reads story text aloud, which `content/` leaves out (write original text, or show the other side's goal summary instead), and the Chainsaw's "if you make chainsaw noises" needs a ruling.

## What the art needs

- **Carried props:** 48, of which about 20 must read at miniature scale: the weapons (Axe, Blood Dagger, Sacrificial Dagger, Revolver, Boomstick, Chainsaw, Spear), the Candle, Bell, Book, Crystal Ball, Music Box, Dynamite, Armor, Ceremonial Robe, Mask, Puzzle Box, Teapot, Camcorder and Rope. One weapon in hand at a time.
- **Companions:** 4. The Dog must never look like a monster.
- **Room tokens:** 12, plus the Lock and the Plant.
- **Body states:** 6.
- **Reuse:** the Spider event uses the Spider monster; Hideous Shriek, the Banshee.
- **Reuse in haunts** (approximate count of haunts): the Revolver 16, Book 15, Ring 15, Dynamite 12, Holy Symbol 10; the Girl, the Madman, the Spirit Board and the Bell 9; the Dog 8; the Crystal Ball and Armor 6; the Spear, Skull and Cat 5. Most Widow's Walk items appear in no haunt.

## Choices that are places

A card or rule whose options are places or things in the house is answered in the house, like a move: each option is a target, pointed at with the reticle, the mouse or a tap and pressed like any other choice, its tag naming it. The engine describes the place an option is (a room, a side of a barrier room, a wall or corner of a room with the token going there, a figure) in the choice's own data, never in its label; `play/choices.ts` turns those options into house targets and leaves the rest in the status box. A wall or corner is a pad on the floor against it, the corner's in the corner, the focused one showing the token on its wall; a side of a barrier room is that half of its tile; a choice among one room's walls pans a following camera to that room.

**Answered in the house**

| Card or rule | Decision | Options | Was | Now |
|---|---|---|---|---|
| Revolving Wall | choose-one | the room's walls with no exit, and its corners | box, as text | a pad on each wall or corner ("North-east corner"), the Wall Switch previewed on it |
| Secret Passage, Secret Stairs: the other end | choose-one | rooms, each side of a barrier room apart | box | the rooms, or the halves |
| Secret Passage, Secret Stairs: go through now | choose-one | the linked room, or stay | box | the room; staying stays in the box |
| Dynamite | choose-one | the adjacent rooms it can be thrown into | box | the rooms, or the halves |
| Landing in a barrier room (any rule putting a figure in the Tower, Chasm or Catacombs) | choose-one | the room's sides | box | each half of the tile |
| Moving a figure 1 space closer (the Bell, monsters pulled) | choose-one | the rooms next door that are closer | box | the rooms, or the halves |
| The Bell: call a hero, pull a monster | choose-one | that figure, or leave it be | box | the figure; leaving it stays in the box |
| Bloody Vision | choose-one | the figures to attack | box | the figures |
| Footsteps | choose-one | the explorers tied nearest | box | the figures |
| Medical Kit | choose-one | the hurt explorers in the room, yourself included | box | the figures |
| Dark Dice: move to an explorer | choose-one | the other explorers | box | the figures |
| A turn's attack on a figure (after the haunt) | turn | the figures in reach | box | the figures |
| A monster turn's figure to act next (haunt 13) | turn | the monsters ready | box | the figures |

Already in the house before: the turn's moves and cells to explore, a tile's ways round and the cells a moved room may go on (the ghost), and the room options of the Bottle, the Dog's run, Funeral, the Mystic Slide, the Collapsed Room's fall and the Dark Dice's step.

**Left in the box, with a recommendation**

| Card or rule | Options | Why not one target | Recommendation |
|---|---|---|---|
| Dark Dice: move an explorer | each pair of an explorer and a room next door | one option is two places | split the decision in the engine, the explorer and then the room, each in the house; it changes what recorded choices mean, so it bumps the share format |
| Pickpocket's Gloves | each pair of an explorer and one of their items | a figure and a card | split it the same way: the explorer in the house, then the item on their sheet |
| Mystic Elevator | the floors it can go to | a floor isn't a place to point at until its cells are | fold the floor into the tile placement after it: the elevator's cells glow on every floor it may go to, in one choice |
| Haunt 13's rooms to add | room tiles not yet in the house | the tiles aren't in the house | keep the box; or offer each as the ghost on its cells, once a ghost can stand for several tiles |
| A turn's attack on a room | rooms | no card raises it yet, and a room that is also a move would carry two targets on one tile | decide when a haunt first raises it |

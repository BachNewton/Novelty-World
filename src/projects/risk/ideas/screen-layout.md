# Risk's screen layout: the clean map, two layouts and one scale rule

The decided design for how the board and the game's two panels fill a screen of any size. It is settled and not yet built: the game still draws today's board through today's camera. "Building it" below is the plan. Once built, the decided parts move into Risk's `CLAUDE.md` and this doc is deleted.

It came out of a long investigation. Its pictures of each target, the sideways phone included, are `relayout/clean-map-l-*.png`, drawn from the clean map with these rules. The lesson that shaped it: every attempt to *generate* a layout per screen (a solver placing continents, panels growing into whatever space was left, rules layered on rules) fixed one screen and broke another. What works is a layout designed once, by hand, for each orientation, with scale as the only thing that varies.

## The board

The board is the **clean map** (`relayout/clean-map.txt`): every continent laid out as a compact, regular shape on a 60° lattice, in the positions Risk players expect (North America top-left, South America below it, Europe top-middle, Africa below Europe, Asia right, Australia bottom-right). It passes the board's layout checks: every territory and border in `map.ts` and nothing more, no border crossing another, and nothing a territory draws covering another's.

It replaces today's board (`board/graph-layout.ts`). The clean map's positions are hand-placed, so they become the board directly. `board/layout_graph.py`'s sketch and relaxation no longer make it; its checks stay, as tests.

The board is drawn **without distortion**: no stretch either way. Today's camera stretches a board up to twice one way to fill a screen; that is dropped.

## Two layouts, by orientation

A screen wider than it is tall gets the landscape layout; taller than wide, the portrait one. Nothing else decides which.

### Landscape

The board and both panels form one composition, designed once, in board units:

- **The players panel** sits in the strip across the top-left, above North America and Europe and west of Asia's region. Asia's Yakutsk already reaches the top edge, so this strip costs the board no height.
- **The action panel** sits in the slot between Africa and Australia, under Asia.

The composition scales as one piece to the largest size that fits the screen, panels included, with no upper limit. Where the screen's shape differs from the composition's:

- **Spare height goes to the panels.** The players panel grows up to the screen's top edge, and the action panel down to its bottom edge. A squarer screen (an iPad in landscape) is the case: its map is limited by width, and the height left over becomes panel room.
- **Spare width stays as margin.** The composition is centred and the sides are sea. A wider screen (an ultrawide) is the case: its map is limited by height, the panels are already larger than their content needs, and nothing gains from the extra width.

### Landscape on a short screen

When the landscape composition's slots come out smaller than the panels' least sizes (a phone held sideways), the board instead fills the screen's height, centred, whole and undistorted, and the leftover width either side becomes the panels' home: **the players panel a column in the left gutter, the action panel a column in the right.** It is portrait's bands turned on their side. On a Pixel 10 Pro XL held sideways that gives 25px circles, the whole board without panning, and columns of about 114×344. The action panel stacks its controls in its column (a vertical slider, the dice one above another); the players panel takes three short lines a seat, and a long bot name is cut short.

### Portrait

- **The players panel** is a band across the top of the screen, full width.
- **The action panel** is a band across the bottom, full width.
- **The map fills the height between the bands** and pans east and west, wrapping round the globe as today. Portrait never shows the whole board at once: fitted to a portrait screen's width, the board would be small in a strip of empty sea, so phones and tablets alike pan. On a phone this shows about 40% of the world's width, and on a portrait iPad about 45%, with every continent fitting whole on screen at some point in the pan.

## The minimum scale

Two floors decide a landscape screen's form. When a slot would fall below its panel's least size, the screen takes the short-screen form, with the panels in the side gutters. When even that form's board, fitted to the height, would bring the territories closer than a fingertip (44px between the closest two), the board stays at that size and pans east and west between the columns. Portrait has no such switch, since it always pans.

## The panels

The panels show **the same information as today, no more and no less**; what changes is their shape and place, and how well they present it.

- **Players panel:** whose turn it is, every player's territories and armies, and the war room's button with the hand drawn as cards, plus what today's tooltips hold: each player's name and a bot's rank. A player can always tell which colour belongs to which player or bot, not only on that seat's turn (today the pairing shows only on the turn line, which flips every second or so when bots move fast).
- **Action panel:** the latest news, what to do now with Back and End phase, the amount slider, a battle's dice, and a blitz's chance of capture.
- **The battle log and the playback speed stay in the war room.** Neither goes in a panel.
- **Amounts are always chosen with a slider**, never buttons that change with the range. A single possible value shows a disabled slider, as today. The slider runs along the panel's longer side: across in a wide panel, up in a tall one.

## The targets

Measured on the clean map with these rules. Panels are their slots' sizes. "Today" is today's board through today's camera, which drew the 16:9 desktop at 70px with its couch-distance type and 75px without it.

| Screen | Circles | Today | Players panel | Action panel | Pans |
|---|---|---|---|---|---|
| 16:9 desktop, 1920×1080 | 68px | 70–75px | 1073×153, top-left | 482×312, bottom | no |
| Ultrawide 21:9, 3440×1440 | 97px | 101px | 1534×219, top-left | 689×446, bottom; sea margins either side | no |
| iPad Air landscape, 1180×820 | 42px | 50px | 659×195, grown to the top edge | 296×292, grown to the bottom edge | no |
| Pixel 10 Pro XL portrait, 412×790 | 37px | 38px | band 412×104 | band 412×152 | east–west |
| Pixel 10 Pro XL sideways, 915×356 | 25px | not measured | column 114×344, left | column 114×344, right | no |
| iPad Air portrait, 820×1180 | 64px | 37px | band 820×104 | band 820×152 | east–west |

The clean map is wider than today's board, so landscape screens draw it a little smaller than today; that is the price of its cleaner geometry, accepted. The Pixel 10 Pro XL's browser viewport is not verified: the figures use the Pixel 9 Pro XL's 412×915, less about 125px for Chrome's bars.

## Building it

In three steps, each looked at in the game before the next, on its targets in Chromium and in WebKit (every iPad browser's engine), from screenshots:

1. **The board.** The clean map becomes `board/graph-layout.ts`. The board's tests change with it, among them the one that holds today's status box in the board's empty south-west.
2. **The camera** (`ui/camera.ts`). The two layouts and landscape's short-screen form, the uniform scale with no stretch, spare height to the panels, the fingertip floor, and portrait's panning between the bands.
3. **The panels.** In landscape the players panel stays at the top-left, now sized to the board's top strip, and the action panel moves from the bottom-left corner to the bottom slot. In portrait both become full-width bands, and on a short landscape screen columns in the side gutters. Today's information is presented for their new shapes.

## Open

- **The panels' least sizes** are estimates of their content (about 416×82 for the players panel as a strip and 260×152 for the action panel), not measured from the live game. They set the landscape minimum scale and the portrait bands' heights.
- **The sideways phone's columns are narrow.** At about 114px a column, bot names are cut short in the players panel, and touch has no tooltip to show them whole. Shrinking the board to the fingertip minimum (21px circles) would widen the columns to about 165px. Left as it is until it proves a problem in play.
- **The portrait bands on a tablet** could be taller than a phone's, since the iPad has height to spare at 64px territories; that waits on what the panels hold.
- **The seam.** Crossing from Australia to Alaska, the Alaska–Kamchatka border runs about three times a normal border's length over empty sea, the clean map's margins added together. The distance at which the board repeats can be tightened so Alaska comes round sooner. It only shows on screens that pan.
- **The slider's travel and the touch sizes** want a check on a real phone and iPad.

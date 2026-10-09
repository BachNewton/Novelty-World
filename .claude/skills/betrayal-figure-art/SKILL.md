---
name: betrayal-figure-art
description: Build or rework the 3D art of one Betrayal at House on the Hill figure (src/projects/betrayal/art/): an explorer miniature now, and monsters and other figures that stand and walk in the house. Built as code from rigid parts on pivots, with a procedural idle and walk, and reviewed from screenshots until done. Use whenever an explorer's or other figure's art is built, extended or reworked, or the owner asks for one ("do Vivian next", "make Ox heavier").
---

# Betrayal figure art

A figure is a board-game miniature on a round base: an explorer, and in
time a monster or an ally, standing in the dollhouse rooms and walking
between them. Claude makes all of the art, so a figure is code, built to
Claude's strengths: boxes, cylinders and lathes with adjustable dimensions,
joined rigidly at pivots, coloured from one palette, with a face as a strip
of pixel art. Nothing is sculpted, nothing is painted, and nothing has a
skeleton or a keyframe file: every movement is a pure function of the
stage's clock. Read "Visual style" in `src/projects/betrayal/CLAUDE.md`
first, then the room-art skill (`.claude/skills/betrayal-room-art/SKILL.md`)
for the palette rules, the lighting language and the review loop, which
figures share with rooms.

## The foundation

Everything lives in `src/projects/betrayal/art/`. Read these before building:

- `explorers/figure.ts`: what every figure shares. The base and its top
  (`figureBase`, `BASE_TOP`); `miniatureHeight`, the one scale every
  explorer is built to; the walk contract (`Stride`, `Gait`, `Walking`,
  `walks`, `walkingOf`, `legSwing`, `hopHeight`, `swing`); the two-bone arm
  (`Limb`, `reach`, `pose`, `limbEnd`); and `burst`, the seeded occasional
  movement every idle is built from.
- `explorers/longfellow.ts`, `ox.ts`, `zoe.ts`: the finished explorers.
  Longfellow is the reference for an ordinary adult; Ox for a big, heavy
  body; Zoe for a child, with a held object that hangs from her hand. Read
  all three before the first part.
- `explorers/line-up.ts`: every explorer side by side with the scale pawn,
  standing or walking on the spot, for the review. A new explorer joins it.
- `explorers/index.ts`: `BENCH_EXPLORERS`, who the bench can stand in a room.
- `explorers/overlap.test.ts`: the figures' overlap check (see "Build it").
- `animate.ts`: `animated`, which marks the piece the stage poses each frame.
- `palette.ts`, `shapes.ts`, `textures.ts`: colours, the shape builders and
  `batch`, and `pixelTexture` with `TEXELS_PER_METRE`, the one pixel size.
- `house.ts` and `house-walk.ts`: how the house stands, walks, marks and
  lights a figure. Read them to know the contract; figure work changes them
  only when the contract itself needs to grow.
- `kit/pawn.ts`: the plain 1.6 m scale pawn rooms are judged against.

The character's facts come from `content/characters.md` and
`content/explorers.md`: age, height, weight, hobbies, greatest fear, who
they know, and the colour of their card.

## The house's contract with a figure

- **A figure is an `ExplorerBuilder`**: a function of a seed and a gait that
  returns one object, built facing +z with its right hand on −x, standing on
  its base at the origin. The seed offsets its clock, so two figures never
  move in step.
- **The house places it and turns it** to face the way it walks; the figure
  never moves its own root. It hops the whole miniature, base and all, at
  each step, by the figure's declared hop.
- **The house rings it** in the player's colour, a glowing ring round the
  base on the floor, and lights the active explorer with a soft warm light
  from above. Everything else on the figure is lit live by the room's light
  probes: no figure brings a light of its own, and nothing on an explorer
  glows (a monster may: see Monsters).
- **The base is the same for every explorer**: `figureBase`, 36 cm across
  the top's radius, 8 cm high. A big body overhangs it a little; a small
  one stands in the middle of it. The ring is sized to the base, so a
  figure that needs a bigger base asks the house first.

## Body, proportion and scale

**Heights come from the data.** `miniatureHeight(feet, inches)` gives how
tall a figure stands off its base; every explorer uses it, so they keep
their true heights against one another. Longfellow's 5'11" stands 1.5 m off
his base, just under the scale pawn. Work out the top of the head first,
then the joints down from it.

**Proportions are a miniature's, not a person's.** Heads are big (about a
quarter of the body for an adult, nearer a third for a child) so faces and
hair read from the house's distance. Then exaggerate what makes the body
itself: Ox's shoulders are wider than his base is deep and his head is
small on top; Zoe's head is as big as Longfellow's on a body two thirds
his height, over a bell of skirt. Weight is width and depth, never
sculpting: a heavy figure is a wedge of boxes.

**Pixels match the house.** A head is an eight-sided column wrapped in one
strip of pixel art at `TEXELS_PER_METRE`, so its pixels are the rooms'
pixels: 24 texels round for every head so far, and as many high as the
head is tall (Ox 9, Longfellow 10, Zoe 8). The face is the strip's middle
eight columns; the sides carry ears, sideburns, spectacle arms; the back
is hair. A dome over the crown rounds the column, and a small box nose
gives the profile.

## Rigid parts and pivots

- **Build each part at its joint.** A group's origin is the pivot it turns
  about: the neck, a shoulder, an elbow, the hips. Parts are boxes and
  cylinders built bottom-up from that pivot, so turning the group swings
  the part as a joint would. Measure every size in metres and every height
  from the floor in the constants, so the numbers can be checked against
  the room.
- **The usual chain** is base, then the body (legs and hips), then the
  chest on the hips, carrying the neck and the two shoulders. Shoes stand
  outside the body, on the figure itself, so the body's sway leaves the
  feet planted.
- **Arms are two-bone limbs**: posed with `reach` to a target in the
  chest's frame, blended between poses with `pose`. A held object either
  rides the forearm (a book), or follows the hand with `limbEnd` and keeps
  its own orientation (Zoe's doll hangs straight down; Ox's coin flips
  above his fist).
- **Parts overlap a few millimetres** at every joint, so no crack opens as
  they turn. Faces of different colour never share a plane: a trim or a
  patch stands a centimetre or more proud (Ox's chest letter), or is a slice of
  the surface in its own colour.
- **Many small parts merge** with `batch()`: trims, stripes, a doll, a shoe
  and its sole.

## Colour and identity

Every figure must be told from every other **at a glance, by silhouette and
colour, before the player-colour ring helps**: from the house's distance,
in a dim room, on a phone. Decide the one-second read before any code: one
silhouette and one dominant colour, written as a sentence at the top of the
file.

- **Silhouette first**: height, width, and one shape that sticks out
  (Longfellow's open book and white tufts, Ox's wedge of shoulders, Zoe's
  pigtails and skirt).
- **One dominant colour from the card**, where the card's colour serves: Ox's
  card is red, so his jacket is; Zoe's is yellow, so her dress is. Pair it
  with one contrasting secondary (Ox's cream sleeves, Zoe's copper hair).
  Read the explorers already built and take no dominant colour another
  explorer already wears.
- **Explorers are warm and human**: in the lighting language, amber means
  human. Clothes may take any palette colour as cloth, but nothing on an
  explorer glows, and sickly green, violet and red light stay the
  supernatural's and the traitor's.
- **Eerie, never gory**, as in the rooms.

The player-colour ring is the house's, and the active explorer's light; a
figure doesn't count on either to be read.

## Idle personality

A figure is never still. Its idle is three layers:

1. **Breathing and weight**: a slow breath in the chest, a sway of weight
   from foot to foot, on periods that suit the body (Ox breathes deep and
   slow; Zoe hums and nods to a quick tune).
2. **One or two signature gestures** from `burst`, at irregular seeded times,
   that say who this is: Longfellow pushes his spectacles up his nose; Ox
   fishes out a shiny coin, flips it and admires it; Zoe twirls to see her
   skirt fly out.
3. **A glimpse of their fear**, where the character's facts give one: Ox
   hunches and glances into the dark; Zoe clutches her doll and peeks
   behind her for the boogeyman.

Every pose is a pure function of the clock (the bench freezes it), so a
frozen time always draws the same frame. A gesture that would fight the
walk (a twirl) eases out as the stride eases in; one that doesn't (a
glance, the coin) carries on while walking.

## The walk contract

The house walks every figure at one pace (`WALK_SPEED`), so a turn takes as
long whoever walks. Each figure declares how it steps, with `walks(figure,
{ step, hop })` on its root:

- **`step`**, metres per step, sets the cadence: a long step at the shared
  pace is a slow, heavy gait (Ox), a short one a quick patter (Zoe). The
  house turns distance walked into the stride's `phase` with it.
- **`hop`**, how high the miniature lifts at each step: low for a heavy
  figure, high for a skipping one.

The figure turns the stride into movement itself. Swing each leg from the
hip by `legSwing(walking, leg)`, the angle at which a planted foot travels
exactly one step, so feet don't skate; swing the shoes about the same hip
with `swing`, which leaves a resting figure exactly as built; swing the free
arms against the legs; and add what makes the gait the body's own (Ox rolls
from foot to foot and twists his shoulders; Zoe's pigtails bounce). At
`amount` 0 every walking piece is back at its built pose. A figure that
declares nothing walks as Longfellow does.

## Monsters and other figures

A monster is a figure like an explorer: rigid parts on pivots, an idle and a walk driven by the clock, and the same contract with the house. Three things differ.

**It carries its colour from the lighting language.** Ghosts and spectres are made of light: `glow` and `lightMaterial` in the `wraith` ramp, with tone mapping off so they keep their colour. A solid creature gets a faint `bloodDark` emissive glow in its body (the traitor's red). Without it, a dark creature on a dark floor loses its shape entirely. A glowing pool on the base doesn't work: it reads as paint. Live lights stay the house's.

**Its size comes from the rules.** "Giant" means a threat to an explorer: shoot it beside Longfellow and the scale pawn in `monsterLineUp`. A big monster gets a bigger base (`monsterBase`), dark to tell it from an explorer's. If facing matters to its haunt, the base carries an arrow in the monster's colour.

**It has a stunned pose.** A stunned monster misses its next turn (rules.md, How Monsters Work). Give it a pose of its own that reads at house distance, not a dimmer idle: the Spider crumples, the Banshee slumps.

Keep a monster within the draw-call budget the tests enforce (36 per figure today): merge parts that never move relative to each other. Swarms (bats, rats) are one shape copied many times and drawn in a single call, never many separate figures.

## Build it

An explorer is one file, `explorers/<id>.ts`, exporting its builder. Open
it with a comment: who the character is, from the data, and how they read
at a glance. Then, in order:

1. The constants: top of the head from `miniatureHeight`, the waist (the
   hip pivot), the neck, the shoulders, the limb lengths, and the
   `Walking` with its reason.
2. The head: its pixel strip and legend, dome, nose, and hair pieces.
3. The torso, the arms, the legs and shoes, each at its pivot.
4. The poses the arms reach for, then the animation: idle layers first,
   then the walk.
5. Register it in `BENCH_EXPLORERS` and add it to the line-up.

**Run the overlap check** after every change:
`npx vitest run src/projects/betrayal/art/explorers/overlap.test.ts` stands
each explorer alone in a bare room, at moments through its idle, standing
and in full stride, and fails on any two faces of the figure that fight. A
figure's own parts pass into each other at its joints on purpose, so only
fighting faces count. Add a new explorer to its list.

## Readability checks

- **The line-up**: every explorer side by side with the pawn, the same
  light and framing. Heights true to the data, silhouettes and colours
  distinct, one family of style.
- **The house**: `?house` with the figure standing in for the active
  explorer, and for the other one. A temporary local change to the cast in
  `house-view.ts` is fine for the shots; revert it before finishing. Judge
  the whole-floor views and the phone shot from `house-shots.mjs`: can you
  name the figure without its ring, lit and unlit?
- **The walk**: the walking line-up's strip, and `house-shots.mjs`'s walk up
  the grand staircase with the figure walking it.

## The review loop

The dev server, the Playwright-only rule, and waiting on events are as in
the room-art skill.

- **One figure close**:
  `node src/projects/betrayal/tools/shots.mjs <room-id> <label> --explorer=<id> --idle`
  writes the explorer framed close and `idle-strip.png`, sixteen frozen
  frames 1.5 s apart, which catch the idle's gestures. Shoot in a dim room
  and a lit one: the Drawing Room's table is lit, its corners dark.
- **The line-up**: the same with `--explorer=explorer-line-up` (standing) or
  `--explorer=explorer-walk` (walking on the spot, in slow motion, with each
  figure's own step and hop) and `--explorer-zoom=0.6` to frame the row.
  The walking strip shows each gait through its cycle. The line-up faces
  the first view, so read `explorer.png`; the idle strip crops to the
  middle of the row.
- **The house**: `node src/projects/betrayal/tools/house-shots.mjs <label>`
  with the figure in the cast, as above.

Judge each round in this order, and don't polish detail while a higher item
fails:

1. **Read at a glance**: in the house's whole-floor view and on the phone,
   is the figure named at once by silhouette and colour? Against the
   line-up, is it distinct, and is its height right?
2. **Pose and proportion**: does it stand like the character (weight, age,
   build)? Do the joints bend the right way through every frame?
3. **Idle**: do the gestures say who this is, at irregular times, and read
   at the bench's distance? Is any frame broken (a hand through the body, a
   held thing floating)?
4. **Walk**: no skating feet, the cadence suits the body, nothing pops as
   the stride eases in and out.
5. **Detail**: the face's pixels, cracks at joints, fighting faces, parts
   too thin to draw.

Then `npm run lint`, `npm run typecheck`, `npx vitest run
src/projects/betrayal/art` and `npx playwright test
e2e/betrayal-house.spec.ts`, all clean.

## Lessons learned

- **Faces are dark from the house's cameras.** The camera looks down and
  the probes light from above, so a face's front reads dim; the hair, the
  shoulders and the top of the clothes carry the colour. Put the dominant
  colour where the light falls: the shoulders and the top of a skirt.
- **Small held things vanish.** A doll or a coin under about 25 cm, in a
  dark colour, disappears at the house's distance; make it pale, or let it
  be a close-up detail only, never the identity.
- **The overlap check finds shared back faces**: a sole and a leg ending in
  the same plane fight; step one back a few millimetres.
- **A child's walk is a short step, not a slow one**: at the house's one
  pace, Zoe's short step makes the quick patter by itself.

## Done means

The figure reads at a glance in the house and on the phone, distinct in the
line-up; its idle and walk play without a broken frame; the overlap check
passes standing and walking; lint, typecheck, the art tests and the house
e2e are clean; it is registered and in the line-up; and any temporary cast
change is reverted. The builder reports back:

- the figure's file, its one-line identity, and its idle;
- the paths of the final line-up sheet and idle strip;
- its height from the data, and its `Walking` with the reason;
- any change to the walk contract or the house, and why;
- anything that needs the owner's eye or decision, and any gap found in
  the foundation (reported, not patched around).

Commit only if the brief says to; an orchestrator usually commits.

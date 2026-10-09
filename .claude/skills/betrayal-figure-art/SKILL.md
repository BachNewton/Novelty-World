---
name: betrayal-figure-art
description: Build or rework the 3D art of one Betrayal at House on the Hill figure (src/projects/betrayal/art/): an explorer miniature, a monster, or any other figure that stands, walks and runs in the house. Sculpted in code from smooth signed-distance forms and lofts, as rigid parts on pivots, with a procedural idle, walk and run, and reviewed from screenshots until done. Use whenever an explorer's, monster's or other figure's art is built, extended or reworked, or the owner asks for one ("do Vivian next", "make Ox heavier").
---

# Betrayal figure art

A figure is a board-game miniature on a round base: an explorer, a monster
or an ally, standing in the dollhouse rooms and walking between them.

**Claude makes the art, so lean into Claude's strengths and find workarounds
for its weaknesses.** Building organic forms from formulas in code is a
strength: a head is a few ellipsoids blended together, a sleeve is a rod, a
skirt is a function of height and angle, and every number can be measured
and changed. Judging fine anatomy from screenshots is a weakness: a face or a
hand can look fine in one frame and wrong in the next, and small errors hide
in dark pixels. Work round it with what screenshots do judge well: line-ups
beside the other figures and the scale pawn, close-ups in a lit and a dim
room, readability checks at the house's distance, and tests for what the
eye misses. Never polish a detail that only shows in a close-up while the
figure doesn't read from the house.

Read "Visual style" in `src/projects/betrayal/CLAUDE.md` first, then the
room-art skill (`.claude/skills/betrayal-room-art/SKILL.md`) for the palette
rules, the lighting language and the review loop, which figures share with
rooms.

## The foundation

Everything lives in `src/projects/betrayal/art/`. Read these before building:

- `forms.ts`: the smooth-form toolkit. Signed-distance solids (`ball`,
  `ellipsoid`, `rod`, `chain`, `roundBox`, `ring`, `stretched`, `roughened`,
  `union`, `intersect`, `skin`), `sculpt` to add, carve and paint them into
  one coloured mesh, `loft` for tubes and ribbons through rings, `painted` and
  `mergeAll` for explicit geometry, `surfaceAt` and `onSurface` to lay
  details on a sculpted surface, `glowShaded` for glowing figures, `plinth`
  for a base, `figureMaterial` and `form`. The figure tones (`TONES`, such as
  `skin`) are colours mixed from two palette colours that only figures wear.
  `forms.test.ts` tests the meshing.
- `explorers/figure.ts`: what every figure shares. `BASE_TOP`;
  `miniatureHeight`, the one scale every explorer is built to; the walk and
  run contract (`Walking`, `walks`, `walkingOf`, `Pace`, `Stride`, `Gait`,
  `stepLength`), `floats` and `isGrounded` for a figure with no base, `leg`
  and `Leg` (thigh, shin and shoe),
  `stride` with its `StrideRig`, which walks or runs a two-legged figure;
  `legPoints` and `pushAside` for cloth the legs push (coat tails); `reach`
  and `pose` for two-bone limbs (`arm` builds a monster's simple arm);
  `joins` and `Joint` for the joints the clipping check allows; and
  `burst`, the seeded occasional movement every idle is built from.
- `explorers/hands.ts`: every explorer's arm and hand (`buildArm`,
  `handParts`, `Arm`, `Hand`), hand poses (`RELAXED`, `OPEN`, `fist`,
  `holding`), arm poses (`reachWrist`, `gripAt`, `pointHand`, `between`,
  `poseArm`), and the held-prop interface (`Prop`, `holdIn`, `handsOf`,
  `aimGrip`). `explorers/props.ts`: the stand-in props (revolver, candle,
  spear) until items get art, `burning` for a prop with a flame and its
  live light, and `carrying` for a figure built holding one.
- `explorers/longfellow.ts`, `ox.ts`, `zoe.ts`: the explorers. Longfellow is
  the reference for an ordinary adult and for a held object riding a hand;
  Ox for a big, heavy body and a held thing that follows the hand (the coin);
  Zoe for a child, a sculpted skirt from a custom distance, and a doll that
  hangs from her hand. Read all three before the first part.
- `monsters/spider.ts`, `banshee.ts`, `base.ts`: the monsters, and what they
  share (`monsterBase`, `floorGlow`, `ghostly`, `spectral`, `MonsterOptions`).
- `explorers/line-up.ts`: every explorer side by side with the scale pawn,
  standing, walking or running on the spot. `monsters/index.ts`'s
  `monsterLineUp` stands every figure, monsters and explorers, with the pawn.
  A new figure joins the line-ups.
- `explorers/index.ts`: `BENCH_EXPLORERS`, who the bench can stand in a room.
- `explorers/fighting-faces.ts` and `explorers/overlap.test.ts`: the figures'
  overlap check; `explorers/gait.test.ts`: the gait check (no jump through
  a walk or a run, the base planted); `explorers/clipping.ts`, with `explorers/clipping.test.ts`
  and `monsters/clipping.test.ts`: the clipping check (see "Build it").
- `animate.ts`: `animated`, which marks the piece the stage poses each frame.
- `house.ts` and `house-walk.ts`: how the house stands, walks, runs, marks
  and lights a figure. Read them to know the contract; figure work changes
  them only when the contract itself needs to grow.
- `kit/pawn.ts`: the plain 1.6 m scale pawn rooms are judged against.

The character's facts come from `content/characters.md` and
`content/explorers.md`: age, height, weight, hobbies, greatest fear, who
they know, and the colour of their card.

## The house's contract with a figure

- **A figure is an `ExplorerBuilder`**: a function of a seed and a gait that
  returns one object, built facing +z with its right hand on −x, standing on
  its base at the origin. The seed offsets its clock, so two figures never
  move in step.
- **The house places it and turns it** to face the way it goes; the figure
  never moves its own root, and the house never lifts it. **The base stays
  planted**: fixed on the floor, never bobbing or tilting, and only what
  stands on it moves (the stride bounces the body; a runner leaves the base
  between steps).
- **The house rings it** in the player's colour, a glowing ring round the
  base on the floor (not round a figure that `floats`), and lights the
  active explorer with a soft warm light from above. Everything else on the
  figure is lit live by the room's light probes, and nothing on an explorer
  glows (a monster may: see Monsters). The one light a figure brings is a
  held flame's (see "Held props").
- **The base is the same for every explorer**: a `plinth` 36 cm across the
  top's radius, 8 cm high (`BASE_TOP`). A big body overhangs it a little; a
  small one stands in the middle of it. The ring is sized to the base, so a
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
small on top; Zoe's head is as big as Longfellow's on a body two thirds his
height, over a bell of skirt. Weight is width and depth: a heavy figure is
a wedge.

## Sculpting the forms

A figure is rigid parts on pivots, and each part is one smooth mesh, built
once in code:

- **Signed-distance sculpting** for anything organic or soft: heads, hands,
  torsos, coats, a spider's body. In `sculpt()`, `add` blends a solid on with
  a fillet, `carve` cuts one away (eye sockets, a mouth, a skirt's slits) and
  `paint` recolours a region of the surface without changing its shape (a
  buzz cut, a waistcoat, stubble, a pupil). `geometry(cell)` meshes it.
- **Lofts** for limbs, ribbons and anything banded: a leg segment, a scarf's
  end lying on a coat, a lock of hair, a fang, a tatter. A loft is a ring per
  section, each with its colour, so bands are crisp.
- **Explicit geometry** for hard or very thin parts (a book's covers and
  pages, spectacle rims, a coin), `painted` one palette colour and merged
  into the same part's mesh with `mergeAll`.
- **Mesh once, cache per module.** Nothing about a part's shape depends on
  the seed, so a module meshes all its parts on first use (`meshed ??=
  meshParts()`) and every copy of the figure shares them. Meshing is the
  expensive step; building another figure is cheap.
- **One material per figure**: `figureMaterial()`, a smooth Lambert lit by
  vertex colours, since the house's light probes light Lambert. Each rigid
  part is one mesh in one draw, however many colours it wears.
- **Grid cell**: 6–9 mm for heads and hands, 12–15 mm for bodies. Never
  sculpt a feature thinner than about two cells; it breaks up. Anything
  finer (wire rims, bristles) is a loft or explicit geometry.
- **Lay details on the surface** with `surfaceAt` (march in along z to the
  surface at an (x, y): buttons, lapels, a chest letter) and `onSurface`
  (the nearest surface point: markings following a curve). Measured, not
  guessed, so they sit on the form and never float or sink.
- **Hair is soft masses**: blended ellipsoids, rods and lofted locks, never
  spikes. A sheet down the back reads as long hair from above; separate thin
  strands read as antennae.
- **Faces**: the house's cameras look down and its probes are cool, so a
  face in plain `bone` reads grey-blue and dark. Skin is the `skin` tone
  (bone warmed towards amber); give the face a brow, a nose and cheeks that
  catch the light from above, and a head that doesn't bow its face away
  unless the pose means it (Longfellow reads his book). Eyes are white with a
  small dark iris and a glint, sunk under the brow: big black eyes read as
  holes and turn eerie, which only a spirit should be.
- **Don't optimise triangle counts** (70–100k per figure is normal) until
  the house shows they are a problem; the draw count is what's budgeted.
- **Build each part at its joint.** A group's origin is the pivot it turns
  about: the neck, a shoulder, an elbow, the hips. Measure every size in
  metres and every height from the floor in the constants. The usual chain
  is base, then the body (legs and hips), then the chest on the hips,
  carrying the neck and the two shoulders. Shoes stand outside the body, on
  the figure itself, so the body's sway leaves the feet planted.
- **Arms and hands** are built by `buildArm`: the upper arm hangs from the
  shoulder, the forearm from the elbow, the hand from the wrist, each its own
  mesh at its pivot. The figure sculpts its sleeves (the upper arm tapering
  from its shoulder to a narrower end at the elbow, the forearm with a cuff
  and the wrist inside it); the hand is shared (`handParts(side, scale, skin)`): a palm
  with the heel of the thumb and a knuckle ridge, a thumb, and four fingers
  in three rows of knuckles, each row one part, so the fingers curl
  together. A hand is built hanging along −y, thumb forward (+z), palm
  towards the body; `scale` sizes it (Ox 1.3, Zoe 0.55).
- **Pose an arm** with an `ArmPose` (shoulder, elbow and wrist):
  `reachWrist` reaches the wrist for a point in the chest's frame, `gripAt`
  puts the grip at a whole placement (Longfellow's book), `pointHand` points
  an open hand (the spectacles), `between` and `poseArm` blend. Pose the
  hand with `poseHand`: `RELAXED` empty, `OPEN` for a gesture, `fist(hand)`
  running, and `holding(hand, empty)` wherever it might hold something.
- **The grip contract.** Every hand has a `grip`, a named group in the palm
  where a held thing attaches: its +y runs along the held thing's handle,
  out past the thumb and index finger; its +z runs along the hand towards
  the fingertips. A `Prop` is built round that frame (its handle centred on
  the origin along y), and says its handle's radius and how it is carried:
  `"hang"` (swings at the side with the arm: a revolver, muzzle down) or
  `"upright"` (held up before the body, its axis kept upright by `aimGrip`
  after the stride: a candle, a spear). `holdIn(hand, prop)` attaches it and
  moves the grip to fit the handle, and `holding` closes the hand round it
  exactly: each finger bone lies tangent to the handle. A hand holds one
  thing; `holdIn(hand, null)` empties it; `handsOf(figure)` finds a figure's
  hands. Each explorer keeps a hand free for an item (Longfellow's and Zoe's
  right, either of Ox's); a gesture that needs that hand (spectacles, coin,
  twirl) waits while it holds something, the arm swings less carrying
  upright, and pumps less running with something hanging. A figure's own
  things use the same contract: the book is gripped at its edge, the doll
  dangles from the grip (a counter-turned group keeps it hanging), the coin
  rests on the grip's thumb end.
- **Joints nest, never knob.** A limb is a tapering round cone (`rod`), its
  ends already round: never blend a `ball` onto a limb end, since a smooth
  union swells where a ball meets a rod of its size and reads as a knobby
  joint. The upper part tapers to an end narrower than the lower part's top,
  both centred on the pivot, so the lower part's rounded top covers it at
  any bend and no gap opens (an elbow, a knee); where a limb meets the body,
  the body's shoulder reaches out over the sleeve's top, so the sleeve's
  round top sits inside it (Longfellow's coat, Ox's jacket). No round end is
  wider than the limb around it. A knee folds no further than
  `DEEPEST_KNEE`, so a kicked-up calf never folds into the thigh.
- **Joints overlap**: parts pass into each other at every joint, so no
  crack opens as they turn. Where two parts meet, one must clearly cover the
  other (a sleeve cap inside a jacket's shoulder, a trouser leg ending inside
  the shoe): two surfaces of different colour within a millimetre of each
  other fight, and the overlap check catches them. Declare each joint with
  `joins` (the two parts, the pivot, and a reach about twice the limb's
  radius; more where a deep bend folds one into the other, as a running
  knee does). Nothing else may pass through anything (the clipping check).
- **Every part keeps its solid.** Sculptures and lofts carry their solid on
  the geometry; explicit geometry (a torus rim, a coin, a book's boards, an
  instanced band) is given one with `shaped(geometry, solid)`, and
  `mergeAll` unions them. The clipping check throws on a part without one.
- **Something lying on another part is a part of its own.** The checks only
  ever compare one part with another, so anything merged into a part's
  mesh is never checked against it: Longfellow's scarf ends, merged into his
  coat, sank into it unseen. A ribbon, strap or sash that lies on a surface
  is its own mesh (a child of the part it lies on, so it moves and breathes
  with it), lifted until its whole width clears the surface, not just its
  middle: a flat ribbon on a curved coat sinks in at its edges.
- **Cloth round the legs is hollow and moves.** A skirt or a coat's tails is
  a shell a cloth's thickness, never a solid the legs sit inside, so a leg
  can swing within it. Longfellow's tails are open at the front (the legs
  swing out through it) and pushed back by the legs from inside
  (`pushAside`, given how far a point lies in front of the tail's inside
  back: each point needs the tail turned back only as far as it must, and
  the tail turns as far as the most demanding point needs, so it follows
  the legs smoothly and never jumps from one side of a leg to the other);
  Zoe's bell billows front to back as far as her knees and heels need,
  gradually as a heel rises towards its hem, and her feet lift less
  (`lifts` on the rig) so her knees stay under it. A hem low over the hips
  (Ox's jacket) ends above the hip pivot, over a seat the thighs swing
  from.

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
  Take no dominant colour another explorer already wears.
- **Explorers are warm and human**: in the lighting language, amber means
  human. Clothes may take any palette colour as cloth, but nothing on an
  explorer glows, and sickly green, violet and red light stay the
  supernatural's and the traitor's.
- **Eerie, never gory**, as in the rooms.

## Idle personality

A figure is never still. Its idle is three layers:

1. **Breathing and weight**: a slow breath in the chest, a sway of weight
   from foot to foot, on periods that suit the body.
2. **One or two signature gestures** from `burst`, at irregular seeded times,
   that say who this is: Longfellow pushes his spectacles up his nose; Ox
   fishes out a shiny coin, flips it and admires it; Zoe twirls to see her
   skirt fly out.
3. **A glimpse of their fear**, where the character's facts give one: Ox
   hunches and glances over his shoulder into the dark; Zoe clutches her doll
   and peeks behind her for the boogeyman.

Every pose is a pure function of the clock (the bench freezes it), so a
frozen time always draws the same frame. A gesture that would fight the
stride eases out as the stride eases in (Zoe's twirl); one that doesn't
carries on while walking (a glance, the coin) but eases out running, when
the arms pump.

## The walk and run contract

**The gait rule (owner decision).** Before the haunt, every explorer walks.
After the haunt starts, heroes run and the traitor walks calmly; in a
hidden-traitor haunt everyone runs, since a gait must never reveal hidden
information. Monsters keep their own movement. The house chooses the pace
per walk (`Walk.pace` in `house-walk.ts`); nothing chooses it from game
state yet.

**One speed per pace.** The house moves every figure at `WALK_SPEED` walking
and `RUN_SPEED` running, so a turn takes as long whoever moves. Stride and
cadence show the character, never speed. Each figure declares its walk with
`walks(figure, { step, hop })` on its root:

- **`step`**, metres per step, sets the cadence: a long step at the shared
  pace is a slow, heavy gait (Ox), a short one a quick patter (Zoe).
- **`hop`**, its bounce: walking, how far it sinks into its knees as both
  feet are down; running, a third of how high it bounds off its base between
  steps. Low for a heavy figure, high for a skipping one.

**The cadence comes from the pace and the step.** At `WALK_SPEED` (1.5 m/s,
in `house-walk.ts`) an adult's 0.6 m step is 2.5 steps a second, Ox's
0.7 m about 2, and Zoe's 0.4 m a child's patter near 4. Keep a walking step
about as long as the leg from hip to ankle: longer goose-steps, shorter
scurries.

**The run is the walk scaled.** A run's step is `RUN_STRIDE` (2) times the
walk's, so at `RUN_SPEED` an adult takes about three steps a second; its
bound is `RUN_HOP` times the hop; each foot is down for only `RUN_STANCE` of
the stride (less for short legs, so the floor never slides more than
`RUN_STANCE_LEGS` leg lengths under a planted foot), so both are off the
floor between steps; the heels kick up
behind, the arms pump `RUN_ARM` times further with the elbows bent near
square, and the body and the chest lean forward. The run factors are shared
in `figure.ts`; a figure gets its run for free from its walk.

**`stride(rig, gait(clock))` moves a two-legged figure**, after its idle has
posed it: each foot is planted on the base and slides back exactly as fast
as the floor goes by (so it never skates), rolling from heel to toe, then
lifts and swings forward; the legs reach for the feet through bending knees
(each leg a thigh and a shin, built by `leg`), a foot leaves and meets the
floor at the floor's own speed, a foot in the air hangs square to its shin,
and no sole ever dips into the base. The body rises and falls smoothly once
a step, as deep as the stride needs to keep every planted foot in reach
(lowest as both feet are down walking, or as a runner lands), and a
runner's whole figure bounds off the base between steps. It swings the free
arms against the legs, bends their elbows running, and leans the chest.

**Nothing jumps.** Every pose is continuous through the whole cycle and
through the ease in and out of a walk (the house eases `amount` smoothly): a
weight that switches on (a foot counted as planted the moment it lands), a
hard limit (a leg snapping straight, a knee folding shut), a search that can
pick a different answer from one frame to the next (cloth pushed to one
side of a leg or the other), or a burst whose end doesn't match its start
all show as a drop or a pop. `gait.test.ts` walks and runs every explorer as
the house moves it, a sample every 1/600 s, and fails on any part whose
step is longer than the steps either side of it by more than 3 mm; a new
figure joins it.
It returns the step, −1 to 1, for the figure's own touches: Ox rolls from
foot to foot and twists his shoulders, Zoe's pigtails bounce. The rig lists
only the free arms (Longfellow's left hand holds his book), and every arm in
it must be posed by the idle each frame, since the stride turns it from
there. At `amount` 0 the feet stand as built and the knees are soft. A figure with another
body plan (a spider's eight legs, a spectre's glide) moves itself from the
gait, and declares a step and hop that pace it.

## Held props

**Held things are oversized, as a tabletop miniature's are.** At the house's
distance a real-sized revolver is a peashooter. Build a held prop about one
and a half to two times its real size (`OVERSIZE` in `props.ts`), a weapon
most of all, so it reads at a glance and looks like the threat it is: give
it its whole silhouette (a revolver's long barrel, cylinder, grip, hammer
and trigger guard; a spear's broad head). The handle grows with it, and the
hand closes round the oversized handle (`holding` fits the fingers to the
prop's `handle`).

**A held flame carries a live light.** A prop that burns (a candle, a
lantern, a torch) is built with `burning`: its flame wavers, and it carries
a small amber point light (`carriedLight` in `lighting.ts`) that flickers
with the flame and lights the room round the figure as it moves, which also
helps find that explorer in a dark room. It casts no shadow (the house
allows two live shadow casters), so its range is short and its fall-off
gentle (`CARRIED_LIGHT`): a pool round the figure that barely reaches
through a wall, without burning out the hand and coat beside the flame.
Each one is a live light in the scene, and changing how many are showing
recompiles the lit materials, so the house adds them with their figures.

## Monsters and other figures

A monster is a figure like an explorer: rigid parts on pivots, sculpted the
same way, an idle and a movement driven by the clock, and the same contract
with the house. These rules differ:

**It carries its colour from the lighting language.** Ghosts and spectres
are made of light: the `wraith` ramp, glowing and additive materials, with
tone mapping off so they keep their colour. A glowing solid part is
`spectral()`, vertex-coloured and unlit, with its geometry `glowShaded` once
so its sculpted form still shows; veils, halos, mist and rings are additive
`lightMaterial`s. A solid creature gets a faint `bloodDark` emissive glow in
its body (the traitor's red); without it a dark creature on a dark floor
loses its shape. Thin dark limbs need more: the Spider's legs smoulder
brighter than its body and carry glowing bands at the joints. A glowing pool
on the base doesn't work: it reads as paint. Live lights stay the house's.

**A floating monster has no base.** This is a digital game: a spirit that
floats needs no flying stand, and a base or a column of mist joining it to
the floor reads as a connection it doesn't have. Declare it with `floats`
(the house puts no colour ring round it), and leave on the floor only a
soft pool of its own light beneath it (`floorGlow`), brighter as it drifts
lower, so where it floats reads in a dark room. Its facing reads from its
body, never from a mark on the floor: it faces +z squarely, its head barely
turning, its hands reaching that way, and whoever places it turns it to
face along the grid (the Banshee, whose facing haunt 08 depends on).

**Its size comes from the rules.** "Giant" means a threat to an explorer:
shoot it beside the explorers and the scale pawn in `monsterLineUp`. A big
monster that stands gets a bigger base (`monsterBase`), dark to tell it from
an explorer's.

**It has a stunned pose.** A stunned monster misses its next turn (rules.md,
How Monsters Work). Give it a pose of its own that reads at house distance,
not a dimmer idle: the Spider crumples, the Banshee slumps.

**It keeps within the draw budget** the tests enforce (36 per figure): merge
parts that never move relative to each other. Many copies of one shape that
move are one `InstancedMesh` in a single draw (the Spider's sixteen leg
bands follow its legs each frame); swarms (bats, rats) are the same, never
many separate figures.

## Build it

A figure is one file, exporting its builder. Open it with a comment: who the
character is, from the data, and how they read at a glance. Then, in order:

1. The constants: top of the head from `miniatureHeight`, the waist (the
   hip pivot), the neck, the shoulders, the limb lengths, and the `Walking`
   with its reason.
2. Each part as a function returning its geometry, at its pivot, head
   first; then `meshParts`, cached in the module.
3. The builder: the groups at their pivots, the arm poses, the `StrideRig`,
   then the animation: idle layers first, then `stride` and the figure's
   own touches.
4. Register it in `BENCH_EXPLORERS` and add it to the line-ups and the
   overlap test.

**Run the clipping check** after every change: `npx vitest run
src/projects/betrayal/art/explorers/clipping.test.ts` (and
`monsters/clipping.test.ts`). It asks each part's surface points how deep
they lie inside every other part's solid, in that part's frame, and reports
two parts whose surfaces cross (each partly inside the other) by more than
2 mm, away from every declared joint; a part tucked wholly inside another
never shows and is no finding. It samples each explorer through 90 s of
idle (every gesture comes round several times), walking and running on the
spot at the house's pace over several strides off the beat, and again
holding each stand-in prop; each monster idle, stunned and moving. It only
ever compares one part with another, never the pieces merged into one
mesh: keep anything that lies on a part a part of its own (see "Sculpting
the forms"). It
remembers every pair's pose by geometry, so a pose seen once on any copy of
a figure is never checked again, and a run takes about ten seconds. A
finding names both parts, how deep each lies in the other, and where: fix
the shape, the pivot or the pose, never a joint's reach, unless the crossing
really is the joint folding.

**Run the overlap check** too:
`npx vitest run src/projects/betrayal/art/explorers/overlap.test.ts` poses
each figure at moments through its idle, standing, walking and running (and
each monster standing and stunned), and fails on any two of its parts whose
surfaces of different colour lie within a millimetre of each other, facing
the same way, where nothing covers them. It looks each triangle up in a grid
of the others, so it takes a second or two a figure. The finding names the
two parts by their order in the figure, their colours, and a point near the
fight: move one surface clearly inside or clear of the other.

## Readability checks

- **The line-ups**: every explorer side by side with the pawn, and every
  figure with the monsters, the same light and framing. Heights true to the
  data, silhouettes and colours distinct, one family of style.
- **The house's distance**: can you name the figure without its ring, lit
  and unlit, at the whole-floor view and on the phone? Shoot it in the
  house (`?house`, with the figure in the demo's cast in `art/house-demo.ts`) or, when the house view
  can't take it, shoot the bench's view 0 and scale it to a third, about
  the whole-floor distance.
- **The walk and the run**: the walking and running line-ups' strips, and
  the house's walk up the grand staircase with the figure walking it.

## The review loop

The dev server, the Playwright-only rule, and waiting on events are as in
the room-art skill.

- **One figure close**:
  `node src/projects/betrayal/tools/shots.mjs <room-id> <label> --explorer=<id> --idle`
  writes the figure framed close and `idle-strip.png`, sixteen frozen frames
  1.5 s apart, which catch the idle's gestures. Shoot in a lit room and a
  dim one: the Drawing Room's table is lit, its corners dark; the Chapel is
  dim. `--explorer-zoom=0.45` frames a monster.
- **The line-ups**: the same with `--explorer=explorer-line-up` (standing),
  `explorer-walk` or `explorer-run` (on the spot at the house's own pace,
  each figure with its own step and hop; `explorer-walk-side` and
  `explorer-run-side` turn them side on), `explorer-revolver`,
  `explorer-candle` and `explorer-spear` (each holding that stand-in),
  `explorer-armed-walk` and `explorer-armed-run` (a prop each), or
  `monster-line-up` (every figure), and
  `--explorer-zoom=0.6` (0.35 for every figure) to frame the row. Read
  `explorer.png`; the idle strip crops to the middle of the row. Judge a
  gait at real speed with `--every=0.04 --frames=16`; `--strip-view` and
  `--from` move the strip's view and start. The bench subject
  `{ part: "right grip", nth, radius }` frames a named part of the nth
  figure close, for a close-up of a hand. Judge figures in the Foyer: it is
  lit, and dark legs vanish in the Drawing Room's corners.
- **The house**: `node src/projects/betrayal/tools/house-shots.mjs <label>`
  with the figure in the demo's cast (`art/house-demo.ts`).

Judge each round in this order, and don't polish detail while a higher item
fails:

1. **Read at a glance**: at the house's whole-floor distance and on the
   phone, is the figure named at once by silhouette and colour? Against the
   line-up, is it distinct, and is its height right?
2. **Pose and proportion**: does it stand like the character (weight, age,
   build)? Do the joints bend the right way through every frame?
3. **Idle**: do the gestures say who this is, at irregular times, and read
   at the bench's distance? Is any frame broken (a hand through the body, a
   held thing floating)?
4. **Walk and run**: no skating feet walking, the cadence suits the body,
   the run leans and pumps, nothing pops as the stride eases in and out.
5. **Detail**: the face, cracks at joints, fighting faces, parts too thin to
   mesh.

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
- **Coincident surfaces hide at joints**: a sleeve cap the size of the
  jacket's shoulder, a skirt's top inside a coat's waist, a sash lying on a
  skirt. Make one clearly bigger, or end one inside the other.
- **Thin dark limbs vanish on dark floors**: a spider's legs read as legs
  only once they smoulder and carry bright bands at the joints and a pale
  knob at each knee, the top of the arch.
- **A child's walk is a short step, not a slow one**: at the house's one
  pace, Zoe's short step makes the quick patter by itself.
- **A gait reads slow or floaty for two reasons**: frames far apart (the
  bench once walked the line-up in slow motion), and feet that never plant
  (legs swung as pendulums lift both feet off the base at full stretch and
  slide them as they sweep). Plant the feet and let the knees bend.
- **Rigid parts at a deep bend fold into each other**: a running knee, an
  elbow brought up to the face. Give such joints a bigger reach, or keep the
  pose from folding past about a right angle.
- **Move a hand round an obstacle in two stages**: a pose blend is a
  straight slerp, so a hand going from the side to the face cuts through a
  held book; go out and up first (Longfellow's spectacles, Zoe lifting her
  doll clear of her skirt before clutching it).
- **A miniature's long steps make its body bob.** Its legs are short for
  the house's pace, so a planted foot lands far ahead and the body must
  sink to reach it. Sinking only as each foot landed dropped the body
  several centimetres in a frame; it now rises and falls smoothly once a
  step. Shorter steps bob less.
- **Legs that fan from one line collide**: the Spider's knobs ring its
  thorax, each leg facing its own foot, each knee rising straight over the
  line to its foot, and neighbouring legs step a quarter stride apart.

## Done means

The figure reads at a glance in the house and on the phone, distinct in the
line-ups; its idle, walk and run play without a broken frame; the overlap
check passes; lint, typecheck, the art tests and the house e2e are clean;
it is registered and in the line-ups; and any temporary cast change is
reverted. The builder reports back:

- the figure's file, its one-line identity, and its idle;
- the paths of the final line-up sheet and idle strip;
- its height from the data, and its `Walking` with the reason;
- any change to the walk contract or the house, and why;
- anything that needs the owner's eye or decision, and any gap found in
  the foundation (reported, not patched around).

Commit only if the brief says to; an orchestrator usually commits.

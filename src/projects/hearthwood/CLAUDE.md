# Hearthwood

A cozy 3D game about a wandering hedge-witch and the cats they meet. You live outdoors in a valley of forest and mountain made fresh from a seed: by day you walk and forage, by evening you cook and brew at your campfire, and the stray cats of the woods come round one by one, each won over by the dish it loves. When the valley has given what it has, you pack up camp and walk over the ridge into a new one.

It lives at Games → 3D Games → Hearthwood, in Three.js through `@react-three/fiber`, like the site's other 3D games. The concept and the platform are decided; everything below them is the proposed design, open to the owner's review, with the undecided parts under Open questions.

## Pillars

- **Nothing is ever lost.** No fail states, no combat, no hunger or health meter, no timer that punishes. A meal that comes out unexpected is a new dish, not a failure. An animal never runs away, falls ill or dies.
- **Cooking is for joy and for friendship, never for survival.**
- **Every walk finds something.** The world is generated so that wandering always turns up a herb, a view, a cat or a ruin, and never a long empty stretch.
- **Calm by default.** Soft sound, slow light, no notifications nagging for attention. The game waits as long as the player likes.
- **Witchcraft is gentle and earthy**: hedge-witchery, herbs, the moon and the Wheel of the Year, treated with warmth and respect, never as spooky set dressing.

## Target device

Hearthwood's floor is a **Pixel 8 Pro** in Chrome, held upright or sideways. It replaces the site-wide floor of phones up to four years old within this project: layouts are designed and checked at its viewport. Laptops and a laptop on a TV with a controller are above that floor.

**Performance comes last.** While the game is a prototype, the work is making it play right and look right; making it run smoothly on the phone's GPU (Tensor G3's Mali-G715) is a later pass, done once play and look are settled, and only as far as it turns out to be needed. Nothing is held back for a budget before then. The valley always shows a stats.js frame meter in the top right, to watch the frame rate while playing.

## Art, gameplay and engine are decoupled

The art must be workable on its own, without touching the rules or the engine, and the reverse. So the layers stay apart:

- **The engine** (generating the world, time, input, streaming) is pure where it can be, and knows nothing of how anything looks.
- **Gameplay** (the walker, the cats' behaviour, camp, foraging, cooking) is state and rules, with no Three.js in it, and is tested without drawing anything.
- **Art** (models, materials, palettes, motion, light) takes plain data in (a cat, a tree's seed, the hour) and gives drawing back. It never decides anything the game depends on.
- **The scene** is the thin layer between them that draws the game's state with the art.

A change of look is a change in the art layer alone; a change of rules never needs the art redone.

## The loop

A day has a shape, though nothing forces it:

- **Morning to dusk, the walk.** Out from camp along trails and off them: forage, meet cats, find places. Cats of the camp come along and wander near.
- **Evening, the hearth.** Back at the campfire: cook, brew, feed the cats, sit and look at the stars. Sleeping by the fire starts the next day.
- **Moving on.** When the player chooses, camp is packed and the walk over the ridge begins (see Walks between valleys). Camp, its cats and the player's recipes always come along.

## The valley

Each valley is generated from a seed with the site's `seeded-random`, as pure functions in the project's world layer, so a valley is the same every time it is loaded and its generation is unit-testable.

- **Land:** a heightfield of meadow floor, rising through forest to alpine slopes and bare peaks, with streams running downhill to a lake or a river. Altitude and water set where each biome lies.
- **Life:** trees, shrubs, flowers and mushrooms placed by biome, with clearings kept open; ingredients grow where they would in nature (watercress by streams, chanterelles under birch, juniper on dry slopes).
- **Places:** a handful of points of interest per valley, each a small reason to walk: a standing stone circle, a fallen giant tree, a waterfall, a forgotten shrine, a hilltop view.
- **Trails** link camp to the places along the land's easy lines, so there is always a path to follow and always the choice to leave it.
- **The Pixel 8 Pro** sets the budget (see Target device): vegetation is instanced and thinned with distance, far hills are cheap silhouettes, and the land streams in chunks only once a valley is too big to draw whole.

The first valley, as built:

- **Shape:** 512 m square, a bowl of meadow floor ringed by mountains, stretched a little along a seeded axis, with a saddle in the rim where the pass to the next valley will go. The walker reaches up to the alpine grass and no higher, so the rim keeps the walker in without a wall; the land always rises past that reach before the grid's edge. That leaves about 400 m of walkable valley across: generous, and small enough to draw whole.
- **Bands:** meadow floor, forest from about 10 m up to a treeline near 50 m, alpine grass, bare rock from about 100 m and snow on the flatter tops. Each band's edge wanders up and down the slopes, groves stand out on the meadow and glades open in the woods; conifers take over towards the treeline and birches gather by water.
- **Water:** a lake on the floor and one stream, rising high on the far side, finding its way down to the lake on the land's easy lines and wandering from side to side across the flats. Its water never runs uphill, and it drops over a waterfall where it crosses the forest band, into a plunge pool.
- **Camp** is a level clearing on the meadow a short walk from the lake, with its fire, two seat logs, a bedroll and a pot on a tripod.
- **Places:** a standing stone circle (one stone fallen) out on the floor, the waterfall seen from a clear bank below it, and a hilltop with a cairn and a bench facing back over the valley. Trees are kept back from each place and from where its trail ends.
- **Trails** are the cheapest routes from camp, climbing gently, never up a cliff or into the lake, joining up where they share a way, and fording the stream on stepping stones. The land is worn level across them.
- **Drawing:** the land is one mesh over the whole heightfield (about 131k triangles), coloured per vertex by its blend of grounds and shaded under the trees; at this size it needs no streaming. Plants are instanced, one draw per design and level of detail; the valley is cut into 32 m chunks, and each chunk in view draws its plants near or far by its distance, thinned beyond 150 m. Far mountains are two flat rings of silhouettes. A frame is about 300k to 450k triangles in about 65 draws.

## Walks between valleys

The journey part. Leaving a valley is a hike over a generated mountain trail to the next one: the trail climbs, crosses a pass with a view down over both valleys, and descends. A longer hike may take more than a day, with a camp on the way: a small fire on a ledge, a meal from what is in the pack, the stars from higher up. Some walks go to a summit for the view and nothing else.

## Companions: cats and dogs

The heart of the game. The woods hold stray **cats and dogs**, every one generated, so no two are the same, and the player befriends them, and once befriended they **follow**: they come along on walks, keep near, nose about, and wait and come running when the witch glides off a ridge. At camp they nap by the fire. Petting one is always available and always answered.

**Cats** look like real cats because their coats are drawn from real cat coat genetics: the base colour and its dilute, orange and the tortoiseshell and calico it makes, tabby patterns (mackerel, classic, spotted, ticked), white markings from none to van, colourpoint, long or short hair, and eye colour.

**Dogs** are the dogs of the north: a mixed population in which spitz types (prick ears, a tail curled over the back, a plush double coat, like a Lapphund, a Finnish Spitz or an elkhound) are common, among all sorts of mixes. Their build varies far more than a cat's (size from small to big, legs, body, muzzle length, ears pricked, folded or dropped, tails curled, plumed or straight), and their coats come from real dog coat genetics, simplified: black, liver and their dilutes, sable, fawn and red, black and tan and tricolour, brindle, a rare merle, white markings, and coat length.

**One animal underneath.** Cats and dogs share one four-legged body, rig, motion and coat-shader approach, each species its own proportions, gait, postures, coat genetics and behaviour, so a third kind of animal later is a variant, not a new system.

**Befriending** differs as the animals do:

- **A cat** is won over gradually: it watches from a distance, then comes closer for food, and follows once it is given the dish it loves. Each cat has a favourite dish and a few it likes.
- **A dog** comes more readily: a friendly one bounds up, a shy one needs a treat held out and patience; a game of fetch with a stick wins most dogs.
- **Each has a personality** from a few traits that show in how it moves and how close it walks: for cats bold or shy, lazy or busy, cuddly or aloof; for dogs bold or shy, calm or playful, cuddly or independent.
- **A name the player gives it.**

**How a cat is made** (decided, built in `cats/`):

- **Everything from one seed**, each part (genes, coat, build, personality) from its own seeded stream, so adding to one never changes another.
- **Genes are drawn at street-population frequencies**: black, chocolate and cinnamon, each dense or dilute; orange on the X chromosome (one copy for a tom, two for a queen, so only queens are tortoiseshell or calico, and most orange cats are toms); agouti, which shows the tabby pattern (ticked over mackerel over classic, mackerel broken into spots by a modifier), while orange shows its pattern regardless; white spotting, none or a locket with no copies, low to middling white with one, high white to van with two; a rare dominant white; colourpoint; long hair. A population looks like a real one: mostly black, tabby and their dilutes, about one in six long-haired, colourpoints rare. Eyes follow the coat: points are always blue, high white is often blue or odd-eyed, the rest run green to copper. Silver, smoke and the other breeders' genes are left out.
- **Build** varies size (toms bigger, with broader heads), stockiness (a cobby cat runs to shorter legs), leg, back, tail and ear length, as moved and scaled bones on one shared sculpture, so the build costs nothing per cat.
- **Personality** is three traits from −1 to 1, and shows in motion: a bold cat holds its head and tail higher, a shy one crouches with its ears turned out; a busy cat looks round, flicks its ears and twitches its tail more often; a lazy one breathes slower and lids its eyes; a cuddly cat slow-blinks.
- **The model** is one smooth skinned body: signed-distance forms (the shared toolkit in `src/shared/lib/three/sdf.ts`, which Betrayal's figures also use) blended round a skeleton of pivots, each vertex following the bones of the forms nearest it, so the body bends smoothly where the forms were blended. The head is meshed on a finer grid than the body so the ears keep their edge. Faces are painted, not sculpted: big round eyes with a slit pupil and a glint, a small nose, the inside of the ears.
- **The coat is a shader**: every marking is a pattern function of where a point lies on the cat in its bind pose, so it moves with the body: the tortie's patches (brindled, or bigger and cleaner on a calico), the tabby pattern with its forehead M, cheek lines, leg bars and tail rings, the colourpoint's mask and points, and the white spotting, which grows from the chest and belly through the paws, legs, muzzle and blaze to the sides and back, leaving the head's cap and the tail for last. Long hair is a fuller silhouette (ruff, britches, plume) and a softly lumped surface; no fur cards.
- **Motion** is pure functions of the cat's clock, the distance it has walked and its speed: postures for standing, walking (the lateral-sequence walk, each paw planted while it is down), sitting and loafing, blended over a second as the activity changes before the legs are solved to their paws, with the tail up in greeting over any of them, and breathing, blinks, ear flicks, look-arounds and tail sway laid on top as seeded occasional movements.
- **Budget**: a cat is about 12,000 triangles short-haired, 15,000 long-haired, and two draws (its body and a soft blob shadow), with one compiled coat shader shared by every cat. Meshing a hair length takes about a second on a desktop and runs once a session in a worker. The coat's fragment shader is the heaviest part, a few layers of value noise; if several cats close up ever cost too much on the target phone, the pattern can move to the vertices.

## Foraging and cooking

Ingredients are found, not bought: herbs, mushrooms, berries, roots, nuts, wild greens, river fish, eggs from a farm a valley might hold. What grows changes with the season.

**The forests have berries and mushrooms to pick**, the ones a Nordic forest really has, each where it really grows:

- **Berries:** bilberries in the shade of pine and spruce, lingonberries on dry heath and under pines, wild strawberries at sunny edges and clearings, raspberries in clearings and along paths, and cloudberries out on the bogs, rarer and prized.
- **Mushrooms:** chanterelles under birch and spruce, porcini in the mixed woods, funnel chanterelles in damp spruce woods late in the year, and the fly agaric under birches, red with white spots, which is never eaten but is the witch's: a brewing ingredient, never a cooking one.
- **By season:** nothing in winter, the first wild strawberries in early summer, the berries through high summer, and the mushrooms from late summer through autumn, with the funnel chanterelles last.
- **Picking:** look at a ripe bush or a mushroom, and a prompt offers to pick it (a key, a controller button, or a tap). It goes into the witch's basket, and the bush shows it has been picked (its berries gone, the mushroom cut). A picked spot grows back after some days, in season.
- **Placement** is part of the world's generation, by region, ground and season, so a spot always grows the same thing; what has been picked is the only thing the game has to remember. Patches cluster as they do in a real forest: a good bilberry slope, a chanterelle spot worth remembering.

Cooking happens at the campfire in pans, a pot and on sticks over the flames, and is tactile and short: choose ingredients, cook them, see the dish. Recipes are discovered by trying combinations, and remembered in the player's recipe book once found. Cooking can't fail: a combination with no recipe makes a humble dish of its own, which a cat may still love.

## Witchcraft

- **Brewing** at the hearth: teas, salves and charms from foraged things. A charm does something gentle and visible (makes flowers bloom round camp, calls fireflies, draws a shy cat closer, clears the fog from a view).
- **The moon** goes through its phases night by night; some herbs are gathered only under a full moon.
- **The Wheel of the Year** sits on the calendar as its festivals (see Seasons and the calendar).
- **Rituals** at the festivals and at places of power (a stone circle, a sacred spring): small, quiet set pieces such as lighting a Beltane fire or leaving an offering at Mabon.

## Seasons and the calendar

**Four Nordic seasons**: spring, summer, autumn and winter, and the world changes with them: the trees leaf out, turn and go bare (conifers stay green), the ground goes from snowmelt and new green through summer meadow and autumn gold to snow, the water freezes at the edges in winter, and the light and the colour grade follow. Weather is seeded and gentle: mist, soft rain, snow, golden evenings.

**The sun and moon move as they really do at a latitude**, set once in the game's tuning and easy to change. It starts at **Helsinki's (about 60°N)**: around midsummer the sun is up for about nineteen hours and the short night never gets fully dark; around midwinter it is up for about six, low in the south. Day length, the sun's height and where it rises and sets all come from the latitude and the day of the year, not from hand-set seasons.

**The calendar is the game's own, faster than real time**: a day still passes in minutes of play, a season in a number of days, and the year turns round in an evening or two of play, so a player sees every season. The day's length in minutes, the days in a season and the moon's cycle in days are one tuning each.

**The Wheel of the Year** sits on that calendar as its eight festivals (Samhain, Yule, Imbolc, Ostara, Beltane, Litha, Lughnasadh and Mabon): the solstices, the equinoxes and the four days between, each a small occasion with what can be gathered, brewed and done on it.

## The night sky

- **The moon is a real moon**: a lit sphere, so its phase is the sun lighting it from where the sun is, never a drawn crescent. It goes through its phases over its cycle, rises and sets at the times its phase gives it (a full moon rises at sunset, a new moon is up with the sun), lights the night by its phase, and shows a faint earthshine on a thin crescent. Its phase matters to witchcraft (see Witchcraft).
- **Northern lights** come on clear nights, mostly in the long dark of autumn and winter, curtains of green with violet edges that drift and ripple, some nights faint and some nights a show, seeded so no two nights are alike.
- **Stars** turn with the night, and form constellations the player can find and name by the fire.

## Controls

The game plays on all three input methods (a controller, touch, and keyboard + mouse), switching to whichever was used last, through the shared input and gamepad libraries and the shared button prompts (see the root `CLAUDE.md`). It plays in **first person** by default, through the witch's own eyes, with **third person** (the camera following behind them) a switch away; nearby things to pick up, pet or use are offered with a prompt.

Walking, as built: the move goes the way the camera looks. In first person the camera is the witch's eyes at their eye height, they face where they look and are not drawn, their head bobs gently with their steps (more at a run, fading as they stop), and the view is wider (about 72° against third person's 55°). In third person they turn to face where they walk.

- **Keyboard and mouse:** WASD or the arrows walk, Shift runs, Q and E turn. In first person a click on the game locks the pointer and the mouse looks (round freely, up and down to just short of straight); Esc, the browser's own, frees it, and a prompt to click shows while it is free. Opening the ~ debug panel frees it too, and only a click locks it again. In third person dragging the mouse turns the camera and the wheel moves it in and out.
- **Touch:** a stick appears under the thumb wherever it lands on the left half of the screen, walking at the push and running at its rim; dragging on the right half looks round in first person or turns the camera in third, where pinching moves it in and out. There is no pointer lock on touch.
- **Controller:** the left stick walks at its push, the right stick looks or turns the camera, and the right trigger runs.
- **Jumping and the broom:** jump (Space, the controller's A, a button on touch) is a small hop. Jumping again in the air takes out the broom and **glides**: a slow, gentle descent forward, steered by where the player looks, until the ground is reached or jump is pressed again to put it away. The broom never climbs, so mountains stay something to hike; gliding down off a ridge into the valley below is the reward for the climb. Real flight may come later as magic that is earned.
- **Switching the view:** V, the controller's View button, or a small button at the top left on touch. The choice is kept on the device; without one, first person.
- The third-person camera orbits the witch, within limits of tilt and distance, and comes in along its line where the land rises behind them rather than climbing over it. Both views share the way the player faces, so a switch keeps it.
- How to walk is shown, for the input used last and the view, as its controls beside a symbol of what each does, until that input has walked; on touch, as a ghost stick on the left and a looking or turning symbol on the right. Before anything is used, a device whose main pointer is a finger is taken to be played by touch.

## Look

Hearthwood has its own style: a warm, soft storybook diorama, with golden light and the fire as the brightest thing at night. Its colours are its own tokens, scoped to the project.

**Claude makes all of the art, so the style is chosen for what art written as code does well.** Every model, material, animation and effect is code: no image textures, no models from outside, no hand-keyed animation.

What carries the look, because code does it well:

- **Light and atmosphere** are where the mood comes from: the sun's colour through the day, fog in the valleys, rim light on the forest edge, the fire's flicker on everything near it, and a colour grade per season.
- **Simple, readable forms**: soft low-poly shapes, smooth rounded solids and silhouettes that read from a distance, built from primitives, smooth signed-distance forms and lofts, the way Betrayal's figures are sculpted.
- **Procedural materials**: bark, moss, stone, water and fur patterns are shader functions of position and noise, not painted pictures.
- **Many of a few things**: a forest is a handful of tree designs, each varied by seed (height, lean, branching, colour) and drawn instanced.
- **Particles**: embers, smoke, steam from the pot, fireflies, falling leaves, snow, rain.
- **Procedural motion**: idles, walks, a tail's sway, breathing and ear flicks as functions of time and speed, not keyframes.

What the style stays away from, because code does it badly: realistic or detailed faces, photoreal materials, hand-painted detail, intricate one-off sculpts, and expressive acting. Characters are seen mostly at a distance or from behind; faces are a few simple shapes (eyes, a nose, ears) that read through pose and motion rather than expression.

**Cats** are the hardest art in the game and its heart, so they get the most care: a stylised cat of a few smooth forms, recognisably a cat by its silhouette, ears and tail and by how it moves (the stretch, the loaf, the tail up in greeting). Its coat is a shader driven by its genetics (see Cats): a tabby's stripes and a calico's patches are pattern functions, which is exactly what code does well. The witch is a silhouette first: a cloak, a hat, a pack.

Art is reviewed from headless screenshots taken through the repo's own tooling and revised until it is done, the loop Betrayal's art skills follow; once Hearthwood's art has a working method, it becomes a skill of its own.

The valley's light, as built, is simple and its own (nothing is shared with Shipwright's physically based light):

- **The day** lasts twelve minutes and blends between six moments, night, dawn, morning, noon, golden hour and dusk, each with its own sky, haze, key light, light from the sky and the ground, and shadow tint, all tokens. The sun lights the day and the moon the night, each fading near the horizon so the handover happens in the dark.
- **Every material ends in the valley's air:** a haze thickest low in the valley and thinning up the mountains, warmed towards the sun, then a gentle grade that lifts saturation and tints the shadows towards the moment's own colour. The haze is the horizon's colour, so the land melts into the sky. Tone mapping keeps hues true (Khronos neutral), and there are no post passes, for the target phone's fill rate.
- **Shapes:** trees are soft primitives with their colours in their vertices, crowns shading as one mass, swaying in a breeze; rocks and stones are lumpy flat-shaded solids; the ground has a fine grain of noise. The water lights itself: shallows to deep by the bed's depth, foam at the shore, the sky at a glance and glints of sun; the stream's streaks run downhill and whiten over the falls.
- **The fire** is soft flame shells, rising embers, a glow and a flickering light, brightest at night, when fireflies come out over the meadow and the stars over the rim.
- **Pixel ratio** is capped at 1.5: on the Pixel 8 Pro that is about 0.9 megapixels drawn, with the sun's shadows a 1024 map round the walker and the sky drawn last, only where nothing covers it.
- The day can be held at an hour with `?hour=<0-24>`, or set and held from the debug panel that ~ opens, and another valley opened with `?seed=<text>`.

## Saving

Single-player and saved on the device: the current valley's seed, camp, cats, recipes, the season and the day. No account needed.

## First slice

The smallest version that is already the game:

- one generated valley, with trails and day and night;
- walking in first and third person on all three input methods;
- a handful of ingredients to forage and a few recipes to cook at the campfire;
- generated cats to meet, befriend with their favourite dish, and bring to camp;
- saving.

The walks between valleys, brewing, seasons, festivals and the night sky follow, one at a time.

## Open questions

- **Who is the player?** A fixed witch, or one the player designs?
- **Companions on screen:** how many can follow at once before it stops being cozy, where the rest wait, and does camp ever outgrow its clearing?
- **Other animals:** cats and dogs first; foxes, a hedgehog, a raven familiar or others could follow later as variants of the same animal.
- **Do valleys ever repeat?** A valley left behind could be revisited by its seed, or every walk could lead somewhere new.
- **Other people:** a valley could hold a few gentle characters (a beekeeper, a travelling tinker), or the game could be the witch and the cats alone. Since faces are the art's weak point, characters would have to work at a distance and through silhouette.
- **Music:** generated, composed, or ambient sound only.

## Code map

- `cats/`: the cats, pure where it can be. `genetics.ts` (the genotype, drawn at population frequencies, and the coat it makes; `coatName`), `cat.ts` (`generateCat`: genes, coat, build and personality from a seed), `coat-look.ts` (a coat as the shader's colour tokens and numbers), `rig.ts` (the skeleton's pivots and proportions; `rigOf` a cat's build), `sculpt.ts` (the body's signed-distance forms and their skinned mesh), `motion.ts` (`catPose`: postures, the walk, blends and fidgets, and the two-segment reach the legs are solved with).
- `components/cats/`: `cat-body.tsx` (`CatBody`, one cat drawn and moving from props: activity, speed, greeting and an optional clock; whoever places it moves and turns its group), `skinned-cat.ts` (a cat's skinned mesh and skeleton, posed each frame), `coat-material.ts` (the coat shader), `cat-geometry.ts` and `cat-mesh.worker.ts` (the shared sculpture, meshed once per hair length in a worker), `cat-preview.tsx` (the `?cats` preview: a meadow of nine cats, reroll, and one cat on its own to stand, walk, sit, loaf, greet and turn).
- `tools/cat-shots.mjs`: headless screenshots of the preview through its control surface (`window.__hearthwoodCats`), on a frozen clock: the field on desktop and on the target phone, and each chosen cat by activity and view, with a sheet of them all.
- `world/`: the valley, pure and unit-tested. `valley.ts` (`generateValley`, everything from a seed), `land.ts` (the bowl, its rim and pass, and the altitude bands), `water.ts` (the lake, the stream and its falls), `places.ts` (camp and the places), `trails.ts` (the trails and their fords), `life.ts` (the woods' density and the scatter of plants), `ground.ts` (biomes and the grounds the land is painted with), `walking.ts` (where a walker may go), `day.ts` (the hour, the sun and moon, and each moment's light), with `grid.ts`, `noise.ts`, `paths.ts` and `fields.ts` underneath.
- `input/`: walking's input. `walk-controls.ts` (each input's meaning, pure), `point-of-view.ts` (first or third person, and keeping the choice on the device) and `use-walk-input.ts` (all three inputs into one state, the input used last, the point of view and the pointer lock).
- `components/valley/`: the drawing. `valley-view.tsx` (the canvas and its overlay), `atmosphere.ts` (the haze and grade every material ends in), `daylight.tsx` and `clock.ts` (the day's light each frame), `palette.ts` (the tokens), `terrain.tsx`, `water.tsx`, `sky.tsx`, `plants.tsx` with `plant-shapes.ts` and `plant-detail.ts`, `places.tsx`, `campfire.tsx`, `fireflies.tsx`, `painted.ts` (vertex-coloured shapes from pieces), `witch.tsx` (the placeholder witch), `walker.tsx` (walking and the camera in either view), `first-person-camera.ts` (the witch's eyes: looking, the head's bob, the fields of view, pure) and `follow-camera.ts` (the third-person orbit, pure), `walk-hints.tsx` (the prompts, the click to look, the touch view button and the touch stick), `debug-panel.tsx` (the ~ panel), `valley-probe.tsx` (`window.__hearthwoodValley`: ready, frames, what was drawn, and switches for the hour, motion, camera, point of view, look and walker).
- `tools/valley-shots.mjs`: headless screenshots of the valley through its probe, on a held hour and motion clock: the walker's view through the day, from above and over the rim, each place, and the touch controls on the target phone, upright and sideways, in third person; and through the witch's eyes at camp and walking out to the forest, with the hints on desktop and the phone (the `fp-` shots); with what each frame drew.

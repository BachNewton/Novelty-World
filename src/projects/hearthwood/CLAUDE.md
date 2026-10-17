# Hearthwood

A cozy 3D game about a wandering hedge-witch and the cats they meet. You live outdoors in a valley of forest and mountain made fresh from a seed: by day you walk and forage, by evening you cook and brew at your campfire, and the stray cats of the woods come round one by one, each won over by the dish it loves. When the valley has given what it has, you pack up camp and walk over the ridge into a new one.

It lives at Games → 3D Games → Hearthwood, in Three.js through `@react-three/fiber`, like the site's other 3D games. The concept and the platform are decided; everything below them is the proposed design, open to the owner's review, with the undecided parts under Open questions.

## Pillars

- **Nothing is ever lost.** No fail states, no combat, no hunger or health meter, no timer that punishes. A meal that comes out unexpected is a new dish, not a failure. A cat never runs away, falls ill or dies.
- **Cooking is for joy and for friendship, never for survival.**
- **Every walk finds something.** The world is generated so that wandering always turns up a herb, a view, a cat or a ruin, and never a long empty stretch.
- **Calm by default.** Soft sound, slow light, no notifications nagging for attention. The game waits as long as the player likes.
- **Witchcraft is gentle and earthy**: hedge-witchery, herbs, the moon and the Wheel of the Year, treated with warmth and respect, never as spooky set dressing.

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
- **Phones up to 4 years old** set the budget: the land streams in chunks around the player, vegetation is instanced and thinned with distance, and far hills are cheap silhouettes.

The first valley, as built:

- **Shape:** 512 m square, a bowl of meadow floor ringed by mountains, stretched a little along a seeded axis, with a saddle in the rim where the pass to the next valley will go. The walker reaches up to the alpine grass and no higher, so the rim keeps her in without a wall; the land always rises past that reach before the grid's edge. That leaves about 400 m of walkable valley across: generous, and small enough to draw whole.
- **Bands:** meadow floor, forest from about 10 m up to a treeline near 50 m, alpine grass, bare rock from about 100 m and snow on the flatter tops. Each band's edge wanders up and down the slopes, groves stand out on the meadow and glades open in the woods; conifers take over towards the treeline and birches gather by water.
- **Water:** a lake on the floor and one stream, rising high on the far side, finding its way down to the lake on the land's easy lines and wandering from side to side across the flats. Its water never runs uphill, and it drops over a waterfall where it crosses the forest band, into a plunge pool.
- **Camp** is a level clearing on the meadow a short walk from the lake, with its fire, two seat logs, a bedroll and a pot on a tripod.
- **Places:** a standing stone circle (one stone fallen) out on the floor, the waterfall seen from a clear bank below it, and a hilltop with a cairn and a bench facing back over the valley. Trees are kept back from each place and from where its trail ends.
- **Trails** are the cheapest routes from camp, climbing gently, never up a cliff or into the lake, joining up where they share a way, and fording the stream on stepping stones. The land is worn level across them.
- **Drawing:** the land is one mesh over the whole heightfield (about 131k triangles), coloured per vertex by its blend of grounds and shaded under the trees; at this size it needs no streaming. Plants are instanced, one draw per design and level of detail; the valley is cut into 32 m chunks, and each chunk in view draws its plants near or far by its distance, thinned beyond 150 m. Far mountains are two flat rings of silhouettes. A frame is about 300k to 450k triangles in about 65 draws.

## Walks between valleys

The journey part. Leaving a valley is a hike over a generated mountain trail to the next one: the trail climbs, crosses a pass with a view down over both valleys, and descends. A longer hike may take more than a day, with a camp on the way: a small fire on a ledge, a meal from what is in the pack, the stars from higher up. Some walks go to a summit for the view and nothing else.

## Cats

The heart of the game. Every cat is generated, so no two are the same, and every one looks like a real cat because its coat is drawn from real cat coat genetics: the base colour and its dilute, orange and the tortoiseshell and calico it makes, tabby patterns (mackerel, classic, spotted, ticked), white markings from none to van, colourpoint, long or short hair, and eye colour. On top of the look, each cat has:

- **A personality**, from a few traits (bold or shy, lazy or busy, cuddly or aloof) that show in how it moves, where it naps and how close it walks.
- **A favourite dish**, and a few it likes. A stray is won over gradually: it watches from a distance, then comes closer for food, and joins the camp when it is given the dish it loves.
- **A name the player gives it.**

Cats of the camp follow on walks, nap by the fire, sit on the player's pack and sometimes lead the way to something worth finding. Petting a cat is always available and always answered.

## Foraging and cooking

Ingredients are found, not bought: herbs, mushrooms, berries, roots, nuts, wild greens, river fish, eggs from a farm a valley might hold. What grows changes with the season.

Cooking happens at the campfire in pans, a pot and on sticks over the flames, and is tactile and short: choose ingredients, cook them, see the dish. Recipes are discovered by trying combinations, and remembered in the player's recipe book once found. Cooking can't fail: a combination with no recipe makes a humble dish of its own, which a cat may still love.

## Witchcraft

- **Brewing** at the hearth: teas, salves and charms from foraged things. A charm does something gentle and visible (makes flowers bloom round camp, calls fireflies, draws a shy cat closer, clears the fog from a view).
- **The moon** goes through its phases night by night; some herbs are gathered only under a full moon.
- **The Wheel of the Year** is the calendar (see Seasons).
- **Rituals** at the festivals and at places of power (a stone circle, a sacred spring): small, quiet set pieces such as lighting a Beltane fire or leaving an offering at Mabon.

## Seasons

The game's year is the Wheel of the Year: its eight festivals (Samhain, Yule, Imbolc, Ostara, Beltane, Litha, Lughnasadh and Mabon) divide the seasons, and each changes the light, the weather, what grows and what can be brewed. Weather is seeded and gentle: mist, soft rain, snow, golden evenings. A season lasts long enough to enjoy and passes on its own.

## The night sky

Each valley's sky is generated, and the stars form constellations the player can find and name by the fire. The moon's phase is shown truly.

## Controls

The game plays on all three input methods (a controller, touch, and keyboard + mouse), switching to whichever was used last, through the shared input and gamepad libraries and the shared button prompts (see the root `CLAUDE.md`). It is a third-person game: the player walks, the camera follows and can be turned, and nearby things to pick up, pet or use are offered with a prompt.

Walking, as built: the move goes the way the camera looks, and the witch turns to face where she walks.

- **Keyboard and mouse:** WASD or the arrows walk, Shift runs, dragging the mouse turns the camera, Q and E turn it too, and the wheel moves it in and out.
- **Touch:** a stick appears under the thumb wherever it lands on the left half of the screen, walking at the push and running at its rim; dragging on the right half turns the camera, and pinching there moves it in and out.
- **Controller:** the left stick walks at its push, the right stick turns the camera, and the right trigger runs.
- The camera orbits the witch, within limits of tilt and distance, and comes in along its line where the land rises behind her rather than climbing over it.
- How to walk is shown, for the input used last, as its controls beside a symbol of what each does, until that input has walked; on touch, as a ghost stick on the left and a turning symbol on the right.

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
- The day can be held at an hour with `?hour=<0-24>`, and another valley opened with `?seed=<text>`.

## Saving

Single-player and saved on the device: the current valley's seed, camp, cats, recipes, the season and the day. No account needed.

## First slice

The smallest version that is already the game:

- one generated valley, with trails and day and night;
- walking in third person on all three input methods;
- a handful of ingredients to forage and a few recipes to cook at the campfire;
- generated cats to meet, befriend with their favourite dish, and bring to camp;
- saving.

The walks between valleys, brewing, seasons, festivals and the night sky follow, one at a time.

## Open questions

- **Who is the player?** A fixed witch, or one the player designs?
- **The cats on screen:** how many can camp hold before it stops being cozy, and does camp ever outgrow its clearing?
- **Do valleys ever repeat?** A valley left behind could be revisited by its seed, or every walk could lead somewhere new.
- **Other people:** a valley could hold a few gentle characters (a beekeeper, a travelling tinker), or the game could be the witch and the cats alone. Since faces are the art's weak point, characters would have to work at a distance and through silhouette.
- **Music:** generated, composed, or ambient sound only.

## Code map

- `world/`: the valley, pure and unit-tested. `valley.ts` (`generateValley`, everything from a seed), `land.ts` (the bowl, its rim and pass, and the altitude bands), `water.ts` (the lake, the stream and its falls), `places.ts` (camp and the places), `trails.ts` (the trails and their fords), `life.ts` (the woods' density and the scatter of plants), `ground.ts` (biomes and the grounds the land is painted with), `walking.ts` (where a walker may go), `day.ts` (the hour, the sun and moon, and each moment's light), with `grid.ts`, `noise.ts`, `paths.ts` and `fields.ts` underneath.
- `input/`: walking's input. `walk-controls.ts` (each input's meaning, pure) and `use-walk-input.ts` (all three inputs into one state, and the input used last).
- `components/valley/`: the drawing. `valley-view.tsx` (the canvas and its overlay), `atmosphere.ts` (the haze and grade every material ends in), `daylight.tsx` and `clock.ts` (the day's light each frame), `palette.ts` (the tokens), `terrain.tsx`, `water.tsx`, `sky.tsx`, `plants.tsx` with `plant-shapes.ts` and `plant-detail.ts`, `places.tsx`, `campfire.tsx`, `fireflies.tsx`, `painted.ts` (vertex-coloured shapes from pieces), `witch.tsx` (the placeholder witch), `walker.tsx` and `follow-camera.ts` (walking and the camera), `walk-hints.tsx` (the prompts and the touch stick), `valley-probe.tsx` (`window.__hearthwoodValley`: ready, frames, what was drawn, and switches for the hour, motion, camera and walker).
- `tools/valley-shots.mjs`: headless screenshots of the valley through its probe, on a held hour and motion clock: the walker's view through the day, from above and over the rim, each place, and the touch controls on the target phone, upright and sideways, with what each frame drew.

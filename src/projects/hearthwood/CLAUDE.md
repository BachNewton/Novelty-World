# Hearthwood

A cozy 3D game about a wandering hedge-witch and the cats they meet. You live outdoors in a valley of forest and mountain made fresh from a seed: by day you walk and forage, by evening you cook and brew at your campfire, and the stray cats of the woods come round one by one, each won over by the dish it loves. When the valley has given what it has, you pack up camp and walk over the ridge into a new one.

It lives at Games → 3D Games → Hearthwood, in Three.js through `@react-three/fiber`, like the site's other 3D games. The concept and the platform are decided; everything below them is the proposed design, open to the owner's review, with the undecided parts under Open questions.

## Pillars

- **Nothing is ever lost.** No fail states, no combat, no hunger or health meter, no timer that punishes. A meal that comes out unexpected is a new dish, not a failure. A cat never runs away, falls ill or dies.
- **Cooking is for joy and for friendship, never for survival.**
- **Every walk finds something.** The world is generated so that wandering always turns up a herb, a view, a cat or a ruin, and never a long empty stretch.
- **Calm by default.** Soft sound, slow light, no notifications nagging for attention. The game waits as long as the player likes.
- **Witchcraft is gentle and earthy**: hedge-witchery, herbs, the moon and the Wheel of the Year, treated with warmth and respect, never as spooky set dressing.

## Target device

Hearthwood's floor, for both its UI and its performance, is a **Pixel 8 Pro** in Chrome, held upright or sideways. It replaces the site-wide floor of phones up to four years old within this project: layouts are designed and checked at its viewport, and the game must run smoothly on its GPU (Tensor G3's Mali-G715), including after several minutes of play, when a phone runs warm and slows. Laptops and a laptop on a TV with a controller are above that floor.

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
- **The Pixel 8 Pro** sets the budget (see Target device): the land streams in chunks around the player, vegetation is instanced and thinned with distance, and far hills are cheap silhouettes.

## Walks between valleys

The journey part. Leaving a valley is a hike over a generated mountain trail to the next one: the trail climbs, crosses a pass with a view down over both valleys, and descends. A longer hike may take more than a day, with a camp on the way: a small fire on a ledge, a meal from what is in the pack, the stars from higher up. Some walks go to a summit for the view and nothing else.

## Cats

The heart of the game. Every cat is generated, so no two are the same, and every one looks like a real cat because its coat is drawn from real cat coat genetics: the base colour and its dilute, orange and the tortoiseshell and calico it makes, tabby patterns (mackerel, classic, spotted, ticked), white markings from none to van, colourpoint, long or short hair, and eye colour. On top of the look, each cat has:

- **A personality**, from a few traits (bold or shy, lazy or busy, cuddly or aloof) that show in how it moves, where it naps and how close it walks.
- **A favourite dish**, and a few it likes. A stray is won over gradually: it watches from a distance, then comes closer for food, and joins the camp when it is given the dish it loves.
- **A name the player gives it.**

Cats of the camp follow on walks, nap by the fire, sit on the player's pack and sometimes lead the way to something worth finding. Petting a cat is always available and always answered.

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

- `cats/`: the cats, pure where it can be. `genetics.ts` (the genotype, drawn at population frequencies, and the coat it makes; `coatName`), `cat.ts` (`generateCat`: genes, coat, build and personality from a seed), `coat-look.ts` (a coat as the shader's colour tokens and numbers), `rig.ts` (the skeleton's pivots and proportions; `rigOf` a cat's build), `sculpt.ts` (the body's signed-distance forms and their skinned mesh), `motion.ts` (`catPose`: postures, the walk, blends and fidgets, and the two-segment reach the legs are solved with).
- `components/cats/`: `cat-body.tsx` (`CatBody`, one cat drawn and moving from props: activity, speed, greeting and an optional clock; whoever places it moves and turns its group), `skinned-cat.ts` (a cat's skinned mesh and skeleton, posed each frame), `coat-material.ts` (the coat shader), `cat-geometry.ts` and `cat-mesh.worker.ts` (the shared sculpture, meshed once per hair length in a worker), `cat-preview.tsx` (the `?cats` preview: a meadow of nine cats, reroll, and one cat on its own to stand, walk, sit, loaf, greet and turn).
- `tools/cat-shots.mjs`: headless screenshots of the preview through its control surface (`window.__hearthwoodCats`), on a frozen clock: the field on desktop and on the target phone, and each chosen cat by activity and view, with a sheet of them all.

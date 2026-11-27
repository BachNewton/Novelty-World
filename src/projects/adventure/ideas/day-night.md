# Light, skies, and a day and night

An idea, not a plan, except where it says a direction was chosen. The village has Kenney's day sky; this is what else the skybox pack offers, how the skies could carry a day and night cycle if the game wants one, what makes the light cozy, and what in the kits can give light.

## The skies we have

Kenney's Skyboxes (CC0) is five painted skies, each one panorama image, 4096×2048, wrapped round the world (an equirectangular image: the whole sphere of the sky unrolled into a 2:1 rectangle). Soft, cartoon clouds, which suit the kits.

| Sky | Look | Painted in it |
|---|---|---|
| `skybox-morning` | peach and cream, warm haze | a low sun |
| `skybox-day` | blue, white clouds | the sun, high |
| `skybox-night` | deep blue, dark clouds | the moon |
| `skybox-space` | dark, stars | nothing |
| `skybox-alien` | pink and purple | a large bright sun |

Only `skybox-day` is in the repo (`public/adventure/skyboxes/`); the others are in the pack as downloaded and would be copied in when used. There is no evening sky: dusk would reuse morning, perhaps tinted warmer and darker. Space and alien suit somewhere else entirely: a dream, a night sky seen from high up, another world.

## A day and night cycle

The skies are paintings, so their sun and moon stand still wherever they were painted. A cycle built on them separates what the sky shows from what lights the world:

1. **A clock** runs the day: a time of day from 0 to 1 that the game owns, at whatever pace suits it (a real hour, a minute for a game day, or set by the game's own calendar).
2. **The sky crossfades** between the paintings by that time: night into morning into day, back through a warm morning for dusk, into night. A small sky shader of our own samples two panoramas and blends them, so a fade costs one draw. The fade can lean on the time unevenly: a long day and night, a short dawn and dusk.
3. **The light follows the same clock**, apart from the sky: the sun's direction swings over the village (it already follows the player for its shadow), its colour warms toward dawn and dusk and goes blue and dim at night, and the ambient light (the hemisphere light) darkens with it.
4. **Night lights**: the town kit's lanterns and the windows glow at night. That's emissive light on their materials, and maybe a few small point lights near the player, since many real lights cost much.

### What doesn't line up, and what to do about it

- **The painted sun won't match the light's direction**, and doesn't move. In a stylised game this mostly goes unnoticed; if it bothers once seen, the painted sun and moon can be painted out of copies of the images, and our own sun and moon drawn as discs that move with the light.
- **The skies differ in where their horizon and clouds lie**, so a crossfade may show clouds dissolving. Slow fades hide it; turning the night sky to match the day's clouds would hide it more.
- **The sky can also light the world** (as the scene's environment map, so surfaces pick up its colour). That shifts every colour the kits were fitted to, so it's worth trying with the cycle rather than before it, and judging by eye.

## A cozy look

What makes light feel cozy, and the direction chosen for it:

- **Midday stays as it is.** A gold sun and a blue sky light were tried at noon: they only made every colour more saturated and the shade darker, which reads as richer, not cozier. Tone mapping and haze fix nothing yet: under 0.1 % of a frame's pixels reach full brightness, and the whole world lies inside the far plane. Haze comes back if the world grows past it.
- **Warm light and cool shade belong to the low sun.** At golden hour the contrast between a gold light and blue shade is strong enough to read as warmth rather than saturation.
- **Things nestle.** Darkening where things meet (a wall's foot, under eaves, a tree's base) settles them into the ground. It is baked into each merged chunk as it is built, so it costs nothing a frame, holds as the sun moves, and follows the editor's changes chunk by chunk.
- **No shadows from the world unless they are missed.** Everything above works without them; only big sunlit and shaded patches and the long shadows of a golden hour need them, and they are the costly part. The players already cast theirs. The world gets shadows only if stills of the look above show they are missing.
- **Night is cozy by contrast:** a cool blue dark with warm light in it.

## What can give light

Pieces the kits already shape as light sources, which can glow at night (their glass or fire made emissive, picked out by where they sample the colour map, so every piece sharing a swatch glows alike):

- **Town kit:** the `lantern` (a lamppost with a pale glass head), the `chimney-base` (a hearth's opening), and the glazed windows (`wall-window-glass`, `wall-wood-window-glass`, the round, small and stone windows), lit from inside.
- **Nature Kit:** the campfires (`campfire_logs`, `_stones`, `_bricks`, `_planks`). They are modelled without flames, so a fire needs a glow and a flame of its own. Kenney's Particle Pack (CC0, downloaded, not yet in the repo) has white sprites to tint as they are drawn: flames, fire, sparks, smoke, soft round lights and flares, and a lit window's panes (`window_*`), which could be the glow laid over a window at night. Its Smoke Particles (also downloaded) add puffs of white and black smoke for the chimneys and fires, and explosions and flashes.
- **Graveyard Kit** (once added): the lightposts, the glass and candle lanterns, the candles, the fire basket (also without a flame), and the carved pumpkins' faces.

What a glow lights round it is a separate choice from the glow itself: real lights cost every pixel they reach, so a few near the player at most, or a soft pool of light faked on the ground under each source, and a gentle bloom so the glow reads as light.

## What would settle it

- Whether the game has a day at all: whether time passes, and whether anything depends on it (shops that close, people who go home, crops that grow overnight).
- The pace of a game day.
- Whether the player can sleep through a night, which turns the cycle into a fade to black and a morning.

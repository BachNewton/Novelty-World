# Skies, and a day and night

An idea, not a plan: nothing here is decided. The village has Kenney's day sky; this is what else the skybox pack offers, and how the skies could carry a day and night cycle if the game wants one.

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

## What would settle it

- Whether the game has a day at all: whether time passes, and whether anything depends on it (shops that close, people who go home, crops that grow overnight).
- The pace of a game day.
- Whether the player can sleep through a night, which turns the cycle into a fade to black and a morning.

# Coloured light for magic

An idea, not a plan: the game has no magic yet, and nothing here is decided.

Magic could be shown by coloured light more than by particles alone: a spell, a power or an enchanted thing casting its own colour onto the world round it, so a violet glow climbs a wall as a spell is cast, a green light pulses under a charmed plant, a blue one trails a player who carries a power. Against the warm, cool-shaded look of the cozy world (see `day-night.md`), a saturated colour reads at once as something other, and it reads best at dusk and night.

## What it would take

- **Light that moves and changes colour.** Real lights cost every pixel they reach, and the number of lights is compiled into every material, so changing it rebuilds them all. A small fixed pool of lights, each moved to whatever magic is nearest the camera and switched off when idle, keeps both the cost and the materials fixed. Shipwright does this for its navigation lights.
- **Glow on the effect itself**: emissive particles or meshes, and a gentle bloom so a bright colour spreads into light. Kenney's Particle Pack (downloaded, not yet in the repo) is made for this: white sprites tinted to any colour, with magic circles and runes (`magic_*`, `symbol_*`), twirls, stars, sparks, slashes, traces and flares.
- **A cheap stand-in** where a real light is too dear: a soft coloured pool drawn on the ground under the effect.

## To settle

- What magic is in the game at all, and who uses it.
- A palette for magic that never clashes with the world's own colours.
- How many lights the integrated GPU can afford at once.

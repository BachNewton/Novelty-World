# Character Sprites (Cute Fantasy Pack)

Status: idea / not implemented.
Date: 2026-09-22.
Source: `Cute_Fantasy.zip` (`Cute_Fantasy/Player/`, `Cute_Fantasy/NPCs (Premade)/`).

## Catalog

**Full-body part layers — 129 files, all exactly 576×3584 (9 cols × 56 rows
on a 64px grid).** They alpha-composite 1:1 over each other (verified: a
Base+Pants+Shoes+Shirt+Hands+Hair+Hat composite renders a correct farmer).

| Slot | Styles | Colors each | Count |
|---|---|---|---|
| Head/Hair | Hair_1…Hair_6 | Black, Blonde, Brown, Ginger, Grey | 30 |
| Head/Helmet | Plate_Helmet_1, Plate_Helmet_2 (Heavy) | 8 armor tints each | 16 |
| Chest | Farmer_Shirt (8), Lumberjack_Shirt (9), OG_Shirt (8), Plate_Chest (8), Royal_Shirt (7) | style-dependent | 40 |
| Legs | Farmer_Pants (8), OG_Pants (8), Plate_Legs (8), Royal_Pants (7, incl. typo'd `Royal_Pantst_1_Red.png`) | style-dependent | 31 |
| Feet | Shoes_1 | 9 | 9 |
| Hands | `Hands_1_Bare.png` (full grid) | — | 1 |
| Accessories | `Farmer_Hat_1.png` (full grid) | — | 1 |
| Base body | `Player_Base_animations.png` (skin body all clothes layer over) | — | 1 |

**Hands variant (different grid):** `Hands_Bare_Lantern_Torch_Idle_Running.png`
is 384×768 (6 cols × 12 rows) — arm overlays holding lantern/torch. Not
interchangeable with the full-grid hands file.

**Tools (effect/prop overlays, 64px grid, NOT body parts):** `Iron_Sword`
(256×576 swing arcs), `Iron_Tools` (384×768 axe/pickaxe/hoe/shovel swings +
watering-can pours), `Wooden_Bow` (384×192), `Wooden_Fishing_Rod`
(576×384 casts + splashes), `Lantern_Idle/Running`, `Torch_Idle/Running`
(384×192 each). Sparse cells; designed to overlay action-row body frames.

**Mounts:** `Player_Mounts/Horse/` — 5 colors (Black, Brown, Chocolate,
Gray, White), each 384×384 (6 cols × 6 rows). **Horse only, no rider.**
Rows 0–2 = idle with only cols 0–1 populated (front/side/back); rows 3–5 =
6-frame walk cycles (front/side/back). Same 64px grid, same direction order.

**Premade NPCs — same 64px grid; rows 0–5 = front-idle / side-idle /
back-idle / front-walk / side-walk / back-walk (6 frames each, side faces
right):**

| NPC | Size | Extra rows |
|---|---|---|
| Bartender_Bruno, Bartender_Katy, Chef_Chloe | 384×448 (6×7) | row 6: 4-frame action (carrying/serving) |
| Lumberjack_Jack, Miner_Mike | 384×640 (6×10) | row 6: 4-frame + rows 7–9: tool swings side/front/back |
| Farmer_Bob, Farmer_Buba | 384×832 (6×13) | row 6: 4-frame + rows 7–12: hoe/water-bucket actions |
| Fisherman_Fin | 576×832 (9×13) | same plan but action rows are 9 frames wide (casts need width) |

NPC art is smaller within cells (~28–32px tall) but the grid is the same.

## Conventions (verified)

- Part sheets, base sheet, horse sheets, NPC sheets: **64px grid, rows 0–5
  = front-idle, side-idle, back-idle, front-walk, side-walk, back-walk**,
  6 frames per row. Our game already matches (`FRAME_SIZE=64`,
  `FRAME_COUNT=6`, side flipped for left).
- Cols 0–5 within rows are **animation frames**, not outfit variants.
- Rows 6–55 of part sheets are action/pose banks in varying widths
  (4-col tool-use/carry groups rows 6–15; mixed 1/4/6/8/9-col groups rows
  16–55 incl. kneel/sit/emotes). Exact semantics live in the `.aseprite`
  file — the PNG alone doesn't label them.

## Second playable outfit

Pick one file per slot (minimum full character = Base + 1 Hair/Helmet +
1 Chest + 1 Legs + Shoes + Hands_1_Bare, optional Hat), all on the
identical grid, alpha-composite per cell. E.g. lumberjack: `Hair_3_Brown` +
`Lumberjack_Shirt_1_Green` + `OG_Pants_Brown` + `Shoes_1_Brown` + base +
bare hands. Slice rows 0–5 cols 0–5 into the same six 384×64 strips the
game consumes, under `public/rpg/sprites/<name>/`, and parameterize one
`SPRITE_SET` constant in `game-world.tsx` — zero renderer changes. Shirt /
pants colors are baked per file: an outfit is a fixed file combo, not a
runtime tint.

## Mounts

Horse-only sheets on the same grid/row order, so drawing horse strip +
rider strip at the same anchor needs a **rider-in-saddle** body — standing
bodies will clip legs through the horse. Base rows 44–55 may hold riding
poses (unverified — check `.aseprite` tags first). Idle rows have only
2 frames (cols 0–1), so idle strips must be 2-frame. Likely needs a few-px
vertical nudge (one tunable constant) after visual check.

## NPC entities

Slice rows 0–5 into six strips and they drop into the existing renderer
unchanged (Bob/Buba = second farmer free; Jack/Mike give axe-swing rows
7–9 for a future action state). 4-frame row 6 and Fin's 9-wide rows need
per-row frame counts — one small data table, not a renderer rewrite.

## Licensing (`Cute_Fantasy/read_me.txt`, Premium)

- Commercial and non-commercial use allowed. Modification allowed.
- **No redistribution or resale, even if modified.**
- Shipping PNGs (or derived strips) inside `public/` as part of our game =
  normal use. Do NOT publish raw sheets/strips as standalone artifacts.
  Keep the license text vendored alongside the files. Attribution not
  required, but the author asks for an itch.io rating.

## Sequencing (second character)

1. Choose + freeze the combo; record the 6 source filenames.
2. Build-time composite script (`src/projects/rpg/scripts/compose-outfit.py`):
   Pillow alpha-composite of the 7 layers → slice rows 0–5 cols 0–5 → six
   384×64 strips to `public/rpg/sprites/<name>/`.
3. Vendor + license: copy used part files (or just output strips) +
   `read_me.txt` terms; never commit the whole zip.
4. Game wiring: parameterize strip paths (`SPRITE_SET`), ~10 lines.
5. Deferred: action rows (need Aseprite tag map), mounts (riding-pose
   verification), NPC entities (slice on demand).

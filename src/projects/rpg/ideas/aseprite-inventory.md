# Player_Aseprite_Files.zip — Sheet Inventory

Status: reference. Only rows 0–5 of frame 0 are used in-game so far.
Date: 2026-09-22.
Source: `Player_Aseprite_Files/Player_Main_All.aseprite` (576×3584 canvas,
64px grid, 8 frames @100ms, 32-bit, 10 layers, no tags/slices).

Layers: `horse`, `tool_under`, `base`, `shoes`, `pants`, `shirt`, `hair`,
`accesory` (sic), `hands` (hidden flag), `tool_top`. Everything shipped so
far is flattened composite; no layer has been isolated except implicitly.

## Used in game (`public/rpg/sprites/farmer-bob/`)

Rows 0–5, frame 0 (farmer outfit), sliced to six 384×64 strips
(6 frames × 64px cells):

| Strip | Sheet location |
|---|---|
| front-idle | row 0 (symmetric front, subtle cycle) |
| side-idle | row 1 (3/4 facing right; flipped for left) |
| back-idle | row 2 (hat/hair, no face) |
| front-walk | row 3 (6 distinct strides) |
| side-walk | row 4 (faces right natively; flipped for left) |
| back-walk | row 5 |

Row facings were established by zoomed pixel inspection after two
misreads — do not re-derive from thumbnails. Row 0/1/2 are palindrome
cycles (A-B-C-C-B-A); rows 3/4/5 are 6 distinct phases.

## Unused rows (frame 0)

- **6–15** — tool swings with white slash arcs (front/side/back,
  4-frame anims each, verified animated not static).
- **16–19** — wider 8-col action sequences.
- **20–22** — single-frame pickup/hold poses (1 col each).
- **23–25** — carry cycles (5 cols).
- **26–28** — second idle/walk set.
- **29** — swim.
- **30–31** — walk with bow: row 30 side (draws it in frames
  0–2, carries at side in 3–5), row 31 back (held overhead); 6 distinct
  striding phases each.
- **32–40** — hoe attacks side/front/back with arcs + overhead chop.
- **41–43** — watering-can pour with blue particles.
- **44–49** — fishing: cast, line mid-air, water splashes, reel-in
  (9 cols wide; rod + line + splash FX live here).
- **50–52** — mounted horse idles (2 frames).
- **53–55** — mounted horse walk/gallop, front/side/back (6 cols).

## Unused frames (outfits 1–7)

Same poses, different hair/shirt/pants/accessory layers: red shirt,
spiky/crown hair, blonde long hair + green shirt, cap, 2× knight armor
(+1 more). Confirmed by compositing each frame: only outfit layers change.

## Unused layers (never isolated)

`horse`, `tool_top` / `tool_under` (rod, line, splash/arc FX),
`accesory`, hidden `hands`.

## Suggested slice order (most game-useful first)

1. Hoe attack + watering pour (farming loop).
2. Fishing sequences (rod/line/splash need tool layers isolated or kept
   composited as-is).
3. Horse idle/walk (mounted).
4. Alternate outfits (re-slice rows 0–5 per frame).

# Trees closer to buildings, crowns over roofs

An idea, not a plan: take it up only if the towns look pruned, with trees round houses too short or too few. The owner judged the current rule good as it stands.

## What the rule does now

Every tree reads the clearing round buildings (`pipeline/clearing.py`) and is no taller than lets its crown clear the nearest building, as the forest's part of `render/CLAUDE.md` describes. The rule is conservative in three ways:

- **One crown for every tree.** The reach (`CROWN_REACH`, `render/tree-shapes.ts`) is the widest any tree has: a broadleaf's far crown, drawn wider so it reads at a distance, with the most any tree spreads and leans. A spruce's crown is much narrower, so a 15 m spruce stands about 7.4 m from a wall when about 4 m would do.
- **No overhang.** In real towns a trunk often stands clear of a wall with its crown above the roof. The rule treats the whole crown as if it hung at ground level.
- **A 1.5 m slack** (`CLEARING_SLACK_M`), for the 4 m image reading long round small sheds' corners.

`tools/tree-check.ts` counts what it costs: in Mariehamn (L2334E), 4% of trees are shortened, about 1% by more than half, and 1.5% are gone. Across the island it's 0.24% of trees, nearly all of them in towns.

## The improvement

1. **Each tree's own crown.** Work out a tree's kind and stage before its height is capped, and cap it by that row's own reach. Kind comes from the stand and rolls, not from height. Stage comes from height, so test the tree at its full height against its own rows. If it fits, it keeps its full height. If not, it's capped by the general reach, as now. Rock pines keep their own gate. No new data is needed.
2. **Crowns over roofs.** Bake each place's tallest nearby roof top (above the ground) beside the distance. Then only the part of a crown below that height has to clear the walls, and the trunk always does. A crown starts high on a grown pine or an old broadleaf and at the ground on a young spruce, so this needs part 1. The heights can come from `solids.bin.gz`'s vertices, plus the sheds', boathouses' and windmills' kit heights. It needs another channel somewhere the forest already reads, a rebake of the clearing and a republish.

The check would have to work out each tree's kind and stage as the shader does, so that it stays exact. That's the fiddly part. Lindens could take the same rule in `pipeline/dressing.py`, since their crowns start at a fixed share of their height.

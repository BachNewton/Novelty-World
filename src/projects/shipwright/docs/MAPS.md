# Charting the archipelago — the map tool, and the in-game chart it could become

Two things live here: the **terrain-review tool we have** (`tools/map.ts`), and the **in-game map we
don't have yet** but should seriously consider, because it is almost free and the game is a *sailing*
game.

---

## Part 1 — the tool (built, use it)

```bash
npx tsx tools/map.ts out.png --seed 13 --span 3000 --px 1000 --window
npx tsx tools/map.ts wide.png --span 50000 --px 1600 --ss 3      # 50 km, supersampled
```

It imports `terrain.ts` and samples `bedrockField` directly — no browser, no GPU, no dev server. It
writes a hypsometric-tint + hillshade PNG (zlib is in node; there is no image dependency) and prints
the island **size distribution** and the **zoning** statistic.

### Why it exists — the failure mode it was built to catch

The 3D scene renders a **600 m window**, and *a 600 m window is smaller than the scale an archipelago
is organised into*. So an entire class of terrain bug is **structurally invisible from inside the
game**, and one of them shipped:

> The bedrock field's largest scale was 520 m. Nothing modulated land on and off across kilometres, so
> it splattered same-sized islands at uniform density forever — 1,568 islands over 9 km², **not one
> above 10 ha**, and every 500 m tile holding 11–13 % land. No basins, no inner/outer archipelago,
> nothing to sail toward. From inside the scene it looked completely fine: one island, some skerries.

One map at 3 km made it obvious in a glance. See `ISLANDS.md` → "The spectrum rule".

**So: run this whenever you touch the field's spectrum.** The `zoning` number is the fastest tell — a
flat splatter sits near 0.5, a properly zoned archipelago near 1.6.

### The zooms, and what each is for

| Span | Shows |
|---|---|
| 600 m | what the live scene actually renders — for comparison, marked with `--window` |
| 3 km | islands, chains, sounds. The scale the archipelago is *organised* into |
| 10 km | zoning: dense clusters vs open basins, banded along the glacial grain |
| 50 km | whether the world has any structure ABOVE the archipelago. **Right now it does not** |

**Use `--ss` at wide spans.** At 50 km one output pixel is 31 m and a skerry is a few metres across, so
point-sampling *deletes* the small islands and flatters the map. Supersampling keeps them as faint
pixels — an honest coastline. `--ss 3` is enough at 50 km.

### What the 50 km map told us (an open finding, not a bug)

At 50 km the world is **statistically homogeneous** — the same texture edge to edge. No mainland, no
coast, no edge to the archipelago, no open Baltic. This is the *same* flat-spectrum failure one level
up: the largest scale in the field is now `SUPER_RELIEF`'s 2100 m, so beyond a couple of kilometres
nothing organises anything.

Whether that matters is a **scope** question, and it should be answered before anyone picks a world
size. If the playable world is a few km, it is invisible. If players can sail tens of km, they will
feel it, and the fix has the same shape as last time: a scale *above* `SUPER_RELIEF` — a coastline /
basin scale that says "here the archipelago ends and the open sea begins."

---

## Part 2 — the in-game chart (not built; worth doing)

**The idea.** Shipwright is a sailing game in an archipelago with real IALA navigation marks. A chart
is not a HUD widget bolted on — it is *the* instrument of the fiction. And these images are already
what a chart looks like.

**Why it is nearly free.** `bedrockField` is a **pure, seeded function of (x, z)**. A map is just that
function, sampled on a grid and coloured — which is exactly what the tool does in ~100 lines. No
render, no readback, no server, nothing to synchronise: every client computes the identical chart from
the shared seed, the same argument that chose Gerstner over an FFT ocean (see `CLAUDE.md` → Water
architecture). It reuses `heightAt`, which the terrain already exposes.

**Sketch of an implementation, when we want it.**
- Generate map tiles in a **Web Worker** (the same worker that will generate terrain chunks once
  streaming lands — see the roadmap). Terrain generation is already the thing that wants to leave the
  main thread; the chart is the same sampling loop at a coarser step.
- Draw to a `canvas` / `CanvasTexture`. A chart tile is cheap enough to compute at several zooms and
  cache by (tile, zoom, seed).
- Or, for a live minimap, evaluate the field **in a fragment shader**: the noise is ~40 lines of GLSL
  and the ocean already proves we keep a CPU and GPU evaluation of the same field in lock-step.

**What would make it Shipwright's chart rather than a generic minimap** — the game's own world is full
of chart vernacular and we should raid it:
- **Soundings and a safety contour.** We have `heightAt` everywhere, so depths are free. A shoal you
  can run aground on is exactly what a sailor wants marked, and grounding is a real hazard once ships
  are voxels with hulls.
- **The nav marks.** `iala.ts` already holds the buoyage as *pure data* — colours, topmarks, light
  rhythms. Drawing lateral and cardinal marks on the chart, with their light characteristics beside
  them, comes almost entirely for free and is the single most flavourful thing on the page.
- **Fog of war / surveying.** The world is infinite and procedural; a chart the crew *fills in as they
  sail* turns exploration into something that accumulates. This is the version with actual gameplay in
  it, rather than a convenience overlay.
- **Paper, not glass.** The visual identity should be a nautical chart — the render is photoreal
  (`CLAUDE.md`), and a chart is the one surface in this game that is legitimately an *artefact*, so it
  can be as hand-drawn as we like without contradicting anything.

**The catch to check before building.** The chart is only cheap because the field is cheap. Generating
the 600 m terrain window already costs ~1.65 s on the main thread, so a chart at 50 km must be tiled,
worker-side, and cached — do not naively sample a whole world at map open.

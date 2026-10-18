# Handoff: overlapping graphics features, and the glint through the ridge

**Goal.** Find the graphics features that do the same job twice, so the frame isn't paying for one look two times, and decide what to do about each. Second, fix a bug the review turned up: the water's sun glint shows when the sun is hidden.

## Where it stands

- **The review is published** as a private artifact for the owner to judge: <https://claude.ai/artifact/2o3KrVqvGLTKybcdKu8wm9> ("Hearthwood Overlap Review"). It has six pairs and 22 scenes. Each scene is one camera, hour and weather, shot four ways: both features off, each one alone, and both on. Every other feature stays on. Beside each scene are notes and the mean per-pixel difference between versions.
- **The capture tools are on this branch** (`hearthwood-overlap-shots`): `tools/overlap-glow-shaft-shots.mjs`, `tools/overlap-shadow-shots.mjs` and `tools/overlap-water-night-shots.mjs`, listed in the project's `CLAUDE.md` code map. Each writes to `.shots/overlaps/<pair>/` (gitignored) and takes `--only=` to reshoot single scenes.
- **The full-size PNGs** live in the main checkout's `src/projects/hearthwood/.shots/overlaps/`, not on the branch. That folder also holds a local viewer, `index.html` with `data.js`, which needs a static server to load its images. The artifact holds 1280-wide JPEG copies.
- **Nothing is decided yet.** The owner is reviewing the artifact. No feature has been changed.

## What the shots found

| Pair | Verdict | In short |
|---|---|---|
| `bloom` vs `bloomyFog` | Overlap | In mist, bloomy fog does nearly all the glowing and buries bloom; in clear air both are tiny and alike. Bloomy fog, not bloom, makes the moon in mist a huge white disc (the "moon in mist" item in Open questions). |
| `skyReflection` vs `screenSpaceReflections` | Partial | Screen-space reflections already mirror the sky, so sky reflection on top adds almost nothing at noon. Sky reflection alone draws the sun's glint and fills the screen's edges, where screen-space reflections fade out. |
| `softShadows` vs `overcastShadows` | Partial | Different jobs in clear weather, but under cloud overcast's wide blur swamps soft shadows, so soft shadows only pay in clear or fair weather. |
| `godRays` vs `sunShafts` | Different jobs | Only god rays make real shafts between trunks (needs mist); only sun shafts show anything in clear air. They lean on each other only in mist with a low sun, where god rays dominate. |
| `farShading` vs `sunShadows` | Different jobs | They hand over at the shadows' reach (~900 m); both on is the two added together. |
| `nightVision` vs `colourGrade` | Different jobs | Night vision cools the moonlight; the grade warms the firelight. They pull against each other slightly on saturation. |

## Next step

Take the owner's verdict on each pair from the artifact, then act on it. These are the candidates the shots point to; none of them is agreed:

- **Glows.** Choose between bloom and bloomy fog in mist, or keep both and tame bloomy fog so the moon and the misty sky stop blowing out to white. That also answers the doc's open question "Two glows in one".
- **Soft shadows under cloud.** Skip the soft-shadow search once overcast has taken over, a saving that changes nothing on screen.
- **Water reflections.** Keep sky reflection for the glint and the edge fallback. Consider whether its mirrored-sky term is wasted work wherever screen-space reflections already land.
- **Measure before cutting anything.** `tools/feature-shots.mjs` times each pass on the GPU. The costs measured so far (in the project `CLAUDE.md`) are the shadow maps at about 10 ms a frame, the clouds 4.5 ms, the physical sky 3.5 ms and bloom 0.4 ms (desktop, 1600×900). Bloomy fog, god rays, sun shafts and the reflections haven't been timed per feature for this question yet.

## The bug: the sun's glint shows through the ridge

`skyReflection` draws the sun's glint on the water without checking whether anything blocks the sun. At golden hour on the lake near camp, with the sun behind the ridge, a broad golden glint band still lies across the water. Screen-space reflections cover most of it when both are on, but with sky reflection alone it is plainly wrong. The moon's glint presumably has the same fault.

- **Reproduce:** with the dev server up, `node src/projects/hearthwood/tools/overlap-water-night-shots.mjs --only=lake-golden-glint`. Then look at `.shots/overlaps/water-reflections/lake-golden-glint__skyReflection.png`. The sun sits at 4.5° behind the ridge, and the camera is 1.2 m above the lake centred at (479, 27), the nearest lake to camp, looking toward the sun.
- **Likely fix:** gate the glint on whether the light reaches that point of water, for example by reading the key light's shadow at the surface. Find the root cause in the water shader first; don't guard around it.
- **Done when:** the glint is gone with the sun hidden behind terrain and unchanged with the sun in view (the `lake-afternoon-sunward` scene).
- A task card for this fix was proposed in the session that found it and may still be waiting.

## Gotchas

- **Run node from PowerShell, not Git Bash.** On this machine Git Bash fails before node starts, with an `fnm env` error.
- **The tools need the dev server on port 3001** (`npm run dev` in the main checkout). They hide the UI overlay. The stats meter in the top-right corner stays in every shot, so the difference numbers carry a little of its noise.
- **Camp lies in a mountain's shadow from about 14:00 on the equinox** (the date every shot uses). Golden-hour scenes at camp therefore show no sunlight, and god rays draw nothing there. The tools find their own sunlit spots, up to about 2 km from camp. Keep that in mind before shooting anything at camp in the evening.
- **Cloudy scenes need a moment when the sun is out.** The shadow tool steps the held motion clock until the subject is sunlit, which is why its cloudy shots carry different motion values.
- **The `.shots/overlaps/` folder was emptied once mid-run, cause unknown.** None of the three tools deletes anything. If shots go missing, rerun the tool for that pair.

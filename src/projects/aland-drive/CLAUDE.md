# Åland Drive

A 3D open-road driving game inspired by the Test Drive Unlimited series, set on the main island of Åland at 1:1 scale, built from real public geodata.

It lives at Games → 3D Games → Åland Drive. **For now it is only a scaffold**: a sky-coloured clear, a flat ground plane and one light, enough to show the page boots and draws. No terrain, car, data pipeline or gameplay exists yet.

## Platform

Web only, WebGPU only, three.js driven directly with no React Three Fiber, and Rapier for physics. It never moves to a native engine. A browser without WebGPU is told the game needs it.

The render (`render/game.ts`) is one renderer, one scene and one loop. The page (`components/aland-drive.tsx`) only starts it and stops it; nothing in the game renders through React. `window.__alandDrive` is the probe for tools, waiting on events rather than time.

## Floor

The owner's laptop is the hardware floor: a Framework 13 with a Ryzen 7 7840U and its integrated Radeon 780M, driving a 3440×1440 100 Hz screen.

**Mobile is not supported.** This project is an exception to the repo's phone-floor and 360px responsive principles. Input is keyboard and controller, with no touch.

The target is a steady 60 fps, drawing the 3D world below screen resolution and scaling it up, with the UI sharp.

## Graphics approach

Start simple, and add a feature only when it fixes something visibly wrong and its cost is known.

- **Bake ahead of time what can be baked**: terrain shading and soft shadows from the 2 m data.
- **Spend detail near the car.**
- **Keep distance cheap**: simplified terrain, card trees, haze.
- **Rapier only needs the ground around the car.**
- **Measure by counts** (draw calls, triangles) and the GPU's timestamp queries, per the repo's speed rule.

## Art direction

Undecided until a prototype shows how the real data looks. Expected: real land and road layout, with simpler generated buildings and trees. Cars are invented, with no real brands, and must match the world's art style; they stay placeholder until that is judged.

## Data

**Confirmed:**

- **NLS Finland 2 m elevation model** (CC BY 4.0) covers Åland, in ETRS-TM35FIN, as 6×6 km tiles of 3000×3000 samples, from the mirror `https://mirrors.nic.funet.fi/index/geodata/mml/dem2m/2008_latest/`. Land tiles are about 20–24 MB. Tile L2343C (inland, x 98000–104000, y 6690000–6696000) was decoded and shows real roads, ditches and ridges; it is the first prototype area.
- **OpenStreetMap** (ODbL) has about 18,000 road and path ways and 27,700 buildings in a box around the island. Their quality is unchecked.
- **kartor.ax** (CC BY 4.0) has 19 datasets, none of them terrain, roads, buildings or imagery, but its traffic counts and landmark layers are useful.

**Unconfirmed:** whether the NLS Topographic Database, NLS orthophotos and laser point clouds (for tree heights) actually cover Åland. Phase 1 settles this.

## Hosting

Tiles start on Supabase Storage and are fetched from one configurable base address, so they can move to Cloudflare R2 if measured download volume calls for it. Supabase Free is 1 GB of storage and 5 GB of egress a month; R2 has free egress.

## Licences

CC BY and ODbL sources are credited on the credits page when their data first ships, per the repo's credits rule.

## Phases

1. **Data proof** on the one tile, and settle the unconfirmed sources.
2. **First drive** on that area: simple graphics, one placeholder car, keyboard and controller, proving driving feel and road smoothing. Raw terrain makes bumpy roads, so roads need smoothing and blending into the land.
3. **Grow** to about 9 tiles and build streaming.
4. **Art direction check** with forest, shoreline, fields and building shapes, then pick the car style.
5. **Whole island**, with map, GPS and bridges.
6. **Game loop**: road discovery, races, buying cars and a house, then online free-roam on the relay. Car positions are designed for that from phase 2.
7. **Traffic, weather, seasons, ferries.**

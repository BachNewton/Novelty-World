# Download only the tiles that changed

An idea, not a plan: proposed by the owner while looking at the site's Supabase egress. Pairs with `tile-hosting.md`, and helps whichever host serves the tiles.

## What happens now

A browser already keeps every tile it fetches: the files carry a year's cache and never change, so driving a route again fetches nothing (Hosting in the project's `CLAUDE.md`). What it can't keep across a rebuild is anything at all. Each build is published as a new folder named by `TILES_VERSION`, so every file has a new address, and every player downloads every tile they visit again, even when the rebuild changed three tiles of 94. The same rebuild uploads the whole island again, and storage holds two copies until `--clear-old` runs.

The browser's HTTP cache is also the browser's to empty: it evicts by its own rules when space runs short, and a phone's is small next to the island's 400-odd MB.

## The idea

Version each file, not the build:

- **Content-addressed files.** Each tile's files are named by a hash of their content, as the audiobooks already are. A small manifest, published per build, maps each tile to its files. `TILES_VERSION` names the manifest, not a folder of copies.
- **A rebuild sends only what changed.** The upload skips every file already there, and a player's browser, reading the new manifest, finds every unchanged tile under the address it already holds. Clearing old versions deletes only files no live manifest names.
- **A store that keeps.** Tiles go into the browser's own storage (the Cache API or the origin-private file system) with persistent storage asked for, so the island stays on the device until a tile's hash changes, rather than until the HTTP cache needs the room. The game reads the store first and fetches only a miss.

## Open

- How large the manifest is, and whether the overview and far data, which every start loads, are split so a small change doesn't change them all.
- What to do when the browser refuses persistent storage, or the device is short of space: fall back to the HTTP cache as now.
- Whether a player sees a download size before a big update, or it simply streams as they drive.

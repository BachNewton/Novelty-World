/**
 * One-off data generation script. Hits PokeAPI to build the trivia dataset
 * written to src/projects/pokemon/data/pokemon.json. Re-run only when the
 * dataset needs updating (new generations, artwork changes, etc.).
 *
 *   node scripts/generate-pokemon-data.mjs
 *
 * PokeAPI strongly recommends caching consumers (~50B calls/month). This
 * script is the cache: run once, commit the JSON, play offline.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(
  __dirname,
  "../src/projects/pokemon/data/pokemon.json",
);

// Gen 9 ends at species id 1025 (Pecharunt). Bump when future gens launch.
const MAX_SPECIES_ID = 1025;
const CONCURRENCY = 24;

const GEN_NAME_TO_NUMBER = {
  "generation-i": 1,
  "generation-ii": 2,
  "generation-iii": 3,
  "generation-iv": 4,
  "generation-v": 5,
  "generation-vi": 6,
  "generation-vii": 7,
  "generation-viii": 8,
  "generation-ix": 9,
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function titleCase(name) {
  return name
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

async function fetchOne(id) {
  const [pokemon, species] = await Promise.all([
    fetchJson(`https://pokeapi.co/api/v2/pokemon/${id}`),
    fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
  ]);

  const genName = species.generation?.name;
  const generation = GEN_NAME_TO_NUMBER[genName];
  if (!generation) {
    throw new Error(`Unknown generation "${genName}" for id ${id}`);
  }

  const types = pokemon.types
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((t) => t.type.name);

  const spriteUrl =
    pokemon.sprites.other?.["official-artwork"]?.front_default ??
    pokemon.sprites.front_default;

  if (!spriteUrl) {
    return null;
  }

  return {
    id,
    name: titleCase(species.name),
    types,
    generation,
    spriteUrl,
  };
}

async function main() {
  const ids = Array.from({ length: MAX_SPECIES_ID }, (_, i) => i + 1);
  const results = new Array(ids.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= ids.length) return;
      const id = ids[i];
      try {
        results[i] = await fetchOne(id);
      } catch (err) {
        console.error(`Failed id ${id}:`, err.message);
        results[i] = null;
      }
      completed++;
      if (completed % 50 === 0 || completed === ids.length) {
        console.log(`  ${completed}/${ids.length}`);
      }
    }
  }

  console.log(`Fetching ${ids.length} Pokemon with concurrency ${CONCURRENCY}...`);
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const data = results.filter((r) => r !== null);
  data.sort((a, b) => a.id - b.id);

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");

  const byGen = {};
  for (const p of data) {
    byGen[p.generation] = (byGen[p.generation] ?? 0) + 1;
  }
  console.log(`\nWrote ${data.length} entries to ${OUT_PATH}`);
  console.log("By generation:", byGen);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

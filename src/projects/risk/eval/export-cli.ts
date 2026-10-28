import { writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { supabaseStore } from "../online/supabase-store";
import { onlineLogOf } from "./online-log";

/** `npm run risk:export` — an online game's move log, as `risk:trace -- --online` and
 *  `risk:agreement -- --online` read it: the game's row and its `risk_moves`, read from the live
 *  project with the anon key (the tables' read access), so it never writes.
 *
 *  Usage:
 *    npm run risk:export -- <game id>                  (to stdout)
 *    npm run risk:export -- <game id> --out game.json */

const ENV_FILE = fileURLToPath(new URL("../../../../.env.local", import.meta.url));

function parseArgs(argv: readonly string[]): { id: string; out?: string } {
  let id: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out = argv[++i];
    else if (id === undefined && !argv[i].startsWith("--")) id = argv[i];
    else throw new Error(`unknown argument "${argv[i]}"`);
  }
  if (id === undefined) throw new Error("Example: npm run risk:export -- CZ7U --out CZ7U.json");
  return { id, out };
}

async function main(): Promise<void> {
  const { id, out } = parseArgs(process.argv.slice(2));
  process.loadEnvFile(ENV_FILE);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error(".env.local needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const store = supabaseStore(createClient(url, key, { auth: { persistSession: false } }));
  const row = await store.read(id);
  if (row === null) throw new Error(`no Risk game ${id}`);
  const log = onlineLogOf(row, await store.moves(id));
  const text = `${JSON.stringify(log)}\n`;
  if (out === undefined) process.stdout.write(text);
  else {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the file named on the command line
    writeFileSync(out, text);
    console.error(`${id}: ${log.players.toString()} seats (${log.labels.join(", ")}), ${log.moves.length.toString()} moves, to ${out}`);
  }
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});

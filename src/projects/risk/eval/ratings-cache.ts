import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOT_MODULES } from "../bots";
import type { LadderCache, MatchupGames, MatchupRecord } from "./ratings";
import { hashSources, sourceClosure } from "./source-hash";

// The ladder's matchups already played, kept in `ratings-cache.json` beside this file and
// committed, so a ratings run or a gauntlet's field games play only what is new: a new
// bot's own matchups, not every pair again. Each record carries the hash of the code its
// games ran on, both bots' and the game's, and answers only while that code is unchanged.

const CACHE_FILE = fileURLToPath(new URL("./ratings-cache.json", import.meta.url));
const BOTS = fileURLToPath(new URL("../bots/", import.meta.url));
const LADDER = fileURLToPath(new URL("./ratings.ts", import.meta.url));
/** The bot-lab core rates and carries games but never plays one, so a change there
 *  changes no record. */
const BOT_LAB = fileURLToPath(new URL("../../../shared/lib/bot-lab/", import.meta.url));

interface Entry extends MatchupRecord {
  code: string;
}

const codeHashes = new Map<string, string>();

function remembered(key: string, compute: () => string): string {
  let hash = codeHashes.get(key);
  if (hash === undefined) codeHashes.set(key, (hash = compute()));
  return hash;
}

/** The code a game is played on apart from its bots: the engine, the runner and how a
 *  matchup's games are dealt. */
function gameCode(): string {
  return remembered("", () => hashSources(sourceClosure([LADDER], (f) => f.startsWith(BOTS) || f.startsWith(BOT_LAB))));
}

/** A bot's code: its own module and everything it imports. A tuned label also depends on
 *  the registry that builds it; the settings it moves are in the label. */
function botCode(label: string): string | null {
  const base = label.split("~")[0];
  if (!Object.hasOwn(BOT_MODULES, base)) return null;
  return remembered(label, () => {
    const entries = [path.join(BOTS, BOT_MODULES[base])];
    if (base !== label) entries.push(path.join(BOTS, "index.ts"));
    return hashSources(sourceClosure(entries));
  });
}

function codeOf(lone: string, rest: string): string | null {
  const a = botCode(lone);
  const b = botCode(rest);
  return a === null || b === null ? null : `${gameCode()}.${a}.${b}`;
}

function keyOf(g: MatchupGames): string {
  return `${g.seeds} ${g.groups.toString()}g ${g.maxTurns.toString()}t`;
}

function read(): Record<string, Entry> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the cache file beside this module, a fixed path in this repo
    return (JSON.parse(readFileSync(CACHE_FILE, "utf8")) as { matchups: Record<string, Entry> }).matchups;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

/** The cache on disk. Each new record is written at once, merged into the file as it is
 *  then, so a run that stops keeps what it played and two runs at once keep each other's.
 *  Records whose code has changed, or whose bots are gone, are dropped as it writes. */
export function fileLadderCache(): LadderCache {
  return {
    get(games) {
      const entry = read()[keyOf(games)] as Entry | undefined;
      if (entry === undefined || entry.code !== codeOf(games.lone, games.rest)) return null;
      return { tally: entry.tally, win: entry.win, finish: entry.finish };
    },
    set(games, record) {
      const code = codeOf(games.lone, games.rest);
      if (code === null) return;
      const matchups: Record<string, Entry> = {};
      for (const [key, entry] of Object.entries({ ...read(), [keyOf(games)]: { ...record, code } })) {
        if (entry.code === codeOf(entry.tally.lone, entry.tally.rest)) matchups[key] = entry;
      }
      // A line a matchup, so a run's diff reads as the matchups it played.
      const lines = Object.entries(matchups)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, entry]) => `  ${JSON.stringify(key)}: ${JSON.stringify(entry)}`);
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- the cache file beside this module, a fixed path in this repo
      writeFileSync(CACHE_FILE, `{\n"matchups": {\n${lines.join(",\n")}\n}\n}\n`);
    },
  };
}

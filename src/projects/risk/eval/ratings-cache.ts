import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOT_MODULES } from "../bots";
import type { GroupRecord, LadderCache, Matchup, MatchupGames } from "./ratings";
import { hashSources, sourceClosure } from "./source-hash";

// The ladder's matchups already played, kept in `ratings-cache.json` beside this file and
// committed, so a ratings run or a gauntlet's field games play only what is new: a new
// bot's own matchups, not every pair again. A matchup keeps its first seed groups, each
// group's record apart, so a ladder that reads it to any point finds the same groups it
// would play. Each record carries the hash of the code its games ran on, both bots' and
// the game's, and answers only while that code is unchanged.

const CACHE_FILE = fileURLToPath(new URL("./ratings-cache.json", import.meta.url));
const BOTS = fileURLToPath(new URL("../bots/", import.meta.url));
const LADDER = fileURLToPath(new URL("./ratings.ts", import.meta.url));
/** The bot-lab core rates and carries games but never plays one, so a change there
 *  changes no record. */
const BOT_LAB = fileURLToPath(new URL("../../../shared/lib/bot-lab/", import.meta.url));

interface Entry extends Matchup {
  code: string;
  groups: GroupRecord[];
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
  return `${g.seeds} ${g.maxTurns.toString()}t`;
}

function read(file = CACHE_FILE): Record<string, Entry> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the cache file beside this module, or a run's copy of it
    const { matchups } = JSON.parse(readFileSync(file, "utf8")) as { matchups: Record<string, Partial<Entry>> };
    // A record of a whole matchup's games summed, kept before matchups were kept by
    // group, can't say what its first groups were: it answers for nothing.
    return Object.fromEntries(Object.entries(matchups).filter((e): e is [string, Entry] => Array.isArray(e[1].groups)));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

/** Whether `entry` holds more of its matchup than `held`, the record already kept under its key. */
const longer = (entry: Entry, held: Entry | undefined) => held === undefined || held.code !== entry.code || entry.groups.length > held.groups.length;

/** Writes the cache as it is on disk with `added` merged in where they hold more groups,
 *  dropping every record whose code has changed or whose bots are gone. */
function writeMerged(added: Readonly<Record<string, Entry>>): void {
  const merged = read();
  for (const [key, entry] of Object.entries(added)) if (longer(entry, merged[key] as Entry | undefined)) merged[key] = entry;
  const matchups: Record<string, Entry> = {};
  for (const [key, entry] of Object.entries(merged)) {
    if (entry.code === codeOf(entry.lone, entry.rest)) matchups[key] = entry;
  }
  // A line a matchup, so a run's diff reads as the matchups it played.
  const lines = Object.entries(matchups)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, entry]) => `  ${JSON.stringify(key)}: ${JSON.stringify(entry)}`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the cache file beside this module, a fixed path in this repo
  writeFileSync(CACHE_FILE, `{\n"matchups": {\n${lines.join(",\n")}\n}\n}\n`);
}

/** Merges into the cache the records of another copy of it (a remote run's), keeping
 *  those whose code this checkout still has and that hold more groups than ours. Returns
 *  how many records it took. */
export function mergeLadderCache(file: string): number {
  const ours = read();
  const theirs = read(file);
  const added = Object.fromEntries(
    Object.entries(theirs).filter(([key, entry]) => longer(entry, ours[key] as Entry | undefined) && entry.code === codeOf(entry.lone, entry.rest)),
  );
  writeMerged(added);
  return Object.keys(added).length;
}

/** The cache on disk, read once. Each new record is written at once, merged into the
 *  file as it is then, so a run that stops keeps what it played and two runs at once keep
 *  each other's. Records whose code has changed, or whose bots are gone, are dropped as it
 *  writes. */
export function fileLadderCache(): LadderCache {
  const held = read();
  return {
    get(games) {
      const entry = held[keyOf(games)] as Entry | undefined;
      if (entry === undefined || entry.code !== codeOf(games.lone, games.rest)) return [];
      return entry.groups;
    },
    set(games, groups) {
      const code = codeOf(games.lone, games.rest);
      if (code === null) return;
      const entry: Entry = { lone: games.lone, rest: games.rest, players: games.players, code, groups: [...groups] };
      if (!longer(entry, held[keyOf(games)] as Entry | undefined)) return;
      held[keyOf(games)] = entry;
      writeMerged({ [keyOf(games)]: entry });
    },
  };
}

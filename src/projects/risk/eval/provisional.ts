import type { GauntletRecord } from "./gauntlet-log";

// A seated bot's provisional Elo: its seating gauntlets read on the ladder's scale, so a bot
// that clears its bar is seated the hour its gauntlets end, and the next seatable ladder
// replaces the number with its own. The project's CLAUDE.md ("Measuring bots") says what it
// measures and how well.

/** A seatable bot's Elo before a ladder has measured it. */
export interface ProvisionalEntry {
  elo: number;
  /** Its standard error from the gauntlets' own games. It leaves out how differently the
   *  bot fares against the gauntlets' fields and against the whole ladder, which only the
   *  ladder measures. */
  error: number;
  /** The label the gauntlets measured, which plays the seated bot's frozen games as it does. */
  as: string;
  /** The runs of every gauntlet of that label that counts (`provisionalElo`), in the log's order. */
  gauntlets: string[];
}

/** `bots/ratings.json`: the seatable ladder's Elo, and the bots seated since on their gauntlets. */
export interface RatingsFile {
  measured: string;
  anchor: string;
  elo: Record<string, number>;
  provisional?: Record<string, ProvisionalEntry>;
}

/** One gauntlet read on the ladder's scale. */
export interface ProvisionalEstimate {
  run: string;
  elo: number;
  error: number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** A gauntlet counts toward a provisional Elo when no game of it threw and its field holds a
 *  bot the ladder measured, so its fit can be placed on the ladder's scale. */
export function counts(record: GauntletRecord, measured: Readonly<Record<string, number>>): boolean {
  return record.errors === 0 && record.field.some((f) => Object.hasOwn(measured, f));
}

/** One gauntlet's estimate: the candidate's fitted win Elo, shifted onto the ladder's scale by
 *  the field's measured bots (the mean of each one's ladder Elo less its Elo in the gauntlet's
 *  fit), with the error of the candidate's fitted gap to the base. */
export function estimate(record: GauntletRecord, measured: Readonly<Record<string, number>>): ProvisionalEstimate {
  const linked = record.field.filter((f) => Object.hasOwn(measured, f));
  const shift = linked.reduce((s, f) => s + measured[f] - record.elo[f], 0) / linked.length;
  return { run: record.run, elo: record.elo[record.candidate] + shift, error: record.eloError[record.candidate] };
}

/** The provisional Elo of `as`'s gauntlets: every one that counts, each read on the ladder's
 *  scale (`estimate`), combined by the inverse of their variances, with the error that
 *  weighting gives. Fails loudly when none counts, or one's fit can't place the candidate. */
export function provisionalElo(as: string, records: readonly GauntletRecord[], measured: Readonly<Record<string, number>>): { entry: ProvisionalEntry; estimates: ProvisionalEstimate[] } {
  const own = records.filter((r) => r.candidate === as && counts(r, measured));
  if (own.length === 0) throw new Error(`no gauntlet of "${as}" with a field the ladder measured, and no game that threw: run its seating gauntlets first`);
  const estimates = own.map((r) => estimate(r, measured));
  for (const e of estimates) {
    if (!Number.isFinite(e.elo) || !(e.error > 0) || !Number.isFinite(e.error)) {
      throw new Error(`gauntlet ${e.run} can't place "${as}" (Elo ${e.elo.toString()} ± ${e.error.toString()}): a pairing it never lost, or never won, has no finite gap`);
    }
  }
  const weight = estimates.reduce((s, e) => s + 1 / e.error ** 2, 0);
  const elo = estimates.reduce((s, e) => s + e.elo / e.error ** 2, 0) / weight;
  return { entry: { elo: round1(elo), error: round1(1 / Math.sqrt(weight)), as, gauntlets: own.map((r) => r.run) }, estimates };
}

/** The ratings a seatable ladder (`now`) brings in, over those held (`was`): a bot the ladder
 *  measured loses its provisional entry, its Elo now the ladder's, and one seated since the
 *  ladder began keeps its entry, made again from its gauntlets on the new ladder's scale. */
export function keepProvisional(was: RatingsFile, now: RatingsFile, gauntlets: readonly GauntletRecord[]): RatingsFile {
  const kept = Object.entries(was.provisional ?? {}).filter(([bot]) => !Object.hasOwn(now.elo, bot));
  if (kept.length === 0) return { measured: now.measured, anchor: now.anchor, elo: now.elo };
  return {
    measured: now.measured,
    anchor: now.anchor,
    elo: now.elo,
    provisional: Object.fromEntries(kept.map(([bot, entry]) => [bot, provisionalElo(entry.as, gauntlets, now.elo).entry])),
  };
}

/** What is wrong with `file`'s provisional entries, given the gauntlet log, the runs the run
 *  log holds and each seated bot's fingerprints of its kept frozen games: an entry must be
 *  exactly what `provisionalElo` makes of its label's gauntlets now, every one of them named,
 *  each a run the run log holds, each measuring a candidate whose fingerprints are the seated
 *  bot's; and the bot must be seatable and not yet measured. */
export function provisionalProblems(
  file: RatingsFile,
  gauntlets: readonly GauntletRecord[],
  runs: ReadonlySet<string>,
  seatable: ReadonlySet<string>,
  fingerprints: (bot: string) => Record<string, string>,
): string[] {
  const problems: string[] = [];
  for (const [bot, entry] of Object.entries(file.provisional ?? {})) {
    if (!seatable.has(bot)) problems.push(`${bot} is provisional but not seatable`);
    if (Object.hasOwn(file.elo, bot)) problems.push(`${bot} is both measured and provisional`);
    let made: ProvisionalEntry;
    try {
      made = provisionalElo(entry.as, gauntlets, file.elo).entry;
    } catch (e) {
      problems.push(`${bot}: ${(e as Error).message}`);
      continue;
    }
    if (JSON.stringify(made) !== JSON.stringify(entry)) problems.push(`${bot}'s entry ${JSON.stringify(entry)} is not what its gauntlets give, ${JSON.stringify(made)}`);
    const own = fingerprints(bot);
    for (const run of made.gauntlets) {
      if (!runs.has(run)) problems.push(`${bot}: gauntlet ${run} has no record in the run log`);
      const record = gauntlets.find((g) => g.run === run && g.candidate === entry.as) as GauntletRecord;
      if (JSON.stringify(record.frozen) !== JSON.stringify(own)) problems.push(`${bot}: gauntlet ${run} measured "${entry.as}", whose frozen games differ from ${bot}'s`);
    }
  }
  return problems;
}

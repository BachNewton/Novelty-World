import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { RiskGauntletReport } from "./gauntlet";
import type { Format } from "./parallel";

// Every finished gauntlet's result, one JSON object a line in `gauntlets.jsonl` beside this
// file, committed: what the run measured, kept as data a tool can read, where its report is
// only text. A remote run's report job writes its line, and `risk:import` brings it home
// with the run's record. A seated bot's provisional Elo is computed from these
// (`provisional.ts`), so it can't be typed in by hand.

const LOG = fileURLToPath(new URL("./gauntlets.jsonl", import.meta.url));

export interface GauntletRecord {
  /** The run's start, as its run-log record in `runs.jsonl` has it: the run's name. */
  run: string;
  commit: string;
  candidate: string;
  base: string;
  field: string[];
  players: number[];
  formats: Format[];
  prefix: string;
  margin: number;
  alpha: number;
  beta: number;
  /** Win Elo across the candidate and the field, the base at 0. */
  elo: Record<string, number>;
  /** The standard error, in Elo, of each label's fitted gap to the base (the sandwich
   *  error the ladder's precision uses, `eloGapVariance`). */
  eloError: Record<string, number>;
  /** Each pairing to its stop point: the candidate side's wins and losses, the capped games and the verdict. */
  pairings: { opponent: string; players: number; format: Format; wins: number; losses: number; draws: number; verdict: string }[];
  accepted: boolean;
  errors: number;
  /** The candidate's fingerprints of the frozen games, played when the report was made
   *  (`frozen-games.ts`): a seated bot whose kept games give the same fingerprints plays as
   *  the candidate measured here did. None for a native candidate. */
  frozen: Record<string, string>;
}

export function gauntletRecord(
  report: RiskGauntletReport,
  run: { run: string; commit: string; players: number[]; formats: Format[]; prefix: string; margin: number; alpha: number; beta: number },
  frozen: Record<string, string>,
): GauntletRecord {
  return {
    ...run,
    candidate: report.candidate,
    base: report.base,
    field: [...report.field],
    elo: report.elo,
    eloError: report.eloError,
    pairings: report.pairings.map((p) => ({
      opponent: p.opponent,
      players: p.players,
      format: p.format,
      wins: p.wins,
      losses: p.losses,
      draws: p.draws,
      verdict: p.verdict,
    })),
    accepted: report.accepted,
    errors: report.errors,
    frozen,
  };
}

export function readGauntlets(file = LOG): GauntletRecord[] {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the log beside this module, or a run's copy of it
    const text = readFileSync(file, "utf8");
    return text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as GauntletRecord);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

export function appendGauntlet(record: GauntletRecord): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the log beside this module, a fixed path in this repo
  appendFileSync(LOG, `${JSON.stringify(record)}\n`);
}

/** Appends the lines of another copy of the log (a remote run's). */
export function importGauntlets(file: string): number {
  const records = readGauntlets(file);
  for (const r of records) appendGauntlet(r);
  return records.length;
}

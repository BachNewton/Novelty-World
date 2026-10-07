// `npm run ai:scenarios -- <version> [--reps N] [--only id,…] [--concurrency N]`
//
// Runs the scenario suite against the AI version on the `ai:local` model server
// (local-llm; start one with `npm run ai:llm -- <config>`). Every call's full
// record goes to a run folder under `runs/` (not committed); the scoreboard is
// printed, written beside it, and copied to `scoreboards/<version>.json`, which
// is committed so versions compare in git.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localBaseUrl, modelFor } from "../model/config";
import { AI_VERSIONS, type AiVersionLabel } from "../versions";
import { serverInfo, type AiCallRecord } from "./record";
import { runScenario } from "./run";
import { SCENARIOS } from "./scenarios";
import { renderScoreboard, scoreboard } from "./scoreboard";

const here = dirname(fileURLToPath(import.meta.url));

function usage(message: string): never {
  console.error(`${message}\nusage: npm run ai:scenarios -- <version> [--reps N] [--only id,…] [--concurrency N]`);
  console.error(`versions: ${Object.keys(AI_VERSIONS).join(", ")}`);
  process.exit(1);
}

function parseArgs(argv: readonly string[]): { version: AiVersionLabel; reps: number; only: string[] | null; concurrency: number | null } {
  if (argv.length === 0) usage("which version?");
  const [label, ...rest] = argv;
  if (!(label in AI_VERSIONS)) usage(`unknown version "${label}"`);
  let reps = 3;
  let only: string[] | null = null;
  let concurrency: number | null = null;
  for (let i = 0; i < rest.length; i += 2) {
    if (i + 1 >= rest.length) usage(`${rest[i]} needs a value`);
    const value = rest[i + 1];
    if (rest[i] === "--reps") reps = Number(value);
    else if (rest[i] === "--only") only = value.split(",");
    else if (rest[i] === "--concurrency") concurrency = Number(value);
    else usage(`unknown option ${rest[i]}`);
  }
  if (!Number.isInteger(reps) || reps < 1) usage("--reps must be a whole number of 1 or more");
  if (concurrency !== null && (!Number.isInteger(concurrency) || concurrency < 1)) usage("--concurrency must be a whole number of 1 or more");
  return { version: label as AiVersionLabel, reps, only, concurrency };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const scenarios = args.only ? SCENARIOS.filter((s) => args.only?.includes(s.id)) : SCENARIOS;
  if (args.only && scenarios.length !== args.only.length) usage(`unknown scenario in --only: ${args.only.join(",")}`);
  const server = await serverInfo(localBaseUrl());
  if (!server) usage(`no llama.cpp server answering at ${localBaseUrl()} (start one with npm run ai:llm -- <config>)`);
  const concurrency = args.concurrency ?? server.slots ?? 1;
  const at = new Date().toISOString();
  const runDir = join(here, "runs", `${at.replace(/[:.]/g, "-")}-${args.version}`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a run folder this CLI names under its own runs/ folder
  mkdirSync(runDir, { recursive: true });
  const callsPath = join(runDir, "calls.jsonl");

  const jobs = scenarios.flatMap((scenario) => Array.from({ length: args.reps }, (_, rep) => ({ scenario, rep })));
  const model = modelFor("ai:local");
  const strategy = { profile: "ai:local" as const, version: args.version };
  const records: AiCallRecord[] = [];
  console.log(`${args.version}: ${String(jobs.length)} calls (${String(scenarios.length)} scenarios x ${String(args.reps)}), ${String(concurrency)} at a time, on ${server.model ?? "?"}`);

  let next = 0;
  async function worker(): Promise<void> {
    while (next < jobs.length) {
      const job = jobs[next++];
      const record = await runScenario(job.scenario, strategy, model, job.rep, server);
      records.push(record);
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- the run folder's record file, named by this CLI
      appendFileSync(callsPath, `${JSON.stringify(record)}\n`);
      const mark = record.check?.pass ? "✓" : "✗";
      const secs = record.metrics ? `${(record.metrics.ms / 1000).toFixed(1)}s` : "-";
      console.log(`  ${mark} ${job.scenario.id} #${String(job.rep + 1)} ${secs}  ${record.check?.reason ?? ""}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));

  const board = scoreboard(args.version, at, args.reps, server, scenarios, records);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the run folder's scoreboard, named by this CLI
  writeFileSync(join(runDir, "scoreboard.json"), `${JSON.stringify(board, null, 2)}\n`);
  if (!args.only) {
    mkdirSync(join(here, "scoreboards"), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- scoreboards/<version>.json, the version a registered label
    writeFileSync(join(here, "scoreboards", `${args.version}.json`), `${JSON.stringify(board, null, 2)}\n`);
  }
  console.log(`\n${renderScoreboard(board)}\n\nrecords: ${callsPath}`);
}

void main();

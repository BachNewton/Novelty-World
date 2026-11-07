#!/usr/bin/env node
/**
 * What the machine's test runs cost over the last hours, from the run log every
 * checkout and worktree shares (scripts/test-runs.mjs): runs by kind, failures
 * split into timeouts under load, timeouts with capacity and other failures,
 * the reruns that followed, the worst offenders, and the load at each number
 * of runs going at once.
 *
 *   npm run test-history                 the last 24 hours
 *   npm run test-history -- --hours 6
 *   npm run test-history -- --log <file> another log, such as a hand-made one
 */
import { parseArgs } from "node:util";
import { formatSummary, placeOf, readRuns, summarize } from "./test-runs.mjs";

const { values } = parseArgs({ options: { hours: { type: "string", default: "24" }, log: { type: "string" } } });
const hours = Number(values.hours);
if (!(hours > 0)) throw new Error(`--hours takes a positive number, not "${values.hours}"`);

const log = values.log ?? (await placeOf(process.cwd())).log;
const { runs, unreadable } = readRuns(log);
const to = Date.now();
console.log(`Log: ${log}`);
console.log(formatSummary(summarize(runs, { from: to - hours * 3_600_000, to }), { hours, unreadable }).join("\n"));

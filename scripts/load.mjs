#!/usr/bin/env node
/**
 * Whether the machine has the capacity a test run assumes, right now: the CPU
 * and GPU, the test runs in progress and the other work driving headless
 * browsers, each with its checkout (scripts/machine-load.mjs). A failed test
 * run reports the same about its own run; this is for asking before starting
 * work, or about a failure from something that is not a test run.
 *
 *   npm run load
 */
import os from "node:os";
import {
  SATURATED,
  browserCount,
  browsers,
  cpuShare,
  cpuTimes,
  describeWork,
  percent,
  readMachine,
  workIn,
} from "./machine-load.mjs";

const SAMPLES = 3;

/** The busiest of a few one-second samples, where the platform's counters gave none. */
async function cpuUse() {
  let busiest = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const before = cpuTimes();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    busiest = Math.max(busiest, cpuShare(before, cpuTimes()));
  }
  return busiest;
}

const machine = await readMachine(SAMPLES);
const { processes, gpu } = machine;
// Where Node samples the CPU, it does so after the processes are read, so reading them is not in the sample.
const cpu = machine.cpu ?? (await cpuUse());
const work = workIn(processes);

console.log(`CPU: ${percent(cpu)} in use across ${os.cpus().length} logical cores (busiest of ${SAMPLES} one-second samples).`);
if ("error" in gpu) {
  console.log(`GPU: ${gpu.error}.`);
} else {
  const engine = gpu.type === null ? "" : ` (${gpu.type})`;
  console.log(`GPU: ${percent(gpu.use)} on its busiest engine${engine} (busiest of ${SAMPLES} one-second samples).`);
}
if (processes.length === 0) {
  console.log("Test runs and browser work: could not read the process list.");
} else {
  for (const line of describeWork(work)) console.log(line);
}

// Every run and browser counts toward the verdict, the reader's own included:
// one cannot always be told apart from one in a nested worktree, and erring
// toward "other work is loading the machine" is the safe direction here.
const browserTotal = browserCount(work);
const busy = [cpu >= SATURATED ? "CPU" : null, !("error" in gpu) && gpu.use >= SATURATED ? "GPU" : null].filter(
  (name) => name !== null,
);
if (busy.length > 0 && (work.runs.length > 0 || browserTotal > 0)) {
  console.log(
    `Verdict: saturated (${busy.join(" and ")}), with test runs or browser work in progress. A timeout now is most likely contention, not a defect — wait for capacity or agree with the other agents and sessions who runs what, then re-run that one file once.`,
  );
} else if (busy.length > 0) {
  console.log(
    `Verdict: saturated (${busy.join(" and ")}), but not by a test run or browser work. Something else is using the machine; a timeout now still says little about the test.`,
  );
} else if (browserTotal > 0) {
  console.log(
    `Verdict: contended for browser tests. ${browsers(browserTotal)} running share one GPU, its memory and the chip's power budget, which the CPU share doesn't show and the GPU share shows only in part. A browser (e2e) test's timeout now says little — wait for the browser work to finish or agree who runs what, then re-run that one file once. A unit test's timeout is still evidence about the test.`,
  );
} else {
  console.log(
    "Verdict: the machine has capacity. A timeout now is evidence about the test — reason about the code to a named cause.",
  );
}

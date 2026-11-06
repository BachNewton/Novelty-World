/**
 * Reporters that put the machine's load into every failed test run's output,
 * for vitest and Playwright: an agent always reads a failure, but may not
 * think to ask whether the machine was saturated when it happened.
 *
 * A run is its own measuring window, so this adds no wait: the CPU's running
 * totals are read once a second while the run goes, and each failed test's CPU
 * share is read off the seconds it ran in. When a test fails, the process
 * table is read too, for the other test runs and browser work in progress
 * then (scripts/machine-load.mjs). A run with no failures prints nothing.
 */
import os from "node:os";
import {
  SATURATED,
  browserCount,
  browsers,
  cpuShare,
  cpuTimes,
  describeWork,
  mergeWork,
  percent,
  readProcesses,
  workIn,
} from "./machine-load.mjs";

class LoadWatch {
  samples = [cpuTimes()];
  timer = setInterval(() => this.samples.push(cpuTimes()), 1000).unref();
  failures = [];
  work = { runs: [], tools: [] };
  reading = null;

  /** A test failed between two times (ms since the epoch). */
  failed(start, end) {
    this.failures.push({ start, end });
    void this.observe();
  }

  /** Reads the work in progress, unless a read is already under way. */
  observe() {
    this.reading ??= readProcesses().then((processes) => {
      if (processes.length > 0) this.work = mergeWork(this.work, workIn(processes));
      this.reading = null;
    });
    return this.reading;
  }

  /** The CPU's share over the samples spanning a stretch of the run. */
  cpuOver(start, end) {
    const before = this.samples.findLast((sample) => sample.at <= start) ?? this.samples[0];
    const after = this.samples.find((sample) => sample.at >= end) ?? this.samples[this.samples.length - 1];
    return cpuShare(before, after);
  }

  /** The report on a run that has ended, or `null` if nothing in it failed. */
  async report(browserRun) {
    clearInterval(this.timer);
    this.samples.push(cpuTimes());
    if (this.failures.length === 0) return null;
    await this.reading;
    await this.observe();

    const duringFailures = Math.max(...this.failures.map(({ start, end }) => this.cpuOver(start, end)));
    const wholeRun = cpuShare(this.samples[0], this.samples[this.samples.length - 1]);
    const others = this.work.runs.length + this.work.tools.length;
    const otherBrowsers = browserCount(this.work);
    const lines = [
      "",
      "Machine load while these tests failed (npm run load reads it now):",
      `CPU: ${percent(duringFailures)} at the busiest failure, ${percent(wholeRun)} across the run, of ${os.cpus().length} logical cores.${browserRun ? " The GPU is not measured during a run." : ""}`,
      ...describeWork(this.work, { other: true }),
    ];
    if (duringFailures >= SATURATED) {
      lines.push(
        others > 0
          ? "Verdict: saturated, with other test runs or browser work in progress. A timeout among these failures is most likely contention, not a defect — wait for capacity or agree with the other agents and sessions who runs what, then re-run that one file once."
          : "Verdict: saturated, with no other test run or browser work: this run itself or something else filled the CPU. A timeout among these failures still says little about the test.",
      );
    } else if (browserRun && otherBrowsers > 0) {
      lines.push(
        `Verdict: contended. ${browsers(otherBrowsers)} outside this run shared the one GPU, its memory and the chip's power budget, which the CPU share doesn't show. A timeout among these failures says little — wait for the browser work to finish or agree who runs what, then re-run that one file once.`,
      );
    } else {
      lines.push(
        "Verdict: the machine had capacity. These failures, timeouts included, are evidence about the tests — reason about the code to a named cause.",
      );
    }
    return lines;
  }
}

/** For vitest's `reporters`, beside its default one. */
export class VitestLoadReporter {
  watch = null;

  onTestRunStart() {
    this.watch = new LoadWatch();
  }

  onTestCaseResult(testCase) {
    if (testCase.result().state !== "failed") return;
    // The test's own start time is on its worker's clock, so it is measured back from its result arriving here.
    const end = Date.now();
    this.watch?.failed(end - (testCase.diagnostic()?.duration ?? 0), end);
  }

  async onTestRunEnd() {
    const lines = await this.watch?.report(false);
    this.watch = null;
    if (lines) console.log(lines.join("\n"));
  }
}

/** For Playwright's `reporter` list, after the one that prints results. */
export class PlaywrightLoadReporter {
  watch = new LoadWatch();

  onTestEnd(test, result) {
    if (result.status === test.expectedStatus || result.status === "skipped") return;
    const start = result.startTime.getTime();
    this.watch.failed(start, start + result.duration);
  }

  async onEnd() {
    const lines = await this.watch.report(true);
    if (lines) console.log(lines.join("\n"));
  }
}

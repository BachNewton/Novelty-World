/**
 * Reporters that put the machine's load into every failed test run's output,
 * for vitest and Playwright: an agent always reads a failure, but may not
 * think to ask whether the machine was saturated when it happened. Every run,
 * passed or failed, also leaves a record in the machine's test run log
 * (scripts/test-runs.mjs), written once the run has ended.
 *
 * A run is its own measuring window, so this adds no wait: the CPU's running
 * totals are read once a second while the run goes, and each failed test's CPU
 * share is read off the seconds it ran in. The process table is read when the
 * run starts, without the run waiting on it, for the other test runs and
 * browser work going then (scripts/machine-load.mjs); when a test fails it is
 * read again, and the report waits for that read. A run with no failures
 * prints nothing.
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
import { appendRun, placeOf, relativeFile } from "./test-runs.mjs";

class LoadWatch {
  samples = [cpuTimes()];
  timer = setInterval(() => this.samples.push(cpuTimes()), 1000).unref();
  failures = [];
  work = { runs: [], tools: [] };
  reading = null;
  /** The most other runs, browser tools and browsers seen at once, or `null` before any read has landed. */
  others = null;
  place = placeOf(process.cwd()).catch((error) => error);

  constructor() {
    void readProcesses().then((processes) => this.count(processes));
  }

  get start() {
    return this.samples[0].at;
  }

  count(processes) {
    if (processes.length === 0) return;
    const work = workIn(processes);
    const seen = { runs: work.runs.length, tools: work.tools.length, browsers: browserCount(work) };
    this.others ??= seen;
    for (const key of Object.keys(seen)) this.others[key] = Math.max(this.others[key], seen[key]);
    return work;
  }

  /** A test failed between two times (ms since the epoch); `test` says which, for the record. */
  failed(start, end, test) {
    this.failures.push({ start, end, test });
    void this.observe();
  }

  /** Reads the work in progress, unless a read is already under way. */
  observe() {
    this.reading ??= readProcesses().then((processes) => {
      const work = this.count(processes);
      if (work !== undefined) this.work = mergeWork(this.work, work);
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

  /** Ends the watch; the work in progress is read once more if anything failed. */
  async end(browserRun) {
    clearInterval(this.timer);
    this.samples.push(cpuTimes());
    if (this.failures.length > 0) {
      await this.reading;
      await this.observe();
    }
    const otherBrowsers = browserCount(this.work);
    for (const failure of this.failures) {
      failure.cpu = this.cpuOver(failure.start, failure.end);
      failure.verdict =
        failure.cpu >= SATURATED ? "saturated" : browserRun && otherBrowsers > 0 ? "contended" : "capacity";
    }
  }

  /** The report on a run that has ended, or `null` if nothing in it failed. */
  report(browserRun) {
    if (this.failures.length === 0) return null;
    const duringFailures = Math.max(...this.failures.map(({ cpu }) => cpu));
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

  /** Appends the run's record to the machine's log; `run` is what only the runner knows. */
  async record({ kind, workers, files, passed, skipped, interrupted }) {
    const place = await this.place;
    if (place instanceof Error) {
      console.warn(`Test run log: this run went unrecorded (${place.message.split("\n")[0]}).`);
      return;
    }
    const relative = (file) => relativeFile(place.checkout, file);
    const cpuSeconds = this.samples.slice(1).map((sample, i) => Math.round(cpuShare(this.samples[i], sample) * 100));
    const round = (share) => Math.round(share * 100) / 100;
    appendRun(place.log, {
      kind,
      checkout: place.checkout,
      branch: place.branch,
      start: this.start,
      end: this.samples[this.samples.length - 1].at,
      cores: os.cpus().length,
      workers,
      files: Object.fromEntries([...files].map(([file, ms]) => [relative(file), Math.round(ms)])),
      passed,
      failed: this.failures.length,
      skipped,
      interrupted,
      cpu: round(cpuShare(this.samples[0], this.samples[this.samples.length - 1])),
      cpuSeconds,
      others: this.others,
      failures: this.failures.map(({ test, cpu, verdict }) => ({
        id: `${relative(test.file)} > ${test.name}`,
        file: relative(test.file),
        timeout: test.timeout,
        ms: Math.round(test.ms),
        cpu: round(cpu),
        verdict,
      })),
    });
  }
}

const TIMED_OUT = /timed out in \d+ms/;

/** For vitest's `reporters`, beside its default one; `kind` names its config in the run log. */
export class VitestLoadReporter {
  watch = null;
  workers = null;
  files = new Map();
  counts = { passed: 0, skipped: 0 };

  constructor(kind = "vitest") {
    this.kind = kind;
  }

  onInit({ config }) {
    // Vitest's own default where the config sets none.
    const cores = os.availableParallelism();
    this.workers = config.maxWorkers ?? (config.watch ? Math.max(Math.floor(cores / 2), 1) : Math.max(cores - 1, 1));
  }

  onTestRunStart(specifications) {
    this.watch = new LoadWatch();
    this.files = new Map(specifications.map((specification) => [specification.moduleId, 0]));
    this.counts = { passed: 0, skipped: 0 };
  }

  onTestCaseResult(testCase) {
    const result = testCase.result();
    if (result.state === "passed") this.counts.passed++;
    if (result.state === "skipped") this.counts.skipped++;
    if (result.state !== "failed") return;
    // The test's own start time is on its worker's clock, so it is measured back from its result arriving here.
    const end = Date.now();
    const ms = testCase.diagnostic()?.duration ?? 0;
    this.watch?.failed(end - ms, end, {
      file: testCase.module.moduleId,
      name: testCase.fullName,
      timeout: result.errors.some((error) => TIMED_OUT.test(error.message)),
      ms,
    });
  }

  onTestModuleEnd(testModule) {
    this.files.set(testModule.moduleId, testModule.diagnostic().duration);
    // A file that failed with no failed test (an import that threw, a hook that failed) is a failure of its own.
    if (testModule.state() !== "failed" || [...testModule.children.allTests("failed")].length > 0) return;
    const end = Date.now();
    const ms = testModule.diagnostic().duration;
    // A describe's own hook reports its error on that describe, not on the file.
    const errors = [testModule, ...testModule.children.allSuites()].flatMap((suite) => suite.errors());
    this.watch?.failed(end - ms, end, {
      file: testModule.moduleId,
      name: "(the file or a hook)",
      timeout: errors.some((error) => TIMED_OUT.test(error.message)),
      ms,
    });
  }

  async onTestRunEnd(_testModules, _unhandledErrors, reason) {
    const watch = this.watch;
    this.watch = null;
    if (watch === null) return;
    await watch.end(false);
    const lines = watch.report(false);
    if (lines) console.log(lines.join("\n"));
    await watch.record({
      kind: this.kind,
      workers: this.workers,
      files: this.files,
      ...this.counts,
      interrupted: reason === "interrupted",
    });
  }
}

/** For Playwright's `reporter` list, after the one that prints results. */
export class PlaywrightLoadReporter {
  watch = new LoadWatch();
  workers = null;
  suite = null;
  files = new Map();

  onBegin(config, suite) {
    this.workers = config.workers;
    this.suite = suite;
    for (const test of suite.allTests()) this.files.set(test.location.file, 0);
  }

  onTestEnd(test, result) {
    this.files.set(test.location.file, (this.files.get(test.location.file) ?? 0) + result.duration);
    if (result.status === test.expectedStatus || result.status === "skipped" || result.status === "interrupted") return;
    const start = result.startTime.getTime();
    this.watch.failed(start, start + result.duration, {
      file: test.location.file,
      // The path's first three titles are the root, the project and the file.
      name: test.titlePath().slice(3).join(" > "),
      timeout: result.status === "timedOut",
      ms: result.duration,
    });
  }

  async onEnd(result) {
    await this.watch.end(true);
    const lines = this.watch.report(true);
    if (lines) console.log(lines.join("\n"));
    const tests = this.suite?.allTests() ?? [];
    await this.watch.record({
      kind: "playwright",
      workers: this.workers,
      files: this.files,
      passed: tests.filter((test) => ["expected", "flaky"].includes(test.outcome())).length,
      skipped: tests.filter((test) => test.outcome() === "skipped").length,
      interrupted: result.status === "interrupted",
    });
  }
}

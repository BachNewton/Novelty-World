/**
 * Tells Claude whether its budget managed the hardware, judged afterwards from the
 * budget's log (scripts/machine-log.mjs): `npm run slot -- history [--hours N]`.
 * Text to act on: each check that didn't pass shows its evidence and what to do.
 * Two questions, each answered by its checks:
 *
 *   Is the queue working?        nothing overbooked, no one jumping the line, no one
 *                                left waiting for what was free, and all of it recorded
 *   Is the hardware used right?  the real use within each limit and each claim, no
 *                                GPU work outside the budget, and no long waits for
 *                                hardware that sat idle
 *
 * The checks never ask the queue's own rules whether a start was allowed: they hold
 * what was logged against plain invariants, so a bug in `admit` shows here. A check
 * with nothing to judge says so; no data is never a pass.
 */
import { SATURATED } from "./machine-load.mjs";

const RESOURCES = ["cores", "radeon", "egpu"];
const NAMES = { cores: "CPU cores", radeon: "Radeon", egpu: "RTX 4070" };

/** Samples further apart than this leave a gap in the record: three missed in a row. */
const GAP_MS = 20_000;
/** How long a run may wait for what is free: the queue's liveness read is every 30 seconds, and a sample is 5 apart. */
const STUCK_MS = 40_000;
/** The eGPU this close to its 12 GB fails whatever allocates next. */
const EGPU_FULL_MIB = 11.6 * 1024;
/** A claim may be out by this much before it's called wrong: the counters and the job's own count differ a little. */
const CLAIM_SLACK = 1.05;
/** Waiting this long on idle hardware, and this share of all the waiting for it, is worth acting on. */
const WASTE_MS = 5 * 60_000;
const WASTE_SHARE = 0.2;
/** The share of the recorded time the CPU may be saturated. */
const SATURATED_SHARE = 0.1;
/** The share of the queue's busy time that must be sampled before the samples can vouch for it. */
const COVERED = 0.9;
/** The lines the report gives each list: enough to act on, few enough to read in full. */
const LISTED = 5;
/** Samples before a run's use says much about its claim: half a minute's. */
const MEASURED_SAMPLES = 6;

/** What to do when each check doesn't pass. */
const NEXT = {
  "Never overbooked": "a run with no started record is an older checkout's: start theirs with main's scripts/slot.mjs. Otherwise the fault is in admit (scripts/machine-budget.mjs).",
  "No jumping the line": "a bug in admit (scripts/machine-budget.mjs): reproduce the case in its test first.",
  "Never stuck with room free": "a waiter wasn't woken: look at its watcher and liveness read (scripts/slot.mjs).",
  "Fully recorded": "don't trust the other checks for the missing time; a recorder failure above names its cause.",
  "Radeon within 4 pages": "find the run below whose pages pass its claim and correct that claim: more has crashed the machine.",
  "RTX 4070 never full": "find what didn't declare its memory, or declared too little, and correct its +egpu:GB.",
  "GPU claims are true": "start that job with the peak it held: cores:N+egpu:GB or +radeon:PAGES, or fix the kind's claim.",
  "Core claims are true": "start that job with cores:N at what it averaged, or hold its workers to what it claims.",
  "No GPU work outside the budget": "start that job through the slot with the GPU it uses declared.",
  "No queueing for idle hardware": "for a GPU, lower the claim of the run named. For cores, find what that run waits on before lowering anything: its measured CPU is a floor.",
  "CPU not overloaded": "look for work running outside the slot (npm run load), and for core claims that are too small.",
};

const amount = (resource, value) => {
  if (resource === "egpu") return value === 0 ? "0 GB" : `${(value / 1024).toFixed(1)} GB`;
  if (resource === "radeon") return `${value} ${value === 1 ? "page" : "pages"}`;
  const cores = Math.round(value * 10) / 10;
  return `${cores} ${cores === 1 ? "core" : "cores"}`;
};
const duration = (ms) => {
  if (ms === 0) return "none";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  return `${(ms / 3_600_000).toFixed(1)} h`;
};
const clock = (t) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const claimed = ([cores, radeon, egpu]) => ({ cores, radeon, egpu });

/** Every run in the records, with when it waited, started and ended, and its measured use. */
function runsIn(records) {
  const runs = new Map();
  const runOf = (id) => {
    if (!runs.has(id)) runs.set(id, { id, logged: false, kind: "?", who: "?", command: "", marks: [], use: [] });
    return runs.get(id);
  };
  let newest;
  for (const record of records) {
    const { t, e, id } = record;
    if (e === "queued" || e === "seen") {
      const run = runOf(id);
      Object.assign(run, { kind: record.kind, who: record.who, command: record.command });
      run.logged ||= e === "queued";
      run.claim ??= claimed(record.claim);
      run.queued ??= e === "queued" ? t : record.queued;
      run.started ??= record.started;
      if (e === "seen") run.last = Math.max(run.last ?? 0, t);
    } else if (e === "waits") {
      runOf(id).marks.push({ t, for: record.for });
    } else if (e === "started") {
      const run = runOf(id);
      Object.assign(run, { started: t, claim: claimed(record.claim), startedBeside: record.beside, ahead: record.ahead });
    } else if (e === "ended") {
      Object.assign(runOf(id), { ended: t, code: record.code });
    } else if (e === "sample") {
      newest = t;
      for (const each of record.running) runOf(each).last = t;
      for (const [each, resource] of record.waiting) {
        const run = runOf(each);
        run.last = t;
        if (resource !== null && run.marks.at(-1)?.for !== resource) run.marks.push({ t, for: resource });
      }
      for (const [each, [cores, radeon, egpu]] of Object.entries(record.use)) runOf(each).use.push({ t, cores, radeon, egpu });
    }
  }

  for (const run of runs.values()) {
    run.queued ??= run.started ?? run.marks[0]?.t ?? run.last;
    const lastKnown = Math.max(run.queued, run.started ?? 0, run.last ?? 0);
    // With no end logged it is still going if the newest sample holds it, and otherwise stopped when last seen.
    run.going = run.ended === undefined && run.last !== undefined && newest !== undefined && newest - run.last < GAP_MS;
    run.until = run.ended ?? lastKnown;
    run.lost = run.logged && run.ended === undefined && !run.going;

    run.waited = { cores: 0, radeon: 0, egpu: 0 };
    const waitEnd = run.started ?? run.until;
    const marks = run.marks.filter((mark) => mark.t < waitEnd);
    marks.forEach((mark, i) => {
      // The first reason is also the reason since it joined.
      const from = i === 0 ? run.queued : mark.t;
      run.waited[mark.for] += Math.max(0, (marks[i + 1]?.t ?? waitEnd) - from);
    });
    run.waitMs = RESOURCES.reduce((sum, resource) => sum + run.waited[resource], 0);

    if (run.use.length > 0) {
      run.peak = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(...run.use.map((use) => use[resource]))]));
      run.meanCores = run.use.reduce((sum, use) => sum + use.cores, 0) / run.use.length;
    }
  }
  return [...runs.values()].filter((run) => run.claim !== undefined).sort((a, b) => a.queued - b.queued);
}

/** What the runs claimed over time: a step each time one starts or ends. */
function claimSteps(runs) {
  const changes = [];
  for (const run of runs) {
    if (run.started === undefined || run.until <= run.started) continue;
    changes.push({ t: run.started, sign: 1, run }, { t: run.until, sign: -1, run });
  }
  changes.sort((a, b) => a.t - b.t || a.sign - b.sign);
  const going = new Set();
  return changes.map(({ t, sign, run }) => {
    if (sign > 0) going.add(run);
    else going.delete(run);
    const total = { cores: 0, radeon: 0, egpu: 0 };
    for (const each of going) for (const resource of RESOURCES) total[resource] += each.claim[resource];
    return { t, total, going: [...going] };
  });
}

/** The stretches that satisfy `bad`, from samples in order, as `{ from, to, sample }`. */
function stretches(samples, bad) {
  const found = [];
  let open;
  let last;
  for (const sample of samples) {
    if (last !== undefined && sample.t - last >= GAP_MS) open = undefined;
    last = sample.t;
    if (!bad(sample)) open = undefined;
    else if (open === undefined) found.push((open = { from: sample.t, to: sample.t, sample }));
    else open.to = sample.t;
  }
  return found;
}

// A command is named by its files, not the folders they are in.
const shortCommand = (command) => command.replace(/(?:[A-Za-z]:)?(?:[\\/]?[^\\/\s"=]+[\\/]){2,}/g, "").slice(0, 90);
const named = (run) => (run === undefined ? "a run" : `${run.kind} "${shortCommand(run.command)}" (${run.who.split(" (")[0]})`);

/** The whole judgement of the records between `from` and `to`. */
export function audit(records, { from, to, budget }) {
  const everyRun = runsIn(records);
  const runs = everyRun.filter((run) => run.until >= from && run.queued <= to);
  const samples = records.filter((record) => record.e === "sample" && record.t >= from && record.t <= to);
  const byId = new Map(everyRun.map((run) => [run.id, run]));
  // The time a sample stands for: up to the one before it, or none across a gap.
  const spans = samples.map((sample, i) => (i > 0 && sample.t - samples[i - 1].t < GAP_MS ? sample.t - samples[i - 1].t : 0));

  const checks = [];
  /** `bad` is each problem as `{ t, text }`; `judged` is whether there was anything to judge. */
  const check = (group, name, { judged, bad, level = "fail", ok, none }) => {
    let state = "unknown";
    if (bad.length > 0) state = level;
    else if (judged) state = "ok";
    const summary = { ok, unknown: none }[state] ?? `${bad.length} ${bad.length === 1 ? "case" : "cases"}`;
    checks.push({ group, name, state, summary, evidence: bad.map(({ t, text }) => `${clock(t)}  ${text}`) });
  };

  // ---- Is the queue working?

  const started = runs.filter((run) => run.started !== undefined);
  const overbooked = [];
  for (const { t, total, going } of claimSteps(runs)) {
    for (const resource of RESOURCES) {
      const alone = resource === "cores" && going.length === 1;
      if (alone || total[resource] <= budget[resource] || t < from) continue;
      overbooked.push({ t, text: `${amount(resource, total[resource])} of ${amount(resource, budget[resource])} on ${NAMES[resource]}: ${going.filter((run) => run.claim[resource] > 0).map(named).join(" + ")}` });
    }
  }
  for (const run of started) {
    if (run.startedBeside === undefined || run.started < from) continue;
    const beside = claimed(run.startedBeside);
    for (const resource of RESOURCES) {
      const need = run.claim[resource];
      const alone = resource === "cores" && beside.cores === 0;
      if (need === 0 || alone || beside[resource] + need <= budget[resource]) continue;
      overbooked.push({ t: run.started, text: `${named(run)} started on ${NAMES[resource]} with ${amount(resource, beside[resource])} of ${amount(resource, budget[resource])} already taken` });
    }
  }
  check("queue", "Never overbooked", {
    judged: started.length > 0,
    bad: overbooked,
    ok: `${started.length} starts, every one within the limits`,
    none: "nothing started",
  });

  const audited = started.filter((run) => run.ahead !== undefined);
  const waited = runs.filter((run) => run.waitMs > 0);
  const jumped = [];
  for (const run of audited) {
    for (const [id, resource] of run.ahead) {
      if (run.claim[resource] > 0) jumped.push({ t: run.started, text: `${named(run)} took ${NAMES[resource]} ahead of ${named(byId.get(id))}, which was waiting for it` });
    }
  }
  check("queue", "No jumping the line", {
    judged: audited.length > 0 && waited.length > 0,
    bad: jumped,
    ok: `${waited.length} had to wait; none was jumped`,
    none: "nothing had to wait, so the order was never tested",
  });

  const stuck = [];
  for (const id of new Set(samples.flatMap((sample) => sample.ready))) {
    for (const stretch of stretches(samples, (sample) => sample.ready.includes(id))) {
      if (stretch.to - stretch.from < STUCK_MS) continue;
      stuck.push({ t: stretch.from, text: `${named(byId.get(id))} could have started, and waited ${duration(stretch.to - stretch.from)} more` });
    }
  }
  check("queue", "Never stuck with room free", {
    judged: samples.length > 0,
    bad: stuck,
    ok: "every run started when its room came free",
    none: "no samples",
  });

  // The stretches the queue held anything, runs end to end as one, so short runs can't hide a hole in the record.
  const occupied = [];
  // Before the log's first record there was nothing to record it, which is no hole.
  const since = Math.max(from, records[0]?.t ?? from);
  for (const run of runs) {
    const start = Math.max(run.queued, since);
    const end = Math.min(run.until, to);
    if (end <= start) continue;
    const last = occupied.at(-1);
    if (last !== undefined && start - last.end < GAP_MS) last.end = Math.max(last.end, end);
    else occupied.push({ start, end });
  }
  let busy = 0;
  let recorded = 0;
  let next = 0;
  const holes = [];
  const cover = (at, until) => {
    // A sample covers the interval up to it, and the recorder takes a moment to come up for a new queue.
    if (until - at < GAP_MS) recorded += until - at;
    else holes.push({ t: at, text: `nothing sampled for ${duration(until - at)}` });
  };
  for (const { start, end } of occupied) {
    busy += end - start;
    while (next < samples.length && samples[next].t <= start) next++;
    let at = start;
    for (let i = next; i < samples.length && at < end; i++) {
      const until = Math.min(samples[i].t, end);
      cover(at, until);
      at = until;
    }
    if (at < end) cover(at, end);
  }
  const failures = records.filter((record) => record.e === "recorder" && record.failed !== undefined && record.t >= from);
  const thin = busy > 0 && recorded / busy < COVERED;
  check("queue", "Fully recorded", {
    judged: busy > 0 && samples.length > 0,
    bad: [
      ...(thin ? [{ t: holes[0]?.t ?? since, text: `only ${Math.round((recorded / busy) * 100)}% of the queue's busy time was sampled, so the rest can't be vouched for` }, ...holes] : []),
      ...failures.map((record) => ({ t: record.t, text: `the recorder stopped: ${record.failed.split("\n")[0]}` })),
    ],
    ok: `${busy > 0 ? Math.round((recorded / busy) * 100) : 0}% of ${duration(busy)} of busy time sampled`,
    none: "nothing recorded",
  });

  // ---- Is the hardware used right?

  check("hardware", "Radeon within 4 pages", {
    judged: samples.length > 0,
    // One sample over can be a browser closing as the next opens.
    bad: stretches(samples, (sample) => sample.radeon.pages > budget.radeon)
      .filter((stretch) => stretch.to > stretch.from)
      .map(({ from: t, to: until, sample }) => ({ t, text: `${sample.radeon.pages} pages really open for ${duration(until - t)}` })),
    ok: `at most ${amount("radeon", Math.max(0, ...samples.map((sample) => sample.radeon.pages)))} really open`,
    none: "no samples",
  });

  check("hardware", "RTX 4070 never full", {
    judged: samples.length > 0,
    bad: stretches(samples, (sample) => sample.egpu.mib >= EGPU_FULL_MIB).map(({ from: t, sample }) => ({
      t,
      text: `${amount("egpu", sample.egpu.mib)} really in use of its 12 GB`,
    })),
    ok: `at most ${amount("egpu", Math.max(0, ...samples.map((sample) => sample.egpu.mib)))} really in use`,
    none: "no samples",
  });

  const measured = runs.filter((run) => run.peak !== undefined);
  const understated = [];
  for (const run of measured) {
    if (run.peak.egpu > Math.max(run.claim.egpu * CLAIM_SLACK, 300)) {
      understated.push({ t: run.started, text: `${named(run)} claimed ${amount("egpu", run.claim.egpu)} of the 4070 and held ${amount("egpu", run.peak.egpu)}` });
    }
    if (run.use.some((use, i) => i > 0 && use.radeon > run.claim.radeon && run.use[i - 1].radeon > run.claim.radeon)) {
      understated.push({ t: run.started, text: `${named(run)} claimed ${amount("radeon", run.claim.radeon)} of the Radeon and opened ${amount("radeon", run.peak.radeon)}` });
    }
  }
  check("hardware", "GPU claims are true", {
    judged: measured.length > 0,
    bad: understated,
    ok: `${measured.length} measured runs, none over its claim`,
    none: "no run measured",
  });

  const heavy = measured.filter((run) => run.use.length >= 6 && run.meanCores > run.claim.cores * 1.5);
  check("hardware", "Core claims are true", {
    judged: measured.length > 0,
    level: "warn",
    bad: heavy.map((run) => ({ t: run.started, text: `${named(run)} claimed ${amount("cores", run.claim.cores)} and averaged ${amount("cores", run.meanCores)}` })),
    ok: "none well over its share",
    none: "no run measured",
  });

  const strangers = new Map();
  for (const sample of samples) {
    for (const { gpu, name, mib, pages, id } of sample.unclaimed) {
      const key = `${gpu} ${id ?? name}`;
      const stranger = strangers.get(key) ?? { t: sample.t, gpu, name, id, seen: 0, most: 0 };
      stranger.seen++;
      stranger.most = Math.max(stranger.most, gpu === "egpu" ? mib : pages);
      strangers.set(key, stranger);
    }
  }
  check("hardware", "No GPU work outside the budget", {
    judged: samples.length > 0,
    // Once can be a process that outlived its run by a moment.
    bad: [...strangers.values()]
      .filter((stranger) => stranger.seen > 1)
      .map(({ t, gpu, name, id, most }) => ({ t, text: `${id === undefined ? `${name}, in no slot,` : named(byId.get(id))} held ${amount(gpu, most)} of the ${NAMES[gpu]} without claiming it` })),
    ok: "everything on the GPUs was claimed",
    none: "no samples",
  });

  const totals = Object.fromEntries(RESOURCES.map((resource) => [resource, { waited: 0, idle: 0, busy: 0, held: 0, first: undefined, holders: new Map() }]));
  let sampled = 0;
  let saturated = 0;
  samples.forEach((sample, i) => {
    const span = spans[i];
    sampled += span;
    if (sample.cores >= logicalCores(budget) * SATURATED) saturated += span;
    const real = { cores: sample.cores / budget.cores, radeon: sample.radeon.pages / budget.radeon, egpu: sample.egpu.mib / budget.egpu };
    // Cores idle below 60% of the budget, the Radeon with no page open, the eGPU under a quarter full and not computing.
    const idle = { cores: real.cores < 0.6, radeon: sample.radeon.pages === 0, egpu: real.egpu < 0.25 && sample.egpu.busy !== null && sample.egpu.busy < 10 };
    for (const resource of RESOURCES) {
      const total = totals[resource];
      total.busy += Math.min(1, real[resource]) * span;
      const holders = sample.running.map((id) => byId.get(id)).filter((run) => run?.claim[resource] > 0);
      total.held += Math.min(1, holders.reduce((sum, run) => sum + run.claim[resource], 0) / budget[resource]) * span;
      if (!sample.waiting.some(([, reason]) => reason === resource)) continue;
      total.waited += span;
      if (!idle[resource]) continue;
      total.idle += span;
      total.first ??= sample.t;
      for (const run of holders) total.holders.set(run, (total.holders.get(run) ?? 0) + span * run.claim[resource]);
    }
  });
  const wasted = [];
  for (const resource of RESOURCES) {
    const { waited: waitedFor, idle, first, holders } = totals[resource];
    if (idle < WASTE_MS || idle < waitedFor * WASTE_SHARE) continue;
    const worst = [...holders].sort((a, b) => b[1] - a[1])[0]?.[0];
    wasted.push({
      t: first,
      text: `${duration(idle)} of the ${duration(waitedFor)} spent waiting for ${NAMES[resource]} had it mostly idle${worst === undefined ? "" : `, most held by ${named(worst)}`}`,
    });
  }
  check("hardware", "No queueing for idle hardware", {
    judged: samples.length > 0,
    level: "warn",
    bad: wasted,
    ok: "what runs queued for was really busy",
    none: "no samples",
  });

  check("hardware", "CPU not overloaded", {
    judged: sampled > 0,
    level: "warn",
    bad: sampled > 0 && saturated / sampled > SATURATED_SHARE ? [{ t: from, text: `saturated ${Math.round((saturated / sampled) * 100)}% of the recorded time` }] : [],
    ok: `saturated ${sampled > 0 ? Math.round((saturated / sampled) * 100) : 0}% of the recorded time`,
    none: "no samples",
  });

  const verdictOf = (group) => {
    const states = checks.filter((each) => each.group === group).map((each) => each.state);
    return ["fail", "unknown", "warn"].find((state) => states.includes(state)) ?? "ok";
  };
  return {
    from,
    since,
    to,
    budget,
    runs,
    samples,
    checks,
    verdicts: { queue: verdictOf("queue"), hardware: verdictOf("hardware") },
    resources: RESOURCES.map((resource) => ({
      resource,
      waited: runs.reduce((sum, run) => sum + run.waited[resource], 0),
      idleWhileWanted: totals[resource].idle,
      busy: sampled > 0 ? totals[resource].busy / sampled : null,
      held: sampled > 0 ? totals[resource].held / sampled : null,
    })),
    unlogged: runs.filter((run) => !run.logged).length,
    lost: runs.filter((run) => run.lost).length,
  };
}

/** Every logical core: the two outside the budget count toward a saturated CPU. */
const logicalCores = (budget) => budget.cores + 2;

const VERDICTS = {
  queue: { question: "Is the queue working?", ok: "Yes", warn: "Yes, with a warning", fail: "No", unknown: "Can't say yet" },
  hardware: { question: "Is the hardware used right?", ok: "Yes", warn: "Mostly", fail: "No", unknown: "Can't say yet" },
};

/**
 * The runs that held far more of a GPU than they used, by how much that kept from others for how long. Never
 * cores: a run's CPU is a floor (a child that exits between samples, or runs in WSL, isn't seen), so it can show
 * a claim too small but never one too big, and claiming fewer on its word would overload the machine.
 */
function overclaims(runs, budget) {
  const found = [];
  for (const run of runs) {
    if (run.use.length < MEASURED_SAMPLES || run.started === undefined) continue;
    for (const resource of ["radeon", "egpu"]) {
      const held = Math.min(run.claim[resource], budget[resource]);
      const used = run.peak[resource];
      if (held === 0 || used >= held / 2) continue;
      found.push({ run, resource, used, cost: ((held - used) / budget[resource]) * (run.until - run.started) });
    }
  }
  return found.sort((a, b) => b.cost - a.cost);
}

/** The report as the lines an agent reads. */
export function formatHistory(report, { hours, log, unreadable = 0 }) {
  const { runs, samples, checks, budget } = report;
  const lines = [`The machine's budget over the last ${hours} h: ${runs.length} runs, ${samples.length} samples, recorded since ${clock(report.since)}.`];
  for (const [group, words] of Object.entries(VERDICTS)) {
    lines.push("", `${words.question} ${words[report.verdicts[group]]}`);
    for (const check of checks.filter((each) => each.group === group)) {
      lines.push(`  ${check.state.toUpperCase().padEnd(8)}${check.name}: ${check.summary}`);
      for (const line of check.evidence.slice(0, LISTED)) lines.push(`            ${line}`);
      if (check.evidence.length > LISTED) lines.push(`            and ${check.evidence.length - LISTED} more`);
      if (check.evidence.length > 0) lines.push(`          Do: ${NEXT[check.name]}`);
    }
  }

  lines.push("");
  for (const { resource, waited, idleWhileWanted, busy, held } of report.resources) {
    const share = (value) => (value === null ? "-" : `${Math.round(value * 100)}%`);
    // The CPU's use is everyone's: the owner's and the agents' own as well as the queue's.
    const used = resource === "cores" ? "whole machine used" : "really used";
    lines.push(`${NAMES[resource].padEnd(10)} claimed ${share(held)}, ${used} ${share(busy)}, waited for ${duration(waited)}, idle while waited for ${duration(idleWhileWanted)}`);
  }

  const over = overclaims(runs, budget);
  if (over.length > 0) {
    lines.push("", "GPU claims furthest above use (claim less next time):");
    for (const { run, resource, used } of over.slice(0, LISTED)) {
      lines.push(`  ${NAMES[resource]}: used ${amount(resource, used)} of ${amount(resource, run.claim[resource])} for ${duration(run.until - run.started)}  ${named(run)}`);
    }
  }
  const waits = runs.filter((run) => run.waitMs >= 1000).sort((a, b) => b.waitMs - a.waitMs);
  if (waits.length > 0) {
    lines.push("", "Longest waits:");
    for (const run of waits.slice(0, LISTED)) {
      const on = RESOURCES.filter((resource) => run.waited[resource] >= 1000).map((resource) => `${NAMES[resource]} ${duration(run.waited[resource])}`);
      lines.push(`  ${duration(run.waitMs)} (${on.join(", ")})  ${named(run)}`);
    }
  }

  lines.push("");
  if (report.unlogged > 0) lines.push(`${report.unlogged} runs came from checkouts that don't log: judged from samples alone.`);
  if (report.lost > 0) lines.push(`${report.lost} runs ended without saying so (killed outright).`);
  if (unreadable > 0) lines.push(`${unreadable} lines of the log couldn't be read.`);
  lines.push(`Raw records: ${log} (their fields are in scripts/machine-log.mjs).`);
  return lines;
}

/**
 * What an e2e run claims of each GPU, read from the specs its command names, since
 * each spec picks its own browser. Measured on this laptop: the default headless
 * shell draws in software, `--enable-gpu` or the full Chromium build on the Radeon,
 * and only `--force-high-performance-gpu` on the eGPU, which still composites its
 * pages on the Radeon, so every page on a GPU is one of the Radeon's. The run is held
 * to its claim by its page gate (scripts/page-gate.mjs). A command or a filter that
 * can't be read claims the most it could take.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { TAKES_VALUE, helpersReached } from "./affected-e2e-rules.mjs";
import { PAGE_MIB, RADEON_PAGES, demand, fitting } from "./machine-budget.mjs";

/** The GPU a spec draws on and the pages one of its tests holds (`test.use({ openPages: N })`, e2e/test.ts), from its text and its helpers'. */
function specUse(text, helpers) {
  const source = [text, ...[...helpersReached(text, helpers)].map((file) => helpers[file])].join("\n");
  const pages = Number(/\bopenPages:\s*(\d+)/.exec(text)?.[1] ?? 1);
  if (source.includes("--force-high-performance-gpu")) return { gpu: "egpu", pages };
  if (/--enable-gpu|channel: "chromium"/.test(source)) return { gpu: "radeon", pages };
  return { gpu: null, pages };
}

/** The Playwright arguments in a slot's command, or null when it isn't one plain `playwright test`. */
function playwrightArgs(command) {
  if (command.length === 1 && /[&|;<>]/.test(command[0])) return null;
  const words = command.length === 1 ? command[0].split(/\s+/) : command;
  const at = words.findIndex((word, i) => word === "test" && /(?:playwright|cli\.js)$/.test(words[i - 1] ?? ""));
  return at === -1 ? null : words.slice(at + 1);
}

/**
 * The claim of `command`, given every spec and helper in its checkout (repo path to
 * text). `integrated` is E2E_INTEGRATED_GPU: the WebGPU specs on the Radeon.
 */
export function claimForSpecs(command, { specs, helpers, root, integrated }) {
  const most = demand("e2e");
  const args = playwrightArgs(command);

  let workers = most.e2eWorkers;
  const filters = [];
  for (let i = 0; args !== null && i < args.length; i++) {
    const arg = args[i];
    const given = arg === "--workers" || arg === "-j" ? args[++i] : /^(?:--workers=|-j=?)(.+)$/.exec(arg)?.[1];
    if (given !== undefined) {
      workers = Number(given);
      if (!Number.isInteger(workers) || workers < 1) {
        throw new Error(`--workers takes a count here, not "${given}": the budget sizes the run's GPU claim by it`);
      }
    } else if (TAKES_VALUE.has(arg)) i++;
    else if (!arg.startsWith("-")) filters.push(arg.replaceAll("\\", "/").replace(/(?::\d+)+$/, "").toLowerCase());
  }

  const all = args === null ? [] : Object.keys(specs);
  // Playwright matches a filter against the file's whole path, ignoring case.
  const names = (filter, spec) => `${root.replaceAll("\\", "/")}/${spec}`.toLowerCase().includes(filter);
  const unread = filters.some((filter) => !all.some((spec) => names(filter, spec)));
  const chosen = filters.length === 0 || unread ? all : all.filter((spec) => filters.some((filter) => names(filter, spec)));
  // With no specs to read, it's the most an e2e run takes.
  if (chosen.length === 0) return fitting({ ...most, e2eWorkers: workers });

  const largest = { radeon: 0, egpu: 0 };
  for (const spec of chosen) {
    const use = specUse(specs[spec], helpers);
    if (use.gpu !== null) largest[use.gpu] = Math.max(largest[use.gpu], use.pages);
  }
  // Pages at once: each worker's test holds what it says, up to what the Radeon holds, and never fewer than the
  // largest test, which the gate lets run once the others have given theirs back.
  const atOnce = (each) => Math.max(each, Math.min(RADEON_PAGES, each * workers));
  const egpuPages = integrated ? 0 : largest.egpu;
  const pages = atOnce(Math.max(largest.radeon, largest.egpu));
  const claim = { cores: most.cores, radeon: pages, egpu: Math.min(pages, atOnce(egpuPages)) * PAGE_MIB, e2eWorkers: workers };
  // Without the eGPU the same pages draw on the Radeon, where they are counted already.
  if (claim.egpu > 0) claim.withoutEgpu = pages;
  return fitting(claim);
}

/** The claim of `command` run in `root`, where Playwright finds its config and specs. */
export function e2eClaim(command, root = process.cwd()) {
  const dir = path.join(root, "e2e");
  let names = [];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith(".ts"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error; // No e2e folder here: no specs to read, so it claims the most.
  }
  const files = names.map((name) => [`e2e/${name}`, readFileSync(path.join(dir, name), "utf8")]);
  return claimForSpecs(command, {
    root,
    specs: Object.fromEntries(files.filter(([file]) => file.endsWith(".spec.ts"))),
    helpers: Object.fromEntries(files.filter(([file]) => !file.endsWith(".spec.ts"))),
    integrated: process.env.E2E_INTEGRATED_GPU === "1",
  });
}

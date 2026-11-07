/**
 * Runs the e2e tests a change can reach, not every spec: `npm run test:e2e`. The rules are in
 * affected-e2e-rules.mjs; the change is measured as the unit tests' selector measures it (from where this checkout's
 * work began, committed or not).
 *
 *   npm run test:e2e                         the tests the change reaches
 *   npm run test:e2e -- --list               what that is, and why, without running it
 *   npm run test:e2e -- --all                every spec
 *   npm run test:e2e -- e2e/x.spec.ts        those specs, as Playwright takes them
 *
 * Other flags (--workers, -g, ...) go through to Playwright.
 */
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { diffBase, git } from "./affected-tests-rules.mjs";
import { select } from "./affected-e2e-rules.mjs";

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const forceAll = args.includes("--all");
const passed = args.filter((arg) => arg !== "--list" && arg !== "--all");
// Any argument that isn't a flag or a flag's value is a Playwright file filter: those files, as Playwright takes them.
const TAKES_VALUE = new Set(["-g", "--grep", "--grep-invert", "-j", "--workers", "--project", "--reporter", "-c", "--config", "--timeout", "--retries", "--repeat-each", "--shard", "--max-failures", "-x"]);
const named = passed.some((arg, i) => !arg.startsWith("-") && !TAKES_VALUE.has(passed[i - 1]));

const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
// Only the run itself waits its turn in the machine's budget, not the choosing, which may find nothing to run.
const playwright = (extra) =>
  new Promise((resolve) => {
    const slot = path.join(root, "scripts", "slot.mjs");
    const child = spawn("node", [slot, "e2e", "--", "npx", "playwright", "test", ...extra], { cwd: root, stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
  });

if (named || forceAll) process.exit(listOnly ? 0 : await playwright(passed));

const list = (gitArgs) => git(root, gitArgs).split("\n").map((line) => line.trim()).filter(Boolean);
const base = diffBase(root);
const changed = [
  ...new Set([
    ...list(["diff", "--name-only", "--no-renames", base.commit, "HEAD"]),
    ...list(["diff", "--name-only", "--no-renames", "--cached"]),
    ...list(["ls-files", "--others", "--modified", "--exclude-standard"]),
  ]),
];
const specs = Object.fromEntries(
  readdirSync(path.join(root, "e2e"))
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => [`e2e/${name}`, readFileSync(path.join(root, "e2e", name), "utf8")]),
);
const projects = new Set(readdirSync(path.join(root, "src", "projects")));
const choice = select(changed, specs, projects);

if ("all" in choice) {
  console.log(`e2e: every spec (${choice.all}, measured from ${base.ref})`);
  process.exit(listOnly ? 0 : await playwright(passed));
}
if (choice.runs.length === 0) {
  console.log(`e2e: no test reaches this change (${changed.length} files, measured from ${base.ref}).`);
  process.exit(0);
}
const locations = choice.runs.flatMap(({ spec, lines }) => (lines === null ? [spec] : lines.map((line) => `${spec}:${line}`)));
console.log(`e2e: ${choice.runs.length} of ${Object.keys(specs).length} specs, measured from ${base.ref}:`);
for (const { spec, lines, why } of choice.runs) console.log(`  ${spec}${lines === null ? "" : `:${lines.join(",")}`}  (${why})`);
process.exit(listOnly ? 0 : await playwright([...locations, ...passed]));

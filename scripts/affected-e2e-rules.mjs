// The rules of the e2e selector (affected-e2e.mjs), apart from git and Playwright so they can be tested.
//
// An e2e test loads the app by URL, so no import graph links it to the code it checks. Instead a test names what it
// guards: a `// e2e-covers:` line of repo-relative globs, just above the test (that test only) or before the first
// test (the whole spec). A test with no covers of its own or its spec's guards its whole project. A change runs the
// tests whose covers it touches, a spec it edits whole, and everything when it reaches what every page stands on.

/** Paths every page stands on: a change to one runs every spec. */
export const EVERYTHING = [
  "package.json",
  "package-lock.json",
  "playwright.config.ts",
  "next.config.*",
  "tsconfig*.json",
  "src/app/**",
  "src/shared/**",
  "relay/**",
  "scripts/affected-e2e*.mjs",
];

const escape = (text) => text.replace(/[.+^$()|[\]\\]/g, "\\$&");

/** A glob as a regular expression: `**` any depth, `*` within one folder, `{a,b}` either. */
export function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      source += glob[i + 2] === "/" ? "(?:.*/)?" : ".*";
      i += glob[i + 2] === "/" ? 2 : 1;
    } else if (c === "*") source += "[^/]*";
    else if (c === "?") source += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      source += `(?:${glob.slice(i + 1, end).split(",").map(escape).join("|")})`;
      i = end;
    } else source += escape(c);
  }
  return new RegExp(`^${source}$`);
}

const COVERS = /^\s*\/\/\s*e2e-covers:\s*(.+)$/;
const TEST = /^\s*test\(\s*["'`]/;

/**
 * A spec's tests and what each covers: `{ line, title, covers }`, line 1-based, covers a list of globs (the test's
 * own, else the spec's, else `null` for its project).
 */
export function readSpec(text) {
  const lines = text.split(/\r?\n/);
  let specCovers = null;
  const own = new Map();
  const tests = [];
  for (let i = 0; i < lines.length; i++) {
    const covers = COVERS.exec(lines[i]);
    if (covers) {
      // A covers line whose next code line is a test is that test's; any other before the first test is the spec's.
      let next = i + 1;
      while (next < lines.length && !COVERS.test(lines[next]) && (lines[next].trim() === "" || lines[next].trim().startsWith("//"))) next++;
      const globs = covers[1].trim().split(/\s+/);
      if (TEST.test(lines[next] ?? "")) own.set(next, globs);
      else if (tests.length === 0) specCovers = globs;
    } else if (TEST.test(lines[i])) tests.push({ line: i + 1, covers: null, index: i });
  }
  return tests.map(({ line, index }) => ({ line, covers: own.get(index) ?? specCovers }));
}

/** The project a spec plays: the longest project slug its file name starts with. */
export function projectOfSpec(specName, projects) {
  const base = specName.replace(/^e2e\//, "").replace(/\.spec\.ts$/, "");
  return [...projects].filter((slug) => base === slug || base.startsWith(`${slug}-`)).sort((a, b) => b.length - a.length)[0];
}

/** What no page serves: unit tests, notes and docs. A change to these alone runs no e2e test. */
export const NOT_SERVED = ["**/*.test.{ts,tsx,mjs}", "**/*.md", "**/docs/**", "**/ideas/**"];

const LOCAL_IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)["']\.\/([^"']+?)(?:\.ts)?["']/g;

/** The e2e helpers a file imports, directly or through another helper, as repo paths. */
export function helpersReached(text, helpers) {
  const reached = new Set();
  const visit = (source) => {
    for (const [, name] of source.matchAll(LOCAL_IMPORT)) {
      const file = `e2e/${name}.ts`;
      if (reached.has(file) || !(file in helpers)) continue;
      reached.add(file);
      visit(helpers[file]);
    }
  };
  visit(text);
  return reached;
}

/**
 * What to run for a change: `{ all: reason }`, or `{ runs: [{ spec, lines: number[] | null, why }] }` where null lines
 * is the whole spec. `specs` maps each spec's repo path to its text, `helpers` each other `e2e/*.ts` file's; `changed`
 * lists repo paths. A changed helper runs the specs that import it; one no spec imports is the run's own machinery
 * (its server, its reporter), which every spec stands on.
 */
export function select(changedPaths, specs, projects, helpers = {}) {
  const matches = (globs, file) => globs.some((glob) => globToRegExp(glob).test(file));
  const changed = changedPaths.filter((file) => /\.spec\.ts$/.test(file) || !matches(NOT_SERVED, file));
  const trigger = changed.find((file) => matches(EVERYTHING, file) && !/\.spec\.ts$/.test(file));
  if (trigger) return { all: `${trigger} changed` };

  const reaches = Object.fromEntries(Object.entries(specs).map(([spec, text]) => [spec, helpersReached(text, helpers)]));
  const changedHelpers = changed.filter((file) => /^e2e\/[^/]+\.ts$/.test(file) && !/\.spec\.ts$/.test(file));
  const machinery = changedHelpers.find((helper) => !Object.values(reaches).some((reached) => reached.has(helper)));
  if (machinery) return { all: `${machinery} changed` };

  const runs = [];
  for (const [spec, text] of Object.entries(specs)) {
    if (changed.includes(spec)) {
      runs.push({ spec, lines: null, why: "the spec changed" });
      continue;
    }
    const helper = changedHelpers.find((file) => reaches[spec].has(file));
    if (helper) {
      runs.push({ spec, lines: null, why: `${helper} changed` });
      continue;
    }
    const project = projectOfSpec(spec, projects);
    const home = project === undefined ? ["src/projects/**", "public/**"] : [`src/projects/${project}/**`, `public/${project}/**`];
    const tests = readSpec(text);
    const hit = tests.map((test) => ({ test, file: changed.find((file) => matches(test.covers ?? home, file)) })).filter(({ file }) => file !== undefined);
    if (hit.length === 0) continue;
    const whole = hit.length === tests.length;
    runs.push({ spec, lines: whole ? null : hit.map(({ test }) => test.line), why: `${hit[0].file} changed` });
  }
  return { runs };
}

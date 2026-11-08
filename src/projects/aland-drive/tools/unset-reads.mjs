// Node variables three's WGSL assigns in one branch and reads where that branch may not have run.
//
// three declares every node variable at the top of a shader's main function and assigns it in the flow where the node
// is first built, so a node two branches share (`If` blocks, or the two sides of a `select`) is written inside the
// first branch and read, silently zero, in the second. The shader compiles; only the picture is wrong, and only where
// the second branch runs without the first. `shader-count.mjs` runs this over every module a page compiles.
//
//   node src/projects/aland-drive/tools/unset-reads.mjs <folder of a shader-count --dump>

/* eslint-disable security/detect-non-literal-fs-filename -- a tool reading the folder it was told to */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DECLARE = /^\s*var\s+nodeVar\d+\s*:/;
const ASSIGN = /^\s*(nodeVar\d+)\s*=[^=]/;
const READ = /\bnodeVar\d+\b/g;

/**
 * Every read of a node variable that no enclosing scope has assigned, as `{ fn, line, name, text }`: `fn` counts the
 * module's main functions (a vertex and a fragment stage are separate modules, but a module may hold more than one),
 * `line` within that function. A variable assigned in both an if and its else counts as assigned after them.
 */
export function unsetReads(code) {
  const findings = [];
  code.split("fn main").slice(1).forEach((body, fn) => {
    /** One open block: what it has assigned, how it opened, and for an else what its if assigned. */
    const scopes = [{ kind: "main", assigned: new Set(), ifSet: null }];
    body.split("\n").forEach((line, index) => {
      if (DECLARE.test(line)) return;
      const target = ASSIGN.exec(line)?.[1];
      const reads = line.match(READ) ?? [];
      for (const name of target ? reads.slice(1) : reads) {
        if (!scopes.some((scope) => scope.assigned.has(name))) findings.push({ fn, line: index + 1, name, text: line.trim() });
      }
      if (target) scopes[scopes.length - 1].assigned.add(target);
      const opens = line.includes("{");
      const closes = line.includes("}");
      if (opens && !closes) {
        scopes.push({ kind: /\bif\b/.test(line) ? "if" : "other", assigned: new Set(), ifSet: null });
      } else if (closes && !opens) {
        const closed = scopes.pop();
        const parent = scopes[scopes.length - 1];
        if (closed.kind === "else") for (const name of closed.assigned) if (closed.ifSet.has(name)) parent.assigned.add(name);
      } else if (closes && opens && /}\s*else\s*{/.test(line)) {
        const closed = scopes.pop();
        scopes.push({ kind: "else", assigned: new Set(), ifSet: closed.kind === "if" ? closed.assigned : new Set() });
      }
    });
  });
  return findings;
}

/** The findings of a module, one line per variable: the first read of each, with its line and the code. */
export function describeUnsetReads(code) {
  const seen = new Set();
  return unsetReads(code)
    .filter(({ fn, name }) => !seen.has(`${fn}:${name}`) && seen.add(`${fn}:${name}`))
    .map(({ fn, line, name, text }) => `fn ${fn} line ${line}: ${name} in ${text.slice(0, 120)}`);
}

if (process.argv[1]?.endsWith("unset-reads.mjs")) {
  const folder = process.argv[2];
  if (!folder) throw new Error("unset-reads needs the folder of a shader-count --dump");
  const files = readdirSync(folder).filter((name) => name.endsWith(".wgsl")).sort((a, b) => parseInt(a) - parseInt(b));
  let flagged = 0;
  for (const name of files) {
    const lines = describeUnsetReads(readFileSync(join(folder, name), "utf8"));
    if (lines.length === 0) continue;
    flagged++;
    console.log(`${name}: ${lines.length} variable(s) read unset`);
    for (const line of lines) console.log(`  ${line}`);
  }
  console.log(`${flagged} of ${files.length} modules read a variable unset`);
}

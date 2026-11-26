// A PostToolUse hook on Write and Edit: when a change adds a test case to a
// test file, it puts the repo's question about tests in front of the session
// at that moment, when the choice is made, rather than relying on a rule read
// at the start of a long session.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const { file_path: file = "", content, old_string: before = "", new_string: after = "" } = input.tool_input ?? {};
const CASE = /\b(it|test)(\.each\([^)]*\))?\(/g;
const cases = (text) => (text.match(CASE) ?? []).length;
const added = content === undefined ? cases(after) - cases(before) : cases(content);

if (/\.test\.[cm]?[jt]sx?$/.test(file) && added > 0) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          "You just added a test case. Before keeping it, name the later change, one likely to happen, that it would catch going wrong. " +
          "If the only failure it can see is the work not being finished (a completeness check, a list held equal to the folder it was generated from, " +
          "a count of what the code just built), it is a build check: a tool, not a test (CLAUDE.md, Principles). Delete it, and check the work another way.",
      },
    }),
  );
}

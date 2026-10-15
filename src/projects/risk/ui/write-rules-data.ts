// Writes `rules-data.ts` from `RULES.md`. Run from the repository's root after changing the rules:
//   npx tsx src/projects/risk/ui/write-rules-data.ts

import { readFileSync, writeFileSync } from "node:fs";
import { extractRules } from "./rules-text";

const rules = extractRules(readFileSync("src/projects/risk/RULES.md", "utf8"));
writeFileSync(
  "src/projects/risk/ui/rules-data.ts",
  `// Generated from RULES.md by write-rules-data.ts. Don't edit by hand.

import type { RuleText } from "./rules-text";

export const RULES: Readonly<Record<string, RuleText>> = ${JSON.stringify(rules, null, 2)};
`,
);

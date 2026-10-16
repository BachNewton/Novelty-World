import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import security from "eslint-plugin-security";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  security.configs.recommended,
  {
    plugins: { "@eslint-community/eslint-comments": eslintComments },
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "security/detect-object-injection": "off",
      // Heuristic flags any boolean-ish comparison; no crypto code in this app.
      "security/detect-possible-timing-attacks": "off",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-explicit-any": "error",
      // Every lint suppression (eslint-disable, @ts-expect-error, etc.) must
      // have a `--` description explaining why. Enforces the CLAUDE.md rule.
      "@eslint-community/eslint-comments/require-description": [
        "error",
        { ignore: [] },
      ],
    },
  },
  // Betrayal's engine and content must be deterministic: a game is a function
  // of its seed and its actions, replayed identically on client and server.
  {
    files: ["src/projects/betrayal/{engine,kit,data}/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Use the game's seeded randomness (engine/random.ts).",
        },
        {
          object: "Date",
          property: "now",
          message: "The engine has no clock.",
        },
        {
          object: "performance",
          property: "now",
          message: "The engine has no clock.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date']",
          message: "The engine has no clock.",
        },
        {
          selector: "CallExpression[callee.property.name='localeCompare']",
          message: "Locale-dependent order differs between machines.",
        },
      ],
    },
  },
  // Risk's engine is deterministic too (`INV-10`): its randomness is the seeded source in its state.
  {
    files: ["src/projects/risk/engine/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the game's seeded random source (state.rng)." },
        { object: "Date", property: "now", message: "The engine has no clock." },
        { object: "performance", property: "now", message: "The engine has no clock." },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date']", message: "The engine has no clock." },
      ],
    },
  },
  // Risk's bots see only what their seat may legally see: they are handed a view, never the game
  // state. So bot code reaches the contract's types, the map, the card rules, the blitz odds and shared helpers, and nothing in
  // the project that holds or makes a state (the engine, the online game, the server, the harness).
  {
    files: ["src/projects/risk/bots/**/*.ts"],
    // A bot's tests build positions with the engine's test kit; the bot code they test can't.
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(\\.\\./|@/projects/)(?!(contract|map|blitz|cards)$)",
              message: "A bot may import only the contract, the map, the cards and the blitz odds from Risk: it sees its seat's view, never the state.",
            },
          ],
        },
      ],
    },
  },
  // A bot in a folder of its own reaches the seam and shared bot code one level up, and the contract
  // and the map two levels up, and still nothing that holds a state.
  {
    files: ["src/projects/risk/bots/*/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(\\.\\./\\.\\./|@/projects/)(?!(contract|map|blitz|cards)$)",
              message: "A bot may import only the contract, the map, the cards and the blitz odds from Risk: it sees its seat's view, never the state.",
            },
          ],
        },
      ],
    },
  },
  // The e2e harness manages its own run folders (builds, test output), every path built from its
  // own constants and process ids: the rule guards against paths from outside input, which it has none of.
  {
    files: ["e2e/*.ts"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  {
    files: ["**/*.mjs", "public/**/*.js"],
    languageOptions: {
      parserOptions: { project: false },
    },
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
  // `.claude/**` is Claude Code's working area (git worktrees, settings) — never project source to lint.
  // The repo's Python venv (the family tree layout solver's) holds third-party files, never project source.
  // `.next-bench/**`: build output from an alternate `distDir` (NEXT_DIST_DIR), used to run a production
  // server for the Shipwright perf sweep alongside the dev server. Same generated code as `.next`.
  // `.next-e2e/**`: each e2e run's own build (e2e/next-server.ts); `test-results/**`: e2e run output.
  // `.relay-dist/**`: the relay bundle relay/deploy.sh builds.
  globalIgnores([
    ".next/**",
    ".next-bench/**",
    ".next-e2e/**",
    ".relay-dist/**",
    "test-results/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/**",
    ".claude/**",
    ".opencode/worktrees/**",
    ".venv/**",
    // Gitignored genealogy research (living people): never part of the build.
    "src/projects/family-tree/research/**",
  ]),
]);

export default eslintConfig;

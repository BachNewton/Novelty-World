/** The optional questions after the statements: who someone is as an AI user,
 *  to see how that lines up with where they land. A choice's id is what is
 *  saved, so an id never changes once results use it; its label may. */

export interface Choice {
  id: string;
  label: string;
}

export interface ChoiceGroup {
  name: string;
  choices: Choice[];
}

/** Lists of tools and models go stale. Every result is dated, so a "newer
 *  than these" answer still means newer than these lists in that month. */
export const LISTS_AS_OF = "2026-11";

export const SINCE: Choice[] = [
  { id: "weeks", label: "Weeks" },
  { id: "1-3m", label: "1–3 months" },
  { id: "3-6m", label: "3–6 months" },
  { id: "1y", label: "1 year" },
  { id: "years", label: "Years" },
];

export const USES: Choice[] = [
  { id: "personal", label: "Personal projects" },
  { id: "work", label: "Work" },
  { id: "study", label: "Study" },
];

export const NOT_LISTED_TOOL = "not-listed";

export const TOOLS: ChoiceGroup[] = [
  {
    name: "Chat apps",
    choices: [
      { id: "chatgpt", label: "ChatGPT" },
      { id: "claude-app", label: "Claude" },
      { id: "gemini-app", label: "Gemini" },
    ],
  },
  {
    name: "Editors",
    choices: [
      { id: "github-copilot", label: "GitHub Copilot" },
      { id: "cursor", label: "Cursor" },
      { id: "windsurf", label: "Windsurf" },
      { id: "antigravity", label: "Google Antigravity" },
    ],
  },
  {
    name: "Agents",
    choices: [
      { id: "claude-code", label: "Claude Code" },
      { id: "codex", label: "OpenAI Codex" },
      { id: "gemini-cli", label: "Gemini CLI" },
      { id: "opencode", label: "OpenCode" },
    ],
  },
  {
    name: "Something else",
    choices: [
      { id: "app-builder", label: "An app builder (Lovable, Bolt, v0…)" },
      { id: NOT_LISTED_TOOL, label: "One that isn't listed" },
    ],
  },
];

export const NEWER_MODEL = "newer";

/** Models by tier: a small fast model and a flagship give very different
 *  experiences, while releases within one tier mostly don't. */
export const MODELS: ChoiceGroup[] = [
  {
    name: "Anthropic",
    choices: [
      { id: "claude-haiku", label: "Claude Haiku" },
      { id: "claude-sonnet", label: "Claude Sonnet" },
      { id: "claude-opus", label: "Claude Opus" },
      { id: "claude-fable", label: "Claude Fable" },
    ],
  },
  {
    name: "OpenAI",
    choices: [
      { id: "gpt-4", label: "GPT-4 / GPT-4o" },
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-6", label: "GPT-6" },
    ],
  },
  {
    name: "Google",
    choices: [
      { id: "gemini-flash", label: "Gemini Flash" },
      { id: "gemini-pro", label: "Gemini Pro" },
    ],
  },
  {
    name: "Something else",
    choices: [
      { id: "open-weight", label: "An open model (DeepSeek, Qwen, Llama…)" },
      { id: NEWER_MODEL, label: "One newer than these" },
      { id: "not-listed", label: "One that isn't listed" },
    ],
  },
];

export interface Background {
  since?: string;
  uses?: string[];
  tools?: string[];
  models?: string[];
}

const ids = (groups: ChoiceGroup[]) => new Set(groups.flatMap((group) => group.choices.map((choice) => choice.id)));

export const VALID = {
  since: new Set(SINCE.map((choice) => choice.id)),
  uses: new Set(USES.map((choice) => choice.id)),
  tools: ids(TOOLS),
  models: ids(MODELS),
};

export function choiceLabel(choices: Choice[] | ChoiceGroup[], id: string): string {
  const flat = choices.flatMap((entry) => ("choices" in entry ? entry.choices : [entry]));
  const choice = flat.find((c) => c.id === id);
  if (!choice) throw new Error(`Unknown AI Compass choice: ${id}`);
  return choice.label;
}

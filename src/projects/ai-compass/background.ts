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
  { id: "under-6m", label: "Under 6 months" },
  { id: "6-12m", label: "6–12 months" },
  { id: "1-2y", label: "1–2 years" },
  { id: "2-3y", label: "2–3 years" },
  { id: "3y-plus", label: "3 years or more" },
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
      { id: "microsoft-copilot", label: "Microsoft Copilot" },
      { id: "grok-app", label: "Grok" },
      { id: "perplexity", label: "Perplexity" },
      { id: "deepseek-app", label: "DeepSeek" },
    ],
  },
  {
    name: "Editors and extensions",
    choices: [
      { id: "github-copilot", label: "GitHub Copilot" },
      { id: "cursor", label: "Cursor" },
      { id: "windsurf", label: "Windsurf" },
      { id: "antigravity", label: "Google Antigravity" },
      { id: "jetbrains-ai", label: "JetBrains AI / Junie" },
      { id: "kiro", label: "Kiro / Amazon Q Developer" },
      { id: "zed", label: "Zed" },
      { id: "cline", label: "Cline" },
      { id: "roo-code", label: "Roo Code" },
      { id: "kilo-code", label: "Kilo Code" },
      { id: "continue", label: "Continue" },
      { id: "tabnine", label: "Tabnine" },
    ],
  },
  {
    name: "Agents",
    choices: [
      { id: "claude-code", label: "Claude Code" },
      { id: "codex", label: "OpenAI Codex" },
      { id: "gemini-cli", label: "Gemini CLI" },
      { id: "aider", label: "Aider" },
      { id: "opencode", label: "OpenCode" },
      { id: "amp", label: "Amp" },
      { id: "devin", label: "Devin" },
      { id: "jules", label: "Jules" },
    ],
  },
  {
    name: "App builders",
    choices: [
      { id: "lovable", label: "Lovable" },
      { id: "bolt", label: "Bolt" },
      { id: "v0", label: "v0" },
      { id: "replit-agent", label: "Replit Agent" },
    ],
  },
  {
    name: "Something else",
    choices: [{ id: NOT_LISTED_TOOL, label: "One that isn't listed" }],
  },
];

export const NEWER_MODEL = "newer";

/** Models by tier and generation: a small fast model and a flagship give very
 *  different experiences, while point releases within one line mostly don't. */
export const MODELS: ChoiceGroup[] = [
  {
    name: "Anthropic",
    choices: [
      { id: "claude-3-sonnet", label: "Claude 3.x Sonnet" },
      { id: "claude-haiku", label: "Claude Haiku (any)" },
      { id: "claude-4-sonnet", label: "Claude Sonnet 4.x" },
      { id: "claude-4-opus", label: "Claude Opus 4.x" },
      { id: "claude-5-sonnet", label: "Claude Sonnet 5.x" },
      { id: "claude-5-opus", label: "Claude Opus 5.x" },
      { id: "claude-5-fable", label: "Claude Fable 5.x" },
    ],
  },
  {
    name: "OpenAI",
    choices: [
      { id: "gpt-3-5", label: "GPT-3.5" },
      { id: "gpt-4", label: "GPT-4 / GPT-4o / GPT-4.1" },
      { id: "openai-o-series", label: "o1 / o3 / o4-mini" },
      { id: "gpt-5", label: "GPT-5.x" },
      { id: "gpt-5-codex", label: "GPT-5.x Codex" },
      { id: "gpt-6", label: "GPT-6.x" },
    ],
  },
  {
    name: "Google",
    choices: [
      { id: "gemini-flash", label: "Gemini Flash (any)" },
      { id: "gemini-2-pro", label: "Gemini 2.x Pro" },
      { id: "gemini-3-pro", label: "Gemini 3.x Pro" },
      { id: "gemini-4", label: "Gemini 4" },
    ],
  },
  {
    name: "Open and other models",
    choices: [
      { id: "deepseek", label: "DeepSeek" },
      { id: "qwen", label: "Qwen / Qwen Coder" },
      { id: "kimi", label: "Kimi" },
      { id: "glm", label: "GLM" },
      { id: "llama", label: "Llama" },
      { id: "mistral", label: "Mistral / Codestral / Devstral" },
      { id: "grok", label: "Grok" },
    ],
  },
  {
    name: "Something else",
    choices: [{ id: NEWER_MODEL, label: "One newer than these" }, { id: "not-listed", label: "One that isn't listed" }],
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

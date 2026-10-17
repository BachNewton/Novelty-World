import type { CSSProperties } from "react";
import { BINDINGS as BETRAYAL_BINDINGS } from "@/projects/betrayal/components/prompts";
import { BETRAYAL_THEME } from "@/projects/betrayal/components/theme";
import { BINDINGS as RISK_BINDINGS } from "@/projects/risk/ui/bindings";
import { RISK_THEME } from "@/projects/risk/components/theme";
import { NAMED_KEYS, type Binding } from "@/shared/components/prompts";

/** A game that shows the shared prompts: its map from a meaning to a control, and the palette it paints them in. */
export interface PromptGame {
  name: string;
  bindings: Readonly<Record<string, Binding>>;
  /** The game's root style, which sets its `--prompt-*` properties. */
  theme: CSSProperties;
  /** Classes in the game's own tokens: its panel, a plain button on it, a dim line, and dim text. */
  panel: string;
  button: string;
  line: string;
  muted: string;
}

export const GAMES: readonly PromptGame[] = [
  {
    name: "Risk",
    bindings: RISK_BINDINGS,
    theme: RISK_THEME,
    panel: "border-(--rk-line) bg-(--rk-panel) text-(--rk-text)",
    button: "border-(--rk-line) bg-(--rk-panel-raised) text-(--rk-text)",
    line: "border-(--rk-line)",
    muted: "text-(--rk-muted)",
  },
  {
    name: "Betrayal",
    bindings: BETRAYAL_BINDINGS,
    theme: BETRAYAL_THEME,
    panel: "border-(--bt-line) bg-(--bt-panel) text-(--bt-ink)",
    button: "border-(--bt-line) bg-(--bt-room) text-(--bt-ink)",
    line: "border-(--bt-line)",
    muted: "text-(--bt-muted)",
  },
];

const range = (from: string, to: string) => Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) => String.fromCharCode(from.charCodeAt(0) + i));

/** Every key worth showing: the ones drawn or measured on their own, the letters and digits, and any other key a game binds. */
export const KEYS: readonly string[] = [
  ...new Set([
    ...NAMED_KEYS,
    ...range("A", "Z"),
    ...range("0", "9"),
    ...GAMES.flatMap((game) => Object.values(game.bindings).flatMap((binding) => (binding.key === null ? [] : [binding.key]))),
  ]),
];

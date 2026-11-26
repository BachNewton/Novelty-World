/**
 * The map editor's keys, by their place on the keyboard as the game's own are,
 * with the label each key's glyph shows. Ctrl and Shift change some: Ctrl with
 * Z undoes and with Y redoes, and Shift turns the other way or raises and
 * lowers by a finer step.
 */
export const EDIT_KEYS = {
  toggle: { code: "KeyM", label: "M" },
  turn: { code: "KeyR", label: "R" },
  mirror: { code: "KeyF", label: "F" },
  raise: { code: "KeyE", label: "E" },
  lower: { code: "KeyQ", label: "Q" },
  remove: { code: "Delete", label: "Del" },
  undo: { code: "KeyZ", label: "Z" },
  redo: { code: "KeyY", label: "Y" },
  drop: { code: "Escape", label: "Esc" },
} as const satisfies Record<string, { code: string; label: string }>;

export type EditAction = keyof typeof EDIT_KEYS;

/** How far a raise or lower moves a piece: a quarter storey, or with Shift a twentieth, for a piece that hangs between. */
export const RAISE_STEP = 0.25;
export const FINE_RAISE_STEP = 0.05;

/** The action a key press asks for, if any: undo and redo only with Ctrl (or ⌘), every other key only without it. */
export function editActionOf(event: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey">): EditAction | null {
  const command = event.ctrlKey || event.metaKey;
  if (event.code === "Backspace") return command ? null : "remove";
  const found = (Object.keys(EDIT_KEYS) as EditAction[]).find((action) => EDIT_KEYS[action].code === event.code);
  if (found === undefined) return null;
  return command === (found === "undo" || found === "redo") ? found : null;
}

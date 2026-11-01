/** Every AI version's label, newest first: the order the lobby lists them in.
 *  Apart from the bundles (`index.ts`, which must cover exactly these), so what
 *  only reads a label doesn't depend on every frozen version. */
export const AI_VERSION_LABELS = ["llm-v12", "llm-v11", "llm-v9", "llm-v8", "llm-v7", "llm-v6", "llm-v5", "llm-v4", "llm-v3", "llm-v2", "llm-v1"] as const;

export type AiVersionLabel = (typeof AI_VERSION_LABELS)[number];

/** Versions tuned and measured on one model only (METHOD.md, "model-specific"),
 *  by the model they were measured on. They stay selectable, but are never a
 *  new seat's default: a model-specific setting may hold another model back. */
export const MODEL_SPECIFIC: Readonly<Partial<Record<AiVersionLabel, string>>> = {
  "llm-v9": "Claude Sonnet 5.5",
  "llm-v11": "Claude Sonnet 5.5",
  "llm-v12": "Claude Sonnet 5.5",
};

/** The version a new AI seat plays unless another is picked: the newest one
 *  that isn't model-specific. */
export const DEFAULT_AI_VERSION: AiVersionLabel = newestGeneral();

function newestGeneral(): AiVersionLabel {
  const label = AI_VERSION_LABELS.find((candidate) => !(candidate in MODEL_SPECIFIC));
  if (label === undefined) throw new Error("every AI version is model-specific");
  return label;
}

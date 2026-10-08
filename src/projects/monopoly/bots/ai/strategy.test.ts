import { describe, expect, it } from "vitest";
import { aiStrategyId, isAiStrategy, parseAiStrategy } from "./strategy";
import { AI_VERSION_LABELS, AI_VERSIONS, DEFAULT_AI_VERSION, MODEL_SPECIFIC } from "./versions";

describe("an AI seat's strategy encoding", () => {
  it("round-trips a profile and a version", () => {
    const id = aiStrategyId({ profile: "ai:local", version: "llm-v2" });
    expect(id).toBe("ai:local@llm-v2");
    expect(parseAiStrategy(id)).toEqual({ profile: "ai:local", version: "llm-v2" });
  });

  it("isn't an AI seat without a known profile and version", () => {
    expect(isAiStrategy("ai:local")).toBe(false);
    expect(isAiStrategy("ai:local@llm-v999")).toBe(false);
    expect(isAiStrategy("ai:cloud@llm-v1")).toBe(false);
    expect(isAiStrategy("claude-v41")).toBe(false);
    expect(isAiStrategy(null)).toBe(false);
  });
});

describe("the AI version registry", () => {
  it("lists every version once, newest first, and defaults to the newest that isn't model-specific", () => {
    expect([...AI_VERSION_LABELS].sort()).toEqual(Object.keys(AI_VERSIONS).sort());
    const numbers = AI_VERSION_LABELS.map((label) => Number(label.replace("llm-v", "")));
    expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
    expect(DEFAULT_AI_VERSION).toBe(AI_VERSION_LABELS.find((label) => !(label in MODEL_SPECIFIC)));
  });

  it("files each version under its own label", () => {
    for (const [label, version] of Object.entries(AI_VERSIONS)) expect(version.label).toBe(label);
  });
});

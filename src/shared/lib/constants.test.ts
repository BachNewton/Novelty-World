import { describe, expect, it } from "vitest";
import { PROJECTS } from "./constants";

describe("PROJECTS", () => {
  it("gives every project an icon of its own", () => {
    const byIcon = Map.groupBy(PROJECTS, (p) => p.icon);
    const shared = [...byIcon].filter(([, projects]) => projects.length > 1).map(([icon, projects]) => `${icon}: ${projects.map((p) => p.name).join(", ")}`);
    expect(shared).toEqual([]);
  });
});

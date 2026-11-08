import { describe, expect, it } from "vitest";
import { unmortgageCostAt } from "./logic";
describe("unmortgageCostAt", () => {
  it("returns mortgage value plus 10% interest, rounded up", () => {
    // Mediterranean mortgage $30 * 1.10 = $33.
    expect(unmortgageCostAt(1)).toBe(33);
    // Boardwalk mortgage $200 * 1.10 = $220.
    expect(unmortgageCostAt(39)).toBe(220);
    // Electric Co mortgage $75 * 1.10 = $82.5 -> $83 rounded up.
    expect(unmortgageCostAt(12)).toBe(83);
  });
});

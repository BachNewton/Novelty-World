import { describe, expect, it } from "vitest";
import type { CardId } from "../../contract";
import { positionBoard, positionBreakdown, type SeatPosition } from "../../eval/positions";
import { features } from "./features";
import { GOLDEN } from "./golden";
import { predict } from "./network";

// v8's network reproduces the trained model: the TypeScript features and inference must match
// what the trainer computed for held-out positions.

describe("rule-v8", () => {
  it("gives the trained model's probability for held-out recorded positions", () => {
    expect(GOLDEN.length).toBeGreaterThanOrEqual(5);
    for (const golden of GOLDEN) {
      const record: SeatPosition = { ...golden.record, cards: golden.record.cards as CardId[] };
      const { p } = golden;
      expect(Math.abs(predict(features(positionBoard(record), record.seat, positionBreakdown(record))) - p)).toBeLessThan(1e-9);
    }
  });
});

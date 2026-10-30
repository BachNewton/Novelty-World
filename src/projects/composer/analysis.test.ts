import { expect, it } from "vitest";
import { checkAnalysis } from "./analysis-check";
import { PIECES } from "./pieces";

it("every analysis tells the truth about its score", () => {
  const problems = PIECES.flatMap((piece) => (piece.analysis === undefined ? [] : checkAnalysis(piece.score(), piece.analysis).map((problem) => `${piece.id}: ${problem}`)));
  expect(problems).toEqual([]);
});

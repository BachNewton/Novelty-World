import { describe, expect, it } from "vitest";
import { STATEMENTS, scoreAnswers, scoreByStakes, type Answer, type Answers } from "./quiz";
import { parseSubmission } from "./results";

function answerAll(pick: (direction: 1 | -1) => Answer): Answers {
  return Object.fromEntries(STATEMENTS.map((s) => [s.id, pick(s.direction)]));
}

describe("scoreAnswers", () => {
  it("counts disagreeing with a reversed statement like agreeing with a forward one", () => {
    expect(scoreAnswers(answerAll((direction) => (direction === 1 ? 4 : 0)))).toEqual({ scope: 1, ownership: 1 });
    expect(scoreAnswers(answerAll((direction) => (direction === 1 ? 0 : 4)))).toEqual({ scope: 0, ownership: 0 });
  });

  it("counts \"Neutral\" as the middle of the axis", () => {
    const answers = answerAll((direction) => (direction === 1 ? 4 : 2));
    expect(scoreAnswers(answers)).toEqual({ scope: 0.75, ownership: 0.75 });
  });

  it("balances every axis within every tier, so agreeing with everything lands in the middle at any stakes", () => {
    const middle = { scope: 0.5, ownership: 0.5 };
    expect(scoreByStakes(answerAll(() => 4))).toEqual({ low: middle, mid: middle, high: middle });
  });
});

describe("scoreByStakes", () => {
  it("places each tier by its own scenes alone", () => {
    const answers: Answers = Object.fromEntries(
      STATEMENTS.map((s) => {
        const up = s.stakes === "low" ? s.axis === "scope" : s.axis === "ownership";
        return [s.id, (s.direction === 1) === up ? 4 : 0];
      }),
    );
    expect(scoreByStakes(answers)).toEqual({
      low: { scope: 1, ownership: 0 },
      mid: { scope: 0, ownership: 1 },
      high: { scope: 0, ownership: 1 },
    });
  });
});

describe("parseSubmission", () => {
  const valid = { profileId: "abc-123", name: " Kyle ", answers: answerAll(() => 3), background: { since: "1-2y", tools: ["cursor", "cursor"] } };

  it("keeps a whole quiz, trimming the name and repeated choices", () => {
    expect(parseSubmission(valid)).toEqual({ ...valid, name: "Kyle", background: { since: "1-2y", tools: ["cursor"] } });
  });

  it("refuses a quiz with a statement unanswered", () => {
    const answers: Record<string, unknown> = { ...valid.answers };
    delete answers[STATEMENTS[0].id];
    expect(parseSubmission({ ...valid, answers })).toBeNull();
  });

  it("refuses answers and choices that aren't on the lists", () => {
    expect(parseSubmission({ ...valid, answers: { ...valid.answers, [STATEMENTS[0].id]: 5 } })).toBeNull();
    expect(parseSubmission({ ...valid, background: { models: ["made-up"] } })).toBeNull();
    expect(parseSubmission({ ...valid, background: { since: "forever" } })).toBeNull();
  });
});

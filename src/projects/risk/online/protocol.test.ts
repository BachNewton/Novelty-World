import { describe, expect, it } from "vitest";
import { parseRequest } from "./protocol";

const profile = { id: "p1", name: "Alice" };

describe("parseRequest", () => {
  it("reads every request", () => {
    expect(parseRequest({ op: "create", profile })).toEqual({ op: "create", profile });
    expect(parseRequest({ op: "nudge", game: "ABCD" })).toEqual({ op: "nudge", game: "ABCD" });
    expect(parseRequest({ op: "delete", game: "ABCD" })).toEqual({ op: "delete", game: "ABCD" });
    expect(parseRequest({ op: "remove-seat", game: "ABCD", profile, seat: 2 })).toEqual({ op: "remove-seat", game: "ABCD", profile, seat: 2 });
    expect(parseRequest({ op: "add-bot", game: "ABCD", profile, bot: "greedy" })).toEqual({ op: "add-bot", game: "ABCD", profile, bot: "greedy" });
    const answer = { decision: 4, seat: 1, move: { kind: "blitz", from: "alaska", to: "kamchatka", keepAtLeast: 1 } };
    expect(parseRequest({ op: "move", game: "ABCD", profile, answer })).toEqual({ op: "move", game: "ABCD", profile, answer });
  });

  it("refuses what isn't a request", () => {
    const answer = (move: unknown, decision: unknown = 0) => ({ op: "move", game: "ABCD", profile, answer: { decision, seat: 0, move } });
    for (const bad of [
      null,
      "create",
      { op: "create" },
      { op: "join", profile },
      { op: "delete" },
      { op: "fly", game: "ABCD", profile },
      { op: "remove-seat", game: "ABCD", profile, seat: -1 },
      { op: "add-bot", game: "ABCD", profile },
      { op: "add-bot", game: "ABCD", profile, bot: 3 },
      { op: "set-bot", game: "ABCD", profile, seat: 1, bot: "random" },
      answer({ kind: "place", territory: "atlantis", armies: 1 }),
      answer({ kind: "attack", from: "alaska", to: "kamchatka", dice: 4 }),
      answer({ kind: "end-turn", extra: 1 }),
      answer({ kind: "end-turn" }, 1.5),
      answer({ kind: "trade", cards: ["alaska", "peru"] }),
    ]) {
      expect(parseRequest(bad)).toBeNull();
    }
  });
});

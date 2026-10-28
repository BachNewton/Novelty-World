import { describe, expect, it } from "vitest";
import type { Move } from "../contract";
import type { OnlineGame } from "../online/game";
import type { Controller, LoggedMove } from "../online/table";
import { onlineLogOf } from "./online-log";

const seats: Controller[] = [
  { kind: "human", profile: { id: "p-1", name: "Bot Killer" }, elo: 1100 },
  { kind: "bot", bot: "rule-v7.1" },
  { kind: "bot", bot: "gd-stacker" },
];
const row = { id: "ABCD", seats, game: { seed: "seed-1", players: 3 } as OnlineGame };

// As the database returns them: out of order, and each jsonb object's keys in its own order.
const logged = [
  { decision: 1, seat: 1, controller: { bot: "rule-v7.1", kind: "bot" }, move: { territory: "peru", armies: 1, kind: "place" } },
  { decision: 0, seat: 1, controller: { kind: "bot", bot: "rule-v7.1" }, move: { armies: 2, kind: "place", territory: "brazil" } },
  { decision: 2, seat: 1, controller: { kind: "bot", bot: "rule-v7.1" }, move: { kind: "end-attack" } },
] as LoggedMove[];

const sorted = (value: unknown) =>
  JSON.stringify(value, (_, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );

describe("risk:export's log of a game's row and move log", () => {
  it("keeps the seed and player count, labels each seat by its bot or its person's name, and puts the moves in decision order", () => {
    const log = onlineLogOf(row, logged);
    expect(log.seed).toBe("seed-1");
    expect(log.players).toBe(3);
    expect(log.labels).toEqual(["Bot Killer", "rule-v7.1", "gd-stacker"]);
    const expected: { seat: number; move: Move }[] = [
      { seat: 1, move: { kind: "place", territory: "brazil", armies: 2 } },
      { seat: 1, move: { kind: "place", territory: "peru", armies: 1 } },
      { seat: 1, move: { kind: "end-attack" } },
    ];
    expect(sorted(log.moves)).toBe(sorted(expected));
  });

  it("fails loudly on a move log with a decision missing, or a game that never started", () => {
    expect(() => onlineLogOf(row, [logged[0], logged[2]])).toThrow(/decision 1 where decision 0 belongs/);
    expect(() => onlineLogOf({ ...row, game: null }, [])).toThrow(/hasn't started/);
  });
});

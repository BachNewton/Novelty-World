import { describe, expect, it } from "vitest";
import { tableListing } from "./listing";
import { DEFAULT_BOT } from "./seat-bots";
import type { Controller, GameRow } from "./table";

const human = (id: string, name: string): Controller => ({ kind: "human", profile: { id, name } });
const BOT: Controller = { kind: "bot", bot: DEFAULT_BOT };
const ALICE = human("alice", "Alice");
const BOB = human("bob", "Bob");

function table(seats: Controller[], status: GameRow["status"] = "lobby"): Pick<GameRow, "id" | "status" | "seats"> {
  return { id: "ABCD", status, seats };
}

describe("tableListing", () => {
  it("lists a gathering table by its row, its first person's name and its seats", () => {
    expect(tableListing(table([ALICE, BOT]), "alice")).toEqual({ code: "ABCD", hostName: "Alice", players: 2, capacity: 6 });
  });

  it("is advertised only by the first person seated", () => {
    expect(tableListing(table([ALICE, BOB]), "bob")).toBeNull();
  });

  it("passes to the next person when the first is removed", () => {
    expect(tableListing(table([BOT, BOB]), "bob")).toEqual({ code: "ABCD", hostName: "Bob", players: 2, capacity: 6 });
  });

  it("is unlisted once the game starts or ends", () => {
    expect(tableListing(table([ALICE, BOB, BOT], "playing"), "alice")).toBeNull();
    expect(tableListing(table([ALICE, BOB, BOT], "over"), "alice")).toBeNull();
  });

  it("is unlisted while the table is full", () => {
    expect(tableListing(table([ALICE, BOB, BOT, BOT, BOT, BOT]), "alice")).toBeNull();
    expect(tableListing(table([ALICE, BOB, BOT, BOT, BOT]), "alice")).toMatchObject({ players: 5 });
  });
});

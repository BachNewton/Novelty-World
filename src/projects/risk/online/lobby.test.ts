import { describe, expect, it } from "vitest";
import { applyLobbyChange, EMPTY_LOBBY, lobbyTables, openAction, summarize, type LobbyChange, type TableSummary } from "./lobby";
import { DEFAULT_BOT } from "./seat-bots";
import type { Controller } from "./table";

const ALICE: Controller = { kind: "human", profile: { id: "alice", name: "Alice" } };
const BOT: Controller = { kind: "bot", bot: DEFAULT_BOT };

function table(id: string, version: number, updatedAt: string, status: TableSummary["status"] = "lobby"): TableSummary {
  return { id, version, status, seats: [ALICE], updatedAt };
}

const after = (...changes: LobbyChange[]) => changes.reduce(applyLobbyChange, EMPTY_LOBBY);
const ids = (...changes: LobbyChange[]) => lobbyTables(after(...changes)).map((t) => `${t.id}@${t.version.toString()}`);

describe("the lobby's list", () => {
  it("takes a row as the database keeps it", () => {
    expect(summarize({ id: "A", version: 2, status: "playing", seats: [ALICE], updated_at: "t" })).toEqual({ id: "A", version: 2, status: "playing", seats: [ALICE], updatedAt: "t" });
  });

  it("is loading until the first load answers", () => {
    expect(EMPTY_LOBBY.loaded).toBe(false);
    expect(after({ kind: "loaded", tables: [] }).loaded).toBe(true);
  });

  it("lists every game, most recently active first", () => {
    const tables = [table("A", 1, "2026-01-01T10:00:00Z", "over"), table("B", 1, "2026-01-01T12:00:00Z", "playing"), table("C", 1, "2026-01-01T11:00:00Z")];
    expect(ids({ kind: "loaded", tables })).toEqual(["B@1", "C@1", "A@1"]);
  });

  it("moves a game to the top when it is written", () => {
    const tables = [table("A", 1, "2026-01-01T10:00:00Z"), table("B", 1, "2026-01-01T11:00:00Z")];
    expect(ids({ kind: "loaded", tables }, { kind: "written", table: table("A", 2, "2026-01-01T12:00:00Z") })).toEqual(["A@2", "B@1"]);
  });

  it("keeps the newest version of a game, whichever arrives last", () => {
    const newer = table("A", 3, "2026-01-01T12:00:00Z");
    const older = table("A", 2, "2026-01-01T11:00:00Z");
    expect(ids({ kind: "written", table: newer }, { kind: "loaded", tables: [older] })).toEqual(["A@3"]);
    expect(ids({ kind: "written", table: newer }, { kind: "written", table: older })).toEqual(["A@3"]);
  });

  it("drops a deleted game, and a load already under way can't bring it back", () => {
    const a = table("A", 1, "2026-01-01T10:00:00Z");
    expect(ids({ kind: "loaded", tables: [a] }, { kind: "deleted", id: "A" })).toEqual([]);
    expect(ids({ kind: "deleted", id: "A" }, { kind: "loaded", tables: [a] })).toEqual([]);
  });

  it("lists a new game that drew a deleted game's id", () => {
    expect(ids({ kind: "deleted", id: "A" }, { kind: "written", table: table("A", 0, "2026-01-02T10:00:00Z") })).toEqual(["A@0"]);
  });
});

describe("openAction", () => {
  const BOB: Controller = { kind: "human", profile: { id: "bob", name: "Bob" } };

  it("takes a seat at a gathering table with one free", () => {
    expect(openAction({ status: "lobby", seats: [ALICE, BOT] }, "bob")).toBe("join");
  });

  it("comes back to a player's own table, gathering or in play", () => {
    expect(openAction({ status: "lobby", seats: [ALICE, BOB] }, "bob")).toBe("rejoin");
    expect(openAction({ status: "playing", seats: [ALICE, BOB, BOT] }, "bob")).toBe("rejoin");
  });

  it("watches a game in play, a full table or a game that is over", () => {
    expect(openAction({ status: "playing", seats: [ALICE, BOT, BOT] }, "bob")).toBe("watch");
    expect(openAction({ status: "lobby", seats: [ALICE, BOT, BOT, BOT, BOT, BOT] }, "bob")).toBe("watch");
    expect(openAction({ status: "over", seats: [ALICE, BOB, BOT] }, "bob")).toBe("watch");
  });
});

import { describe, expect, it } from "vitest";
import { roomListSource, roomsFromPresence, type ListedRoom } from "./room-list";

function room(code: string, listedAt: number): ListedRoom {
  return { code, hostName: `Host ${code}`, players: 1, capacity: 2, listedAt };
}

describe("roomListSource", () => {
  it("is Supabase presence, one channel per game", () => {
    expect(roomListSource("frogmino", "")).toEqual({ kind: "supabase", channel: "lobby:frogmino" });
    expect(roomListSource("euchre", "?relay=local:51234")).toEqual({ kind: "supabase", channel: "lobby:euchre" });
  });

  it("moves to the local relay's stand-in, on a channel of its own, with ?room-list=local:<name>", () => {
    expect(roomListSource("frogmino", "?relay=local:51234&room-list=local:run-7")).toEqual({
      kind: "local",
      url: "ws://localhost:51234/room-list",
      channel: "frogmino:run-7",
    });
  });

  it("fails loudly on a list that isn't local, or a local list with no local relay", () => {
    expect(() => roomListSource("frogmino", "?relay=local:51234&room-list=run-7")).toThrow(/local:<name>/);
    expect(() => roomListSource("frogmino", "?room-list=local:run-7")).toThrow(/relay=local/);
  });
});

describe("roomsFromPresence", () => {
  it("is empty when nobody lists a room", () => {
    expect(roomsFromPresence({})).toEqual([]);
  });

  it("lists every client's rooms, oldest first", () => {
    const rooms = roomsFromPresence({
      a: [room("BBBB", 20)],
      b: [room("AAAA", 10), room("CCCC", 30)],
    });
    expect(rooms.map((r) => r.code)).toEqual(["AAAA", "BBBB", "CCCC"]);
  });

  it("drops Supabase's own presence fields", () => {
    const tracked = { ...room("AAAA", 1), presence_ref: "ref-1" };
    expect(roomsFromPresence({ a: [tracked] })).toEqual([room("AAAA", 1)]);
  });
});

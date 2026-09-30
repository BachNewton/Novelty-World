import { describe, expect, it } from "vitest";
import { roomListChannel, roomsFromPresence, type ListedRoom } from "./room-list";

function room(code: string, listedAt: number): ListedRoom {
  return { code, hostName: `Host ${code}`, players: 1, capacity: 2, listedAt };
}

describe("roomListChannel", () => {
  it("is one channel per game", () => {
    expect(roomListChannel("frogmino", "")).toBe("lobby:frogmino");
    expect(roomListChannel("euchre", "?peer-signal=local")).toBe("lobby:euchre");
  });

  it("moves to a channel of its own with ?room-list", () => {
    expect(roomListChannel("frogmino", "?peer-signal=local&room-list=run-7")).toBe("lobby:frogmino:run-7");
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

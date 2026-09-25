import { describe, expect, it } from "vitest";
import { createEmptyGrid } from "../world-map";
import {
  DEFAULT_ROOM_ID,
  parseGuestMessage,
  parseHostMessage,
  roomIdFromSearch,
  type Avatar,
} from "./protocol";

const AVATAR: Avatar = {
  x: 10,
  y: 20,
  dir: "side",
  flip: true,
  moving: false,
  characterId: "farmer-bob",
};
const GRASS = "/rpg/tiles/Grass/Grass_Tiles_1.png";

describe("roomIdFromSearch", () => {
  it("uses a valid ?coop-room= and falls back to the default room otherwise", () => {
    expect(roomIdFromSearch("?coop-room=test_room-1")).toBe("test_room-1");
    expect(roomIdFromSearch("")).toBe(DEFAULT_ROOM_ID);
    expect(roomIdFromSearch("?coop-room=")).toBe(DEFAULT_ROOM_ID);
    expect(roomIdFromSearch("?coop-room=bad%20room")).toBe(DEFAULT_ROOM_ID);
    expect(roomIdFromSearch(`?coop-room=${"a".repeat(65)}`)).toBe(DEFAULT_ROOM_ID);
  });
});

describe("parseGuestMessage", () => {
  it("accepts avatar, paint and clear", () => {
    expect(parseGuestMessage({ kind: "avatar", avatar: AVATAR })).toEqual({ kind: "avatar", avatar: AVATAR });
    const edits = [{ c: 1, r: 2, tile: { src: GRASS, sx: 0, sy: 0 } }];
    expect(parseGuestMessage({ kind: "paint", edits })).toEqual({ kind: "paint", edits });
    expect(parseGuestMessage({ kind: "clear" })).toEqual({ kind: "clear" });
  });

  it("rejects bad avatars, empty paints, host-only and unknown kinds", () => {
    expect(parseGuestMessage({ kind: "avatar", avatar: { ...AVATAR, x: Number.NaN } })).toBeNull();
    expect(parseGuestMessage({ kind: "avatar", avatar: { ...AVATAR, dir: "up" } })).toBeNull();
    expect(parseGuestMessage({ kind: "avatar", avatar: { ...AVATAR, characterId: "nobody" } })).toBeNull();
    expect(parseGuestMessage({ kind: "paint", edits: [{ c: 99, r: 0, tile: null }] })).toBeNull();
    expect(parseGuestMessage({ kind: "welcome", grid: createEmptyGrid(), avatars: {} })).toBeNull();
    expect(parseGuestMessage({ kind: "left", id: "x" })).toBeNull();
    expect(parseGuestMessage(null)).toBeNull();
  });
});

describe("parseHostMessage", () => {
  it("accepts a welcome, dropping invalid avatars", () => {
    const grid = createEmptyGrid();
    expect(
      parseHostMessage({ kind: "welcome", grid, avatars: { a: AVATAR, b: { nope: true } } }),
    ).toEqual({ kind: "welcome", grid, avatars: { a: AVATAR } });
  });

  it("rejects a welcome with a malformed grid", () => {
    expect(parseHostMessage({ kind: "welcome", grid: [], avatars: {} })).toBeNull();
  });

  it("accepts relayed avatars and departures", () => {
    expect(parseHostMessage({ kind: "avatar", id: "g1", avatar: AVATAR })).toEqual({
      kind: "avatar",
      id: "g1",
      avatar: AVATAR,
    });
    expect(parseHostMessage({ kind: "avatar", avatar: AVATAR })).toBeNull();
    expect(parseHostMessage({ kind: "left", id: "g1" })).toEqual({ kind: "left", id: "g1" });
  });
});

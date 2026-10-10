import { describe, expect, it } from "vitest";
import { apply } from "../engine/step-loop";
import { ENGINE } from "../game";
import { at, inHaunt, testGame } from "../testing";
import type { GameState } from "../types";
import { lookahead, type Lookahead, type Reach } from "./lookahead";

const ahead = (state: GameState, seat = 0): Lookahead => {
  const found = lookahead(ENGINE, state, seat);
  if (!found) throw new Error("The turn wasn't looked ahead");
  return found;
};
const rooms = (reach: Reach) => reach.route.map((place) => place.room);
const moveTo = (found: Lookahead, room: string): Reach => {
  const reach = found.reaches.find((r) => r.end.kind === "move" && r.end.place.room === room);
  if (!reach) throw new Error(`${room} is out of reach`);
  return reach;
};
const ruleRooms = (reach: Reach) => reach.warnings.flatMap((w) => (w.rule.source === "room" ? [w.rule.room] : []));

/** Applies a route's actions, each to the decision it names. */
function walk(state: GameState, reach: Reach): GameState {
  return reach.actions.reduce((now, action) => {
    const result = apply(ENGINE, now, action);
    if (!result.ok) throw new Error(result.reason);
    return result.state;
  }, state);
}

describe("the lookahead", () => {
  it("reaches every room within the move, each by its cheapest route, up the stairs too", () => {
    const state = testGame();
    const found = ahead(state);
    expect(found.left).toBe(4);
    expect(rooms(moveTo(found, "upper-landing"))).toEqual(["entrance-hall", "foyer", "grand-staircase", "upper-landing"]);
    expect(moveTo(found, "upper-landing").spaces).toBe(3);
    // Where the turn stands is never a place to go.
    expect(found.reaches.some((r) => r.end.kind === "move" && r.end.place.room === "entrance-hall")).toBe(false);
    // Walking a route puts the explorer at its end, having spent its spaces.
    const after = walk(state, moveTo(found, "upper-landing"));
    expect(at(after, 0).room).toBe("upper-landing");
    expect(after.turn?.moved["zoe-ingstrom"]).toBe(3);
  });

  it("offers the unexplored doorways of every room it reaches, warning that a discovery may end the move", () => {
    const found = ahead(testGame());
    const far = found.reaches.find((r) => r.end.kind === "discover" && r.end.room === "upper-landing");
    expect(far?.actions).toHaveLength(4);
    expect(far?.warnings.map((w) => w.event)).toEqual(["card-drawn", "movement-ended"]);
  });

  it("ends a route at a room's roll to leave, warns of it, and never looks past the roll", () => {
    // The Junk Room takes a Might roll to leave.
    const state = testGame({ rooms: ["junk-room"], explorers: [{ seat: 0, room: "junk-room" }] });
    const found = ahead(state);
    const moves = found.reaches.filter((r) => r.end.kind === "move");
    expect(moves.length).toBeGreaterThan(0);
    for (const reach of moves) {
      expect(reach.actions).toHaveLength(1);
      expect(ruleRooms(reach)).toContain("junk-room");
    }
  });

  it("warns a route into a room with a roll to leave of it", () => {
    const found = ahead(testGame({ rooms: ["junk-room"], explorers: [{ seat: 0, room: "foyer" }] }));
    expect(ruleRooms(moveTo(found, "junk-room"))).toContain("junk-room");
  });

  it("never gives a roll away: what it finds doesn't depend on the dice", () => {
    const state = testGame({ rooms: ["junk-room", "graveyard", "mystic-elevator"], explorers: [{ seat: 0, room: "junk-room" }] });
    const reseeded = { ...state, seed: "another-seed" };
    const strip = (found: Lookahead) => found.reaches.map(({ actions, ...rest }) => ({ ...rest, actions: actions.length }));
    expect(strip(ahead(reseeded))).toEqual(strip(ahead(state)));
  });

  it("after the haunt, warns of opponents slowing the way out and counts the spaces they cost", () => {
    const state = inHaunt(testGame({ explorers: [{ seat: 0, room: "foyer" }, { seat: 1, room: "foyer" }] }), 1);
    const found = ahead(state);
    const hall = moveTo(found, "entrance-hall");
    expect(hall.spaces).toBe(2);
    expect(hall.warnings.some((w) => w.rule.source === "rulebook" && w.event === "slowed")).toBe(true);
  });

  it("is worked out once per state, and only for the seat whose turn it is", () => {
    const state = testGame();
    expect(lookahead(ENGINE, state, 0)).toBe(lookahead(ENGINE, state, 0));
    expect(lookahead(ENGINE, state, 1)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { placed, roomAt } from "../../engine/board";
import { describeEvent } from "../../engine/describe";
import { drawCard } from "../../engine/effects";
import { start } from "../../engine/step-loop";
import { ENGINE } from "../../game";
import {
  choose,
  eventTypes,
  offered,
  pendingDecision,
  testGame,
  waitingOn,
} from "../../testing";
import type { GameState } from "../../types";

// Cards and rooms that change the house itself: tiles put in the house by a
// card, rooms that move, and a token on a wall. Each test comes from the
// card's content/cards/events.md entry or the room's content/rooms.md and
// content/rules.md entries, not from the implementation.

const SEEDS = Array.from({ length: 300 }, (_, i) => `seed-${i}`);

type Rolled = { seat: number; dice: number[]; result: number };

function rolls(state: GameState): Rolled[] {
  return state.lastEvents
    .filter((e) => e.type === "rolled")
    .map((e) => e.data as Rolled);
}

const labels = (state: GameState) => offered(state).map((c) => c.label);

const kind = (state: GameState) =>
  state.pending?.type === "decision" ? pendingDecision(state).kind : null;

/** Every event of the latest write reads as plain language. */
function described(state: GameState): string[] {
  return state.lastEvents.flatMap((e) => {
    const line = describeEvent(ENGINE, state, e);
    return line === null ? [] : [line];
  });
}

/** Answers every damage split, taking whatever split is offered first. */
function takeDamage(state: GameState): GameState {
  let next = state;
  while (kind(next) === "split-damage") next = choose(next, "Take");
  return next;
}

/** Zoe explores north from the Entrance Hall into the Ballroom, which has an
 *  event symbol, and draws this event. Tiles in `stack` follow the Ballroom. */
function drawEvent(
  event: string,
  options: {
    seed?: string;
    stack?: string[];
    decks?: Partial<Record<"item" | "omen", string[]>>;
    events?: string[];
    setUp?: (state: GameState) => void;
  } = {},
): GameState {
  const state = testGame({
    seed: options.seed,
    stack: ["ballroom", ...(options.stack ?? [])],
    decks: { event: [event, ...(options.events ?? [])], ...options.decks },
  });
  options.setUp?.(state);
  return choose(state, "Explore through the north door");
}

/** Has seat 0 draw an event where they stand, outside the turn's own flow. */
function drawHere(state: GameState, event: string): GameState {
  state.decks.event.draw = [
    event,
    ...state.decks.event.draw.filter((c) => c !== event),
  ];
  return start(ENGINE, { ...state, pending: null }, [
    drawCard(0, "event", { source: "rulebook", page: 10 }),
  ]);
}

/** The first seed whose game, played by `play`, passes `found`. */
function findSeed(
  play: (seed: string) => GameState,
  found: (state: GameState) => boolean,
): GameState {
  for (const seed of SEEDS) {
    const state = play(seed);
    if (found(state)) return state;
  }
  throw new Error("No seed gives that outcome");
}

const roomOf = (state: GameState, seat = 0) => state.explorers[seat].room;
const floorOf = (state: GameState, room: string) =>
  placed(state.board, room)?.floor;

const BASEMENT_TILES = Object.values(ENGINE.catalog.rooms)
  .filter((r) => r.floors.includes("basement") && r.start === null)
  .map((r) => r.id);

describe("The Walls", () => {
  it("puts the next room tile in the house on a floor its back allows, puts you in it, and draws its card", () => {
    // The Larder goes only in the basement and has an item symbol.
    let state = drawEvent("the-walls", {
      stack: ["larder"],
      decks: { item: ["axe"] },
    });
    expect(kind(state)).toBe("place-tile");
    expect(labels(state).every((l) => l.includes("on the basement"))).toBe(
      true,
    );
    state = choose(state, "Put the Larder");
    expect(floorOf(state, "larder")).toBe("basement");
    expect(roomOf(state)).toBe("larder");
    expect(state.explorers[0].cards).toContain("axe");
    expect(eventTypes(state)).toContain("discovered");
    // Being put there spends no movement: only the exploration into the Ballroom counted.
    expect(state.turn?.moved).toBe(1);
    expect(described(state).join(" ")).toContain("Larder is put in the house");
  });

  it("skips a tile that can't go anywhere, as when exploring", () => {
    // With the basement full, the Crypt (basement only) can go nowhere and is discarded.
    const state = drawEvent("the-walls", {
      stack: ["crypt", "kitchen"],
      setUp: (s) => {
        // One-door rooms close every Basement Landing door.
        const closers = [
          { tile: "storeroom", x: 0, y: -1, rotation: 2 },
          { tile: "pentagram-chamber", x: 1, y: 0, rotation: 2 },
          { tile: "stairs-from-basement", x: 0, y: 1, rotation: 2 },
          { tile: "vault", x: -1, y: 0, rotation: 1 },
        ] as const;
        for (const c of closers)
          s.board.tiles.push({ ...c, floor: "basement" });
        s.board.stack = s.board.stack.filter(
          (t) => !closers.some((c) => c.tile === t),
        );
      },
    });
    expect(state.board.discards).toContain("crypt");
    expect(labels(state).every((l) => l.includes("on the ground floor"))).toBe(
      true,
    );
  });
});

describe("The Lost One", () => {
  const play = (seed: string, setUp?: (s: GameState) => void) =>
    drawEvent("the-lost-one", {
      seed,
      events: ["the-voice"],
      decks: { omen: ["book"], item: ["axe"] },
      setUp: (s) => {
        s.explorers[0].clips.knowledge = 2;
        setUp?.(s);
      },
    });
  const led = (state: GameState) => rolls(state).at(1)?.result;

  it("on 5+ gains 1 Knowledge and nothing else happens", () => {
    const state = findSeed(play, (s) => rolls(s)[0].result >= 5);
    expect(state.explorers[0].clips.knowledge).toBe(3);
    expect(roomOf(state)).toBe("ballroom");
  });

  it("otherwise rolls 3 dice: 4-5 puts you in the Upper Landing", () => {
    const state = findSeed(play, (s) => [4, 5].includes(led(s) ?? -1));
    expect(rolls(state)[1].dice).toHaveLength(3);
    expect(roomOf(state)).toBe("upper-landing");
  });

  it("on 2-3 draws until an upper floor room, puts it in the house and you in it", () => {
    let state = findSeed(play, (s) => [2, 3].includes(led(s) ?? -1));
    expect(kind(state)).toBe("place-tile");
    expect(labels(state).every((l) => l.includes("on the upper floor"))).toBe(
      true,
    );
    state = choose(state, "Put the");
    expect(floorOf(state, roomOf(state))).toBe("upper");
    expect(eventTypes(state)).toContain("discovered");
  });

  it("on 0-1 draws until a basement room", () => {
    let state = findSeed(play, (s) => [0, 1].includes(led(s) ?? -1));
    if (kind(state) === "place-tile") state = choose(state, "Put the");
    expect(floorOf(state, roomOf(state))).toBe("basement");
  });

  it("goes to the Entrance Hall when one pass through the stack finds no room for the floor", () => {
    const state = findSeed(
      (seed) =>
        play(seed, (s) => {
          // Every basement tile is in the discard pile, which the card doesn't reshuffle.
          s.board.discards = BASEMENT_TILES;
          s.board.stack = s.board.stack.filter(
            (t) => !BASEMENT_TILES.includes(t),
          );
        }),
      (s) => [0, 1].includes(led(s) ?? -1),
    );
    expect(roomOf(state)).toBe("entrance-hall");
    expect(state.board.stack).toEqual([]);
    expect(eventTypes(state)).toContain("room-not-found");
  });
});

describe("The Beckoning", () => {
  /** Ox stands in the Gardens; Zoe draws the card in the Ballroom, which has no window. */
  const play = (seed: string) =>
    drawEvent("the-beckoning", {
      seed,
      events: ["night-view"],
      setUp: (s) => {
        s.board.tiles.push({
          tile: "gardens",
          floor: "ground",
          x: 9,
          y: 9,
          rotation: 0,
        });
        s.explorers[1].room = "gardens";
      },
    });

  it("makes only explorers outdoors or by an outside-facing window roll Sanity", () => {
    const state = play("test-seed");
    expect(rolls(state)[0].seat).toBe(1);
  });

  it("on 0-2 puts the Patio in the house from the room stack, and you jump to it for 1 die of physical damage", () => {
    let state = findSeed(play, (s) => rolls(s)[0].result <= 2);
    expect(kind(state)).toBe("place-tile");
    expect(waitingOn(state)).toBe(1);
    expect(labels(state).every((l) => l.includes("on the ground floor"))).toBe(
      true,
    );
    expect(state.board.stack).not.toContain("patio");
    state = choose(state, "Put the Patio");
    expect(roomOf(state, 1)).toBe("patio");
    // The damage comes from the jump, as Ox lands.
    expect(rolls(state).some((r) => r.seat === 1 && r.dice.length === 1)).toBe(
      true,
    );
    state = takeDamage(state);
    // The Patio's event symbol: discovering it draws Night View for Ox.
    expect(state.decks.event.discard).toContain("night-view");
  });

  it("on 0-2 jumps straight to a Patio already in the house", () => {
    const withPatio = findSeed(
      (seed) =>
        drawEvent("the-beckoning", {
          seed,
          setUp: (s) => {
            s.board.tiles.push(
              { tile: "gardens", floor: "ground", x: 9, y: 9, rotation: 0 },
              { tile: "patio", floor: "ground", x: 2, y: 1, rotation: 0 },
            );
            s.board.stack = s.board.stack.filter((t) => t !== "patio");
            s.explorers[1].room = "gardens";
          },
        }),
      (s) => rolls(s)[0].result <= 2,
    );
    expect(roomOf(withPatio, 1)).toBe("patio");
    expect(eventTypes(withPatio)).not.toContain("room-placed");
  });

  it("takes the damage from the jump only: an explorer the Graveyard keeps takes none", () => {
    // Ox, in the Graveyard, fails both the card's Sanity roll and the Graveyard's roll to leave.
    const kept = findSeed(
      (seed) =>
        drawEvent("the-beckoning", {
          seed,
          setUp: (s) => {
            s.board.tiles.push(
              { tile: "graveyard", floor: "ground", x: 9, y: 9, rotation: 0 },
              { tile: "patio", floor: "ground", x: 2, y: 1, rotation: 0 },
            );
            s.board.stack = s.board.stack.filter(
              (t) => t !== "patio" && t !== "graveyard",
            );
            s.explorers[1].room = "graveyard";
          },
        }),
      (s) =>
        rolls(s)[0].result <= 2 && labels(s).includes("Stay in the Graveyard"),
    );
    const state = choose(kept, "Stay in the Graveyard");
    expect(roomOf(state, 1)).toBe("graveyard");
    expect(kind(state)).not.toBe("split-damage");
    expect(rolls(state)).toEqual([]);
    expect(state.explorers[1].clips).toEqual(kept.explorers[1].clips);
  });
});

describe("Mystic Slide", () => {
  const play = (seed: string) =>
    drawEvent("mystic-slide", {
      seed,
      stack: ["larder"],
      decks: { item: ["axe"] },
    });

  it("puts the Slide token in your room and has you make a Might roll", () => {
    const state = play("test-seed");
    expect(state.tokens).toContainEqual({ token: "slide", room: "ballroom" });
    expect(rolls(state)[0].dice).toHaveLength(
      ENGINE.catalog.characters["zoe-ingstrom"].tracks.might[
        state.explorers[0].clips.might
      ],
    );
  });

  it("on 5+ puts you in an explored room you choose on a floor below", () => {
    const state = findSeed(play, (s) => rolls(s)[0].result >= 5);
    // Only the Basement Landing lies below the ground floor, so the choice is forced.
    expect(roomOf(state)).toBe("basement-landing");
  });

  it("on 0-4 draws until a basement room, places it, and you fall to it for 1 die of physical damage, drawing its card on your turn", () => {
    let state = findSeed(play, (s) => rolls(s)[0].result <= 4);
    expect(labels(state).every((l) => l.includes("on the basement"))).toBe(
      true,
    );
    state = choose(state, "Put the Larder");
    expect(roomOf(state)).toBe("larder");
    expect(rolls(state).some((r) => r.dice.length === 1)).toBe(true);
    state = takeDamage(state);
    expect(state.explorers[0].cards).toContain("axe");
  });

  it("on 0-4 with no basement tile left, you choose a basement room in play", () => {
    const state = findSeed(
      (seed) =>
        drawEvent("mystic-slide", {
          seed,
          setUp: (s) => {
            s.board.stack = s.board.stack.filter(
              (t) => !BASEMENT_TILES.includes(t),
            );
          },
        }),
      (s) => rolls(s)[0].result <= 4,
    );
    expect(roomOf(state)).toBe("basement-landing");
  });

  it("passes to the next explorer to your left not in the basement, who draws no card for a new room off their turn", () => {
    const base = testGame({ stack: ["larder"], decks: { item: ["axe"] } });
    base.explorers[0].room = "basement-landing";
    const state = findSeed(
      (seed) => drawHere({ ...structuredClone(base), seed }, "mystic-slide"),
      (s) => rolls(s)[0].result <= 4,
    );
    expect(state.tokens).toContainEqual({
      token: "slide",
      room: "entrance-hall",
    });
    expect(rolls(state)[0].seat).toBe(1);
    const fallen = choose(state, "Put the Larder");
    expect(roomOf(fallen, 1)).toBe("larder");
    expect(fallen.explorers[1].cards).toEqual([]);
  });

  /** Zoe stands in the Attic, where a Slide lies, with no basement tile left to draw. */
  function inTheAttic(seed: string): GameState {
    const state = testGame({ seed });
    state.board.tiles.push({
      tile: "attic",
      floor: "upper",
      x: 9,
      y: 9,
      rotation: 0,
    });
    state.board.stack = state.board.stack.filter(
      (t) => t !== "attic" && !BASEMENT_TILES.includes(t),
    );
    state.explorers[0].room = "attic";
    state.tokens.push({ token: "slide", room: "attic" });
    return choose(state, "Use the Slide");
  }

  it("takes the fall's damage only on landing: an explorer the Attic keeps takes none", () => {
    // The Might roll fails, so Zoe falls; the Attic's Speed roll to leave fails too.
    const kept = findSeed(
      inTheAttic,
      (s) => rolls(s)[0].result <= 4 && labels(s).includes("Stay in the Attic"),
    );
    const state = choose(kept, "Stay in the Attic");
    expect(roomOf(state)).toBe("attic");
    expect(kind(state)).toBe("turn");
    expect(state.explorers[0].clips).toEqual(kept.explorers[0].clips);
  });

  it("is the same roll each time, so it can be tried only once a turn", () => {
    const kept = findSeed(
      inTheAttic,
      (s) => rolls(s)[0].result <= 4 && labels(s).includes("Stay in the Attic"),
    );
    const state = choose(kept, "Stay in the Attic");
    expect(labels(state)).not.toContain("Use the Slide (Might roll)");
  });

  it("is discarded when every explorer is in the basement", () => {
    const base = testGame();
    for (const e of base.explorers) e.room = "basement-landing";
    const state = drawHere(base, "mystic-slide");
    expect(state.tokens).toEqual([]);
    expect(state.decks.event.discard).toContain("mystic-slide");
  });

  it("lets any explorer in the Slide's room make the same roll on a later turn", () => {
    let state = findSeed(play, (s) => rolls(s)[0].result >= 5);
    // The card ended Zoe's movement, so her turn has ended on its own.
    expect(roomOf(state)).toBe("basement-landing");
    // Sent on by the Ballroom's own card, she never enters the Ballroom.
    expect(
      state.lastEvents.some(
        (e) =>
          e.type === "entered" &&
          (e.data as { room: string }).room === "ballroom",
      ),
    ).toBe(false);
    const seat = state.turn?.seat ?? -1;
    state.explorers[seat].room = "ballroom";
    expect(labels(state)).toContain("Use the Slide (Might roll)");
    state = choose(state, "Use the Slide");
    expect(rolls(state)[0].seat).toBe(seat);
  });
});

describe("Revolving Wall", () => {
  const play = (seed = "test-seed") =>
    drawEvent("revolving-wall", {
      seed,
      stack: ["dusty-hallway"],
      setUp: (s) => (s.explorers[0].clips.knowledge = 7),
    });

  it("offers walls with no exit, or corners: the Ballroom has a door on every wall", () => {
    expect(labels(play()).sort()).toEqual([
      "Put the Wall Switch on the north-east corner of the Ballroom",
      "Put the Wall Switch on the north-west corner of the Ballroom",
      "Put the Wall Switch on the south-east corner of the Ballroom",
      "Put the Wall Switch on the south-west corner of the Ballroom",
    ]);
  });

  it("puts you in the room already on the other side", () => {
    // South-west of the Ballroom (north of the Entrance Hall) is the Foyer.
    const state = choose(play(), "south-west corner");
    expect(roomOf(state)).toBe("foyer");
    expect(state.tokens).toContainEqual({
      token: "wall-switch",
      room: "ballroom",
      wall: ["bottom", "left"],
    });
    expect(described(state).join(" ")).toContain(
      "Wall Switch token is placed on a corner of the Ballroom",
    );
  });

  it("with no room on the other side, draws one for this floor, puts it there and you in it", () => {
    // A four-door hallway fits any way round, so its placement is forced.
    const state = choose(play(), "north-east corner");
    const ballroom = placed(state.board, "ballroom");
    expect(
      roomAt(
        state.board,
        "ground",
        (ballroom?.x ?? 0) + 1,
        (ballroom?.y ?? 0) - 1,
      )?.tile,
    ).toBe("dusty-hallway");
    expect(roomOf(state)).toBe("dusty-hallway");
  });

  it("lets an explorer in either room try a Knowledge roll of 3+ once a turn to go through", () => {
    let state = choose(play(), "south-west corner");
    state = choose(state, "End your turn");
    // Ox, in the Entrance Hall, moves to the Foyer, beside the switch.
    state = choose(state, "Move to the Foyer");
    state.explorers[1].clips.knowledge = 7;
    const used = findSeed(
      (seed) => choose({ ...state, seed }, "Use the Wall Switch"),
      (s) => rolls(s)[0].result >= 3,
    );
    expect(roomOf(used, 1)).toBe("ballroom");
    // The same roll once a turn: from the Ballroom side it isn't offered again.
    expect(labels(used)).not.toContain("Use the Wall Switch (Knowledge roll)");
    const failed = findSeed(
      (seed) => choose({ ...state, seed }, "Use the Wall Switch"),
      (s) => rolls(s)[0].result <= 2,
    );
    expect(roomOf(failed, 1)).toBe("foyer");
  });

  it("is discarded, with no move, when no room is left for this floor", () => {
    const state = drawEvent("revolving-wall", {
      setUp: (s) => {
        // Everything left to draw is basement-only, and the Foyer side is taken by
        // nothing else: only the south-west corner, onto the Foyer, is usable.
        s.board.stack = s.board.stack.filter(
          (t) =>
            t === "ballroom" ||
            !ENGINE.catalog.rooms[t].floors.includes("ground"),
        );
        s.board.discards = [];
      },
    });
    expect(roomOf(state)).toBe("foyer");
  });
});

describe("What The . . . ?", () => {
  it("moves the room you are in elsewhere on the floor, against a different open doorway, with everything in it", () => {
    let state = drawEvent("what-the", {
      setUp: (s) => (s.piles.ballroom = ["axe"]),
    });
    const before = placed(state.board, "ballroom");
    expect(kind(state)).toBe("place-tile");
    expect(labels(state).every((l) => l.includes("on the ground floor"))).toBe(
      true,
    );
    state = choose(state, "Put the Ballroom");
    const after = placed(state.board, "ballroom");
    expect(after?.floor).toBe("ground");
    expect([after?.x, after?.y]).not.toEqual([before?.x, before?.y]);
    expect(roomOf(state)).toBe("ballroom");
    expect(state.piles.ballroom).toEqual(["axe"]);
    expect(eventTypes(state)).not.toContain("left");
    expect(eventTypes(state)).toContain("room-moved");
  });

  it("leaves a starting tile where it is", () => {
    const state = drawHere(testGame(), "what-the");
    expect(placed(state.board, "entrance-hall")).toMatchObject({ x: 2, y: 0 });
    expect(eventTypes(state)).toContain("room-stayed");
  });

  it("moves the room to another floor when its own has no other open doorway", () => {
    const state = testGame();
    // One-door rooms fill every ground floor doorway; Zoe is in the Chapel,
    // against the Entrance Hall's north door, the only doorway it would leave.
    const rooms = [
      { tile: "chapel", x: 2, y: -1, rotation: 2 },
      { tile: "bathroom", x: 1, y: -1, rotation: 0 },
      { tile: "conservatory", x: 1, y: 1, rotation: 0 },
      { tile: "coal-chute", x: 3, y: 0, rotation: 3 },
      { tile: "graveyard", x: 2, y: 1, rotation: 2 },
    ] as const;
    for (const r of rooms) state.board.tiles.push({ ...r, floor: "ground" });
    state.explorers[0].room = "chapel";
    const moved = drawHere(state, "what-the");
    expect(kind(moved)).toBe("place-tile");
    expect(labels(moved).every((l) => l.includes("on the upper floor"))).toBe(
      true,
    );
  });
});

describe("Collapsed Room", () => {
  const play = (seed: string, stack = ["collapsed-room", "larder"]) => {
    const state = testGame({ seed, stack, decks: { item: ["axe"] } });
    return choose(state, "Explore through the north door");
  };

  it("makes its discoverer roll Speed: 5+ avoids falling", () => {
    const state = findSeed(play, (s) => rolls(s)[0]?.result >= 5);
    expect(roomOf(state)).toBe("collapsed-room");
  });

  it("on a failed roll draws a basement tile, places it, marks it, and you fall into it for 1 die of physical damage", () => {
    let state = findSeed(play, (s) => rolls(s)[0]?.result < 5);
    expect(labels(state).every((l) => l.includes("on the basement"))).toBe(
      true,
    );
    state = choose(state, "Put the Larder");
    expect(roomOf(state)).toBe("larder");
    expect(state.tokens).toContainEqual({
      token: "below-collapsed-room",
      room: "larder",
    });
    expect(rolls(state).some((r) => r.dice.length === 1)).toBe(true);
    state = takeDamage(state);
    expect(state.explorers[0].cards).toContain("axe");
    // Falling spends no movement: only the exploration counted.
    expect(state.turn?.moved).toBe(1);
  });

  it("marks the room the faller lands in, even when its card sends them on", () => {
    // The Crypt's event is The Walls, which puts Zoe in the next tile drawn.
    let state = findSeed(
      (seed) => {
        const s = testGame({
          seed,
          stack: ["collapsed-room", "crypt", "game-room"],
          decks: { event: ["the-walls"] },
        });
        return choose(s, "Explore through the north door");
      },
      (s) => rolls(s)[0]?.result < 5,
    );
    state = takeDamage(choose(state, "Put the Crypt"));
    while (kind(state) === "place-tile") state = choose(state, "Put the");
    expect(roomOf(state)).toBe("game-room");
    expect(state.tokens).toContainEqual({
      token: "below-collapsed-room",
      room: "crypt",
    });
  });

  it("lets a later explorer fall on purpose, to the marked room, without a new tile", () => {
    let state = findSeed(play, (s) => rolls(s)[0]?.result < 5);
    state = takeDamage(choose(state, "Put the Larder"));
    state = choose(state, "End your turn");
    state.explorers[1].room = "collapsed-room";
    expect(labels(state)).toContain(
      "Fall to the basement (1 die of physical damage)",
    );
    const tiles = state.board.tiles.length;
    state = choose(state, "Fall to the basement");
    expect(roomOf(state, 1)).toBe("larder");
    expect(state.board.tiles).toHaveLength(tiles);
  });

  it("with every basement tile placed, lets the faller choose a basement room in play", () => {
    const state = findSeed(
      (seed) => {
        const s = testGame({ seed, stack: ["collapsed-room"] });
        s.board.stack = s.board.stack.filter(
          (t) => !BASEMENT_TILES.includes(t),
        );
        return choose(s, "Explore through the north door");
      },
      (s) => rolls(s)[0]?.result < 5,
    );
    expect(roomOf(state)).toBe("basement-landing");
    expect(state.tokens).toContainEqual({
      token: "below-collapsed-room",
      room: "basement-landing",
    });
  });

  it("makes no one but the discoverer roll on entering", () => {
    let state = findSeed(play, (s) => rolls(s)[0]?.result >= 5);
    state = choose(state, "End your turn");
    state = choose(state, "Move to the Foyer");
    state.explorers[1].room = "entrance-hall";
    state = choose(state, "Move to the Collapsed Room");
    expect(rolls(state)).toEqual([]);
  });
});

describe("Mystic Elevator", () => {
  const play = (seed: string) =>
    choose(
      testGame({ seed, stack: ["mystic-elevator"] }),
      "Explore through the north door",
    );
  const result = (s: GameState) => rolls(s)[0]?.result;

  it("rolls 2 dice as soon as you enter it", () => {
    const state = play("test-seed");
    expect(rolls(state)[0].dice).toHaveLength(2);
  });

  it("on 1 moves next to an open door in the basement, with you in it", () => {
    let state = findSeed(play, (s) => result(s) === 1);
    expect(labels(state).every((l) => l.includes("on the basement"))).toBe(
      true,
    );
    state = choose(state, "Put the Mystic Elevator");
    expect(floorOf(state, "mystic-elevator")).toBe("basement");
    expect(roomOf(state)).toBe("mystic-elevator");
    expect(described(state).join(" ")).toContain("moves to the basement");
  });

  it("on 2, its own floor, may stay or move to a different open door", () => {
    const state = findSeed(play, (s) => result(s) === 2);
    expect(labels(state)).toContain("Leave the Mystic Elevator where it is");
    const stayed = choose(state, "Leave the Mystic Elevator where it is");
    expect(placed(stayed.board, "mystic-elevator")).toMatchObject({
      x: 2,
      y: -1,
    });
  });

  it("on 4 lets you choose the floor", () => {
    const state = findSeed(play, (s) => result(s) === 4);
    expect(labels(state)).toEqual([
      "Send the elevator to the upper floor",
      "Send the elevator to the ground floor",
      "Send the elevator to the basement",
    ]);
  });

  it("on 0 goes to the basement, then everyone in it takes 1 die of physical damage", () => {
    let state = findSeed(play, (s) => result(s) === 0);
    state.explorers[1].room = "mystic-elevator";
    state = choose(state, "Put the Mystic Elevator");
    const damageRolls = rolls(state).filter((r) => r.dice.length === 1);
    expect(damageRolls.map((r) => r.seat)).toContain(0);
    expect(roomOf(state, 1)).toBe("mystic-elevator");
  });

  it("works once a turn, and rolls again at the end of a turn spent in it without moving", () => {
    let state = findSeed(play, (s) => result(s) === 2);
    state = choose(state, "Leave the Mystic Elevator where it is");
    // Ending this turn in it: it was used this turn already.
    state = choose(state, "End your turn");
    expect(rolls(state)).toEqual([]);
    state = choose(choose(state, "End your turn"), "End your turn");
    // Zoe's next turn, spent in the elevator without moving: it rolls at the end.
    state = choose(state, "End your turn");
    expect(rolls(state)[0]?.seat).toBe(0);
  });
});

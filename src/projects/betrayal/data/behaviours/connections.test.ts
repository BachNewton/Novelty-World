import { describe, expect, it } from "vitest";
import { turn } from "../../engine/board";
import { describeEvent } from "../../engine/describe";
import { gainCard, loseCard, relocate } from "../../engine/effects";
import { askSet } from "../../engine/questions";
import { start } from "../../engine/step-loop";
import { ENGINE } from "../../game";
import {
  at,
  choose,
  eventTypes,
  explorer,
  offered,
  pendingDecision,
  put,
  testGame,
  spectator,
} from "../../testing";
import type { GameState, PlacedTile, RuleRef } from "../../types";

// Connections, barriers and movement: cards that link rooms or block sight,
// the barrier rooms, the Vault, the Gallery and the Dog. Each test comes from
// the entry in content/cards/ or content/rooms.md and content/rules.md, not
// from the implementation.

const ZOE = "zoe-ingstrom";
const OX = "ox-bellows";

const SEEDS = Array.from({ length: 300 }, (_, i) => `seed-${i}`);
const RULE: RuleRef = { source: "rulebook", page: 6 };

type Rolled = { figure: string; result: number };

const rolls = (state: GameState): Rolled[] =>
  state.lastEvents
    .filter((e) => e.type === "rolled")
    .map((e) => e.data as Rolled);

const labels = (state: GameState) => offered(state).map((c) => c.label);

const kind = (state: GameState) =>
  state.pending?.type === "decision" ? pendingDecision(state).kind : null;

function described(state: GameState): string {
  return state.lastEvents
    .map((e) => describeEvent(ENGINE, spectator(state, ENGINE), e))
    .filter((line) => line !== null)
    .join(" ");
}

function takeDamage(state: GameState): GameState {
  let next = state;
  while (kind(next) === "split-damage") next = choose(next, "Take");
  return next;
}

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

/** Lays tiles out by hand, taking them out of the room stack. */
function lay(state: GameState, tiles: PlacedTile[]): void {
  state.board.tiles.push(...tiles);
  state.board.stack = state.board.stack.filter(
    (t) => !tiles.some((tile) => tile.tile === t),
  );
}

/** Runs effects in the middle of seat 0's turn, outside the turn's own flow. */
const run = (state: GameState, ...steps: Parameters<typeof start>[2]) =>
  start(ENGINE, { ...state, pending: null }, steps);

const roomOf = (state: GameState, seat = 0) => at(state, seat).room;
const explorerMoves = (state: GameState, seat = 0) =>
  askSet(ENGINE, state, "connections", {
    mover: { kind: "figure", figure: explorer(state, seat).id },
    from: at(state, seat),
  }).map((p) => p.room);

describe("Barrier rooms: the Chasm (rooms.md, rules.md p. 7)", () => {
  /** The Chasm east of the Basement Landing, the Furnace Room beyond it, and
   *  Zoe on the Landing. */
  function nextToChasm(seed?: string): GameState {
    const state = testGame({ seed });
    lay(state, [
      { tile: "chasm", floor: "basement", x: 1, y: 0, rotation: 0 },
      { tile: "furnace-room", floor: "basement", x: 2, y: 0, rotation: 0 },
    ]);
    put(state, 0, "basement-landing");
    return state;
  }
  const intoChasm = (seed?: string) =>
    choose(nextToChasm(seed), "Move to the Chasm");

  it("puts an explorer who moves in through a door on that door's side, and leads on only through that side's door", () => {
    const state = intoChasm();
    expect(labels(nextToChasm())).toContain(
      "Move to the Chasm, on its west side",
    );
    expect(at(state, 0).side).toBe("left");
    expect(explorerMoves(state)).toEqual(["basement-landing"]);
    expect(labels(state)).toContain("Try to cross (Speed roll of 3+)");
  });

  it("crosses on a Speed roll of 3+, spending no movement, and then leads on through the far door", () => {
    const state = findSeed(
      (seed) => choose(intoChasm(seed), "Try to cross"),
      (s) => rolls(s)[0].result >= 3,
    );
    expect(at(state, 0).side).toBe("right");
    expect(state.turn?.moved).toEqual({ [ZOE]: 1 });
    expect(explorerMoves(state)).toEqual(["furnace-room"]);
    expect(described(state)).toContain("Zoe Ingstrom crosses the Chasm");
  });

  it("ends movement on a failed roll, and allows one try a turn", () => {
    const state = findSeed(
      (seed) => choose(intoChasm(seed), "Try to cross"),
      (s) => rolls(s)[0].result < 3,
    );
    expect(at(state, 0).side).toBe("left");
    // Without movement, and with the roll tried, ending the turn is all
    // that's left, and it is still the player's to take.
    expect(eventTypes(state)).toContain("movement-ended");
    expect(labels(state)).toEqual(["End your turn"]);
  });

  it("discovering it puts the explorer on the side of the door they came through", () => {
    const state = testGame({ stack: ["chasm"] });
    put(state, 0, "basement-landing");
    const after = choose(state, "Explore through the east door");
    const tile = after.board.tiles.find((t) => t.tile === "chasm");
    const side = at(after, 0).side;
    expect(tile && side && turn(side, tile.rotation)).toBe("left");
  });

  it("has an explorer put in it by a card choose their side", () => {
    let state = run(nextToChasm(), relocate(ZOE, "chasm", RULE));
    expect(labels(state)).toEqual([
      "Land on the west side of the Chasm",
      "Land on the east side of the Chasm",
    ]);
    state = choose(state, "east side");
    expect(roomOf(state)).toBe("chasm");
    expect(at(state, 0).side).toBe("right");
  });

  it("keeps explorers on opposite sides from trading", () => {
    const state = nextToChasm();
    explorer(state, 0).cards = ["axe"];
    put(state, 0, "chasm", "left");
    put(state, 1, "chasm", "right");
    expect(labels(state).some((l) => l.includes("Ox Bellows"))).toBe(false);
    put(state, 1, at(state, 1).room, "left");
    expect(labels(state)).toContain("Give Ox Bellows your Axe");
  });
});

describe("Vault (rooms.md)", () => {
  /** Zoe, with the most Knowledge, explores north from the Basement Landing into the Vault. */
  function discover(seed?: string): GameState {
    const state = testGame({
      seed,
      stack: ["vault"],
      decks: { event: ["creepy-crawlies"], item: ["axe", "revolver"] },
    });
    put(state, 0, "basement-landing");
    explorer(state, 0).traits.clips.knowledge = 7;
    return choose(state, "Explore through the north door");
  }

  it("draws only the event card when discovered", () => {
    const state = discover();
    expect(roomOf(state)).toBe("vault");
    expect(explorer(state, 0).cards).toEqual([]);
    expect(state.decks.item.draw.slice(0, 2)).toEqual(["axe", "revolver"]);
    expect(labels(state)).toContain(
      "Try to open the Vault (Knowledge roll of 6+)",
    );
  });

  it("on a Knowledge roll of 6+ draws 2 item cards, and the Vault Empty token goes on it", () => {
    const state = findSeed(
      (seed) => choose(discover(seed), "Try to open the Vault"),
      (s) => rolls(s)[0].result >= 6,
    );
    expect(explorer(state, 0).cards).toEqual(["axe", "revolver"]);
    expect(state.tokens).toContainEqual({ token: "vault-empty", room: "vault" });
    expect(labels(state).some((l) => l.includes("open the Vault"))).toBe(false);
  });

  it("can't be tried again the same turn after a failure (p. 12)", () => {
    const state = findSeed(
      (seed) => choose(discover(seed), "Try to open the Vault"),
      (s) => rolls(s)[0].result < 6,
    );
    expect(explorer(state, 0).cards).toEqual([]);
    expect(labels(state).some((l) => l.includes("open the Vault"))).toBe(false);
  });
});

describe("Gallery (rooms.md)", () => {
  const FALL = "Fall down to the Ballroom (1 die of physical damage)";

  function inGallery(withBallroom = true): GameState {
    const state = testGame();
    lay(state, [
      { tile: "gallery", floor: "upper", x: 0, y: -1, rotation: 0 },
      ...(withBallroom
        ? [{ tile: "ballroom", floor: "ground", x: 2, y: -1, rotation: 0 } as const]
        : []),
    ]);
    put(state, 0, "gallery");
    return state;
  }

  it("lets you fall only if the Ballroom is in the house", () => {
    expect(labels(inGallery())).toContain(FALL);
    expect(labels(inGallery(false))).not.toContain(FALL);
  });

  it("costs no movement, and you can keep moving afterwards", () => {
    const state = takeDamage(choose(inGallery(), FALL));
    expect(roomOf(state)).toBe("ballroom");
    expect(state.turn?.moved).toEqual({});
    expect(labels(state)).toContain("Move to the Entrance Hall");
  });

  it("deals the damage as you land in the Ballroom", () => {
    const state = choose(inGallery(), FALL);
    expect(roomOf(state)).toBe("ballroom");
    expect(kind(state)).toBe("split-damage");
  });

  it("can be done with no movement left", () => {
    const state = inGallery();
    if (state.turn) state.turn.moved = { [ZOE]: 4 };
    expect(roomOf(takeDamage(choose(state, FALL)))).toBe("ballroom");
  });
});

describe("Secret Passage (cards/events.md)", () => {
  /** Zoe explores north into the Ballroom and draws the Secret Passage. */
  const draw = (seed: string) =>
    choose(
      testGame({
        seed,
        stack: ["ballroom"],
        decks: { event: ["secret-passage"] },
      }),
      "Explore through the north door",
    );

  it("on 0-1 puts the second token in a basement room; you may go through at once with no movement left", () => {
    let state = findSeed(draw, (s) => rolls(s)[0].result <= 1);
    expect(state.tokens.filter((t) => t.token === "secret-passage")).toEqual([
      {
        token: "secret-passage",
        room: "ballroom",
        link: { room: "basement-landing", side: null },
      },
      {
        token: "secret-passage",
        room: "basement-landing",
        link: { room: "ballroom", side: null },
      },
    ]);
    expect(labels(state)).toEqual([
      "Go through to the Basement Landing",
      "Stay here",
    ]);
    state = choose(state, "Go through");
    expect(roomOf(state)).toBe("basement-landing");
  });

  it("on 2-3 offers only ground floor rooms for the second token", () => {
    const state = findSeed(draw, (s) => [2, 3].includes(rolls(s)[0].result));
    const ground = ["Grand Staircase", "Foyer", "Entrance Hall", "Ballroom"];
    expect(labels(state)).toHaveLength(ground.length);
    for (const room of ground)
      expect(labels(state)).toContain(
        `Put the other Secret Passage token in the ${room}`,
      );
  });

  it("joins the two rooms as one space for any explorer on later turns", () => {
    const state = choose(
      findSeed(draw, (s) => rolls(s)[0].result <= 1),
      "Stay here",
    );
    expect(explorerMoves(state)).toContain("basement-landing");
    put(state, 1, "basement-landing");
    expect(explorerMoves(state, 1)).toContain("ballroom");
  });
});

describe("Secret Stairs (cards/events.md)", () => {
  /** Zoe explores north into the Ballroom, draws the Secret Stairs and puts
   *  the other end in the Basement Landing. */
  const draw = () =>
    choose(
      choose(
        testGame({
          stack: ["ballroom"],
          decks: { event: ["secret-stairs", "creepy-crawlies"] },
        }),
        "Explore through the north door",
      ),
      "in the Basement Landing",
    );

  it("puts the second token in a room on a different floor", () => {
    const state = choose(
      testGame({ stack: ["ballroom"], decks: { event: ["secret-stairs"] } }),
      "Explore through the north door",
    );
    expect(labels(state).sort()).toEqual([
      "Put the other Secret Stairs token in the Basement Landing",
      "Put the other Secret Stairs token in the Upper Landing",
    ]);
  });

  it("following them at once draws an event card in the room you arrive in", () => {
    const state = choose(draw(), "Go through");
    expect(roomOf(state)).toBe("basement-landing");
    const drawn = state.lastEvents.filter((e) => e.type === "card-drawn");
    expect(drawn.at(-1)?.data).toMatchObject({ card: "creepy-crawlies" });
  });

  it("stays a way between the floors on later turns, drawing no card", () => {
    // With movement over after the draw, Zoe can only end her turn.
    let state = choose(draw(), "Go through");
    state = choose(state, "End your turn");
    while (state.turn?.seat !== 0) state = choose(state, "End your turn");
    state = choose(state, "Move to the Ballroom");
    expect(roomOf(state)).toBe("ballroom");
    expect(eventTypes(state)).not.toContain("card-drawn");
  });
});

describe("Smoke (cards/events.md)", () => {
  /** The Ballroom north of the Entrance Hall, the Abandoned Room north of it. */
  function inALine(): GameState {
    const state = testGame();
    lay(state, [
      { tile: "ballroom", floor: "ground", x: 2, y: -1, rotation: 0 },
      { tile: "abandoned-room", floor: "ground", x: 2, y: -2, rotation: 0 },
    ]);
    return state;
  }
  const sight = (state: GameState, room: string) =>
    askSet(ENGINE, state, "lineOfSight", { room });

  it("blocks line of sight into, out of and through its room", () => {
    const state = inALine();
    const before = sight(state, "entrance-hall");
    expect(before).toEqual(expect.arrayContaining(["abandoned-room", "ballroom"]));
    state.tokens.push({ token: "smoke", room: "ballroom" });
    expect(sight(state, "entrance-hall")).toEqual(
      before.filter((r) => r !== "abandoned-room" && r !== "ballroom"),
    );
    expect(sight(state, "abandoned-room")).toEqual([]);
    expect(sight(state, "ballroom")).toEqual([]);
  });
});

describe("Dog (cards/omens.md)", () => {
  /** Zoe explores north into the Dining Room and draws the Dog. The Axe lies in the Foyer. */
  function withDog(setUp?: (state: GameState) => void): GameState {
    const state = testGame({ stack: ["dining-room"], decks: { omen: ["dog"] } });
    state.decks.item.draw = state.decks.item.draw.filter((c) => c !== "axe");
    state.piles.foyer = ["axe"];
    setUp?.(state);
    let next = choose(state, "Explore through the north door");
    if (kind(next) === "rotation") next = choose(next, "Place the Dining Room");
    return next;
  }
  const SEND = "Send the Dog to a room up to 6 spaces away and back";
  const dogToken = (state: GameState) =>
    state.tokens.find((t) => t.token === "dog");

  it("puts a token for the Dog in your room, which goes wherever you go", () => {
    let state = withDog();
    expect(dogToken(state)).toEqual({
      token: "dog",
      room: "dining-room",
      holder: ZOE,
    });
    state = run(state, relocate(ZOE, "foyer", RULE));
    expect(dogToken(state)?.room).toBe("foyer");
  });

  it("fetches an item from a room's pile, which its holder gets when it comes back", () => {
    let state = choose(withDog(), SEND);
    state = choose(state, "Send the Dog to the Foyer");
    expect(described(state)).toContain("Dog runs to the Foyer");
    state = choose(state, "The Dog brings back the Axe");
    expect(explorer(state, 0).cards).toEqual(["dog", "axe"]);
    expect(state.piles.foyer).toBeUndefined();
    expect(dogToken(state)?.room).toBe("dining-room");
    expect(labels(state)).not.toContain(SEND);
  });

  it("can leave an item its holder gives it in a room it reaches", () => {
    let state = withDog((s) => {
      explorer(s, 0).cards = ["revolver"];
      s.decks.item.draw = s.decks.item.draw.filter((c) => c !== "revolver");
    });
    state = choose(choose(state, SEND), "Send the Dog to the Foyer");
    state = choose(state, "The Dog leaves your Revolver there");
    expect(explorer(state, 0).cards).toEqual(["dog"]);
    expect(state.piles.foyer).toEqual(["axe", "revolver"]);
  });

  it("uses only doors and stairs, never a room that takes a roll to leave, and never a Secret Passage", () => {
    const state = withDog((s) => {
      lay(s, [{ tile: "junk-room", floor: "ground", x: 1, y: -1, rotation: 0 }]);
      s.tokens.push(
        {
          token: "secret-passage",
          room: "dining-room",
          link: { room: "basement-landing", side: null },
        },
        {
          token: "secret-passage",
          room: "basement-landing",
          link: { room: "dining-room", side: null },
        },
      );
    });
    const runs = labels(choose(state, SEND));
    expect(runs).toContain("Send the Dog to the Foyer");
    expect(runs).toContain("Send the Dog to the Upper Landing");
    expect(runs).not.toContain("Send the Dog to the Junk Room");
    expect(runs).not.toContain("Send the Dog to the Basement Landing");
  });

  it("fetches or leaves an item, never an omen (the card's project ruling)", () => {
    const state = withDog((s) => {
      s.piles.foyer = ["axe", "skull"];
      explorer(s, 0).cards = ["revolver", "book"];
      s.decks.item.draw = s.decks.item.draw.filter((c) => c !== "revolver");
      s.decks.omen.draw = s.decks.omen.draw.filter(
        (c) => c !== "skull" && c !== "book",
      );
    });
    const options = labels(
      choose(choose(state, SEND), "Send the Dog to the Foyer"),
    );
    expect(options).toContain("The Dog brings back the Axe");
    expect(options).toContain("The Dog leaves your Revolver there");
    expect(options.some((l) => l.includes("Skull"))).toBe(false);
    expect(options.some((l) => l.includes("Book"))).toBe(false);
  });

  it("goes into the Collapsed Room by its doors, since only its fall is one-way (the card's project ruling)", () => {
    const state = withDog((s) => {
      lay(s, [
        { tile: "collapsed-room", floor: "ground", x: 1, y: -1, rotation: 0 },
      ]);
    });
    expect(labels(choose(state, SEND))).toContain(
      "Send the Dog to the Collapsed Room",
    );
  });

  it("takes its token away when its holder loses it", () => {
    const state = run(withDog(), loseCard(ZOE, "dog", { to: "discard" }, RULE));
    expect(dogToken(state)).toBeUndefined();
  });

  it("gives a token to whoever gains it", () => {
    const state = run(testGame(), gainCard(OX, "dog", "given", RULE));
    expect(dogToken(state)).toMatchObject({ room: "entrance-hall", holder: OX });
  });
});

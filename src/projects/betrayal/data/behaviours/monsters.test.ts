import { describe, expect, it } from "vitest";
import { connections } from "../../engine/board";
import { describeEvent } from "../../engine/describe";
import { drawCard, gain } from "../../engine/effects";
import { start, type Engine } from "../../engine/step-loop";
import { BASE_ENGINE, ENGINE } from "../../game";
import { withHaunts } from "../../kit/haunt";
import {
  TOY_ENGINE,
  toMonsterTurn,
  toyBegun,
  toyHaunt,
} from "../../test/toy-haunt";
import {
  choose,
  eventTypes,
  explorer,
  offered,
  pendingDecision,
  put,
  waitingOn,
  spectator,
} from "../../testing";
import type { GameEvent, GameState, RuleRef } from "../../types";

// Room and card text reaching monsters, and the traitor's new powers
// (rules.md pp. 17-19, rulings harmful-text, monster-climbs,
// monster-traits and traitor-events; the Bell's and Spirit Board's pulls,
// cards/items.md and cards/omens.md), played through the toy haunt
// (test/toy-haunt.ts): Ox, seat 1, is the traitor, beside Phantom 1.

const OX = "ox-bellows";
const FATHER = "father-rhinehardt";
const PHANTOM_1 = "phantom-1";
const RULE: RuleRef = { source: "haunt", haunt: 13, section: "Rules" };
const DRAW_RULE: RuleRef = { source: "rulebook", page: 10 };

/** The toy haunt with the traitor awake, taking turns of his own. */
const AWAKE_ENGINE: Engine = withHaunts(BASE_ENGINE, [
  toyHaunt(13, {
    setup: {
      traitor: [
        { part: "spawn", figure: "phantom", count: 1, at: "traitor", owner: "traitor" },
        { part: "counter", counter: "escapes", start: 0 },
        { part: "secret", secret: "target", value: { of: "players" }, knownBy: "traitor" },
      ],
      heroes: [{ part: "counter", counter: "wakes", start: 0 }],
    },
  }),
]);

const TOY_ACTIONS = ["Take an extra turn after this one", "Meet both goals at once"];

const labels = (state: GameState, engine: Engine) =>
  offered(state, engine)
    .map((c) => c.label)
    .filter((label) => !TOY_ACTIONS.includes(label));

const describeAll = (engine: Engine, state: GameState) =>
  state.lastEvents.flatMap((e: GameEvent) => describeEvent(engine, spectator(state, engine), e) ?? []);

/** Puts the Phantom somewhere, as a test's setup. */
function phantomIn(state: GameState, room: string): void {
  state.figures[PHANTOM_1].place = { room, side: null };
}

/** The monster turn begun, the Phantom acting with spaces to move. */
function phantomActing(
  setUp: (state: GameState) => void,
  rooms: string[] = [],
  engine: Engine = TOY_ENGINE,
): GameState {
  let state = toMonsterTurn(toyBegun(engine, setUp, { rooms }), engine);
  if (state.turn === null) throw new Error("No turn");
  state.turn.rolled.phantom = 6;
  state = choose(state, "Act with Phantom 1", engine);
  return state;
}

/** A room joined by a door to this one, already in the house. */
function nextTo(state: GameState, room: string): string {
  const found = connections(state.board, ENGINE.catalog, room).at(0);
  if (found === undefined) throw new Error(`Nothing is next to the ${room}`);
  return found;
}

describe("room text on a monster", () => {
  it("still slides it down the Coal Chute; it can climb back up, staying, and go down again (ruling monster-climbs)", () => {
    let state = phantomActing(
      (s) => phantomIn(s, nextTo(s, "coal-chute")),
      ["coal-chute"],
    );
    state = choose(state, "Move to the Coal Chute", TOY_ENGINE);
    expect(state.figures[PHANTOM_1].place?.room).toBe("basement-landing");
    expect(labels(state, TOY_ENGINE)).toContain("Move to the Coal Chute");
    state = choose(state, "Move to the Coal Chute", TOY_ENGINE);
    expect(state.figures[PHANTOM_1].place?.room).toBe("coal-chute");
    expect(labels(state, TOY_ENGINE)).toContain("Move to the Basement Landing");
  });

  it("ignores a roll to leave without being asked (ruling harmful-text)", () => {
    let state = phantomActing((s) => phantomIn(s, "junk-room"), ["junk-room"]);
    const out = labels(state, TOY_ENGINE).find((l) => l.startsWith("Move to"));
    if (out === undefined) throw new Error("No way out of the Junk Room");
    state = choose(state, out, TOY_ENGINE);
    expect(eventTypes(state)).toContain("text-ignored");
    expect(eventTypes(state)).not.toContain("rolled");
    expect(describeAll(TOY_ENGINE, state)).toContain(
      "Junk Room: Phantom 1 ignores the roll to leave.",
    );
  });

  it("ignores a barrier, and its controller chooses the side it stops on (p. 7)", () => {
    let state = phantomActing(
      (s) => phantomIn(s, "basement-landing"),
      ["catacombs"],
    );
    state = choose(state, "Move to the Catacombs", TOY_ENGINE);
    expect(labels(state, TOY_ENGINE).some((l) => l.startsWith("Try to cross"))).toBe(false);
    state = choose(state, "End the monster turn", TOY_ENGINE);
    expect(pendingDecision(state).kind).toBe("choose-one");
    expect(waitingOn(state)).toBe(1);
    expect(offered(state, TOY_ENGINE)).toHaveLength(2);
    state = choose(state, "Land on the", TOY_ENGINE);
    expect(eventTypes(state)).toContain("side-chosen");
  });

  it("falls from the Gallery without the damage, and climbs back up for a space (ruling monster-climbs)", () => {
    let state = phantomActing(
      (s) => phantomIn(s, "gallery"),
      ["ballroom", "gallery"],
    );
    state = choose(state, "Fall down to the Ballroom", TOY_ENGINE);
    expect(state.figures[PHANTOM_1].place?.room).toBe("ballroom");
    expect(eventTypes(state)).toContain("text-ignored");
    expect(eventTypes(state)).not.toContain("rolled");
    expect(labels(state, TOY_ENGINE)).toContain("Move to the Gallery");
  });

  it("falls through the Collapsed Room first into a basement room already there, drawing no tile (p. 7)", () => {
    let state = phantomActing(
      (s) => phantomIn(s, "collapsed-room"),
      ["collapsed-room"],
    );
    const stack = state.board.stack.length;
    state = choose(state, "Fall to the basement", TOY_ENGINE);
    // Every basement room already in the house, where the haunt began too.
    expect(waitingOn(state)).toBe(1);
    expect(labels(state, TOY_ENGINE)).toEqual([
      "Fall to the Basement Landing",
      "Fall to the Catacombs",
    ]);
    state = choose(state, "Fall to the Basement Landing", TOY_ENGINE);
    expect(state.board.stack).toHaveLength(stack);
    expect(state.figures[PHANTOM_1].place?.room).toBe("basement-landing");
    expect(state.tokens).toContainEqual(
      expect.objectContaining({ token: "below-collapsed-room", room: "basement-landing" }),
    );
    expect(labels(state, TOY_ENGINE)).toContain("Move to the Collapsed Room");
  });

  it("sends the Mystic Elevator where the monster's controller chooses, with no roll (p. 8)", () => {
    let state = phantomActing(
      (s) => phantomIn(s, nextTo(s, "mystic-elevator")),
      ["mystic-elevator"],
    );
    state = choose(state, "Move to the Mystic Elevator", TOY_ENGINE);
    expect(eventTypes(state)).not.toContain("rolled");
    expect(labels(state, TOY_ENGINE)).toEqual(
      expect.arrayContaining(["Send the elevator to the basement"]),
    );
  });

  it("can't raise its traits, nor lose them but to damage (p. 19, ruling monster-traits)", () => {
    const state = start(TOY_ENGINE, { ...toyBegun(TOY_ENGINE), pending: null }, [
      gain(PHANTOM_1, "might", 1, RULE),
    ]);
    expect(eventTypes(state)).toContain("traits-fixed");
    expect(describeAll(TOY_ENGINE, state)).toContain("Phantom 1's Might doesn't change.");
  });
});

describe("card text naming explorers (rules.md, p. 5: a rule for one kind names it)", () => {
  it("the Medical Kit heals explorers in the room, never a monster there", () => {
    const state = toyBegun(TOY_ENGINE, (s) => {
      explorer(s, 2).cards.push("medical-kit");
      explorer(s, 0).traits.clips.might = 0;
      explorer(s, 2).traits.clips.might = 0;
    });
    const healed = choose(state, "Use the Medical Kit", TOY_ENGINE);
    expect(labels(healed, TOY_ENGINE)).toEqual([
      "Heal Father Rhinehardt",
      "Heal Zoe Ingstrom",
    ]);
  });

  it("the Dark Dice's 5 moves another explorer, never a monster", () => {
    let state = toyBegun(TOY_ENGINE, (s) => {
      explorer(s, 2).cards.push("dark-dice", "angel-feather");
    });
    state = choose(state, "Dark Dice", TOY_ENGINE);
    state = choose(state, "the result is 5", TOY_ENGINE);
    const moved = labels(state, TOY_ENGINE);
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.some((l) => l.includes("Phantom"))).toBe(false);
  });

  it("Lights Out stays with a hero who ends the turn beside only a monster", () => {
    let state = toyBegun(TOY_ENGINE, (s) => {
      put(s, 2, "foyer");
      phantomIn(s, "foyer");
      explorer(s, 2).cards.push("lights-out");
    });
    state = choose(state, "End your turn", TOY_ENGINE);
    expect(state.figures[FATHER].cards).toContain("lights-out");
  });

  it("Footsteps' nearest explorer is never a monster", () => {
    for (const seed of Array.from({ length: 100 }, (_, i) => `${i}`)) {
      let state = toyBegun(
        TOY_ENGINE,
        // In the Chapel, Footsteps rolls 2 dice, so it can roll a 3 or 4.
        (s) => {
          put(s, 2, "chapel");
          phantomIn(s, "chapel");
        },
        { seed, decks: { event: ["footsteps"] }, rooms: ["chapel"] },
      );
      state = start(TOY_ENGINE, { ...state, pending: null }, [
        drawCard(FATHER, "event", DRAW_RULE),
      ]);
      const rolled = state.lastEvents.find((e) => e.type === "rolled");
      const result = (rolled?.data as { result: number } | undefined)?.result;
      if (result !== 3 && result !== 4) continue;
      const touched = state.lastEvents.map(
        (e) => (e.data as { figure?: string } | null)?.figure,
      );
      expect(touched).not.toContain(PHANTOM_1);
      // Zoe and Ox, together in the Entrance Hall, tie as the nearest.
      expect(labels(state, TOY_ENGINE)).toEqual([
        "Zoe Ingstrom is the nearest explorer",
        "Ox Bellows is the nearest explorer",
      ]);
      return;
    }
    throw new Error("No seed rolls a 3 or 4 for Footsteps");
  });
});

describe("the Bell's and the Spirit Board's pulls (cards/items.md, cards/omens.md)", () => {
  /** Father, holding the card, a room away from the Phantom. */
  const holding = (card: string) => (s: GameState) => {
    put(s, 2, "foyer");
    explorer(s, 2).cards.push(card, "angel-feather");
  };

  it("a Bell rung for 0-4 lets the traitor pull his monster a room nearer, spending none of its movement", () => {
    let state = toyBegun(TOY_ENGINE, holding("bell"));
    state = choose(state, "Ring the Bell", TOY_ENGINE);
    state = choose(state, "the result is 2", TOY_ENGINE);
    expect(waitingOn(state)).toBe(1);
    expect(labels(state, TOY_ENGINE)).toEqual([
      "Move Phantom 1 1 space closer",
      "Leave Phantom 1 where it is",
    ]);
    state = choose(state, "Move Phantom 1 1 space closer", TOY_ENGINE);
    expect(state.figures[PHANTOM_1].place?.room).toBe("foyer");
    expect(state.turn?.moved[PHANTOM_1]).toBeUndefined();
    expect(state.turn?.attacked).toEqual([]);
  });

  it("a Bell the traitor rings for 0-4 moves no monster of his", () => {
    let state = toyBegun(AWAKE_ENGINE, (s) => {
      put(s, 1, "foyer");
      explorer(s, 1).cards.push("bell", "angel-feather");
    });
    state = toMonsterTurn(state, AWAKE_ENGINE);
    expect(state.turn).toMatchObject({ seat: 1, kind: "traitor" });
    state = choose(state, "Ring the Bell", AWAKE_ENGINE);
    state = choose(state, "the result is 2", AWAKE_ENGINE);
    expect(state.figures[PHANTOM_1].place?.room).toBe("entrance-hall");
    expect(pendingDecision(state).kind).toBe("turn");
  });

  it("the Spirit Board used after the haunt lets the traitor pull his monster closer", () => {
    let state = toyBegun(TOY_ENGINE, holding("spirit-board"));
    state = choose(state, "Use the Spirit Board", TOY_ENGINE);
    expect(eventTypes(state)).toContain("room-stack-seen");
    expect(waitingOn(state)).toBe(1);
    state = choose(state, "Move Phantom 1 1 space closer", TOY_ENGINE);
    expect(state.figures[PHANTOM_1].place?.room).toBe("foyer");
  });
});

describe("the traitor's new powers (rules.md, p. 17)", () => {
  /** Ox's traitor turn, awake, set up as given. */
  function traitorTurn(setUp: (s: GameState) => void, rooms: string[] = []) {
    const state = toMonsterTurn(toyBegun(AWAKE_ENGINE, setUp, { rooms }), AWAKE_ENGINE);
    expect(state.turn).toMatchObject({ seat: 1, kind: "traitor" });
    return state;
  }

  it("may ignore a room's roll to leave, or make it (ruling harmful-text)", () => {
    let state = traitorTurn((s) => put(s, 1, "junk-room"), ["junk-room"]);
    const out = labels(state, AWAKE_ENGINE).find((l) => l.startsWith("Move to"));
    if (out === undefined) throw new Error("No way out of the Junk Room");
    state = choose(state, out, AWAKE_ENGINE);
    expect(labels(state, AWAKE_ENGINE)).toEqual([
      "Make the Might roll to leave",
      "Leave without rolling",
    ]);
    state = choose(state, "Leave without rolling", AWAKE_ENGINE);
    expect(state.figures[OX].place?.room).not.toBe("junk-room");
    expect(eventTypes(state)).toContain("text-ignored");
  });

  it("may ignore a room's damage at the end of the turn", () => {
    let state = traitorTurn((s) => put(s, 1, "crypt"), ["crypt"]);
    state = choose(state, "End your turn", AWAKE_ENGINE);
    expect(labels(state, AWAKE_ENGINE)).toEqual([
      "Take 1 mental damage",
      "Ignore the damage",
    ]);
  });

  it("while a hero is bound by the same text", () => {
    const state = toyBegun(AWAKE_ENGINE, (s) => put(s, 2, "crypt"), {
      rooms: ["crypt"],
    });
    const ended = choose(state, "End your turn", AWAKE_ENGINE);
    expect(pendingDecision(ended).kind).toBe("split-damage");
  });

  it("may choose not to be affected by an event card, before its rolls (ruling traitor-events)", () => {
    let state = toyBegun(AWAKE_ENGINE, () => {}, { decks: { event: ["rotten"] } });
    state = start(AWAKE_ENGINE, { ...state, pending: null }, [
      drawCard(OX, "event", DRAW_RULE),
    ]);
    expect(labels(state, AWAKE_ENGINE)).toEqual([
      "Be affected by the Rotten",
      "Don't be affected by the Rotten",
    ]);
    state = choose(state, "Don't be affected", AWAKE_ENGINE);
    expect(eventTypes(state)).not.toContain("rolled");
    expect(state.decks.event.discard).toContain("rotten");
  });

  it("but a hero drawing it is affected", () => {
    let state = toyBegun(AWAKE_ENGINE, () => {}, { decks: { event: ["rotten"] } });
    state = start(AWAKE_ENGINE, { ...state, pending: null }, [
      drawCard(FATHER, "event", DRAW_RULE),
    ]);
    expect(eventTypes(state)).toContain("rolled");
  });

  it("sends the Mystic Elevator where he chooses, and then it won't move for his monsters until his next traitor turn (p. 8)", () => {
    let state = traitorTurn(
      (s) => {
        put(s, 1, nextTo(s, "mystic-elevator"));
        phantomIn(s, nextTo(s, "mystic-elevator"));
      },
      ["mystic-elevator"],
    );
    state = choose(state, "Move to the Mystic Elevator", AWAKE_ENGINE);
    expect(eventTypes(state)).not.toContain("rolled");
    const floor = labels(state, AWAKE_ENGINE).find((l) => l.startsWith("Send the elevator"));
    if (floor === undefined) throw new Error("No floor to send it to");
    state = choose(state, floor, AWAKE_ENGINE);
    expect(state.turn?.setUses).toEqual(["mystic-elevator"]);
    // On to the monster turn, which keeps the use.
    while (state.turn?.kind === "traitor") {
      const pending = pendingDecision(state);
      if (pending.kind !== "turn") state = choose(state, offered(state, AWAKE_ENGINE)[0].label, AWAKE_ENGINE);
      else state = choose(state, "End your turn", AWAKE_ENGINE);
    }
    expect(state.turn).toMatchObject({ kind: "monster", setUses: ["mystic-elevator"] });
  });
});

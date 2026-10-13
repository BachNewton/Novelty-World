import path from "node:path";
import { describe, expect, it } from "vitest";
import { eventsFor, viewFor } from "../engine/view";
import { ENGINE } from "../game";
import { choose, explorer, inHaunt, offered, testGame } from "../testing";
import type { GameEvent, GameState } from "../types";
import { ruleSources } from "../test/rule-sources";
import { openFloors } from "../art/open-floor";
import { EVENT_SHOWS, present, speedOf, startPresentation, type Beat, type Presentation } from "./presenter";

/** Zoe's starting Speed, as her card prints it. */
const ZOE_SPEED = 4;

/** Every room an open floor, its prime place off the middle. */
const FLOORS = openFloors([1, 1]);

/** Every event type the engine can emit, read from its `emit` calls. */
function emittedTypes(): Set<string> {
  const types = new Set<string>();
  for (const { file, source } of ruleSources()) {
    const calls = [...source.matchAll(/\bemit\(/g)].length;
    const named = [...source.matchAll(/\bemit\(\s*"([a-z:-]+)"/g)].map((match) => match[1]);
    // An event type passed as a variable would hide from this list.
    expect(named.length, `${file} emits an event type that isn't a literal`).toBe(calls);
    for (const type of named) types.add(type);
  }
  return types;
}

/** Event types with words: the describer's own, and those cards and haunts describe. */
function wordedTypes(): Set<string> {
  const describer = ruleSources().find(({ file }) => file === path.join("engine", "describe.ts"))?.source ?? "";
  const own = [...describer.matchAll(/case "([a-z:-]+)":/g)].map((match) => match[1]);
  const cards = Object.values(ENGINE.behaviours.cards).flatMap((behaviour) => Object.keys(behaviour?.describe ?? {}));
  const haunts = Object.values(ENGINE.haunts).flatMap((haunt) => Object.keys(haunt?.behaviour.describe ?? {}));
  return new Set([...own, ...cards, ...haunts]);
}

describe("every event type", () => {
  const emitted = emittedTypes();

  it("is found in the engine", () => {
    expect(emitted.size).toBeGreaterThan(50);
    expect(emitted).toContain("turn-started");
  });

  it("has a way to show, and words when it is a line", () => {
    const worded = wordedTypes();
    for (const type of emitted) {
      expect(type in EVENT_SHOWS, `${type} has no entry in EVENT_SHOWS`).toBe(true);
      if (EVENT_SHOWS[type] === "line" || EVENT_SHOWS[type] === "reveal") expect(worded.has(type), `${type} is a line, but nothing words it`).toBe(true);
    }
  });

  it("the presenter knows is one the engine emits", () => {
    for (const type of Object.keys(EVENT_SHOWS)) expect(emitted.has(type), `${type} is never emitted`).toBe(true);
  });
});

/** A game played on through the presenter, as the screen feeds it: the
 *  client's feed of events so far, and the view of the seat holding the device. */
function played(start: GameState = testGame()) {
  let state = start;
  const feed: GameEvent[] = [...state.lastEvents];
  let presentation: Presentation = startPresentation(ENGINE, viewFor(ENGINE, state, 0), FLOORS);
  const seat = () => state.turn?.seat ?? 0;
  return {
    /** Takes a choice and presents what it did. */
    choose(label: string): Beat[] {
      state = choose(state, label);
      feed.push(...state.lastEvents);
      return this.present();
    },
    present(): Beat[] {
      const next = present(ENGINE, presentation, eventsFor(ENGINE, state, seat(), feed), viewFor(ENGINE, state, seat()), FLOORS);
      presentation = next.presentation;
      return next.beats;
    },
    presentation: () => presentation,
    state: () => state,
  };
}

/** The ids of the latest write's events of these types. */
const idsOf = (state: GameState, ...types: string[]) => state.lastEvents.filter((event) => types.includes(event.type)).map((event) => event.id);

/** A beat's line, or its kind, to read a run's order by. */
const named = (state: GameState) => (beat: Beat) => {
  if (beat.kind !== "line") return beat.kind;
  return state.lastEvents.find((event) => event.id === beat.line)?.type ?? beat.line;
};

/** Holds what every run must keep: its beats in the order their events
 *  happened, each event in one beat at most, and every event in none either
 *  silent or a step of movement with nothing of its own to show. */
function expectInOrder(state: GameState, beats: readonly Beat[]) {
  const at = new Map(state.lastEvents.map((event, i) => [event.id, i]));
  const firsts = beats.flatMap((beat) => (beat.events.length > 0 ? [Math.min(...beat.events.map((id) => at.get(id) ?? Infinity))] : []));
  expect(firsts).toEqual([...firsts].sort((a, b) => a - b));
  const covered = beats.flatMap((beat) => beat.events);
  expect(new Set(covered).size).toBe(covered.length);
  for (const event of state.lastEvents) {
    if (covered.includes(event.id)) continue;
    const shown = EVENT_SHOWS[event.type];
    const quiet =
      shown === null ||
      shown === "walk" ||
      shown === "turn" ||
      (event.type === "forced" && (event.data as { kind?: string }).kind === "rotation") ||
      (event.type === "roll-coming" && (event.data as { rows: unknown }).rows === null);
    expect(quiet, `${event.type} plays in no beat`).toBe(true);
  }
}

describe("present", () => {
  it("walks a move, and plays each event once however often it is fed", () => {
    const game = played();
    const beats = game.choose("Move to the Foyer");
    expect(beats).toEqual([
      { kind: "walk", walks: [{ figure: "zoe-ingstrom", route: ["entrance-hall", "foyer"], at: [1, 1], gait: "walk", speed: ZOE_SPEED }], events: idsOf(game.state(), "left", "entered") },
    ]);
    expect(game.present()).toEqual([]);
  });

  it("walks a route taken one write at a time as one walk, through the rooms it took", () => {
    const game = played();
    game.choose("Move to the Foyer");
    game.choose("Move to the Grand Staircase");
    const beats = game.choose("Move to the Upper Landing");
    expect(beats.find((beat) => beat.kind === "walk")).toMatchObject({ walks: [{ route: ["grand-staircase", "upper-landing"] }] });
  });

  it("carries a room a rule moved to its new cell", () => {
    // The Mystic Elevator, discovered and entered, rolls a floor to go to: a seed where it must leave its own.
    const seeds = Array.from({ length: 50 }, (_, i) => choose(testGame({ seed: `move-${i}`, stack: ["mystic-elevator"] }), "Explore through the north door"));
    const start = seeds.find((state) => offered(state).every((choice) => choice.label.startsWith("Put the Mystic Elevator")));
    if (!start) throw new Error("No seed sends the elevator away");
    const game = played(start);
    const beats = game.choose("Put the Mystic Elevator");
    expect(beats).toContainEqual({ kind: "move", room: "mystic-elevator", events: idsOf(game.state(), "room-moved") });
    // Zoe rides in it: she stands in the same room, so she has no walk of her own.
    expect(beats.filter((beat) => beat.kind === "walk")).toEqual([]);
    expectInOrder(game.state(), beats);
    expect(game.present()).toEqual([]);
  });

  it("passes the turn by moving the light only, and tells nothing the house shows", () => {
    const game = played();
    const before = game.presentation().spots;
    const beats = game.choose("End your turn");
    expect(beats).toEqual([{ kind: "turn", figure: "ox-bellows", events: idsOf(game.state(), "turn-started") }]);
    expect(game.presentation().spots).toEqual(before);
  });

  it("starts a game with no beats, its events counted as played", () => {
    const view = viewFor(ENGINE, testGame(), 0);
    const presentation = startPresentation(ENGINE, view, FLOORS);
    expect(presentation.seen).toEqual(view.events.map((event) => event.id));
    expect(presentation.active).toBe("zoe-ingstrom");
  });

  it("walks into a discovered room before its card, then tells what the card did, in order", () => {
    // Discovering the Game Room draws Creepy Crawlies: a Sanity roll, and a Sanity gained or lost.
    const game = played(testGame({ stack: ["game-room"], decks: { event: ["creepy-crawlies"] } }));
    game.choose("Explore");
    const beats = game.choose("Place");
    expect(beats.map(named(game.state()))).toEqual(["walk", "card-drawn", "roll-coming", "rolled", "trait-changed"]);
    expect(beats.slice(1).map((beat) => beat.kind === "line" && beat.show)).toEqual(["card", "table", "dice", "float"]);
    // The room's own rule applying, its `entered`, is no step of the walk: the walk is the discovery's.
    expect(beats[0].events).toEqual(idsOf(game.state(), "left", "discovered"));
    expectInOrder(game.state(), beats);
  });

  it("shows a roll made at once by its table first, then its dice with the row it landed on", () => {
    // Creepy Crawlies: a Sanity roll Zoe has no card to act on.
    const game = played(testGame({ stack: ["game-room"], decks: { event: ["creepy-crawlies"] } }));
    game.choose("Explore");
    const beats = game.choose("Place");
    const coming = beats.find((beat) => beat.kind === "line" && named(game.state())(beat) === "roll-coming");
    const rolled = beats.find((beat) => beat.kind === "line" && named(game.state())(beat) === "rolled");
    expect(coming).toMatchObject({ show: "table", events: idsOf(game.state(), "roll-coming") });
    expect(rolled).toMatchObject({ show: "dice", events: idsOf(game.state(), "rolled", "table-row") });
    if (!coming || !rolled) throw new Error("No roll's beats");
    expect(beats.indexOf(coming)).toBeLessThan(beats.indexOf(rolled));
    expectInOrder(game.state(), beats);
  });

  it("tells nothing for a room placed the only way it fits: its appearing showed it", () => {
    const game = played(testGame({ stack: ["abandoned-room"], decks: { omen: ["book"] } }));
    const beats = game.choose("Explore through the north door");
    expect(game.state().lastEvents.some((event) => event.type === "forced")).toBe(true);
    expect(beats.map(named(game.state()))).toEqual(["walk", "card-drawn", "trait-changed"]);
    expectInOrder(game.state(), beats);
  });

  it("walks into a discovered room before a card drawn there asks its question, and never walks again", () => {
    // Secret Stairs, drawn in the Conservatory, asks where its other token goes before the explorer has entered the room.
    const game = played(testGame({ stack: ["conservatory"], decks: { event: ["secret-stairs"] } }));
    const beats = game.choose("Explore");
    expect(offered(game.state()).every((choice) => choice.label.startsWith("Put the other Secret Stairs token"))).toBe(true);
    expect(beats[0]).toEqual({ kind: "walk", walks: [{ figure: "zoe-ingstrom", route: ["entrance-hall", "conservatory"], at: [1, 1], gait: "walk", speed: ZOE_SPEED }], events: idsOf(game.state(), "left", "discovered") });
    expect(beats.at(-1)).toMatchObject({ kind: "line", show: "card" });
    expectInOrder(game.state(), beats);
    // Entering the room once the card is done, it is already there: no second walk.
    game.choose("Basement Landing");
    expect(game.choose("Stay here").filter((beat) => beat.kind === "walk")).toEqual([]);
  });

  it("shows the haunt roll before the house turns to the haunt, and the turn's end before the next turn", () => {
    const game = played(testGame({ stack: ["abandoned-room"], decks: { omen: ["book"] } }));
    game.state().omensDrawn = 12;
    game.choose("Explore through the north door");
    const beats = game.choose("End your turn");
    const order = beats.map(named(game.state()));
    expect(order.indexOf("rolled")).toBeLessThan(order.indexOf("reveal"));
    expect(beats.find((beat) => beat.kind === "reveal")).toMatchObject({ line: idsOf(game.state(), "haunt-revealed")[0] });
    expectInOrder(game.state(), beats);
  });

  it("holds nothing up for a line with nothing of its own to show", () => {
    // Hideous Shriek: every explorer rolls; a die of damage that rolls 0 prevents it, told in words alone.
    const game = played(testGame({ stack: ["game-room"], decks: { event: ["hideous-shriek"] } }));
    game.choose("Explore");
    const beats = game.choose("Place");
    for (const beat of beats) {
      if (beat.kind !== "line") continue;
      const event = game.state().lastEvents.find((candidate) => candidate.id === beat.line);
      const expected = event?.type === "card-drawn" ? "card" : event?.type === "roll-coming" ? "table" : event?.type === "rolled" ? "dice" : event?.type === "trait-changed" || event?.type === "damaged" ? "float" : "words";
      expect(beat.show, event?.type).toBe(expected);
    }
    expectInOrder(game.state(), beats);
  });

  it("fails loudly on an event type it has no way to show", () => {
    const view = viewFor(ENGINE, testGame(), 0);
    const strange = { id: "x:0", type: "nonsense", rule: { source: "rulebook" as const, page: 1 }, data: null };
    expect(() => present(ENGINE, startPresentation(ENGINE, view, FLOORS), [strange], view, FLOORS)).toThrow(/nonsense/);
  });
});

describe("the haunt's reveal", () => {
  it("shifts the house's light once, when the haunt is revealed, and not again", () => {
    const game = played(testGame({ stack: ["abandoned-room"], decks: { omen: ["book"] } }));
    expect(game.presentation().haunted).toBe(false);
    game.state().omensDrawn = 12;
    game.choose("Explore through the north door");
    const beats = game.choose("End your turn");
    expect(beats.some((beat) => beat.kind === "reveal")).toBe(true);
    expect(game.presentation().haunted).toBe(true);
    expect(game.present()).toEqual([]);
  });

  it("starts a game resumed in the haunt with its light already shown", () => {
    const state = testGame({ haunt: { number: 13, revealer: 0 } });
    expect(startPresentation(ENGINE, viewFor(ENGINE, state, 0), FLOORS).haunted).toBe(true);
  });
});

describe("gait", () => {
  /** The gait of each walk to the Foyer after the haunt: Zoe's, the traitor's, then the next explorer's, a hero's. */
  function gaits(secret: boolean): string[] {
    const state = inHaunt(testGame(), 0);
    if (secret) state.seats[0].knownBy = [0];
    const game = played(state);
    const walks = (beats: Beat[]) => beats.flatMap((beat) => (beat.kind === "walk" ? beat.walks.filter((walk) => walk.route.length > 1).map((walk) => walk.gait) : []));
    const traitor = walks(game.choose("Move to the Foyer"));
    game.choose("End your turn");
    return [...traitor, ...walks(game.choose("Move to the Foyer"))];
  }

  it("is a walk for the traitor after the haunt, and a run for heroes", () => {
    expect(gaits(false)).toEqual(["walk", "run"]);
  });

  it("is a run for everyone while a side is kept secret", () => {
    expect(gaits(true)).toEqual(["run", "run"]);
  });
});

describe("speed", () => {
  it("is an explorer's Speed as their card shows it, when the walk begins", () => {
    const state = testGame();
    const zoe = explorer(state, 0);
    // The top of her track, printed 8.
    zoe.traits.clips.speed = 7;
    const game = played(state);
    const walk = game.choose("Move to the Foyer").find((beat) => beat.kind === "walk");
    expect(walk).toMatchObject({ walks: [{ figure: zoe.id, speed: 8 }] });
  });

  it("is the same for every seat, the traitor's in a hidden-traitor haunt too", () => {
    const state = inHaunt(testGame(), 0);
    state.seats[0].knownBy = [0];
    const traitor = explorer(state, 0).id;
    const speeds = state.seats.map((_, seat) => speedOf(ENGINE, viewFor(ENGINE, state, seat), traitor));
    expect(new Set(speeds).size).toBe(1);
    expect(speeds[0]).toEqual(expect.any(Number));
  });
});

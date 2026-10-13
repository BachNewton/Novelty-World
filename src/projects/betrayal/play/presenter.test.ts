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

  it("has a beat or words", () => {
    const worded = wordedTypes();
    for (const type of emitted) {
      expect(type in EVENT_SHOWS, `${type} has no entry in EVENT_SHOWS`).toBe(true);
      if (EVENT_SHOWS[type] === null) expect(worded.has(type), `${type} is told in words only, but nothing words it`).toBe(true);
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

describe("present", () => {
  it("walks a move, and plays each event once however often it is fed", () => {
    const game = played();
    const beats = game.choose("Move to the Foyer");
    expect(beats).toContainEqual({ kind: "walk", figure: "zoe-ingstrom", route: ["entrance-hall", "foyer"], at: [1, 1], gait: "walk", speed: ZOE_SPEED });
    expect(game.present()).toEqual([]);
    // The box still tells what the move did.
    expect(game.presentation().told).toEqual(game.state().lastEvents.map((event) => event.id));
  });

  it("walks a route taken one write at a time as one walk, through the rooms it took", () => {
    const game = played();
    game.choose("Move to the Foyer");
    game.choose("Move to the Grand Staircase");
    const beats = game.choose("Move to the Upper Landing");
    expect(beats.find((beat) => beat.kind === "walk")).toMatchObject({ route: ["grand-staircase", "upper-landing"] });
  });

  it("carries a room a rule moved to its new cell, after the walks and before the turn passes", () => {
    // The Mystic Elevator, discovered and entered, rolls a floor to go to: a seed where it must leave its own.
    const seeds = Array.from({ length: 50 }, (_, i) => choose(testGame({ seed: `move-${i}`, stack: ["mystic-elevator"] }), "Explore through the north door"));
    const start = seeds.find((state) => offered(state).every((choice) => choice.label.startsWith("Put the Mystic Elevator")));
    if (!start) throw new Error("No seed sends the elevator away");
    const game = played(start);
    const beats = game.choose("Put the Mystic Elevator");
    expect(beats).toContainEqual({ kind: "move", room: "mystic-elevator" });
    // Zoe rides in it: she stands in the same room, so she has no walk of her own.
    expect(beats.filter((beat) => beat.kind === "walk")).toEqual([]);
    expect(game.present()).toEqual([]);
  });

  it("shows a room close on its first visit only", () => {
    const game = played();
    expect(game.choose("Move to the Foyer")).toContainEqual({ kind: "enter", room: "foyer" });
    game.choose("Move to the Entrance Hall");
    expect(game.choose("Move to the Foyer")).not.toContainEqual({ kind: "enter", room: "foyer" });
  });

  it("passes the turn by moving the light only: no figure moves", () => {
    const game = played();
    const before = game.presentation().spots;
    const beats = game.choose("End your turn");
    expect(beats).toContainEqual({ kind: "turn", figure: "ox-bellows" });
    expect(beats.filter((beat) => beat.kind === "walk")).toEqual([]);
    expect(game.presentation().spots).toEqual(before);
  });

  it("starts a game with no beats, its latest write told and its rooms seen", () => {
    const view = viewFor(ENGINE, testGame(), 0);
    const presentation = startPresentation(ENGINE, view, FLOORS);
    expect(presentation.told).toEqual(view.events.map((event) => event.id));
    expect(presentation.visited).toEqual(["entrance-hall"]);
    expect(presentation.active).toBe("zoe-ingstrom");
  });

  it("holds a drawn card's text until a tap, and other moments for a while", () => {
    // The Game Room, north of the Entrance Hall, draws an event card.
    const game = played(testGame({ stack: ["game-room"], decks: { event: ["something-hidden"] } }));
    game.choose("Explore");
    const beats = game.choose("Place");
    expect(beats.filter((beat) => beat.kind === "moment").map((beat) => beat.waits)).toContain(true);
  });

  it("walks into a discovered room, and shows it close, before a card drawn there asks its question", () => {
    // Secret Stairs, drawn in the Conservatory, asks where its other token goes before the explorer has entered the room.
    const game = played(testGame({ stack: ["conservatory"], decks: { event: ["secret-stairs"] } }));
    const beats = game.choose("Explore");
    expect(offered(game.state()).every((choice) => choice.label.startsWith("Put the other Secret Stairs token"))).toBe(true);
    expect(beats.slice(0, 2)).toEqual([
      { kind: "walk", figure: "zoe-ingstrom", route: ["entrance-hall", "conservatory"], at: [1, 1], gait: "walk", speed: ZOE_SPEED },
      { kind: "enter", room: "conservatory" },
    ]);
    expect(beats.at(-1)).toMatchObject({ kind: "moment", waits: true });
    // Entering the room once the card is done, it is already there: no second walk.
    game.choose("Basement Landing");
    expect(game.choose("Stay here")).toEqual([]);
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
    expect(beats).toContainEqual({ kind: "reveal" });
    expect(game.presentation().haunted).toBe(true);
    expect(game.present()).not.toContainEqual({ kind: "reveal" });
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
    const walks = (beats: Beat[]) => beats.flatMap((beat) => (beat.kind === "walk" && beat.route.length > 1 ? [beat.gait] : []));
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
    expect(walk).toMatchObject({ figure: zoe.id, speed: 8 });
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

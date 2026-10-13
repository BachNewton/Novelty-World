import { describe, expect, it } from "vitest";
import type { FigureSpec, HouseScene } from "../../art/house-scene";
import { openFloors } from "../../art/open-floor";
import { viewFor, type EventView, type GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import { choose, testGame } from "../../testing";
import type { GameState } from "../../types";
import { createPresenting, skipOrAnswer, type Presented, type Presenting } from "./presenting";

/** A house that holds every beat it plays (a walk, a room carried, a pause)
 *  until the test ends the oldest (`step`), or `finish` ends them all. */
function fakeScene() {
  const held: (() => void)[] = [];
  /** The kinds of the beats played, in order. */
  const played: string[] = [];
  /** Each time the house is told where the figures stand: their rooms. */
  const stood: Record<string, string>[] = [];
  const scene = {
    finish: () => {
      for (const release of held.splice(0)) release();
    },
    play: (beat: { kind: string }) =>
      new Promise<void>((resolve) => {
        played.push(beat.kind);
        held.push(resolve);
      }),
    view: () => ({ closeUp: null }),
    setFigures: (figures: readonly { id: string; room: string }[]) => {
      stood.push(Object.fromEntries(figures.map((figure) => [figure.id, figure.room])));
    },
    setThings: () => {},
    setActive: () => {},
    setMood: () => {},
  } as unknown as HouseScene;
  return {
    scene,
    /** Ends the oldest beat held, and lets what follows from it run. */
    step: async () => {
      held.shift()?.();
      await settle();
    },
    holding: () => held.length,
    played,
    stood,
  };
}

/** Lets the promises a beat's end set going run to their next wait. */
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const zoe = (state: GameState): GameView => viewFor(ENGINE, state, 0);

/** Zoe's game, shown from its start, and the presenter showing it, with every snapshot it publishes. */
function started(state: GameState) {
  const house = fakeScene();
  const presenting = createPresenting(house.scene, () => [], { place: openFloors(), load: () => null });
  const start = zoe(state);
  presenting.show(start, start.events);
  const snapshots: Presented[] = [];
  presenting.subscribe(() => snapshots.push(presenting.snapshot()));
  return { house, presenting, fed: [...start.events] as EventView[], snapshots };
}

/** Shows what a choice did, as the screen does. */
function shown(presenting: Presenting, fed: EventView[], state: GameState) {
  const view = zoe(state);
  fed.push(...view.events);
  presenting.show(view, fed);
}

/** Holds, at every snapshot, that nothing is told before its beat has started: the line, the card's title and the floats. */
function expectNothingAhead(snapshots: readonly Presented[]) {
  for (const snapshot of snapshots) {
    const started = new Set(snapshot.shown);
    if (snapshot.playing && snapshot.told) expect(started.has(snapshot.told.line), "the line runs ahead of its beat").toBe(true);
    if (snapshot.card) expect(started.has(snapshot.card.event), "the card's title runs ahead of its beat").toBe(true);
    for (const float of snapshot.floats) expect(started.has(float), "a float runs ahead of its beat").toBe(true);
    if (snapshot.beat) for (const event of snapshot.beat.events) expect(started.has(event)).toBe(true);
  }
}

/** Discovering the Game Room draws Creepy Crawlies: a walk in, the card, a Sanity roll, and a Sanity gained or lost. */
const CRAWLIES = () => testGame({ stack: ["game-room"], decks: { event: ["creepy-crawlies"] } });

describe("the box and the house in step", () => {
  it("tell each event only once its beat plays, in the order they happened", async () => {
    const start = CRAWLIES();
    const { house, presenting, fed, snapshots } = started(start);
    const discovered = choose(choose(start, "Explore through the north door"), "turned 0°");
    shown(presenting, fed, discovered);
    const type = (id: string | undefined) => discovered.lastEvents.find((event) => event.id === id)?.type;

    // The walk in: nothing told yet, no card's title, no float.
    expect(presenting.snapshot()).toMatchObject({ playing: true, told: null, card: null, floats: [] });
    expect(presenting.snapshot().beat?.kind).toBe("walk");
    await house.step();
    // The card: its title and text, waiting for a tap; its line, and nothing after it.
    expect(type(presenting.snapshot().told?.line)).toBe("card-drawn");
    expect(presenting.snapshot().card).toMatchObject({ waits: true });
    presenting.goOn();
    await settle();
    // The roll's table shows first, with its odds, under the card's title.
    expect(type(presenting.snapshot().told?.line)).toBe("roll-coming");
    expect(presenting.snapshot().card).toMatchObject({ waits: false });
    await house.step();
    // Then its dice turn up, under the card's title, which stays until the choice shows.
    expect(type(presenting.snapshot().told?.line)).toBe("rolled");
    expect(presenting.snapshot().card).toMatchObject({ waits: false });
    expect(presenting.snapshot().floats).toEqual([]);
    await house.step();
    // The Sanity gained or lost floats as its line shows.
    expect(type(presenting.snapshot().told?.line)).toBe("trait-changed");
    expect(presenting.snapshot().floats).toHaveLength(1);
    await house.step();
    // The choices show the moment the last beat ends, with the last line still up.
    expect(presenting.snapshot()).toMatchObject({ playing: false, card: null, beat: null });
    expect(type(presenting.snapshot().told?.line)).toBe("trait-changed");
    expectNothingAhead(snapshots);
  });

  it("hold nothing up for a line with nothing of its own to show", async () => {
    // Ending the turn: the turn passing is the only beat, and it holds nothing.
    const start = testGame();
    const { presenting, fed } = started(start);
    shown(presenting, fed, choose(start, "End your turn"));
    await settle();
    expect(presenting.snapshot()).toMatchObject({ playing: false, told: null });
  });

  it("complete at once on an input, every line, card and float shown, and only skip", () => {
    const start = CRAWLIES();
    const { presenting, fed, snapshots } = started(start);
    const discovered = choose(choose(start, "Explore through the north door"), "turned 0°");
    shown(presenting, fed, discovered);
    let answered = 0;
    expect(
      skipOrAnswer(presenting, () => {
        answered++;
      }),
    ).toBe(false);
    expect(answered).toBe(0);
    const after = presenting.snapshot();
    expect(after).toMatchObject({ playing: false, card: null });
    expect(discovered.lastEvents.find((event) => event.id === after.told?.line)?.type).toBe("trait-changed");
    expect(after.floats).toHaveLength(1);
    expect(
      skipOrAnswer(presenting, () => {
        answered++;
      }),
    ).toBe(true);
    expect(answered).toBe(1);
    expectNothingAhead(snapshots);
  });

  it("wait between two beats while Why is open, and go on once it closes", async () => {
    const start = CRAWLIES();
    const { house, presenting, fed } = started(start);
    shown(presenting, fed, choose(choose(start, "Explore through the north door"), "turned 0°"));
    await house.step();
    presenting.goOn();
    await settle();
    // The roll plays; Why opens on it.
    const rolling = presenting.snapshot().told?.line;
    presenting.hold(true);
    await house.step();
    expect(presenting.snapshot().told?.line).toBe(rolling);
    expect(house.holding()).toBe(0);
    presenting.hold(false);
    await settle();
    expect(presenting.snapshot().told?.line).not.toBe(rolling);
  });

  it("show a figure a rule put on another floor leaving where it stood, then standing there with the rule's line, until the camera has gone after it", async () => {
    // Zoe walks into the Coal Chute and slides down it to the Basement Landing.
    const start = testGame({ stack: ["coal-chute"] });
    const house = fakeScene();
    const presenting = createPresenting(house.scene, (_view, spots) => Object.entries(spots).flatMap(([id, spot]) => (spot ? [{ id, room: spot.room } as FigureSpec] : [])), { place: openFloors(), load: () => null });
    /** The room Zoe stands in, each time the house is told where the figures are. */
    const zoeIn = () => house.stood.map((figures) => figures["zoe-ingstrom"]);
    presenting.show(zoe(start), zoe(start).events);
    const slid = choose(start, "Explore through the north door");
    presenting.show(zoe(slid), [...zoe(start).events, ...zoe(slid).events]);
    const said = (id: string | undefined) => slid.lastEvents.find((event) => event.id === id);

    // She walks into the chute, standing where she was until then; nothing is told.
    expect(presenting.snapshot().beat?.kind).toBe("walk");
    expect(presenting.snapshot().told).toBeNull();
    expect(zoeIn().slice(-2)).toEqual(["entrance-hall", "coal-chute"]);
    await house.step();
    // She is put in the Basement Landing, the chute's line tells it, and the beat lasts until the camera has followed her there.
    expect(presenting.snapshot().beat).toMatchObject({ kind: "place", figure: "zoe-ingstrom" });
    expect(said(presenting.snapshot().told?.line)).toMatchObject({ type: "entered", data: { room: "basement-landing", moved: false } });
    expect(zoeIn().at(-1)).toBe("basement-landing");
    expect(house.played).toEqual(["walk", "frame"]);
    await house.step();
    expect(presenting.snapshot()).toMatchObject({ playing: false, beat: null });
    expect(said(presenting.snapshot().told?.line)?.type).toBe("entered");
  });

  it("name the view they last presented, so its choices wait until it has been", () => {
    const start = testGame();
    const { presenting, fed } = started(start);
    const next = choose(start, "Move to the Foyer");
    const view = zoe(next);
    expect(presenting.snapshot().view).not.toBe(view);
    fed.push(...view.events);
    presenting.show(view, fed);
    expect(presenting.snapshot().view).toBe(view);
  });

  it("aren't held by a view with nothing new to play", () => {
    const start = testGame();
    const { presenting, fed } = started(start);
    presenting.show(zoe(start), fed);
    expect(presenting.snapshot().playing).toBe(false);
  });
});

describe("the rooms' floors", () => {
  it("are read before anyone is placed: the view waits for them, then shows, once", async () => {
    let read!: () => void;
    const reading = new Promise<void>((resolve) => {
      read = resolve;
    });
    let ready = false;
    const placed: number[] = [];
    const presenting = createPresenting(fakeScene().scene, (_view, spots) => {
      placed.push(Object.keys(spots).length);
      return [];
    }, { place: openFloors(), load: () => (ready ? null : reading) });
    const start = zoe(testGame());
    presenting.show(start, start.events);
    presenting.show(start, start.events);
    expect(presenting.snapshot()).toMatchObject({ playing: true, spots: {} });
    ready = true;
    read();
    await reading;
    await Promise.resolve();
    expect(placed).toEqual([3]);
    expect(presenting.snapshot().playing).toBe(false);
    expect(Object.keys(presenting.snapshot().spots)).toHaveLength(3);
  });

  it("are read for a room a figure only passes through on the way", () => {
    const asked: string[][] = [];
    const presenting = createPresenting(fakeScene().scene, () => [], {
      place: openFloors(),
      load: (rooms) => {
        asked.push([...rooms]);
        return null;
      },
    });
    const start = testGame({ stack: ["coal-chute"] });
    presenting.show(zoe(start), zoe(start).events);
    const slid = choose(start, "Explore through the north door");
    asked.length = 0;
    presenting.show(zoe(slid), [...zoe(start).events, ...zoe(slid).events]);
    // The first ask is the one the view waits on.
    expect(asked[0]).toEqual(expect.arrayContaining(["coal-chute", "basement-landing"]));
  });

  it("are read ahead for the next tiles of the room stack", () => {
    const asked: string[][] = [];
    const presenting = createPresenting(fakeScene().scene, () => [], {
      place: openFloors(),
      load: (rooms) => {
        asked.push([...rooms]);
        return null;
      },
    });
    const start = zoe(testGame());
    presenting.show(start, start.events, ["game-room", "chapel"]);
    expect(asked.some((rooms) => rooms.includes("game-room") && rooms.includes("chapel"))).toBe(true);
  });
});

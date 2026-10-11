import { describe, expect, it } from "vitest";
import type { HouseScene } from "../../art/house-scene";
import { openFloors } from "../../art/open-floor";
import { viewFor, type EventView, type GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import { choose, testGame } from "../../testing";
import type { GameState } from "../../types";
import { createPresenting, skipOrAnswer, type Presenting } from "./presenting";

/** A house that plays walks and pans at once, and holds every pause until it is finished. */
function fakeScene(): HouseScene {
  const held: (() => void)[] = [];
  return {
    finish: () => {
      for (const release of held.splice(0)) release();
    },
    play: (beat: { kind: string }) =>
      beat.kind === "pause"
        ? new Promise<void>((resolve) => {
            held.push(resolve);
          })
        : Promise.resolve(),
    view: () => ({ closeUp: null }),
    setFigures: () => {},
    setThings: () => {},
    setActive: () => {},
    setMood: () => {},
  } as unknown as HouseScene;
}

const zoe = (state: GameState): GameView => viewFor(ENGINE, state, 0);

/** Resolves once the presenter's beats are over. */
const played = (presenting: Presenting) =>
  new Promise<void>((resolve) => {
    if (!presenting.snapshot().playing) {
      resolve();
      return;
    }
    const stop = presenting.subscribe(() => {
      if (presenting.snapshot().playing) return;
      stop();
      resolve();
    });
  });

/** Zoe's game, shown from its start, and the presenter showing it. */
function started() {
  const state = testGame({ stack: ["game-room"], decks: { event: ["something-hidden"] } });
  const presenting = createPresenting(fakeScene(), () => [], { place: openFloors(), load: () => null });
  const start = zoe(state);
  presenting.show(start, start.events);
  return { state, presenting, fed: [...start.events] as EventView[] };
}

describe("the choices wait for the beats", () => {
  it("are held while a card drawn waits for a tap, and the first input only skips", () => {
    const { state, presenting, fed } = started();
    const discovered = choose(choose(state, "Explore through the north door"), "turned 0°");
    const view = zoe(discovered);
    presenting.show(view, [...fed, ...view.events]);
    expect(presenting.snapshot().playing).toBe(true);

    let answered = 0;
    const answer = () => {
      answered++;
    };
    expect(skipOrAnswer(presenting, answer)).toBe(false);
    expect(answered).toBe(0);
    expect(presenting.snapshot()).toMatchObject({ playing: false, moment: null });
    expect(skipOrAnswer(presenting, answer)).toBe(true);
    expect(answered).toBe(1);
  });

  it("show once beats that play out by themselves are over", async () => {
    const { state, presenting, fed } = started();
    const moved = choose(state, "Move to the Foyer");
    const view = zoe(moved);
    presenting.show(view, [...fed, ...view.events]);
    await played(presenting);
    expect(presenting.snapshot().playing).toBe(false);
  });

  it("aren't held by a view with nothing new to play", () => {
    const { state, presenting, fed } = started();
    const view = zoe(state);
    presenting.show(view, fed);
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
    const presenting = createPresenting(fakeScene(), (_view, spots) => {
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
});

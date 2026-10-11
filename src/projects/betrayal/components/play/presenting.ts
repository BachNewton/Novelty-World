import type { FigureSpec, HouseScene } from "../../art/house-scene";
import type { RoomFloors } from "../../art/placement";
import type { EventView, GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import { present, startPresentation, type Beat, type Presentation } from "../../play/presenter";
import { aheadRooms, standingRooms, type Spots } from "../../play/spots";
import { lyingRooms, roomThings, shownThings, type Clusters, type RoomThing, type ShownThing } from "../../play/things";

/*
 * The presenter at work on the play screen: each view shown goes through
 * the pure presenter, and its beats play in the house and the status box.
 * Walks start at once, before the figures are stood where the state has
 * them, so each walks there rather than standing there already; whose turn
 * it is follows; then the rooms entered for the first time, each shown close
 * once its walk is over; then the box's moments, one after another. The
 * game's state never waits on a beat, but the screen does: the pending
 * decision's choices show only once the beats leading to it are over, and an
 * input while they play only completes them all at once (`skip`), never
 * answering as well, so a player always sees what happened before choosing.
 */

/** How long automatic beats hold, as a share of their normal length. */
export const SPEEDS = { slow: 1.6, normal: 1, fast: 0.5 } as const;
export type Speed = keyof typeof SPEEDS;

/** How long a room's first visit holds it close, and a moment holds its line, at normal speed, in seconds. */
const ENTERING_SECONDS = 2.5;
const MOMENT_SECONDS = 1.6;
/** How long a room a rule moved takes to travel to its new cell, at normal speed, in seconds. */
const MOVING_SECONDS = 1.8;

/** A line of the status box held as a moment, and whether it waits for a tap. */
export interface Moment {
  event: string;
  waits: boolean;
}

/** What the screen's other parts read of the presenter. */
export interface Presented {
  /** The ids of the events the status box tells. */
  told: readonly string[];
  moment: Moment | null;
  spots: Spots;
  /** Where the objects on the floors lie. */
  clusters: Clusters;
  /** The things living in the rooms, as the view presented has them, and as they show. */
  inRooms: readonly RoomThing[];
  things: readonly ShownThing[];
  /** Beats are playing: the pending decision's choices wait until they are over, and an input only skips them. */
  playing: boolean;
}

/** The house's room floors: placing figures on those read, and reading more
 *  (null when every one asked for is read already). */
export interface Floors {
  place: RoomFloors;
  load: (rooms: readonly string[]) => Promise<void> | null;
}

/** The things in a view's rooms, and how they show with its clusters: read together, so they always agree. */
function thingsOf(view: GameView, clusters: Clusters): Pick<Presented, "inRooms" | "things"> {
  const inRooms = roomThings(ENGINE, view);
  return { inRooms, things: shownThings(ENGINE, inRooms, clusters) };
}

export function createPresenting(scene: HouseScene, figuresOf: (view: GameView, spots: Spots) => FigureSpec[], floors: Floors) {
  let presentation: Presentation | null = null;
  let shown: Presented = { told: [], moment: null, spots: {}, clusters: {}, inRooms: [], things: [], playing: false };
  let speed: Speed = "normal";
  /** Counts the runs of beats: a run that is no longer the latest stops at its next step. */
  let run = 0;
  /** A waiting moment's release, on the next input. */
  let release: (() => void) | null = null;
  const listeners = new Set<() => void>();
  /** The view last given to show, and whether it waits on room floors being read. */
  let latest: { view: GameView; events: readonly EventView[] } | null = null;
  let reading = false;
  /** The screen was held as playing while floors were read, rather than by beats. */
  let held = false;

  function publish(next: Partial<Presented>) {
    shown = { ...shown, ...next };
    for (const listener of listeners) listener();
  }

  /** Completes whatever is playing at once: walkers stand where they were going, and a room shown close lets its walls down. */
  function skip() {
    run++;
    scene.finish();
    release?.();
    release = null;
    if (scene.view().closeUp !== null) void scene.play({ kind: "frame", framing: null });
    if (shown.moment !== null || shown.playing) publish({ moment: null, playing: false });
  }

  async function playRest(beats: readonly Beat[], walks: Promise<void>[], mine: number) {
    for (const beat of beats) {
      if (mine !== run) return;
      switch (beat.kind) {
        case "walk":
          break;
        case "move":
          await Promise.all(walks);
          if (mine !== run) return;
          await scene.play({ kind: "move-room", room: beat.room, seconds: MOVING_SECONDS * SPEEDS[speed] });
          break;
        case "turn":
          scene.setActive(beat.figure);
          break;
        case "reveal":
          scene.setMood("haunt", { shifting: true });
          break;
        case "enter":
          await Promise.all(walks);
          if (mine !== run) return;
          void scene.play({ kind: "frame", framing: { closeUp: beat.room } });
          // A room on a floor the player isn't looking at isn't shown close: the player's floor stands.
          if (scene.view().closeUp !== beat.room) break;
          await scene.play({ kind: "pause", seconds: ENTERING_SECONDS * SPEEDS[speed] });
          if (mine === run) await scene.play({ kind: "frame", framing: null });
          break;
        case "moment":
          publish({ moment: { event: beat.event, waits: beat.waits } });
          await (beat.waits
            ? new Promise<void>((resolve) => {
                release = resolve;
              })
            : scene.play({ kind: "pause", seconds: MOMENT_SECONDS * SPEEDS[speed] }));
          if (mine === run) publish({ moment: null });
          break;
      }
    }
    await Promise.all(walks);
    if (mine === run) publish({ playing: false });
  }

  /** Shows a view, with the events fed so far as the seat holding the device may see them. */
  function show(view: GameView, events: readonly EventView[]) {
    latest = { view, events };
    // A view waits only for the floors of the rooms its explorers stand in; the rest of the house, and a room being placed, is read ahead.
    // Objects lying in a room are placed on its floor too.
    const needed = floors.load([...new Set([...standingRooms(view), ...lyingRooms(roomThings(ENGINE, view))])]);
    void floors.load(aheadRooms(view));
    if (needed) {
      if (!shown.playing) {
        held = true;
        publish({ playing: true });
      }
      if (!reading) {
        reading = true;
        void needed.then(() => {
          reading = false;
          if (latest) show(latest.view, latest.events);
        });
      }
      return;
    }
    const wasHeld = held;
    held = false;
    if (presentation === null) {
      presentation = startPresentation(ENGINE, view, floors.place);
      scene.setFigures(figuresOf(view, presentation.spots));
      const things = thingsOf(view, presentation.clusters);
      scene.setThings(things.things);
      scene.setActive(presentation.active);
      scene.setMood(presentation.haunted ? "haunt" : "explore", { shifting: false });
      publish({ told: presentation.told, spots: presentation.spots, clusters: presentation.clusters, ...things, playing: false });
      return;
    }
    const next = present(ENGINE, presentation, events, view, floors.place);
    presentation = next.presentation;
    // A run still playing is completed before the next starts; a view with nothing new to play leaves it be.
    if (next.beats.length > 0) skip();
    const mine = run;
    const walking = next.beats.flatMap((beat) => (beat.kind === "walk" ? [{ figure: beat.figure, route: beat.route, at: beat.at, pace: beat.gait, speed: beat.speed ?? undefined }] : []));
    const walks = walking.length > 0 ? [scene.play({ kind: "walk", walks: walking })] : [];
    scene.setFigures(figuresOf(view, presentation.spots));
    const things = thingsOf(view, presentation.clusters);
    scene.setThings(things.things);
    publish({ told: presentation.told, spots: presentation.spots, clusters: presentation.clusters, ...things, playing: next.beats.length > 0 || (shown.playing && !wasHeld) });
    void playRest(next.beats, walks, mine);
  }

  return {
    show,
    skip,
    /** Goes on from a moment that waits for a tap, to the beats after it; with none waiting, skips them all. */
    goOn() {
      if (release === null) {
        skip();
        return;
      }
      release();
      release = null;
    },
    setSpeed(next: Speed) {
      speed = next;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => shown,
  };
}

export type Presenting = ReturnType<typeof createPresenting>;

/** An input while beats play only skips them; once they are over, it answers.
 *  True when it answered. One input never does both, so a choice that
 *  appears as a beat ends is never taken by the press that ended it. */
export function skipOrAnswer(presenting: Pick<Presenting, "snapshot" | "skip">, answer: () => void): boolean {
  if (presenting.snapshot().playing) {
    presenting.skip();
    return false;
  }
  answer();
  return true;
}

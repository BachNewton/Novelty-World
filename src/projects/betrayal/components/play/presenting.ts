import type { FigureSpec, HouseScene } from "../../art/house-scene";
import type { RoomFloors } from "../../art/placement";
import type { EventView, GameView } from "../../engine/view";
import { ENGINE } from "../../game";
import { arrivedRooms, beatLine, present, startPresentation, type Beat, type Presentation } from "../../play/presenter";
import { aheadRooms, standingRooms, type Spots } from "../../play/spots";
import { lyingRooms, roomThings, shownThings, type Clusters, type RoomThing, type ShownThing } from "../../play/things";

/*
 * The presenter at work on the play screen: each view shown goes through
 * the pure presenter, and its beats play one after another, in the order
 * the events happened. There is one source of truth for what the screen
 * tells: the beat playing now. The status box's line, its Why, a card over
 * its room and the floats over the figures read only the beats started so
 * far, so nothing is told before its beat plays. A figure whose walk is
 * still to come stands where it was until its beat. A beat lasts as long as
 * what it shows (a walk, a room carried, a roll's table read, dice turning
 * up, a float rising); a line with nothing else to show holds nothing up.
 * A card drawn waits over its room for a press, and a skip stops at it, so
 * every card drawn is seen. The game's state never waits on a beat, but the
 * screen does: the pending decision's choices show the moment the last beat
 * ends, and an input while they play only skips them (`skip`), never
 * answering as well.
 */

/** How long automatic beats hold, as a share of their normal length. */
export const SPEEDS = { slow: 1.6, normal: 1, fast: 0.5 } as const;
export type Speed = keyof typeof SPEEDS;

/** How long a room a rule moved takes to travel to its new cell, at normal speed, in seconds. */
const MOVING_SECONDS = 1.8;
/** How long a roll's dice take to turn up in its line, at normal speed, in seconds. */
export const DICE_SECONDS = 0.9;
/** How long a roll's table shows, with its odds, before a roll made at once turns up its dice, at normal speed, in seconds. */
const TABLE_SECONDS = 1.6;
/** How long a roll's row, lit once its dice have turned up, holds to be read, at normal speed, in seconds. */
const ROW_SECONDS = 1.2;
/** How long a gain or loss takes to rise over its figure, before the next beat, at normal speed, in seconds. */
const FLOAT_SECONDS = 1.1;

/** The line of the status box: the event it tells, and the events of its beat, whose rules are its Why. */
export interface Told {
  line: string;
  events: readonly string[];
}

/** What the screen's other parts read of the presenter. */
export interface Presented {
  /** The beat playing now, or null. */
  beat: Beat | null;
  /** The status box's line: the latest of the beats started, kept until the next write's beats begin. */
  told: Told | null;
  /** The events of the beats started in the latest write's run. */
  shown: readonly string[];
  /** The card drawn waiting over its room for a press: its event. */
  card: string | null;
  /** The gains and losses whose beats have started in the latest run, floating over their figures. */
  floats: readonly string[];
  spots: Spots;
  /** Where the objects on the floors lie. */
  clusters: Clusters;
  /** The things living in the rooms, as the view presented has them, and as they show. */
  inRooms: readonly RoomThing[];
  things: readonly ShownThing[];
  /** Beats are playing, or a card waits for its press: the pending decision's choices wait until they are over, and an input only skips them. */
  playing: boolean;
  /** The view last presented. Until the view now shown has been presented,
   *  its beats aren't known yet, so its choices wait as they do while beats play. */
  view: GameView | null;
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

/** What the screen shows once these beats have started: the latest line, and the floats. */
function started(beats: readonly Beat[], told: Told | null): Pick<Presented, "told" | "shown" | "floats"> {
  let line = told;
  const floats: string[] = [];
  for (const beat of beats) {
    const event = beatLine(beat);
    if (event !== null) line = { line: event, events: beat.events };
    if (beat.kind === "line" && beat.show === "float") floats.push(beat.line);
  }
  return { told: line, shown: beats.flatMap((beat) => beat.events), floats };
}

export function createPresenting(scene: HouseScene, figuresOf: (view: GameView, spots: Spots) => FigureSpec[], floors: Floors) {
  let presentation: Presentation | null = null;
  let shown: Presented = { beat: null, told: null, shown: [], card: null, floats: [], spots: {}, clusters: {}, inRooms: [], things: [], playing: false, view: null };
  let speed: Speed = "normal";
  /** The run playing: the beats of every write since the screen last had
   *  none to play, in order; the next to play; and how far it is skipped:
   *  the beats before `skipTo` complete at once, up to a card, which stops
   *  the skip and waits for its press. */
  let queue: Beat[] = [];
  let at = 0;
  let skipTo = 0;
  let pumping = false;
  /** The line before the run's first beat, where the figures stand as the beats so far show them, and the view they are drawn from. */
  let told: Told | null = null;
  let standing: Spots = {};
  let drawn: GameView | null = null;
  /** A card waiting for its press: its release. */
  let release: (() => void) | null = null;
  /** The beats are held between two (Why is open), and their going on once let go. */
  let holding = false;
  let resume: (() => void) | null = null;
  const listeners = new Set<() => void>();
  /** The view last given to show, and whether it waits on room floors being read. */
  let latest: { view: GameView; events: readonly EventView[] } | null = null;
  let reading = false;

  function publish(next: Partial<Presented>) {
    shown = { ...shown, ...next };
    for (const listener of listeners) listener();
  }

  const figures = (spots: Spots) => (drawn ? figuresOf(drawn, spots) : []);

  /** An input while beats play: a card waiting goes on to the beats after
   *  it; else whatever is playing completes at once, and so does every beat
   *  up to the next card, which waits. */
  function skip() {
    if (release) {
      const go = release;
      release = null;
      go();
      return;
    }
    if (pumping) {
      hurry();
      return;
    }
    if (shown.playing) publish({ beat: null, card: null, playing: false });
  }

  /** Completes the run's beats so far at once, up to a card, which waits. */
  function hurry() {
    skipTo = queue.length;
    resume?.();
    resume = null;
    scene.finish();
  }

  /** Plays the run's beats until none are left. */
  async function pump() {
    pumping = true;
    while (at < queue.length) {
      const i = at++;
      const beat = queue[i];
      if (holding && i >= skipTo)
        await new Promise<void>((resolve) => {
          resume = resolve;
        });
      /** Plays a moment in the house to its end, at once while the run is skipped. */
      const play = (moment: Parameters<HouseScene["play"]>[0], meanwhile?: () => void) => {
        const done = scene.play(moment);
        meanwhile?.();
        if (i < skipTo) scene.finish();
        return done;
      };
      publish({ ...started(queue.slice(0, i + 1), told), card: null, beat });
      switch (beat.kind) {
        case "walk":
          standing = { ...standing, ...Object.fromEntries(beat.walks.map((walk) => [walk.figure, walk.to])) };
          await play({ kind: "walk", walks: beat.walks.map((walk) => ({ figure: walk.figure, route: walk.route, at: [walk.to.x, walk.to.z], pace: walk.gait, speed: walk.speed ?? undefined })) }, () => {
            scene.setFigures(figures(standing));
          });
          break;
        case "place":
          // Gone from where it stood and standing at once where it was put; the beat lasts until a following camera has gone after it there.
          standing = { ...standing, [beat.figure]: beat.to };
          scene.setFigures(figures(standing));
          await play({ kind: "frame", framing: null });
          break;
        case "move":
          await play({ kind: "move-room", room: beat.room, seconds: MOVING_SECONDS * SPEEDS[speed] });
          break;
        case "turn":
          scene.setActive(beat.figure);
          break;
        case "reveal":
          scene.setMood("haunt", { shifting: i >= skipTo });
          break;
        case "line":
          if (beat.show === "card") {
            // A card stops a skip: every card drawn is seen, and waits for its press.
            skipTo = Math.min(skipTo, i);
            publish({ card: beat.line });
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            publish({ card: null });
          } else if (beat.show === "table") await play({ kind: "pause", seconds: TABLE_SECONDS * SPEEDS[speed] });
          else if (beat.show === "dice") await play({ kind: "pause", seconds: DICE_SECONDS * SPEEDS[speed] });
          else if (beat.show === "roll") await play({ kind: "pause", seconds: (DICE_SECONDS + ROW_SECONDS) * SPEEDS[speed] });
          else if (beat.show === "float") await play({ kind: "pause", seconds: FLOAT_SECONDS * SPEEDS[speed] });
          break;
      }
    }
    pumping = false;
    // Everyone stands where the run leaves them.
    if (presentation) scene.setFigures(figures(presentation.spots));
    publish({ beat: null, card: null, playing: false });
  }

  /** Shows a view, with the events fed so far as the seat holding the device may see them; `ahead` names rooms to read the floors of before they are needed (the next tiles of the room stack). */
  function show(view: GameView, events: readonly EventView[], ahead: readonly string[] = []) {
    latest = { view, events };
    // A view waits only for the floors of the rooms its explorers stand in or pass through; the rest of the house, a room being placed and the next tiles drawn are read ahead.
    // Objects lying in a room are placed on its floor too.
    const needed = floors.load([...new Set([...standingRooms(view), ...arrivedRooms(presentation, events), ...lyingRooms(roomThings(ENGINE, view))])]);
    void floors.load([...aheadRooms(view), ...ahead]);
    if (needed) {
      if (!shown.playing) publish({ playing: true });
      if (!reading) {
        reading = true;
        void needed.then(() => {
          reading = false;
          if (latest) show(latest.view, latest.events);
        });
      }
      return;
    }
    if (presentation === null) {
      presentation = startPresentation(ENGINE, view, floors.place);
      drawn = view;
      scene.setFigures(figuresOf(view, presentation.spots));
      const things = thingsOf(view, presentation.clusters);
      scene.setThings(things.things);
      scene.setActive(presentation.active);
      scene.setMood(presentation.haunted ? "haunt" : "explore", { shifting: false });
      publish({ spots: presentation.spots, clusters: presentation.clusters, ...things, playing: false, view });
      return;
    }
    const before = presentation;
    const next = present(ENGINE, before, events, view, floors.place);
    presentation = next.presentation;
    drawn = view;
    const fresh = next.presentation.seen.length !== before.seen.length;
    const spots = presentation.spots;
    const things = thingsOf(view, presentation.clusters);
    scene.setThings(things.things);
    if (pumping) {
      // A run still playing completes at once, up to a card waiting, before this write's beats play.
      if (next.beats.length > 0) hurry();
      queue.push(...next.beats);
      publish({ spots, clusters: presentation.clusters, ...things, view });
      return;
    }
    // A figure whose walk, or whose being put somewhere, is still to come stands where it was until its beat.
    const moving = new Set(next.beats.flatMap((beat) => (beat.kind === "walk" ? beat.walks.map((walk) => walk.figure) : beat.kind === "place" ? [beat.figure] : [])));
    standing = Object.fromEntries(Object.entries(spots).map(([id, spot]) => [id, moving.has(id) ? before.spots[id] : spot]));
    scene.setFigures(figures(standing));
    told = fresh ? null : shown.told;
    if (next.beats.length === 0) {
      publish({ spots, clusters: presentation.clusters, ...things, told, playing: false, view });
      return;
    }
    queue = [...next.beats];
    at = 0;
    skipTo = 0;
    publish({ spots, clusters: presentation.clusters, ...things, told, shown: [], floats: [], card: null, playing: true, view });
    void pump();
  }

  return {
    show,
    skip,
    /** Holds the beats between two while Why is open (true), and lets them go on (false). */
    hold(on: boolean) {
      holding = on;
      if (!on) {
        resume?.();
        resume = null;
      }
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

import { createStore } from "zustand/vanilla";
import { GUEST_SLOT, HOST_SLOT, type GuestMessage, type HostPlay } from "./coop";
import { courseOf, type CourseSpec } from "./courses";
import type { ReplayData } from "./proof/replay-data";
import {
  advance,
  confirm,
  inserted,
  runAt,
  runHash,
  startTimeline,
  timelineFrom,
  withLog,
  type Timeline,
} from "./rollback";
import type { InputLog, PlayerInput, TimedInput } from "./run";
import { freshRun, type Session, type SessionState } from "./session";
import { frameTicks } from "./ticks";
import { TUNING, type Tuning } from "./tuning";

// Online co-op's sessions: the host's and its partner's, each behind the
// session interface, so the rules, the drawing, the sound and the input
// sources never know the game is online (see Co-op in CLAUDE.md).
//
// Each device runs its own player's inputs at once, at its own tick. The host
// orders every input, and its order is final: it takes the guest's at the
// tick the guest stamped, rolling its run back to put it there, unless that
// tick is already confirmed, when it moves it to its own tick now. It sends
// every input on to the guest in its final order, and confirms the run every
// half second, a fingerprint with it. The guest runs its own inputs ahead of
// the host's word and re-runs from the last confirmed run whenever the host's
// order differs from what it guessed.

// How long the host still takes a guest's input at the tick it was stamped:
// at least this many ticks after that tick, and up to a confirmation more.
export const REWIND_WINDOW = 50;

// How often the host confirms the run: a whole number of snapshots.
export const CONFIRM_TICKS = 50;

// The guest's clock drifting from the host's by fewer ticks than this is left
// alone; by more, it is pulled in a tick a frame; by more than the jump, at
// once (see `slewed`).
const CLOCK_DEADBAND = 2;
const CLOCK_JUMP = 10;

export interface Desync {
  tick: number;
  // This device's log, as a replay of the run to the tick that disagreed.
  replay: ReplayData;
}

export interface OnlineEvents {
  // The devices' confirmed runs disagree. The rules are deterministic, so
  // this is a bug: the game can't go on, and each device's log is reported
  // for the replay tools to find it.
  onDesync: (desync: Desync) => void;
}

export interface HostSession extends Session {
  receive: (message: GuestMessage) => void;
}

export interface GuestSession extends Session {
  receive: (message: HostPlay) => void;
}

// Messages are numbered from 0 by their sender and handled in that order,
// whatever order the network brings them in. PeerJS's reliable channel is
// ordered already; the numbers make the protocol not depend on it.
function inOrder<Message extends { seq: number }>(handle: (message: Message) => void): (message: Message) => void {
  let next = 0;
  const waiting = new Map<number, Message>();
  return (message) => {
    if (message.seq < next || waiting.has(message.seq)) {
      throw new Error(`frogmino co-op: message ${String(message.seq)} came twice`);
    }
    waiting.set(message.seq, message);
    for (let due = waiting.get(next); due !== undefined; due = waiting.get(next)) {
      waiting.delete(next);
      next++;
      handle(due);
    }
  };
}

function report(spec: CourseSpec, log: InputLog, tick: number, side: string): Desync {
  const desync = { tick, replay: { description: `The ${side}'s log of a co-op run that fell out of sync at tick ${String(tick)}`, course: spec, log, until: tick } };
  console.error(`frogmino co-op: out of sync at tick ${String(tick)}; the ${side}'s replay:`, JSON.stringify(desync.replay));
  return desync;
}

// The host's session: player 0, Sprout, and the authority on the order of
// every input.
export function hostSession(spec: CourseSpec, send: (message: HostPlay) => void, events: OnlineEvents, tuning: Tuning = TUNING): HostSession {
  const course = courseOf(spec, tuning);
  let timeline: Timeline = startTimeline(freshRun(course, tuning));
  // The final inputs before the timeline's confirmed run.
  let history: InputLog = [];
  let round = 0;
  let seq = 0;
  const store = createStore<SessionState>()(() => ({ course, run: timeline.run, log: [], carry: 0, runId: 0 }));

  // An input into the final order, at once, and on to the guest.
  function order(input: TimedInput, id?: number): void {
    timeline = withLog(timeline, inserted(timeline.log, input));
    send({ kind: "input", seq: seq++, ...input, ...(id === undefined ? {} : { id }) });
    store.setState({ run: timeline.run, log: [...history, ...timeline.log] });
  }

  function restart(): void {
    round++;
    timeline = startTimeline(freshRun(course, tuning));
    history = [];
    send({ kind: "restart", seq: seq++ });
    store.setState((s) => ({ run: timeline.run, log: [], carry: 0, runId: s.runId + 1 }));
  }

  return {
    store,
    input: (player: number, input: PlayerInput) => {
      if (player !== HOST_SLOT) throw new Error(`The host plays player ${String(HOST_SLOT)}, not ${String(player)}`);
      order({ tick: timeline.run.tick, player, input });
    },
    // Online, the clock is real time on both devices, so a frame is never
    // clamped: a tab coming back from the background catches up with its
    // partner, who played on.
    frame: (elapsed: number) => {
      const { ticks, carry } = frameTicks(store.getState().carry, elapsed, Infinity);
      timeline = advance(timeline, timeline.run.tick + ticks);
      const due = Math.floor((timeline.run.tick - REWIND_WINDOW) / CONFIRM_TICKS) * CONFIRM_TICKS;
      if (due > timeline.base.tick) {
        const confirmed = confirm(timeline, due);
        timeline = confirmed.timeline;
        history = [...history, ...confirmed.final];
        send({ kind: "confirm", seq: seq++, tick: due, hash: runHash(timeline.base) });
      }
      store.setState({ run: timeline.run, carry });
    },
    restart,
    receive: inOrder<GuestMessage>((message) => {
      switch (message.kind) {
        case "input": {
          // Meant for a round the host has since restarted.
          if (message.round !== round) return;
          const late = message.tick < timeline.base.tick;
          order({ tick: late ? timeline.run.tick : message.tick, player: GUEST_SLOT, input: message.input }, message.id);
          return;
        }
        case "restart":
          if (message.round === round) restart();
          return;
        case "ping":
          send({ kind: "pong", seq: seq++, at: message.at, tick: timeline.run.tick });
          return;
        case "desync":
          events.onDesync(report(spec, [...history, ...timeline.log], message.tick, "host"));
          return;
      }
    }),
  };
}

// The guest's inputs, in tick order, among the host's at their ticks: the
// host takes them as they reach it, after its own.
function merged(host: InputLog, mine: InputLog): TimedInput[] {
  const log: TimedInput[] = [];
  let j = 0;
  for (const input of host) {
    while (j < mine.length && mine[j].tick < input.tick) log.push(mine[j++]);
    log.push(input);
  }
  return [...log, ...mine.slice(j)];
}

// How many ticks a guest's frame runs, pulling its clock toward the host's
// by `lead` ticks (positive when the guest is behind): left alone within the
// deadband, a tick a frame beyond it, and at once past the jump, when holding
// back waits for the host as long as it takes.
function slewed(ticks: number, lead: number): { ticks: number; lead: number } {
  const pull = Math.abs(lead) > CLOCK_JUMP ? lead : Math.abs(lead) >= CLOCK_DEADBAND ? Math.sign(lead) : 0;
  const run = Math.max(0, ticks + pull);
  return { ticks: run, lead: lead - (run - ticks) };
}

interface Pending {
  id: number;
  input: TimedInput;
}

// The guest's session: player 1, Splash. It runs its own inputs at once and
// the host's as they come, and corrects to the host's order.
export function guestSession(spec: CourseSpec, send: (message: GuestMessage) => void, events: OnlineEvents, tuning: Tuning = TUNING): GuestSession {
  const course = courseOf(spec, tuning);
  let round = 0;
  let seq = 0;
  let nextId = 0;
  // The host's final inputs, before the confirmed run and from it on.
  let history: InputLog = [];
  let confirmed: InputLog = [];
  // The guest's inputs the host hasn't sent back yet, oldest first.
  let pending: Pending[] = [];
  let timeline: Timeline = startTimeline(freshRun(course, tuning));
  // Real time on this device, in ticks, and how far the host's clock is
  // thought to be ahead of the run's.
  let clock = 0;
  let lead = 0;
  const store = createStore<SessionState>()(() => ({ course, run: timeline.run, log: [], carry: 0, runId: 0 }));

  const ping = (): void => {
    send({ kind: "ping", seq: seq++, at: clock });
  };

  // The run as the guest thinks the host will have it: the host's inputs,
  // and the guest's own still on their way. One the host has confirmed past
  // will come back at a later tick, so it waits for that.
  function guessed(from: number): TimedInput[] {
    return merged(
      confirmed,
      pending.filter((p) => p.input.tick >= from).map((p) => p.input),
    );
  }

  function publish(): void {
    store.setState({ run: timeline.run, log: [...history, ...timeline.log] });
  }

  ping();
  return {
    store,
    input: (player: number, input: PlayerInput) => {
      if (player !== GUEST_SLOT) throw new Error(`The guest plays player ${String(GUEST_SLOT)}, not ${String(player)}`);
      const timed = { tick: timeline.run.tick, player, input };
      const id = nextId++;
      pending.push({ id, input: timed });
      send({ kind: "input", seq: seq++, round, id, tick: timed.tick, input });
      timeline = withLog(timeline, guessed(timeline.base.tick));
      publish();
    },
    frame: (elapsed: number) => {
      const due = frameTicks(store.getState().carry, elapsed, Infinity);
      clock += due.ticks;
      const pulled = slewed(due.ticks, lead);
      lead = pulled.lead;
      timeline = advance(timeline, timeline.run.tick + pulled.ticks);
      store.setState({ run: timeline.run, carry: due.carry });
    },
    restart: () => {
      send({ kind: "restart", seq: seq++, round });
    },
    receive: inOrder<HostPlay>((message) => {
      switch (message.kind) {
        case "input": {
          const { tick, player, input, id } = message;
          confirmed = inserted(confirmed, { tick, player, input });
          if (id !== undefined) {
            const mine = pending.shift();
            if (mine?.id !== id) throw new Error(`frogmino co-op: the host sent back input ${String(id)} out of turn`);
          }
          timeline = withLog(timeline, guessed(timeline.base.tick));
          publish();
          return;
        }
        case "confirm": {
          const run = runAt(timeline.base, confirmed, message.tick);
          if (runHash(run) !== message.hash) {
            events.onDesync(report(spec, [...history, ...confirmed], message.tick, "guest"));
            send({ kind: "desync", seq: seq++, tick: message.tick });
            return;
          }
          const split = confirmed.findIndex((input) => input.tick >= message.tick);
          const final = split === -1 ? confirmed.length : split;
          history = [...history, ...confirmed.slice(0, final)];
          confirmed = confirmed.slice(final);
          timeline = timelineFrom(run, guessed(message.tick), timeline.run.tick);
          publish();
          ping();
          return;
        }
        case "pong":
          lead = Math.round(message.tick + (clock - message.at) / 2 - timeline.run.tick);
          return;
        case "restart":
          round++;
          history = [];
          confirmed = [];
          pending = [];
          timeline = startTimeline(freshRun(course, tuning));
          store.setState((s) => ({ run: timeline.run, log: [], carry: 0, runId: s.runId + 1 }));
          ping();
          return;
      }
    }),
  };
}

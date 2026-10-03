import { describe, expect, it, vi } from "vitest";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { GUEST_SLOT, HOST_SLOT, parseGuestMessage, parseHostMessage, type GuestMessage, type HostPlay } from "./coop";
import { courseOf, type CourseSpec } from "./courses";
import { CONFIRM_TICKS, guestSession, hostSession, REWIND_WINDOW, type GuestSession, type HostSession, type OnlineEvents } from "./online";
import { runHash } from "./rollback";
import { replay, type FrogAction, type HeldAction, type PlayerInput } from "./run";
import { freshRun } from "./session";
import { TUNING, type Tuning } from "./tuning";

// Online co-op without a network: a host and a guest session joined by a
// simulated wire, in simulated time a tick at a time, with each message
// delayed by its own seeded amount, so messages overtake each other.

const TICK = 1 / 100;
const SPEC: CourseSpec = { kind: "coop" };

interface Link {
  // Each message takes `delay` ticks, plus up to `jitter` more.
  delay: number;
  jitter: number;
}

interface InFlight<Message> {
  at: number;
  message: Message;
}

// A one-way wire: what goes in comes out as plain data, checked as the
// lobby checks it, after its own delay.
function wire<Message>(link: Link, rng: Rng, parse: (value: unknown) => Message) {
  let flight: InFlight<Message>[] = [];
  let cut = false;
  return {
    send(now: number, message: unknown) {
      if (cut) return;
      const at = now + link.delay + Math.floor(rng.next() * (link.jitter + 1));
      flight.push({ at, message: parse(JSON.parse(JSON.stringify(message))) });
    },
    // The messages due by `now`, in the order they land.
    land(now: number): Message[] {
      const due = flight.filter((m) => m.at <= now).sort((a, b) => a.at - b.at);
      flight = flight.filter((m) => m.at > now);
      return due.map((m) => m.message);
    },
    cut() {
      cut = true;
      flight = [];
    },
  };
}

const ACTS: readonly FrogAction[] = ["left", "right", "rotateCcw", "rotateCw", "hop", "forward", "back"];
const HELD: readonly HeldAction[] = ["forward", "back", "left", "right"];

function randomInput(rng: Rng): PlayerInput {
  const roll = rng.next();
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rng.next() * list.length)];
  if (roll < 0.6) return { kind: "act", action: pick(ACTS) };
  if (roll < 0.8) return { kind: "press", action: pick(HELD) };
  if (roll < 0.97) return { kind: "release", action: pick(HELD) };
  return { kind: "releaseAll" };
}

interface Pair {
  host: HostSession;
  guest: GuestSession;
  now: number;
  // Runs `ticks` of simulated time: messages land, then each device's frame,
  // then each player maybe presses something.
  play: (ticks: number, inputRate?: number) => void;
  settle: () => void;
  toGuest: ReturnType<typeof wire<HostPlay>>;
  toHost: ReturnType<typeof wire<GuestMessage>>;
}

function pair({ seed, link, guestTuning = TUNING, events }: { seed: string; link: Link; guestTuning?: Tuning; events?: Partial<Record<"host" | "guest", OnlineEvents>> }): Pair {
  const rng = createRng(seed);
  const toGuest = wire<HostPlay>(link, rng, (value) => {
    const message = parseHostMessage(value);
    if (message.kind === "start" || message.kind === "full") throw new Error("not a message of play");
    return message;
  });
  const toHost = wire<GuestMessage>(link, rng, parseGuestMessage);
  const fail: OnlineEvents = {
    onDesync: (desync) => {
      throw new Error(`out of sync at ${String(desync.tick)}`);
    },
  };
  let now = 0;
  const host = hostSession(SPEC, (m) => toGuest.send(now, m), events?.host ?? fail);
  let guest: GuestSession | null = null;
  // The guest's clock starts as the start message reaches it.
  const startsAt = link.delay;
  const self: Pair = {
    host,
    get guest() {
      if (guest === null) throw new Error("the guest hasn't started");
      return guest;
    },
    get now() {
      return now;
    },
    toGuest,
    toHost,
    play(ticks, inputRate = 0) {
      for (let end = now + ticks; now < end; ) {
        now++;
        if (now === startsAt) guest = guestSession(SPEC, (m) => toHost.send(now, m), events?.guest ?? fail, guestTuning);
        for (const m of toHost.land(now)) host.receive(m);
        if (guest !== null) for (const m of toGuest.land(now)) guest.receive(m);
        host.frame(TICK);
        guest?.frame(TICK);
        if (rng.next() < inputRate) host.input(HOST_SLOT, randomInput(rng));
        if (guest !== null && rng.next() < inputRate) guest.input(GUEST_SLOT, randomInput(rng));
      }
    },
    // Long enough for the last input to reach the host, come back, and be
    // confirmed on both devices.
    settle() {
      self.play(2 * (link.delay + link.jitter) + REWIND_WINDOW + 2 * CONFIRM_TICKS + 10);
    },
  };
  return self;
}

// The run a straight replay of the host's final log gives at `tick`.
function replayed(spec: CourseSpec, log: Parameters<typeof replay>[1], tick: number) {
  return replay(freshRun(courseOf(spec), TUNING), log, tick);
}

function expectConverged({ host, guest }: Pair): void {
  const hostState = host.store.getState();
  const guestState = guest.store.getState();
  expect(guestState.log).toEqual(hostState.log);
  expect(runHash(hostState.run)).toBe(runHash(replayed(SPEC, hostState.log, hostState.run.tick)));
  expect(runHash(guestState.run)).toBe(runHash(replayed(SPEC, hostState.log, guestState.run.tick)));
}

describe("online co-op over a simulated network", () => {
  const links: Record<string, Link> = {
    "a LAN": { delay: 1, jitter: 1 },
    "the internet": { delay: 6, jitter: 6 },
    "a phone hotspot": { delay: 15, jitter: 25 },
  };
  for (const [name, link] of Object.entries(links)) {
    for (const seed of ["a", "b", "c"]) {
      it(`converges on ${name}, seed ${seed}, to the host's run, which its log replays`, () => {
        const sim = pair({ seed, link });
        sim.play(1500, 0.04);
        sim.settle();
        expectConverged(sim);
        // Both players did things, and both frogs moved.
        const log = sim.host.store.getState().log;
        expect(log.some((input) => input.player === HOST_SLOT)).toBe(true);
        expect(log.some((input) => input.player === GUEST_SLOT)).toBe(true);
      });
    }
  }

  it("keeps the guest's clock with the host's", () => {
    const sim = pair({ seed: "clock", link: { delay: 20, jitter: 4 } });
    sim.play(600);
    const drift = sim.guest.store.getState().run.tick - sim.host.store.getState().run.tick;
    expect(Math.abs(drift)).toBeLessThanOrEqual(5);
  });

  it("takes the guest's input at the guest's own tick, rolling the host back to it", () => {
    const sim = pair({ seed: "late", link: { delay: 10, jitter: 0 } });
    sim.play(200);
    const stamped = sim.guest.store.getState().run.tick;
    sim.guest.input(GUEST_SLOT, { kind: "act", action: "right" });
    const col = sim.guest.store.getState().run.frogs[GUEST_SLOT].col;
    sim.settle();
    const hostLog = sim.host.store.getState().log;
    expect(hostLog).toContainEqual({ tick: stamped, player: GUEST_SLOT, input: { kind: "act", action: "right" } });
    expect(sim.host.store.getState().run.frogs[GUEST_SLOT].col).toBe(col);
    expectConverged(sim);
  });

  it("moves an input that reaches the host after its window to the host's tick, and the guest follows", () => {
    // Each way takes longer than the window: every guest input is late.
    const sim = pair({ seed: "slow", link: { delay: REWIND_WINDOW + 60, jitter: 0 } });
    sim.play(400);
    const stamped = sim.guest.store.getState().run.tick;
    sim.guest.input(GUEST_SLOT, { kind: "act", action: "hop" });
    sim.play(300, 0.03);
    sim.settle();
    const mine = sim.host.store.getState().log.find((input) => input.player === GUEST_SLOT);
    expect(mine?.input).toEqual({ kind: "act", action: "hop" });
    expect(mine?.tick).toBeGreaterThan(stamped);
    expectConverged(sim);
  });

  it("starts over on either player's restart, dropping the old round's inputs on the wire", () => {
    const sim = pair({ seed: "restart", link: { delay: 8, jitter: 4 } });
    sim.play(300, 0.05);
    sim.guest.restart();
    // Inputs the guest makes before the restart comes back belong to the old round.
    sim.play(30, 0.2);
    sim.play(100, 0.05);
    sim.host.restart();
    sim.play(200, 0.05);
    sim.settle();
    expect(sim.host.store.getState().runId).toBe(2);
    expect(sim.guest.store.getState().runId).toBe(2);
    expectConverged(sim);
  });

  it("keeps the host playing when its partner vanishes mid-game", () => {
    const sim = pair({ seed: "gone", link: { delay: 5, jitter: 3 } });
    sim.play(300, 0.05);
    sim.toHost.cut();
    sim.toGuest.cut();
    const tick = sim.host.store.getState().run.tick;
    sim.play(300, 0.05);
    const { run, log } = sim.host.store.getState();
    expect(run.tick).toBe(tick + 300);
    expect(runHash(run)).toBe(runHash(replayed(SPEC, log, run.tick)));
  });

  it("fails loudly on both devices when their confirmed runs disagree", () => {
    const desyncs: string[] = [];
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sim = pair({
      seed: "desync",
      link: { delay: 3, jitter: 0 },
      // The guest's traffic drives a little faster: a stand-in for a rule
      // that isn't deterministic.
      guestTuning: { ...TUNING, wallSpeed: TUNING.wallSpeed * 1.01 },
      events: {
        host: { onDesync: (d) => desyncs.push(`host ${String(d.tick)} ${String(d.replay.log.length)}`) },
        guest: { onDesync: (d) => desyncs.push(`guest ${String(d.tick)}`) },
      },
    });
    // The first confirmation, of tick 50, goes at the host's tick 100.
    sim.play(150);
    expect(desyncs).toEqual(["guest 50", "host 50 0"]);
    expect(errors).toHaveBeenCalledTimes(2);
    errors.mockRestore();
  });

  it("refuses an input for the partner's frog", () => {
    const sim = pair({ seed: "slots", link: { delay: 1, jitter: 0 } });
    sim.play(5);
    expect(() => sim.host.input(GUEST_SLOT, { kind: "act", action: "hop" })).toThrow();
    expect(() => sim.guest.input(HOST_SLOT, { kind: "act", action: "hop" })).toThrow();
  });

  it("fails loudly on a message that comes twice", () => {
    const host = hostSession(SPEC, () => undefined, { onDesync: () => undefined });
    host.receive({ kind: "ping", seq: 0, at: 0 });
    expect(() => host.receive({ kind: "ping", seq: 0, at: 0 })).toThrow(/twice/);
  });
});

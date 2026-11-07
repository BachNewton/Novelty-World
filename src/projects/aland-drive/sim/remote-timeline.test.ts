import { describe, expect, it } from "vitest";
import { headingOf, LAMPS_OFF, type CarState } from "./car-state";
import { DEFAULT_CAR } from "./cars";
import { Timeline } from "./remote-timeline";

/** A car on its own client: 20 m/s north (-z), or round a circle when `turning`, at a time in ms on that client's clock. */
function carAt(ms: number, turning = 0): CarState {
  const t = ms / 1000;
  const speed = 20;
  const heading = turning * t;
  const position: CarState["position"] =
    turning === 0 ? [0, 0, -speed * t] : [(-speed / turning) * (1 - Math.cos(heading)), 0, (-speed / turning) * Math.sin(heading)];
  return {
    position,
    rotation: [0, Math.sin(heading / 2), 0, Math.cos(heading / 2)],
    velocity: [-Math.sin(heading) * speed, 0, -Math.cos(heading) * speed],
    spin: [0, turning, 0],
    car: DEFAULT_CAR,
    steer: 0,
    suspension: [0.1, 0.1, 0.1, 0.1],
    roll: 0,
    lamps: LAMPS_OFF,
  };
}

/** The sender's clock is its own: this far from the receiver's. */
const ORIGIN_MS = 5_000_000;
const SEND_MS = 50;
const DELAY_MS = 40;

/** Sends every 50 ms from `fromMs` to `toMs`, each heard after the usual delay unless `delays` says otherwise. */
function sends(fromMs: number, toMs: number, delays: (sentMs: number) => number = () => DELAY_MS, turning = 0) {
  const messages: { sentMs: number; heardMs: number; state: CarState }[] = [];
  for (let sentMs = fromMs; sentMs <= toMs; sentMs += SEND_MS) messages.push({ sentMs, heardMs: sentMs + delays(sentMs) + ORIGIN_MS, state: carAt(sentMs, turning) });
  return messages.sort((a, b) => a.heardMs - b.heardMs);
}

/** Plays the messages into a timeline, sampling every 10 ms of the receiver's clock: what was drawn at each. */
function play(messages: ReturnType<typeof sends>, untilMs: number): { ms: number; state: CarState }[] {
  const timeline = new Timeline();
  const drawn: { ms: number; state: CarState }[] = [];
  let next = 0;
  for (let now = ORIGIN_MS; now <= untilMs + ORIGIN_MS; now += 10) {
    for (; next < messages.length && messages[next].heardMs <= now; next++) {
      const { state, sentMs, heardMs } = messages[next];
      timeline.hear(state, now, { sentMs, heardMs, source: "them" });
    }
    if (next > 0) drawn.push({ ms: now, state: timeline.sample(now) });
  }
  return drawn;
}

/** How far each frame moved, as a speed. */
const speeds = (drawn: { ms: number; state: CarState }[]) =>
  drawn.slice(1).map(({ ms, state }, i) => Math.hypot(state.position[0] - drawn[i].state.position[0], state.position[2] - drawn[i].state.position[2]) / ((ms - drawn[i].ms) / 1000));

/** After the first second, while the lag settles, a car at 20 m/s never draws faster or slower than the lag's own drift allows. */
function expectSmooth(drawn: { ms: number; state: CarState }[]) {
  const settled = speeds(drawn.filter(({ ms }) => ms > ORIGIN_MS + 1000));
  expect(Math.min(...settled)).toBeGreaterThan(20 * 0.97);
  expect(Math.max(...settled)).toBeLessThan(20 * 1.03);
}

describe("a remote car's timeline", () => {
  it("shows the car half a send behind the messages' delay, whatever the two clocks read", () => {
    const drawn = play(sends(0, 3000), 3000);
    const last = drawn.at(-1);
    if (!last) throw new Error("nothing drawn");
    // Drawn at 3000 ms here, which is 3000 - 40 - 25 on the sender's clock.
    expect(last.state.position[2]).toBeCloseTo(carAt(3000 - DELAY_MS - SEND_MS / 2).position[2], 1);
    expectSmooth(drawn);
  });

  it("draws a late message's car as smoothly as one on time, carrying on through the wait", () => {
    expectSmooth(play(sends(0, 4000, (sentMs) => (sentMs === 2000 ? DELAY_MS + 150 : DELAY_MS)), 4000));
  });

  it("draws messages bunched behind a stalled connection smoothly", () => {
    // Everything sent in a 300 ms stall arrives at once at its end, in order, as TCP holds it back.
    const stalled = (sentMs: number) => (sentMs >= 2000 && sentMs < 2300 ? 2300 - sentMs + DELAY_MS : DELAY_MS);
    expectSmooth(play(sends(0, 4000, stalled), 4000));
  });

  it("puts messages heard out of order back in the order they were sent", () => {
    // Every other message overtakes the one before it.
    expectSmooth(play(sends(0, 3000, (sentMs) => (sentMs % 100 === 0 ? DELAY_MS + 30 : DELAY_MS)), 3000));
  });

  it("changes nothing for a message heard twice, however late the copy", () => {
    const messages = sends(0, 3000);
    const copy = messages[20];
    messages.push({ ...copy, heardMs: copy.heardMs + 900 });
    messages.sort((a, b) => a.heardMs - b.heardMs);
    expect(play(messages, 3000).map(({ state }) => state.position[2])).toEqual(play(sends(0, 3000), 3000).map(({ state }) => state.position[2]));
  });

  it("follows a bend between messages, not the straight line across it", () => {
    // A tight bend: 20 m/s round a 25 m radius. A straight line between two messages 1 m apart cuts in 5 mm.
    const turning = 0.8;
    const drawn = play(sends(0, 2000, () => DELAY_MS, turning), 2000).filter(({ ms }) => ms > ORIGIN_MS + 500);
    const radius = 20 / turning;
    for (const { state } of drawn) {
      expect(Math.abs(Math.hypot(state.position[0] + radius, state.position[2]) - radius)).toBeLessThan(0.001);
      expect(Math.abs(Math.atan2(-state.position[2], state.position[0] + radius) - headingOf(state.rotation))).toBeLessThan(0.001);
    }
  });

  it("puts a car somewhere rather than sliding it there", () => {
    const messages = sends(0, 2000).map((message) => (message.sentMs >= 1000 ? { ...message, state: { ...message.state, position: [500, 0, 300] as CarState["position"], velocity: [0, 0, 0] as CarState["velocity"] } } : message));
    const drawn = play(messages, 2000);
    for (const { state } of drawn) {
      const there = Math.abs(state.position[0] - 500) < 1e-6;
      // Either still driving north short of 1000 ms' place, or at the new place: never between.
      expect(there || (state.position[0] === 0 && state.position[2] >= carAt(1000).position[2] - 0.01)).toBe(true);
    }
    expect(drawn.at(-1)?.state.position[0]).toBeCloseTo(500, 6);
  });

  it("waits out a stall of seconds, and follows a sender whose clock moved within a second", () => {
    // Everything sent in a two-second stall arrives at once at its end, as TCP holds it back.
    const stalled = play(sends(0, 6000, (sentMs) => (sentMs >= 2000 && sentMs < 4000 ? 4000 - sentMs + DELAY_MS : DELAY_MS)), 6000);
    const atEnd = stalled.at(-1)?.state.position[2];
    expect(atEnd).toBeCloseTo(carAt(6000 - DELAY_MS - SEND_MS / 2).position[2], 1);
    // The sender's laptop slept for five seconds and its clock stood still: every message after reads five seconds late.
    const awake = sends(2000, 5000).map((message) => ({ ...message, heardMs: message.heardMs + 5000 }));
    const slept = play([...sends(0, 2000).slice(0, -1), ...awake], 10_000);
    const last = slept.at(-1);
    expect(last?.state.position[2]).toBeCloseTo(carAt(10_000 - 5000 - DELAY_MS - SEND_MS / 2).position[2], 1);
    // Followed within a second of waking: from then on it drives on smoothly.
    expectSmooth(slept.filter(({ ms }) => ms > ORIGIN_MS + 8000));
  });

  it("carries a car heard with no time on from when it was heard, with no lag", () => {
    const timeline = new Timeline();
    timeline.hear(carAt(0), 1000);
    expect(timeline.sample(1100).position[2]).toBeCloseTo(-2, 6);
    // But only for a while: a car whose sender has stopped waits.
    expect(timeline.sample(5000).position[2]).toBeCloseTo(-10, 6);
  });
});

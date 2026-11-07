// How smoothly another player's car is drawn when its states come over a real network: late, jittered, bunched by a
// stalled connection. Counted, not timed, and with no clock: a car drives a known path on a sender at its display's
// frame rate and sends its car as the game does, a seeded network delays each message, holding back every one behind a
// stalled one as a TCP connection does, and a receiver at its own frame rate hears them and draws its stand-in
// (`sim/remote-cars.ts`). Each drawn frame is compared with the path itself, shown that much later.
//
//   npx tsx src/projects/aland-drive/tools/remote-twitch.ts
//
// Twitch is how far each frame's movement is from the path's own movement over that frame, as a velocity (m/s) and a
// turn rate (°/s), once the best constant delay is taken out: a car shown smoothly but late scores zero. Each network
// is measured twice: with states heard untimed, shown as of when they arrived, as a version of the game that sends no
// time is heard, and timed.

import RAPIER from "@dimforge/rapier3d-compat";
import { wireState } from "../net/protocol";
import { initPhysics } from "../sim/drive";
import { headingOf, LAMPS_OFF, type CarState } from "../sim/car-state";
import { DEFAULT_CAR } from "../sim/cars";
import { RemoteCars } from "../sim/remote-cars";
import { STEP_S } from "../sim/tuning";

interface Network {
  name: string;
  /** The shortest a message takes, sender to receiver, through the relay and the host. */
  baseMs: number;
  /** The mean of the exponential delay on top of that. */
  jitterMs: number;
  /** The chance a message is stalled (a lost packet resent), and how long. */
  stallChance: number;
  stallMs: readonly [number, number];
}

/**
 * A perfect network, to tell the game's own twitch from the network's. Helsinki to Helsinki through the relay in Stockholm and a host in Helsinki: four 5–6 ms legs. A US player to a
 * Helsinki host: the Atlantic once each way to the relay. Two US players with the host in Europe: their messages
 * cross it twice. A lost packet stalls a connection for about a round trip.
 */
const NETWORKS: readonly Network[] = [
  { name: "No jitter", baseMs: 22, jitterMs: 0, stallChance: 0, stallMs: [0, 0] },
  { name: "Helsinki", baseMs: 22, jitterMs: 3, stallChance: 0.005, stallMs: [30, 100] },
  { name: "US–Helsinki", baseMs: 85, jitterMs: 6, stallChance: 0.01, stallMs: [120, 250] },
  { name: "US–US via EU", baseMs: 165, jitterMs: 10, stallChance: 0.015, stallMs: [200, 400] },
];

const SECONDS = 60;
const WARM_UP_S = 3;
/** The sender's display: 144 Hz, which sends every seventh or eighth frame, unevenly, and a frame in fifty dropped. */
const SENDER_FRAME_MS = 1000 / 144;
const DROPPED_FRAMES = 0.02;
/** The receiver's display: the owner's laptop. */
const RECEIVER_FRAME_MS = 10;
/** The game's own: 20 a second, counted in steps since the last send. */
const SEND_EVERY_STEPS = 6;
const MOST_STEPS_A_FRAME = 12;
const STEP_MS = STEP_S * 1000;
/** The receiver's clock starts elsewhere than the sender's, as two pages' do. */
const RECEIVER_ORIGIN_MS = 73_421.7;

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth bump from 0 up to 1 and back over a span, and nothing outside it. */
const bump = (t: number, from: number, to: number) => (t < from || t > to ? 0 : Math.sin((Math.PI * (t - from)) / (to - from)) ** 2);

/**
 * The path, every millisecond: a sweeping road at 75–120 km/h, with bends one way and the other, and what a driver
 * throws in: every 13 s a hard stop's braking from about 100 km/h by 20 km/h and the pull back up, and every 9 s a
 * quick swerve left and right.
 */
interface Path {
  x: Float64Array;
  z: Float64Array;
  heading: Float64Array;
  speed: Float64Array;
  turn: Float64Array;
}

function drivePath(): Path {
  const count = SECONDS * 1000 + 2000;
  const path: Path = { x: new Float64Array(count), z: new Float64Array(count), heading: new Float64Array(count), speed: new Float64Array(count), turn: new Float64Array(count) };
  for (let i = 0; i < count; i++) {
    const t = i / 1000;
    path.turn[i] = 0.22 * Math.sin((2 * Math.PI * t) / 7) + 0.06 * Math.sin((2 * Math.PI * t) / 2.3) + 0.45 * Math.sin((2 * Math.PI * ((t % 9) - 3)) / 0.8) * (t % 9 >= 3 && t % 9 <= 3.8 ? 1 : 0);
    if (i === 0) {
      path.speed[i] = 27;
      continue;
    }
    const pull = ((6 * 2 * Math.PI) / 11) * Math.cos((2 * Math.PI * t) / 11) - 9 * bump(t % 13, 5, 6.2) + 4.5 * bump(t % 13, 6.2, 8.6);
    path.speed[i] = path.speed[i - 1] + pull / 1000;
    path.heading[i] = path.heading[i - 1] + path.turn[i] / 1000;
    path.x[i] = path.x[i - 1] - (Math.sin(path.heading[i]) * path.speed[i]) / 1000;
    path.z[i] = path.z[i - 1] - (Math.cos(path.heading[i]) * path.speed[i]) / 1000;
  }
  return path;
}

function at(values: Float64Array, ms: number): number {
  const i = Math.max(0, Math.min(values.length - 2, Math.floor(ms)));
  const share = ms - i;
  return values[i] + (values[i + 1] - values[i]) * share;
}

function stateOn(path: Path, ms: number): CarState {
  const heading = at(path.heading, ms);
  const speed = at(path.speed, ms);
  const x = at(path.x, ms);
  const z = at(path.z, ms);
  return {
    position: [x, 0.5, z],
    rotation: [0, Math.sin(heading / 2), 0, Math.cos(heading / 2)],
    velocity: [-Math.sin(heading) * speed, 0, -Math.cos(heading) * speed],
    spin: [0, at(path.turn, ms), 0],
    car: DEFAULT_CAR,
    steer: 0,
    suspension: [0.1, 0.1, 0.1, 0.1],
    roll: [0, 0, 0, 0],
    lamps: LAMPS_OFF,
  };
}

/** A message on the wire: its state, when it was sent on the sender's clock, and when it arrives on the receiver's. */
interface Message {
  state: CarState;
  sentMs: number;
  arrivesMs: number;
}

function send(path: Path, network: Network, random: () => number): Message[] {
  const messages: Message[] = [];
  let now = 0;
  let owedMs = 0;
  let steps = 0;
  let owedSteps = 0;
  let lastArrival = -Infinity;
  while (now < SECONDS * 1000) {
    const frame = random() < DROPPED_FRAMES ? 2 * SENDER_FRAME_MS : SENDER_FRAME_MS;
    now += frame;
    owedMs += frame;
    const stepped = Math.min(Math.floor(owedMs / STEP_MS), MOST_STEPS_A_FRAME);
    owedMs = Math.min(owedMs - stepped * STEP_MS, STEP_MS);
    steps += stepped;
    owedSteps += stepped;
    if (owedSteps < SEND_EVERY_STEPS) continue;
    owedSteps = 0;
    const sentMs = steps * STEP_MS;
    const stall = random() < network.stallChance ? network.stallMs[0] + random() * (network.stallMs[1] - network.stallMs[0]) : 0;
    const arrives = now + network.baseMs - Math.log(1 - random()) * network.jitterMs + stall;
    // One connection, in order: a message waits for every one sent before it.
    lastArrival = Math.max(arrives, lastArrival);
    messages.push({ state: wireState(stateOn(path, sentMs)), sentMs, arrivesMs: lastArrival + RECEIVER_ORIGIN_MS });
  }
  return messages;
}

interface Spread {
  rms: number;
  p99: number;
  max: number;
}

interface Twitch {
  /** The constant delay the drawn car fits the path best at. */
  delayMs: number;
  velocity: Spread;
  turn: Spread;
  /** Shares of frames whose movement is off by more than 1 m/s, or whose turn is off by more than 10°/s. */
  velocityOff: number;
  turnOff: number;
}

function spread(values: number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  return { rms: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length), p99: sorted[Math.floor(sorted.length * 0.99)], max: sorted[sorted.length - 1] };
}

const unwrapped = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** With `timed`, each state is heard with when it was sent; without, as of when it arrived. */
function measureTwitch(rapier: RAPIER.World, network: Network, timed: boolean, seed = 1): Twitch {
  rapier.timestep = STEP_S;
  const random = seeded(seed);
  const path = drivePath();
  const messages = send(path, network, random);
  const remotes = new RemoteCars(rapier);
  const drawn: { ms: number; x: number; z: number; heading: number }[] = [];
  let next = 0;
  let owedMs = 0;
  for (let now = 0; now < SECONDS * 1000; now += RECEIVER_FRAME_MS) {
    const local = now + RECEIVER_ORIGIN_MS;
    for (; next < messages.length && messages[next].arrivesMs <= local; next++) {
      const { state, sentMs, arrivesMs } = messages[next];
      remotes.hear("car", state, timed ? { sentMs, heardMs: arrivesMs, source: "sender" } : undefined);
    }
    owedMs += RECEIVER_FRAME_MS;
    const stepped = Math.min(Math.floor(owedMs / STEP_MS), MOST_STEPS_A_FRAME);
    owedMs = Math.min(owedMs - stepped * STEP_MS, STEP_MS);
    remotes.setClock(local - owedMs - stepped * STEP_MS);
    if (next === 0) continue;
    for (let step = 0; step < stepped; step++) {
      remotes.steer([]);
      rapier.step();
      remotes.settle();
    }
    const state = remotes.stateAt("car", owedMs / STEP_MS);
    drawn.push({ ms: now, x: state.position[0], z: state.position[2], heading: headingOf(state.rotation) });
  }
  const frames = drawn.filter(({ ms }) => ms >= WARM_UP_S * 1000);
  const errors = (delayMs: number) => {
    const velocity: number[] = [];
    const turn: number[] = [];
    for (let i = 1; i < frames.length; i++) {
      const [a, b] = [frames[i - 1], frames[i]];
      const seconds = (b.ms - a.ms) / 1000;
      const [from, to] = [a.ms - delayMs, b.ms - delayMs];
      const pathX = at(path.x, to) - at(path.x, from);
      const pathZ = at(path.z, to) - at(path.z, from);
      velocity.push(Math.hypot(b.x - a.x - pathX, b.z - a.z - pathZ) / seconds);
      const pathTurn = at(path.heading, to) - at(path.heading, from);
      turn.push((Math.abs(unwrapped(b.heading - a.heading - pathTurn)) / seconds) * (180 / Math.PI));
    }
    return { velocity, turn };
  };
  let best = { delayMs: 0, score: Infinity };
  for (let delayMs = 0; delayMs <= 800; delayMs++) {
    const { velocity } = errors(delayMs);
    const score = velocity.reduce((sum, value) => sum + value * value, 0);
    if (score < best.score) best = { delayMs, score };
  }
  const { velocity, turn } = errors(best.delayMs);
  return {
    delayMs: best.delayMs,
    velocity: spread(velocity),
    turn: spread(turn),
    velocityOff: velocity.filter((value) => value > 1).length / velocity.length,
    turnOff: turn.filter((value) => value > 10).length / turn.length,
  };
}

await initPhysics();
console.log("network        timed  delay ms   velocity off m/s (rms / p99 / max)   turn off °/s (rms / p99 / max)   frames off >1 m/s   >10 °/s");
for (const network of NETWORKS) for (const timed of [false, true]) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const r = measureTwitch(world, network, timed);
  world.free();
  const f = (value: number, digits = 2) => value.toFixed(digits).padStart(6);
  console.log(
    `${network.name.padEnd(14)} ${(timed ? "yes" : "no").padEnd(5)} ${f(r.delayMs, 0).padStart(6)}   ${f(r.velocity.rms)} / ${f(r.velocity.p99)} / ${f(r.velocity.max)}           ${f(r.turn.rms)} / ${f(r.turn.p99)} / ${f(r.turn.max)}         ${`${(r.velocityOff * 100).toFixed(1)}%`.padStart(6)}        ${`${(r.turnOff * 100).toFixed(1)}%`.padStart(6)}`,
  );
}

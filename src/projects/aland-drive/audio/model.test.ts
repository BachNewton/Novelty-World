import { describe, expect, it } from "vitest";
import { mix, noJolts, readJolts, restingEngine, slipOf, stepEngine, type DriveAudioState, type EngineRead } from "./model";
import type { CarState } from "../sim/car-state";
import { engineCycle, gravelLoop, noiseLoop, shoreBed } from "./synthesis";
import { ENGINE_IDS, ENGINES } from "./vehicles";

const state = (changes: Partial<DriveAudioState> = {}): DriveAudioState => ({
  vehicle: "skerry-gt",
  speedMS: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  slip: 0,
  surface: "asphalt",
  suspension: [0.11, 0.11, 0.11, 0.11],
  place: { forest: 0, shore: 0, town: 0 },
  ...changes,
});

const STEP = 1 / 60;

describe("the gearbox", () => {
  for (const id of ENGINE_IDS) {
    it(`${id} climbs every gear flat out, keeps under its redline and doesn't hunt`, () => {
      const spec = ENGINES[id];
      let read: EngineRead = restingEngine(spec);
      let shifts = 0;
      let highest = 0;
      for (let speed = 0; speed < 55; speed += 0.08) {
        const stepped = stepEngine(spec, read, speed, 1, STEP);
        read = stepped.read;
        highest = Math.max(highest, read.rpm);
        if (stepped.shifted) shifts++;
      }
      expect(highest).toBeLessThanOrEqual(spec.redlineRpm * 1.01);
      expect(shifts).toBeLessThanOrEqual(spec.gearTopMS.length - 1);
      for (let speed = 55; speed > 0; speed -= 0.15) {
        const stepped = stepEngine(spec, read, speed, 0, STEP);
        read = stepped.read;
        if (stepped.shifted) shifts++;
      }
      expect(read.gear).toBe(0);
      expect(shifts).toBeLessThanOrEqual(2 * (spec.gearTopMS.length - 1));
    });

    it(`${id} holds one gear at a steady cruise`, () => {
      const spec = ENGINES[id];
      for (const speed of [8, 14, 20, 27, 33, 42, 50]) {
        for (const throttle of [0.2, 0.5, 0.8]) {
          let read = restingEngine(spec);
          for (let i = 0; i < 300; i++) read = stepEngine(spec, read, speed, throttle, STEP).read;
          let shifts = 0;
          for (let i = 0; i < 300; i++) {
            const stepped = stepEngine(spec, read, speed, throttle, STEP);
            read = stepped.read;
            if (stepped.shifted) shifts++;
          }
          expect(shifts).toBe(0);
        }
      }
    });
  }
});

describe("the jolts", () => {
  const run = (frames: DriveAudioState[]) => {
    let jolts = noJolts();
    return frames.flatMap((frame) => {
      const read = readJolts(jolts, frame, STEP);
      jolts = read.jolts;
      return read.heard.map(({ sound }) => sound);
    });
  };

  it("hears the hardest braking as nothing", () => {
    const frames = Array.from({ length: 200 }, (_, i) => state({ speedMS: Math.max(0, 50 - (14 * i) / 60) }));
    expect(run(frames)).toEqual([]);
  });

  it("hears a wall as one crash, however long the car takes to stop", () => {
    const frames = [...Array.from({ length: 30 }, () => state({ speedMS: 40 })), ...Array.from({ length: 6 }, (_, i) => state({ speedMS: 40 - 6.6 * (i + 1) })), ...Array.from({ length: 20 }, () => state())];
    expect(run(frames).filter((sound) => sound === "crash")).toHaveLength(1);
  });

  it("hears a road's slow swell as nothing, and a kerb as a thud", () => {
    const swell = Array.from({ length: 120 }, (_, i) => state({ suspension: [0.11 + 0.04 * Math.sin(i / 20), 0.11, 0.11, 0.11] }));
    expect(run(swell)).toEqual([]);
    expect(run([state(), state({ suspension: [0.2, 0.11, 0.11, 0.11] })])).toEqual(["thud"]);
  });

  it("hears a bump stop once, as the wheel arrives", () => {
    const stop = state({ suspension: [0.3, 0.11, 0.11, 0.11] });
    const sounds = run([state(), { ...stop }, { ...stop }, { ...stop }]);
    expect(sounds.filter((sound) => sound === "bump-stop")).toHaveLength(1);
  });
});

describe("the mix", () => {
  const mixed = (changes: Partial<DriveAudioState>) => mix({ state: state(changes), engine: null, time: 0, wander: 0 });

  it("gives a flying car no tyres, and a paused one only its place", () => {
    const flying = mixed({ speedMS: 40, surface: "gravel", suspension: [0, 0, 0, 0] });
    expect(flying.gravelLevel + flying.rumbleLevel + flying.asphaltLevel).toBe(0);
    const paused = mixed({ speedMS: 40, paused: true, place: { forest: 1, shore: 0, town: 0 } });
    expect(paused.windLowLevel + paused.asphaltLevel + paused.engineLevel).toBe(0);
    expect(paused.forestLevel).toBeGreaterThan(0);
  });

  it("lets wind and road rise with speed", () => {
    const [slow, fast] = [mixed({ speedMS: 15 }), mixed({ speedMS: 50 })];
    expect(fast.windLowLevel).toBeGreaterThan(slow.windLowLevel * 3);
    expect(fast.asphaltHz).toBeGreaterThan(slow.asphaltHz);
  });
});

describe("the slide", () => {
  const car = (velocity: [number, number, number]): CarState => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1], velocity, spin: [0, 0, 0], steer: 0, suspension: [0.1, 0.1, 0.1, 0.1], roll: 0 });

  it("reads motion along the nose as none and motion across it as sliding", () => {
    expect(slipOf(car([0, 0, -40]), false)).toBe(0);
    expect(slipOf(car([8, 0, -20]), false)).toBe(1);
  });
});

describe("the loops", () => {
  const jump = (channel: Float32Array) => Math.abs(channel[0] - channel[channel.length - 1]);

  it("wrap without a click", () => {
    for (const loop of [engineCycle(ENGINES["skerry-gt"], 1), engineCycle(ENGINES["diesel-van"], 2), gravelLoop(), shoreBed()]) {
      const channel = loop.channels[0];
      const biggest = channel.reduce((most, sample, i) => (i === 0 ? most : Math.max(most, Math.abs(sample - channel[i - 1]))), 0);
      expect(jump(channel)).toBeLessThanOrEqual(biggest);
    }
  });

  it("are the same each visit", () => {
    expect(engineCycle(ENGINES["old-estate"], 5).channels[0]).toEqual(engineCycle(ENGINES["old-estate"], 5).channels[0]);
    expect(noiseLoop().channels[0][1000]).toBe(noiseLoop().channels[0][1000]);
  });
});

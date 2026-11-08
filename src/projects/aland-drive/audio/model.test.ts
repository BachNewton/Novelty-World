import { describe, expect, it } from "vitest";
import { bellStrikesBetween, heardAt, mix, noJolts, placeMix, voicesHeard, readJolts, slipOf, type DriveAudioState, type Mix } from "./model";
import { CONDITIONS, SURFACES, type Surface } from "../sim/surfaces";
import { LAMPS_OFF, type CarState } from "../sim/car-state";
import { engineCycle, gravelLoop, rainHeavyLoop, rainLightLoop, rockLoop, shoreBed, snowLoop, sprayLoop, studsLoop } from "./synthesis";
import { ENGINES } from "./vehicles";

const state = (changes: Partial<DriveAudioState> = {}): DriveAudioState => ({
  vehicle: "skerry-gt",
  speedMS: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  slip: 0,
  wheels: ["asphalt", "asphalt", "asphalt", "asphalt"],
  condition: "dry",
  tyres: "summer",
  suspension: [0.11, 0.11, 0.11, 0.11],
  place: { forest: 0, shore: 0, town: 0 },
  ...changes,
});

const STEP = 1 / 60;

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
    const flying = mixed({ speedMS: 40, wheels: ["gravel", "gravel", "gravel", "gravel"], suspension: [0, 0, 0, 0] });
    expect(flying.gravelLevel + flying.rumbleLevel + flying.asphaltLevel).toBe(0);
    const paused = mixed({ speedMS: 40, paused: true, place: { forest: 1, shore: 0, town: 0 } });
    expect(paused.windLowLevel + paused.asphaltLevel + paused.engineLevel).toBe(0);
    expect(paused.birdsLevel).toBeGreaterThan(0);
  });

  it("lets wind and road rise with speed", () => {
    const [slow, fast] = [mixed({ speedMS: 15 }), mixed({ speedMS: 50 })];
    expect(fast.windLowLevel).toBeGreaterThan(slow.windLowLevel * 3);
    expect(fast.asphaltHz).toBeGreaterThan(slow.asphaltHz);
  });
});

describe("the tyres", () => {
  const mixed = (changes: Partial<DriveAudioState>) => mix({ state: state({ speedMS: 25, ...changes }), engine: null, time: 0, wander: 0 });
  const all = (surface: Surface): Surface[] => [surface, surface, surface, surface];

  it("hears each wheel's own surface: two on the verge is half grass, and a wheel in the air is on nothing", () => {
    const [road, verge, edge] = [mixed({ wheels: all("asphalt") }), mixed({ wheels: all("grass") }), mixed({ wheels: ["asphalt", "grass", "asphalt", "grass"] })];
    expect(edge.asphaltLevel).toBeCloseTo(road.asphaltLevel / 2);
    expect(edge.grassLevel).toBeCloseTo(verge.grassLevel / 2);
    const lifted = mixed({ wheels: ["asphalt", "grass", "asphalt", "grass"], suspension: [0.11, 0, 0.11, 0] });
    expect(lifted.grassLevel).toBe(0);
    expect(lifted.asphaltLevel).toBeCloseTo(edge.asphaltLevel);
  });

  it("squeals on tarmac, and scrabbles and spits stones on gravel", () => {
    const [tarmac, gravel] = [mixed({ slip: 1 }), mixed({ slip: 1, wheels: all("gravel") })];
    expect(tarmac.squealLevel).toBeGreaterThan(0);
    expect(tarmac.stonesPerS).toBe(0);
    expect(gravel.squealLevel).toBe(0);
    expect(gravel.stonesPerS).toBeGreaterThan(5);
    expect(gravel.gravelLevel).toBeGreaterThan(mixed({ wheels: all("gravel") }).gravelLevel);
  });

  it("sprays when wet on every surface, crunches in snow without a stone, and is near silent rolling on ice until it slides", () => {
    for (const surface of SURFACES) {
      const tyres = (level: Mix) => level.asphaltLevel + level.gravelLevel + level.grassLevel + level.rockLevel + level.snowLevel + level.sprayLevel;
      const [dry, wet, snow, ice] = CONDITIONS.map((condition) => mixed({ wheels: all(surface), condition }));
      expect(wet.sprayLevel).toBeGreaterThan(0);
      expect(dry.sprayLevel + snow.sprayLevel + ice.sprayLevel).toBe(0);
      expect(snow.snowLevel).toBeGreaterThan(0);
      expect(mixed({ wheels: all(surface), condition: "snow", slip: 1 }).stonesPerS).toBe(0);
      expect(tyres(ice)).toBeLessThan(tyres(dry) / 8);
      const sliding = mixed({ wheels: all(surface), condition: "ice", slip: 1 });
      expect(sliding.hissLevel).toBeGreaterThan(mixed({ wheels: all(surface), slip: 1 }).hissLevel);
    }
  });
});

describe("the slide", () => {
  const car = (velocity: [number, number, number]): CarState => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1], velocity, spin: [0, 0, 0], car: "skerry-gt", steer: 0, suspension: [0.1, 0.1, 0.1, 0.1], roll: [0, 0, 0, 0], lamps: LAMPS_OFF });

  it("reads motion along the nose as none and motion across it as sliding", () => {
    expect(slipOf(car([0, 0, -40]), false)).toBe(0);
    expect(slipOf(car([8, 0, -20]), false)).toBe(1);
  });
});

describe("the loops", () => {
  const jump = (channel: Float32Array) => Math.abs(channel[0] - channel[channel.length - 1]);

  it("wrap without a click", () => {
    for (const loop of [engineCycle(ENGINES["skerry-gt"]), engineCycle(ENGINES.kobb), gravelLoop(), rockLoop(), snowLoop(), sprayLoop(), studsLoop(), rainLightLoop(), rainHeavyLoop(), shoreBed()]) {
      const channel = loop.channels[0];
      const biggest = channel.reduce((most, sample, i) => (i === 0 ? most : Math.max(most, Math.abs(sample - channel[i - 1]))), 0);
      expect(jump(channel)).toBeLessThanOrEqual(biggest);
    }
  });

});

describe("the weather", () => {
  const heard = (weather: DriveAudioState["weather"], changes: Partial<DriveAudioState> = {}) => mix({ state: state({ weather, ...changes }), engine: null, time: 0, wander: 0 });

  it("drums rain on the roof only while it rains, harder the harder it falls, and still while the drive is stopped", () => {
    const rainOf = (mixed: Mix) => mixed.rainLightLevel + mixed.rainHeavyLevel;
    expect(rainOf(heard({ rain: 0, snowfall: 0, windMS: 5 }))).toBe(0);
    expect(rainOf(heard({ rain: 0.8, snowfall: 0, windMS: 5 }))).toBeGreaterThan(rainOf(heard({ rain: 0.2, snowfall: 0, windMS: 5 })));
    expect(rainOf(heard({ rain: 0.5, snowfall: 0, windMS: 5 }, { paused: true }))).toBeGreaterThan(0);
  });

  it("is drops one by one in light rain and a hiss in heavy rain, and harder driving into it", () => {
    const light = heard({ rain: 0.15, snowfall: 0, windMS: 5 });
    expect(light.rainLightLevel).toBeGreaterThan(light.rainHeavyLevel);
    const heavy = heard({ rain: 0.9, snowfall: 0, windMS: 5 });
    expect(heavy.rainHeavyLevel).toBeGreaterThan(heavy.rainLightLevel);
    expect(heard({ rain: 0.4, snowfall: 0, windMS: 5 }, { speedMS: 40 }).rainHeavyLevel).toBeGreaterThan(heard({ rain: 0.4, snowfall: 0, windMS: 5 }).rainHeavyLevel);
  });

  it("blows a wind of its own only past a breeze, rising with its speed", () => {
    expect(heard({ rain: 0, snowfall: 0, windMS: 2 }).galeLevel).toBe(0);
    expect(heard({ rain: 0, snowfall: 0, windMS: 15 }).galeLevel).toBeGreaterThan(heard({ rain: 0, snowfall: 0, windMS: 8 }).galeLevel);
    expect(heard(undefined).galeLevel).toBe(0);
  });
});

describe("the place by the season and the hour", () => {
  const forest = { forest: 1, shore: 0, town: 0 };
  const shore = { forest: 0, shore: 1, town: 0 };

  it("has no birdsong in January, by day or by night, but a crow or a tit by day", () => {
    const winterDay = placeMix(forest, { yearDay: 20, sunDeg: 7, hour: 12, leafed: 0, iceReach: 0.3 });
    const winterNight = placeMix(forest, { yearDay: 20, sunDeg: -40, hour: 23, leafed: 0, iceReach: 0.3 });
    expect(winterDay.birdsLevel).toBe(0);
    expect(winterNight.birdsLevel + winterNight.winterCallsLevel).toBe(0);
    expect(winterDay.winterCallsLevel).toBeGreaterThan(0);
  });

  it("sings loudest at a spring dawn, less at noon and in rain, and hardly on a light midsummer night", () => {
    const at = (sunDeg: number, hour: number, rain = 0) => placeMix(forest, { yearDay: 140, sunDeg, hour, leafed: 1, iceReach: 0 }, { rain, snowfall: 0, windMS: 4 }).birdsLevel;
    expect(at(1, 4)).toBeGreaterThan(at(50, 13) * 1.5);
    expect(at(50, 13, 0.8)).toBeLessThan(at(50, 13) * 0.4);
    expect(at(-6.5, 1)).toBeLessThan(at(50, 13) * 0.25);
  });

  it("swaps the waves for wind over ice when the sea freezes", () => {
    const open = placeMix(shore, { yearDay: 20, sunDeg: 7, hour: 12, leafed: 0, iceReach: 0 });
    const frozen = placeMix(shore, { yearDay: 40, sunDeg: 15, hour: 12, leafed: 0, iceReach: 0.8 });
    expect(frozen.shoreLevel).toBe(0);
    expect(frozen.iceLevel).toBeGreaterThan(open.iceLevel);
  });

  it("laps at a lake rather than breaking, and goes quiet to the ice when the lake freezes", () => {
    const lake = { forest: 0.6, shore: 0, town: 0, lake: 0.4 };
    const summer = placeMix(lake, { yearDay: 190, sunDeg: 40, hour: 14, leafed: 1, iceReach: 0 });
    expect(summer.lakeLevel).toBeGreaterThan(0);
    expect(summer.shoreLevel + summer.gullsPerS).toBe(0);
    const winter = placeMix(lake, { yearDay: 20, sunDeg: 7, hour: 12, leafed: 0, iceReach: 0.3 });
    expect(winter.lakeLevel).toBe(0);
    expect(winter.iceLevel).toBeGreaterThan(0);
  });
});

describe("sounds placed in the world", () => {
  const facingNorth = { x: 0, z: 0, rightX: 1, rightZ: 0 };

  it("comes from its own side, and falls off with distance", () => {
    expect(heardAt(facingNorth, 30, 0, 1).pan).toBeCloseTo(1, 9);
    expect(heardAt(facingNorth, -30, 0, 1).pan).toBeCloseTo(-1, 9);
    expect(heardAt(facingNorth, 0, -30, 1).pan).toBeCloseTo(0, 9);
    expect(heardAt(facingNorth, 0, -200, 1).gain).toBeLessThan(heardAt(facingNorth, 0, -20, 1).gain);
    expect(heardAt(facingNorth, 0, -5000, 1).gain).toBe(0);
  });

  it("plays only the loudest heard, up to the budget", () => {
    const sounds = [
      { id: "far", x: 0, z: -400, loudness: 1 },
      { id: "near", x: 0, z: -20, loudness: 1 },
      { id: "loud", x: 0, z: -100, loudness: 8 },
      { id: "gone", x: 0, z: -9000, loudness: 1 },
    ];
    expect(voicesHeard(facingNorth, sounds, 2).map(({ id }) => id)).toEqual(["loud", "near"]);
    expect(voicesHeard(facingNorth, sounds, 10).map(({ id }) => id)).not.toContain("gone");
    expect(voicesHeard(facingNorth, sounds, 0)).toEqual([]);
  });
});

describe("the church bells", () => {
  const DAY_S = 1800;
  const strikesOver = (from: number, to: number, step = 0.002) => {
    let strikes = 0;
    for (let hour = from; hour < to; hour += step) strikes += bellStrikesBetween(hour, hour + step, DAY_S);
    return strikes;
  };

  it("strikes each hour's number by day, frame by frame, and nothing at night", () => {
    expect(strikesOver(14.9, 15.5)).toBe(3);
    expect(strikesOver(11.9, 12.5)).toBe(12);
    expect(strikesOver(1.5, 6.5)).toBe(0);
    expect(strikesOver(21.9, 22.5)).toBe(0);
  });

  it("strikes nothing for a jump of the clock", () => {
    expect(bellStrikesBetween(9.9, 15.1, DAY_S)).toBe(0);
  });
});

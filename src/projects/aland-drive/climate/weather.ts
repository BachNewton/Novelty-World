import type { Condition } from "../sim/surfaces";
import { seasonDayOf, type CalendarDate } from "./calendar";
import { dayMeanAt, normalsAt, snowShareAt, wetnessAt } from "./climate";
import { clamp01, ease, roll, smoothstep, wander } from "./noise";
import { snowAt } from "./season";

/*
 * The weather, shared: a pure function of the world's clock and the date, so every player has the same sky and the
 * same road with nothing sent. Fronts wander along the game's own days (the clock in game days, the same for
 * everyone), so a wet spell lasts a few game days and a dry one a few more; the date says which month's climate they
 * wander in, and the real day's warmth and wetness (`climate.ts`) lean on them. Nothing switches: every value eases
 * from one state to the next, and the named state is only a reading of them.
 *
 * How often it rains, how cloudy it is and how often a morning is foggy are each held to the month's numbers by
 * reading the wandering against its own spread (`calibration`), so the rates come out right whatever shape the
 * wandering has. Rain or snow is the temperature's call. The road remembers: wet for some hours after rain, snowy
 * for a few after snow before the ploughs clear it, and icy where a wet road meets frost.
 */

/** When the weather is asked for. `time/day.ts` gives the date and hour; the game days are the world's clock over `GAME_DAY_S`. */
export interface ClimateTime {
  /** Åland's date: its season. */
  date: CalendarDate;
  /** How far through that date real time is, 0 to 1 (a date a link holds stays at its noon). */
  through: number;
  /** The hour shown, 0 to 24: what the fog and the day's warmth follow. */
  hour: number;
  /** The world's clock in game days, the same for every player: what the fronts follow. */
  gameDays: number;
}

export const WEATHER_STATES = ["clear", "cloud", "overcast", "rain", "snowfall", "fog"] as const;
/** The weather's name at a moment, for a readout or a sound's pick: a reading of the values, which never switch. */
export type WeatherState = (typeof WEATHER_STATES)[number];

export interface Weather {
  /** How much of the sky is cloud, 0 to 1. */
  cloudCover: number;
  /** How hard it rains, 0 to 1. */
  rain: number;
  /** How hard it snows, 0 to 1. */
  snowfall: number;
  /** How thick the fog, 0 to 1: the climate's fog is light, under 0.6, and 1 is kept for a challenge's thick one. */
  fog: number;
  windMS: number;
  /** The way the wind blows from, degrees clockwise from true north (not the grid's). */
  windFromDeg: number;
  temperatureC: number;
  /** How wet the road is, 0 to 1, rain or meltwater in the last hours. */
  roadWet: number;
  /** How much fresh snow lies on the road, 0 to 1, before the ploughs clear it. */
  roadSnow: number;
  /** How icy the road is, 0 to 1: a wet road frozen. */
  blackIce: number;
  /** How strong an aurora is now, 0 to 1, if the night is dark enough to show it: the sky's darkness is the renderer's. */
  aurora: number;
  /** What the grip reads (`sim/surfaces.ts`). */
  condition: Condition;
  state: WeatherState;
}

/** How much of an aurora the clouds leave to see. */
export const clearForAurora = (cloudCover: number) => 1 - smoothstep(0.3, 0.7, cloudCover);

const SALT = { front: 201, shower: 202, cloud: 203, wind: 204, windWay: 205, fog: 206, fogAt: 207, fogThick: 208, evening: 209, aurora: 210, auroraBurst: 211 } as const;

/** The fronts and showers: one number whose height is how near to raining it is. */
const wetSignal = (gameDays: number) => 0.8 * wander(gameDays / 1.6, SALT.front) + 0.5 * wander(gameDays * 3, SALT.shower);
/** The cloud: mostly the same fronts, and a wandering of its own. */
const cloudSignal = (gameDays: number, wet: number) => 0.6 * wet + 0.7 * wander(gameDays / 1.1, SALT.cloud);

/** How far above its threshold the wet signal must be for full rain. */
const RAIN_SPAN = 0.45;
/** How far the cloud signal reaches to take the cover from 60% to clear or full. */
const CLOUD_SLOPE = 0.9;

/** Sorted samples of a signal, to read a share off: the value it exceeds that share of the time. */
const exceeding = (sorted: Float64Array, share: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((1 - share) * sorted.length)))];

/** Samples a game day is read at for whether it rained: the tests count wet days the same way. */
export const SAMPLES_PER_GAME_DAY = 12;

let calibration: { wetDayPeaks: Float64Array; clouds: Float64Array } | null = null;

/**
 * The wet signal's highest point in each of many game days, and the cloud signal at every sample, sorted: a game
 * day is wet when its peak passes the threshold, so the threshold that makes a share of days wet is read straight
 * off them. Worked out once, the same on every machine.
 */
function calibrated() {
  if (calibration) return calibration;
  const days = 20_000;
  const perDay = SAMPLES_PER_GAME_DAY;
  const wetDayPeaks = new Float64Array(days);
  const clouds = new Float64Array(days * perDay);
  for (let day = 0; day < days; day++) {
    let peak = -Infinity;
    for (let sample = 0; sample < perDay; sample++) {
      const at = day + sample / perDay;
      const wet = wetSignal(at);
      if (wet > peak) peak = wet;
      clouds[day * perDay + sample] = cloudSignal(at, wet);
    }
    wetDayPeaks[day] = peak;
  }
  calibration = { wetDayPeaks: wetDayPeaks.sort(), clouds: clouds.sort() };
  return calibration;
}


/** A bump from 0 to 1 and back over an hour span, smooth at both ends, 0 outside it. */
function bump(hour: number, from: number, to: number) {
  if (hour <= from || hour >= to) return 0;
  const t = (hour - from) / (to - from);
  const up = t < 0.3 ? ease(t / 0.3) : 1;
  const down = t > 0.5 ? ease((1 - t) / 0.5) : 1;
  return Math.min(up, down);
}

/** The day's swing of temperature, −1 at dawn's coldest (05:00) to 1 at the afternoon's warmest (15:00). */
function daySwing(hour: number) {
  const h = (((hour - 5) % 24) + 24) % 24;
  return h < 10 ? -1 + 2 * ease(h / 10) : 1 - 2 * ease((h - 10) / 14);
}

/** The sky at a moment, before the road: everything that has no memory. Cheaper than `weatherAt`, for sampling a whole year. */
export function skyAt(seasonDay: number, hour: number, gameDays: number) {
  const normals = normalsAt(seasonDay);
  const { wetDayPeaks, clouds } = calibrated();

  const wet = wetSignal(gameDays);
  const wetDay = Math.min(0.9, normals.wetDay * wetnessAt(seasonDay));
  const precipitation = clamp01((wet - exceeding(wetDayPeaks, wetDay)) / RAIN_SPAN);

  const cloudy = clamp01(0.6 + (cloudSignal(gameDays, wet) - exceeding(clouds, normals.cloudier)) * CLOUD_SLOPE);
  const cloudCover = Math.max(cloudy, smoothstep(0, 0.15, precipitation) * (0.85 + 0.15 * precipitation));

  const swing = (normals.rangeC / 2) * (1.3 - 0.8 * cloudCover);
  const temperatureC = dayMeanAt(seasonDay) + swing * daySwing(hour) - 1.5 * precipitation * (1 - normals.winter);
  const snow = snowShareAt(temperatureC);

  // A shown day keeps one roll from its midnight to the next, so a page whose hour is moved gets no jump mid-morning.
  const shownDay = Math.round(gameDays - hour / 24);
  const morning = roll(shownDay, SALT.fog) < normals.fogDay ? bump(hour, 3 + 2 * roll(shownDay, SALT.fogAt), 11 + roll(shownDay, SALT.fogAt + 1)) : 0;
  const evening = roll(shownDay, SALT.evening) < normals.fogDay / 3 ? bump(hour, 19, 23.9) : 0;
  const fogThickness = 0.3 + 0.25 * roll(shownDay, SALT.fogThick);
  const fog = Math.max(morning, evening) * fogThickness * (1 - precipitation);

  const windMS = normals.windMS * (0.55 + 0.45 * wander(gameDays / 0.8, SALT.wind) + 0.6 * precipitation);
  const windFromDeg = (((225 + 70 * wander(gameDays / 1.3, SALT.windWay)) % 360) + 360) % 360;

  // An aurora night is chosen from noon to noon, so the night it belongs to doesn't change at midnight.
  const night = Math.round(gameDays - (hour - 12) / 24);
  const auroraNight = roll(night, SALT.aurora) < normals.auroraNight ? 1 : 0;
  const lateHour = (((hour + 12) % 24) + 24) % 24;
  const aurora = auroraNight * bump(lateHour, 8.5, 15.5) * (0.4 + 0.6 * clamp01(wander(gameDays * 40, SALT.auroraBurst) + 0.5)) * clearForAurora(cloudCover);

  return { cloudCover, rain: precipitation * (1 - snow), snowfall: precipitation * snow, fog, windMS, windFromDeg, temperatureC, aurora, normals };
}

/** How many game days back the road remembers rain, and snow before the ploughs. */
const DRIES_IN = { summer: 5 / 24, winter: 12 / 24 } as const;
const PLOUGHED_IN = 6 / 24;
/** The road's memory is read from samples on a fixed lattice of game time, so every player reads the same ones. */
const MEMORY_STEP = 1 / 48;

type Sky = ReturnType<typeof skyAt>;

/** Water on the road: rain, falling snow that melts as it lands, and lying snow thawing in a mild hour. */
const meltwater = (sky: Sky, snowCover: number) => sky.rain + smoothstep(0, 1.5, sky.temperatureC) * (0.5 * sky.snowfall + 0.6 * snowCover);

/**
 * The road: the most rain and the most snow it has had lately, each fading to nothing over the time it takes to dry
 * or be ploughed. The past is read at the lattice's samples and now; a sample comes in at no age, equal to now, and
 * leaves faded to nothing, so the road never jumps.
 */
function roadAt(sky: Sky, seasonDay: number, hour: number, gameDays: number) {
  const snowCover = snowAt(seasonDay).cover;
  const driesIn = DRIES_IN.summer + (DRIES_IN.winter - DRIES_IN.summer) * sky.normals.winter;
  const span = Math.max(driesIn, PLOUGHED_IN);
  let wet = meltwater(sky, snowCover);
  let snow = sky.snowfall;
  for (let at = Math.floor(gameDays / MEMORY_STEP) * MEMORY_STEP; at > gameDays - span; at -= MEMORY_STEP) {
    const age = gameDays - at;
    // Read at the hour it was, as the shared clock's game days carry it; a page whose hour is moved reads it shifted the same.
    const then = skyAt(seasonDay, hour - age * 24, at);
    wet = Math.max(wet, meltwater(then, snowCover) * clamp01(1 - age / driesIn));
    snow = Math.max(snow, then.snowfall * clamp01(1 - age / PLOUGHED_IN));
  }
  return { roadWet: wet, roadSnow: snow };
}

/** The weather at a moment. */
export function weatherAt({ date, through, hour, gameDays }: ClimateTime): Weather {
  const seasonDay = seasonDayOf(date, through);
  const sky = skyAt(seasonDay, hour, gameDays);
  const { roadWet, roadSnow } = roadAt(sky, seasonDay, hour, gameDays);
  const blackIce = roadWet * smoothstep(0.5, -1.5, sky.temperatureC) * (1 - smoothstep(0.1, 0.4, roadSnow));

  return withReading({
    cloudCover: sky.cloudCover,
    rain: sky.rain,
    snowfall: sky.snowfall,
    fog: sky.fog,
    windMS: sky.windMS,
    windFromDeg: sky.windFromDeg,
    temperatureC: sky.temperatureC,
    roadWet,
    roadSnow,
    blackIce,
    aurora: sky.aurora,
  });
}

/** The weather's values with what they read as: the ground's condition and the state's name. */
export function withReading(values: Omit<Weather, "condition" | "state">): Weather {
  const { cloudCover, rain, snowfall, fog, roadWet, roadSnow, blackIce } = values;
  const condition: Condition = roadSnow > 0.15 ? "snow" : blackIce > 0.3 ? "ice" : roadWet > 0.1 ? "wet" : "dry";
  const state: WeatherState = fog > 0.2 ? "fog" : snowfall > 0.1 ? "snowfall" : rain > 0.1 ? "rain" : cloudCover > 0.85 ? "overcast" : cloudCover > 0.35 ? "cloud" : "clear";
  return { ...values, condition, state };
}

/** Whether a game day had rain or snow, read as the calibration reads it: for the tests and the readout. */
export function wetGameDay(seasonDay: number, gameDay: number) {
  for (let sample = 0; sample < SAMPLES_PER_GAME_DAY; sample++) {
    const at = gameDay + sample / SAMPLES_PER_GAME_DAY;
    const sky = skyAt(seasonDay, (sample / SAMPLES_PER_GAME_DAY) * 24, at);
    if (sky.rain + sky.snowfall > 0) return true;
  }
  return false;
}

import { createNight, DARKEST_LIGHT, skyAtHour, NIGHT_STOPS, type Night } from "../art/night";
import type { MoonPlace } from "../time/sky-places";
import type { Sky, SkyLook } from "../art/sky/sky";
import { createLiveSun, type LiveSun } from "../art/sun";
import { DayClock, gameTimeAt, type CalendarDate, type GameTime } from "../time/day";
import type { Weather } from "../climate/weather";
import { eased, gloomedNight, sunThrough, weatheredLook } from "./weather";

/*
 * The game's day, as the render sees it: each frame the hour is read off the world's clock, the live sun moves to
 * where it stands, and the night's one dial (`art/night`) follows the sun's height, so dusk, the lamps and the lit
 * windows come when the real sun says, not by a dial of their own. The sky takes the look for that dial, with the real
 * sun in it, and the weather's grey lid, storm and fog over it (`render/weather.ts`), which also hide the sun, lower the
 * light and bring the lamps on early through the same dials.
 */

/** The sun's height at each of the night's looks: the golden hour, dusk, and the deepest midsummer night. */
const HEIGHT_AT_STOP: readonly [height: number, amount: number][] = [
  [25, NIGHT_STOPS.day],
  [6, NIGHT_STOPS.golden],
  [-1.5, NIGHT_STOPS.dusk],
  [-6.5, NIGHT_STOPS.night],
];

/** The night's dial for a sun this high: 0 by full day, 1 once it is as deep as Åland's midsummer night. */
export function nightAmount(elevationDeg: number) {
  const [first] = HEIGHT_AT_STOP;
  if (elevationDeg >= first[0]) return first[1];
  for (let at = 1; at < HEIGHT_AT_STOP.length; at++) {
    const [high, from] = HEIGHT_AT_STOP[at - 1];
    const [low, to] = HEIGHT_AT_STOP[at];
    if (elevationDeg >= low) return from + ((high - elevationDeg) / (high - low)) * (to - from);
  }
  return NIGHT_STOPS.night;
}

/** Where the night is fully dark, as the astronomers count it: the sun this far under the horizon. */
const FULL_DARK_DEG = -18;
/** A full moon well up takes this share of the dark away. */
const MOON_LIGHTS = 0.5;
const MOON_UP_DEG = 12;

const smooth = (share: number) => {
  const clamped = Math.min(1, Math.max(0, share));
  return clamped * clamped * (3 - 2 * clamped);
};

/** How far a night has gone past Åland's midsummer night towards full dark, 0 to 1, lightened by the moon when it's up. */
export function darkness(elevationDeg: number, moon: MoonPlace) {
  const deep = HEIGHT_AT_STOP[HEIGHT_AT_STOP.length - 1][0];
  const dark = smooth((deep - elevationDeg) / (deep - FULL_DARK_DEG));
  const moonlit = moon.lit * smooth((moon.elevationDeg + 1) / (MOON_UP_DEG + 1));
  return dark * (1 - MOON_LIGHTS * moonlit);
}

/** How late it is by the clock, for the rooms that go dark: rising from 22:00 to 01:00, and gone again from 04:00 to 06:00. */
export function lateness(hour: number) {
  const sinceTen = (hour - 22 + 24) % 24;
  if (sinceTen < 3) return smooth(sinceTen / 3);
  if (sinceTen < 6) return 1;
  return 1 - smooth((sinceTen - 6) / 2);
}

const SKY_COLOURS = ["zenith", "horizon", "horizonSun", "band", "bandSun", "glow", "cloudLit", "cloudShade", "cloudRim", "landLight"] as const;

/** A sky look taken towards a winter night's dark. */
function darkened(look: SkyLook, dark: number): SkyLook {
  const by = 1 + (DARKEST_LIGHT - 1) * dark;
  const next = { ...look };
  for (const name of SKY_COLOURS) next[name] = look[name].clone().multiplyScalar(by);
  return next;
}

export interface DayAndNight {
  clock: DayClock;
  sun: LiveSun;
  night: Night;
  /** The hour last drawn. */
  time: () => GameTime;
  /** The weather last drawn, eased towards the weather now: none on a tool's page. */
  weather: () => Weather | null;
  /**
   * Each frame, before drawing: the world's clock in seconds, the seconds the game's own clock moved, and the real
   * seconds since the last frame, which ease the weather in even while the game is held.
   */
  update: (worldSeconds: number, gameSeconds: number, realSeconds: number) => void;
}

/** The weather at a moment of the page's time. */
export type WeatherOfDay = (time: GameTime) => Weather | null;

export function createDayAndNight(sky: Sky, start: { gameDays: number; date: CalendarDate | null }, weatherOf: WeatherOfDay): DayAndNight {
  const clock = new DayClock(start.gameDays, start.date);
  // The clock is read first on the first frame, whose world clock `?sea=` may have moved.
  let time = gameTimeAt(start.gameDays, start.date);
  let weather = weatherOf(time);
  const sun = createLiveSun(time.sun);
  const night = createNight(nightAmount(time.sun.elevationDeg));
  const lookAtHour = skyAtHour();
  const show = () => {
    sun.setSun(time.sun, sunThrough(weather));
    const gloomed = gloomedNight(nightAmount(time.sun.elevationDeg), darkness(time.sun.elevationDeg, time.moon), weather);
    night.amount.value = gloomed.amount;
    night.dark.value = gloomed.dark;
    night.late.value = lateness(time.hour);
    sky.setLook({ ...darkened(weatheredLook(lookAtHour(night.amount.value), weather, night.amount.value), night.dark.value), sun: time.sun });
  };
  show();
  return {
    clock,
    sun,
    night,
    time: () => time,
    weather: () => weather,
    update(worldSeconds, gameSeconds, realSeconds) {
      time = clock.at(worldSeconds);
      weather = eased(weather, weatherOf(time), realSeconds);
      night.seconds.value += gameSeconds;
      show();
    },
  };
}

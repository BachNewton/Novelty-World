import { conditionAsked, type Condition } from "../sim/surfaces";
import { alandOffsetHours, DayClock, GAME_DAY_S, type GameTime } from "../time/day";
import { HELD_WEATHER, isHeldWeather, type HeldWeather } from "./held";
import { weatherAt, type ClimateTime, type Weather } from "./weather";

/*
 * The climate's time from the page's day (`time/day.ts`), and the weather the game draws and drives on from it. The
 * date and hour are the day's, so a page whose day a link or the dev menu has moved has that day's weather; the fronts
 * follow the world's clock, the same for every player whatever their hour.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The climate's time for a day shown at a moment of the world's clock. A held date stays at its noon; the real one moves through the day with real time. */
export function climateTimeOf(time: GameTime, seconds: number, dateHeld: boolean): ClimateTime {
  const realMs = seconds * 1000;
  const localDays = (realMs + alandOffsetHours(realMs) * HOUR_MS) / DAY_MS;
  return { date: time.date, through: dateHeld ? 0.5 : localDays - Math.floor(localDays), hour: time.hour, gameDays: seconds / GAME_DAY_S };
}

const sharedDay = new DayClock();

/** The climate's time every player shares at a moment of the world's clock. */
export const climateTimeAt = (seconds: number) => climateTimeOf(sharedDay.at(seconds), seconds, false);

/** A weather a link holds (`?weather=rain`), or none. `?weather` alone asks a tool's page for the live weather. */
export function weatherAsked(search: string): HeldWeather | null {
  const asked = new URLSearchParams(search).get("weather");
  if (asked === null || asked === "") return null;
  if (!isHeldWeather(asked)) throw new Error(`?weather= takes one of ${Object.keys(HELD_WEATHER).join(", ")}, not ${asked}`);
  return asked;
}

/**
 * The weather a page draws and drives on: the shared one, unless a link (`?weather=`) or the dev menu holds one. The
 * ground's condition is the weather's, unless a link (`?condition=`) or the dev menu's Ground holds one. A tool's or a
 * test's page (on tiles of its own, or driven by automation) draws no weather and stays dry, so a measurement doesn't
 * change with the hour it ran at, unless it asks for the weather with `?weather`.
 */
export function weatherFeed(search: string, automated: boolean) {
  const query = new URLSearchParams(search);
  const tool = (query.has("tiles") || automated) && !query.has("weather");
  let held: HeldWeather | null = weatherAsked(search);
  let ground: Condition | null = conditionAsked(search) ?? (tool ? "dry" : null);
  let last: Weather | null = null;
  return {
    /** The weather now, or none on a tool's page. */
    at(time: GameTime, seconds: number, dateHeld: boolean): Weather | null {
      if (tool && held === null) return (last = null);
      return (last = held === null ? weatherAt(climateTimeOf(time, seconds, dateHeld)) : HELD_WEATHER[held]);
    },
    /** The ground's condition for the drive, from the weather last read. */
    condition: (): Condition => ground ?? last?.condition ?? "dry",
    /** Holds a weather, or lets the shared one run with null. */
    hold(weather: HeldWeather | null) {
      held = weather;
    },
    holdGround(condition: Condition) {
      ground = condition;
    },
    held: () => held,
  };
}

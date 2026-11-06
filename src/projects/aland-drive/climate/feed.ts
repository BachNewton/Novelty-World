import { conditionAsked, type Condition } from "../sim/surfaces";
import type { GameTime } from "../time/day";
import { HELD_WEATHER, isHeldWeather, type HeldWeather } from "./held";
import { weatherAt, type ClimateTime, type Weather } from "./weather";

/*
 * The climate's time from the page's time (`time/day.ts`), and the weather the game draws and drives on from it: the
 * game's calendar, which the online world shares, so every player in it has the same weather, and a page whose time a
 * link or the dev menu has moved has that time's weather. The fronts follow the calendar's game days.
 */

/** The climate's time at a moment of the game's calendar: the date it shows, how far through it, the hour and the game days. */
export const climateTimeOf = ({ date, through, hour, gameDays }: GameTime): ClimateTime => ({ date, through, hour, gameDays });

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
    at(time: GameTime): Weather | null {
      if (tool && held === null) return (last = null);
      return (last = held === null ? weatherAt(climateTimeOf(time)) : HELD_WEATHER[held]);
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

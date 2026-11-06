import { conditionAsked, type Condition } from "../sim/surfaces";
import { dateOfDayNumber, parseDate, type CalendarDate } from "./calendar";
import { GAME_DAY_S } from "../time/day";
import { weatherAt, type ClimateTime } from "./weather";

/*
 * The climate's time from the world's clock (`sea/clock.ts`), and the ground's condition the drive reads from it.
 *
 * The game day's length is the day's own (`time/day.ts`). The date and hour are still the climate's own reading of the
 * clock, so a page whose hour is moved by `?hour=` or the dev menu doesn't yet read the weather at that hour.
 */

/** Åland's clocks against UTC, ignoring summer time: it moves only the hour the date turns over, by one. */
const ALAND_OFFSET_DAYS = 2 / 24;

/** The climate's time at a moment of the world's clock: the real date (or one a link holds, at its noon) and the fast hour. */
export function climateTimeAt(seconds: number, heldDate: CalendarDate | null = null): ClimateTime {
  const realDays = seconds / 86_400 + ALAND_OFFSET_DAYS;
  const gameDays = seconds / GAME_DAY_S;
  return {
    date: heldDate ?? dateOfDayNumber(realDays),
    through: heldDate ? 0.5 : realDays - Math.floor(realDays),
    hour: (gameDays - Math.floor(gameDays)) * 24,
    gameDays,
  };
}

/** The date a link holds (`?date=2027-01-20`), the same parameter the game's day reads. */
export function dateAsked(search: string): CalendarDate | null {
  const asked = new URLSearchParams(search).get("date");
  return asked === null ? null : parseDate(asked);
}

/**
 * The ground's condition for the drive: the weather's, unless a link (`?condition=`) or the dev menu holds one. A
 * tool's or a test's page (on tiles of its own, or driven by automation) stays dry, so a measurement doesn't change
 * with the hour it ran at, unless it asks for the weather with `?weather`.
 */
export function groundCondition(search: string, automated: boolean) {
  const query = new URLSearchParams(search);
  const date = dateAsked(search);
  const tool = (query.has("tiles") || automated) && !query.has("weather");
  let held: Condition | null = conditionAsked(search) ?? (tool ? "dry" : null);
  return {
    at: (seconds: number): Condition => held ?? weatherAt(climateTimeAt(seconds, date)).condition,
    hold(condition: Condition) {
      held = condition;
    },
  };
}

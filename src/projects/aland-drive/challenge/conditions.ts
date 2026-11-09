import { HELD_WEATHER } from "../climate/held";
import { withReading, type Weather } from "../climate/weather";
import { tyresFor } from "../racers/field";
import type { Condition, Tyre } from "../sim/surfaces";
import { gameDayOfDate, gameDaysOf } from "../time/calendar";
import { GAME_DAY_S, gameTimeAt, parseDate, type CalendarDate, type GameTime } from "../time/day";

/*
 * The conditions a bucket list challenge is played in (`ideas/bucket-list.md`): its date, the hour its attempt starts at
 * and its weather, whatever the shared world has, so its target always means the same thing. They are the player's
 * own: the world's clock runs on beneath them, for everyone else and for this browser's save, and a co-op partner
 * reads the same ones from the same challenge, so nothing is sent. The hour runs on from the start at the game's pace,
 * on the attempt's own clock, so a run can race the sunset, a retry starts at the same hour again, and a paused solo
 * run's sky stands still with it. The weather holds through the attempt.
 */

export const CHALLENGE_WEATHERS = ["clear", "cloud", "overcast-wet", "rain", "fog", "snowfall", "ice"] as const;
export type ChallengeWeather = (typeof CHALLENGE_WEATHERS)[number];

export interface ChallengeConditions {
  date: CalendarDate;
  /** The hour the attempt starts at, on the game's clock. */
  hour: number;
  weather: ChallengeWeather;
}

/** The climate's fog stays under 0.6; a challenge's is thicker, the one thick fog the game has. */
const THICK_FOG = 0.85;

const WEATHER: Record<ChallengeWeather, Weather> = {
  clear: HELD_WEATHER.clear,
  cloud: HELD_WEATHER.cloud,
  "overcast-wet": withReading({ ...HELD_WEATHER.overcast, roadWet: 1 }),
  rain: HELD_WEATHER.rain,
  fog: withReading({ ...HELD_WEATHER.fog, fog: THICK_FOG, cloudCover: 0.85 }),
  snowfall: HELD_WEATHER.snowfall,
  ice: HELD_WEATHER.ice,
};

/** A challenge's conditions, as the list writes them: a real date, the hour and the weather. */
export const conditions = (date: string, hour: number, weather: ChallengeWeather): ChallengeConditions => ({ date: parseDate(date), hour, weather });

export const weatherOf = ({ weather }: ChallengeConditions): Weather => WEATHER[weather];

/** The ground's condition the challenge is driven and measured in. */
export const conditionOf = (held: ChallengeConditions): Condition => weatherOf(held).condition;

/** The tyres the challenge's car is handed on, and measured on: winter ones on snow and ice, as the racers have. */
export const tyresOf = (held: ChallengeConditions): Tyre => tyresFor(conditionOf(held));

/** The ground and tyres a challenge is driven on, as its targets file records what par was measured in. */
export const groundText = (held: ChallengeConditions) => `${conditionOf(held)} on ${tyresOf(held)}`;

/** The time a challenge shows this far into its attempt: its date, at its hour run on by the attempt's clock from the green light. */
export function timeOf({ date, hour }: ChallengeConditions, attemptS: number): GameTime {
  const start = gameDaysOf({ year: date.year, month: date.month, day: gameDayOfDate(date), hour });
  return gameTimeAt(start + Math.max(0, attemptS) / GAME_DAY_S, date);
}

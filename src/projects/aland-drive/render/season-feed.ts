import { seasonAt } from "../climate/season";
import { alandDate, alandOffsetHours, dateText, type GameTime } from "../time/day";
import { createLiveSeason, dialsOf, type LiveSeason } from "../art/season";

/*
 * The season the game draws, from its day: the real date's dials, eased through the real day so nothing seasonal
 * jumps at midnight, or a held date's (`?date=`, the dev menu's Day) at its noon.
 */

const DAY_S = 86_400;

/** How far through Åland's real date the world's clock is, or a held date's noon. */
export function throughDate(time: GameTime, worldSeconds: number) {
  const ms = worldSeconds * 1000;
  if (dateText(alandDate(ms)) !== dateText(time.date)) return 0.5;
  const local = worldSeconds + alandOffsetHours(ms) * 3600;
  return (local - Math.floor(local / DAY_S) * DAY_S) / DAY_S;
}

export interface SeasonFeed {
  season: LiveSeason;
  /** Each frame, after the day: the day shown and the world's clock. */
  update: (time: GameTime, worldSeconds: number) => void;
}

export function createSeasonFeed(time: GameTime, worldSeconds: number): SeasonFeed {
  const dialsAt = (at: GameTime, seconds: number) => dialsOf(seasonAt(at.date, throughDate(at, seconds)));
  const season = createLiveSeason(dialsAt(time, worldSeconds));
  return {
    season,
    update(at, seconds) {
      season.set(dialsAt(at, seconds));
    },
  };
}

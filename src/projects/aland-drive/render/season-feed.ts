import { seasonAt } from "../climate/season";
import { alandDate, alandOffsetHours, dateText, type GameTime } from "../time/day";
import type { Weather } from "../climate/weather";
import { createLiveSeason, dialsOf, type LiveSeason } from "../art/season";

/*
 * The season the game draws, from its day: the real date's dials, eased through the real day so nothing seasonal
 * jumps at midnight, or a held date's (`?date=`, the dev menu's Day) at its noon. A fresh fall whitens the land with the
 * road while the road still has it (the weather's `roadSnow`), over whatever snow the season has lying.
 */

const DAY_S = 86_400;
/** How deep a fresh fall lies, centimetres, when the road is fully under it. */
const FRESH_CM = 4;

/** How far through Åland's real date the world's clock is, or a held date's noon. */
export function throughDate(time: GameTime, worldSeconds: number) {
  const ms = worldSeconds * 1000;
  if (dateText(alandDate(ms)) !== dateText(time.date)) return 0.5;
  const local = worldSeconds + alandOffsetHours(ms) * 3600;
  return (local - Math.floor(local / DAY_S) * DAY_S) / DAY_S;
}

export interface SeasonFeed {
  season: LiveSeason;
  /** Each frame, after the day: the day shown, the world's clock and the weather drawn. */
  update: (time: GameTime, worldSeconds: number, weather: Weather | null) => void;
}

export function createSeasonFeed(time: GameTime, worldSeconds: number): SeasonFeed {
  const dialsAt = (at: GameTime, seconds: number) => dialsOf(seasonAt(at.date, throughDate(at, seconds)));
  const season = createLiveSeason(dialsAt(time, worldSeconds));
  return {
    season,
    update(at, seconds, weather) {
      const dials = dialsAt(at, seconds);
      const fresh = weather?.roadSnow ?? 0;
      season.set({ ...dials, snowCover: Math.max(dials.snowCover, fresh), snowDepthCm: Math.max(dials.snowDepthCm, fresh * FRESH_CM) });
    },
  };
}

/** An aurora a link holds (`?aurora=0.8`), to see one whatever the weather; the night still has to be dark. */
export function auroraAsked(search: string): number | null {
  const asked = new URLSearchParams(search).get("aurora");
  if (asked === null) return null;
  const strength = asked === "" ? 1 : Number(asked);
  if (!(strength >= 0 && strength <= 1)) throw new Error(`?aurora= takes a strength from 0 to 1, such as 0.8, not ${asked}`);
  return strength;
}

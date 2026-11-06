import { seasonAt } from "../climate/season";
import type { GameTime } from "../time/day";
import type { Weather } from "../climate/weather";
import { createLiveSeason, dialsOf, type LiveSeason } from "../art/season";

/*
 * The season the game draws, from its time: the dials of the date the game's calendar shows, eased through to the next
 * as the date runs on, so nothing seasonal jumps, or a held date's (`?date=`) at its noon. A fresh fall whitens the land with the
 * road while the road still has it (the weather's `roadSnow`), over whatever snow the season has lying.
 */

/** How deep a fresh fall lies, centimetres, when the road is fully under it. */
const FRESH_CM = 4;

export interface SeasonFeed {
  season: LiveSeason;
  /** Each frame, after the day: the time shown and the weather drawn. */
  update: (time: GameTime, weather: Weather | null) => void;
}

export function createSeasonFeed(time: GameTime): SeasonFeed {
  const dialsAt = (at: GameTime) => dialsOf(seasonAt(at.date, at.through));
  const season = createLiveSeason(dialsAt(time));
  return {
    season,
    update(at, weather) {
      const dials = dialsAt(at);
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

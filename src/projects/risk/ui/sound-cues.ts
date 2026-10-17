import type { GameEvent, GameView, Seat } from "../contract";
import type { LoggedEvent } from "../online/game";
import { continentHolders } from "./playback";
import type { RiskSoundId } from "./sounds";

/*
 * Which sounds the screen plays as it presents the game (`playback.ts`). Sounds follow the
 * presentation, not the feed: an event sounds when the screen shows it, so another seat's moves
 * are heard a beat at a time, at the viewer's playback speed, and the viewer's own at once. Each
 * event sounds once: the screen remembers the last event it heard by id, so the history a page
 * loads with, a reload and a resync, which bring events already heard or never presented, are
 * silent.
 *
 * Whatever the screen presents at once (a burst at the instant speed, a hidden tab catching up)
 * is merged rather than stacked: each sound at most once, and only the most telling few.
 */

/** The most sounds one presentation plays, however many events it showed. */
export const MOST_AT_ONCE = 2;

/** The order a burst keeps sounds in, most telling first: what happened to the viewer, then the
 *  board changing hands, then the moves themselves. */
const PRIORITY: readonly RiskSoundId[] = ["victory", "defeat", "eliminated", "turn", "lost", "continent", "capture", "trade", "card", "taken", "blitz", "dice", "march", "place"];

/** What still sounds while the tab is hidden: only news that should bring the player back. */
const ALERTS: ReadonlySet<RiskSoundId> = new Set(["turn", "victory", "defeat"]);

/** The events presented since the one last heard. A last event no longer in the list fell off
 *  its front: everything in it is new. */
export function heardSince(shown: readonly LoggedEvent[], last: string | null): readonly LoggedEvent[] {
  if (last === null) return shown;
  return shown.slice(shown.findLastIndex((logged) => logged.id === last) + 1);
}

/** The sound of one event, as the viewer hears it; null for the silent ones. */
function soundOf(event: GameEvent, viewer: Seat | null): RiskSoundId | null {
  switch (event.kind) {
    case "battle":
      return "dice";
    case "blitzed":
      return "blitz";
    case "placed":
      return "place";
    case "occupied":
    case "fortified":
      return "march";
    case "captured":
      if (event.seat === viewer) return "capture";
      return event.from === viewer ? "lost" : "taken";
    case "traded":
      return "trade";
    case "card-drawn":
      return event.seat === viewer ? "card" : null;
    case "eliminated":
      return event.seat === viewer ? "defeat" : "eliminated";
    case "turn-started":
      return event.seat === viewer ? "turn" : null;
    case "game-over":
      // The viewer can only lose by elimination, which sounded then.
      return viewer === null || event.winner === viewer ? "victory" : null;
    default:
      return null;
  }
}

/** The sounds of what the screen just presented: `events`, which took the board from `before`
 *  to `after`. */
export function soundsFor(events: readonly GameEvent[], viewer: Seat | null, before: GameView, after: GameView, hidden: boolean): RiskSoundId[] {
  if (events.length === 0) return [];
  const heard = new Set<RiskSoundId>();
  for (const event of events) {
    const sound = soundOf(event, viewer);
    if (sound !== null) heard.add(sound);
  }
  const held = continentHolders(before);
  for (const [continent, seat] of continentHolders(after)) if (seat !== null && held.get(continent) !== seat) heard.add("continent");
  return PRIORITY.filter((sound) => heard.has(sound) && (!hidden || ALERTS.has(sound))).slice(0, MOST_AT_ONCE);
}

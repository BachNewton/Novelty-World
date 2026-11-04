/*
 * The world's one clock, the same on every player's machine with nothing sent over the network: seconds since the
 * Unix epoch, as the machine's own clock has them. Anything on the water moved by time (the ferries, the small
 * boats, the regatta) runs on it at real speed, so every player sees it in the same place. It isn't a time of
 * day: a day and night cycle or seasons, running faster than real time, would be worked out from it, so the boats'
 * timetable is cycles of real seconds, not times of a day. A float64 of seconds; a shader takes it modulo a period
 * of its own first, since a float32 can't hold it.
 */

const PARAMETER = "sea";

/** Seconds since the Unix epoch. */
export const seaSeconds = (nowMs = Date.now()) => nowMs / 1000;

/**
 * The clock a page reads. `?sea=<time>` (such as 2026-11-04T12:18:00Z) starts it at that moment the first time it's
 * read, which is the drive's first frame, and it runs on at real speed from there: for watching a boat do something
 * without waiting for it. That page's boats are then out of step with every other player's.
 */
export function seaClock(search: string): () => number {
  const asked = new URLSearchParams(search).get(PARAMETER);
  if (asked === null) return () => seaSeconds();
  const startMs = Date.parse(asked);
  if (!Number.isFinite(startMs)) throw new Error(`?${PARAMETER}= takes a time such as 2026-11-04T12:18:00Z, not ${asked}`);
  let offset: number | null = null;
  return () => {
    const now = seaSeconds();
    offset ??= startMs / 1000 - now;
    return now + offset;
  };
}

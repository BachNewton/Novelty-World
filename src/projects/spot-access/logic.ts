/** A stretch of time the machine was seen in one state: from the check that
 *  first saw it to the last check that did. The newest window's `ended_at` is
 *  when the machine was last checked. */
export interface SpotWindow {
  id: number;
  up: boolean;
  started_at: string;
  ended_at: string;
}

/** The longest time between two checks that still counts as one unbroken
 *  record. The cron checks every minute, so this lets one check go missing;
 *  any longer and the time between is unknown, never assumed. */
export const MAX_GAP_MS = 150_000;

export interface CheckWrite {
  /** Moves an existing window's end, only if its end is still `expectedEndedAt`
   *  (so a check that raced another writes nothing). */
  update: { id: number; expectedEndedAt: string; endedAt: string } | null;
  insert: { up: boolean; startedAt: string; endedAt: string } | null;
}

/** What one check writes, given the newest window. A flip between two checks
 *  happened somewhere between them, so the old window ends and the new one
 *  starts halfway, splitting the unseen minute evenly. */
export function planCheck(latest: SpotWindow | null, up: boolean, at: number): CheckWrite {
  const atIso = new Date(at).toISOString();
  const fresh = { up, startedAt: atIso, endedAt: atIso };
  if (latest === null) return { update: null, insert: fresh };

  const lastSeen = Date.parse(latest.ended_at);
  if (at <= lastSeen) throw new Error(`Check at ${atIso} isn't after the last one, at ${latest.ended_at}`);
  if (at - lastSeen > MAX_GAP_MS) return { update: null, insert: fresh };

  const expected = { id: latest.id, expectedEndedAt: latest.ended_at };
  if (latest.up === up) return { update: { ...expected, endedAt: atIso }, insert: null };

  const flippedAt = new Date((lastSeen + at) / 2).toISOString();
  return {
    update: { ...expected, endedAt: flippedAt },
    insert: { up, startedAt: flippedAt, endedAt: atIso },
  };
}

export type Status = "up" | "down" | "unknown";

/** The machine's state now: unknown once checks have stopped arriving. */
export function currentStatus(latest: SpotWindow | undefined, now: number): Status {
  if (latest === undefined || now - Date.parse(latest.ended_at) > MAX_GAP_MS) return "unknown";
  return latest.up ? "up" : "down";
}

export const durationMs = (w: SpotWindow) => Date.parse(w.ended_at) - Date.parse(w.started_at);

function clip(w: SpotWindow, from: number, to: number): [number, number] | null {
  const start = Math.max(Date.parse(w.started_at), from);
  const end = Math.min(Date.parse(w.ended_at), to);
  return end > start ? [start, end] : null;
}

export interface Summary {
  /** Time seen up, and time seen at all, within the period. */
  upMs: number;
  observedMs: number;
  /** The up windows that touch the period, measured whole. */
  upCount: number;
  averageUpMs: number;
  longestUpMs: number;
}

export function summarize(windows: SpotWindow[], from: number, to: number): Summary {
  let upMs = 0;
  let observedMs = 0;
  const upLengths: number[] = [];
  for (const w of windows) {
    const span = clip(w, from, to);
    if (span === null) continue;
    observedMs += span[1] - span[0];
    if (w.up) {
      upMs += span[1] - span[0];
      upLengths.push(durationMs(w));
    }
  }
  const total = upLengths.reduce((sum, ms) => sum + ms, 0);
  return {
    upMs,
    observedMs,
    upCount: upLengths.length,
    averageUpMs: upLengths.length > 0 ? total / upLengths.length : 0,
    longestUpMs: Math.max(0, ...upLengths),
  };
}

export interface Cell {
  upMs: number;
  observedMs: number;
}

/** Time up and time seen, by day of week (0 = Sunday) and hour of day, in the
 *  viewer's own time zone. */
export function byHourAndDay(windows: SpotWindow[], from: number, to: number): Cell[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ upMs: 0, observedMs: 0 })));
  for (const w of windows) {
    const span = clip(w, from, to);
    if (span === null) continue;
    let cursor = span[0];
    while (cursor < span[1]) {
      const at = new Date(cursor);
      const nextHour = new Date(at);
      nextHour.setHours(at.getHours() + 1, 0, 0, 0);
      const end = Math.min(nextHour.getTime(), span[1]);
      const cell = grid[at.getDay()][at.getHours()];
      cell.observedMs += end - cursor;
      if (w.up) cell.upMs += end - cursor;
      cursor = end;
    }
  }
  return grid;
}

export interface DayStrip {
  /** Local midnight that starts the day. */
  day: number;
  /** Each window's part of the day, as fractions of it from midnight. */
  segments: { up: boolean; start: number; end: number; window: SpotWindow }[];
}

/** The last `days` local days, newest first, each with the windows that fall in it. */
export function dayStrips(windows: SpotWindow[], days: number, now: number): DayStrip[] {
  const strips: DayStrip[] = [];
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const start = new Date(midnight);
    start.setDate(midnight.getDate() - i);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const length = end.getTime() - start.getTime();
    const segments = windows.flatMap((w) => {
      const span = clip(w, start.getTime(), end.getTime());
      if (span === null) return [];
      return [{ up: w.up, start: (span[0] - start.getTime()) / length, end: (span[1] - start.getTime()) / length, window: w }];
    });
    strips.push({ day: start.getTime(), segments });
  }
  return strips;
}

export type TimelineEntry = { kind: "window"; window: SpotWindow } | { kind: "gap"; startedAt: string; endedAt: string };

/** The newest windows first, with the unknown stretches between them shown. */
export function timeline(windows: SpotWindow[], limit: number): TimelineEntry[] {
  const newest = [...windows].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)).slice(0, limit);
  const entries: TimelineEntry[] = [];
  newest.forEach((w, i) => {
    const later = i > 0 ? newest[i - 1] : undefined;
    if (later !== undefined && Date.parse(later.started_at) > Date.parse(w.ended_at)) {
      entries.push({ kind: "gap", startedAt: w.ended_at, endedAt: later.started_at });
    }
    entries.push({ kind: "window", window: w });
  });
  return entries;
}

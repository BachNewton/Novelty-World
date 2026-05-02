import type { IdeaEvent } from "./types";

export const MONTH_ABBREV = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const ALL_MONTHS: number[] = Array.from({ length: 12 }, (_, i) => i + 1);

/** Compress a list of months into a friendly summary, handling wrap-around
 *  runs (e.g. [11, 12, 1, 2, 3] -> "Nov–Mar"). All 12 months returns
 *  "Year-round". Multiple disjoint runs are joined with commas. */
export function summarizeMonths(months: number[]): string {
  if (months.length === 0) return "Unknown";
  if (months.length >= 12) return "Year-round";

  const set = new Set(months);

  // Find a starting month: one that's present but whose previous month
  // (wrapping Dec -> Jan) isn't. That's the head of a run.
  let start = -1;
  for (let m = 1; m <= 12; m++) {
    const prev = m === 1 ? 12 : m - 1;
    if (set.has(m) && !set.has(prev)) {
      start = m;
      break;
    }
  }
  if (start === -1) start = 1;

  const runs: number[][] = [];
  let current: number[] = [];
  let m = start;
  for (let visited = 0; visited < 12; visited++) {
    if (set.has(m)) {
      current.push(m);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
    m = m === 12 ? 1 : m + 1;
  }
  if (current.length > 0) runs.push(current);

  return runs
    .map((run) =>
      run.length === 1
        ? MONTH_ABBREV[run[0] - 1]
        : `${MONTH_ABBREV[run[0] - 1]}–${MONTH_ABBREV[run[run.length - 1] - 1]}`,
    )
    .join(", ");
}

/** Format an annual event range like "Jun 21 – Jun 23". Single-day events
 *  ("06-15" -> "06-15") render as just "Jun 15". */
export function formatEventRange(event: IdeaEvent): string {
  const from = formatMonthDay(event.from);
  if (event.from === event.to) return from;
  return `${from} – ${formatMonthDay(event.to)}`;
}

function formatMonthDay(mmdd: string): string {
  const [mm, dd] = mmdd.split("-");
  const month = MONTH_ABBREV[Number(mm) - 1] ?? mm;
  return `${month} ${Number(dd)}`;
}

/**
 * Answers a story's date questions from its timeline (`stories/<slug>/timeline.ts`),
 * so that every date, weekday, age, interval and clock time in the prose is computed.
 *
 *   npx tsx src/projects/audiobook/drama/tools/story-dates-cli.ts <story> <command> …
 *
 * A date is YYYY-MM-DD, or the id of an event in the timeline (a person's id means
 * their birth).
 *
 *   sheet <date>                  the weekday, everyone's age, and the time since each earlier event
 *   age <person> <date>           a person's age on a date
 *   between <date> <date>         the calendar time between two dates
 *   weekday <date>                the day of the week
 *   clock <date> <HH:MM> <place> <place>…
 *                                 the time at the first place, shown at the others
 */
import process from "node:process";
import {
  ageOn,
  compareDays,
  formatClock,
  formatDay,
  formatInterval,
  instantAt,
  interval,
  parseDay,
  wallClock,
  weekday,
  type DayDate,
  type Timeline,
} from "./story-dates";

const STORIES: Record<string, () => Promise<{ timeline: Timeline }>> = {
  "citizens-of-the-federation": () => import("../stories/citizens-of-the-federation/timeline"),
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function resolveDay(timeline: Timeline, ref: string | undefined): DayDate {
  if (ref === undefined) fail("A date is missing.");
  if (/^\d{4}-\d{2}-\d{2}$/.test(ref)) return parseDay(ref);
  if (ref in timeline.events) return parseDay(timeline.events[ref].date, ref);
  if (ref in timeline.people) return parseDay(timeline.people[ref].born, `${ref}'s birth`);
  fail(`"${ref}" is neither a date (YYYY-MM-DD) nor an id in the timeline.`);
}

function sheet(timeline: Timeline, on: DayDate): void {
  console.log(formatDay(on));
  console.log("\nAges:");
  for (const person of Object.values(timeline.people)) {
    const born = parseDay(person.born, `${person.name}'s birth`);
    if (compareDays(born, on) > 0) continue;
    const died = person.died === undefined ? undefined : parseDay(person.died, `${person.name}'s death`);
    if (died && compareDays(died, on) < 0) {
      console.log(`  ${person.name}: died ${formatDay(died)}, aged ${ageOn(born, died)}`);
    } else {
      console.log(`  ${person.name}: ${ageOn(born, on)}`);
    }
  }
  console.log("\nSince:");
  const earlier = Object.entries(timeline.events)
    .filter(([, event]) => /^\d{4}-\d{2}-\d{2}$/.test(event.date))
    .map(([id, event]) => ({ id, what: event.what, date: parseDay(event.date, id) }))
    .filter((event) => compareDays(event.date, on) <= 0)
    .sort((a, b) => compareDays(b.date, a.date));
  for (const event of earlier) {
    console.log(`  ${formatInterval(interval(event.date, on))} since ${event.id}: ${event.what}`);
  }
}

function clock(timeline: Timeline, args: string[]): void {
  const [dateRef, time, from, to] = [args.at(0), args.at(1), args.at(2), args.slice(3)];
  const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? "");
  if (!match) fail("clock takes <date> <HH:MM> <place> <place>…");
  const zoneOf = (place: string | undefined): string => {
    if (place === undefined || !(place in timeline.places)) fail(`"${place ?? ""}" isn't a place in the timeline.`);
    return timeline.places[place].zone;
  };
  const instant = instantAt(resolveDay(timeline, dateRef), Number(match[1]), Number(match[2]), zoneOf(from));
  const here = wallClock(instant, zoneOf(from));
  console.log(`${from ?? ""}: ${formatClock(here)}`);
  for (const place of to) {
    const there = wallClock(instant, zoneOf(place));
    const hours = (there.offset - here.offset) / 60;
    const relation = hours === 0 ? "the same time" : `${Math.abs(hours)} hours ${hours < 0 ? "behind" : "ahead"}`;
    console.log(`${place}: ${formatClock(there)}, ${relation}`);
  }
}

const argv = process.argv.slice(2);
const [story, command, args] = [argv.at(0), argv.at(1), argv.slice(2)];
const load = story !== undefined && story in STORIES ? STORIES[story] : undefined;
if (!load) fail(`Usage: story-dates-cli.ts <story> <command> …, where <story> is one of: ${Object.keys(STORIES).join(", ")}`);
const { timeline } = await load();

function run(): void {
  switch (command) {
    case "sheet":
      sheet(timeline, resolveDay(timeline, args.at(0)));
      break;
    case "age": {
      const id = args.at(0);
      if (id === undefined || !(id in timeline.people)) fail(`"${id ?? ""}" isn't a person in the timeline.`);
      const person = timeline.people[id];
      console.log(`${person.name} is ${ageOn(parseDay(person.born), resolveDay(timeline, args.at(1)))}`);
      break;
    }
    case "between": {
      const [a, b] = [resolveDay(timeline, args.at(0)), resolveDay(timeline, args.at(1))];
      const [from, to] = compareDays(a, b) <= 0 ? [a, b] : [b, a];
      console.log(`${formatInterval(interval(from, to))}, from ${formatDay(from)} to ${formatDay(to)}`);
      break;
    }
    case "weekday":
      console.log(weekday(resolveDay(timeline, args.at(0))));
      break;
    case "clock":
      clock(timeline, args);
      break;
    default:
      fail("Commands: sheet, age, between, weekday, clock. The file's header explains each.");
  }
}

try {
  run();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

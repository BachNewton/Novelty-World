/**
 * Answers a story's date questions from its world (`<slug>/world.ts`),
 * so that every date, weekday, age, interval and clock time in the prose is computed.
 *
 *   npx tsx src/projects/stories/tools/story-dates-cli.ts <story> <command> …
 *
 * A date is YYYY-MM-DD, or the id of an event in the world (a person's id means
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
} from "./story-dates";
import type { StoryWorld } from "./story-world";

const STORIES: Record<string, () => Promise<{ world: StoryWorld }>> = {
  "citizens-of-the-federation": () => import("../citizens-of-the-federation/world"),
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function birthOf(world: StoryWorld, id: string): DayDate {
  const { born, name } = world.people[id];
  if (born === undefined) fail(`${name} has no birth date in the world.`);
  return parseDay(born, `${id}'s birth`);
}

function resolveDay(world: StoryWorld, ref: string | undefined): DayDate {
  if (ref === undefined) fail("A date is missing.");
  if (/^\d{4}-\d{2}-\d{2}$/.test(ref)) return parseDay(ref);
  if (ref in world.events) return parseDay(world.events[ref].date, ref);
  if (ref in world.people) return birthOf(world, ref);
  fail(`"${ref}" is neither a date (YYYY-MM-DD) nor an id in the world.`);
}

function sheet(world: StoryWorld, on: DayDate): void {
  console.log(formatDay(on));
  console.log("\nAges:");
  for (const person of Object.values(world.people)) {
    if (person.born === undefined) continue;
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
  const earlier = Object.entries(world.events)
    .filter(([, event]) => /^\d{4}-\d{2}-\d{2}$/.test(event.date))
    .map(([id, event]) => ({ id, what: event.what, date: parseDay(event.date, id) }))
    .filter((event) => compareDays(event.date, on) <= 0)
    .sort((a, b) => compareDays(b.date, a.date));
  for (const event of earlier) {
    console.log(`  ${formatInterval(interval(event.date, on))} since ${event.id}: ${event.what}`);
  }
}

function clock(world: StoryWorld, args: string[]): void {
  const [dateRef, time, from, to] = [args.at(0), args.at(1), args.at(2), args.slice(3)];
  const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? "");
  if (!match) fail("clock takes <date> <HH:MM> <place> <place>…");
  const zoneOf = (place: string | undefined): string => {
    if (place === undefined || !(place in world.places)) fail(`"${place ?? ""}" isn't a place in the world.`);
    return world.places[place].zone;
  };
  const instant = instantAt(resolveDay(world, dateRef), Number(match[1]), Number(match[2]), zoneOf(from));
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
const { world } = await load();

function run(): void {
  switch (command) {
    case "sheet":
      sheet(world, resolveDay(world, args.at(0)));
      break;
    case "age": {
      const id = args.at(0);
      if (id === undefined || !(id in world.people)) fail(`"${id ?? ""}" isn't a person in the world.`);
      const person = world.people[id];
      console.log(`${person.name} is ${ageOn(birthOf(world, id), resolveDay(world, args.at(1)))}`);
      break;
    }
    case "between": {
      const [a, b] = [resolveDay(world, args.at(0)), resolveDay(world, args.at(1))];
      const [from, to] = compareDays(a, b) <= 0 ? [a, b] : [b, a];
      console.log(`${formatInterval(interval(from, to))}, from ${formatDay(from)} to ${formatDay(to)}`);
      break;
    }
    case "weekday":
      console.log(weekday(resolveDay(world, args.at(0))));
      break;
    case "clock":
      clock(world, args);
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

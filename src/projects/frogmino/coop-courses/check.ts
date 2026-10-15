import { cellKey, frogCells } from "../logic";
import { checkMedalTimes, heldJumpTicks } from "../medals";
import { fitsRow, startPlacements } from "../run";
import { toSeconds, toTicks } from "../ticks";
import { checkRow, rowLength, rowSolids } from "../traffic";
import type { Tuning } from "../tuning";
import { COURSE_TIERS, type DesignedCourse } from "./design";

// The checks every designed co-op course passes as the registry is built, so
// a broken course fails loudly, naming itself, before anyone plays it. They
// are the quick ones; proving the whole course in its answers is a test's
// (see Proving courses in the project's CLAUDE.md).

// Co-op is a pair of frogs.
const PLAYERS = 2;

// Lower-case words of letters and digits, joined by single hyphens.
function isId(id: string): boolean {
  return id.split("-").every((word) => /^[a-z0-9]+$/.test(word));
}

// Where each designed row's front is when the run lines the rows up, from
// the start: each its gap beyond the back of the one before.
export function rowFronts(course: Pick<DesignedCourse, "rows">): number[] {
  let back = 0;
  return course.rows.map((row, i) => {
    const front = i === 0 ? row.gap : back + row.gap;
    back = front + rowLength(rowSolids(row.vehicles));
    return front;
  });
}

// Where a team that never stops jumping meets a row whose front starts at
// `front`: the two close at the jump's pace plus the traffic's.
export function flatOutMeeting(front: number, tuning: Tuning): number {
  const flatOut = tuning.depthStep / tuning.holdRepeatInterval;
  return (front * flatOut) / (flatOut + tuning.wallSpeed);
}

// Fails loudly, naming the course and what is wrong with it.
export function checkCoopCourse(course: DesignedCourse, tuning: Tuning): DesignedCourse {
  try {
    checkCourse(course, tuning);
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error);
    throw new Error(`Frogmino co-op course "${course.id}": ${said}`, { cause: error });
  }
  return course;
}

function fail(what: string): never {
  throw new Error(what);
}

function checkCourse(course: DesignedCourse, tuning: Tuning): void {
  if (!isId(course.id)) fail("its id must be lower-case words joined by hyphens");
  if (course.name.trim() === "") fail("it needs a name");
  if (course.description.trim() === "") fail("it needs a description");
  if (!COURSE_TIERS.includes(course.tier)) fail(`its tier must be one of ${COURSE_TIERS.join(", ")}`);
  if (course.kinds.length !== PLAYERS) fail(`co-op is ${String(PLAYERS)} frogs, but it starts ${String(course.kinds.length)}`);
  if (!Number.isInteger(course.lanes) || course.lanes < 1) fail(`a road can't be ${String(course.lanes)} lanes wide`);
  // Fails loudly on a piece too wide for its half of the road.
  startPlacements(course.kinds, course.lanes);
  if (course.rows.length === 0) fail("it has no rows");
  const repeat = course.repeat ?? course.rows.length;
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > course.rows.length) {
    fail(`it can't repeat its last ${String(repeat)} of ${String(course.rows.length)} rows`);
  }
  checkMedalTimes(course.medals);

  course.rows.forEach((row, i) => {
    const where = `row ${String(i)} ("${row.lesson}")`;
    if (row.vehicles.length === 0) fail(`${where} has no vehicles`);
    try {
      checkRow(row.vehicles, course.lanes);
    } catch (error) {
      throw new Error(`${where} isn't a legal row: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    if (!(row.gap > 0)) fail(`${where} needs a gap before it`);
    if (row.answer.length !== PLAYERS) fail(`${where} needs an answer for each of the ${String(PLAYERS)} frogs`);
    const solids = rowSolids(row.vehicles);
    const frogs = row.answer.map((pose, player) => ({ kind: course.kinds[player], ...pose }));
    frogs.forEach((frog, player) => {
      if (!frogCells(frog).every((cell) => cell.col >= 0 && cell.col < course.lanes)) fail(`${where}: frog ${String(player + 1)}'s answer leaves the road`);
      if (!fitsRow(frog, solids)) fail(`${where}: frog ${String(player + 1)}'s answer doesn't pass it`);
    });
    const cells = frogs.flatMap((frog) => frogCells(frog).map(cellKey));
    if (new Set(cells).size !== cells.length) fail(`${where}: the frogs overlap in its answer`);
  });

  if (!(course.length > tuning.dropDistance)) fail(`its finish at ${String(course.length)} comes before the drop lands`);
  const fronts = rowFronts(course);
  const last = fronts[fronts.length - 1];
  if (flatOutMeeting(last, tuning) >= course.length) {
    fail(
      `a team jumping flat out meets its last row at ${flatOutMeeting(last, tuning).toFixed(1)}, ` +
        `past its finish at ${String(course.length)}: lengthen the course, or shorten its gaps`,
    );
  }
  const floor = heldJumpTicks(tuning, course.length);
  if (toTicks(course.medals.gold) <= floor) {
    fail(`its gold time of ${String(course.medals.gold)} s beats a held jump with nothing in its way over its length (${toSeconds(floor).toFixed(2)} s)`);
  }
}

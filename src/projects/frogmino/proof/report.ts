import type { DesignedCourse } from "../coop-courses/design";
import { formatTime, medalFor, MEDALS, type MedalTimes } from "../medals";
import { toTicks } from "../ticks";
import { coordinationKinds, type CoordinationKind, type RowAnalysis } from "./analyse";
import type { RowProof } from "./solver";
import { endSlot } from "./team-plan";

// A designed co-op course's numbers as text, for a designer to read: per row
// its passing poses, coupling, selfish decoys, the designed answer's
// coordination kinds and its gap, and the course's proved time against its
// medal times.

export function kindsText(kinds: readonly CoordinationKind[]): string {
  return kinds.length === 0 ? "-" : kinds.join(", ");
}

// What a row of the analysis says, in one line: its numbers, after its name.
export function rowLine(row: RowAnalysis): string {
  return `row ${String(row.index)} "${row.lesson}": ${rowNumbers(row)}`;
}

export function rowNumbers(row: RowAnalysis): string {
  const { coupling } = row;
  const line = coupling.line === null ? "" : `, free ${String(coupling.line.left)}x${String(coupling.line.right)} at lane line ${String(coupling.line.at)}`;
  return [
    `gap ${String(row.gap)}`,
    `${String(row.passes)} passing (${String(coupling.inOrder)} in order, ${String(coupling.crossed)} crossed)`,
    `coupling ${coupling.coupling.toFixed(2)} ${coupling.label}${line}`,
    `decoys ${coupling.decoys.join("+")}`,
    `answer: ${kindsText(row.answer)}${row.answerReachable ? "" : " (UNREACHABLE)"}`,
  ].join("; ");
}

export function courseHeading(course: DesignedCourse): string {
  return `${course.name} (${course.id}), ${course.tier}: ${String(course.rows.length)} rows on ${String(course.lanes)} lanes, ${course.kinds.join(" and ")}, finish at ${String(course.length)}`;
}

// The proof's time beside the course's medal times and the held-jump floor.
export function timingText(time: number, medals: MedalTimes, floor: number): string {
  const medal = medalFor(time, medals);
  const times = MEDALS.map((m) => `${m} ${formatTime(toTicks(medals[m]))}`).join(", ");
  return [`proof's time ${formatTime(time)} (${medal ?? "no medal"}); medals ${times}`, `a held jump with nothing in its way: ${formatTime(floor)}`].join("\n");
}

// The coordination the solver's route through a row used: its pose's kinds
// from where the row's plan started, and a perch whenever a frog stood on
// its partner along the way.
export function routeKinds(row: RowProof, lanes: number, airSlots: number): CoordinationKind[] {
  const end = row.steps.at(-1)?.pose ?? row.start;
  const kinds = coordinationKinds(row.start, end, lanes, airSlots);
  const stood = row.steps.slice(0, -1).some((step) => endSlot(step.pose).some((frog) => frog.air === 0));
  return stood && !kinds.includes("perch") ? ["perch", ...kinds] : kinds;
}

// The whole course's summary: a line per row, then the proof's timing, if
// there is one.
export function courseSummary(course: DesignedCourse, rows: readonly RowAnalysis[], timing: string | null): string {
  return [`Summary: ${courseHeading(course)}`, ...rows.map((row) => `  ${rowLine(row)}`), ...(timing === null ? [] : [timing])].join("\n");
}

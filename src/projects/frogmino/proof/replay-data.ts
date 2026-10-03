import type { CourseSpec } from "../courses";
import type { InputLog } from "../run";

// A replay as plain data: the course it plays, the input log, and the tick it
// ends at. The rules are a pure function of the course and the log, so this
// is a whole run, and a proof that it does what it shows.
export interface ReplayData {
  description: string;
  course: CourseSpec;
  log: InputLog;
  until: number;
}

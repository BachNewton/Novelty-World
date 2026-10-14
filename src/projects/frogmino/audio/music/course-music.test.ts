import { describe, expect, it } from "vitest";
import { COOP_COURSES } from "../../coop-courses";
import { COOP_MUSIC, courseMusic, PLANNED_COOP_MUSIC, SILENT_COURSES, SOLO_MUSIC } from "./course-music";
import { COURSE_THEMES } from "./themes";

const registered = COOP_COURSES.map((course) => course.id);

describe("course music", () => {
  it("gives every registered co-op course a theme", () => {
    for (const id of registered) {
      if (SILENT_COURSES.includes(id)) continue;
      expect(COOP_MUSIC.has(id), `the co-op course "${id}" has no theme in course-music.ts`).toBe(true);
      expect(courseMusic({ kind: "coop", id })).toBe(COOP_MUSIC.get(id));
    }
  });

  it("names only courses that are registered", () => {
    for (const id of [...COOP_MUSIC.keys(), ...SILENT_COURSES]) {
      expect(registered, `course-music.ts names "${id}", which no co-op course is`).toContain(id);
    }
  });

  it("plays solo's theme on solo, and nothing on a silent course", () => {
    expect(courseMusic({ kind: "solo" })).toBe(SOLO_MUSIC);
    for (const id of SILENT_COURSES) expect(courseMusic({ kind: "coop", id })).toBeNull();
  });

  it("fails loudly, naming it, on a course with no theme", () => {
    expect(() => courseMusic({ kind: "coop", id: "no-such-course" })).toThrow(/no-such-course/);
  });

  it("gives each course its own theme, from the courses' themes", () => {
    const used = [SOLO_MUSIC, ...COOP_MUSIC.values(), ...[...PLANNED_COOP_MUSIC.values()].map((planned) => planned.theme)];
    expect(new Set(used.map((theme) => theme.id)).size).toBe(used.length);
    expect(used.map((theme) => theme.id).sort()).toEqual(COURSE_THEMES.map((theme) => theme.id).sort());
  });

  it("gives the courses' themes a course's length, round and round", () => {
    for (const theme of COURSE_THEMES) expect(theme.kind, theme.id).toBe("loop");
  });
});

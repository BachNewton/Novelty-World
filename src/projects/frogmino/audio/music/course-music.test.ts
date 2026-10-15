import { describe, expect, it } from "vitest";
import { COOP_COURSES } from "../../coop-courses";
import { COOP_MUSIC, courseMusic, themeCourse } from "./course-music";
import { THEMES } from "./themes";

const registered = COOP_COURSES.map((course) => course.id);

describe("course music", () => {
  it("gives every registered co-op course a theme", () => {
    for (const id of registered) {
      expect(COOP_MUSIC.has(id), `the co-op course "${id}" has no theme in course-music.ts`).toBe(true);
      expect(courseMusic({ kind: "coop", id })).toBe(COOP_MUSIC.get(id));
    }
  });

  it("names only courses that are registered", () => {
    for (const id of COOP_MUSIC.keys()) {
      expect(registered, `course-music.ts names "${id}", which no co-op course is`).toContain(id);
    }
  });

  it("fails loudly, naming it, on a course with no theme", () => {
    expect(() => courseMusic({ kind: "coop", id: "no-such-course" })).toThrow(/no-such-course/);
  });

  it("gives each course a theme of its own, listing the themes in the picker's order", () => {
    expect(THEMES.map(themeCourse)).toEqual(registered);
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEMES.length);
  });

  it("loops every theme round and round", () => {
    for (const theme of THEMES) expect(theme.kind, theme.id).toBe("loop");
  });
});

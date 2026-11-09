import { describe, expect, it } from "vitest";
import { ahead, placeOf, teamMedal, teamPointsOf } from "./standings";

describe("a race's standings", () => {
  const finished = (finishedS: number) => ({ finishedS, progress: 99 });
  const racing = (progress: number) => ({ finishedS: null, progress });

  it("place a finisher by time, ahead of everyone still racing, and those racing by how far round they are", () => {
    expect(ahead(finished(300), finished(310))).toBe(true);
    expect(ahead(finished(400), racing(50))).toBe(true);
    expect(ahead(racing(12.5), racing(12.4))).toBe(true);
    expect(placeOf(racing(10), [finished(500), racing(12), racing(8)])).toBe(3);
    expect(placeOf(finished(290), [finished(300), racing(12), racing(8)])).toBe(1);
  });

  it("score a co-op team as Forza Horizon does: a hundred a racer beaten, fifty more for the win, the medal from the points a player", () => {
    const racers = [finished(300), finished(320), racing(20)];
    expect(teamPointsOf(finished(310), racers)).toBe(200);
    expect(teamPointsOf(finished(290), racers)).toBe(350);
    expect(teamPointsOf(racing(5), racers)).toBe(0);
    expect(teamMedal(300, 3)).toBe("gold");
    expect(teamMedal(275, 3)).toBe("silver");
    expect(teamMedal(100, 3)).toBe("bronze");
    expect(teamMedal(50, 3)).toBeNull();
    expect(teamMedal(0, 0)).toBe("gold");
  });
});

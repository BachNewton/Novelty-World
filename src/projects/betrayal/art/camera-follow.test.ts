import { describe, expect, it } from "vitest";
import { cameraCue, followed, followedFloor, FOLLOWING, type CameraCue, type CameraFollow } from "./camera-follow";

const point = { x: 1, y: 0, z: 2 };
const run = (cues: CameraCue[], from: CameraFollow = FOLLOWING) => cues.reduce(cameraCue, from);

describe("cameraCue", () => {
  it("starts following the active explorer", () => {
    expect(followed(FOLLOWING, "ox")).toEqual({ figure: "ox" });
  });

  it("goes free when the player pans or changes floor, and nothing the game shows moves it then", () => {
    const free = run([{ kind: "free" }]);
    expect(free.mode).toBe("free");
    expect(run([{ kind: "show", point, floor: "upper" }, { kind: "walk", figure: "ox" }, { kind: "arrive", figure: "ox" }, { kind: "release" }], free)).toBe(free);
    expect(followed(free, "ox")).toBeNull();
  });

  it("follows again when asked, or when a new turn begins", () => {
    const free = run([{ kind: "free" }]);
    expect(run([{ kind: "follow" }], free)).toEqual(FOLLOWING);
    expect(run([{ kind: "show", point, floor: "ground" }, { kind: "follow" }])).toEqual(FOLLOWING);
  });

  it("looks at what the turn shows, until a beat lets go of it", () => {
    const showing = run([{ kind: "show", point, floor: "basement" }]);
    expect(followed(showing, "ox")).toEqual({ point, floor: "basement" });
    expect(run([{ kind: "release" }], showing)).toEqual(FOLLOWING);
  });

  it("follows a figure while it walks, then goes back to the active explorer", () => {
    const walking = run([{ kind: "show", point, floor: "ground" }, { kind: "walk", figure: "spider" }]);
    expect(followed(walking, "ox")).toEqual({ figure: "spider" });
    expect(run([{ kind: "arrive", figure: "ox" }], walking)).toBe(walking);
    expect(run([{ kind: "release" }], walking)).toBe(walking);
    expect(followed(run([{ kind: "arrive", figure: "spider" }], walking), "ox")).toEqual({ figure: "ox" });
  });

  it("keeps a copy of the point shown, never the caller's", () => {
    const mutable = { ...point };
    const showing = run([{ kind: "show", point: mutable, floor: "ground" }]);
    mutable.x = 9;
    expect(followed(showing, null)).toEqual({ point, floor: "ground" });
  });
});

describe("followedFloor", () => {
  it("shows the followed floor, unless every floor is showing", () => {
    expect(followedFloor("ground", "upper")).toBe("upper");
    expect(followedFloor("all", "upper")).toBe("all");
  });
});

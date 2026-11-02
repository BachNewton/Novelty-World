import { describe, expect, it } from "vitest";
import { placeAsked, placeLink } from "./start-place";

describe("a link to a place", () => {
  it("opens where it was copied, keeping the page's other settings", () => {
    const place = { east: 117245.5, north: 6697445.2, height: 40, yaw: -0.349, pitch: -0.093 };
    const link = placeLink("http://localhost:3001/games/3d-games/aland-drive?tiles=local:8262&at=1,2", place);
    const { search } = new URL(link);
    expect(new URLSearchParams(search).get("tiles")).toBe("local:8262");
    expect(placeAsked(search)).toEqual(place);
  });

  it("refuses what isn't a place rather than starting somewhere else", () => {
    expect(() => placeAsked("?at=117245")).toThrow();
    expect(() => placeAsked("?at=east,north")).toThrow();
    expect(placeAsked("?tiles=local:1")).toBeNull();
  });
});

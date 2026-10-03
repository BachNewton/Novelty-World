import { describe, expect, it } from "vitest";
import { coopLanes, frogminoView } from "./view";

describe("frogminoView", () => {
  it("opens on the lobby", () => {
    expect(frogminoView("")).toBe("lobby");
    expect(frogminoView("?peer-signal=local")).toBe("lobby");
  });

  it("skips the lobby with ?play=solo", () => {
    expect(frogminoView("?play=solo")).toBe("solo");
  });

  it("opens local co-op's join screen with ?play=local", () => {
    expect(frogminoView("?play=local")).toBe("local");
    expect(frogminoView("?play=local&lanes=9")).toBe("local");
  });

  it("fails loudly on a ?play it doesn't know", () => {
    expect(() => frogminoView("?play=coop")).toThrow(/play=solo and \?play=local/);
  });

  it("fails loudly on ?lanes with solo, whose road is the stream's", () => {
    expect(() => frogminoView("?play=solo&lanes=9")).toThrow(/local co-op only/);
  });

  it("shows the garage with ?garage", () => {
    expect(frogminoView("?garage")).toBe("garage");
  });

  it("shows the world preview with ?world and the sound lab with ?sounds", () => {
    expect(frogminoView("?world")).toBe("world");
    expect(frogminoView("?sounds")).toBe("sounds");
  });

  it("shows the music ideas with ?music and the frog preview with ?frog", () => {
    expect(frogminoView("?music")).toBe("music");
    expect(frogminoView("?frog")).toBe("frog");
  });

  it("gives the garage precedence, then the world, the sounds, the music and the frog", () => {
    expect(frogminoView("?frog&music&sounds&world&garage")).toBe("garage");
    expect(frogminoView("?frog&music&sounds&world")).toBe("world");
    expect(frogminoView("?frog&music&sounds")).toBe("sounds");
    expect(frogminoView("?frog&music")).toBe("music");
  });

  it("lets a dev view win over ?play=solo", () => {
    expect(frogminoView("?play=solo&sounds")).toBe("sounds");
  });

  it("lets a dev view win over ?play=local and ?lanes", () => {
    expect(frogminoView("?play=local&lanes=9&world")).toBe("world");
  });
});

describe("coopLanes", () => {
  it("is 10 lanes unless ?lanes says otherwise", () => {
    expect(coopLanes("")).toBe(10);
    expect(coopLanes("?play=local")).toBe(10);
    expect(coopLanes("?play=local&lanes=7")).toBe(7);
    expect(coopLanes("?lanes=9")).toBe(9);
    expect(coopLanes("?lanes=10")).toBe(10);
  });

  it("fails loudly on a width with no co-op rows", () => {
    for (const lanes of ["8", "11", "", "ten", "9.0"]) {
      expect(() => coopLanes(`?lanes=${lanes}`)).toThrow(/7, 9, 10/);
    }
  });
});

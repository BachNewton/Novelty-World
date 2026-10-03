import { describe, expect, it } from "vitest";
import { frogminoView } from "./view";

describe("frogminoView", () => {
  it("opens on the lobby", () => {
    expect(frogminoView("")).toBe("lobby");
    expect(frogminoView("?peer-signal=local")).toBe("lobby");
  });

  it("skips the lobby with ?play=solo", () => {
    expect(frogminoView("?play=solo")).toBe("solo");
  });

  it("fails loudly on a ?play it doesn't know", () => {
    expect(() => frogminoView("?play=coop")).toThrow(/play=solo/);
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
});

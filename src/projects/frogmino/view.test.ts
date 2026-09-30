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

  it("gives the garage precedence, then the world, then the sounds", () => {
    expect(frogminoView("?sounds&world&garage")).toBe("garage");
    expect(frogminoView("?sounds&world")).toBe("world");
  });

  it("lets a dev view win over ?play=solo", () => {
    expect(frogminoView("?play=solo&sounds")).toBe("sounds");
  });
});

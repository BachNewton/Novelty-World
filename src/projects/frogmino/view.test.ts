import { describe, expect, it } from "vitest";
import { frogminoView, replayName } from "./view";

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
  });

  it("fails loudly on a ?play it doesn't know", () => {
    expect(() => frogminoView("?play=coop")).toThrow(/play=solo and \?play=local/);
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

  it("plays a replay with ?replay", () => {
    expect(frogminoView("?replay=perch")).toBe("replay");
  });

  it("gives the garage precedence, then the world, the sounds, the music, the frog and a replay", () => {
    expect(frogminoView("?replay=perch&frog")).toBe("frog");
    expect(frogminoView("?frog&music&sounds&world&garage")).toBe("garage");
    expect(frogminoView("?frog&music&sounds&world")).toBe("world");
    expect(frogminoView("?frog&music&sounds")).toBe("sounds");
    expect(frogminoView("?frog&music")).toBe("music");
  });

  it("lets a dev view win over ?play=solo", () => {
    expect(frogminoView("?play=solo&sounds")).toBe("sounds");
  });

  it("lets a dev view win over ?play=local", () => {
    expect(frogminoView("?play=local&world")).toBe("world");
  });
});

describe("replayName", () => {
  it("is the name ?replay gives", () => {
    expect(replayName("?replay=perch")).toBe("perch");
    expect(replayName("?play=local&replay=proof-coop-10")).toBe("proof-coop-10");
  });

  it("fails loudly on a ?replay with no name", () => {
    expect(() => replayName("?replay")).toThrow(/needs a replay's name/);
    expect(() => replayName("?replay=")).toThrow(/needs a replay's name/);
  });
});

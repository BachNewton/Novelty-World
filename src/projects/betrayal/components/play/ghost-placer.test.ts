import { describe, expect, it } from "vitest";
import type { GhostChoice } from "../../play/choices";
import type { Action } from "../../types";
import { GHOST, placerTargets, STAY } from "./ghost-placer";

const ACTION: Action = { kind: "choose", decision: "d1", seat: 0, choice: null };
const option = { rotation: 0 as const, label: "Put it here", action: ACTION };
const CHOICE: GhostChoice = {
  tile: "creaky-hallway",
  cells: [
    { spot: { floor: "basement", x: 0, y: -1 }, options: [option] },
    { spot: { floor: "upper", x: 0, y: -1 }, options: [option] },
    { spot: { floor: "ground", x: 2, y: 1 }, options: [option] },
  ],
  stay: { choice: null, label: "Leave the Creaky Hallway where it is", id: "panel:3", action: ACTION },
};

describe("placerTargets", () => {
  it("tags the ghost and every other cell with the room's name alone, the sentence only read out", () => {
    const targets = placerTargets(CHOICE, 0, { rotation: 0, doors: [] }, "Creaky Hallway", false);
    expect(targets.map((target) => target.id)).toEqual(["cell:upper:0:-1", "cell:ground:2:1", GHOST]);
    for (const target of targets) expect(target.tag ?? target.label).toBe("Creaky Hallway");
    expect(targets.filter((target) => target.kind === "cell").map((target) => target.label)).toEqual(["Put the Creaky Hallway here", "Put the Creaky Hallway here"]);
    const ghost = targets.find((target) => target.id === GHOST);
    expect(ghost).toMatchObject({ kind: "ghost", floor: "basement", x: 0, y: -1 });
  });

  it("offers the tile's own cell when it may stay, saying it stays", () => {
    const targets = placerTargets(CHOICE, 1, { rotation: 0, doors: [] }, "Creaky Hallway", true);
    expect(targets.find((target) => target.id === STAY)).toMatchObject({ kind: "room", room: "creaky-hallway", label: "Leave the Creaky Hallway where it is" });
    expect(targets.find((target) => target.id === GHOST)).toMatchObject({ floor: "upper" });
  });
});

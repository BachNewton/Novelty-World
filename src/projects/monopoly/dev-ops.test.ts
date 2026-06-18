import { describe, expect, it } from "vitest";
import { SPACES } from "./data";
import { applyDevCommand, ownAllByFirst, randomOwnership } from "./dev-ops";
import { freshGame } from "./mocks";

const OWNABLE = SPACES.flatMap((s, i) =>
  s.kind === "property" || s.kind === "railroad" || s.kind === "utility"
    ? [i]
    : [],
);

describe("ownAllByFirst", () => {
  it("gives every ownable square and both GOJF cards to the first player", () => {
    const state = ownAllByFirst(freshGame());
    const firstId = state.players[0].id;
    for (const pos of OWNABLE) expect(state.ownership[pos]).toBe(firstId);
    expect(state.jailFreeCards.chance).toBe(firstId);
    expect(state.jailFreeCards.communityChest).toBe(firstId);
  });
});

describe("randomOwnership", () => {
  it("assigns every ownable square to some seated player", () => {
    const state = randomOwnership(freshGame());
    const ids = new Set(state.players.map((p) => p.id));
    for (const pos of OWNABLE) expect(ids.has(state.ownership[pos])).toBe(true);
  });

  it("is deterministic for a given rngState and advances it", () => {
    const base = freshGame();
    const a = randomOwnership(base);
    const b = randomOwnership(base);
    expect(a.ownership).toEqual(b.ownership);
    expect(a.rngState).not.toBe(base.rngState);
  });
});

describe("applyDevCommand", () => {
  it("restart reseeds a fresh game with the requested player count", () => {
    const start = freshGame("seed", { id: "me", name: "Me" }, 4);
    const next = applyDevCommand(start, { kind: "restart", players: 8 }, "seed-2");
    expect(next.players).toHaveLength(8);
    expect(next.status).toBe("active");
    // The human seat (slot 0) carries over.
    expect(next.players[0].id).toBe("me");
    expect(next.players[0].botStrategy).toBeNull();
    expect(Object.keys(next.ownership)).toHaveLength(0);
  });

  it("own-all and random-own dispatch to their transforms", () => {
    const start = freshGame();
    expect(applyDevCommand(start, { kind: "own-all" }, "x").ownership).toEqual(
      ownAllByFirst(start).ownership,
    );
    const rand = applyDevCommand(start, { kind: "random-own" }, "x");
    expect(Object.keys(rand.ownership)).toHaveLength(OWNABLE.length);
  });
});

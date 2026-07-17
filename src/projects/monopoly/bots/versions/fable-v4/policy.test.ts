import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { FABLE_V3_PARAMS, fableV3Bot } from "../fable-v3";
import { makeParamBot } from "./bot";
import { FABLE_V4_PARAMS, fableV4Bot } from "./index";

// fable-v4 = fable-v3's factory + the F5 voluntary-spend tail guard
// (`voluntaryTailFrac`, index.ts header). Pinned here: (1) the factory is
// faithful — voluntaryTailFrac 0 reproduces fable-v3's decisions; (2) the
// 4q3y6i T219 defect is FIXED — the "$506 redeploy of a dead monopoly while a
// hotel board is one roll away" that fable-v3 arms is deferred; (3) the guard
// is a DANGER gate, not a wall — the same redeploy on a safe board still
// fires; (4) determinism.

const ST_JAMES = 16;
const TENNESSEE = 18;
const NEW_YORK = 19;
const PACIFIC = 31;
const NORTH_CAROLINA = 32;
const PENNSYLVANIA_AVE = 34;

/** The T219 geometry from game 4q3y6i: p1 (Mark's seat) holds the greens,
 *  all mortgaged (unmortgage cost $506), cash $800, token one roll from p2's
 *  orange hotels ($950 hits at rolls 8/10/11). fable-v3's flow floor reserves
 *  ~$270 here, so the redeploy clears it; surviving the actual tail needs
 *  $950. `hotels` toggles the danger — false leaves the oranges bare, which
 *  is the safe-board control. */
function deadMonopolyBoard(hotels: boolean): GameState {
  const base = freshGame();
  const level = hotels ? 5 : 0;
  return {
    ...base,
    ownership: {
      [PACIFIC]: "p1",
      [NORTH_CAROLINA]: "p1",
      [PENNSYLVANIA_AVE]: "p1",
      [ST_JAMES]: "p2",
      [TENNESSEE]: "p2",
      [NEW_YORK]: "p2",
    },
    mortgaged: { [PACIFIC]: true, [NORTH_CAROLINA]: true, [PENNSYLVANIA_AVE]: true },
    houses: { [ST_JAMES]: level, [TENNESSEE]: level, [NEW_YORK]: level },
    players: base.players.map((q) => (q.id === "p1" ? { ...q, cash: 900, position: 8 } : q)),
  };
}

describe("fable-v4 — the factory copy is faithful to fable-v3", () => {
  const v3OnV4Factory = makeParamBot({ ...FABLE_V3_PARAMS, voluntaryTailFrac: 0 });
  it("matches fableV3Bot with the guard disabled", () => {
    for (const board of [freshGame(), deadMonopolyBoard(true), deadMonopolyBoard(false)]) {
      expect(v3OnV4Factory(board, "p1")).toEqual(fableV3Bot(board, "p1"));
      expect(v3OnV4Factory(board, "p2")).toEqual(fableV3Bot(board, "p2"));
    }
  });
});

describe("fable-v4 — the 4q3y6i voluntary-spend defect is fixed", () => {
  it("fable-v3 arms the $506 redeploy one roll from a $950 board (the T219 blunder)", () => {
    const decision = fableV3Bot(deadMonopolyBoard(true), "p1");
    expect(decision?.intent.kind).toBe("set-queue");
    expect(decision?.note).toContain("unmortgaging");
  });

  it("fable-v4 defers the same redeploy — the tail guard holds the cash", () => {
    const decision = fableV4Bot(deadMonopolyBoard(true), "p1");
    expect(decision?.intent.kind).not.toBe("set-queue");
  });

  it("fable-v4 still redeploys on the safe board — a danger gate, not a wall", () => {
    const decision = fableV4Bot(deadMonopolyBoard(false), "p1");
    expect(decision?.intent.kind).toBe("set-queue");
    expect(decision?.note).toContain("unmortgaging");
  });
});

describe("fable-v4 — vector provenance", () => {
  it("differs from fable-v3 in exactly the tail-guard dim", () => {
    const changed = Object.keys(FABLE_V4_PARAMS).filter(
      (k) =>
        k in FABLE_V3_PARAMS &&
        FABLE_V4_PARAMS[k as keyof typeof FABLE_V4_PARAMS] !==
          FABLE_V3_PARAMS[k as keyof typeof FABLE_V3_PARAMS],
    );
    expect(changed).toEqual([]);
    expect(FABLE_V4_PARAMS.voluntaryTailFrac).toBe(1);
  });

  it("keeps the invariant pins (lockstep, bounded survival, transfer memory, extraction)", () => {
    expect(FABLE_V4_PARAMS.holderDenialFrac).toBe(1);
    expect(FABLE_V4_PARAMS.survivalBounded).toBe(1);
    expect(FABLE_V4_PARAMS.transferMemoryTurns).toBe(10);
    expect(FABLE_V4_PARAMS.extractionOn).toBe(1);
  });
});

describe("fable-v4 — determinism", () => {
  it("same state, same decision, every time", () => {
    for (const board of [deadMonopolyBoard(true), deadMonopolyBoard(false)]) {
      expect(fableV4Bot(board, "p1")).toEqual(fableV4Bot(board, "p1"));
      expect(fableV4Bot(board, "p2")).toEqual(fableV4Bot(board, "p2"));
    }
  });
});

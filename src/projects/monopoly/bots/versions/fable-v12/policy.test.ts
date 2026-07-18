import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState, PendingTrade } from "../../../types";
import { FABLE_V11_PARAMS, fableV11Bot } from "../fable-v11";
import { makeParamBot } from "./bot";
import { FABLE_V12_PARAMS, fableV12Bot } from "./index";

// fable-v12 = fable-v11's factory + the F13 human threat multiplier
// (`humanThreatMult`, index.ts header). Pinned here: (1) identity with
// fable-v11 — with the multiplier at 1, and on every all-bot board at 2;
// (2) the completer-sale boundary vs a HUMAN moves up (probe-6's 1.3–1.4×
// book sales priced out) while the identical BOT sale is unchanged; (3) it
// is a REPRICING, not a wall — a rich human offer still transacts, and a
// floored-value set's boundary barely moves; (4) determinism.

const ORIENTAL = 6;
const VERMONT = 8;
const CONNECTICUT = 9;
const ATLANTIC = 26;
const VENTNOR = 27;
const MARVIN = 29;
const PACIFIC = 31;
const NORTH_CAROLINA = 32;
const PENNSYLVANIA_AVE = 34;

/** p2 (human or bot) holds two lots of `color-set` and proposes buying p1's
 *  completer for `price`; p1 keeps a green outlet. Light blue is the
 *  archive's most-valued set (the boundary moves a lot); yellow is floored
 *  (it barely moves). */
function completerSaleBoard(
  human: boolean,
  price: number,
  set: "lightblue" | "yellow",
): GameState {
  const base = freshGame();
  const completer = set === "lightblue" ? CONNECTICUT : MARVIN;
  const held: [number, number] =
    set === "lightblue" ? [ORIENTAL, VERMONT] : [ATLANTIC, VENTNOR];
  const pending: PendingTrade = {
    id: "t-c",
    proposerId: "p2",
    propertyTo: { [completer]: "p2" },
    gojfTo: {},
    cashDelta: { p1: price, p2: -price },
    approvals: { p1: false, p2: true },
  };
  return {
    ...base,
    ownership: {
      [completer]: "p1",
      [PACIFIC]: "p1",
      [NORTH_CAROLINA]: "p1",
      [PENNSYLVANIA_AVE]: "p1",
      [held[0]]: "p2",
      [held[1]]: "p2",
    },
    players: base.players.map((q) =>
      q.id === "p2"
        ? { ...q, cash: set === "lightblue" && price >= 1600 ? 2000 : 1500, botStrategy: human ? null : q.botStrategy }
        : { ...q, cash: 800 },
    ),
    turn: { ...base.turn, phase: "trade-pending", pendingTrade: pending },
  };
}

describe("fable-v12 — identity with fable-v11", () => {
  const v11OnV12Factory = makeParamBot({ ...FABLE_V11_PARAMS, humanThreatMult: 1 });
  it("the factory copy is faithful with the multiplier at 1", () => {
    for (const board of [
      freshGame(),
      completerSaleBoard(true, 800, "lightblue"),
      completerSaleBoard(false, 800, "lightblue"),
    ]) {
      expect(v11OnV12Factory(board, "p1")).toEqual(fableV11Bot(board, "p1"));
      expect(v11OnV12Factory(board, "p2")).toEqual(fableV11Bot(board, "p2"));
    }
  });

  it("fable-v12 itself matches fable-v11 on every all-bot board", () => {
    for (const price of [600, 800, 1000]) {
      const board = completerSaleBoard(false, price, "lightblue");
      expect(fableV12Bot(board, "p1")).toEqual(fableV11Bot(board, "p1"));
    }
  });
});

describe("fable-v12 — arming a human is priced higher", () => {
  it("fable-v11 sells the light-blue completer to a human at $800 (the probe-6 class of sale)", () => {
    const decision = fableV11Bot(completerSaleBoard(true, 800, "lightblue"), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });

  it("fable-v12 declines $800 from the human — the same sale to a BOT still clears", () => {
    expect(fableV12Bot(completerSaleBoard(true, 800, "lightblue"), "p1")?.intent.kind).toBe(
      "decline-trade",
    );
    expect(fableV12Bot(completerSaleBoard(false, 800, "lightblue"), "p1")?.intent.kind).toBe(
      "accept-trade",
    );
  });

  it("a rich human offer still transacts — a repricing, not a wall", () => {
    const decision = fableV12Bot(completerSaleBoard(true, 1600, "lightblue"), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });

  it("a floored-value set's boundary barely moves (yellow: $600 still accepted)", () => {
    const decision = fableV12Bot(completerSaleBoard(true, 600, "yellow"), "p1");
    expect(decision?.intent.kind).toBe("accept-trade");
  });
});

describe("fable-v12 — vector provenance", () => {
  it("differs from fable-v11 in exactly the human-threat dim", () => {
    const changed = Object.keys(FABLE_V12_PARAMS).filter(
      (k) =>
        k in FABLE_V11_PARAMS &&
        FABLE_V12_PARAMS[k as keyof typeof FABLE_V12_PARAMS] !==
          FABLE_V11_PARAMS[k as keyof typeof FABLE_V11_PARAMS],
    );
    expect(changed).toEqual([]);
    expect(FABLE_V12_PARAMS.humanThreatMult).toBe(2);
    expect(FABLE_V12_PARAMS.humanAskOff).toBe(1);
    expect(FABLE_V12_PARAMS.humanProposalMargin).toBe(75);
  });

  it("keeps the invariant pins (lockstep, bounded survival, transfer memory, extraction)", () => {
    expect(FABLE_V12_PARAMS.holderDenialFrac).toBe(1);
    expect(FABLE_V12_PARAMS.survivalBounded).toBe(1);
    expect(FABLE_V12_PARAMS.transferMemoryTurns).toBe(10);
    expect(FABLE_V12_PARAMS.extractionOn).toBe(1);
  });
});

describe("fable-v12 — determinism", () => {
  it("same state, same decision, every time", () => {
    for (const board of [
      completerSaleBoard(true, 800, "lightblue"),
      completerSaleBoard(true, 1600, "lightblue"),
      completerSaleBoard(true, 600, "yellow"),
    ]) {
      expect(fableV12Bot(board, "p1")).toEqual(fableV12Bot(board, "p1"));
      expect(fableV12Bot(board, "p2")).toEqual(fableV12Bot(board, "p2"));
    }
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { stubCanvas } from "../headless";
import { checkRoom } from "../overlap";
import { shellRoom } from "../house";
import { STANDING, type Gait } from "./figure";
import { longfellow } from "./longfellow";
import { ox } from "./ox";
import { zoe } from "./zoe";

/** Each explorer stood alone in a bare room, posed at moments through its
 *  idle, standing and in full stride: its own parts may pass into each
 *  other, as a figure's joints do, but no two of its faces may fight. */
const FIGURES = { longfellow, ox, zoe };
const MOMENTS = [0, 2, 5, 9, 14, 21];

beforeAll(stubCanvas);

describe("explorer figures", () => {
  const striding: Gait = () => ({ phase: Math.PI / 2, amount: 1 });
  for (const [name, build] of Object.entries(FIGURES)) {
    for (const [how, gait] of [["standing", STANDING], ["walking", striding]] as const) {
      it(`${name}, ${how}, has no fighting faces`, () => {
        const room = { ...shellRoom("foyer"), pawn: undefined, props: [{ name, build: () => build(name, gait), at: [0, 0] as [number, number] }] };
        for (const at of MOMENTS) expect(checkRoom(room, at).findings.map((finding) => `${at}s: ${finding.text}`)).toEqual([]);
      });
    }
  }
});

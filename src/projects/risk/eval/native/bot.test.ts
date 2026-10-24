import { describe, expect, it } from "vitest";
import { riskBot } from "../../bots";
import { playGame, playGameAsync, type AsyncBot } from "../runner";
import { nativeBot } from "./bot";

// The mixed-table seam: a native seat among TypeScript bots, its decisions asked of the crate's
// `bots-serve` over a pipe. greedy and GD's personas are exact on both sides, so a game with one
// of them native must be the all-TypeScript game move for move. It needs the release build: a
// missing or stale one fails here, saying to run `cargo build --release`.

describe("a native seat at a TypeScript table", () => {
  it.each(["greedy", "gd-aggressive"])("plays %s's game exactly as the TypeScript bot does", async (label) => {
    const seed = `native-seat-${label}`;
    const typescript = playGame({ seed, bots: [riskBot("greedy"), riskBot(label), riskBot("gd-stacker")], maxTurns: 600 });
    const native = nativeBot(label);
    let asked = 0;
    const counted: AsyncBot = (input) => {
      asked++;
      return native(input);
    };
    const mixed = await playGameAsync({ seed, bots: [riskBot("greedy"), counted, riskBot("gd-stacker")], maxTurns: 600 });
    expect(mixed).toEqual(typescript);
    expect(asked).toBeGreaterThan(50);
  });
});

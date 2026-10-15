import { createRng } from "@/shared/lib/seeded-random";
import type { Move } from "../../contract";
import type { Bot } from "./bot";

/** A placeholder until the real bots: a random legal move, attacking about half the time. */
export const randomBot: Bot = ({ options, seed }) => {
  const rng = createRng(seed);
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error("The random bot was given nothing to pick from");
    return items[Math.floor(rng.next() * items.length)];
  };
  const move = ((): Move => {
    switch (options.kind) {
      case "setup-place":
        return { kind: "place", territory: pick(options.ownTerritories), armies: 1 };
      case "reinforce":
        if (options.mustTrade || (options.sets.length > 0 && rng.next() < 0.5)) return { kind: "trade", cards: pick(options.sets) };
        return { kind: "place", territory: pick(options.ownTerritories), armies: options.armiesToPlace };
      case "attack": {
        if (options.attacks.length === 0 || rng.next() < 0.5) return { kind: "end-attack" };
        const { from, to } = pick(options.attacks);
        return { kind: "blitz", from, to, keepAtLeast: 1 };
      }
      case "occupy":
        return { kind: "occupy", armies: options.max };
      case "fortify": {
        if (options.moves.length === 0 || rng.next() < 0.5) return { kind: "end-turn" };
        const { from, to, maxArmies } = pick(options.moves);
        return { kind: "fortify", from, to, armies: maxArmies };
      }
    }
  })();
  return { move, work: 1 };
};

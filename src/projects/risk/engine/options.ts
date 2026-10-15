import type { Options, Seat } from "../contract";
import { setsIn } from "./cards";
import { attacks, bonusTerritories, fortifyMoves, mayTrade, mustTrade, reinforceState } from "./legal";
import { ownedBy, type EngineState } from "./state";

/** The legal moves for `seat` now, from the same checks `apply` makes. Implied by the kind:
 *  `end-attack` whenever the kind is "attack", `end-turn` whenever it is "fortify". */
export function options(s: EngineState, seat: Seat): Options | null {
  if (s.phase === "game-over" || seat !== s.active) return null;

  switch (s.phase) {
    case "setup-place":
      // SETUP-5: one army at a time.
      return { kind: "setup-place", ownTerritories: ownedBy(s, seat), ownArmiesLeft: 1 };

    case "reinforce": {
      const r = reinforceState(s);
      const hand = s.hands[seat];
      return {
        kind: "reinforce",
        armiesToPlace: r.armiesToPlace,
        mayPlace: !mustTrade(s),
        ownTerritories: ownedBy(s, seat),
        mustTrade: mustTrade(s),
        sets: mayTrade(s) ? setsIn(hand) : [],
        bonusTerritories: bonusTerritories(s, seat, hand),
      };
    }

    case "attack": {
      const o = s.occupying;
      if (o) return { kind: "occupy", from: o.from, to: o.to, min: o.min, max: o.max };
      return { kind: "attack", attacks: attacks(s, seat) };
    }

    case "fortify":
      return { kind: "fortify", moves: fortifyMoves(s, seat) };
  }
}

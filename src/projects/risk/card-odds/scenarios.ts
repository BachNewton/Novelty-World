import type { CardId } from "../contract";
import { events, type Scenario } from "./test-kit";

// Small games the brute force can finish, each a case the odds must get right.

// Infantry: alaska, alberta, iceland. Cavalry: greenland, peru, congo. Artillery: ontario,
// brazil. And a wild.
const DECK: CardId[] = ["alaska", "greenland", "ontario", "alberta", "peru", "brazil", "wild-1", "iceland", "congo"];

function scenario(deckSize: number, script: string, hand: CardId[]): Scenario {
  return { players: 3, viewer: 0, deck: DECK.slice(0, deckSize), history: events(script), hand };
}

export const SCENARIOS: Record<string, Scenario> = {
  // Seat 1's traded cards go under the deck's top 3, so the next three draws can't be them.
  "a trade's cards come back below the top 3": scenario(7, "d1 d1 d1 t1:alaska,greenland,ontario d2 d0:alberta d1 d2", ["alberta"]),
  // The viewer's own trade, then seat 1 takes seat 2's hand and trades one of its own cards back.
  "the viewer trades, and a seat is eliminated": scenario(
    9,
    "d0:alaska d0:greenland d0:ontario t0:alaska,greenland,ontario d1 d1 d2 d1 e2>1 t1:peru,brazil,alaska d0:iceland d1",
    ["iceland"],
  ),
  // The viewer takes seat 2's hand: its cards are seen as the viewer trades them and holds them.
  "the viewer eliminates a seat": scenario(9, "d1 d2 d2 d0:alaska d2 e2>0 t0:alaska,peru,brazil d1", ["wild-1"]),
  "a spectator": { players: 3, viewer: null, deck: DECK.slice(0, 8), history: events("d1 d2 d1 d1 t1:alaska,greenland,ontario d2 d1 d2"), hand: null },
};

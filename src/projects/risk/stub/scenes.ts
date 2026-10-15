import type { CardId, GameEvent } from "../contract";
import type { Scene } from "../local-engine";
import { TERRITORIES, type ContinentId, type TerritoryId } from "../map";
import { dealtState, stubEngine, wrapStub, type StubState } from "./stub-engine";

/*
 * Hand-made positions in the stub engine, one per phase that is slow to reach by playing, so
 * every screen can be looked at at once. Like the stub, they go when the real engine comes.
 */

/** Four players mid-game, each holding a block of the world. */
function midGame(): StubState {
  const s = dealtState({ players: 4 }, "scene");
  const holder: Record<ContinentId, number> = { "north-america": 0, "south-america": 3, europe: 1, africa: 1, asia: 2, australia: 3 };
  TERRITORIES.forEach((t, i) => {
    s.owners[t.id] = holder[t.continent];
    s.armies[t.id] = 1 + ((i * 7) % 5);
  });
  // Borders a player would hold in strength.
  Object.assign(s.armies, { "central-america": 9, venezuela: 4, alaska: 6, greenland: 5, brazil: 7, "north-africa": 8, ukraine: 7, "middle-east": 6, ural: 8, siam: 5, kamchatka: 4, indonesia: 6 });
  s.owners.iceland = 0;
  s.owners.kamchatka = 0;
  s.turnOrder = [0, 1, 2, 3];
  s.setupLeft = [0, 0, 0, 0];
  s.active = 0;
  s.turn = 9;
  s.phase = "attack";
  s.hands = [["peru", "japan"], ["egypt", "siam", "wild-2"], ["ontario"], ["china", "ural"]];
  s.deck = s.deck.filter((card) => !s.hands.flat().includes(card));
  s.setsTraded = 3;
  return s;
}

function scene(id: string, name: string, make: () => StubState, events: readonly GameEvent[] = []): Scene {
  return { id, name, start: () => ({ state: wrapStub(make()), events: [...events, { kind: "phase", rule: "TURN-1", phase: make().phase }] }) };
}

function holding(s: StubState, hand: CardId[]): StubState {
  s.hands[s.active] = hand;
  s.deck = s.deck.filter((card) => !s.hands.flat().includes(card));
  return s;
}

function reinforcing(s: StubState, armies: number): StubState {
  s.phase = "reinforce";
  s.toPlace = armies;
  return s;
}

/** Seat 3 down to one territory beside seat 0's big army, holding four cards. */
function lastStand(): StubState {
  const s = midGame();
  for (const id of ["venezuela", "peru", "brazil", "indonesia", "new-guinea", "western-australia", "eastern-australia"] as TerritoryId[]) s.owners[id] = id === "venezuela" || id === "peru" || id === "brazil" ? 0 : 2;
  s.owners.argentina = 3;
  s.armies.argentina = 1;
  s.armies.brazil = 12;
  s.hands[3] = ["china", "ural", "congo", "wild-1"];
  return holding(s, ["peru", "brazil", "japan"]);
}

export const STUB_SCENES: readonly Scene[] = [
  { id: "setup", name: "Setup: placing the starting armies", start: () => stubEngine.newGame({ players: 4 }, "setup-scene") },
  scene("reinforce", "Reinforce, with a set to trade", () => holding(reinforcing(midGame(), 5), ["alaska", "greenland", "wild-1"])),
  scene("forced-trade", "Reinforce, forced to trade (5 cards)", () => holding(reinforcing(midGame(), 4), ["alaska", "brazil", "egypt", "japan", "wild-1"])),
  scene("attack", "Attack", midGame),
  scene("occupy", "Occupy a captured territory", () => {
    const s = midGame();
    s.owners.venezuela = 0;
    s.armies.venezuela = 3;
    s.armies["central-america"] = 7;
    s.occupying = { from: "central-america", to: "venezuela", min: 3, max: 9 };
    s.capturedThisTurn = true;
    return s;
  }),
  scene("elimination", "Attack to eliminate a player (forced trade after)", lastStand),
  scene("fortify", "Fortify", () => {
    const s = midGame();
    s.phase = "fortify";
    return s;
  }),
  scene("game-over", "Game over", () => {
    const s = midGame();
    for (const t of TERRITORIES) s.owners[t.id] = 0;
    s.eliminated = [false, true, true, true];
    s.winner = 0;
    s.phase = "game-over";
    return s;
  }, [{ kind: "game-over", rule: "WIN-1", winner: 0 }]),
];

import type {
  GameState,
  Player,
  PlayerPreferences,
  TurnGroup,
} from "./types";

const PLAYERS: readonly Player[] = [
  { id: "p1", name: "Kyle",   color: "crimson", icon: "dog",    cash: 1240, position: 10, inJail: true,  jailTurns: 1 },
  { id: "p2", name: "Alex",   color: "violet",  icon: "car",    cash: 850,  position: 10, inJail: false, jailTurns: 0 },
  { id: "p3", name: "Sam",    color: "teal",    icon: "ship",   cash: 1450, position: 10, inJail: true,  jailTurns: 3 },
  { id: "p4", name: "Jordan", color: "amber",   icon: "crown",  cash: 2890, position: 10, inJail: false, jailTurns: 0 },
  { id: "p5", name: "Riley",  color: "emerald", icon: "cat",    cash: 670,  position: 11, inJail: false, jailTurns: 0 },
  { id: "p6", name: "Casey",  color: "indigo",  icon: "plane",  cash: 1820, position: 11, inJail: false, jailTurns: 0 },
  { id: "p7", name: "Morgan", color: "magenta", icon: "rocket", cash: 410,  position: 11, inJail: false, jailTurns: 0 },
  { id: "p8", name: "Drew",   color: "slate",   icon: "bird",   cash: 3210, position: 12, inJail: false, jailTurns: 0 },
];

const DEFAULT_PREFERENCES: PlayerPreferences = {
  jailStance: "leave",
  autoBuyCashFraction: 1,
};

/** Hardcoded GameState for visual development. 4 players at JAIL (2 jailed,
 *  2 visiting), 3 on St. Charles Place, and 1 on the Electric Company —
 *  exercises the no-cost crowded square, the property crowded square, and
 *  a solo token on a cost-bearing utility row all in one view. */
export const MOCK_STATE: GameState = {
  players: PLAYERS,
  ownership: {
    // Browns — Kyle holds the monopoly (one mortgaged)
    1: "p1",
    3: "p1",
    // Light blues — Alex holds the monopoly
    6: "p2",
    8: "p2",
    9: "p2",
    // Pinks — Alex holds the monopoly (hotels on all three)
    11: "p2",
    13: "p2",
    14: "p2",
    // Oranges — Sam holds the monopoly (1, 2, 3 houses)
    16: "p3",
    18: "p3",
    19: "p3",
    // Reds — Jordan holds the monopoly (hotels on all three)
    21: "p4",
    23: "p4",
    24: "p4",
    // Yellows — Jordan has 2 of 3
    26: "p4",
    27: "p4",
    // Greens — Jordan holds the monopoly (4 houses on each)
    31: "p4",
    32: "p4",
    34: "p4",
    // Dark blues — Jordan has Boardwalk
    39: "p4",
    // Railroads
    5: "p1",
    15: "p3",
    25: "p4",
    // Utilities
    12: "p1",
    28: "p4",
  },
  mortgaged: {
    3: true,  // Baltic Avenue (property)
    9: true,  // Connecticut Avenue (property in monopoly)
    15: true, // Pennsylvania Railroad
    28: true, // Water Works (utility)
    39: true, // Boardwalk (dark blue)
  },
  jailFreeCards: {
    // Kyle holds the Chance GOJF; the CC card stays in the deck.
    chance: "p1",
  },
  houses: {
    // Pinks — hotels
    11: 5, // St. Charles Place
    13: 5, // States Avenue
    14: 5, // Virginia Avenue
    // Oranges — 1, 2, 3 houses
    16: 1, // St. James Place
    18: 2, // Tennessee Avenue
    19: 3, // New York Avenue
    // Reds — hotels
    21: 5, // Kentucky Avenue
    23: 5, // Indiana Avenue
    24: 5, // Illinois Avenue
    // Greens — 4 houses on each
    31: 4, // Pacific Avenue
    32: 4, // North Carolina Avenue
    34: 4, // Pennsylvania Avenue
  },
  turns: MOCK_TURNS(),
  turn: {
    playerId: "p2",
    phase: "pre-roll",
    doublesStreak: 0,
    paused: false,
  },
  preferences: Object.fromEntries(
    PLAYERS.map((p) => [p.id, DEFAULT_PREFERENCES]),
  ),
  rngSeed: "mock-seed",
};

/** Synthetic play history exercising every GameEvent kind so the EventLog
 *  can be developed visually without a real game loop. Sequence isn't
 *  state-consistent — its job is to surface each renderer, not simulate a
 *  legal game. Mock IDs map: p1 Kyle, p2 Alex, p3 Sam, p4 Jordan. */
function MOCK_TURNS(): readonly TurnGroup[] {
  return [
    {
      turn: 11,
      playerId: "p1",
      events: [
        { kind: "roll", dice: [3, 4], doublesStreak: 0, toPosition: 7, passedGo: false },
        {
          kind: "card-drawn",
          source: "chance",
          text: "Advance to Illinois Avenue. If you pass GO, collect $200.",
        },
        { kind: "rent", ownerId: "p4", position: 24, amount: 1100 },
      ],
    },
    {
      turn: 12,
      playerId: "p2",
      events: [
        { kind: "roll", dice: [6, 6], doublesStreak: 1, toPosition: 22, passedGo: false },
        { kind: "roll", dice: [3, 4], doublesStreak: 0, toPosition: 29, passedGo: false },
        { kind: "buy", position: 29, price: 280 },
      ],
    },
    {
      turn: 13,
      playerId: "p3",
      events: [
        { kind: "jail-roll", dice: [2, 4], escaped: false, jailTurn: 1 },
      ],
    },
    {
      turn: 14,
      playerId: "p4",
      events: [
        { kind: "roll", dice: [4, 2], doublesStreak: 0, toPosition: 30, passedGo: false },
        { kind: "go-to-jail", reason: "tile" },
      ],
    },
    {
      turn: 15,
      playerId: "p1",
      events: [
        { kind: "jail-card", source: "chance" },
        { kind: "roll", dice: [4, 3], doublesStreak: 0, toPosition: 14, passedGo: false },
        { kind: "rent", ownerId: "p2", position: 14, amount: 900 },
        { kind: "mortgage", position: 5, received: 100 },
      ],
    },
    {
      turn: 16,
      playerId: "p2",
      events: [
        { kind: "roll", dice: [5, 3], doublesStreak: 0, toPosition: 37, passedGo: false },
        {
          kind: "card-drawn",
          source: "chance",
          text: "Advance to GO. Collect $200.",
        },
      ],
    },
    {
      turn: 17,
      playerId: "p3",
      events: [
        { kind: "jail-card", source: "communityChest" },
        { kind: "roll", dice: [3, 4], doublesStreak: 0, toPosition: 17, passedGo: false },
        { kind: "build", position: 16, toLevel: 4, cost: 100 },
        { kind: "build", position: 18, toLevel: 3, cost: 100 },
      ],
    },
    {
      turn: 18,
      playerId: "p4",
      events: [
        { kind: "jail-roll", dice: [4, 4], escaped: true, jailTurn: 2 },
        { kind: "rent", ownerId: "p3", position: 18, amount: 550 },
      ],
    },
    {
      turn: 19,
      playerId: "p1",
      events: [
        { kind: "roll", dice: [2, 2], doublesStreak: 1, toPosition: 4, passedGo: false },
        { kind: "tax", taxName: "Income Tax", amount: 200 },
        { kind: "roll", dice: [5, 3], doublesStreak: 0, toPosition: 12, passedGo: false },
        { kind: "unmortgage", position: 1, cost: 33 },
      ],
    },
    {
      turn: 20,
      playerId: "p2",
      events: [
        { kind: "roll", dice: [5, 2], doublesStreak: 0, toPosition: 27, passedGo: false },
        { kind: "rent", ownerId: "p4", position: 27, amount: 22 },
        {
          kind: "trade",
          withId: "p4",
          gave: { positions: [14], cash: 200, gojf: [] },
          received: { positions: [27], cash: 0, gojf: [] },
        },
        { kind: "sell-building", position: 11, toLevel: 4, refund: 50 },
      ],
    },
    {
      turn: 21,
      playerId: "p3",
      events: [
        { kind: "roll", dice: [4, 2], doublesStreak: 0, toPosition: 6, passedGo: false },
        { kind: "auction", position: 6, winnerId: "p3", price: 80 },
      ],
    },
    {
      turn: 22,
      playerId: "p4",
      events: [
        { kind: "roll", dice: [3, 3], doublesStreak: 1, toPosition: 36, passedGo: false },
        { kind: "roll", dice: [5, 5], doublesStreak: 2, toPosition: 6, passedGo: true },
        { kind: "rent", ownerId: "p3", position: 6, amount: 6 },
        { kind: "roll", dice: [6, 6], doublesStreak: 3, toPosition: 18, passedGo: false },
        { kind: "go-to-jail", reason: "three-doubles" },
      ],
    },
    {
      turn: 23,
      playerId: "p1",
      events: [
        { kind: "roll", dice: [3, 5], doublesStreak: 0, toPosition: 39, passedGo: false },
        { kind: "rent", ownerId: "p4", position: 39, amount: 2000 },
        { kind: "mortgage", position: 12, received: 75 },
        { kind: "bankrupt", creditorId: "p4" },
        { kind: "winner", winnerId: "p4" },
      ],
    },
  ];
}

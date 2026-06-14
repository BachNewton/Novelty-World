import type { Card, CardSource, PlayerColor, PlayerIcon, Space } from "./types";

/** Canonical assignment order for player seats. The lobby hands out the first
 *  free color / icon in these orders, so seat N defaults to the Nth entry —
 *  matching the pairing the mock roster uses (crimson/dog, violet/car, …).
 *  `satisfies` keeps each array in sync with its union type (a typo or a hue
 *  dropped from `PlayerColor` fails the build). */
export const PLAYER_COLORS = [
  "crimson",
  "violet",
  "teal",
  "amber",
  "emerald",
  "indigo",
  "magenta",
  "slate",
] as const satisfies readonly PlayerColor[];

export const PLAYER_ICONS = [
  "dog",
  "car",
  "ship",
  "crown",
  "cat",
  "plane",
  "rocket",
  "bird",
] as const satisfies readonly PlayerIcon[];

/** The 40 spaces of a standard US Monopoly board, in order starting from GO
 *  and proceeding clockwise (GO is the bottom-right corner). */
export const SPACES: readonly Space[] = [
  { kind: "go" },
  {
    kind: "property",
    name: "Mediterranean Avenue",
    price: 60,
    color: "brown",
    rent: { base: 2, houses: [10, 30, 90, 160], hotel: 250 },
  },
  { kind: "community-chest" },
  {
    kind: "property",
    name: "Baltic Avenue",
    price: 60,
    color: "brown",
    rent: { base: 4, houses: [20, 60, 180, 320], hotel: 450 },
  },
  { kind: "tax", name: "Income Tax", amount: 200 },
  { kind: "railroad", name: "Reading Railroad", price: 200 },
  {
    kind: "property",
    name: "Oriental Avenue",
    price: 100,
    color: "light-blue",
    rent: { base: 6, houses: [30, 90, 270, 400], hotel: 550 },
  },
  { kind: "chance" },
  {
    kind: "property",
    name: "Vermont Avenue",
    price: 100,
    color: "light-blue",
    rent: { base: 6, houses: [30, 90, 270, 400], hotel: 550 },
  },
  {
    kind: "property",
    name: "Connecticut Avenue",
    price: 120,
    color: "light-blue",
    rent: { base: 8, houses: [40, 100, 300, 450], hotel: 600 },
  },
  { kind: "jail" },
  {
    kind: "property",
    name: "St. Charles Place",
    price: 140,
    color: "pink",
    rent: { base: 10, houses: [50, 150, 450, 625], hotel: 750 },
  },
  { kind: "utility", name: "Electric Company", price: 150 },
  {
    kind: "property",
    name: "States Avenue",
    price: 140,
    color: "pink",
    rent: { base: 10, houses: [50, 150, 450, 625], hotel: 750 },
  },
  {
    kind: "property",
    name: "Virginia Avenue",
    price: 160,
    color: "pink",
    rent: { base: 12, houses: [60, 180, 500, 700], hotel: 900 },
  },
  { kind: "railroad", name: "Pennsylvania Railroad", price: 200 },
  {
    kind: "property",
    name: "St. James Place",
    price: 180,
    color: "orange",
    rent: { base: 14, houses: [70, 200, 550, 750], hotel: 950 },
  },
  { kind: "community-chest" },
  {
    kind: "property",
    name: "Tennessee Avenue",
    price: 180,
    color: "orange",
    rent: { base: 14, houses: [70, 200, 550, 750], hotel: 950 },
  },
  {
    kind: "property",
    name: "New York Avenue",
    price: 200,
    color: "orange",
    rent: { base: 16, houses: [80, 220, 600, 800], hotel: 1000 },
  },
  { kind: "free-parking" },
  {
    kind: "property",
    name: "Kentucky Avenue",
    price: 220,
    color: "red",
    rent: { base: 18, houses: [90, 250, 700, 875], hotel: 1050 },
  },
  { kind: "chance" },
  {
    kind: "property",
    name: "Indiana Avenue",
    price: 220,
    color: "red",
    rent: { base: 18, houses: [90, 250, 700, 875], hotel: 1050 },
  },
  {
    kind: "property",
    name: "Illinois Avenue",
    price: 240,
    color: "red",
    rent: { base: 20, houses: [100, 300, 750, 925], hotel: 1100 },
  },
  { kind: "railroad", name: "B. & O. Railroad", price: 200 },
  {
    kind: "property",
    name: "Atlantic Avenue",
    price: 260,
    color: "yellow",
    rent: { base: 22, houses: [110, 330, 800, 975], hotel: 1150 },
  },
  {
    kind: "property",
    name: "Ventnor Avenue",
    price: 260,
    color: "yellow",
    rent: { base: 22, houses: [110, 330, 800, 975], hotel: 1150 },
  },
  { kind: "utility", name: "Water Works", price: 150 },
  {
    kind: "property",
    name: "Marvin Gardens",
    price: 280,
    color: "yellow",
    rent: { base: 24, houses: [120, 360, 850, 1025], hotel: 1200 },
  },
  { kind: "go-to-jail" },
  {
    kind: "property",
    name: "Pacific Avenue",
    price: 300,
    color: "green",
    rent: { base: 26, houses: [130, 390, 900, 1100], hotel: 1275 },
  },
  {
    kind: "property",
    name: "North Carolina Avenue",
    price: 300,
    color: "green",
    rent: { base: 26, houses: [130, 390, 900, 1100], hotel: 1275 },
  },
  { kind: "community-chest" },
  {
    kind: "property",
    name: "Pennsylvania Avenue",
    price: 320,
    color: "green",
    rent: { base: 28, houses: [150, 450, 1000, 1200], hotel: 1400 },
  },
  { kind: "railroad", name: "Short Line", price: 200 },
  { kind: "chance" },
  {
    kind: "property",
    name: "Park Place",
    price: 350,
    color: "dark-blue",
    rent: { base: 35, houses: [175, 500, 1100, 1300], hotel: 1500 },
  },
  { kind: "tax", name: "Luxury Tax", amount: 100 },
  {
    kind: "property",
    name: "Boardwalk",
    price: 400,
    color: "dark-blue",
    rent: { base: 50, houses: [200, 600, 1400, 1700], hotel: 2000 },
  },
];

/** The 16 Chance cards (classic US standard deck). `name` is the pro shorthand
 *  the log shows; `effect` is what the engine runs. The two "advance to nearest
 *  railroad" cards are distinct entries with their own ids. */
export const CHANCE: readonly Card[] = [
  { id: "chance-go", name: "GO", effect: { kind: "advance-to", position: 0 } },
  { id: "chance-illinois", name: "Illinois", effect: { kind: "advance-to", position: 24 } },
  { id: "chance-st-charles", name: "St. Charles", effect: { kind: "advance-to", position: 11 } },
  { id: "chance-boardwalk", name: "Boardwalk", effect: { kind: "advance-to", position: 39 } },
  { id: "chance-reading", name: "Reading", effect: { kind: "advance-to", position: 5 } },
  { id: "chance-nearest-rr-a", name: "Nearest RR", effect: { kind: "advance-nearest", target: "railroad" } },
  { id: "chance-nearest-rr-b", name: "Nearest RR", effect: { kind: "advance-nearest", target: "railroad" } },
  { id: "chance-nearest-util", name: "Nearest Util", effect: { kind: "advance-nearest", target: "utility" } },
  { id: "chance-back-3", name: "Back 3", effect: { kind: "back-three" } },
  { id: "chance-jail", name: "Go to Jail", effect: { kind: "go-to-jail" } },
  { id: "chance-gojf", name: "GOJF", effect: { kind: "jail-free" } },
  { id: "chance-dividend", name: "Dividend", effect: { kind: "collect", amount: 50 } },
  { id: "chance-loan", name: "Loan", effect: { kind: "collect", amount: 150 } },
  { id: "chance-speeding", name: "Speeding", effect: { kind: "pay", amount: 15 } },
  { id: "chance-chairman", name: "Chairman", effect: { kind: "pay-each", amount: 50 } },
  { id: "chance-repairs", name: "Repairs", effect: { kind: "repairs", perHouse: 25, perHotel: 100 } },
];

/** The 16 Community Chest cards (classic US standard deck). */
export const COMMUNITY_CHEST: readonly Card[] = [
  { id: "cc-go", name: "GO", effect: { kind: "advance-to", position: 0 } },
  { id: "cc-bank-error", name: "Bank Error", effect: { kind: "collect", amount: 200 } },
  { id: "cc-doctor", name: "Doctor", effect: { kind: "pay", amount: 50 } },
  { id: "cc-stock", name: "Stock", effect: { kind: "collect", amount: 50 } },
  { id: "cc-gojf", name: "GOJF", effect: { kind: "jail-free" } },
  { id: "cc-jail", name: "Go to Jail", effect: { kind: "go-to-jail" } },
  { id: "cc-holiday", name: "Holiday Fund", effect: { kind: "collect", amount: 100 } },
  { id: "cc-tax-refund", name: "Tax Refund", effect: { kind: "collect", amount: 20 } },
  { id: "cc-birthday", name: "Birthday", effect: { kind: "collect-each", amount: 10 } },
  { id: "cc-life-insurance", name: "Life Insurance", effect: { kind: "collect", amount: 100 } },
  { id: "cc-hospital", name: "Hospital", effect: { kind: "pay", amount: 100 } },
  { id: "cc-school", name: "School", effect: { kind: "pay", amount: 50 } },
  { id: "cc-consultancy", name: "Consultancy", effect: { kind: "collect", amount: 25 } },
  { id: "cc-beauty", name: "Beauty", effect: { kind: "collect", amount: 10 } },
  { id: "cc-inheritance", name: "Inheritance", effect: { kind: "collect", amount: 100 } },
  { id: "cc-street-repairs", name: "Street Repairs", effect: { kind: "repairs", perHouse: 40, perHotel: 115 } },
];

/** The static deck for a card source, in canonical (unshuffled) order. */
export function deckFor(source: CardSource): readonly Card[] {
  return source === "chance" ? CHANCE : COMMUNITY_CHEST;
}

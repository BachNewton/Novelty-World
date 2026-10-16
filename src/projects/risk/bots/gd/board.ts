import type { GameView, Seat } from "../../contract";
import { CONTINENTS, TERRITORIES, type ContinentId, type TerritoryId } from "../../map";

// The board as GD's AI walks it. GD's ties go to whichever candidate it visits first, so the order
// matters: GD visits its map's territories by their ids, which are alphabetical, and each
// territory's neighbours in the order its map asset lists them (`dump/mapdata`, the classic map).
// The asset gives the ids and links; that the scene's territory array holds them in id order is
// the likelier reading, not a traced one.

export const GD_ORDER: readonly TerritoryId[] = [
  "afghanistan", "alaska", "alberta", "argentina", "brazil", "central-america", "china", "congo",
  "east-africa", "eastern-australia", "eastern-united-states", "egypt", "great-britain", "greenland",
  "iceland", "india", "indonesia", "irkutsk", "japan", "kamchatka", "madagascar", "middle-east",
  "mongolia", "new-guinea", "north-africa", "northern-europe", "northwest-territory", "ontario", "peru",
  "quebec", "scandinavia", "siam", "siberia", "south-africa", "southern-europe", "ukraine", "ural",
  "venezuela", "western-australia", "western-europe", "western-united-states", "yakutsk",
];

export const GD_LINKS: Readonly<Record<TerritoryId, readonly TerritoryId[]>> = {
  "afghanistan": ["china", "india", "ural", "ukraine", "middle-east"],
  "alaska": ["alberta", "northwest-territory", "kamchatka"],
  "alberta": ["western-united-states", "alaska", "ontario", "northwest-territory"],
  "argentina": ["brazil", "peru"],
  "brazil": ["north-africa", "argentina", "peru", "venezuela"],
  "central-america": ["venezuela", "western-united-states", "eastern-united-states"],
  "china": ["mongolia", "siam", "siberia", "afghanistan", "india", "ural"],
  "congo": ["south-africa", "north-africa", "east-africa"],
  "east-africa": ["middle-east", "madagascar", "egypt", "north-africa", "south-africa", "congo"],
  "eastern-australia": ["new-guinea", "western-australia"],
  "eastern-united-states": ["quebec", "central-america", "western-united-states", "ontario"],
  "egypt": ["middle-east", "east-africa", "north-africa", "southern-europe"],
  "great-britain": ["western-europe", "iceland", "scandinavia", "northern-europe"],
  "greenland": ["northwest-territory", "iceland", "quebec", "ontario"],
  "iceland": ["greenland", "scandinavia", "great-britain"],
  "india": ["siam", "middle-east", "afghanistan", "china"],
  "indonesia": ["new-guinea", "western-australia", "siam"],
  "irkutsk": ["yakutsk", "kamchatka", "siberia", "mongolia"],
  "japan": ["kamchatka", "mongolia"],
  "kamchatka": ["yakutsk", "japan", "irkutsk", "mongolia", "alaska"],
  "madagascar": ["east-africa", "south-africa"],
  "middle-east": ["india", "east-africa", "ukraine", "afghanistan", "southern-europe", "egypt"],
  "mongolia": ["japan", "china", "kamchatka", "siberia", "irkutsk"],
  "new-guinea": ["indonesia", "eastern-australia", "western-australia"],
  "north-africa": ["congo", "brazil", "western-europe", "southern-europe", "east-africa", "egypt"],
  "northern-europe": ["southern-europe", "western-europe", "scandinavia", "great-britain", "ukraine"],
  "northwest-territory": ["alaska", "greenland", "ontario", "alberta"],
  "ontario": ["alberta", "northwest-territory", "western-united-states", "greenland", "quebec", "eastern-united-states"],
  "peru": ["argentina", "venezuela", "brazil"],
  "quebec": ["greenland", "eastern-united-states", "ontario"],
  "scandinavia": ["iceland", "ukraine", "northern-europe", "great-britain"],
  "siam": ["indonesia", "india", "china"],
  "siberia": ["ural", "yakutsk", "mongolia", "china", "irkutsk"],
  "south-africa": ["madagascar", "congo", "east-africa"],
  "southern-europe": ["western-europe", "north-africa", "northern-europe", "ukraine", "middle-east", "egypt"],
  "ukraine": ["scandinavia", "ural", "afghanistan", "middle-east", "northern-europe", "southern-europe"],
  "ural": ["ukraine", "siberia", "china", "afghanistan"],
  "venezuela": ["peru", "central-america", "brazil"],
  "western-australia": ["eastern-australia", "indonesia", "new-guinea"],
  "western-europe": ["southern-europe", "north-africa", "northern-europe", "great-britain"],
  "western-united-states": ["central-america", "alberta", "eastern-united-states", "ontario"],
  "yakutsk": ["siberia", "kamchatka", "irkutsk"],
};

export const CONTINENT_OF = {} as Record<TerritoryId, ContinentId>;
for (const t of TERRITORIES) CONTINENT_OF[t.id] = t.continent;

export const CONTINENT_TERRITORIES = {} as Record<ContinentId, readonly TerritoryId[]>;
export const CONTINENT_BONUS = {} as Record<ContinentId, number>;
for (const c of CONTINENTS) {
  CONTINENT_TERRITORIES[c.id] = GD_ORDER.filter((t) => CONTINENT_OF[t] === c.id);
  CONTINENT_BONUS[c.id] = c.bonus;
}

/** GD's `Map.MaxContinentBonus`. */
export const MAX_CONTINENT_BONUS = Math.max(...CONTINENTS.map((c) => c.bonus));

/** `REINF-6`, which GD adds while every seat is on its first turn. */
const FIRST_TURN_BONUS: Readonly<Record<number, readonly number[]>> = {
  3: [0, 0, 1],
  4: [0, 0, 0, 1],
  5: [0, 0, 0, 1, 2],
  6: [0, 0, 0, 1, 2, 3],
};

/** The board and the table as GD's AI reads them, from one seat's view. */
export class Board {
  constructor(
    readonly view: GameView,
    /** Whether the turn order hasn't yet come round: GD's `currentRound == 0`, read as our engine
     *  counts rounds. */
    readonly firstRound: boolean,
  ) {}

  owner(t: TerritoryId): Seat {
    return this.view.territories[t].owner;
  }

  units(t: TerritoryId): number {
    return this.view.territories[t].armies;
  }

  /** `GetCountries(player, minUnits, false)`: in GD's map order. */
  countries(seat: Seat, minUnits = 1): TerritoryId[] {
    return GD_ORDER.filter((t) => this.owner(t) === seat && this.units(t) >= minUnits);
  }

  /** `Territory.Enemies`: neighbours another seat holds, in link order. */
  enemies(t: TerritoryId): TerritoryId[] {
    return GD_LINKS[t].filter((n) => this.owner(n) !== this.owner(t));
  }

  countEnemies(t: TerritoryId): number {
    return this.enemies(t).length;
  }

  /** `Region.Owner`: the seat holding all of a continent, or null. */
  continentOwner(c: ContinentId): Seat | null {
    const first = this.owner(CONTINENT_TERRITORIES[c][0]);
    return CONTINENT_TERRITORIES[c].every((t) => this.owner(t) === first) ? first : null;
  }

  /** `Territory.OwnerOwnsContinent`. */
  ownerOwnsContinent(t: TerritoryId): boolean {
    return this.continentOwner(CONTINENT_OF[t]) === this.owner(t);
  }

  /** `MapManager.GetConnectedCountries`, less the territory itself: every territory its owner
   *  holds that a chain of the owner's territories joins to it, in GD's breadth-first order. */
  connected(t: TerritoryId): TerritoryId[] {
    const owner = this.owner(t);
    const found: TerritoryId[] = [t];
    for (let i = 0; i < found.length; i++) {
      for (const n of GD_LINKS[found[i]]) if (this.owner(n) === owner && !found.includes(n)) found.push(n);
    }
    return found.slice(1);
  }

  /** `Player.totalUnits`: the armies on the board and those still to place this turn. */
  totalUnits(seat: Seat): number {
    let sum = 0;
    for (const t of GD_ORDER) if (this.owner(t) === seat) sum += this.units(t);
    return sum + (seat === this.view.active ? this.view.armiesToPlace : 0);
  }

  countriesOwned(seat: Seat): number {
    return this.view.seats[seat].territories;
  }

  cards(seat: Seat): number {
    return this.view.seats[seat].handSize;
  }

  /** `GameControl.GetSimpleHandoutUnitInfo(player).UnclampedTotal`: the seat's reinforcements by
   *  territories (at least 3, so an eliminated seat's is 3) and continents, and its first-turn
   *  bonus while the turn order hasn't come round. */
  income(seat: Seat): number {
    let sum = Math.max(3, Math.floor(this.countriesOwned(seat) / 3));
    for (const c of CONTINENTS) if (this.continentOwner(c.id) === seat) sum += c.bonus;
    if (this.firstRound) sum += FIRST_TURN_BONUS[this.view.turnOrder.length][this.view.turnOrder.indexOf(seat)];
    return sum;
  }

  /** `GameControl.nextPlayer`: the seat after the active one still in the game. */
  nextPlayer(): Seat {
    const order = this.view.turnOrder;
    const at = order.indexOf(this.view.active);
    for (let step = 1; step <= order.length; step++) {
      const seat = order[(at + step) % order.length];
      if (!this.view.seats[seat].eliminated) return seat;
    }
    return this.view.active;
  }

  /** `GameManager.players`: every seat, eliminated ones too. GD plays its players in their array's
   *  order, so the array is taken to be in turn order (a reading: it decides only ties). */
  players(): readonly Seat[] {
    return this.view.turnOrder;
  }
}

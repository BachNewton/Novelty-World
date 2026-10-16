import type { CardId, Seat } from "../../contract";
import { territoryOf } from "../../cards";
import type { ContinentId, TerritoryId } from "../../map";
import { Board, CONTINENT_BONUS, CONTINENT_OF, CONTINENT_TERRITORIES, GD_LINKS, MAX_CONTINENT_BONUS } from "./board";
import { idealAttackUnits, roundHalfEven, winChance } from "./odds";

// GD's `AIHelper`: the features the personas weigh, each a port of the method it names. They read
// the board as the bot's seat sees it, and the turn so far: whether the bot has captured anything
// yet (GD's `countriesConquered`) and how many attacks it has made (`AIAttack._attackCount`).

/** GD's `clamp01`: NaN passes through, as GD's compare-and-branch lets it. */
export function clamp01(x: number): number {
  if (0 > x) return 0;
  if (x > 1) return 1;
  return x;
}

/** The Expert multiplier of `GetAttackTurnsLimit`. */
const EXPERT_ATTACK_TURNS = 0.75;

export interface HelperInput {
  board: Board;
  /** The bot's seat: GD's `AIHelper._player`. */
  me: Seat;
  /** The bot's own cards. */
  hand: readonly CardId[];
  /** Per seat, whether a person plays it. */
  humans: readonly boolean[];
  /** Territories the bot has captured this turn. */
  conqueredThisTurn: number;
  /** Attacks the bot has made this turn. */
  attacksThisTurn: number;
  /** The persona's `attackSuccessThreshold` weight, 0 to 100. */
  attackSuccessThreshold: number;
}

export class Helper {
  readonly board: Board;
  readonly me: Seat;
  private readonly hand: readonly CardId[];
  private readonly humans: readonly boolean[];
  private readonly conqueredThisTurn: number;
  private readonly attacksThisTurn: number;
  private readonly attackSuccessThreshold: number;

  constructor(input: HelperInput) {
    this.board = input.board;
    this.me = input.me;
    this.hand = input.hand;
    this.humans = input.humans;
    this.conqueredThisTurn = input.conqueredThisTurn;
    this.attacksThisTurn = input.attacksThisTurn;
    this.attackSuccessThreshold = input.attackSuccessThreshold;
  }

  private units(t: TerritoryId): number {
    return this.board.units(t);
  }

  private owner(t: TerritoryId): Seat {
    return this.board.owner(t);
  }

  /** `GetDesperateMode`: nothing captured yet this turn. */
  desperate(): boolean {
    return this.conqueredThisTurn === 0;
  }

  /** `GetAttackTurnsLimit(multiplier, max)` at Expert: 0 until the first capture, then the attacks
   *  made this turn scaled, up to `max`. */
  attackTurnsLimit(multiplier: number, max: number): number {
    if (this.conqueredThisTurn === 0) return 0;
    const r = this.attacksThisTurn * EXPERT_ATTACK_TURNS * multiplier;
    if (0 > r) return 0;
    return r > max ? max : r;
  }

  // -------------------------------------------------------------------------
  // Battle odds
  // -------------------------------------------------------------------------

  /** `GetBattleSuccess(attacker, defender, attackUnits)`: 0 unless the attacker has more than one
   *  army and the two have different owners. */
  battleSuccessUnits(a: TerritoryId, d: TerritoryId, attackUnits: number): number {
    if (this.units(a) <= 1) return 0;
    if (this.owner(a) === this.owner(d)) return 0;
    return winChance(attackUnits, this.units(d));
  }

  /** `GetBattleSuccess(attacker, defender)`: all but one army attacking. */
  battleSuccess(a: TerritoryId, d: TerritoryId): number {
    return this.battleSuccessUnits(a, d, this.units(a) - 1);
  }

  /** `GetBattleSuccess(attacker, defendUnits)`: every army of the attacker, the one left behind
   *  included, against an imagined stack. */
  battleSuccessAgainst(a: TerritoryId, defendUnits: number): number {
    if (this.units(a) <= 1) return 0;
    return winChance(this.units(a), defendUnits);
  }

  /** `GetBattleSuccessMin(territory, unitsAttack)`: the worst chance against any enemy neighbour,
   *  1 with none. */
  battleSuccessMin(s: TerritoryId, unitsAttack: number): number {
    let min = 1;
    for (const n of GD_LINKS[s]) {
      if (this.owner(n) === this.owner(s)) continue;
      const v = this.battleSuccessUnits(s, n, unitsAttack);
      if (!(v > min)) min = v;
    }
    return min;
  }

  /** `GetBattleSuccessMax(territory)`: the best chance against any enemy neighbour, 0 with none. */
  battleSuccessMax(s: TerritoryId): number {
    let max = 0;
    for (const n of GD_LINKS[s]) {
      if (this.owner(n) === this.owner(s)) continue;
      const v = this.battleSuccess(s, n);
      if (!(max > v)) max = v;
    }
    return max;
  }

  // -------------------------------------------------------------------------
  // Continents
  // -------------------------------------------------------------------------

  /** `GetStealContinentBonus(source, target)`. GD divides the continent's bonus by the largest
   *  bonus in whole numbers, so only the largest continent (Asia) earns that term. */
  stealContinentBonus(s: TerritoryId, t: TerritoryId): number {
    if (!this.board.ownerOwnsContinent(t)) return 0;
    let x = this.battleSuccess(s, t) * 0.4;
    const r = Math.trunc(CONTINENT_BONUS[CONTINENT_OF[t]] / MAX_CONTINENT_BONUS) * 0.4;
    x = x + 0.2;
    x = x + r;
    return clamp01(x);
  }

  /** `GetChanceContinentLoss(territory)`: how likely the territory's continent, as far as the bot
   *  holds it, falls to the enemies round it: one minus the territory's chance against all their
   *  armies at once. */
  chanceContinentLoss(src: TerritoryId): number {
    const own = this.continentOwnership(CONTINENT_OF[src], this.me);
    let enemy = 0;
    for (const n of GD_LINKS[src]) if (this.owner(n) !== this.me) enemy += this.units(n);
    if (enemy <= 0) return 0;
    return (1 - this.battleSuccessAgainst(src, enemy)) * own;
  }

  /** `GetBorderWeakness(territory)`: for a territory in a continent its owner holds whole, the
   *  enemy armies next to it from other continents, against what it takes to capture it. */
  borderWeakness(c: TerritoryId): number {
    const continent = CONTINENT_OF[c];
    if (this.board.continentOwner(continent) !== this.owner(c)) return 0;
    const ideal = idealAttackUnits(this.units(c));
    let sum = 0;
    for (const n of GD_LINKS[c]) {
      if (this.owner(n) !== this.me && CONTINENT_OF[n] !== continent) sum += this.units(n);
    }
    return clamp01((sum / ideal) * 0.5);
  }

  // -------------------------------------------------------------------------
  // Players
  // -------------------------------------------------------------------------

  /** `GetChanceEliminatePlayerTo(source, enemy)`: how close the enemy is to being knocked out by
   *  the source's owner, weighing territories, armies, the source's stack and the enemy's cards. */
  chanceEliminatePlayerTo(src: TerritoryId, enemy: Seat): number {
    const mine = this.owner(src);
    const myC = this.board.countriesOwned(mine);
    const myU = this.board.totalUnits(mine);
    const eC = this.board.countriesOwned(enemy);
    const eU = this.board.totalUnits(enemy);
    if (eC >= myC) return 0;
    if (eU >= myU) return 0;
    const a = clamp01((myC - eC) / myC);
    const b = clamp01((myU - eU) / myU);
    const c = clamp01((this.units(src) - eU) / this.units(src));
    const d = clamp01(this.board.cards(enemy) / 5);
    let r = b * 1.2;
    r += a * 0.8;
    r += c * 1.4;
    r += d * 0.6;
    return clamp01(r * 0.25);
  }

  /** `GetChanceEliminatePlayerFrom(source)`: the best of that over the owners of its enemy
   *  neighbours. */
  chanceEliminatePlayerFrom(src: TerritoryId): number {
    let m = 0;
    for (const n of GD_LINKS[src]) {
      if (this.owner(n) === this.owner(src)) continue;
      const v = this.chanceEliminatePlayerTo(src, this.owner(n));
      if (!(m > v)) m = v;
    }
    return m;
  }

  /** `GetEnemyStrength(source, target)`: the target's threat to the source: its armies (at least
   *  3), its owner's coming reinforcements and cards, more if it moves next, against what it would
   *  take to capture the source. */
  enemyStrengthOf(src: TerritoryId, tgt: TerritoryId): number {
    const ideal = idealAttackUnits(this.units(src));
    const enemy = this.owner(tgt);
    let s = Math.max(this.units(tgt), 3);
    s += roundHalfEven(Math.fround(this.board.income(enemy) * Math.fround(0.4)));
    const cards = this.board.cards(enemy);
    if (cards === 3) s += 2;
    else if (cards === 4) s += 4;
    else if (cards === 5) s += 6;
    if (this.board.nextPlayer() === enemy) s = roundHalfEven(s * 1.5);
    return clamp01(s / ideal / 3);
  }

  /** `GetEnemyStrength(source)`: the strongest threat among its enemy neighbours. */
  enemyStrength(src: TerritoryId): number {
    let m = 0;
    for (const n of GD_LINKS[src]) {
      if (this.owner(n) === this.owner(src)) continue;
      const v = this.enemyStrengthOf(src, n);
      if (!(m > v)) m = v;
    }
    return m;
  }

  /** `GetCountryPower(territory)`: its armies against the bot's largest stack, 0 to 1 for the
   *  bot's own (GD divides by zero when every stack is 1, and that is kept). */
  countryPower(c: TerritoryId): number {
    let max = 0;
    for (const t of this.board.countries(this.me)) if (this.units(t) > max) max = this.units(t);
    return (this.units(c) - 1) / (max - 1);
  }

  /** `GetLeadingPlayer`: the seat with the most reinforcements coming, the first on a tie. */
  leadingPlayer(): Seat | null {
    let leader: Seat | null = null;
    let best = 0;
    for (const p of this.board.players()) {
      const income = this.board.income(p);
      if (income > best) {
        leader = p;
        best = income;
      }
    }
    return leader;
  }

  /** `GetPlayerDominance`: reinforcements coming and half the armies held. */
  playerDominance(p: Seat): number {
    return this.board.income(p) + roundHalfEven(this.board.totalUnits(p) * 0.5);
  }

  /** `GetLeadingPlayerDominanceRatio`: how far the most dominant seat leads the second. */
  leadingPlayerDominanceRatio(): number {
    let first: Seat | null = null;
    let second: Seat | null = null;
    let s1 = -1;
    let s2 = -1;
    for (const p of this.board.players()) {
      const d = this.playerDominance(p);
      if (d > s1) {
        second = first;
        s2 = s1;
        first = p;
        s1 = d;
      } else if (d > s2) {
        second = p;
        s2 = d;
      }
    }
    if (first === null || second === null) return 0;
    return clamp01(1 - s2 / s1);
  }

  /** `GetLeadingPlayerEnemyRatio(territory)`: a quarter for each neighbour the leader holds. */
  leadingPlayerEnemyRatio(c: TerritoryId): number {
    const leader = this.leadingPlayer();
    if (leader === this.me) return 0;
    let k = 0;
    for (const n of GD_LINKS[c]) if (this.owner(n) === leader) k++;
    return clamp01(k * 0.25);
  }

  /** `CalculateFocusLeadingPlayerSource(territory)`. */
  focusLeadingPlayerSource(c: TerritoryId): number {
    let r = 0;
    if (this.leadingPlayer() !== this.me) {
      const dom = this.leadingPlayerDominanceRatio();
      const er = this.leadingPlayerEnemyRatio(c);
      if (er > 0) r = (dom + dom + er) * 0.5;
    }
    return clamp01(r);
  }

  /** The leading-player term of `GetAttackTargetCountry`: the same for every target. */
  focusLeadingPlayerTarget(): number {
    return this.leadingPlayer() !== this.me ? this.leadingPlayerDominanceRatio() : 0;
  }

  /** Whether a person plays the seat (GD's `!Player.isAi`). */
  isHuman(seat: Seat): boolean {
    return this.humans[seat];
  }

  /** `GetContinentOwnership(region, player)`: the share of the continent the seat holds. */
  continentOwnership(continent: ContinentId, seat: Seat): number {
    const territories = CONTINENT_TERRITORIES[continent];
    return territories.filter((t) => this.owner(t) === seat).length / territories.length;
  }

  /** `ClassicAIHelper.GetCardsSuperiorGoal`: until the turn's first capture, the worth of taking
   *  `tgt` for the card it earns, more when the hand pictures a territory the bot owns (the +2 its
   *  next set would earn) and less when the hand is short of a set. */
  cardsSuperiorGoal(units: number, s: TerritoryId, tgt: TerritoryId): number {
    if (this.conqueredThisTurn > 0) return 0;
    const bonus = this.hand.some((card) => {
      const territory = territoryOf(card);
      return territory !== null && this.owner(territory) === this.me;
    });
    const weight = bonus ? 3 : this.hand.length + 1 >= 3 ? 4 : 1;
    const bs = this.battleSuccessUnits(s, tgt, units);
    return cutOff(scoreItems([1, weight, bs, 10]), Math.fround(0.1));
  }

  /** `ClassicAIHelper.GetContinentSuperiorGoal`: the worth of taking `tgt` towards its continent.
   *  GD passes the persona's success threshold (0 to 100) where the odds search wants a chance, and
   *  the search clamps it to 1: `ideal` is the fewest armies sure to capture. */
  continentSuperiorGoal(units: number, s: TerritoryId, tgt: TerritoryId): number {
    const territories = CONTINENT_TERRITORIES[CONTINENT_OF[tgt]];
    const enemy = territories.filter((t) => this.owner(t) !== this.me).length;
    const own = (territories.length - enemy + 1) / territories.length;
    const bs = this.battleSuccessUnits(s, tgt, units);
    const ideal = idealAttackUnits(this.units(tgt), this.attackSuccessThreshold);
    const m = clamp01((units - ideal) / 5);
    return cutOff(scoreItems([own, 4, bs, 2, 1 - m, 2]), Math.fround(0.55));
  }

  /** `GetCardsSuperiorGoalOfEnemies(units, source)`: the best of that over its enemy neighbours. */
  cardsSuperiorGoalOfEnemies(units: number, s: TerritoryId): number {
    let best = 0;
    for (const n of GD_LINKS[s]) {
      if (this.owner(n) === this.owner(s)) continue;
      const v = this.cardsSuperiorGoal(units, s, n);
      if (v > best) best = v;
    }
    return best;
  }

  /** `GetContinentSuperiorGoalOfEnemies(units, source)`. */
  continentSuperiorGoalOfEnemies(units: number, s: TerritoryId): number {
    let best = 0;
    for (const n of GD_LINKS[s]) {
      if (this.owner(n) === this.owner(s)) continue;
      const v = this.continentSuperiorGoal(units, s, n);
      if (v > best) best = v;
    }
    return best;
  }
}

/** `AIHelper.ScoreItems`: the mean of `[value, count, …]` pairs, weighted by count. */
export function scoreItems(items: readonly number[]): number {
  if (items.length % 2 !== 0) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < items.length / 2; i++) {
    sum += items[2 * i + 1] * items[2 * i];
    count += roundHalfEven(items[2 * i + 1]);
  }
  return sum / count;
}

/** `AIHelper.CutOff`: 0 below `cut`, then rising to 1. */
export function cutOff(value: number, cut: number): number {
  if (cut > value) return 0;
  return clamp01((value - cut) / (1 - cut));
}

import type { TerritoryId } from "../../map";
import { CONTINENT_OF, GD_LINKS } from "./board";
import type { Helper } from "./helper";
import { roundHalfEven } from "./odds";
import type { PersonaName, Weights } from "./personas";

// GD's `AIPersona` scoring, each a port of the method it names: a weighted sum of the helper's
// features, normalised by the method's `…MaxScore`. Defensive, Continental and Aggressive are pure
// data on the base methods; Stacker overrides deploying, attack sources, move-ins and fortifying
// with code of its own (`StackerAIPersona`). GD's objective terms (zombie, rapid, capital, secret
// mission) add nothing in a classic game, so they are left out of every score and maximum.

/** `AIPersona.NormalizeScore`: capped at the maximum, floored at 0, over the maximum. */
export function normalizeScore(score: number, max: number): number {
  const s = score > max ? max : score;
  return (0 >= s ? 0 : s) / max;
}

/** What the deploy scores read beyond the board. */
export interface DeployContext {
  /** The armies still to place: GD's `Player.Units`. */
  toPlace: number;
  /** Territories placed on this turn: GD's `AIDeploy._lastCountries`. */
  placedOn: readonly TerritoryId[];
  /** A uniform draw in [0, 1): GD's `UnityEngine.Random`. */
  random: () => number;
}

export interface Scorer {
  readonly persona: PersonaName;
  deployCountry(t: TerritoryId, units: number): number;
  deployUnitsAmount(units: number): number;
  attackSource(t: TerritoryId): number;
  attackTarget(source: TerritoryId, t: TerritoryId): number;
  attackMoveUnitsAmount(min: number, max: number, source: TerritoryId, target: TerritoryId, amount: number): number;
  fortifySource(t: TerritoryId): number;
  fortifyTarget(source: TerritoryId, t: TerritoryId): number;
  fortifyMoveUnitsAmount(source: TerritoryId, target: TerritoryId, amount: number): number;
}

/** The base `AIPersona`'s scores with one persona's weights. */
export class BaseScorer implements Scorer {
  constructor(
    readonly persona: PersonaName,
    protected readonly w: Weights,
    protected readonly h: Helper,
    protected readonly deploy: DeployContext,
  ) {}

  protected units(t: TerritoryId): number {
    return this.h.board.units(t);
  }

  protected countEnemies(t: TerritoryId): number {
    return this.h.board.countEnemies(t);
  }

  /** `GetDeployCountry`: interior territories score 0; one already placed on this turn is
   *  discounted, and so is one whose every enemy neighbour borders a territory placed on. */
  deployCountry(c: TerritoryId, units: number): number {
    const { w, h } = this;
    const board = h.board;
    if (this.countEnemies(c) === 0) return 0;
    const attack = this.units(c) + units - 1;
    const enemy = h.enemyStrength(c);
    const elim = h.chanceEliminatePlayerFrom(c);
    const cont = h.continentOwnership(CONTINENT_OF[c], h.me);
    const bw = h.borderWeakness(c);
    const cards = h.cardsSuperiorGoalOfEnemies(attack, c);
    const superiorContinent = h.continentSuperiorGoalOfEnemies(attack, c);
    const lead = h.focusLeadingPlayerSource(c);
    let s = cards * w.cardBonus;
    s += superiorContinent * w.continentBonus;
    s += cont * w.deployContinentOwnership;
    s += bw * w.deployBorderWeakness;
    s += enemy * w.deployEnemyStrength;
    s += elim * w.eliminatePlayer;
    s += lead * w.focusLeadingPlayer;
    const placedOn = this.deploy.placedOn;
    if (placedOn.includes(c)) {
      s /= 1.5;
    } else {
      // GD counts an enemy once for each placed-on territory it borders, so the count can
      // exceed the enemies and miss the discount.
      let k = 0;
      for (const d of placedOn) {
        for (const n of GD_LINKS[d]) if (board.owner(n) !== board.owner(c) && GD_LINKS[c].includes(n)) k++;
      }
      if (k === this.countEnemies(c)) s /= Math.fround(1.85);
    }
    s = 0 > s ? 0 : s;
    const max =
      w.cardBonus + w.continentBonus + w.deployContinentOwnership + w.deployBorderWeakness + w.deployEnemyStrength + w.eliminatePlayer + w.focusLeadingPlayer;
    return normalizeScore(s, max);
  }

  /** `GetDeployUnitsAmount`: each candidate amount drawn its own ideal, a half to two thirds of
   *  the armies to place (all of them at 3 or fewer), and scored by how near it comes. */
  deployUnitsAmount(amount: number): number {
    const toPlace = this.deploy.toPlace;
    const r = Math.fround(1.5 + this.deploy.random() * 0.5);
    let ideal = Math.ceil(Math.fround(toPlace / r));
    if (toPlace <= 3) ideal = toPlace;
    const d = clampUnit(Math.abs(amount - ideal) / ideal);
    return normalizeScore(clampUnit(1 - d), 1);
  }

  /** `GetAttackSourceCountry`: below the success threshold (the desperate one until the turn's
   *  first capture) a source scores 0. */
  attackSource(c: TerritoryId): number {
    const { w, h } = this;
    const co = h.continentOwnership(CONTINENT_OF[c], h.me);
    const loss = h.chanceContinentLoss(c);
    const elim = h.chanceEliminatePlayerFrom(c);
    const bsMax = h.battleSuccessMax(c);
    const supC = h.cardsSuperiorGoalOfEnemies(this.units(c) - 1, c);
    const supK = h.continentSuperiorGoalOfEnemies(this.units(c) - 1, c);
    const es = h.enemyStrength(c);
    const threshold = h.desperate() ? w.attackSuccessDesperateThreshold : w.attackSuccessThreshold;
    const focus = h.focusLeadingPlayerSource(c);
    const turns = h.attackTurnsLimit(20, 150);
    if (clampUnit(threshold / 100) > bsMax) return 0;
    let s = supC * w.cardBonus;
    s += supK * w.continentBonus;
    s += co * w.attackFromContinentOwnership;
    s += (100 - w.risky) * bsMax;
    s += elim * w.eliminatePlayer;
    s += focus * w.focusLeadingPlayer;
    s -= loss * w.attackContinentLoss;
    s -= es * w.attackEnemyStrength;
    s -= turns;
    s = 0 > s ? 0 : s;
    return normalizeScore(s, this.attackSourceMax());
  }

  protected attackSourceMax(): number {
    const w = this.w;
    return w.cardBonus + w.continentBonus + w.attackFromContinentOwnership + (100 - w.risky) + w.eliminatePlayer + w.focusLeadingPlayer;
  }

  /** `GetAttackTargetCountry`. */
  attackTarget(source: TerritoryId, c: TerritoryId): number {
    const { w, h } = this;
    const co = h.continentOwnership(CONTINENT_OF[c], h.me);
    const elim = h.chanceEliminatePlayerTo(source, h.board.owner(c));
    const bs = h.battleSuccess(source, c);
    const steal = h.stealContinentBonus(source, c);
    const threshold = h.desperate() ? w.attackSuccessDesperateThreshold : w.attackSuccessThreshold;
    const es = h.enemyStrengthOf(source, c);
    const lead = h.focusLeadingPlayerTarget();
    if (clampUnit(threshold / 100) > bs) return 0;
    let s = co * w.attackToContinentOwnership;
    s += elim * w.eliminatePlayer;
    s += (100 - w.risky) * bs;
    s += steal * w.continentBonus;
    s += lead * w.focusLeadingPlayer;
    s -= es * w.attackEnemyStrength;
    s = 0 >= s ? 0 : s;
    const max = w.attackToContinentOwnership + w.eliminatePlayer + (100 - w.risky) + w.continentBonus + w.focusLeadingPlayer;
    return normalizeScore(s, max);
  }

  /** `GetAttackMoveUnitsAmount`: the move-in split by the threat at each end. */
  attackMoveUnitsAmount(min: number, max: number, source: TerritoryId, target: TerritoryId, amount: number): number {
    const h = this.h;
    const nS = this.countEnemies(source);
    const nT = this.countEnemies(target);
    let bwS = h.borderWeakness(source);
    const bwT = h.borderWeakness(target);
    const esS = h.enemyStrength(source);
    const esT = h.enemyStrength(target);
    if (Number.isNaN(bwS)) bwS = 0;
    const wT = bwT * 5 + 5 * nT + esT * 10;
    const total = 5 * nS + bwS * 5 + esS * 10 + wT;
    const ideal = (wT / total) * (max - min) + min;
    const diff = amount - roundHalfEven(ideal);
    let f = 1 - Math.abs(diff) / (max - min);
    f = clampUnit(f);
    if (Number.isNaN(f)) f = 1;
    return normalizeScore(f, 1);
  }

  /** `GetFortifySourceCountry`. */
  fortifySource(c: TerritoryId): number {
    const { w, h } = this;
    const power = h.countryPower(c);
    const noEnemyPower = this.countEnemies(c) === 0 ? power * 0.5 + 0.5 : 0;
    const bw = h.borderWeakness(c);
    const es = h.enemyStrength(c);
    const raw = power * w.fortifyUnitCount + noEnemyPower * w.fortifyNoEnemiesPower - bw * w.fortifyBorderWeakness - es * w.fortifyEnemyStrength;
    return normalizeScore(raw, w.fortifyUnitCount + w.fortifyNoEnemiesPower);
  }

  /** One end's score in `GetFortifyTargetCountry`. */
  private fortifyEnd(t: TerritoryId, attackUnits: number): number {
    const { w, h } = this;
    let enemies = 0;
    let humans = 0;
    for (const n of GD_LINKS[t]) {
      if (h.board.owner(n) === h.board.owner(t)) continue;
      enemies += 1;
      if (h.isHuman(h.board.owner(n))) humans += 1;
    }
    const cont = h.continentOwnership(CONTINENT_OF[t], h.me);
    const bw = h.borderWeakness(t);
    let elim = h.chanceEliminatePlayerFrom(t);
    const es = h.enemyStrength(t);
    if (new Set(h.board.enemies(t).map((n) => h.board.owner(n))).size > 1) elim = 0;
    const bs = h.battleSuccessMin(t, attackUnits);
    const humanRatio = humans > 0 && enemies > 0 ? humans / enemies : 0;
    return (
      cont * w.fortifyContinentOwnership +
      bw * w.fortifyBorderWeakness +
      elim * w.eliminatePlayer +
      (100 - w.risky) * bs +
      es * w.fortifyEnemyStrength -
      humanRatio * w.fortifyHumanRatio
    );
  }

  /** `GetFortifyTargetCountry`: the target's score, or 0 unless it beats the source's when the
   *  source faces enemies itself. */
  fortifyTarget(source: TerritoryId, t: TerritoryId): number {
    const w = this.w;
    const score = this.fortifyEnd(t, this.units(t) + this.units(source) - 2);
    const sourceScore = this.countEnemies(source) > 0 ? this.fortifyEnd(source, this.units(source) - 1) : 0;
    const max = w.fortifyContinentOwnership + w.fortifyBorderWeakness + w.eliminatePlayer + (100 - w.risky) + w.fortifyEnemyStrength;
    return sourceScore >= score ? 0 : normalizeScore(score, max);
  }

  /** `GetFortifyMoveUnitsAmount`: the armies split in proportion to the threat at each end. */
  fortifyMoveUnitsAmount(source: TerritoryId, target: TerritoryId, amount: number): number {
    const h = this.h;
    const maxMove = this.units(source) - 1;
    const sES = h.enemyStrength(source);
    const tES = h.enemyStrength(target);
    const sBW = h.borderWeakness(source);
    const tBW = h.borderWeakness(target);
    const tThreat = tBW + tES;
    const total = sBW + sES + tThreat;
    const ideal = (tThreat / total) * maxMove;
    const diff = Math.abs(ideal - amount);
    const raw = 1 - diff / (this.units(source) - 1);
    return normalizeScore(raw, 1);
  }
}

/** GD's compare-and-branch clamp to [0, 1]. */
function clampUnit(x: number): number {
  if (0 > x) return 0;
  if (x > 1) return 1;
  return x;
}

/** `StackerAIPersona`: it stacks every army it places, moves in, or fortifies with onto one
 *  territory, attacks only from near-certain sources, and keeps the base persona's attack target
 *  scoring. Its weights are read only for its success thresholds and the base target score. */
export class StackerScorer extends BaseScorer {
  constructor(w: Weights, h: Helper, deploy: DeployContext) {
    super("stacker", w, h, deploy);
  }

  override deployCountry(c: TerritoryId): number {
    const h = this.h;
    const interior = this.countEnemies(c) === 0 ? 1 : 0;
    const s = h.countryPower(c) * 3 + h.enemyStrength(c) + h.borderWeakness(c) - interior * 3;
    return normalizeScore(s, 3 + 1 + 1);
  }

  override deployUnitsAmount(units: number): number {
    return normalizeScore(units === this.deploy.toPlace ? 1 : 0, 1);
  }

  override attackSource(c: TerritoryId): number {
    const { w, h } = this;
    const power = h.countryPower(c);
    const smax = h.battleSuccessMax(c);
    const threshold = h.desperate() ? w.attackSuccessDesperateThreshold : w.attackSuccessThreshold;
    const limit = h.attackTurnsLimit(Math.fround(0.45), 3);
    if (clampUnit(threshold / 100) > smax) return 0;
    return normalizeScore(power + smax - limit, 1 + 1);
  }

  override attackMoveUnitsAmount(_min: number, max: number, _source: TerritoryId, _target: TerritoryId, amount: number): number {
    return normalizeScore(amount === Math.trunc(max) ? 1 : 0, 1);
  }

  override fortifySource(c: TerritoryId): number {
    const h = this.h;
    let maxP = 0;
    let best: TerritoryId | null = null;
    for (const t of h.board.connected(c)) {
      const p = h.countryPower(t);
      if (p > maxP) {
        maxP = p;
        best = t;
      }
    }
    const interiorP = best !== null && this.countEnemies(best) === 0 ? maxP : 0;
    const s = maxP * 5 + h.countryPower(c) - interiorP * 5;
    return normalizeScore(s, 5 + 1);
  }

  override fortifyTarget(source: TerritoryId, t: TerritoryId): number {
    const h = this.h;
    if (this.countEnemies(t) === 0) return 0;
    const target = h.countryPower(t) * Math.fround(1.8) + h.enemyStrength(t) + h.borderWeakness(t);
    if (this.countEnemies(source) > 0) {
      const from = h.countryPower(source) * Math.fround(1.8) + h.enemyStrength(source) + h.borderWeakness(source);
      if (from >= target) return 0;
    }
    return normalizeScore(target, Math.fround(1.8) + 1 + 1);
  }

  override fortifyMoveUnitsAmount(source: TerritoryId, _target: TerritoryId, amount: number): number {
    return normalizeScore(amount === this.units(source) - 1 ? 1 : 0, 1);
  }
}

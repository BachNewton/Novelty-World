//! `bots/gd/helper.ts`: GD's `AIHelper` and `ClassicAIHelper`, the features the personas weigh,
//! each a port of the method it names. They read the board as the bot's seat sees it, and the
//! turn so far.

use super::board::{continent_of, gd_map, links, Board, MAX_CONTINENT_BONUS};
use super::odds::{ideal_attack_units, ideal_threshold, round_half_even, win_chance};
use crate::cards::{territory_of, Card};
use crate::engine::{Seat, Territory};
use crate::jsmath::fround;
use crate::map::CONTINENTS;
use std::cmp::Ordering;

/// GD's `clamp01`: NaN passes through, as GD's compare-and-branch lets it.
pub fn clamp01(x: f64) -> f64 {
    x.clamp(0.0, 1.0)
}

/// `!(a > b)`, as GD's comparisons branch: true when either is NaN.
fn not_above(a: f64, b: f64) -> bool {
    a.partial_cmp(&b) != Some(Ordering::Greater)
}

/// The Expert multiplier of `GetAttackTurnsLimit`.
const EXPERT_ATTACK_TURNS: f64 = 0.75;

pub struct Helper<'a> {
    pub board: Board<'a>,
    /// The bot's seat: GD's `AIHelper._player`.
    pub me: Seat,
    pub hand: &'a [Card],
    pub humans: &'a [bool],
    /// Territories the bot has captured this turn (GD's `countriesConquered`).
    pub conquered_this_turn: usize,
    /// Attacks the bot has made this turn (`AIAttack._attackCount`).
    pub attacks_this_turn: usize,
    /// The persona's `attackSuccessThreshold` weight, 0 to 100.
    pub attack_success_threshold: f64,
}

impl Helper<'_> {
    fn units(&self, t: Territory) -> i64 {
        self.board.units(t)
    }

    fn owner(&self, t: Territory) -> Seat {
        self.board.owner(t)
    }

    /// The neighbours of `t` its owner doesn't hold, in link order.
    fn enemy_links(&self, t: Territory) -> impl Iterator<Item = Territory> + '_ {
        links(t)
            .iter()
            .copied()
            .filter(move |&n| self.owner(n) != self.owner(t))
    }

    /// `GetDesperateMode`: nothing captured yet this turn.
    pub fn desperate(&self) -> bool {
        self.conquered_this_turn == 0
    }

    /// `GetAttackTurnsLimit(multiplier, max)` at Expert.
    pub fn attack_turns_limit(&self, multiplier: f64, max: f64) -> f64 {
        if self.conquered_this_turn == 0 {
            return 0.0;
        }
        let r = self.attacks_this_turn as f64 * EXPERT_ATTACK_TURNS * multiplier;
        if 0.0 > r {
            0.0
        } else if r > max {
            max
        } else {
            r
        }
    }

    /// `GetBattleSuccess(attacker, defender, attackUnits)`.
    pub fn battle_success_units(&self, a: Territory, d: Territory, attack_units: i64) -> f64 {
        if self.units(a) <= 1 || self.owner(a) == self.owner(d) {
            return 0.0;
        }
        win_chance(attack_units, self.units(d))
    }

    /// `GetBattleSuccess(attacker, defender)`: all but one army attacking.
    pub fn battle_success(&self, a: Territory, d: Territory) -> f64 {
        self.battle_success_units(a, d, self.units(a) - 1)
    }

    /// `GetBattleSuccess(attacker, defendUnits)`: every army of the attacker against an imagined
    /// stack.
    pub fn battle_success_against(&self, a: Territory, defend_units: i64) -> f64 {
        if self.units(a) <= 1 {
            return 0.0;
        }
        win_chance(self.units(a), defend_units)
    }

    /// `GetBattleSuccessMin(territory, unitsAttack)`.
    pub fn battle_success_min(&self, s: Territory, units_attack: i64) -> f64 {
        let mut min = 1.0;
        for n in self.enemy_links(s) {
            let v = self.battle_success_units(s, n, units_attack);
            if not_above(v, min) {
                min = v;
            }
        }
        min
    }

    /// `GetBattleSuccessMax(territory)`.
    pub fn battle_success_max(&self, s: Territory) -> f64 {
        let mut max = 0.0;
        for n in self.enemy_links(s) {
            let v = self.battle_success(s, n);
            if not_above(max, v) {
                max = v;
            }
        }
        max
    }

    /// `GetStealContinentBonus(source, target)`. GD divides the continent's bonus by the largest
    /// in whole numbers, so only Asia earns that term.
    pub fn steal_continent_bonus(&self, s: Territory, t: Territory) -> f64 {
        if !self.board.owner_owns_continent(t) {
            return 0.0;
        }
        let mut x = self.battle_success(s, t) * 0.4;
        let r = (CONTINENTS[continent_of(t)].bonus / MAX_CONTINENT_BONUS) as f64 * 0.4;
        x += 0.2;
        x += r;
        clamp01(x)
    }

    /// `GetChanceContinentLoss(territory)`.
    pub fn chance_continent_loss(&self, src: Territory) -> f64 {
        let own = self.continent_ownership(continent_of(src), self.me);
        let enemy: i64 = links(src)
            .iter()
            .filter(|&&n| self.owner(n) != self.me)
            .map(|&n| self.units(n))
            .sum();
        if enemy <= 0 {
            return 0.0;
        }
        (1.0 - self.battle_success_against(src, enemy)) * own
    }

    /// `GetBorderWeakness(territory)`.
    pub fn border_weakness(&self, c: Territory) -> f64 {
        let continent = continent_of(c);
        if self.board.continent_owner(continent) != Some(self.owner(c)) {
            return 0.0;
        }
        let ideal = ideal_attack_units(self.units(c), ideal_threshold());
        let sum: i64 = links(c)
            .iter()
            .filter(|&&n| self.owner(n) != self.me && continent_of(n) != continent)
            .map(|&n| self.units(n))
            .sum();
        clamp01((sum as f64 / ideal as f64) * 0.5)
    }

    /// `GetChanceEliminatePlayerTo(source, enemy)`.
    pub fn chance_eliminate_player_to(&self, src: Territory, enemy: Seat) -> f64 {
        let mine = self.owner(src);
        let my_c = self.board.countries_owned(mine);
        let my_u = self.board.total_units(mine);
        let e_c = self.board.countries_owned(enemy);
        let e_u = self.board.total_units(enemy);
        if e_c >= my_c || e_u >= my_u {
            return 0.0;
        }
        let a = clamp01((my_c - e_c) as f64 / my_c as f64);
        let b = clamp01((my_u - e_u) as f64 / my_u as f64);
        let c = clamp01((self.units(src) - e_u) as f64 / self.units(src) as f64);
        let d = clamp01(self.board.cards(enemy) as f64 / 5.0);
        let mut r = b * 1.2;
        r += a * 0.8;
        r += c * 1.4;
        r += d * 0.6;
        clamp01(r * 0.25)
    }

    /// `GetChanceEliminatePlayerFrom(source)`.
    pub fn chance_eliminate_player_from(&self, src: Territory) -> f64 {
        let mut m = 0.0;
        for n in self.enemy_links(src) {
            let v = self.chance_eliminate_player_to(src, self.owner(n));
            if not_above(m, v) {
                m = v;
            }
        }
        m
    }

    /// `GetEnemyStrength(source, target)`.
    pub fn enemy_strength_of(&self, src: Territory, tgt: Territory) -> f64 {
        let ideal = ideal_attack_units(self.units(src), ideal_threshold());
        let enemy = self.owner(tgt);
        let mut s = self.units(tgt).max(3) as f64;
        s += round_half_even(fround(self.board.income(enemy) as f64 * fround(0.4)));
        match self.board.cards(enemy) {
            3 => s += 2.0,
            4 => s += 4.0,
            5 => s += 6.0,
            _ => {}
        }
        if self.board.next_player() == enemy {
            s = round_half_even(s * 1.5);
        }
        clamp01(s / ideal as f64 / 3.0)
    }

    /// `GetEnemyStrength(source)`.
    pub fn enemy_strength(&self, src: Territory) -> f64 {
        let mut m = 0.0;
        for n in self.enemy_links(src) {
            let v = self.enemy_strength_of(src, n);
            if not_above(m, v) {
                m = v;
            }
        }
        m
    }

    /// `GetCountryPower(territory)`: its armies against the bot's largest stack (GD divides by
    /// zero when every stack is 1, and that is kept).
    pub fn country_power(&self, c: Territory) -> f64 {
        let max = gd_map()
            .order
            .iter()
            .filter(|&&t| self.owner(t) == self.me)
            .map(|&t| self.units(t))
            .fold(0, i64::max);
        (self.units(c) - 1) as f64 / (max - 1) as f64
    }

    /// `GetLeadingPlayer`: the seat with the most reinforcements coming, the first on a tie.
    pub fn leading_player(&self) -> Option<Seat> {
        let mut leader = None;
        let mut best = 0;
        for &p in self.board.players() {
            let income = self.board.income(p);
            if income > best {
                leader = Some(p);
                best = income;
            }
        }
        leader
    }

    /// `GetPlayerDominance`.
    pub fn player_dominance(&self, p: Seat) -> f64 {
        self.board.income(p) as f64 + round_half_even(self.board.total_units(p) as f64 * 0.5)
    }

    /// `GetLeadingPlayerDominanceRatio`.
    pub fn leading_player_dominance_ratio(&self) -> f64 {
        let mut first = None;
        let mut second = None;
        let mut s1 = -1.0;
        let mut s2 = -1.0;
        for &p in self.board.players() {
            let d = self.player_dominance(p);
            if d > s1 {
                second = first;
                s2 = s1;
                first = Some(p);
                s1 = d;
            } else if d > s2 {
                second = Some(p);
                s2 = d;
            }
        }
        if first.is_none() || second.is_none() {
            return 0.0;
        }
        clamp01(1.0 - s2 / s1)
    }

    /// `GetLeadingPlayerEnemyRatio(territory)`.
    pub fn leading_player_enemy_ratio(&self, c: Territory) -> f64 {
        let leader = self.leading_player();
        if leader == Some(self.me) {
            return 0.0;
        }
        let k = links(c)
            .iter()
            .filter(|&&n| Some(self.owner(n)) == leader)
            .count();
        clamp01(k as f64 * 0.25)
    }

    /// `CalculateFocusLeadingPlayerSource(territory)`.
    pub fn focus_leading_player_source(&self, c: Territory) -> f64 {
        let mut r = 0.0;
        if self.leading_player() != Some(self.me) {
            let dom = self.leading_player_dominance_ratio();
            let er = self.leading_player_enemy_ratio(c);
            if er > 0.0 {
                r = (dom + dom + er) * 0.5;
            }
        }
        clamp01(r)
    }

    /// The leading-player term of `GetAttackTargetCountry`.
    pub fn focus_leading_player_target(&self) -> f64 {
        if self.leading_player() != Some(self.me) {
            self.leading_player_dominance_ratio()
        } else {
            0.0
        }
    }

    /// Whether a person plays the seat (GD's `!Player.isAi`).
    pub fn is_human(&self, seat: Seat) -> bool {
        self.humans[seat as usize]
    }

    /// `GetContinentOwnership(region, player)`.
    pub fn continent_ownership(&self, continent: usize, seat: Seat) -> f64 {
        let territories = &gd_map().continent_territories[continent];
        let held = territories
            .iter()
            .filter(|&&t| self.owner(t) == seat)
            .count();
        held as f64 / territories.len() as f64
    }

    /// `ClassicAIHelper.GetCardsSuperiorGoal`.
    pub fn cards_superior_goal(&self, units: i64, s: Territory, tgt: Territory) -> f64 {
        if self.conquered_this_turn > 0 {
            return 0.0;
        }
        let bonus = self
            .hand
            .iter()
            .any(|&card| territory_of(card).is_some_and(|t| self.owner(t as Territory) == self.me));
        let weight = if bonus {
            3.0
        } else if self.hand.len() + 1 >= 3 {
            4.0
        } else {
            1.0
        };
        let bs = self.battle_success_units(s, tgt, units);
        cut_off(score_items(&[1.0, weight, bs, 10.0]), fround(0.1))
    }

    /// `ClassicAIHelper.GetContinentSuperiorGoal`. The persona's success threshold (0 to 100) goes
    /// where the odds search wants a chance, as GD passes it (PORT.md's open reading 5).
    pub fn continent_superior_goal(&self, units: i64, s: Territory, tgt: Territory) -> f64 {
        let territories = &gd_map().continent_territories[continent_of(tgt)];
        let enemy = territories
            .iter()
            .filter(|&&t| self.owner(t) != self.me)
            .count();
        let size = territories.len() as f64;
        let own = (size - enemy as f64 + 1.0) / size;
        let bs = self.battle_success_units(s, tgt, units);
        let ideal = ideal_attack_units(self.units(tgt), self.attack_success_threshold);
        let m = clamp01((units - ideal) as f64 / 5.0);
        cut_off(
            score_items(&[own, 4.0, bs, 2.0, 1.0 - m, 2.0]),
            fround(0.55),
        )
    }

    /// `GetCardsSuperiorGoalOfEnemies(units, source)`.
    pub fn cards_superior_goal_of_enemies(&self, units: i64, s: Territory) -> f64 {
        let mut best = 0.0;
        for n in self.enemy_links(s) {
            let v = self.cards_superior_goal(units, s, n);
            if v > best {
                best = v;
            }
        }
        best
    }

    /// `GetContinentSuperiorGoalOfEnemies(units, source)`.
    pub fn continent_superior_goal_of_enemies(&self, units: i64, s: Territory) -> f64 {
        let mut best = 0.0;
        for n in self.enemy_links(s) {
            let v = self.continent_superior_goal(units, s, n);
            if v > best {
                best = v;
            }
        }
        best
    }
}

/// `AIHelper.ScoreItems`: the mean of `[value, count, …]` pairs, weighted by count.
pub fn score_items(items: &[f64]) -> f64 {
    let mut sum = 0.0;
    let mut count = 0.0;
    for &[value, weight] in items.as_chunks::<2>().0 {
        sum += weight * value;
        count += round_half_even(weight);
    }
    sum / count
}

/// `AIHelper.CutOff`: 0 below `cut`, then rising to 1.
pub fn cut_off(value: f64, cut: f64) -> f64 {
    if cut > value {
        return 0.0;
    }
    clamp01((value - cut) / (1.0 - cut))
}

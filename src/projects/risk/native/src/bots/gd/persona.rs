//! `bots/gd/persona.ts`: GD's `AIPersona` scoring, each a port of the method it names: a weighted
//! sum of the helper's features, normalised by the method's `…MaxScore`. Defensive, Continental
//! and Aggressive are pure data on the base methods; Stacker overrides deploying, attack sources,
//! move-ins and fortifying with code of its own (`StackerAIPersona`).

use super::board::{continent_of, links};
use super::helper::Helper;
use super::odds::round_half_even;
use super::personas::{Persona, Weights};
use crate::engine::Territory;
use crate::jsmath::fround;
use crate::rng::Rng;

/// `AIPersona.NormalizeScore`: capped at the maximum, floored at 0, over the maximum.
pub fn normalize_score(score: f64, max: f64) -> f64 {
    let s = if score > max { max } else { score };
    (if 0.0 >= s { 0.0 } else { s }) / max
}

/// GD's compare-and-branch clamp to [0, 1].
fn clamp_unit(x: f64) -> f64 {
    x.clamp(0.0, 1.0)
}

pub struct Scorer<'a> {
    pub persona: Persona,
    pub w: &'static Weights,
    pub h: Helper<'a>,
    /// The armies still to place: GD's `Player.Units`.
    pub to_place: i64,
    /// Territories placed on this turn: GD's `AIDeploy._lastCountries`.
    pub placed_on: &'a [Territory],
}

impl Scorer<'_> {
    fn stacker(&self) -> bool {
        self.persona == Persona::Stacker
    }

    fn units(&self, t: Territory) -> i64 {
        self.h.board.units(t)
    }

    fn count_enemies(&self, t: Territory) -> usize {
        self.h.board.count_enemies(t)
    }

    /// `GetDeployCountry`: interior territories score 0; one already placed on this turn is
    /// discounted, and so is one whose every enemy neighbour borders a territory placed on.
    pub fn deploy_country(&self, c: Territory, units: i64) -> f64 {
        let (w, h) = (self.w, &self.h);
        if self.stacker() {
            let interior = if self.count_enemies(c) == 0 { 1.0 } else { 0.0 };
            let s = h.country_power(c) * 3.0 + h.enemy_strength(c) + h.border_weakness(c)
                - interior * 3.0;
            return normalize_score(s, 3.0 + 1.0 + 1.0);
        }
        let board = &h.board;
        if self.count_enemies(c) == 0 {
            return 0.0;
        }
        let attack = self.units(c) + units - 1;
        let enemy = h.enemy_strength(c);
        let elim = h.chance_eliminate_player_from(c);
        let cont = h.continent_ownership(continent_of(c), h.me);
        let bw = h.border_weakness(c);
        let cards = h.cards_superior_goal_of_enemies(attack, c);
        let superior_continent = h.continent_superior_goal_of_enemies(attack, c);
        let lead = h.focus_leading_player_source(c);
        let mut s = cards * w.card_bonus;
        s += superior_continent * w.continent_bonus;
        s += cont * w.deploy_continent_ownership;
        s += bw * w.deploy_border_weakness;
        s += enemy * w.deploy_enemy_strength;
        s += elim * w.eliminate_player;
        s += lead * w.focus_leading_player;
        if self.placed_on.contains(&c) {
            s /= 1.5;
        } else {
            // GD counts an enemy once for each placed-on territory it borders, so the count can
            // exceed the enemies and miss the discount.
            let mut k = 0;
            for &d in self.placed_on {
                for &n in links(d) {
                    if board.owner(n) != board.owner(c) && links(c).contains(&n) {
                        k += 1;
                    }
                }
            }
            if k == self.count_enemies(c) {
                s /= fround(1.85);
            }
        }
        s = if 0.0 > s { 0.0 } else { s };
        let max = w.card_bonus
            + w.continent_bonus
            + w.deploy_continent_ownership
            + w.deploy_border_weakness
            + w.deploy_enemy_strength
            + w.eliminate_player
            + w.focus_leading_player;
        normalize_score(s, max)
    }

    /// `GetDeployUnitsAmount`: each candidate amount drawn its own ideal, a half to two thirds of
    /// the armies to place (all of them at 3 or fewer), and scored by how near it comes. Stacker
    /// places everything at once.
    pub fn deploy_units_amount(&self, amount: i64, rng: &mut Rng) -> f64 {
        let to_place = self.to_place;
        if self.stacker() {
            return normalize_score(if amount == to_place { 1.0 } else { 0.0 }, 1.0);
        }
        let r = fround(1.5 + rng.next() * 0.5);
        let mut ideal = fround(to_place as f64 / r).ceil();
        if to_place <= 3 {
            ideal = to_place as f64;
        }
        let d = clamp_unit((amount as f64 - ideal).abs() / ideal);
        normalize_score(clamp_unit(1.0 - d), 1.0)
    }

    fn success_threshold(&self) -> f64 {
        let w = self.w;
        let threshold = if self.h.desperate() {
            w.attack_success_desperate_threshold
        } else {
            w.attack_success_threshold
        };
        clamp_unit(threshold / 100.0)
    }

    /// `GetAttackSourceCountry`: below the success threshold (the desperate one until the turn's
    /// first capture) a source scores 0.
    pub fn attack_source(&self, c: Territory) -> f64 {
        let (w, h) = (self.w, &self.h);
        if self.stacker() {
            let power = h.country_power(c);
            let smax = h.battle_success_max(c);
            let limit = h.attack_turns_limit(fround(0.45), 3.0);
            if self.success_threshold() > smax {
                return 0.0;
            }
            return normalize_score(power + smax - limit, 1.0 + 1.0);
        }
        let co = h.continent_ownership(continent_of(c), h.me);
        let loss = h.chance_continent_loss(c);
        let elim = h.chance_eliminate_player_from(c);
        let bs_max = h.battle_success_max(c);
        let sup_c = h.cards_superior_goal_of_enemies(self.units(c) - 1, c);
        let sup_k = h.continent_superior_goal_of_enemies(self.units(c) - 1, c);
        let es = h.enemy_strength(c);
        let focus = h.focus_leading_player_source(c);
        let turns = h.attack_turns_limit(20.0, 150.0);
        if self.success_threshold() > bs_max {
            return 0.0;
        }
        let mut s = sup_c * w.card_bonus;
        s += sup_k * w.continent_bonus;
        s += co * w.attack_from_continent_ownership;
        s += (100.0 - w.risky) * bs_max;
        s += elim * w.eliminate_player;
        s += focus * w.focus_leading_player;
        s -= loss * w.attack_continent_loss;
        s -= es * w.attack_enemy_strength;
        s -= turns;
        s = if 0.0 > s { 0.0 } else { s };
        let max = w.card_bonus
            + w.continent_bonus
            + w.attack_from_continent_ownership
            + (100.0 - w.risky)
            + w.eliminate_player
            + w.focus_leading_player;
        normalize_score(s, max)
    }

    /// `GetAttackTargetCountry`, Stacker's too.
    pub fn attack_target(&self, source: Territory, c: Territory) -> f64 {
        let (w, h) = (self.w, &self.h);
        let co = h.continent_ownership(continent_of(c), h.me);
        let elim = h.chance_eliminate_player_to(source, h.board.owner(c));
        let bs = h.battle_success(source, c);
        let steal = h.steal_continent_bonus(source, c);
        let es = h.enemy_strength_of(source, c);
        let lead = h.focus_leading_player_target();
        if self.success_threshold() > bs {
            return 0.0;
        }
        let mut s = co * w.attack_to_continent_ownership;
        s += elim * w.eliminate_player;
        s += (100.0 - w.risky) * bs;
        s += steal * w.continent_bonus;
        s += lead * w.focus_leading_player;
        s -= es * w.attack_enemy_strength;
        s = if 0.0 >= s { 0.0 } else { s };
        let max = w.attack_to_continent_ownership
            + w.eliminate_player
            + (100.0 - w.risky)
            + w.continent_bonus
            + w.focus_leading_player;
        normalize_score(s, max)
    }

    /// `GetAttackMoveUnitsAmount`: the move-in split by the threat at each end. Stacker moves
    /// everything.
    pub fn attack_move_units_amount(
        &self,
        min: i64,
        max: i64,
        source: Territory,
        target: Territory,
        amount: i64,
    ) -> f64 {
        if self.stacker() {
            return normalize_score(if amount == max { 1.0 } else { 0.0 }, 1.0);
        }
        let h = &self.h;
        let n_s = self.count_enemies(source) as f64;
        let n_t = self.count_enemies(target) as f64;
        let mut bw_s = h.border_weakness(source);
        let bw_t = h.border_weakness(target);
        let es_s = h.enemy_strength(source);
        let es_t = h.enemy_strength(target);
        if bw_s.is_nan() {
            bw_s = 0.0;
        }
        let w_t = bw_t * 5.0 + 5.0 * n_t + es_t * 10.0;
        let total = 5.0 * n_s + bw_s * 5.0 + es_s * 10.0 + w_t;
        let ideal = (w_t / total) * (max - min) as f64 + min as f64;
        let diff = amount as f64 - round_half_even(ideal);
        let mut f = 1.0 - diff.abs() / (max - min) as f64;
        f = clamp_unit(f);
        if f.is_nan() {
            f = 1.0;
        }
        normalize_score(f, 1.0)
    }

    /// `GetFortifySourceCountry`.
    pub fn fortify_source(&self, c: Territory) -> f64 {
        let (w, h) = (self.w, &self.h);
        if self.stacker() {
            let mut max_p = 0.0;
            let mut best = None;
            for t in h.board.connected(c) {
                let p = h.country_power(t);
                if p > max_p {
                    max_p = p;
                    best = Some(t);
                }
            }
            let interior_p = match best {
                Some(b) if self.count_enemies(b) == 0 => max_p,
                _ => 0.0,
            };
            let s = max_p * 5.0 + h.country_power(c) - interior_p * 5.0;
            return normalize_score(s, 5.0 + 1.0);
        }
        let power = h.country_power(c);
        let no_enemy_power = if self.count_enemies(c) == 0 {
            power * 0.5 + 0.5
        } else {
            0.0
        };
        let bw = h.border_weakness(c);
        let es = h.enemy_strength(c);
        let raw = power * w.fortify_unit_count + no_enemy_power * w.fortify_no_enemies_power
            - bw * w.fortify_border_weakness
            - es * w.fortify_enemy_strength;
        normalize_score(raw, w.fortify_unit_count + w.fortify_no_enemies_power)
    }

    /// One end's score in `GetFortifyTargetCountry`.
    fn fortify_end(&self, t: Territory, attack_units: i64) -> f64 {
        let (w, h) = (self.w, &self.h);
        let mut enemies = 0.0;
        let mut humans = 0.0;
        for &n in links(t) {
            if h.board.owner(n) == h.board.owner(t) {
                continue;
            }
            enemies += 1.0;
            if h.is_human(h.board.owner(n)) {
                humans += 1.0;
            }
        }
        let cont = h.continent_ownership(continent_of(t), h.me);
        let bw = h.border_weakness(t);
        let mut elim = h.chance_eliminate_player_from(t);
        let es = h.enemy_strength(t);
        let mut owners: Vec<_> = h
            .board
            .enemies(t)
            .iter()
            .map(|&n| h.board.owner(n))
            .collect();
        owners.sort_unstable();
        owners.dedup();
        if owners.len() > 1 {
            elim = 0.0;
        }
        let bs = h.battle_success_min(t, attack_units);
        let human_ratio = if humans > 0.0 && enemies > 0.0 {
            humans / enemies
        } else {
            0.0
        };
        cont * w.fortify_continent_ownership
            + bw * w.fortify_border_weakness
            + elim * w.eliminate_player
            + (100.0 - w.risky) * bs
            + es * w.fortify_enemy_strength
            - human_ratio * w.fortify_human_ratio
    }

    /// `GetFortifyTargetCountry`: the target's score, or 0 unless it beats the source's when the
    /// source faces enemies itself.
    pub fn fortify_target(&self, source: Territory, t: Territory) -> f64 {
        let (w, h) = (self.w, &self.h);
        if self.stacker() {
            if self.count_enemies(t) == 0 {
                return 0.0;
            }
            let target =
                h.country_power(t) * fround(1.8) + h.enemy_strength(t) + h.border_weakness(t);
            if self.count_enemies(source) > 0 {
                let from = h.country_power(source) * fround(1.8)
                    + h.enemy_strength(source)
                    + h.border_weakness(source);
                if from >= target {
                    return 0.0;
                }
            }
            return normalize_score(target, fround(1.8) + 1.0 + 1.0);
        }
        let score = self.fortify_end(t, self.units(t) + self.units(source) - 2);
        let source_score = if self.count_enemies(source) > 0 {
            self.fortify_end(source, self.units(source) - 1)
        } else {
            0.0
        };
        let max = w.fortify_continent_ownership
            + w.fortify_border_weakness
            + w.eliminate_player
            + (100.0 - w.risky)
            + w.fortify_enemy_strength;
        if source_score >= score {
            0.0
        } else {
            normalize_score(score, max)
        }
    }

    /// `GetFortifyMoveUnitsAmount`: the armies split in proportion to the threat at each end.
    /// Stacker moves everything.
    pub fn fortify_move_units_amount(
        &self,
        source: Territory,
        target: Territory,
        amount: i64,
    ) -> f64 {
        let h = &self.h;
        let max_move = self.units(source) - 1;
        if self.stacker() {
            return normalize_score(if amount == max_move { 1.0 } else { 0.0 }, 1.0);
        }
        let s_es = h.enemy_strength(source);
        let t_es = h.enemy_strength(target);
        let s_bw = h.border_weakness(source);
        let t_bw = h.border_weakness(target);
        let t_threat = t_bw + t_es;
        let total = s_bw + s_es + t_threat;
        let ideal = (t_threat / total) * max_move as f64;
        let diff = (ideal - amount as f64).abs();
        let raw = 1.0 - diff / max_move as f64;
        normalize_score(raw, 1.0)
    }
}

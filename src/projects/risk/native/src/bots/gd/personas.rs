//! `bots/gd/personas.ts`: GD's persona weights (its `DAIStats`, 0 to 100) for the four personas
//! its Expert tier deals, only those a classic game reads.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Persona {
    Defensive,
    Continental,
    Aggressive,
    Stacker,
}

pub struct Weights {
    pub risky: f64,
    pub continent_bonus: f64,
    pub card_bonus: f64,
    pub eliminate_player: f64,
    pub focus_leading_player: f64,
    pub deploy_continent_ownership: f64,
    pub deploy_border_weakness: f64,
    pub deploy_enemy_strength: f64,
    pub attack_from_continent_ownership: f64,
    pub attack_to_continent_ownership: f64,
    pub attack_continent_loss: f64,
    pub attack_enemy_strength: f64,
    pub attack_success_threshold: f64,
    pub attack_success_desperate_threshold: f64,
    pub fortify_no_enemies_power: f64,
    pub fortify_border_weakness: f64,
    pub fortify_continent_ownership: f64,
    pub fortify_human_ratio: f64,
    pub fortify_enemy_strength: f64,
    pub fortify_unit_count: f64,
}

impl Persona {
    pub fn weights(self) -> &'static Weights {
        match self {
            Persona::Defensive => &DEFENSIVE,
            Persona::Continental => &CONTINENTAL,
            Persona::Aggressive => &AGGRESSIVE,
            Persona::Stacker => &STACKER,
        }
    }
}

const DEFENSIVE: Weights = Weights {
    risky: 50.0,
    continent_bonus: 25.0,
    card_bonus: 30.0,
    eliminate_player: 35.0,
    focus_leading_player: 30.0,
    deploy_continent_ownership: 30.0,
    deploy_border_weakness: 70.0,
    deploy_enemy_strength: 45.0,
    attack_from_continent_ownership: 20.0,
    attack_to_continent_ownership: 45.0,
    attack_continent_loss: 40.0,
    attack_enemy_strength: 95.0,
    attack_success_threshold: 80.0,
    attack_success_desperate_threshold: 40.0,
    fortify_no_enemies_power: 80.0,
    fortify_border_weakness: 50.0,
    fortify_continent_ownership: 40.0,
    fortify_human_ratio: 0.0,
    fortify_enemy_strength: 70.0,
    fortify_unit_count: 30.0,
};

const CONTINENTAL: Weights = Weights {
    risky: 60.0,
    continent_bonus: 65.0,
    card_bonus: 25.0,
    eliminate_player: 45.0,
    focus_leading_player: 65.0,
    deploy_continent_ownership: 35.0,
    deploy_border_weakness: 60.0,
    deploy_enemy_strength: 75.0,
    attack_from_continent_ownership: 30.0,
    attack_to_continent_ownership: 60.0,
    attack_continent_loss: 45.0,
    attack_enemy_strength: 60.0,
    attack_success_threshold: 55.0,
    attack_success_desperate_threshold: 25.0,
    fortify_no_enemies_power: 80.0,
    fortify_border_weakness: 60.0,
    fortify_continent_ownership: 60.0,
    fortify_human_ratio: 0.0,
    fortify_enemy_strength: 50.0,
    fortify_unit_count: 40.0,
};

const AGGRESSIVE: Weights = Weights {
    risky: 70.0,
    continent_bonus: 45.0,
    card_bonus: 55.0,
    eliminate_player: 70.0,
    focus_leading_player: 70.0,
    deploy_continent_ownership: 15.0,
    deploy_border_weakness: 40.0,
    deploy_enemy_strength: 95.0,
    attack_from_continent_ownership: 5.0,
    attack_to_continent_ownership: 50.0,
    attack_continent_loss: 25.0,
    attack_enemy_strength: 30.0,
    attack_success_threshold: 45.0,
    attack_success_desperate_threshold: 10.0,
    fortify_no_enemies_power: 60.0,
    fortify_border_weakness: 35.0,
    fortify_continent_ownership: 15.0,
    fortify_human_ratio: 0.0,
    fortify_enemy_strength: 30.0,
    fortify_unit_count: 45.0,
};

const STACKER: Weights = Weights {
    risky: 40.0,
    continent_bonus: 50.0,
    card_bonus: 50.0,
    eliminate_player: 30.0,
    focus_leading_player: 10.0,
    deploy_continent_ownership: 0.0,
    deploy_border_weakness: 0.0,
    deploy_enemy_strength: 0.0,
    attack_from_continent_ownership: 20.0,
    attack_to_continent_ownership: 75.0,
    attack_continent_loss: 40.0,
    attack_enemy_strength: 60.0,
    attack_success_threshold: 99.0,
    attack_success_desperate_threshold: 45.0,
    fortify_no_enemies_power: 0.0,
    fortify_border_weakness: 0.0,
    fortify_continent_ownership: 0.0,
    fortify_human_ratio: 0.0,
    fortify_enemy_strength: 0.0,
    fortify_unit_count: 0.0,
};

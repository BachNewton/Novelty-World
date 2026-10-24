//! native-v1 (`ideas/native-v1.md`): a turn planner in rule-v6's class, designed in Rust from the
//! rule bots' ideas, its opponent model remembered by region so a turn costs a fraction of v6's.
//! A pure function of its seat's view, options and history; it draws nothing at random.

mod board;
mod decisions;
mod evaluate;
mod fights;
mod hands;
mod knobs;
mod memo;
mod opponents;
mod params;
mod plans;
mod routes;

pub use knobs::Knobs;
pub use params::{Params, Preferences, NATIVE_V1};

use crate::bot::{Bot, BotInput};
use crate::cards::territory_of;
use crate::engine::{Move, Options, Territory};
use board::Board;
use decisions::{
    after_trade, choose_bonus, choose_fortify, choose_occupy, choose_set, next_attack,
};
use evaluate::Judge;
use opponents::Record;
use plans::best_plan;

pub struct NativeV1 {
    pub params: Params,
}

impl Bot for NativeV1 {
    fn decide(&self, input: &BotInput) -> Move {
        let b = Board::from_view(input.view);
        let om = self.params.opponents;
        let record = Record::read(input.history, om.history_decay, input.seat);
        let prefs = *self.params.prefs_for(b.alive_count());
        let knobs = self
            .params
            .knobs
            .in_effect(b.players as usize, b.alive_count());
        let judge = Judge::new(input.seat, prefs, om, record, knobs);
        match input.options {
            Options::Reinforce(r) => {
                if !r.sets.is_empty() {
                    let hand = input.view.hand.as_ref().map_or(&[][..], |h| h.as_slice());
                    let set = choose_set(&b, &judge, hand, &r.sets);
                    let pictured: Vec<Territory> = r
                        .bonus_territories
                        .iter()
                        .copied()
                        .filter(|&t| set.iter().any(|&c| territory_of(c) == Some(t as usize)))
                        .collect();
                    let bonus = (!pictured.is_empty()).then(|| choose_bonus(&b, &pictured));
                    let trade = r.must_trade || {
                        let hold = best_plan(&b, &judge, r.armies_to_place).value;
                        let (mut traded, armies) = after_trade(&b, &judge, set);
                        if let Some(t) = bonus {
                            traded.armies[t as usize] += 2;
                        }
                        best_plan(&traded, &judge, r.armies_to_place + armies).value > hold
                    };
                    if trade {
                        return Move::Trade {
                            cards: set,
                            bonus: bonus.filter(|_| pictured.len() > 1),
                        };
                    }
                }
                let plan = best_plan(&b, &judge, r.armies_to_place);
                let (territory, armies) = plan
                    .first_placement()
                    .expect("a plan with armies to place places them");
                Move::Place {
                    territory: territory as Territory,
                    armies,
                }
            }
            Options::Attack(_) => {
                let plan = best_plan(&b, &judge, 0);
                next_attack(&b, &plan).unwrap_or(Move::EndAttack)
            }
            &Options::Occupy { from, to, min, max } => Move::Occupy {
                armies: choose_occupy(&b, &judge, from as usize, to as usize, min, max),
            },
            Options::Fortify(f) => choose_fortify(&b, &judge, f).unwrap_or(Move::EndTurn),
        }
    }
}

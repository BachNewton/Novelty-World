//! A random legal move: the engine's fuzzer and the harness's sanity floor. It is not the
//! TypeScript `random` bot's moves, only the same idea.

use crate::bot::{Bot, BotInput};
use crate::cards::territory_of;
use crate::engine::{Move, Options};
use crate::map::territories_in;
use crate::rng::Rng;

pub struct RandomBot;

/// A whole number in `low..=high`.
fn between(rng: &mut Rng, low: i32, high: i32) -> i32 {
    low + (rng.next() * (high - low + 1) as f64).floor() as i32
}

impl Bot for RandomBot {
    fn decide(&self, input: &BotInput) -> Move {
        let mut rng = Rng::from_seed(input.seed);
        match input.options {
            Options::Reinforce(r) => {
                if r.must_trade || (!r.sets.is_empty() && rng.next() < 0.5) {
                    let cards = *rng.pick(&r.sets);
                    let qualifying: Vec<u8> = r
                        .bonus_territories
                        .iter()
                        .copied()
                        .filter(|&t| cards.iter().any(|&c| territory_of(c) == Some(t as usize)))
                        .collect();
                    let bonus = (qualifying.len() > 1).then(|| *rng.pick(&qualifying));
                    return Move::Trade { cards, bonus };
                }
                let own: Vec<u8> = r.own_territories().collect();
                let armies = if rng.next() < 0.5 {
                    r.armies_to_place
                } else {
                    between(&mut rng, 1, r.armies_to_place)
                };
                Move::Place {
                    territory: *rng.pick(&own),
                    armies,
                }
            }
            Options::Attack(a) => {
                if rng.next() < 0.15 {
                    return Move::EndAttack;
                }
                let attack = *rng.pick(&a.attacks);
                let armies = input.view.territories[attack.from as usize].armies;
                if rng.next() < 0.5 {
                    Move::Blitz {
                        from: attack.from,
                        to: attack.to,
                        keep_at_least: between(&mut rng, 1, armies - 1),
                    }
                } else {
                    Move::Attack {
                        from: attack.from,
                        to: attack.to,
                        dice: between(&mut rng, 1, attack.max_dice as i32) as u8,
                    }
                }
            }
            &Options::Occupy { min, max, .. } => Move::Occupy {
                armies: between(&mut rng, min, max),
            },
            Options::Fortify(f) => {
                if rng.next() < 0.3 {
                    return Move::EndTurn;
                }
                let source = *rng.pick(&f.sources);
                let reach: Vec<usize> = territories_in(source.reach).collect();
                Move::Fortify {
                    from: source.from,
                    to: *rng.pick(&reach) as u8,
                    armies: between(&mut rng, 1, source.max_armies),
                }
            }
        }
    }
}

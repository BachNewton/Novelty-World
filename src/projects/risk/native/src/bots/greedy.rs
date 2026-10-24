//! `bots/greedy.ts`, move for move: a one-ply bot that stacks where it can attack, attacks wherever
//! it has the bigger army, pushes toward the continent it holds most of, and pulls idle armies to
//! the front.

use crate::bot::{Bot, BotInput};
use crate::cards::{territory_of, Card};
use crate::engine::{Move, Options, Seat, Territory, View};
use crate::map::{ADJACENCY, CONTINENTS, TERRITORIES};

pub struct GreedyBot;

/// How much of each continent `seat` holds, 0 to 1.
fn continent_shares(view: &View, seat: Seat) -> [f64; CONTINENTS.len()] {
    let mut held = [0u32; CONTINENTS.len()];
    let mut size = [0u32; CONTINENTS.len()];
    for (t, territory) in TERRITORIES.iter().enumerate() {
        size[territory.continent] += 1;
        if view.territories[t].owner == seat {
            held[territory.continent] += 1;
        }
    }
    std::array::from_fn(|c| held[c] as f64 / size[c] as f64)
}

fn enemy_neighbours(view: &View, seat: Seat, t: Territory) -> impl Iterator<Item = usize> + '_ {
    ADJACENCY[t as usize]
        .iter()
        .copied()
        .filter(move |&n| view.territories[n].owner != seat)
}

fn faces_an_enemy(view: &View, seat: Seat, t: Territory) -> bool {
    enemy_neighbours(view, seat, t).next().is_some()
}

/// The first item with the highest score.
fn best<T: Copy>(items: impl IntoIterator<Item = T>, score: impl Fn(T) -> f64) -> Option<T> {
    let mut top = None;
    let mut top_score = f64::NEG_INFINITY;
    for item in items {
        let s = score(item);
        if s > top_score {
            top = Some(item);
            top_score = s;
        }
    }
    top
}

/// The front territory to build on: the most armies over its weakest neighbour, leaning to the
/// continent the seat holds most of.
fn stack_territory(view: &View, seat: Seat, own: &[Territory]) -> Territory {
    let shares = continent_shares(view, seat);
    let armies = |t: usize| view.territories[t].armies;
    let front = own
        .iter()
        .copied()
        .filter(|&t| faces_an_enemy(view, seat, t));
    let choice = best(front, |t| {
        let weakest = enemy_neighbours(view, seat, t)
            .map(armies)
            .min()
            .expect("a front territory faces an enemy");
        (armies(t as usize) - weakest) as f64 + 4.0 * shares[TERRITORIES[t as usize].continent]
    });
    choice.unwrap_or(own[0])
}

/// `tradeMove`: a trade of `cards`, naming the +2 territory (`choose`'s pick) only when the set
/// pictures more than one of the territories it may go to (`CARDS-7`).
pub fn trade_move(
    cards: [Card; 3],
    bonus_territories: &[Territory],
    choose: impl FnOnce(&[Territory]) -> Territory,
) -> Move {
    let choices: Vec<Territory> = bonus_territories
        .iter()
        .copied()
        .filter(|&t| cards.iter().any(|&c| territory_of(c) == Some(t as usize)))
        .collect();
    let bonus = (choices.len() > 1).then(|| choose(&choices));
    Move::Trade { cards, bonus }
}

impl Bot for GreedyBot {
    fn decide(&self, input: &BotInput) -> Move {
        let BotInput { seat, view, .. } = *input;
        let armies = |t: Territory| view.territories[t as usize].armies;
        match input.options {
            Options::Reinforce(r) => {
                if let Some(&set) = r.sets.first() {
                    return trade_move(set, &r.bonus_territories, |choices| choices[0]);
                }
                let own: Vec<Territory> = r.own_territories().collect();
                Move::Place {
                    territory: stack_territory(view, seat, &own),
                    armies: r.armies_to_place,
                }
            }
            Options::Attack(a) => {
                let shares = continent_shares(view, seat);
                let worth_it = a
                    .attacks
                    .iter()
                    .filter(|a| armies(a.from) >= armies(a.to) + 2);
                let target = best(worth_it, |a| {
                    (armies(a.from) - armies(a.to)) as f64
                        + 4.0 * shares[TERRITORIES[a.to as usize].continent]
                });
                match target {
                    Some(a) => Move::Blitz {
                        from: a.from,
                        to: a.to,
                        keep_at_least: 1,
                    },
                    None => Move::EndAttack,
                }
            }
            // Everything moves on, unless the territory left behind still faces an enemy: then it
            // keeps half of what could move.
            &Options::Occupy { from, min, max, .. } => Move::Occupy {
                armies: if faces_an_enemy(view, seat, from) {
                    min.max(((min + max) as f64 / 2.0).ceil() as i32)
                } else {
                    max
                },
            },
            Options::Fortify(f) => {
                let idle = f.moves().filter(|m| {
                    !faces_an_enemy(view, seat, m.from) && faces_an_enemy(view, seat, m.to)
                });
                match best(idle, |m| m.max_armies as f64) {
                    Some(m) => Move::Fortify {
                        from: m.from,
                        to: m.to,
                        armies: m.max_armies,
                    },
                    None => Move::EndTurn,
                }
            }
        }
    }
}

//! `bots/gd/`: GD's Expert AI (`ClassicAI`) for one persona, move for move (`bots/gd/PORT.md` is
//! what was ported and why). Each decision is one step of GD's phase loops, which pick a source,
//! then a target, then an amount, each the top score of the persona's weighing. GD's per-turn
//! lists are read back from the turn's history, and its random draws come from the bot's seed.

mod board;
mod cards;
mod choice;
mod helper;
mod odds;
mod persona;
mod personas;

pub use personas::Persona;

use super::history::{for_each_turn_end, rounds_completed, turn_so_far, TurnSoFar};
use crate::bot::{Bot, BotInput};
use crate::engine::{Move, Options, ReinforceOptions, Seat, TerritoryView};
use crate::rng::Rng;
use board::{gd_map, Board};
use cards::{best_card_match, bonus_territory_of};
use choice::{apply_step_variance, get_choice, iterative_array, random_range};
use helper::Helper;
use persona::Scorer;

pub struct GdBot {
    pub persona: Persona,
}

/// Stacker becomes Aggressive for good once, at the end of one of its turns, it holds more armies
/// than every other seat together (`StackerAIPersona.EndTurn`).
fn persona_now(start: Persona, seat: Seat, input: &BotInput) -> Persona {
    if start != Persona::Stacker {
        return start;
    }
    let swapped = for_each_turn_end(input.history, |ended, board| {
        if ended != seat {
            return false;
        }
        let (mut mine, mut others) = (0, 0);
        for &t in &gd_map().order {
            if board.owner[t as usize] == seat {
                mine += board.armies[t as usize];
            } else {
                others += board.armies[t as usize];
            }
        }
        mine > others
    });
    if swapped {
        Persona::Aggressive
    } else {
        Persona::Stacker
    }
}

/// One decision's scorer, over the input's view.
fn scorer<'a>(input: &'a BotInput, so: &'a TurnSoFar, start: Persona) -> Scorer<'a> {
    let view = input.view;
    let persona = persona_now(start, input.seat, input);
    let w = persona.weights();
    let helper = Helper {
        board: Board::new(view, rounds_completed(input.history) == 0),
        me: input.seat,
        hand: view.hand.as_ref().map_or(&[], |h| h.as_slice()),
        humans: input.humans,
        conquered_this_turn: so.captured.len(),
        attacks_this_turn: so.attacks,
        attack_success_threshold: w.attack_success_threshold,
    };
    Scorer {
        persona,
        w,
        h: helper,
        to_place: view.armies_to_place as i64,
        placed_on: &so.placed_on,
    }
}

/// `ClassicAIDeploy.ExecuteAction`: a trade when one is due, otherwise one chunk of armies.
fn reinforce(input: &BotInput, start: Persona, options: &ReinforceOptions, rng: &mut Rng) -> Move {
    let seat = input.seat;
    let so = turn_so_far(input.history);
    let s = scorer(input, &so, start);
    let board = &s.h.board;
    let hand = s.h.hand;
    // GD trades at 5 cards or more before every chunk, and otherwise once a round with a set in
    // hand (PORT.md's open reading 6). Our engine takes trades before the first placement, the
    // forced ones before any, which is when GD makes them at the start of a turn.
    if options.must_trade || (!options.sets.is_empty() && hand.len() >= 3 && so.traded == 0) {
        let set = best_card_match(hand, |t| board.owner(t) == seat)
            .unwrap_or_else(|| panic!("GD's AI found no set in {hand:?}"));
        let cards: [u8; 3] = set
            .as_slice()
            .try_into()
            .unwrap_or_else(|_| panic!("GD's AI made a set of {set:?}"));
        let bonus = bonus_territory_of(&set, seat, |t| board.owner(t));
        return Move::Trade { cards, bonus };
    }

    let to_place = s.to_place;
    let (amounts, variance) = iterative_array(1, to_place);
    let chosen = get_choice(&amounts, |amount| {
        if amount == 1 && to_place == 1 {
            1.0
        } else {
            s.deploy_units_amount(amount, rng)
        }
    })
    .unwrap_or(0);
    let amount = apply_step_variance(chosen, 1, to_place, variance, rng);
    let countries = board.countries(seat, 1);
    let territory = get_choice(&countries, |c| s.deploy_country(c, amount))
        .unwrap_or_else(|| countries[random_range(rng, 0, countries.len() as i64) as usize]);
    Move::Place {
        territory,
        armies: amount as i32,
    }
}

/// `ClassicAIAttack.ExecuteAction`: the best source, then its best target, blitzed to the end.
fn attack(s: &Scorer) -> Move {
    let board = &s.h.board;
    let Some(source) = get_choice(&board.countries(s.h.me, 2), |c| s.attack_source(c)) else {
        return Move::EndAttack;
    };
    let Some(target) = get_choice(&board.enemies(source), |c| s.attack_target(source, c)) else {
        return Move::EndAttack;
    };
    Move::Blitz {
        from: source,
        to: target,
        keep_at_least: 1,
    }
}

/// The move-in after a capture (`moveUnitsAI`). GD asks with the captured territory already the
/// bot's, every surviving attacker still in the source and no armies yet in the captured
/// territory (PORT.md's open reading 3); our engine has moved the minimum in already, so the board
/// is put back that way.
fn occupy(input: &BotInput, start: Persona, from: u8, to: u8, rng: &mut Rng) -> Move {
    let territories = &input.view.territories;
    let u = (territories[from as usize].armies + territories[to as usize].armies) as i64;
    let so = turn_so_far(input.history);
    let mut s = scorer(input, &so, start);
    s.h.board.territories[from as usize] = TerritoryView {
        owner: input.seat,
        armies: u as i32,
    };
    s.h.board.territories[to as usize] = TerritoryView {
        owner: input.seat,
        armies: 0,
    };
    let min = (u - 1).min(3);
    let max = min.max(u - 1);
    let (amounts, variance) = iterative_array(min, max);
    let chosen = get_choice(&amounts, |amount| {
        s.attack_move_units_amount(min, max, from, to, amount)
    })
    .unwrap_or(0);
    let c = apply_step_variance(chosen, min, max, variance, rng);
    let armies = if c < min || c > max { max } else { c };
    Move::Occupy {
        armies: armies as i32,
    }
}

/// `AIFortify.ExecuteAction`: one move, from the best source to the best territory joined to it,
/// or none when neither scores above 0.
fn fortify(s: &Scorer, rng: &mut Rng) -> Move {
    let board = &s.h.board;
    let source = get_choice(&board.countries(s.h.me, 1), |c| {
        if board.units(c) <= 1 || board.connected(c).is_empty() {
            0.0
        } else {
            s.fortify_source(c)
        }
    });
    let Some(source) = source else {
        return Move::EndTurn;
    };
    let Some(target) = get_choice(&board.connected(source), |c| s.fortify_target(source, c)) else {
        return Move::EndTurn;
    };
    let max = board.units(source) - 1;
    let (amounts, variance) = iterative_array(1, max);
    let chosen = get_choice(&amounts, |amount| {
        s.fortify_move_units_amount(source, target, amount)
    })
    .unwrap_or(0);
    Move::Fortify {
        from: source,
        to: target,
        armies: apply_step_variance(chosen, 1, max, variance, rng) as i32,
    }
}

impl Bot for GdBot {
    fn decide(&self, input: &BotInput) -> Move {
        let mut rng = Rng::from_seed(input.seed);
        match input.options {
            &Options::Occupy { from, to, .. } => occupy(input, self.persona, from, to, &mut rng),
            Options::Reinforce(r) => reinforce(input, self.persona, r, &mut rng),
            Options::Attack(_) => {
                let so = turn_so_far(input.history);
                attack(&scorer(input, &so, self.persona))
            }
            Options::Fortify(_) => {
                let so = turn_so_far(input.history);
                fortify(&scorer(input, &so, self.persona), &mut rng)
            }
        }
    }
}

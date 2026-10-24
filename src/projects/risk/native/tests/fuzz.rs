//! Random-legal play: every `INV-*` checked after every step, the options held equal to what
//! `apply` accepts both ways (every listed move accepted, random moves accepted exactly when the
//! options allow them), and every game replayed to the same states (`INV-10`).

use risk_native::bot::{Bot, BotInput};
use risk_native::bots::RandomBot;
use risk_native::canonical::state_hash;
use risk_native::engine::{
    invariants, new_game, EventKind, Game, Move, Options, Phase, Seat, Trade,
};
use risk_native::map::{territories_in, ADJACENT, TERRITORY_COUNT};
use risk_native::rng::Rng;
use risk_native::runner::bots_seed;

/// What the options allow, read from them alone (and the board, for a blitz's armies).
fn allowed(g: &Game, options: &Options, mv: Move) -> bool {
    let territory_ok = |t: u8| (t as usize) < TERRITORY_COUNT;
    match (options, mv) {
        (Options::Reinforce(r), Move::Place { territory, armies }) => {
            r.may_place
                && territory_ok(territory)
                && r.own & (1 << territory) != 0
                && (1..=r.armies_to_place).contains(&armies)
        }
        (Options::Reinforce(r), Move::Trade { cards, bonus }) => {
            let mut sorted = cards;
            sorted.sort();
            let listed = r.sets.iter().any(|s| {
                let mut s = *s;
                s.sort();
                s == sorted
            });
            let distinct = sorted[0] != sorted[1] && sorted[1] != sorted[2];
            let qualifying: Vec<u8> = r
                .bonus_territories
                .iter()
                .copied()
                .filter(|t| cards.contains(t))
                .collect();
            let bonus_ok = match bonus {
                Some(b) => qualifying.contains(&b),
                None => qualifying.len() <= 1,
            };
            listed && distinct && bonus_ok
        }
        (Options::Attack(a), Move::Attack { from, to, dice }) => a
            .attacks
            .iter()
            .any(|x| x.from == from && x.to == to && (1..=x.max_dice).contains(&dice)),
        (
            Options::Attack(a),
            Move::Blitz {
                from,
                to,
                keep_at_least,
            },
        ) => {
            a.attacks.iter().any(|x| x.from == from && x.to == to)
                && keep_at_least >= 1
                && keep_at_least < g.armies[from as usize]
        }
        (Options::Attack(_), Move::EndAttack) => true,
        (&Options::Occupy { min, max, .. }, Move::Occupy { armies }) => {
            (min..=max).contains(&armies)
        }
        (Options::Fortify(f), Move::Fortify { from, to, armies }) => f.sources.iter().any(|s| {
            s.from == from
                && territory_ok(to)
                && s.reach & (1 << to) != 0
                && (1..=s.max_armies).contains(&armies)
        }),
        (Options::Fortify(_), Move::EndTurn) => true,
        _ => false,
    }
}

/// Every move the options list, with the ends of each amount's range.
fn listed(g: &Game, options: &Options) -> Vec<Move> {
    let mut moves = Vec::new();
    match options {
        Options::Reinforce(r) => {
            for &cards in r.sets.iter() {
                let qualifying: Vec<u8> = r
                    .bonus_territories
                    .iter()
                    .copied()
                    .filter(|t| cards.contains(t))
                    .collect();
                if qualifying.len() <= 1 {
                    moves.push(Move::Trade { cards, bonus: None });
                }
                for &b in &qualifying {
                    moves.push(Move::Trade {
                        cards,
                        bonus: Some(b),
                    });
                }
            }
            if r.may_place {
                for territory in r.own_territories() {
                    for armies in [1, r.armies_to_place] {
                        moves.push(Move::Place { territory, armies });
                    }
                }
            }
        }
        Options::Attack(a) => {
            moves.push(Move::EndAttack);
            for x in a.attacks.iter() {
                for dice in 1..=x.max_dice {
                    moves.push(Move::Attack {
                        from: x.from,
                        to: x.to,
                        dice,
                    });
                }
                for keep_at_least in [1, g.armies[x.from as usize] - 1] {
                    moves.push(Move::Blitz {
                        from: x.from,
                        to: x.to,
                        keep_at_least,
                    });
                }
            }
        }
        &Options::Occupy { min, max, .. } => {
            moves.extend([min, max, (min + max) / 2].map(|armies| Move::Occupy { armies }));
        }
        Options::Fortify(f) => {
            moves.push(Move::EndTurn);
            for m in f.moves() {
                for armies in [1, m.max_armies] {
                    moves.push(Move::Fortify {
                        from: m.from,
                        to: m.to,
                        armies,
                    });
                }
            }
        }
    }
    moves
}

/// A move with random fields, mostly near the board's ranges, often illegal.
fn random_move(rng: &mut Rng, g: &Game) -> Move {
    let territory = |rng: &mut Rng| (rng.next() * 44.0) as u8;
    let armies = |rng: &mut Rng| (rng.next() * 14.0) as i32 - 1;
    match (rng.next() * 8.0) as u32 {
        0 => Move::Place {
            territory: territory(rng),
            armies: armies(rng),
        },
        1 => {
            // Half the time three cards from the hand, so real sets turn up.
            let hand = g.hands[g.active as usize];
            let card = |rng: &mut Rng| {
                if !hand.is_empty() && rng.next() < 0.7 {
                    *rng.pick(&hand)
                } else {
                    (rng.next() * 46.0) as u8
                }
            };
            let cards = [card(rng), card(rng), card(rng)];
            let bonus = (rng.next() < 0.5).then(|| cards[(rng.next() * 3.0) as usize]);
            Move::Trade { cards, bonus }
        }
        2 => Move::Attack {
            from: territory(rng),
            to: territory(rng),
            dice: (rng.next() * 5.0) as u8,
        },
        3 => Move::Blitz {
            from: territory(rng),
            to: territory(rng),
            keep_at_least: armies(rng),
        },
        4 => Move::Occupy {
            armies: armies(rng),
        },
        5 => Move::EndAttack,
        6 => Move::Fortify {
            from: territory(rng),
            to: territory(rng),
            armies: armies(rng),
        },
        _ => Move::EndTurn,
    }
}

/// A player that drives games to their end: everything on its biggest stack, blitzing all out
/// from it, so eliminations, forced trades and wins happen.
fn aggressor(g: &Game, options: &Options, rng: &mut Rng) -> Move {
    match options {
        Options::Reinforce(r) => {
            if r.must_trade || !r.sets.is_empty() {
                let cards = r.sets[0];
                let bonus = r
                    .bonus_territories
                    .iter()
                    .copied()
                    .find(|t| cards.contains(t));
                return Move::Trade { cards, bonus };
            }
            let territory = r
                .own_territories()
                .filter(|&t| frontier(g, t))
                .max_by_key(|&t| g.armies[t as usize])
                .unwrap();
            Move::Place {
                territory,
                armies: r.armies_to_place,
            }
        }
        Options::Attack(a) => {
            let best = a
                .attacks
                .iter()
                .max_by_key(|x| g.armies[x.from as usize] - g.armies[x.to as usize])
                .unwrap();
            if g.armies[best.from as usize] <= g.armies[best.to as usize] && rng.next() < 0.5 {
                return Move::EndAttack;
            }
            Move::Blitz {
                from: best.from,
                to: best.to,
                keep_at_least: 1,
            }
        }
        &Options::Occupy { max, .. } => Move::Occupy { armies: max },
        Options::Fortify(f) => f
            .moves()
            .filter(|m| !frontier(g, m.from) && frontier(g, m.to))
            .max_by_key(|m| m.max_armies)
            .map_or(Move::EndTurn, |m| Move::Fortify {
                from: m.from,
                to: m.to,
                armies: m.max_armies,
            }),
    }
}

/// Whether a territory borders an enemy.
fn frontier(g: &Game, t: u8) -> bool {
    ADJACENT[t as usize] & !g.owned[g.owner[t as usize] as usize] != 0
}

#[derive(Default, Debug)]
struct Seen {
    wins: usize,
    eliminations: usize,
    forced_trades: usize,
    trades: usize,
    captures: usize,
    moves: usize,
}

fn play(
    players: usize,
    seed: &str,
    max_turns: u32,
    aggressive: &[bool],
    seen: &mut Seen,
) -> Vec<(Seat, Move, String)> {
    let (mut g, _) = new_game(players, seed);
    invariants::check_state(&g).unwrap();
    let mut rng = Rng::from_seed(&format!("fuzz|{seed}"));
    let bots_seed = bots_seed(seed);
    let mut played = Vec::new();
    let mut trades = Vec::new();
    let mut decision = 0;
    while g.phase != Phase::GameOver && g.turn <= max_turns {
        let seat = g.active;
        for other in 0..players as Seat {
            if other != seat {
                assert_eq!(g.options(other), None, "only the active seat has options");
                let mut copy = g;
                assert!(copy.apply(other, Move::EndTurn).is_err());
            }
        }
        let options = g.options(seat).expect("the active seat has options");
        for mv in listed(&g, &options) {
            let mut copy = g;
            copy.apply(seat, mv)
                .unwrap_or_else(|e| panic!("{seed}: listed {mv:?} refused ({e})"));
        }
        for _ in 0..20 {
            let mv = random_move(&mut rng, &g);
            let mut copy = g;
            let accepted = copy.apply(seat, mv).is_ok();
            assert_eq!(
                accepted,
                allowed(&g, &options, mv),
                "{seed}: {mv:?} under {options:?}"
            );
            if !accepted {
                assert_eq!(copy, g, "a refused move changed the game");
            }
        }

        let mv = if aggressive[seat as usize] {
            aggressor(&g, &options, &mut rng)
        } else {
            let view = g.view(Some(seat), &trades);
            let decision_seed = format!("{bots_seed}/{decision}");
            RandomBot.decide(&BotInput {
                seat,
                view: &view,
                options: &options,
                events: &[],
                history: &[],
                humans: &[],
                seed: &decision_seed,
            })
        };
        let before = g;
        let events = g
            .apply(seat, mv)
            .unwrap_or_else(|e| panic!("{seed}: {mv:?} refused ({e})"));
        invariants::check_step(&before, &events, &g)
            .unwrap_or_else(|e| panic!("{seed} after {mv:?}: {e}\n{before:?}"));
        for e in &events {
            match e.kind {
                EventKind::GameOver { .. } => seen.wins += 1,
                EventKind::Eliminated { .. } => seen.eliminations += 1,
                EventKind::Captured { .. } => seen.captures += 1,
                EventKind::Traded { seat, cards, .. } => {
                    trades.push(Trade { seat, cards });
                    if e.rule == "ELIM-3" {
                        seen.forced_trades += 1;
                    } else {
                        seen.trades += 1;
                    }
                }
                _ => {}
            }
        }
        seen.moves += 1;
        played.push((seat, mv, state_hash(&g)));
        decision += 1;
    }
    played
}

#[test]
fn inv_all_hold_over_random_legal_play() {
    let mut seen = Seen::default();
    for i in 0..300 {
        let players = 3 + i % 4;
        let seed = format!("fuzz-{i}");
        // A third of the tables all aggressors, so games end; the rest mixed with random play.
        let aggressive: Vec<bool> = (0..players)
            .map(|s| i % 3 == 0 || (i + s) % 3 != 0)
            .collect();
        let played = play(players, &seed, 150, &aggressive, &mut seen);

        // INV-10: the same seed and moves give the same game, state for state.
        if i % 10 == 0 {
            let (mut g, _) = new_game(players, &seed);
            for (seat, mv, hash) in &played {
                g.apply(*seat, *mv).unwrap();
                assert_eq!(&state_hash(&g), hash, "{seed} replays differently");
            }
        }
    }
    println!("{seen:?}");
    assert!(
        seen.wins > 20 && seen.eliminations > 50 && seen.forced_trades > 5 && seen.trades > 100,
        "the fuzz reached every rule: {seen:?}"
    );
}

#[test]
fn territories_in_lists_a_mask_in_order() {
    assert_eq!(
        territories_in(0b1010_0001).collect::<Vec<_>>(),
        vec![0, 5, 7]
    );
}

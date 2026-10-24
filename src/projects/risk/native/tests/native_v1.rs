//! native-v1 (`ideas/native-v1.md`): its judgement on built positions, legality on random and
//! self-play positions, determinism, and a sanity floor against random and greedy.

use risk_native::bot::{Bot, BotInput};
use risk_native::bots::bot;
use risk_native::engine::{
    new_game, Deck, Game, Hand, Move, Occupying, Phase, Reinforce, Seat, MAX_SEATS,
};
use risk_native::map::TERRITORY_COUNT;
use risk_native::runner::{drive, play_game, GameRecord};

const INDONESIA: u8 = 38;
const NEW_GUINEA: u8 = 39;
const WESTERN_AUSTRALIA: u8 = 40;
const EASTERN_AUSTRALIA: u8 = 41;
const SIAM: u8 = 37;
const INDIA: u8 = 36;
const CHINA: u8 = 34;
const EAST_AFRICA: u8 = 22;
const MADAGASCAR: u8 = 25;

fn native() -> Box<dyn Bot> {
    bot("native-v1").expect("native-v1 is registered")
}

/// A position at `players` seats where seat 0 is to move: every territory dealt round seats 1 and
/// up with `armies` on it, then `mine` given to their owners.
fn position(players: usize, armies: i32, mine: &[(u8, Seat, i32)]) -> Game {
    let (mut g, _) = new_game(players, "native-v1-scenario");
    for t in 0..TERRITORY_COUNT {
        g.owner[t] = 1 + (t % (players - 1)) as Seat;
        g.armies[t] = armies;
    }
    for &(t, seat, a) in mine {
        g.owner[t as usize] = seat;
        g.armies[t as usize] = a;
    }
    g.recount_owned();
    g.active = 0;
    g.turn = 20;
    g.round = 5;
    g.hands = [Hand::new(); MAX_SEATS];
    g.reinforce = None;
    g.occupying = None;
    g.captured_this_turn = false;
    g
}

fn attacking(mut g: Game) -> Game {
    g.phase = Phase::Attack;
    g
}

fn decide(g: &Game) -> Move {
    // The cards a position put in hands leave the deck, as the rules keep each card once.
    let mut g = *g;
    let held: Vec<u8> = g.hands.iter().flat_map(|h| h.iter().copied()).collect();
    let deck: Vec<u8> = g
        .deck
        .iter()
        .copied()
        .filter(|c| !held.contains(c))
        .collect();
    g.deck = Deck::from_slice(&deck);
    let g = &g;
    let view = g.view(Some(g.active), &[]);
    let options = g.options(g.active).expect("seat 0 is to move");
    let humans = vec![false; g.players as usize];
    let input = BotInput {
        seat: g.active,
        view: &view,
        options: &options,
        events: &[],
        history: &[],
        humans: &humans,
        seed: "scenario",
    };
    let mv = native().decide(&input);
    assert!({ *g }.apply(g.active, mv).is_ok(), "{mv:?} is illegal here");
    mv
}

fn target(mv: Move) -> Option<(u8, u8)> {
    match mv {
        Move::Attack { from, to, .. } | Move::Blitz { from, to, .. } => Some((from, to)),
        _ => None,
    }
}

/// Seat 0 holds Australia, everything else 5 armies a territory.
fn australia(indonesia: i32, siam: (Seat, i32)) -> Vec<(u8, Seat, i32)> {
    vec![
        (INDONESIA, 0, indonesia),
        (NEW_GUINEA, 0, 1),
        (WESTERN_AUSTRALIA, 0, 1),
        (EASTERN_AUSTRALIA, 0, 1),
        (SIAM, siam.0, siam.1),
    ]
}

#[test]
fn takes_the_sure_card() {
    let g = attacking(position(4, 5, &australia(12, (1, 1))));
    assert_eq!(target(decide(&g)), Some((INDONESIA, SIAM)));
}

#[test]
fn does_not_throw_armies_at_a_wall() {
    let g = attacking(position(4, 5, &australia(3, (1, 30))));
    assert_eq!(decide(&g), Move::EndAttack);
}

#[test]
fn breaks_a_continent() {
    let mut mine = vec![(SIAM, 0, 15), (INDIA, 0, 1), (CHINA, 0, 1)];
    for t in [INDONESIA, NEW_GUINEA, WESTERN_AUSTRALIA, EASTERN_AUSTRALIA] {
        mine.push((t, 1, 1));
    }
    let g = attacking(position(5, 5, &mine));
    assert_eq!(target(decide(&g)), Some((SIAM, INDONESIA)));
}

#[test]
fn finishes_a_kill_whose_cards_force_a_trade() {
    let mut g = position(5, 5, &[(EAST_AFRICA, 0, 10), (MADAGASCAR, 2, 1)]);
    // Seat 2 holds Madagascar alone; its 4 cards and mine make 5, a trade the moment it falls.
    for t in 0..TERRITORY_COUNT {
        if g.owner[t] == 2 && t != MADAGASCAR as usize {
            g.owner[t] = 3;
        }
    }
    g.recount_owned();
    g.hands[2] = Hand::from_slice(&[0, 1, 2, 3]);
    g.hands[0] = Hand::from_slice(&[4]);
    let g = attacking(g);
    assert_eq!(target(decide(&g)), Some((EAST_AFRICA, MADAGASCAR)));
}

#[test]
fn trades_when_forced() {
    let mut g = position(4, 5, &australia(5, (1, 5)));
    // Alaska, Northwest Territory and Greenland: infantry, artillery and cavalry, a set of 10.
    g.hands[0] = Hand::from_slice(&[0, 1, 2, 3, 4]);
    g.phase = Phase::Reinforce;
    g.reinforce = Some(Reinforce {
        armies_to_place: 3,
        placed_any: false,
        after_elimination: false,
    });
    assert!(matches!(decide(&g), Move::Trade { .. }));
}

#[test]
fn places_where_the_plan_attacks_from() {
    let mut g = position(4, 5, &australia(4, (1, 2)));
    g.phase = Phase::Reinforce;
    g.reinforce = Some(Reinforce {
        armies_to_place: 3,
        placed_any: false,
        after_elimination: false,
    });
    // Indonesia is the only one of seat 0's territories with an enemy beside it.
    assert!(matches!(
        decide(&g),
        Move::Place {
            territory: INDONESIA,
            ..
        }
    ));
}

#[test]
fn fortifies_toward_the_front() {
    let mut mine = australia(3, (1, 5));
    mine[3].2 = 10;
    let mut g = position(4, 5, &mine);
    g.phase = Phase::Fortify;
    let mv = decide(&g);
    assert!(
        matches!(
            mv,
            Move::Fortify {
                from: EASTERN_AUSTRALIA,
                to: INDONESIA,
                ..
            }
        ),
        "{mv:?}"
    );
}

/// Seat 0 has just taken `to` from `from`, 3 armies moved in and `left` behind.
fn occupying(from: u8, to: u8, left: i32, mine: &[(u8, Seat, i32)]) -> Game {
    let mut g = attacking(position(4, 5, mine));
    g.owner[to as usize] = 0;
    g.armies[to as usize] = 3;
    g.armies[from as usize] = left;
    g.recount_owned();
    g.captured_this_turn = true;
    g.occupying = Some(Occupying {
        from,
        to,
        min: 3,
        max: 3 + left - 1,
        eliminating: None,
    });
    g
}

#[test]
fn moves_in_to_the_front_and_no_further() {
    // New Guinea taken from Indonesia: New Guinea has no enemy beside it, Indonesia faces Siam.
    let mut mine = australia(1, (1, 5));
    mine[1].1 = 1;
    let g = occupying(INDONESIA, NEW_GUINEA, 9, &mine);
    assert_eq!(decide(&g), Move::Occupy { armies: 3 });
    // Indonesia taken from New Guinea: the front moves forward, and everything goes with it.
    let mut mine = australia(1, (1, 5));
    mine[0].1 = 1;
    let g = occupying(NEW_GUINEA, INDONESIA, 9, &mine);
    assert_eq!(decide(&g), Move::Occupy { armies: 11 });
}

/// Plays `seed` with `labels` seated, asking native-v1 every decision twice to check it answers
/// the same input the same way.
fn play_checked(seed: &str, labels: &[&str], max_turns: u32) -> GameRecord {
    let bots: Vec<Box<dyn Bot>> = labels.iter().map(|l| bot(l).unwrap()).collect();
    drive(
        seed,
        labels.len(),
        max_turns,
        |_, input| {
            let seat = input.seat as usize;
            let mv = bots[seat].decide(input);
            if labels[seat] == "native-v1" && bots[seat].decide(input) != mv {
                return Err(format!("seat {seat} answered one input two ways"));
            }
            Ok(mv)
        },
        |_| {},
    )
    .unwrap_or_else(|e| panic!("{seed} {labels:?}: {e}"))
}

/// Runs `jobs` on eight threads, each starting with empty memos, results in the jobs' order.
fn in_parallel<T: Send>(jobs: Vec<Box<dyn FnOnce() -> T + Send>>) -> Vec<T> {
    let count = jobs.len();
    let queue = std::sync::Mutex::new(jobs.into_iter().enumerate().collect::<Vec<_>>());
    let done = std::sync::Mutex::new(Vec::new());
    std::thread::scope(|scope| {
        for _ in 0..8.min(count) {
            scope.spawn(|| loop {
                let Some((i, job)) = queue.lock().unwrap().pop() else {
                    break;
                };
                let result = job();
                done.lock().unwrap().push((i, result));
            });
        }
    });
    let mut done = done.into_inner().unwrap();
    done.sort_by_key(|(i, _)| *i);
    done.into_iter().map(|(_, r)| r).collect()
}

#[test]
fn every_decision_is_legal_and_repeatable() {
    // Random seats make positions no planner would, and native-v1 in every seat plays its own;
    // an illegal move fails the game.
    let mut jobs: Vec<Box<dyn FnOnce() -> GameRecord + Send>> = Vec::new();
    for players in 3..=6usize {
        for n in 0..50 {
            jobs.push(Box::new(move || {
                let labels: Vec<&str> = (0..players)
                    .map(|s| {
                        if (s + n) % 2 == 0 {
                            "native-v1"
                        } else {
                            "random"
                        }
                    })
                    .collect();
                play_checked(&format!("legal-{players}-{n}"), &labels, 150)
            }));
        }
        for n in 0..4 {
            jobs.push(Box::new(move || {
                play_checked(
                    &format!("self-{players}-{n}"),
                    &vec!["native-v1"; players],
                    120,
                )
            }));
        }
    }
    let records = in_parallel(jobs);
    assert_eq!(records.len(), 216);
}

#[test]
fn a_game_replays_bit_for_bit_on_cold_and_warm_memos() {
    let labels = [
        "native-v1",
        "gd-stacker",
        "native-v1",
        "greedy",
        "gd-aggressive",
    ];
    let play = move || {
        let bots: Vec<Box<dyn Bot>> = labels.iter().map(|l| bot(l).unwrap()).collect();
        let seated: Vec<&dyn Bot> = bots.iter().map(|b| b.as_ref()).collect();
        play_game("replay", &seated, 200).unwrap()
    };
    let first = in_parallel(vec![
        Box::new(play) as Box<dyn FnOnce() -> GameRecord + Send>
    ]);
    let again = in_parallel(vec![Box::new(move || {
        // Warm this thread's memos on another game first.
        play();
        play()
    }) as Box<dyn FnOnce() -> GameRecord + Send>]);
    assert_eq!(first, again);
}

/// The lone seat's wins and the decisive games over `games` tables of `players`, the lone seat
/// rotated through every seat on each seed, as `risk-native games --rotate` seats them.
fn lone_wins(
    lone: &'static str,
    rest: &'static str,
    players: usize,
    games: usize,
) -> (usize, usize) {
    let jobs: Vec<Box<dyn FnOnce() -> (usize, usize) + Send>> = (0..8)
        .map(|worker| {
            Box::new(move || {
                let (mut wins, mut decided) = (0usize, 0usize);
                for k in (worker..games).step_by(8) {
                    let labels: Vec<&str> = (0..players)
                        .map(|s| if s == k % players { lone } else { rest })
                        .collect();
                    let bots: Vec<Box<dyn Bot>> = labels.iter().map(|l| bot(l).unwrap()).collect();
                    let seated: Vec<&dyn Bot> = bots.iter().map(|b| b.as_ref()).collect();
                    let record = play_game(&format!("floor-{}", k / players + 1), &seated, 600)
                        .unwrap_or_else(|e| panic!("{labels:?}: {e}"));
                    if let Some(w) = record.winner {
                        decided += 1;
                        wins += usize::from(w as usize == k % players);
                    }
                }
                (wins, decided)
            }) as Box<dyn FnOnce() -> (usize, usize) + Send>
        })
        .collect();
    in_parallel(jobs)
        .into_iter()
        .fold((0, 0), |(w, d), (w2, d2)| (w + w2, d + d2))
}

#[test]
fn wins_every_game_alone_among_random_bots() {
    for players in [3, 4, 6] {
        let (wins, decided) = lone_wins("native-v1", "random", players, 2 * players);
        assert_eq!(
            (wins, decided),
            (2 * players, 2 * players),
            "{players} players"
        );
    }
}

#[test]
fn wins_clearly_alone_among_greedy_bots() {
    for players in [3, 4, 6] {
        let (wins, decided) = lone_wins("native-v1", "greedy", players, 60);
        let share = wins as f64 / decided as f64;
        println!(
            "native-v1 alone among greedy at {players} players: {wins}/{decided} = {share:.2}"
        );
        assert!(share >= 0.7, "{players} players: {wins}/{decided}");
    }
}

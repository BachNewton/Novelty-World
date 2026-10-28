//! vulture-v1 (`ideas/vulture-v1.md`): each rule on a built position, legality and determinism in
//! whole games, and a sanity floor against random.

use risk_native::bot::{Bot, BotInput};
use risk_native::bots::bot;
use risk_native::engine::{
    new_game, Deck, Event, EventKind, Game, Hand, Move, Occupying, Phase, Reinforce, Seat,
    MAX_SEATS,
};
use risk_native::map::TERRITORY_COUNT;
use risk_native::runner::drive;

const ALBERTA: u8 = 3;
const VENEZUELA: u8 = 9;
const PERU: u8 = 10;
const BRAZIL: u8 = 11;
const ARGENTINA: u8 = 12;
const NORTH_AFRICA: u8 = 20;
const EGYPT: u8 = 21;
const EAST_AFRICA: u8 = 22;
const MADAGASCAR: u8 = 25;
const CHINA: u8 = 34;
const INDIA: u8 = 36;
const SIAM: u8 = 37;
const INDONESIA: u8 = 38;
const NEW_GUINEA: u8 = 39;
const WESTERN_AUSTRALIA: u8 = 40;
const EASTERN_AUSTRALIA: u8 = 41;

fn vulture() -> Box<dyn Bot> {
    bot("vulture-v1").expect("vulture-v1 is registered")
}

/// A position at `players` seats where seat 0 is to move: every territory dealt round seats 1 and
/// up with `armies` on it, then `mine` given to their owners. No hands, so no seat is a victim.
fn position(players: usize, armies: i32, mine: &[(u8, Seat, i32)]) -> Game {
    let (mut g, _) = new_game(players, "vulture-v1-scenario");
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

fn placing(mut g: Game, armies: i32) -> Game {
    g.phase = Phase::Reinforce;
    g.reinforce = Some(Reinforce {
        armies_to_place: armies,
        placed_any: false,
        after_elimination: false,
    });
    g
}

fn event(kind: EventKind) -> Event {
    Event { rule: "test", kind }
}

/// This turn's history: a set traded, and the captures named.
fn turn(traded: bool, captures: &[(u8, u8)]) -> Vec<Event> {
    let mut h = vec![event(EventKind::TurnStarted { seat: 0, turn: 20 })];
    if traded {
        h.push(event(EventKind::Traded {
            seat: 0,
            cards: [0, 1, 2],
            armies: 10,
            bonus: None,
        }));
    }
    for &(from, to) in captures {
        h.push(event(EventKind::Blitzed {
            from,
            to,
            attacker_losses: 0,
            defender_losses: 1,
        }));
        h.push(event(EventKind::Captured {
            seat: 0,
            territory: to,
            from: 1,
        }));
    }
    h
}

fn decide_after(g: &Game, history: &[Event]) -> Move {
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
    let view = g.view(Some(g.active), &[]);
    let options = g.options(g.active).expect("seat 0 is to move");
    let humans = vec![false; g.players as usize];
    let input = BotInput {
        seat: g.active,
        view: &view,
        options: &options,
        events: &[],
        history,
        humans: &humans,
        seed: "scenario",
    };
    let mv = vulture().decide(&input);
    assert_eq!(vulture().decide(&input), mv, "one input, one answer");
    assert!({ g }.apply(g.active, mv).is_ok(), "{mv:?} is illegal here");
    mv
}

fn decide(g: &Game) -> Move {
    decide_after(g, &turn(false, &[]))
}

fn target(mv: Move) -> Option<(u8, u8)> {
    match mv {
        Move::Blitz { from, to, .. } => Some((from, to)),
        _ => None,
    }
}

fn placed_on(mv: Move) -> Option<u8> {
    match mv {
        Move::Place { territory, .. } => Some(territory),
        _ => None,
    }
}

/// Seat 0 holds Australia, Siam held by `siam`.
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
fn trades_at_the_first_chance() {
    let mut g = placing(position(4, 5, &australia(12, (1, 5))), 3);
    // Alaska, Northwest Territory and Greenland: one of each, worth 10; a hand of 3 isn't forced.
    g.hands[0] = Hand::from_slice(&[0, 1, 2]);
    assert!(matches!(decide(&g), Move::Trade { .. }));
}

#[test]
fn the_guard_matches_the_biggest_enemy_beside_the_gate() {
    let g = placing(position(4, 5, &australia(3, (1, 8))), 7);
    assert_eq!(
        decide(&g),
        Move::Place {
            territory: INDONESIA,
            armies: 5
        }
    );
    // The guard is kept back from an attack, and from a march.
    let g = attacking(position(4, 5, &australia(10, (1, 8))));
    assert_eq!(decide(&g), Move::EndAttack);
}

#[test]
fn holding_no_base_it_goes_for_the_cheapest() {
    // Seat 0 holds Venezuela and Peru beside 5s in Brazil and Argentina, and Siam beside a whole
    // Australia of 1s: Australia's enemy land is the cheapest.
    let mut mine = vec![(VENEZUELA, 0, 3), (PERU, 0, 3), (SIAM, 0, 2), (INDIA, 0, 6)];
    for t in [INDONESIA, NEW_GUINEA, WESTERN_AUSTRALIA, EASTERN_AUSTRALIA] {
        mine.push((t, 1, 1));
    }
    let g = placing(position(5, 5, &mine), 4);
    assert_eq!(placed_on(decide(&g)), Some(SIAM));
    let mut g = attacking(position(5, 5, &mine));
    g.armies[SIAM as usize] = 6;
    assert_eq!(target(decide(&g)), Some((SIAM, INDONESIA)));
}

#[test]
fn a_wait_turn_places_beside_the_thinnest_enemy() {
    // Australia held and guarded; China is the one enemy of 1 beside seat 0's land.
    let mut mine = australia(6, (0, 4));
    mine.extend([(INDIA, 0, 2), (CHINA, 2, 1)]);
    let g = placing(position(5, 5, &mine), 5);
    let mv = decide(&g);
    assert!(
        placed_on(mv) == Some(SIAM) || placed_on(mv) == Some(INDIA),
        "{mv:?}"
    );
    let g = attacking(position(5, 5, &mine));
    assert_eq!(target(decide(&g)).map(|x| x.1), Some(CHINA));
}

#[test]
fn after_the_card_only_the_head_raids_and_only_ones() {
    // Seat 0 took China from Siam this turn; China holds 8 and faces 1s and 2s.
    let mut mine = australia(6, (0, 1));
    mine.push((CHINA, 0, 8));
    let mut g = attacking(position(5, 2, &mine));
    g.captured_this_turn = true;
    g.armies[INDIA as usize] = 1;
    let history = turn(false, &[(SIAM, CHINA)]);
    assert_eq!(target(decide_after(&g, &history)), Some((CHINA, INDIA)));
    // Below 7 the head stops, though it would take the 1 surely.
    g.armies[CHINA as usize] = 6;
    assert_eq!(decide_after(&g, &history), Move::EndAttack);
}

#[test]
fn a_sweep_turn_goes_on_through_more_than_ones() {
    let mut mine = australia(6, (0, 1));
    mine.push((CHINA, 0, 12));
    let mut g = attacking(position(5, 2, &mine));
    g.captured_this_turn = true;
    // Without a trade the head only raids ones, and there are none: the turn ends.
    assert_eq!(
        decide_after(&g, &turn(false, &[(SIAM, CHINA)])),
        Move::EndAttack
    );
    // With one it sweeps on through the 2s.
    let mv = decide_after(&g, &turn(true, &[(SIAM, CHINA)]));
    assert_eq!(target(mv).map(|x| x.0), Some(CHINA), "{mv:?}");
}

#[test]
fn kills_the_weakest_seat_for_its_cards() {
    // Seat 2 holds Madagascar alone, with cards; East Africa beside it holds 10.
    let mut g = position(5, 5, &[(EAST_AFRICA, 0, 10), (MADAGASCAR, 2, 2)]);
    for t in 0..TERRITORY_COUNT {
        if g.owner[t] == 2 && t != MADAGASCAR as usize {
            g.owner[t] = 3;
        }
    }
    g.recount_owned();
    g.hands[2] = Hand::from_slice(&[5, 6]);
    assert_eq!(placed_on(decide(&placing(g, 3))), Some(EAST_AFRICA));
    assert_eq!(
        target(decide(&attacking(g))),
        Some((EAST_AFRICA, MADAGASCAR))
    );
    // A seat with no cards isn't worth it: the turn takes its card from the thinnest instead.
    g.hands[2] = Hand::new();
    g.armies[EGYPT as usize] = 1;
    assert_eq!(target(decide(&attacking(g))), Some((EAST_AFRICA, EGYPT)));
}

#[test]
fn a_kill_uses_several_stacks() {
    // Seat 2 holds Venezuela and Argentina, not joined to each other; Brazil and Peru face them.
    let mut g = position(
        5,
        5,
        &[
            (BRAZIL, 0, 6),
            (PERU, 0, 6),
            (VENEZUELA, 2, 1),
            (ARGENTINA, 2, 1),
        ],
    );
    for t in 0..TERRITORY_COUNT {
        if g.owner[t] == 2 && t != VENEZUELA as usize && t != ARGENTINA as usize {
            g.owner[t] = 3;
        }
    }
    g.recount_owned();
    g.hands[2] = Hand::from_slice(&[5]);
    let mv = decide(&attacking(g));
    assert!(
        matches!(target(mv), Some((_, VENEZUELA | ARGENTINA))),
        "{mv:?}"
    );
}

#[test]
fn everything_moves_in_but_a_gates_guard() {
    let occupying = |from: u8, to: u8, left: i32, mine: &[(u8, Seat, i32)]| {
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
    };
    // China taken from India: everything goes.
    let g = occupying(INDIA, CHINA, 9, &[(INDIA, 0, 9), (CHINA, 1, 1)]);
    assert_eq!(decide(&g), Move::Occupy { armies: 11 });
    // Brazil taken from North Africa, Africa's gate: North Africa keeps a guard of 5 against
    // Western and Southern Europe.
    let mine: Vec<(u8, Seat, i32)> = (20..=25).map(|t| (t, 0, 1)).collect();
    let g = occupying(NORTH_AFRICA, BRAZIL, 9, &mine);
    assert_eq!(
        decide(&g),
        Move::Occupy {
            armies: 3 + 9 - 1 - 4
        }
    );
}

#[test]
fn marches_home_to_the_hub() {
    // Australia held, Western Australia holding 9 behind the lines, Siam seat 0's facing China. The
    // turn took Alberta, which can't reach home, so the pile behind the lines marches, to Siam: the
    // front nearest the base.
    let mut mine = australia(1, (0, 2));
    mine[2].2 = 9;
    mine.extend([(INDIA, 0, 3), (ALBERTA, 0, 5), (CHINA, 2, 5)]);
    let mut g = position(5, 5, &mine);
    g.phase = Phase::Fortify;
    let mv = decide_after(&g, &turn(false, &[(4, ALBERTA)]));
    assert_eq!(
        mv,
        Move::Fortify {
            from: WESTERN_AUSTRALIA,
            to: SIAM,
            armies: 8
        }
    );
}

/// Plays a game, every decision legal (the runner refuses any other) and asked twice.
fn play(seed: &str, labels: &[&str]) -> risk_native::runner::GameRecord {
    let bots: Vec<Box<dyn Bot>> = labels.iter().map(|l| bot(l).unwrap()).collect();
    drive(
        seed,
        labels.len(),
        600,
        |_, input| {
            let seat = input.seat as usize;
            let mv = bots[seat].decide(input);
            if labels[seat] == "vulture-v1" && bots[seat].decide(input) != mv {
                return Err(format!("seat {seat} answered one input two ways"));
            }
            Ok(mv)
        },
        |_| {},
    )
    .unwrap_or_else(|e| panic!("{seed} {labels:?}: {e}"))
}

#[test]
fn plays_whole_games_legally_and_the_same_each_time() {
    for (i, labels) in [
        &[
            "vulture-v1",
            "greedy",
            "gd-stacker",
            "gd-defensive",
            "native-v1",
        ][..],
        &["vulture-v1"; 4][..],
        &[
            "gd-aggressive",
            "vulture-v1",
            "vulture-v1",
            "greedy",
            "gd-continental",
            "vulture-v1",
        ][..],
    ]
    .iter()
    .enumerate()
    {
        let seed = format!("vulture-{i}");
        let first = play(&seed, labels);
        assert_eq!(first, play(&seed, labels), "the same game twice");
    }
}

#[test]
fn crushes_random() {
    let mut wins = 0;
    for i in 0..6 {
        let mut labels = vec!["random"; 3];
        labels[i % 3] = "vulture-v1";
        let r = play(&format!("vulture-random-{i}"), &labels);
        wins += u32::from(r.winner == Some((i % 3) as Seat));
    }
    assert_eq!(wins, 6);
}

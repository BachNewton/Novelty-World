//! The rules suite: a test per rule and edge case of `RULES.md`, each named for the rule it proves.

use risk_native::blitz::resolve_blitz;
use risk_native::cards::{is_valid_set, set_value, sets_in, Card, FULL_DECK, WILD_1, WILD_2};
use risk_native::engine::{
    first_turn_bonus, fortify_destinations, invariants, new_game, pair_dice, redact,
    reinforcements, starting_armies, Deck, Event, EventKind, Game, Hand, Move, Options, Phase,
    Reinforce, Territory, Trade,
};
use risk_native::map::{territories_in, Symbol, ADJACENCY, CONTINENT_MASKS, TERRITORIES};
use risk_native::rng::Rng;

// ---------------------------------------------------------------------------------------------
// The kit: territories by name, positions built by hand, and random streams found for dice.
// ---------------------------------------------------------------------------------------------

fn t(id: &str) -> Territory {
    TERRITORIES
        .iter()
        .position(|x| x.id == id)
        .unwrap_or_else(|| panic!("no territory {id}")) as Territory
}

/// A position mid-game: every territory `rest`'s, then `holdings` on top; seat order 0, 1, 2…,
/// seat 0 in its attack phase of a later round, empty hands and the deck in its fixed order.
fn board(players: usize, rest: (u8, i32), holdings: &[(&str, u8, i32)]) -> Game {
    let (mut g, _) = new_game(players, "rules-kit");
    g.owner = [rest.0; 42];
    g.armies = [rest.1; 42];
    for &(id, seat, armies) in holdings {
        g.owner[t(id) as usize] = seat;
        g.armies[t(id) as usize] = armies;
    }
    g.recount_owned();
    g.turn_order = [0, 1, 2, 3, 4, 5];
    g.hands = [Hand::new(); 6];
    g.deck = Deck::from_slice(&FULL_DECK);
    g.trades = 0;
    for seat in 0..6 {
        g.eliminated[seat] = seat < players && g.owned[seat] == 0;
    }
    g.turn = 10;
    g.round = 2;
    g.active = 0;
    g.phase = Phase::Attack;
    g.reinforce = None;
    g.occupying = None;
    g.captured_this_turn = false;
    g.winner = None;
    g
}

fn in_reinforce(mut g: Game, armies: i32) -> Game {
    g.phase = Phase::Reinforce;
    g.reinforce = Some(Reinforce {
        armies_to_place: armies,
        placed_any: false,
        after_elimination: false,
    });
    g
}

/// Moves `cards` from the deck into `seat`'s hand, keeping the 44 conserved.
fn deal(g: &mut Game, seat: u8, cards: &[Card]) {
    for &card in cards {
        let at = g
            .deck
            .iter()
            .position(|&c| c == card)
            .expect("card in the deck");
        g.deck.remove(at);
        g.hands[seat as usize].push(card);
    }
}

fn die(rng: &mut Rng) -> u8 {
    1 + (rng.next() * 6.0).floor() as u8
}

/// A random-source state whose next draws, as dice, are `dice` in order.
fn rolling(dice: &[u8]) -> u32 {
    (1u32..)
        .find(|&s| {
            let mut rng = Rng::from_state(s);
            dice.iter().all(|&d| die(&mut rng) == d)
        })
        .unwrap()
}

/// A random-source state whose first draw satisfies `wanted`.
fn drawing(wanted: impl Fn(f64) -> bool) -> u32 {
    (1u32..)
        .find(|&s| wanted(Rng::from_state(s).next()))
        .unwrap()
}

fn kinds(events: &[Event]) -> Vec<&EventKind> {
    events.iter().map(|e| &e.kind).collect()
}

fn ok(g: &mut Game, mv: Move) -> Vec<Event> {
    let before = *g;
    let events = g
        .apply(g.active, mv)
        .unwrap_or_else(|e| panic!("{mv:?} refused: {e}"));
    invariants::check_step(&before, &events, g).unwrap_or_else(|e| panic!("after {mv:?}: {e}"));
    events
}

fn refused(g: &Game, mv: Move) {
    let mut copy = *g;
    assert!(copy.apply(g.active, mv).is_err(), "{mv:?} was accepted");
    assert_eq!(copy, *g, "a refused move changed the game");
}

fn attack_options(g: &Game) -> Vec<(u8, u8, u8)> {
    match g.options(g.active) {
        Some(Options::Attack(a)) => a
            .attacks
            .iter()
            .map(|a| (a.from, a.to, a.max_dice))
            .collect(),
        other => panic!("not an attack phase: {other:?}"),
    }
}

// ---------------------------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------------------------

#[test]
fn setup_1_starting_armies_by_player_count() {
    assert_eq!([3, 4, 5, 6].map(starting_armies), [35, 30, 25, 20]);
    for players in 3..=6 {
        for seed in ["a", "b", "seed-3"] {
            let (g, _) = new_game(players, seed);
            for seat in 0..players as u8 {
                assert_eq!(
                    g.army_count(seat),
                    starting_armies(players),
                    "{players}p {seed} seat {seat}"
                );
            }
        }
    }
}

#[test]
#[should_panic(expected = "3 to 6 players")]
fn setup_1_no_two_player_game() {
    new_game(2, "x");
}

#[test]
fn setup_3_seat_order_is_a_random_permutation() {
    let mut firsts = [0; 4];
    for i in 0..200 {
        let (g, events) = new_game(4, &format!("order-{i}"));
        let mut order = g.turn_order().to_vec();
        assert_eq!(events[0].rule, "SETUP-3");
        assert_eq!(
            events[0].kind,
            EventKind::TurnOrder {
                order: risk_native::list::List::from_slice(&order)
            }
        );
        order.sort();
        assert_eq!(order, [0, 1, 2, 3]);
        assert_eq!(g.active, g.turn_order[0]);
        firsts[g.turn_order[0] as usize] += 1;
    }
    assert!(
        firsts.iter().all(|&n| n > 25),
        "every seat goes first sometimes: {firsts:?}"
    );
}

#[test]
fn setup_4_deal_counts_follow_the_rotation() {
    let expected: [&[u32]; 4] = [&[14, 14, 14], &[11, 11, 10, 10], &[9, 9, 8, 8, 8], &[7; 6]];
    for players in 3..=6 {
        let (g, events) = new_game(players, "deal");
        let counts: Vec<u32> = g
            .turn_order()
            .iter()
            .map(|&s| g.territory_count(s))
            .collect();
        assert_eq!(counts, expected[players - 3]);
        let EventKind::Dealt { owners } = &events[1].kind else {
            panic!()
        };
        assert_eq!(
            **owners, g.owner,
            "SETUP-4: the dealt owners are the board's"
        );
    }
}

#[test]
fn setup_5_starting_armies_placed_on_own_territories() {
    let (g, events) = new_game(5, "place");
    let EventKind::StartingArmies { armies } = &events[2].kind else {
        panic!()
    };
    assert_eq!(**armies, g.armies);
    assert!(g.armies.iter().all(|&a| a >= 1));
}

#[test]
fn setup_6_and_9_the_deck_holds_all_44_and_hands_are_empty() {
    let (g, events) = new_game(3, "deck");
    let mut deck = g.deck.to_vec();
    deck.sort();
    assert_eq!(deck, FULL_DECK);
    assert!(g.hands.iter().all(|h| h.is_empty()));
    assert_eq!(events[3].kind, EventKind::DeckReshuffled);
    invariants::check_state(&g).unwrap();
}

#[test]
fn setup_7_first_player_reinforces_first() {
    let (g, events) = new_game(4, "first");
    assert_eq!((g.turn, g.round, g.phase), (1, 0, Phase::Reinforce));
    let first = g.turn_order[0];
    assert_eq!(events[4].rule, "SETUP-7");
    assert_eq!(
        events[4].kind,
        EventKind::TurnStarted {
            seat: first,
            turn: 1
        }
    );
    let earned = reinforcements(g.owned[first as usize]);
    assert_eq!(g.reinforce.unwrap().armies_to_place, earned.total);
    assert_eq!(
        events.last().unwrap().kind,
        EventKind::Phase {
            phase: Phase::Reinforce
        }
    );
}

#[test]
fn inv_10_a_seed_replays_identically() {
    assert_eq!(new_game(6, "same"), new_game(6, "same"));
    assert_ne!(new_game(6, "same").0, new_game(6, "other").0);
}

// ---------------------------------------------------------------------------------------------
// Reinforcement
// ---------------------------------------------------------------------------------------------

fn first_n(n: usize) -> u64 {
    // Territories spread so no continent is whole until it must be.
    let order: Vec<usize> = (0..42).map(|i| (i * 5) % 42).collect();
    order[..n].iter().fold(0, |m, &t| m | 1 << t)
}

#[test]
fn reinf_2_territory_armies() {
    for (n, expected) in [(0, 3), (8, 3), (9, 3), (11, 3), (14, 4), (17, 5), (30, 10)] {
        let own = first_n(n);
        let continents: i32 = reinforcements(own)
            .from_continents
            .iter()
            .map(|c| c.bonus)
            .sum();
        assert_eq!(
            reinforcements(own).from_territories,
            expected,
            "{n} territories"
        );
        assert_eq!(reinforcements(own).total, expected + continents);
    }
}

#[test]
fn reinf_3_continent_bonuses_stack() {
    let bonuses = [5, 2, 5, 3, 7, 2];
    for (c, &mask) in CONTINENT_MASKS.iter().enumerate() {
        let r = reinforcements(mask);
        assert_eq!(r.from_continents.len(), 1);
        assert_eq!(r.from_continents[0].bonus, bonuses[c]);
        assert_eq!(r.total, 3.max(mask.count_ones() as i32 / 3) + bonuses[c]);
    }
    let na_au = CONTINENT_MASKS[0] | CONTINENT_MASKS[5];
    assert_eq!(reinforcements(na_au).total, 4 + 5 + 2);
    let almost = CONTINENT_MASKS[4] & !(1 << t("japan"));
    assert!(reinforcements(almost).from_continents.is_empty());
}

#[test]
fn reinf_6_first_turn_bonus_table() {
    let table: [&[i32]; 4] = [
        &[0, 0, 1],
        &[0, 0, 0, 1],
        &[0, 0, 0, 1, 2],
        &[0, 0, 0, 1, 2, 3],
    ];
    for players in 3..=6 {
        let got: Vec<i32> = (0..players).map(|p| first_turn_bonus(players, p)).collect();
        assert_eq!(got, table[players - 3]);
    }
}

#[test]
fn reinf_6_bonus_only_in_the_first_round() {
    let (mut g, _) = new_game(6, "bonus");
    let mut seen = Vec::new();
    while g.round < 2 {
        let seat = g.active;
        let mv = match g.options(seat).unwrap() {
            Options::Reinforce(r) if r.must_trade => Move::Trade {
                cards: r.sets[0],
                bonus: r
                    .bonus_territories
                    .iter()
                    .copied()
                    .find(|&b| r.sets[0].contains(&b)),
            },
            Options::Reinforce(r) => Move::Place {
                territory: r.own_territories().next().unwrap(),
                armies: r.armies_to_place,
            },
            Options::Attack(_) => Move::EndAttack,
            Options::Occupy { min, .. } => Move::Occupy { armies: min },
            Options::Fortify(_) => Move::EndTurn,
        };
        for e in g.apply(seat, mv).unwrap() {
            if let EventKind::Reinforcements {
                seat,
                first_turn_bonus,
                ..
            } = e.kind
            {
                seen.push((g.round, g.position(seat), first_turn_bonus));
            }
        }
    }
    for (round, position, bonus) in seen {
        let expected = if round == 0 {
            first_turn_bonus(6, position)
        } else {
            0
        };
        assert_eq!(bonus, expected, "round {round}, position {position}");
    }
}

#[test]
fn reinf_5_placement_on_own_territories_only() {
    let g = in_reinforce(
        board(
            3,
            (1, 1),
            &[("alaska", 0, 1), ("peru", 0, 2), ("ural", 2, 1)],
        ),
        5,
    );
    refused(
        &g,
        Move::Place {
            territory: t("ural"),
            armies: 1,
        },
    );
    refused(
        &g,
        Move::Place {
            territory: t("alaska"),
            armies: 0,
        },
    );
    refused(
        &g,
        Move::Place {
            territory: t("alaska"),
            armies: 6,
        },
    );
    refused(
        &g,
        Move::Place {
            territory: 42,
            armies: 1,
        },
    );
    let mut g = g;
    ok(
        &mut g,
        Move::Place {
            territory: t("alaska"),
            armies: 2,
        },
    );
    assert_eq!(
        (
            g.phase,
            g.reinforce.unwrap().armies_to_place,
            g.armies[t("alaska") as usize]
        ),
        (Phase::Reinforce, 3, 3)
    );
    let events = ok(
        &mut g,
        Move::Place {
            territory: t("peru"),
            armies: 3,
        },
    );
    assert_eq!(g.phase, Phase::Attack);
    assert_eq!(
        events.last().unwrap().kind,
        EventKind::Phase {
            phase: Phase::Attack
        }
    );
}

#[test]
fn reinf_1_no_battle_before_every_army_is_placed() {
    let g = in_reinforce(
        board(3, (1, 1), &[("alaska", 0, 5), ("kamchatka", 2, 1)]),
        3,
    );
    refused(
        &g,
        Move::Attack {
            from: t("alaska"),
            to: t("kamchatka"),
            dice: 1,
        },
    );
    refused(
        &g,
        Move::Blitz {
            from: t("alaska"),
            to: t("kamchatka"),
            keep_at_least: 1,
        },
    );
    refused(&g, Move::EndAttack);
    refused(&g, Move::EndTurn);
}

// ---------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------

fn of(symbol: Symbol) -> Vec<Card> {
    (0..42u8)
        .filter(|&c| TERRITORIES[c as usize].symbol == symbol)
        .collect()
}

#[test]
fn deck_2_symbol_counts() {
    assert_eq!(
        [
            of(Symbol::Infantry).len(),
            of(Symbol::Cavalry).len(),
            of(Symbol::Artillery).len()
        ],
        [13, 14, 15]
    );
}

#[test]
fn cards_3_valid_sets_including_two_wilds() {
    let (i, c, a) = (
        of(Symbol::Infantry),
        of(Symbol::Cavalry),
        of(Symbol::Artillery),
    );
    assert!(is_valid_set(&[i[0], i[1], i[2]]));
    assert!(is_valid_set(&[i[0], c[0], a[0]]));
    assert!(is_valid_set(&[i[0], c[0], WILD_1]));
    assert!(is_valid_set(&[a[0], a[1], WILD_2]));
    assert!(
        is_valid_set(&[WILD_1, WILD_2, c[3]]),
        "note two-wilds: a set may hold both wilds"
    );
    assert!(!is_valid_set(&[i[0], i[1], c[0]]));
    assert!(!is_valid_set(&[i[0], i[1]]));
}

#[test]
fn cards_4_every_hand_of_five_holds_a_set() {
    let reps = [
        of(Symbol::Infantry),
        of(Symbol::Cavalry),
        of(Symbol::Artillery),
    ];
    for wilds in 0..=2usize {
        for inf in 0..=5 - wilds {
            for cav in 0..=5 - wilds - inf {
                let art = 5 - wilds - inf - cav;
                let mut hand: Vec<Card> = Vec::new();
                hand.extend(&reps[0][..inf]);
                hand.extend(&reps[1][..cav]);
                hand.extend(&reps[2][..art]);
                hand.extend(&[WILD_1, WILD_2][..wilds]);
                assert!(
                    !sets_in(&hand).is_empty(),
                    "{inf} infantry, {cav} cavalry, {art} artillery, {wilds} wilds"
                );
            }
        }
    }
}

#[test]
fn cards_6_fixed_values() {
    let (i, c, a) = (
        of(Symbol::Infantry),
        of(Symbol::Cavalry),
        of(Symbol::Artillery),
    );
    assert_eq!(set_value(&[i[0], i[1], i[2]]), 4);
    assert_eq!(set_value(&[c[0], c[1], c[2]]), 6);
    assert_eq!(set_value(&[a[0], a[1], a[2]]), 8);
    assert_eq!(set_value(&[i[0], c[0], a[0]]), 10);
    assert_eq!(
        set_value(&[a[0], WILD_1, a[1]]),
        8,
        "a wild with two of a symbol is its three of a kind"
    );
    assert_eq!(set_value(&[i[0], WILD_1, i[1]]), 4);
    assert_eq!(
        set_value(&[i[0], WILD_1, c[1]]),
        10,
        "a wild with two symbols is one of each"
    );
    assert_eq!(
        set_value(&[WILD_1, WILD_2, i[0]]),
        10,
        "two wilds make one of each"
    );
}

/// Seat 0 in its reinforce phase owning everything but Argentina, holding `hand`.
fn trading(hand: &[Card], placed_any: bool) -> Game {
    let mut g = in_reinforce(board(3, (0, 1), &[("argentina", 1, 1), ("ural", 2, 1)]), 3);
    deal(&mut g, 0, hand);
    g.reinforce.as_mut().unwrap().placed_any = placed_any;
    g
}

#[test]
fn cards_5_trade_before_placing_only() {
    let set = [WILD_1, WILD_2, t("argentina")];
    let mut g = trading(&set, false);
    let Some(Options::Reinforce(r)) = g.options(0) else {
        panic!()
    };
    assert_eq!((r.may_place, r.must_trade, r.sets.len()), (true, false, 1));
    ok(
        &mut g,
        Move::Place {
            territory: t("alaska"),
            armies: 1,
        },
    );
    refused(
        &g,
        Move::Trade {
            cards: set,
            bonus: None,
        },
    );
    let Some(Options::Reinforce(r)) = g.options(0) else {
        panic!()
    };
    assert!(r.sets.is_empty(), "no sets are offered once placing began");
}

#[test]
fn cards_5_five_cards_force_a_trade() {
    let (i, c) = (of(Symbol::Infantry), of(Symbol::Cavalry));
    let hand = [i[0], i[1], i[2], c[0], c[1]];
    let mut g = trading(&hand, false);
    let Some(Options::Reinforce(r)) = g.options(0) else {
        panic!()
    };
    assert_eq!((r.may_place, r.must_trade), (false, true));
    refused(
        &g,
        Move::Place {
            territory: t("alaska"),
            armies: 1,
        },
    );
    let set = [i[0], i[1], i[2]];
    let bonus = Some(i[0]);
    let events = ok(&mut g, Move::Trade { cards: set, bonus });
    assert_eq!(events[0].rule, "CARDS-5");
    assert_eq!(g.reinforce.unwrap().armies_to_place, 3 + 4);
    let Some(Options::Reinforce(r)) = g.options(0) else {
        panic!()
    };
    assert_eq!((r.may_place, r.must_trade), (true, false));
}

#[test]
fn cards_5_trade_needs_three_different_cards_in_hand_forming_a_set() {
    let (i, c) = (of(Symbol::Infantry), of(Symbol::Cavalry));
    let g = trading(&[i[0], i[1], c[0], c[1]], false);
    refused(
        &g,
        Move::Trade {
            cards: [i[0], i[0], i[1]],
            bonus: None,
        },
    );
    refused(
        &g,
        Move::Trade {
            cards: [i[0], i[1], i[2]],
            bonus: None,
        },
    );
    refused(
        &g,
        Move::Trade {
            cards: [i[0], i[1], c[0]],
            bonus: None,
        },
    );
    refused(
        &g,
        Move::Trade {
            cards: [i[0], i[1], 44],
            bonus: None,
        },
    );
}

#[test]
fn cards_7_bonus_on_the_one_owned_pictured_territory() {
    let (i, c) = (of(Symbol::Infantry), of(Symbol::Cavalry));
    // Argentina is cavalry and seat 1's: the only owned pictured territory is the infantry one.
    let set = [i[0], t("argentina"), WILD_1];
    assert!(c.contains(&t("argentina")));
    let mut g = trading(&set, false);
    let before = g.armies[i[0] as usize];
    let events = ok(
        &mut g,
        Move::Trade {
            cards: set,
            bonus: None,
        },
    );
    let EventKind::Traded { bonus, armies, .. } = events[0].kind else {
        panic!()
    };
    assert_eq!(armies, 10);
    assert_eq!(bonus.map(|b| (b.territory, b.armies)), Some((i[0], 2)));
    assert_eq!(g.armies[i[0] as usize], before + 2);
}

#[test]
fn cards_7_several_qualifying_needs_a_choice() {
    let i = of(Symbol::Infantry);
    let set = [i[0], i[1], i[2]];
    let g = trading(&set, false);
    let Some(Options::Reinforce(r)) = g.options(0) else {
        panic!()
    };
    assert_eq!(
        r.bonus_territories.as_slice(),
        &set,
        "bonus territories in hand order"
    );
    refused(
        &g,
        Move::Trade {
            cards: set,
            bonus: None,
        },
    );
    refused(
        &g,
        Move::Trade {
            cards: set,
            bonus: Some(t("argentina")),
        },
    );
    let mut g = g;
    let events = ok(
        &mut g,
        Move::Trade {
            cards: set,
            bonus: Some(i[1]),
        },
    );
    let EventKind::Traded { bonus, .. } = events[0].kind else {
        panic!()
    };
    assert_eq!(bonus.unwrap().territory, i[1]);
    let total: i32 = g.armies.iter().sum();
    assert_eq!(
        total,
        42 + 2,
        "INV-7: 2 armies, once per set, on one territory"
    );
}

#[test]
fn cards_7_wilds_and_unowned_territories_never_qualify() {
    let set = [WILD_1, WILD_2, t("argentina")];
    let mut g = trading(&set, false);
    refused(
        &g,
        Move::Trade {
            cards: set,
            bonus: Some(t("argentina")),
        },
    );
    let events = ok(
        &mut g,
        Move::Trade {
            cards: set,
            bonus: None,
        },
    );
    let EventKind::Traded { bonus, .. } = events[0].kind else {
        panic!()
    };
    assert_eq!(bonus, None);
}

#[test]
fn cards_8_traded_cards_go_below_the_top_three() {
    let i = of(Symbol::Infantry);
    let set = [WILD_1, i[0], t("argentina")];
    for seed in 0..50 {
        let mut g = trading(&set, false);
        g.rng = seed * 7919 + 1;
        let top: Vec<Card> = g.deck[..3].to_vec();
        ok(
            &mut g,
            Move::Trade {
                cards: set,
                bonus: None,
            },
        );
        assert_eq!(&g.deck[..3], top.as_slice());
        assert!(set
            .iter()
            .all(|c| g.deck.iter().position(|d| d == c).unwrap() >= 3));
    }
}

#[test]
fn cards_8_a_small_deck_takes_them_anywhere() {
    let set = [WILD_1, WILD_2, t("argentina")];
    let mut g = trading(&set, false);
    g.deck = Deck::from_slice(&[t("peru"), t("brazil")]);
    // With 2 cards the first returns at floor(r × 3): r < 1/3 puts it on top.
    g.rng = drawing(|r| r < 1.0 / 3.0);
    let mut rng = Rng::from_state(g.rng);
    rng.next();
    let second = (rng.next() * 4.0).floor() as usize;
    g.apply(
        0,
        Move::Trade {
            cards: set,
            bonus: None,
        },
    )
    .unwrap();
    let expected_first_spot = if second == 0 { 1 } else { 0 };
    assert_eq!(g.deck[expected_first_spot], WILD_1);
    assert_eq!(g.deck[second], WILD_2);
}

#[test]
fn cards_1_a_card_only_after_a_capture() {
    let mut g = board(
        3,
        (1, 1),
        &[("alaska", 0, 3), ("kamchatka", 0, 3), ("ural", 2, 1)],
    );
    g.phase = Phase::Fortify;
    let top = g.deck[0];
    ok(&mut g, Move::EndTurn);
    assert!(g.hands[0].is_empty(), "no capture, no card");
    assert_eq!(g.deck[0], top);

    let mut g = board(
        3,
        (1, 1),
        &[("alaska", 0, 3), ("kamchatka", 0, 3), ("ural", 2, 1)],
    );
    g.phase = Phase::Fortify;
    g.captured_this_turn = true;
    let events = ok(&mut g, Move::EndTurn);
    assert_eq!(g.hands[0].as_slice(), &[top]);
    assert!(events.iter().any(|e| e.kind
        == EventKind::CardDrawn {
            seat: 0,
            card: Some(top)
        }));

    let mut g = board(
        3,
        (1, 1),
        &[("alaska", 0, 3), ("kamchatka", 0, 3), ("ural", 2, 1)],
    );
    g.phase = Phase::Fortify;
    g.captured_this_turn = true;
    let all: Vec<Card> = g.deck.to_vec();
    g.deck.clear();
    g.hands[1] = Hand::from_slice(&all[..12]);
    let events = g.apply(0, Move::EndTurn).unwrap();
    assert!(
        g.hands[0].is_empty(),
        "CARDS-8: an empty deck draws nothing"
    );
    assert!(!events
        .iter()
        .any(|e| matches!(e.kind, EventKind::CardDrawn { .. })));
}

// ---------------------------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------------------------

#[test]
fn combat_1_legal_attacks_only() {
    let g = board(
        3,
        (1, 1),
        &[
            ("alaska", 0, 4),
            ("alberta", 0, 1),
            ("northwest-territory", 0, 2),
            ("greenland", 2, 1),
        ],
    );
    let mut expected = vec![(t("alaska"), t("kamchatka"), 3)];
    expected.extend([
        (t("northwest-territory"), t("ontario"), 1),
        (t("northwest-territory"), t("greenland"), 1),
    ]);
    assert_eq!(
        attack_options(&g),
        expected,
        "canonical edge order, own and one-army territories skipped"
    );
    refused(
        &g,
        Move::Attack {
            from: t("alberta"),
            to: t("ontario"),
            dice: 1,
        },
    );
    refused(
        &g,
        Move::Attack {
            from: t("alaska"),
            to: t("alberta"),
            dice: 1,
        },
    );
    refused(
        &g,
        Move::Attack {
            from: t("alaska"),
            to: t("ontario"),
            dice: 1,
        },
    );
    refused(
        &g,
        Move::Attack {
            from: t("kamchatka"),
            to: t("alaska"),
            dice: 1,
        },
    );
    refused(
        &g,
        Move::Attack {
            from: 42,
            to: t("alaska"),
            dice: 1,
        },
    );
}

#[test]
fn combat_2_dice_bounds() {
    for (armies, max) in [(2, 1), (3, 2), (4, 3), (40, 3)] {
        let g = board(3, (1, 5), &[("alaska", 0, armies), ("ural", 2, 1)]);
        assert_eq!(g.max_dice(t("alaska"), t("kamchatka")), Some(max));
        refused(
            &g,
            Move::Attack {
                from: t("alaska"),
                to: t("kamchatka"),
                dice: 0,
            },
        );
        refused(
            &g,
            Move::Attack {
                from: t("alaska"),
                to: t("kamchatka"),
                dice: max + 1,
            },
        );
        let mut g = g;
        ok(
            &mut g,
            Move::Attack {
                from: t("alaska"),
                to: t("kamchatka"),
                dice: max,
            },
        );
    }
}

#[test]
fn combat_3_defender_rolls_the_most_dice() {
    for (defenders, dice) in [(1, 1), (2, 2), (9, 2)] {
        let mut g = board(
            3,
            (1, 5),
            &[
                ("alaska", 0, 10),
                ("kamchatka", 1, defenders),
                ("ural", 2, 1),
            ],
        );
        let events = ok(
            &mut g,
            Move::Attack {
                from: t("alaska"),
                to: t("kamchatka"),
                dice: 1,
            },
        );
        let EventKind::Battle {
            defender_dice,
            attacker_dice,
            ..
        } = &events[0].kind
        else {
            panic!()
        };
        assert_eq!((attacker_dice.len(), defender_dice.len()), (1, dice));
    }
}

#[test]
fn combat_4_pairing_and_ties() {
    assert_eq!(
        pair_dice(&[6, 3, 1], &[6, 2]),
        (1, 1),
        "a tie goes to the defender"
    );
    assert_eq!(
        pair_dice(&[6, 6, 6], &[1]),
        (0, 1),
        "unpaired dice are ignored"
    );
    assert_eq!(
        pair_dice(&[2], &[5, 1]),
        (1, 0),
        "the defender's spare die is ignored"
    );
    assert_eq!(pair_dice(&[4, 4], &[4, 3]), (1, 1));
    assert_eq!(pair_dice(&[5, 4, 2], &[4, 3]), (0, 2));
}

#[test]
fn combat_4_dice_drawn_attacker_first_and_sorted() {
    let mut g = board(
        3,
        (1, 5),
        &[("alaska", 0, 10), ("kamchatka", 1, 5), ("ural", 2, 1)],
    );
    // Attacker 2, 6, 4 then defender 5, 6: sorted 6 4 2 against 6 5, both pairs to the defender.
    g.rng = rolling(&[2, 6, 4, 5, 6]);
    let events = ok(
        &mut g,
        Move::Attack {
            from: t("alaska"),
            to: t("kamchatka"),
            dice: 3,
        },
    );
    let EventKind::Battle {
        attacker_dice,
        defender_dice,
        attacker_losses,
        defender_losses,
        ..
    } = &events[0].kind
    else {
        panic!()
    };
    assert_eq!(
        (attacker_dice.as_slice(), defender_dice.as_slice()),
        (&[6, 4, 2][..], &[6, 5][..])
    );
    assert_eq!((*attacker_losses, *defender_losses), (2, 0));
    assert_eq!(
        (
            g.armies[t("alaska") as usize],
            g.armies[t("kamchatka") as usize]
        ),
        (8, 5)
    );
}

#[test]
fn combat_5_a_failed_battle_keeps_the_attack_phase() {
    let mut g = board(
        3,
        (1, 5),
        &[("alaska", 0, 10), ("kamchatka", 1, 5), ("ural", 2, 1)],
    );
    g.rng = rolling(&[1, 6]);
    ok(
        &mut g,
        Move::Attack {
            from: t("alaska"),
            to: t("kamchatka"),
            dice: 1,
        },
    );
    assert_eq!(g.phase, Phase::Attack);
    ok(
        &mut g,
        Move::Attack {
            from: t("alaska"),
            to: t("kamchatka"),
            dice: 3,
        },
    );
}

#[test]
fn combat_6_capture_moves_in_at_least_the_dice() {
    let mut g = board(
        3,
        (1, 5),
        &[("alaska", 0, 10), ("kamchatka", 1, 1), ("ural", 2, 1)],
    );
    g.rng = rolling(&[6, 6, 6, 1]);
    let events = ok(
        &mut g,
        Move::Attack {
            from: t("alaska"),
            to: t("kamchatka"),
            dice: 3,
        },
    );
    assert!(kinds(&events).contains(&&EventKind::Captured {
        seat: 0,
        territory: t("kamchatka"),
        from: 1
    }));
    assert_eq!(
        g.options(0),
        Some(Options::Occupy {
            from: t("alaska"),
            to: t("kamchatka"),
            min: 3,
            max: 9
        })
    );
    assert_eq!(
        (
            g.armies[t("alaska") as usize],
            g.armies[t("kamchatka") as usize]
        ),
        (7, 3),
        "INV-1: the minimum moved in with the capture"
    );
    assert!(g.captured_this_turn);
    refused(&g, Move::Occupy { armies: 2 });
    refused(&g, Move::Occupy { armies: 10 });
    refused(
        &g,
        Move::Attack {
            from: t("alaska"),
            to: t("alberta"),
            dice: 1,
        },
    );
    refused(&g, Move::EndAttack);
    ok(&mut g, Move::Occupy { armies: 9 });
    assert_eq!(
        (
            g.armies[t("alaska") as usize],
            g.armies[t("kamchatka") as usize]
        ),
        (1, 9)
    );
}

#[test]
fn combat_6_forced_move_in_when_min_is_max() {
    let mut g = board(
        3,
        (1, 5),
        &[("alaska", 0, 3), ("kamchatka", 1, 1), ("ural", 2, 1)],
    );
    g.rng = rolling(&[6, 6, 1]);
    let events = ok(
        &mut g,
        Move::Attack {
            from: t("alaska"),
            to: t("kamchatka"),
            dice: 2,
        },
    );
    assert!(kinds(&events).contains(&&EventKind::Occupied {
        from: t("alaska"),
        to: t("kamchatka"),
        armies: 2
    }));
    assert_eq!(g.occupying, None);
    assert_eq!(
        (
            g.armies[t("alaska") as usize],
            g.armies[t("kamchatka") as usize]
        ),
        (1, 2)
    );
}

#[test]
fn combat_7_a_captured_territory_attacks_on() {
    let mut g = board(
        3,
        (1, 5),
        &[("alaska", 0, 10), ("kamchatka", 1, 1), ("ural", 2, 1)],
    );
    g.rng = rolling(&[6, 1]);
    ok(
        &mut g,
        Move::Attack {
            from: t("alaska"),
            to: t("kamchatka"),
            dice: 1,
        },
    );
    ok(&mut g, Move::Occupy { armies: 5 });
    assert!(attack_options(&g)
        .iter()
        .any(|&(from, to, _)| from == t("kamchatka") && to == t("japan")));
}

#[test]
fn combat_8_blitz_resolves_by_balanced_blitz() {
    for seed in 0..40u32 {
        let mut g = board(
            3,
            (1, 5),
            &[("alaska", 0, 12), ("kamchatka", 1, 6), ("ural", 2, 1)],
        );
        g.rng = seed * 104729 + 3;
        let mut rng = Rng::from_state(g.rng);
        let draw = rng.next();
        let expected = resolve_blitz(9, 6, draw, &mut || rng.next());
        let events = ok(
            &mut g,
            Move::Blitz {
                from: t("alaska"),
                to: t("kamchatka"),
                keep_at_least: 3,
            },
        );
        assert_eq!(
            events[0].kind,
            EventKind::Blitzed {
                from: t("alaska"),
                to: t("kamchatka"),
                attacker_losses: expected.attacker_losses as i32,
                defender_losses: expected.defender_losses as i32
            }
        );
        if expected.defender_losses == 6 {
            let left = 12 - expected.attacker_losses as i32;
            let min = 3.min(left - 1); // 9 attackers: the 3 binds first
            assert_eq!(
                g.armies[t("kamchatka") as usize],
                min,
                "a blitz moves in at least 3, or all that can"
            );
            if min < left - 1 {
                assert_eq!(
                    g.options(0),
                    Some(Options::Occupy {
                        from: t("alaska"),
                        to: t("kamchatka"),
                        min,
                        max: left - 1
                    })
                );
            }
        } else {
            assert_eq!(
                g.armies[t("alaska") as usize],
                3,
                "a failed blitz stops at the number kept"
            );
        }
    }
}

#[test]
fn combat_8_blitz_move_in_minimum_counts_only_the_attackers() {
    // Two attackers that capture move in at least 2, not 3.
    let mut found = false;
    for seed in 1..2000u32 {
        let mut g = board(
            3,
            (1, 5),
            &[("alaska", 0, 10), ("kamchatka", 1, 1), ("ural", 2, 1)],
        );
        g.rng = seed;
        ok(
            &mut g,
            Move::Blitz {
                from: t("alaska"),
                to: t("kamchatka"),
                keep_at_least: 8,
            },
        );
        if g.owner[t("kamchatka") as usize] == 0 {
            assert_eq!(g.occupying.unwrap().min, 2);
            found = true;
            break;
        }
    }
    assert!(found);
}

#[test]
fn combat_8_keep_bounds() {
    let g = board(3, (1, 5), &[("alaska", 0, 6), ("ural", 2, 1)]);
    refused(
        &g,
        Move::Blitz {
            from: t("alaska"),
            to: t("kamchatka"),
            keep_at_least: 0,
        },
    );
    refused(
        &g,
        Move::Blitz {
            from: t("alaska"),
            to: t("kamchatka"),
            keep_at_least: 6,
        },
    );
    refused(
        &g,
        Move::Blitz {
            from: t("alaska"),
            to: t("ontario"),
            keep_at_least: 1,
        },
    );
    let mut g = g;
    ok(
        &mut g,
        Move::Blitz {
            from: t("alaska"),
            to: t("kamchatka"),
            keep_at_least: 5,
        },
    );
}

// ---------------------------------------------------------------------------------------------
// Elimination and winning
// ---------------------------------------------------------------------------------------------

/// Seat 0 everywhere but Eastern Australia (seat 1's last, 1 army) and Argentina (seat 2's),
/// attacking from Western Australia; seat 1 holds `loser_cards`, seat 0 `own_cards`.
fn about_to_eliminate(own_cards: &[Card], loser_cards: &[Card]) -> Game {
    let mut g = board(
        3,
        (0, 1),
        &[
            ("eastern-australia", 1, 1),
            ("argentina", 2, 1),
            ("western-australia", 0, 10),
            ("brazil", 0, 3),
        ],
    );
    deal(&mut g, 0, own_cards);
    deal(&mut g, 1, loser_cards);
    g.rng = rolling(&[6, 1]);
    g
}

#[test]
fn elim_1_2_the_elimination_waits_for_the_move_in() {
    let mut g = about_to_eliminate(&[t("peru")], &[t("japan"), WILD_1]);
    let events = ok(
        &mut g,
        Move::Attack {
            from: t("western-australia"),
            to: t("eastern-australia"),
            dice: 1,
        },
    );
    assert!(!kinds(&events)
        .iter()
        .any(|k| matches!(k, EventKind::Eliminated { .. })));
    assert_eq!(g.occupying.unwrap().eliminating, Some(1));
    assert!(
        !g.eliminated[1],
        "the eliminating seat stays until the move-in"
    );
    assert_eq!(g.hands[1].len(), 2);
    let events = ok(&mut g, Move::Occupy { armies: 4 });
    let tail: Vec<&EventKind> = kinds(&events);
    assert_eq!(
        tail[0],
        &EventKind::Occupied {
            from: t("western-australia"),
            to: t("eastern-australia"),
            armies: 4
        }
    );
    assert_eq!(
        tail[1],
        &EventKind::Eliminated {
            seat: 1,
            by: 0,
            cards_taken: 2
        }
    );
    assert!(g.eliminated[1]);
    assert_eq!(
        g.hands[0].as_slice(),
        &[t("peru"), t("japan"), WILD_1],
        "ELIM-2: every card to the capturer"
    );
    assert_eq!(g.phase, Phase::Attack, "ELIM-3: 4 or fewer cards, no trade");
}

#[test]
fn elim_3_five_cards_force_a_trade_mid_attack() {
    let (i, c) = (of(Symbol::Infantry), of(Symbol::Cavalry));
    let mut g = about_to_eliminate(&[i[0], i[1]], &[i[2], c[0], c[1]]);
    ok(
        &mut g,
        Move::Attack {
            from: t("western-australia"),
            to: t("eastern-australia"),
            dice: 1,
        },
    );
    let events = ok(&mut g, Move::Occupy { armies: 1 });
    assert_eq!(events.last().unwrap().rule, "ELIM-3");
    assert_eq!(g.phase, Phase::Reinforce);
    assert_eq!(
        g.reinforce,
        Some(Reinforce {
            armies_to_place: 0,
            placed_any: false,
            after_elimination: true
        })
    );
    let Some(Options::Reinforce(r)) = g.options(0) else {
        panic!()
    };
    assert!(r.must_trade && !r.may_place);
    refused(
        &g,
        Move::Place {
            territory: t("alaska"),
            armies: 1,
        },
    );
    refused(
        &g,
        Move::Attack {
            from: t("western-australia"),
            to: t("eastern-australia"),
            dice: 1,
        },
    );
    let events = ok(
        &mut g,
        Move::Trade {
            cards: [i[0], i[1], i[2]],
            bonus: Some(i[0]),
        },
    );
    assert_eq!(events[0].rule, "ELIM-3");
    assert_eq!(g.hands[0].len(), 2);
    let Some(Options::Reinforce(r)) = g.options(0) else {
        panic!()
    };
    assert!(
        r.sets.is_empty() && r.may_place,
        "trading stops as soon as the hand holds 4 or fewer"
    );
    let events = ok(
        &mut g,
        Move::Place {
            territory: t("alaska"),
            armies: 4,
        },
    );
    assert_eq!(events[0].rule, "ELIM-3");
    assert_eq!(g.phase, Phase::Attack, "then the attack goes on");
}

#[test]
fn elim_3_eight_cards_trade_twice() {
    let (i, c, a) = (
        of(Symbol::Infantry),
        of(Symbol::Cavalry),
        of(Symbol::Artillery),
    );
    let mut g = about_to_eliminate(&[i[0], i[1], i[2], i[3]], &[c[0], c[1], c[2], a[0]]);
    ok(
        &mut g,
        Move::Attack {
            from: t("western-australia"),
            to: t("eastern-australia"),
            dice: 1,
        },
    );
    ok(&mut g, Move::Occupy { armies: 1 });
    ok(
        &mut g,
        Move::Trade {
            cards: [i[0], i[1], i[2]],
            bonus: Some(i[0]),
        },
    );
    let Some(Options::Reinforce(r)) = g.options(0) else {
        panic!()
    };
    assert!(r.must_trade, "5 cards left: trade again");
    ok(
        &mut g,
        Move::Trade {
            cards: [c[0], c[1], c[2]],
            bonus: Some(c[0]),
        },
    );
    assert_eq!(g.hands[0].len(), 2);
    assert_eq!(g.reinforce.unwrap().armies_to_place, 10);
}

#[test]
fn elim_4_a_drawn_fifth_card_waits_for_the_next_turn() {
    let (i, c) = (of(Symbol::Infantry), of(Symbol::Cavalry));
    let mut g = board(
        3,
        (1, 5),
        &[("alaska", 0, 3), ("kamchatka", 0, 3), ("ural", 2, 1)],
    );
    deal(&mut g, 0, &[i[0], i[1], c[0], c[1]]);
    g.phase = Phase::Fortify;
    g.captured_this_turn = true;
    ok(&mut g, Move::EndTurn);
    assert_eq!(g.hands[0].len(), 5);
    assert_ne!(g.active, 0);
    // Round to seat 0 again.
    while g.active != 0 {
        let seat = g.active;
        let mv = match g.options(seat).unwrap() {
            Options::Reinforce(r) => Move::Place {
                territory: r.own_territories().next().unwrap(),
                armies: r.armies_to_place,
            },
            Options::Attack(_) => Move::EndAttack,
            _ => Move::EndTurn,
        };
        ok(&mut g, mv);
    }
    let Some(Options::Reinforce(r)) = g.options(0) else {
        panic!()
    };
    assert!(r.must_trade);
}

#[test]
fn win_1_the_last_capture_ends_the_game_at_once() {
    let mut g = board(
        3,
        (0, 1),
        &[("eastern-australia", 1, 1), ("western-australia", 0, 10)],
    );
    g.eliminated[2] = true;
    deal(&mut g, 1, &[t("japan")]);
    g.rng = rolling(&[6, 6, 6, 1]);
    let events = ok(
        &mut g,
        Move::Attack {
            from: t("western-australia"),
            to: t("eastern-australia"),
            dice: 3,
        },
    );
    assert_eq!(
        (g.phase, g.winner, g.occupying),
        (Phase::GameOver, Some(0), None)
    );
    assert_eq!(
        events.last().unwrap().kind,
        EventKind::GameOver { winner: 0 }
    );
    assert!(kinds(&events).contains(&&EventKind::Eliminated {
        seat: 1,
        by: 0,
        cards_taken: 1
    }));
    assert!(!kinds(&events)
        .iter()
        .any(|k| matches!(k, EventKind::CardDrawn { .. } | EventKind::Occupied { .. })));
    assert_eq!(
        g.armies[t("eastern-australia") as usize],
        3,
        "the dice's armies stand in it"
    );
    assert_eq!(g.options(0), None);
    refused(&g, Move::EndAttack);
    refused(&g, Move::Occupy { armies: 3 });
}

// ---------------------------------------------------------------------------------------------
// Fortify and the turn
// ---------------------------------------------------------------------------------------------

#[test]
fn fort_1_reach_through_own_territories_only() {
    // Seat 0 holds the chain Alaska, Alberta, Ontario, Quebec, and Peru cut off from it.
    let mut g = board(
        3,
        (1, 1),
        &[
            ("alaska", 0, 5),
            ("alberta", 0, 1),
            ("ontario", 0, 1),
            ("quebec", 0, 1),
            ("peru", 0, 4),
            ("ural", 2, 1),
        ],
    );
    g.phase = Phase::Fortify;
    let own = g.owned[0];
    let reach = fortify_destinations(own, t("alaska"));
    assert_eq!(reach.as_slice(), &[t("alberta"), t("ontario"), t("quebec")]);
    let Some(Options::Fortify(f)) = g.options(0) else {
        panic!()
    };
    let moves: Vec<(u8, u8, i32)> = f.moves().map(|m| (m.from, m.to, m.max_armies)).collect();
    assert_eq!(
        moves,
        vec![
            (t("alaska"), t("alberta"), 4),
            (t("alaska"), t("ontario"), 4),
            (t("alaska"), t("quebec"), 4)
        ]
    );
    refused(
        &g,
        Move::Fortify {
            from: t("alaska"),
            to: t("peru"),
            armies: 1,
        },
    );
    refused(
        &g,
        Move::Fortify {
            from: t("alaska"),
            to: t("alaska"),
            armies: 1,
        },
    );
    refused(
        &g,
        Move::Fortify {
            from: t("alaska"),
            to: t("quebec"),
            armies: 5,
        },
    );
    refused(
        &g,
        Move::Fortify {
            from: t("alaska"),
            to: t("quebec"),
            armies: 0,
        },
    );
    refused(
        &g,
        Move::Fortify {
            from: t("kamchatka"),
            to: t("japan"),
            armies: 0,
        },
    );
    let events = ok(
        &mut g,
        Move::Fortify {
            from: t("alaska"),
            to: t("quebec"),
            armies: 4,
        },
    );
    assert_eq!(
        events[0].kind,
        EventKind::Fortified {
            from: t("alaska"),
            to: t("quebec"),
            armies: 4
        }
    );
    assert_eq!(g.active, 1, "FORT-3: one move, then the turn ends");
}

#[test]
fn fort_forced_end_when_nothing_can_move() {
    let mut g = board(3, (1, 1), &[("alaska", 0, 5), ("ural", 2, 1)]);
    g.phase = Phase::Attack;
    g.rng = rolling(&[1, 6]);
    // Alaska alone, so no fortify; a failed attack leaves attacks, then ending skips the fortify.
    ok(
        &mut g,
        Move::Attack {
            from: t("alaska"),
            to: t("kamchatka"),
            dice: 1,
        },
    );
    let events = ok(&mut g, Move::EndAttack);
    assert!(kinds(&events).contains(&&EventKind::Phase {
        phase: Phase::Fortify
    }));
    assert_eq!(g.active, 1, "a fortify phase with no move ends the turn");
}

#[test]
fn turn_forced_end_of_attack_with_no_battle() {
    let mut g = in_reinforce(
        board(
            3,
            (1, 1),
            &[("alaska", 0, 1), ("alberta", 0, 1), ("ural", 2, 1)],
        ),
        1,
    );
    let events = ok(
        &mut g,
        Move::Place {
            territory: t("alberta"),
            armies: 1,
        },
    );
    // Alberta (2) can attack Ontario, so the attack phase waits.
    assert_eq!(g.phase, Phase::Attack, "{events:?}");
    let mut g = in_reinforce(board(3, (0, 1), &[("ural", 1, 1), ("argentina", 2, 1)]), 1);
    ok(
        &mut g,
        Move::Place {
            territory: t("japan"),
            armies: 1,
        },
    );
    assert_eq!(
        (g.phase, g.active),
        (Phase::Fortify, 0),
        "no battle to fight: on to a fortify that can move"
    );
}

#[test]
fn turn_1_phases_in_order() {
    let mut g = in_reinforce(
        board(
            3,
            (1, 1),
            &[("alaska", 0, 3), ("alberta", 0, 1), ("ural", 2, 1)],
        ),
        3,
    );
    refused(
        &g,
        Move::Fortify {
            from: t("alaska"),
            to: t("alberta"),
            armies: 1,
        },
    );
    ok(
        &mut g,
        Move::Place {
            territory: t("alaska"),
            armies: 3,
        },
    );
    assert_eq!(g.phase, Phase::Attack);
    refused(
        &g,
        Move::Place {
            territory: t("alaska"),
            armies: 1,
        },
    );
    refused(
        &g,
        Move::Fortify {
            from: t("alaska"),
            to: t("alberta"),
            armies: 1,
        },
    );
    ok(&mut g, Move::EndAttack);
    assert_eq!(g.phase, Phase::Fortify);
    refused(
        &g,
        Move::Attack {
            from: t("alaska"),
            to: t("kamchatka"),
            dice: 1,
        },
    );
    refused(&g, Move::EndAttack);
}

#[test]
fn turn_2_rotation_skips_the_eliminated_and_counts_rounds() {
    let mut g = board(4, (0, 1), &[("ural", 2, 1), ("argentina", 3, 1)]);
    g.turn_order = [3, 0, 1, 2, 0, 0];
    assert!(g.eliminated[1]);
    g.active = 0;
    g.phase = Phase::Fortify;
    g.armies = [1; 42];
    ok(&mut g, Move::EndTurn);
    assert_eq!(
        (g.active, g.round, g.turn),
        (2, 2, 11),
        "seat 1 is out: seat 2 next, same round"
    );
    let mut g2 = g;
    g2.phase = Phase::Fortify;
    g2.reinforce = None;
    let events = ok(&mut g2, Move::EndTurn);
    assert_eq!(
        (g2.active, g2.round, g2.turn),
        (3, 3, 12),
        "wrapping round to the first seat starts a round"
    );
    assert_eq!(events[0].rule, "TURN-2");
}

// ---------------------------------------------------------------------------------------------
// The view and the history
// ---------------------------------------------------------------------------------------------

#[test]
fn cards_2_a_view_shows_only_its_own_hand() {
    let mut g = board(3, (1, 1), &[("alaska", 0, 3), ("ural", 2, 1)]);
    deal(&mut g, 0, &[t("peru")]);
    deal(&mut g, 1, &[t("japan"), WILD_1]);
    g.trades = 1;
    let traded = [Trade {
        seat: 2,
        cards: [t("egypt"), t("congo"), WILD_2],
    }];
    let v = g.view(Some(1), &traded);
    assert_eq!(v.hand.unwrap().as_slice(), &[t("japan"), WILD_1]);
    assert_eq!(v.seats[0].hand_size, 1);
    assert_eq!(v.deck, 41);
    assert_eq!(v.traded, traded);
    assert_eq!(g.view(None, &traded).hand, None);
    assert_eq!(v.seats[0].territories, 1);
}

#[test]
fn redact_hides_others_drawn_cards() {
    let events = vec![Event {
        rule: "CARDS-1",
        kind: EventKind::CardDrawn {
            seat: 1,
            card: Some(7),
        },
    }];
    assert_eq!(redact(&events, Some(1)), events);
    assert_eq!(
        redact(&events, Some(0))[0].kind,
        EventKind::CardDrawn {
            seat: 1,
            card: None
        }
    );
    assert_eq!(
        redact(&events, None)[0].kind,
        EventKind::CardDrawn {
            seat: 1,
            card: None
        }
    );
}

#[test]
fn map_3_adjacency_is_symmetric_with_83_pairs() {
    let mut pairs = 0;
    for (a, neighbours) in ADJACENCY.iter().enumerate() {
        for &b in neighbours.iter() {
            assert!(ADJACENCY[b].contains(&a));
            assert_ne!(a, b);
            pairs += 1;
        }
    }
    assert_eq!(pairs, 166);
    assert_eq!(
        territories_in(risk_native::map::ALL_TERRITORIES).count(),
        42
    );
    assert_eq!(
        risk_native::map::component(risk_native::map::ALL_TERRITORIES, 0),
        risk_native::map::ALL_TERRITORIES
    );
}

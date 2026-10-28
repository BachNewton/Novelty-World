use super::*;
use crate::bots::bot;
use crate::engine::View;
use crate::runner::{drive, play_game};

fn v2(knobs: Knobs) -> NativeV2 {
    NativeV2::new(knobs)
}

/// A small budget, so a test game takes moments.
const SMALL: Knobs = Knobs {
    replies: 2,
    candidates: 3,
    ..Knobs::BASELINE
};

#[test]
fn with_no_replies_it_plays_v6_1s_moves() {
    let none = v2(Knobs {
        replies: 0,
        ..Knobs::BASELINE
    });
    let base = NativeV1 { params: V6_1 };
    let others = [bot("greedy").unwrap(), bot("gd-aggressive").unwrap()];
    let mut asked = 0;
    drive(
        "v2-parity",
        5,
        120,
        |_, input| {
            if input.seat == 0 {
                let mv = none.decide(input);
                assert_eq!(mv, base.decide(input));
                asked += 1;
                Ok(mv)
            } else {
                Ok(others[input.seat as usize % 2].decide(input))
            }
        },
        |_| {},
    )
    .unwrap();
    assert!(asked > 50);
}

#[test]
fn plays_whole_games_legally_at_every_table_size() {
    for players in [3, 5] {
        let me = v2(SMALL);
        let field = [bot("greedy").unwrap(), bot("gd-aggressive").unwrap()];
        let mut seated: Vec<&dyn Bot> = vec![&me];
        for s in 1..players {
            seated.push(field[s % 2].as_ref());
        }
        let game = play_game(&format!("v2-smoke-{players}"), &seated, 150).unwrap();
        assert!(game.decisions > 100);
    }
}

/// Every placement of a phase rebuilds the same search from its own view and history, so a fresh
/// bot (no memo) at a later placement places what the plan said.
#[test]
fn a_later_placement_rebuilds_the_same_search() {
    let me = v2(SMALL);
    let field = [bot("greedy").unwrap(), bot("gd-stacker").unwrap()];
    let mut later = 0;
    drive(
        "v2-rebuild",
        4,
        80,
        |_, input| {
            if input.seat != 0 {
                return Ok(field[input.seat as usize % 2].decide(input));
            }
            let mv = me.decide(input);
            if let (Options::Reinforce(_), Some(point)) =
                (input.options, search_point(input.view, input.history))
            {
                if point.placed.iter().any(|&a| a > 0) {
                    search::forget();
                    assert_eq!(v2(SMALL).decide(input), mv);
                    later += 1;
                }
            }
            Ok(mv)
        },
        |_| {},
    )
    .unwrap();
    assert!(later > 0);
}

#[test]
fn the_same_position_gives_the_same_move() {
    let a = v2(SMALL);
    let field = [bot("greedy").unwrap(), bot("gd-aggressive").unwrap()];
    let mut searched = 0;
    drive(
        "v2-determinism",
        5,
        60,
        |_, input| {
            if input.seat != 2 {
                return Ok(field[input.seat as usize % 2].decide(input));
            }
            let mv = a.decide(input);
            if matches!(input.options, Options::Reinforce(r) if r.may_place) {
                search::forget();
                assert_eq!(v2(SMALL).decide(input), mv);
                searched += 1;
            }
            Ok(mv)
        },
        |_| {},
    )
    .unwrap();
    assert!(searched > 0);
}

#[test]
fn the_registry_seats_it_and_its_tuned_labels() {
    assert!(crate::bots::labels().any(|l| l == "native-v2"));
    assert!(bot("native-v2").is_some());
    assert!(bot(r#"native-v2~{"replies":4,"margin":2}"#).is_some());
}

#[test]
fn margin_keeps_the_base_plan_on_noise_and_leaves_it_on_evidence() {
    // Candidate 1 is better on average but only on noise; candidate 2 beats the base every time.
    let scores = Scores {
        by_reply: vec![
            vec![0.30, 0.60, 0.32],
            vec![0.30, 0.10, 0.33],
            vec![0.30, 0.55, 0.31],
            vec![0.30, 0.16, 0.32],
        ],
    };
    assert_eq!(scores.best(3), 1);
    assert_eq!(scores.best_by_margin(3, 2.0), 2);
    let noise = Scores {
        by_reply: vec![
            vec![0.3, 0.6],
            vec![0.3, 0.1],
            vec![0.3, 0.55],
            vec![0.3, 0.16],
        ],
    };
    assert_eq!(noise.best(2), 1);
    assert_eq!(noise.best_by_margin(2, 2.0), 0);
}

/// Every switch on, a person's seat at the table: whole games stay legal.
#[test]
fn every_switch_on_plays_legally_beside_a_person() {
    let all = Knobs {
        replies: 2,
        candidates: 3,
        execute: 1,
        kinds: 1,
        margin: 1.0,
        feed: 1.0,
        humans: 1,
        threat: 1,
        hoard: 1,
        ..Knobs::BASELINE
    };
    let me = v2(all);
    let field = [bot("greedy").unwrap(), bot("gd-aggressive").unwrap()];
    let humans = [false, true, false, false, false];
    let game = crate::runner::drive_seated(
        "v2-all-switches",
        &humans,
        150,
        |_, input| {
            Ok(if input.seat == 0 {
                me.decide(input)
            } else {
                field[input.seat as usize % 2].decide(input)
            })
        },
        |_| {},
    )
    .unwrap();
    assert!(game.decisions > 100);
}

/// `execute` rebuilds the turn's search point at every decision after the placements: it is the
/// one the placement searched from, view and history alike.
#[test]
fn the_turn_point_is_the_placements_search_point() {
    let field = [bot("greedy").unwrap(), bot("gd-aggressive").unwrap()];
    let me = v2(SMALL);
    let mut point: Option<(View, usize)> = None;
    let mut checked = 0;
    drive(
        "v2-turn-point",
        4,
        120,
        |_, input| {
            if input.seat != 1 {
                return Ok(field[input.seat as usize % 2].decide(input));
            }
            if let Some(p) = search_point(input.view, input.history) {
                if p.placed.iter().all(|&a| a == 0)
                    && matches!(input.options, Options::Reinforce(r) if r.may_place)
                {
                    point = Some((p.view.clone(), p.history.len()));
                }
            }
            if matches!(
                input.options,
                Options::Attack(_) | Options::Occupy { .. } | Options::Fortify(_)
            ) {
                if let Some(rebuilt) = turn::turn_point(input.view, input.history) {
                    assert_eq!(Some(&rebuilt), point.as_ref());
                    checked += 1;
                }
            }
            Ok(me.decide(input))
        },
        |_| {},
    )
    .unwrap();
    assert!(checked > 30);
}

// -------------------------------------------------------------------------------------------
// The positions from real games each switch must change (`ideas/native-v2.md`): tests that a
// switch does what it says, not evidence that it wins. The games are `fixtures/online/`.
// -------------------------------------------------------------------------------------------

struct At {
    view: View,
    options: Options,
    history: Vec<crate::engine::Event>,
    humans: Vec<bool>,
}

impl At {
    fn input(&self) -> BotInput<'_> {
        BotInput {
            seat: self.view.active,
            view: &self.view,
            options: &self.options,
            events: &[],
            history: &self.history,
            humans: &self.humans,
            seed: "probe",
        }
    }
}

/// The game just before decision `at`, as the seat to answer it sees it.
fn at(game: &str, decision: u32) -> At {
    let path = format!("{}/fixtures/online/{game}.json", env!("CARGO_MANIFEST_DIR"));
    let log = crate::decide::read_online_log(std::path::Path::new(&path)).unwrap();
    let humans: Vec<bool> = log
        .labels
        .iter()
        .map(|l| !crate::decide::is_bot_label(l))
        .collect();
    let mut found = None;
    let _ = crate::runner::drive_seated(
        &log.seed,
        &humans,
        100_000,
        |d, input| {
            if d == decision {
                found = Some(At {
                    view: input.view.clone(),
                    options: *input.options,
                    history: input.history.to_vec(),
                    humans: humans.clone(),
                });
                return Err("found".into());
            }
            log.moves[d as usize].mv.to_move()
        },
        |_| {},
    );
    found.unwrap_or_else(|| panic!("{game} has no decision {decision}"))
}

fn decided(knobs: Knobs, at: &At) -> Move {
    search::forget();
    v2(knobs).decide(&at.input())
}

fn with(f: impl FnOnce(&mut Knobs)) -> Knobs {
    let mut k = Knobs::BASELINE;
    f(&mut k);
    k
}

fn occupied(mv: Move) -> i32 {
    match mv {
        Move::Occupy { armies } => armies,
        other => panic!("not a move-in: {other:?}"),
    }
}

/// YMS9 d380: a sure sweep into Africa, and the move-in left 27 of 32 behind.
#[test]
fn execute_moves_in_what_the_sweep_needs_yms9_d380() {
    let p = at("yms9", 380);
    assert_eq!(occupied(decided(Knobs::BASELINE, &p)), 5);
    assert!(occupied(decided(with(|k| k.execute = 1), &p)) >= 12);
}

/// CZ7U d584: a 7-territory sweep at 100% from 38, the move-in the minimum 3.
#[test]
fn execute_carries_the_planned_sweep_on_cz7u_d584() {
    let p = at("cz7u", 584);
    assert_eq!(occupied(decided(Knobs::BASELINE, &p)), 3);
    assert!(occupied(decided(with(|k| k.execute = 1), &p)) >= 20);
}

fn placed_on(mv: Move) -> usize {
    match mv {
        Move::Place { territory, .. } => territory as usize,
        other => panic!("not a placement: {other:?}"),
    }
}

const WESTERN_US: usize = 6;

/// The game from `from` to the end of that seat's turn with `knobs` playing it: the captures it
/// made, and the board as the next seat finds it.
fn play_turn(game: &str, from: u32, knobs: Knobs) -> (usize, Board) {
    let path = format!("{}/fixtures/online/{game}.json", env!("CARGO_MANIFEST_DIR"));
    let log = crate::decide::read_online_log(std::path::Path::new(&path)).unwrap();
    let humans: Vec<bool> = log
        .labels
        .iter()
        .map(|l| !crate::decide::is_bot_label(l))
        .collect();
    search::forget();
    let me = v2(knobs);
    let mut seat = None;
    let mut captures = 0;
    let mut after = None;
    let _ = crate::runner::drive_seated(
        &log.seed,
        &humans,
        100_000,
        |d, input| {
            if d < from {
                return log.moves[d as usize].mv.to_move();
            }
            if *seat.get_or_insert(input.seat) != input.seat {
                after = Some(Board::from_view(input.view));
                return Err("the turn is over".into());
            }
            captures += input
                .events
                .iter()
                .filter(|e| matches!(e.kind, crate::engine::EventKind::Captured { .. }))
                .count();
            Ok(me.decide(input))
        },
        |_| {},
    );
    (captures, after.expect("the turn ends"))
}

const BOT_KILLER: u8 = 0;
const S2: u8 = 2;
const S3: u8 = 3;

/// Bot Killer's chance of killing S2 on the board S3 leaves, with his 11 armies to place.
fn s2_killable(b: &Board) -> f64 {
    let scan = crate::bots::native_v1::board::Scan::new(b);
    crate::bots::native_v1::routes::kill_chance(b, &scan, BOT_KILLER, S2, 11)
}

/// 9PYK turn 32 (from d291, after its trade): one planned capture became ten through S2, leaving
/// S2 killable by Bot Killer at 0.95. Carried out, the plan's capture is made, and nothing beyond
/// it that doesn't score better with the feed charge.
#[test]
fn execute_keeps_to_the_plan_on_9pyk_turn_32() {
    let (base, left) = play_turn("9pyk", 291, Knobs::BASELINE);
    let (carried, kept) = play_turn("9pyk", 291, with(|k| k.execute = 1));
    assert!(base >= 6, "{base}");
    assert!(carried <= 2, "{carried}");
    assert!(s2_killable(&kept) < s2_killable(&left) - 0.3);
}

/// 9PYK d290 to d308: the board S3 left gives Bot Killer S2's four cards and a forced trade. The
/// feed charge prices that kill against S3's standing, and with `execute` (whose test of a capture
/// beyond the plan carries the same charge) S3 leaves S2 standing.
#[test]
fn feed_charges_the_kill_it_opens_9pyk_turn_32() {
    let (_, left) = play_turn("9pyk", 291, Knobs::BASELINE);
    let gains = leaf::fed(&left, S3, V6_1.prefs.income_horizon, 0);
    assert!(gains[BOT_KILLER as usize] > 10.0, "{gains:?}");
    let judge = judge_for(&V6_1, &left, S3, &[]);
    let scale = Scale {
        me: S3,
        prefs: judge.prefs,
        om: judge.om,
        settings: V6_1.knobs,
        hoard: false,
        smooth: false,
    };
    assert!(leaf::fed_standing(&left, &scale, 1.0, 0.0, 0) < leaf::standing(&left, &scale) - 0.01);
    let (_, fed) = play_turn(
        "9pyk",
        291,
        with(|k| {
            k.execute = 1;
            k.feed = 1.0
        }),
    );
    assert!(s2_killable(&fed) < 0.3, "{}", s2_killable(&fed));
}

/// CZ7U d353: the pick flips from v6.1's at 32 replies; on a margin of two standard errors it
/// stays v6.1's.
#[test]
fn margin_keeps_v6_1s_pick_on_noise_cz7u_d353() {
    let p = at("cz7u", 353);
    let base = placed_on(decided(with(|k| k.replies = 0), &p));
    assert_ne!(placed_on(decided(with(|k| k.replies = 32), &p)), base);
    let held = with(|k| {
        k.replies = 32;
        k.margin = 2.0
    });
    assert_eq!(placed_on(decided(held, &p)), base);
}

fn candidate_targets(knobs: Knobs, p: &At) -> Vec<Vec<usize>> {
    let me = v2(knobs);
    let input = p.input();
    let point = search_point(input.view, input.history).unwrap();
    let (plans, _) = me.candidates_at(&point, input.seat, me.extra(&input));
    plans
        .iter()
        .map(|plan| {
            plan.capture
                .as_ref()
                .map(|cp| cp.routes.iter().flat_map(|r| r.path.clone()).collect())
                .unwrap_or_default()
        })
        .collect()
}

/// CZ7U d557: a 96% sweep through the runaway leader that the search never played whole. Under
/// `kinds` with `execute` the sweep is a candidate of its own, and the choice changes.
#[test]
fn kinds_searches_the_sweep_through_the_leader_cz7u_d557() {
    let p = at("cz7u", 557);
    let k = with(|k| {
        k.kinds = 1;
        k.execute = 1
    });
    assert!(candidate_targets(k, &p).iter().any(|t| t.len() >= 10));
    assert_ne!(decided(k, &p), decided(Knobs::BASELINE, &p));
}

/// YMS9 d349: stopped short of the leader's Australia. Under `kinds` a way into it (Siam, then
/// Indonesia) is a candidate.
#[test]
fn kinds_searches_a_break_of_the_leaders_continent_yms9_d349() {
    let p = at("yms9", 349);
    let australia = crate::map::CONTINENT_MASKS[crate::map::AUSTRALIA];
    let breaks = |k: Knobs| {
        candidate_targets(k, &p)
            .iter()
            .any(|t| t.iter().any(|&x| australia & 1 << x != 0))
    };
    assert!(!breaks(Knobs::BASELINE));
    assert!(breaks(with(|k| {
        k.kinds = 1;
        k.execute = 1
    })));
}

/// YMS9 turn 61 (d493 to d521): S4 went all in on a kill and left itself spread over 30
/// territories, biggest stack 3, beside Bot Killer's 14; v6 believed Bot Killer's sweep would take
/// 29 of them, yet rated S4's survival certain. Under `humans` the person's kill counts several
/// stacks, so the board S4 leaves (d521) is believed deadly; and the turn's choice of plan at d494
/// changes.
#[test]
fn humans_believes_the_persons_kill_yms9_turn_61() {
    use crate::bots::native_v1::board::Scan;
    use crate::bots::native_v1::opponents::forecast;
    let p = at("yms9", 521);
    let input = p.input();
    let b = Board::from_view(input.view);
    let me = input.seat;
    let spared = |judge: &Judge| {
        forecast(
            &b,
            &Scan::new(&b),
            me,
            &judge.prefs,
            &judge.om,
            &judge.record,
            &judge.knobs,
            &judge.extra,
        )
        .spared[me as usize]
    };
    let off = judge_for(&V6_1, &b, me, input.history);
    let bold = v2(with(|k| k.humans = 1)).extra(&input);
    let on = judge_for(&V6_1, &b, me, input.history).with_extra(bold);
    assert!(spared(&off) > 0.9, "{}", spared(&off));
    assert!(
        spared(&on) < spared(&off) - 0.15,
        "{} against {}",
        spared(&on),
        spared(&off)
    );
    let start = at("yms9", 494);
    assert_ne!(
        decided(with(|k| k.humans = 1), &start),
        decided(Knobs::BASELINE, &start)
    );
}

/// YMS9 d468 (turn 60) and 9PYK d291 (turn 32): the leader named by the power ratio flickered off.
/// Named once a turn by its reach, it changes the base planner's own choice: at 9PYK, the 12 go on
/// Western US to retake Central America.
#[test]
fn threat_names_the_leader_by_its_reach_yms9_d468_9pyk_d291() {
    let first = |k: Knobs, p: &At| {
        let me = v2(k);
        let input = p.input();
        let point = search_point(input.view, input.history).unwrap();
        me.candidates_at(&point, input.seat, me.extra(&input)).0[0].place
    };
    let threat = with(|k| k.threat = 1);
    let yms9 = at("yms9", 468);
    assert_ne!(first(threat, &yms9), first(Knobs::BASELINE, &yms9));
    let pyk = at("9pyk", 291);
    assert_eq!(first(threat, &pyk)[WESTERN_US], 12);
    assert_eq!(first(Knobs::BASELINE, &pyk)[WESTERN_US], 0);
}

/// CZ7U d414 (turn 61): 30 moved off Iceland beside Kyle's 22, opening his 13-capture sweep.
#[test]
fn hoard_keeps_the_gate_cz7u_d414() {
    const ICELAND: u8 = 13;
    let p = at("cz7u", 414);
    assert!(matches!(
        decided(Knobs::BASELINE, &p),
        Move::Fortify {
            from: ICELAND,
            armies: 30,
            ..
        }
    ));
    assert!(!matches!(
        decided(with(|k| k.hoard = 1), &p),
        Move::Fortify { from: ICELAND, .. }
    ));
}

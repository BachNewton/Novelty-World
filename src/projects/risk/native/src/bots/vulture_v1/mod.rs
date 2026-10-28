//! vulture-v1 (`ideas/vulture-v1.md`): a style bot that plays the playbook of the person who keeps
//! beating the bots, flaws included. It waits on a cheap continent while the others fight, takes a
//! card a turn, and picks off the weakest seat for its cards. It doesn't plan or score: it follows
//! rules over its seat's view with the crate's exact odds, and draws nothing at random.

mod board;

use super::greedy::trade_move;
use crate::bot::{Bot, BotInput};
use crate::cards::{is_wild, set_value, territory_of, Card};
use crate::engine::{FortifyOptions, Move, Options, ReinforceOptions, Territory};
use crate::map::{territories_in, ADJACENT};
use board::{beside, chance, Board, Turn};

/// Every attack but the card captures at least this surely, as blitzed: the bar under all but one
/// of his breaks into another's continent.
pub(crate) const SURE: f64 = 0.85;
/// The turn's card is taken at an even chance or better: his lowest first attack was 47%.
const CARD_BAR: f64 = 0.5;
/// A raid comes from a pile of at least this many, into a territory of 1 army.
const RAID_STACK: i32 = 7;

pub struct VultureV1;

impl Bot for VultureV1 {
    fn decide(&self, input: &BotInput) -> Move {
        let b = Board::from_view(input.view, input.seat);
        let turn = Turn::read(input.history);
        match input.options {
            Options::Reinforce(r) if !r.sets.is_empty() => trade(&b, r),
            Options::Reinforce(r) => {
                let (territory, armies) = place(&b, &turn, r.armies_to_place);
                Move::Place {
                    territory: territory as Territory,
                    armies,
                }
            }
            Options::Attack(a) => {
                let open: Vec<(usize, usize)> = a
                    .attacks
                    .iter()
                    .map(|x| (x.from as usize, x.to as usize))
                    .filter(|&(from, _)| b.spare(from) >= 1)
                    .collect();
                match attack(&b, &turn, input.view.card_earned, &open) {
                    Some((from, to)) => Move::Blitz {
                        from: from as Territory,
                        to: to as Territory,
                        keep_at_least: b.keep(from),
                    },
                    None => Move::EndAttack,
                }
            }
            // Everything moves in, apart from a gate's guard.
            &Options::Occupy { from, min, max, .. } => Move::Occupy {
                armies: (max - (b.keep(from as usize) - 1)).clamp(min, max),
            },
            Options::Fortify(f) => fortify(&b, &turn, f).unwrap_or(Move::EndTurn),
        }
    }
}

/// Rule 1: any set is traded, the one worth most (among equals, one picturing a territory of mine
/// for the +2, then the fewest wilds, then the first), its +2 on the pictured territory with most
/// armies.
fn trade(b: &Board, r: &ReinforceOptions) -> Move {
    let key = |s: &[Card; 3]| {
        let wilds = s.iter().filter(|&&c| is_wild(c)).count() as i32;
        let pictured = s.iter().any(|&c| {
            territory_of(c).is_some_and(|t| r.bonus_territories.contains(&(t as Territory)))
        });
        (set_value(s), pictured, -wilds)
    };
    let set = r
        .sets
        .iter()
        .fold(None, |best: Option<[Card; 3]>, s| match best {
            Some(x) if key(&x) >= key(s) => Some(x),
            _ => Some(*s),
        })
        .expect("a set to trade");
    trade_move(set, &r.bonus_territories, |choices| {
        most(choices.iter().fold(0u64, |m, &t| m | 1 << t), |t| {
            b.armies[t]
        })
        .expect("a choice") as Territory
    })
}

/// Where the turn's armies go, in the rules' order: the kill's stack, a short gate, the base's
/// launch, the sweep's launch, the card's launch.
fn place(b: &Board, turn: &Turn, armies: i32) -> (usize, i32) {
    if let Some(victim) = victim(b) {
        let spots = b.mine() & beside(b.owned[victim]);
        let best = territories_in(spots)
            .filter_map(|s| b.kill(victim, Some((s, armies))).map(|(p, ..)| (s, p)))
            .fold(None, |best: Option<(usize, f64)>, x| match best {
                Some(bst) if bst.1 >= x.1 => Some(bst),
                _ => Some(x),
            });
        if let Some((spot, p)) = best {
            if p >= SURE {
                return (spot, armies);
            }
        }
    }
    if let Some((gate, short)) = b.short_gate() {
        return (gate, short.min(armies));
    }
    let front = b.mine() & beside(b.enemy());
    if let Some(c) = b.target_base() {
        let into = crate::map::CONTINENT_MASKS[c] & b.enemy();
        let inside = crate::map::CONTINENT_MASKS[c];
        if let Some(t) = most(b.mine() & beside(into), |t| {
            i32::from(inside & (1 << t) != 0) * 10_000 + b.armies[t]
        }) {
            return (t, armies);
        }
    }
    if turn.traded > 0 {
        if let Some(t) = most(front, |t| {
            b.sweep_length(t, b.spare(t) + armies) as i32 * 1000 + b.armies[t]
        }) {
            return (t, armies);
        }
    }
    // The thinnest; then the nearest home; then the leader's continent.
    let home = b.steps_home();
    let target = least(b.enemy() & beside(b.mine()), |t| {
        b.armies[t] * 10_000 + home[t] as i32 * 2 - i32::from(b.leader_land() & (1 << t) != 0)
    })
    .expect("an enemy borders me while the game goes on");
    let spot = most(b.mine() & ADJACENT[target], |t| b.spare(t)).expect("my land borders it");
    (spot, armies)
}

/// The first territory of `mask` with the highest score.
fn most(mask: u64, score: impl Fn(usize) -> i32) -> Option<usize> {
    territories_in(mask)
        .fold(None, |best: Option<(usize, i32)>, t| match best {
            Some(x) if x.1 >= score(t) => Some(x),
            _ => Some((t, score(t))),
        })
        .map(|(t, _)| t)
}

/// The first territory of `mask` with the lowest score.
fn least(mask: u64, score: impl Fn(usize) -> i32) -> Option<usize> {
    most(mask, |t| -score(t))
}

/// Rule 2's victim: the weakest seat, if it holds a card or is the last opponent.
fn victim(b: &Board) -> Option<usize> {
    b.weakest()
        .filter(|&v| b.hand[v] > 0 || b.alive_opponents() == 1)
}

/// The next attack, in the rules' order: the kill, the base, the card, the sweep, the raids.
fn attack(b: &Board, turn: &Turn, card: bool, open: &[(usize, usize)]) -> Option<(usize, usize)> {
    let p = |&(from, to): &(usize, usize)| chance(b.spare(from), b.armies[to]);
    let sure = |x: &&(usize, usize)| p(x) >= SURE;
    let leader_land = b.leader_land();
    // Thinnest first, then the one with fewest enemy territories beyond it (a pocket before an
    // opening), then the leader's continent, then most attackers; the first among equals.
    let pick = |xs: &mut dyn Iterator<Item = &(usize, usize)>| {
        xs.fold(None, |best: Option<(usize, usize)>, &x| {
            let key = |(f, t): (usize, usize)| {
                (
                    -b.armies[t],
                    -((ADJACENT[t] & b.enemy()).count_ones() as i32),
                    i32::from(leader_land & (1 << t) != 0),
                    b.spare(f),
                )
            };
            match best {
                Some(y) if key(y) >= key(x) => Some(y),
                _ => Some(x),
            }
        })
    };

    if let Some(v) = victim(b) {
        if let Some((pk, from, to)) = b.kill(v, None) {
            if pk >= SURE && open.contains(&(from, to)) {
                return Some((from, to));
            }
        }
    }
    if let Some(c) = b.target_base() {
        let into = crate::map::CONTINENT_MASKS[c];
        if let Some(x) = pick(&mut open.iter().filter(|x| into & (1 << x.1) != 0).filter(sure)) {
            return Some(x);
        }
    }
    let head = turn.head(b);
    if !card {
        return pick(&mut open.iter().filter(sure)).or_else(|| {
            open.iter().copied().filter(|x| p(x) >= CARD_BAR).fold(
                None,
                |best: Option<(usize, usize)>, x| match best {
                    Some(y) if p(&y) >= p(&x) => Some(y),
                    _ => Some(x),
                },
            )
        });
    }
    let from_head = |x: &&(usize, usize)| Some(x.0) == head;
    if turn.traded > 0 {
        if let Some(x) = pick(&mut open.iter().filter(from_head).filter(sure)) {
            return Some(x);
        }
    }
    let raid = |x: &&(usize, usize)| b.armies[x.0] >= RAID_STACK && b.armies[x.1] == 1;
    if let Some(x) = pick(&mut open.iter().filter(from_head).filter(raid).filter(sure)) {
        return Some(x);
    }
    if turn.traded > 0 {
        return open.iter().filter(raid).filter(sure).copied().fold(
            None,
            |best: Option<(usize, usize)>, x| match best {
                Some(y) if b.armies[y.0] >= b.armies[x.0] => Some(y),
                _ => Some(x),
            },
        );
    }
    None
}

/// Rule 9: a short gate filled from the biggest pile that reaches it; otherwise the turn's biggest
/// pile, one taken this turn first, marches all but one army to the hub.
fn fortify(b: &Board, turn: &Turn, f: &FortifyOptions) -> Option<Move> {
    let movable = |t: usize| b.spare(t);
    let source_reaching = |to: usize, among: u64| {
        f.sources
            .iter()
            .filter(|s| s.reach & (1 << to) != 0 && among & (1 << s.from) != 0)
            .map(|s| s.from as usize)
            .filter(|&s| s != to && movable(s) >= 1)
            .fold(None, |best: Option<usize>, s| match best {
                Some(x) if movable(x) >= movable(s) => Some(x),
                _ => Some(s),
            })
    };
    if let Some((gate, short)) = b.short_gate() {
        if let Some(from) = source_reaching(gate, b.mine()) {
            return Some(Move::Fortify {
                from: from as Territory,
                to: gate as Territory,
                armies: short.min(movable(from)),
            });
        }
    }
    let hub = hub(b)?;
    let taken = turn.captures.iter().fold(0u64, |m, &(_, t)| m | 1 << t) & b.mine();
    let from = source_reaching(hub, taken)
        .or_else(|| source_reaching(hub, b.mine() & !beside(b.enemy())))?;
    (movable(from) >= 1).then(|| Move::Fortify {
        from: from as Territory,
        to: hub as Territory,
        armies: movable(from),
    })
}

/// The hub: the territory of mine facing an enemy nearest home (a gate itself while it faces one),
/// beside the most enemy territories, then with the most armies.
fn hub(b: &Board) -> Option<usize> {
    if b.home() == 0 {
        return None;
    }
    let dist = b.steps_home();
    let front = b.mine() & beside(b.enemy());
    territories_in(front).fold(None, |best: Option<usize>, t| {
        let key = |t: usize| {
            (
                std::cmp::Reverse(dist[t]),
                (ADJACENT[t] & b.enemy()).count_ones(),
                b.armies[t],
            )
        };
        match best {
            Some(x) if key(x) >= key(t) => Some(x),
            _ => Some(t),
        }
    })
}

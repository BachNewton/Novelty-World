//! The small decisions, each read off the planner or scored by the same evaluation, so they never
//! disagree with the turn's plan: which set and whether to trade, the +2, the next attack, the
//! move-in and the fortify.

use super::board::{Board, Scan};
use super::evaluate::{evaluate, Judge};
use super::hands::{hand_worth, shape_of, sub, CARD_DISCOUNT};
use super::opponents::believed_sweeps;
use super::plans::{best_plan, Plan, PlanKind};
use crate::cards::{set_value, territory_of, Card};
use crate::engine::{FortifyOptions, Move, Territory};
use crate::map::ADJACENCY;
use crate::odds::{battle_outcome, blitz_commit};

/// Which set to trade: the one whose armies, the +2 where it lands (more on the front), and what
/// the cards kept are worth come to most. So a wild is kept unless it is what makes the set worth
/// more.
pub fn choose_set(b: &Board, judge: &Judge, hand: &[Card], sets: &[[Card; 3]]) -> [Card; 3] {
    let mut best = sets[0];
    let mut best_score = f64::NEG_INFINITY;
    for &set in sets {
        let rest: Vec<Card> = hand.iter().copied().filter(|c| !set.contains(c)).collect();
        let mut bonus = 0;
        for &c in &set {
            if let Some(t) = territory_of(c) {
                if b.owner[t] == judge.me {
                    bonus = bonus.max(if b.enemy_beside(t) { 2 } else { 1 });
                }
            }
        }
        let score =
            set_value(&set) as f64 + bonus as f64 + CARD_DISCOUNT * hand_worth(shape_of(&rest), 0);
        if score > best_score + 1e-9 {
            best_score = score;
            best = set;
        }
    }
    best
}

/// Where the +2 goes when a set pictures several of my territories: the biggest that faces an
/// enemy.
pub fn choose_bonus(b: &Board, choices: &[Territory]) -> Territory {
    let score = |t: Territory| {
        let t = t as usize;
        (if b.enemy_beside(t) { 1000 } else { 0 }) + b.armies[t]
    };
    let mut best = choices[0];
    for &t in choices {
        if score(t) > score(best) {
            best = t;
        }
    }
    best
}

/// The board once `set` is traded, and its armies to place.
pub fn after_trade(b: &Board, judge: &Judge, set: [Card; 3]) -> (Board, i32) {
    let mut out = *b;
    let me = judge.me as usize;
    out.hand[me] = out.hand[me].saturating_sub(3);
    let shape = shape_of(&set);
    if (0..4).all(|i| out.known[i] >= shape[i]) {
        out.known = sub(out.known, shape);
    }
    (out, set_value(&set) as i32)
}

/// The plan's next attack: its next capture from my strongest territory beside it, a single
/// battle with every die when the best play starts by rolling, otherwise a blitz committing the
/// fewest armies as sure as all of them.
pub fn next_attack(b: &Board, plan: &Plan) -> Option<Move> {
    if plan.kind == PlanKind::Hold {
        return None;
    }
    let route = plan
        .capture
        .as_ref()?
        .routes
        .iter()
        .find(|r| !r.path.is_empty())?;
    let target = route.path[0];
    let me = b.owner[route.source];
    let mut from: Option<usize> = None;
    for &n in ADJACENCY[target] {
        if b.owner[n] == me && from.is_none_or(|f| b.armies[n] > b.armies[f]) {
            from = Some(n);
        }
    }
    let from = from?;
    if b.armies[from] < 2 {
        return None;
    }
    let a = (b.armies[from] - 1) as usize;
    let d = b.armies[target].max(1) as usize;
    Some(if battle_outcome(a, d).roll {
        Move::Attack {
            from: from as Territory,
            to: target as Territory,
            dice: a.min(3) as u8,
        }
    } else {
        Move::Blitz {
            from: from as Territory,
            to: target as Territory,
            keep_at_least: b.armies[from] - blitz_commit(a, d) as i32,
        }
    })
}

/// The move-in: all, half, the minimum and the minimum plus two, each scored by the best plan
/// from the board it leaves.
pub fn choose_occupy(b: &Board, judge: &Judge, from: usize, to: usize, min: i32, max: i32) -> i32 {
    let mut options: Vec<i32> = Vec::with_capacity(4);
    for m in [max, (min + max + 1) / 2, min, max.min(min + 2)] {
        if !options.contains(&m) {
            options.push(m);
        }
    }
    let mut best = max;
    let mut best_value = f64::NEG_INFINITY;
    for m in options {
        let mut board = *b;
        board.armies[from] -= m - min;
        board.armies[to] += m - min;
        let value = best_plan(&board, judge, 0).value;
        if value > best_value + 1e-12 {
            best_value = value;
            best = m;
        }
    }
    best
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Shift {
    from: usize,
    to: usize,
    armies: i32,
}

impl Shift {
    fn on(&self, b: &Board) -> Board {
        let mut out = *b;
        out.armies[self.from] -= self.armies;
        out.armies[self.to] += self.armies;
        out
    }
}

/// The fortify: when an opponent's believed sweep takes a third of my territories or more, the
/// move that most cuts what the believed sweeps cost me, if one does; otherwise every move whole
/// and halved (never off the front into the interior), the forty biggest, scored by the
/// evaluation against not moving.
pub fn choose_fortify(b: &Board, judge: &Judge, options: &FortifyOptions) -> Option<Move> {
    let mut shifts: Vec<Shift> = Vec::new();
    for m in options.moves() {
        let (from, to) = (m.from as usize, m.to as usize);
        if !b.enemy_beside(to) && b.enemy_beside(from) {
            continue;
        }
        shifts.push(Shift {
            from,
            to,
            armies: m.max_armies,
        });
        let half = m.max_armies / 2;
        if half >= 1 && half != m.max_armies {
            shifts.push(Shift {
                from,
                to,
                armies: half,
            });
        }
    }
    shifts.sort_by(|x, y| {
        y.armies
            .cmp(&x.armies)
            .then(x.from.cmp(&y.from))
            .then(x.to.cmp(&y.to))
    });
    shifts.truncate(40);

    // `hoard`: a move that strips a gate facing a bigger stack is charged, and never gathers.
    let unstripped: Vec<Shift>;
    let gathering = if judge.extra.hoard {
        unstripped = shifts
            .iter()
            .copied()
            .filter(|s| stripped_gate(b, s) == 0.0)
            .collect();
        &unstripped
    } else {
        &shifts
    };
    let best = gather(b, judge, gathering).or_else(|| {
        let mut best = None;
        let mut best_value = evaluate(b, judge);
        let total = if judge.extra.hoard {
            super::evaluate::breakdown(b, judge).total
        } else {
            1.0
        };
        for s in &shifts {
            let mut value = evaluate(&s.on(b), judge);
            if judge.extra.hoard {
                value -= stripped_gate(b, s) / total;
            }
            if value > best_value + 1e-9 {
                best_value = value;
                best = Some(*s);
            }
        }
        best
    })?;
    Some(Move::Fortify {
        from: best.from as Territory,
        to: best.to as Territory,
        armies: best.armies,
    })
}

/// `hoard`'s charge on a fortify, in armies: when the move leaves its source facing a bigger enemy
/// stack than it keeps, the chance that stack now takes it over the chance it had, times the armies
/// moved away. 0 for any other move.
fn stripped_gate(b: &Board, s: &Shift) -> f64 {
    let Some(attackers) =
        crate::map::territories_in(crate::map::ADJACENT[s.from] & !b.own(b.owner[s.from]))
            .map(|n| b.armies[n] - 1)
            .max()
    else {
        return 0.0;
    };
    let left = b.armies[s.from] - s.armies;
    if attackers <= left {
        return 0.0;
    }
    let before = super::fights::win(attackers, b.armies[s.from]);
    let after = super::fights::win(attackers, left);
    (after - before).max(0.0) * s.armies as f64
}

fn gather(b: &Board, judge: &Judge, shifts: &[Shift]) -> Option<Shift> {
    let (now, most) = believed_sweeps(b, &Scan::new(b), judge.me, &judge.prefs);
    if most < 2 || 3 * most < b.count(judge.me) {
        return None;
    }
    let mut best = None;
    let mut best_cost = now;
    for s in shifts {
        let board = s.on(b);
        let cost = believed_sweeps(&board, &Scan::new(&board), judge.me, &judge.prefs).0;
        if cost < best_cost - 1e-9 {
            best_cost = cost;
            best = Some(*s);
        }
    }
    best
}

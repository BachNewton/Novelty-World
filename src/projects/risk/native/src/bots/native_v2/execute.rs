//! `execute` (`ideas/native-v2.md`): the chosen candidate's whole plan is carried out. The attacks
//! follow the plan's captures, route by route, each from the latest of my territories on its run;
//! the move-in is sized to what the plan's next captures need and scored over the totals rather
//! than four; a capture beyond the plan, or once the plan can't go on, is made only if the board it
//! ends on scores better with `feed`'s charge. Without it, the base bot replans every attack on the
//! board the placement made, and a planned capture can become ten.

use super::leaf::fed;
use crate::bots::native_v1::board::Board;
use crate::bots::native_v1::decisions::next_attack;
use crate::bots::native_v1::evaluate::{breakdown, Judge};
use crate::bots::native_v1::plans::{best_plan, failure_board, success_board, Plan, PlanKind};
use crate::engine::Move;
use crate::map::ADJACENT;
use crate::odds::{battle_outcome, blitz_commit, path_run};

/// A run left with less than this chance of taking the rest of its route is given up, and the
/// base bot's replanning, held to the feed charge, decides what follows.
const GIVE_UP: f64 = 0.5;

/// Of each move-in's totals, at most this many are scored (evenly spaced, with the bounds the plan
/// needs): a move-in of forty armies needn't plan forty boards.
const MOST_TOTALS: i32 = 12;

/// How close to the best chance a run can have a stack is sized: the least that comes this close.
const NEAR_BEST: f64 = 0.98;

/// The plan's next capture on `b`: the attacking territory, the target and the defenders left on
/// its run, or None once every target is mine (or the plan has none).
fn next_capture(b: &Board, me: u8, plan: &Plan) -> Option<(usize, usize, Vec<usize>)> {
    let cp = plan.capture.as_ref()?;
    for r in &cp.routes {
        let Some(k) = r.path.iter().position(|&t| b.owner[t] != me) else {
            continue;
        };
        let target = r.path[k];
        let latest = std::iter::once(r.source)
            .chain(r.path[..k].iter().copied())
            .rev()
            .find(|&v| b.owner[v] == me && ADJACENT[v] & 1 << target != 0 && b.armies[v] >= 2);
        let from = latest.or_else(|| {
            crate::map::territories_in(ADJACENT[target] & b.own(me))
                .filter(|&n| b.armies[n] >= 2)
                .max_by_key(|&n| (b.armies[n], std::cmp::Reverse(n)))
        })?;
        let rest: Vec<usize> = r.path[k..]
            .iter()
            .take_while(|&&t| b.owner[t] != me)
            .map(|&t| b.armies[t].max(1) as usize)
            .collect();
        return Some((from, target, rest));
    }
    None
}

/// Whether the plan still has a capture to make on `b`.
fn unfinished(b: &Board, plan: &Plan, me: u8) -> bool {
    plan.capture.as_ref().is_some_and(|cp| {
        cp.routes
            .iter()
            .any(|r| r.path.iter().any(|&t| b.owner[t] != me))
    })
}

/// The board's value less `feed`'s charge at weight `w`, as a share of everyone's power.
fn charged(b: &Board, judge: &Judge, w: f64) -> f64 {
    let bd = breakdown(b, judge);
    let gains: f64 = fed(b, judge.me, judge.prefs.income_horizon, judge.extra.bold)
        .iter()
        .sum();
    bd.value - w * gains / bd.total
}

/// The attack under the plan.
pub fn attack(b: &Board, judge: &Judge, plan: &Plan, feed: f64) -> Move {
    if plan.kind != PlanKind::Hold && unfinished(b, plan, judge.me) {
        if let Some((from, target, rest)) = next_capture(b, judge.me, plan) {
            if path_run(b.armies[from] as usize, &rest).p_success >= GIVE_UP {
                let a = (b.armies[from] - 1) as usize;
                let d = b.armies[target].max(1) as usize;
                return if battle_outcome(a, d).roll {
                    Move::Attack {
                        from: from as u8,
                        to: target as u8,
                        dice: a.min(3) as u8,
                    }
                } else {
                    Move::Blitz {
                        from: from as u8,
                        to: target as u8,
                        keep_at_least: b.armies[from] - blitz_commit(a, d) as i32,
                    }
                };
            }
        }
    }
    beyond(b, judge, feed)
}

/// A capture beyond the plan: the base bot's replanned attack, made only if its plan's value with
/// `feed`'s charge beats the board as it stands with that charge.
fn beyond(b: &Board, judge: &Judge, feed: f64) -> Move {
    let replan = best_plan(b, judge, 0);
    let Some(cp) = replan
        .capture
        .as_ref()
        .filter(|_| replan.kind != PlanKind::Hold)
    else {
        return Move::EndAttack;
    };
    let now = charged(b, judge, feed);
    let p = cp.p_success;
    let charge = |end: &Board| {
        let bd = breakdown(end, judge);
        let gains: f64 = fed(end, judge.me, judge.prefs.income_horizon, judge.extra.bold)
            .iter()
            .sum();
        feed * gains / bd.total
    };
    let after = replan.value
        - p * charge(&success_board(b, judge.me, cp))
        - (1.0 - p) * charge(&failure_board(b, judge.me, cp));
    if after > now {
        next_attack(b, &replan).unwrap_or(Move::EndAttack)
    } else {
        Move::EndAttack
    }
}

/// The least stack, from `low` to `high`, whose run over `rest` comes near the best chance `high`
/// armies give it.
fn sized(rest: &[usize], low: i32, high: i32) -> i32 {
    if rest.is_empty() || high <= low {
        return low;
    }
    let best = path_run(high as usize, rest).p_success;
    (low..=high)
        .find(|&a| path_run(a as usize, rest).p_success >= NEAR_BEST * best)
        .unwrap_or(high)
}

/// The move-in under the plan, `b` showing the capture with its minimum moved in: the totals that
/// leave the plan's next captures the armies they need (the run going on from `to`, and the routes
/// still to start from `from`), each scored by the base planner's best plan from the board it
/// leaves; the run from `to` first when both can't be met.
pub fn occupy(
    b: &Board,
    judge: &Judge,
    plan: &Plan,
    from: usize,
    to: usize,
    min: i32,
    max: i32,
) -> i32 {
    let me = judge.me;
    let mut need_to = min;
    let mut keep_from = 1;
    if let Some(cp) = plan
        .capture
        .as_ref()
        .filter(|_| plan.kind != PlanKind::Hold)
    {
        for r in &cp.routes {
            if let Some(k) = r.path.iter().position(|&t| t == to) {
                let rest: Vec<usize> = r.path[k + 1..]
                    .iter()
                    .take_while(|&&t| b.owner[t] != me)
                    .map(|&t| b.armies[t].max(1) as usize)
                    .collect();
                if r.path
                    .get(k + 1)
                    .is_some_and(|&n| ADJACENT[to] & 1 << n != 0)
                {
                    need_to = need_to.max(sized(&rest, min, max));
                }
            } else if r.source == from && r.path.iter().all(|&t| b.owner[t] != me) {
                let rest: Vec<usize> = r
                    .path
                    .iter()
                    .map(|&t| b.armies[t].max(1) as usize)
                    .collect();
                keep_from = keep_from.max(sized(&rest, 1, b.armies[from]));
            }
        }
    }
    // After a total of m, `from` keeps its armies less what moved past the minimum.
    let kept = |m: i32| b.armies[from] - (m - min);
    let feasible: Vec<i32> = (min..=max)
        .filter(|&m| m >= need_to && kept(m) >= keep_from)
        .collect();
    let pool: Vec<i32> = if feasible.is_empty() {
        vec![need_to.clamp(min, max)]
    } else {
        spaced(&feasible)
    };
    let mut best = pool[0];
    let mut best_value = f64::NEG_INFINITY;
    for &m in &pool {
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

/// Every total when there are few, otherwise `MOST_TOTALS` evenly spaced from the first to the last.
fn spaced(totals: &[i32]) -> Vec<i32> {
    let n = totals.len() as i32;
    if n <= MOST_TOTALS {
        return totals.to_vec();
    }
    let mut out: Vec<i32> = (0..MOST_TOTALS)
        .map(|i| totals[(i * (n - 1) / (MOST_TOTALS - 1)) as usize])
        .collect();
    out.dedup();
    out
}

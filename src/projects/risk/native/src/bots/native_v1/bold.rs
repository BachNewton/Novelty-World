//! native-v2's `humans` belief (`ideas/native-v2.md`): a seat a person plays takes the kills open to
//! it, and its kill chance counts what a person's kill counts. The planner's own chance needs one
//! stack to beat a whole connected group; a person sweeps from several stacks, and pays for a
//! second kill with the first's cards. native-v1 never reads this: only an `Extra` naming bold
//! seats does.

use super::board::{round, spread, Board, Scan, N};
use super::fights;
use super::hands::forced_trade;
use super::routes::kill_chance;
use crate::engine::Seat;
use crate::map::{territories_in, ADJACENCY};

/// A capture worse than this ends a sweep's walk: no one plans a kill through it.
const WORTH_TRYING: f64 = 0.2;

/// The chance `q` takes all of `v`'s land in one turn from every stack of its beside it, its
/// `to_place` armies on the biggest: the likeliest capture first, each stack going on from what it
/// takes, the chances multiplied. 0 when the walk stops short.
pub fn multi_stack_kill(b: &Board, q: Seat, v: Seat, to_place: i32) -> f64 {
    let land = b.own(v);
    if land == 0 {
        return 0.0;
    }
    let mut stacks = [usize::MAX; N];
    let mut ready: Vec<i32> = Vec::new();
    let mut biggest: Option<usize> = None;
    for t in territories_in(spread(land) & b.own(q)) {
        stacks[t] = ready.len();
        ready.push(b.armies[t] - 1);
        if biggest.is_none_or(|x| b.armies[t] > b.armies[x]) {
            biggest = Some(t);
        }
    }
    let Some(biggest) = biggest else { return 0.0 };
    ready[stacks[biggest]] += to_place;
    let mut left = land;
    let mut p = 1.0;
    while left != 0 {
        let mut best: Option<(usize, usize, f64)> = None;
        for t in territories_in(left) {
            for &n in ADJACENCY[t] {
                let s = stacks[n];
                if s == usize::MAX || ready[s] <= 0 {
                    continue;
                }
                let w = fights::win(ready[s], b.armies[t]);
                if best.is_none_or(|(_, _, x)| w > x) {
                    best = Some((s, t, w));
                }
            }
        }
        let Some((s, t, w)) = best.filter(|&(_, _, w)| w >= WORTH_TRYING) else {
            return 0.0;
        };
        p *= w;
        ready[s] = 0.max(round(fights::arrive(ready[s], b.armies[t])) - 1);
        stacks[t] = s;
        left &= !(1 << t);
    }
    p
}

/// A bold seat's chance of killing `v` this turn: the best of the planner's own chance, the sweep
/// from several stacks, and a kill paid for by a first kill's cards (a first victim whose hand
/// makes `q`'s five or more forces a trade at once, its armies placed for the second kill).
pub fn bold_kill_chance(b: &Board, scan: &Scan, q: Seat, v: Seat, to_place: i32) -> f64 {
    let mut p = kill_chance(b, scan, q, v, to_place).max(multi_stack_kill(b, q, v, to_place));
    for first in b.alive_seats() {
        if first == q || first == v || b.own(first) == 0 {
            continue;
        }
        let cards = b.hand[q as usize] + b.hand[first as usize];
        if cards < 5 {
            continue;
        }
        let p1 =
            kill_chance(b, scan, q, first, to_place).max(multi_stack_kill(b, q, first, to_place));
        if p1 <= p {
            continue;
        }
        let paid = to_place + forced_trade(cards).0 as i32;
        let p2 = kill_chance(b, scan, q, v, paid).max(multi_stack_kill(b, q, v, paid));
        p = p.max(p1 * p2);
    }
    p
}

//! The capture planner: how a seat takes a set of territories this turn (a card spot, the rest of
//! a continent, every territory a victim holds), from which of its stacks, in what order, and how
//! it splits the armies it has to place. Each connected group of targets is entered from the
//! launch stack, beside it or one third player's territory away, that gives the best run, and
//! covered in an order that keeps the run a path where it can. The kill chance is built on it.

use super::board::{round, spread, Board, Scan, N};
use super::fights::{self, Run};
use super::memo::{new_memo, remembered, Memo};
use crate::engine::Seat;
use crate::list::List;
use crate::map::{component, territories_in, ADJACENCY, ADJACENT};

/// What a way in through a third player's territory gives up against a direct one, in the route
/// score's units (1000 per certainty): a direct way in wins any near tie.
const THIRD_PARTY_COST: f64 = 30.0;
/// Below this, the kill screen's chance is the answer: not worth planning routes for.
const KILL_SCREEN: f64 = 0.01;

#[derive(Clone, Debug, PartialEq)]
pub struct Route {
    /// The launch territory, the seat's own.
    pub source: usize,
    /// Territories taken in order: a third player's on the way, then the targets.
    pub path: Vec<usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CapturePlan {
    pub routes: Vec<Route>,
    /// Armies placed on each route's source.
    pub alloc: Vec<i32>,
    /// Armies to place left over for defence.
    pub leftover: i32,
    /// Each route's chance to take all of its path, independent of the others.
    pub p_route: Vec<f64>,
    pub p_success: f64,
    /// Given success, each route's expected armies on its last territory.
    pub arrive: Vec<f64>,
}

fn run(armies: i32, via: Option<i32>, defenders: &[i32]) -> Run {
    fights::run(armies, via, defenders)
}

fn defenders_of(b: &Board, path: &[usize]) -> Vec<i32> {
    path.iter().map(|&t| b.armies[t]).collect()
}

type Order = List<u8, N>;

/// The connected groups of `targets`, each its members in the order a search from its first
/// target finds them, and as a mask.
fn groups(targets: &[usize]) -> List<(Order, u64), N> {
    let mut left = targets.iter().fold(0u64, |m, &t| m | 1 << t);
    let mut out = List::new();
    for &start in targets {
        if left & 1 << start == 0 {
            continue;
        }
        left &= !(1 << start);
        let mut members = Order::from_slice(&[start as u8]);
        let mut has = 1u64 << start;
        let mut stack = Order::from_slice(&[start as u8]);
        while let Some(&t) = stack.last() {
            stack.remove(stack.len() - 1);
            for &n in ADJACENCY[t as usize] {
                if left & 1 << n != 0 {
                    left &= !(1 << n);
                    members.push(n as u8);
                    has |= 1 << n;
                    stack.push(n as u8);
                }
            }
        }
        out.push((members, has));
    }
    out
}

/// The order a run takes a group from `entry`: always the next target with the fewest untaken
/// target neighbours, so the run stays a path where the group allows; at a dead end it branches
/// from the latest capture that can.
fn cover_order(b: &Board, group: u64, entry: usize) -> Order {
    let size = group.count_ones() as usize;
    let mut order = Order::from_slice(&[entry as u8]);
    let mut taken = 1u64 << entry;
    while order.len() < size {
        let mut next = None;
        for k in (0..order.len()).rev() {
            let open = ADJACENT[order[k] as usize] & group & !taken;
            if open == 0 {
                continue;
            }
            let mut best = i64::MAX;
            for &n in ADJACENCY[order[k] as usize] {
                if open & 1 << n == 0 {
                    continue;
                }
                let onward = (ADJACENT[n] & group & !taken).count_ones() as i64;
                let score = onward * 1000 + b.armies[n] as i64;
                if score < best {
                    best = score;
                    next = Some(n);
                }
            }
            break;
        }
        let Some(n) = next else { break };
        order.push(n as u8);
        taken |= 1 << n;
    }
    order
}

/// The plan for `seat` to take every one of `targets` this turn with `to_place` armies to place,
/// or None when some target can't be reached. Placement stops once the plan's chance reaches
/// `enough` (1 spends every army that still helps).
pub fn plan_capture(
    b: &Board,
    seat: Seat,
    targets: &[usize],
    to_place: i32,
    enough: f64,
) -> Option<CapturePlan> {
    let is_target = targets.iter().fold(0u64, |m, &t| m | 1 << t);
    let mine = b.own(seat);
    let mut routes: Vec<Route> = Vec::new();
    let mut used = 0u64;
    for (members, group) in groups(targets).iter() {
        let group = *group;
        let mut orders = [Order::new(); N];
        let mut ordered = 0u64;
        let mut best: Option<(f64, usize, Option<usize>, usize)> = None;
        for &e in members.iter() {
            let e = e as usize;
            let mut weigh = |source: usize, via: Option<usize>| {
                if ordered & 1 << e == 0 {
                    orders[e] = cover_order(b, group, e);
                    ordered |= 1 << e;
                }
                let order = &orders[e];
                let mut defenders = [0i32; N];
                for (d, &t) in defenders.iter_mut().zip(order.iter()) {
                    *d = b.armies[t as usize];
                }
                // A stack already leading another route keeps its armies to place for that one,
                // and has only what that route leaves it.
                let left = match routes.iter().find(|r| r.source == source) {
                    Some(r) => {
                        b.armies[source] - r.path.iter().map(|&t| b.armies[t] + 1).sum::<i32>()
                    }
                    None => b.armies[source],
                };
                let armies = left.max(1) + if used & 1 << source != 0 { 0 } else { to_place };
                let p = run(armies, via.map(|v| b.armies[v]), &defenders[..order.len()]).p_success;
                let score =
                    p * 1000.0 + left as f64 - if via.is_some() { THIRD_PARTY_COST } else { 0.0 };
                if best.is_none_or(|(s, ..)| score > s) {
                    best = Some((score, source, via, e));
                }
            };
            for &s in ADJACENCY[e] {
                if mine & 1 << s != 0 {
                    weigh(s, None);
                } else if (group | is_target) & 1 << s == 0 {
                    for &s2 in ADJACENCY[s] {
                        if mine & 1 << s2 != 0 {
                            weigh(s2, Some(s));
                        }
                    }
                }
            }
        }
        let (_, source, via, entry) = best?;
        let path = via
            .into_iter()
            .chain(orders[entry].iter().map(|&t| t as usize));
        match routes.iter_mut().find(|r| r.source == source) {
            Some(r) => r.path.extend(path),
            None => routes.push(Route {
                source,
                path: path.collect(),
            }),
        }
        used |= 1 << source;
    }

    let defenders: Vec<Vec<i32>> = routes.iter().map(|r| defenders_of(b, &r.path)).collect();
    let mut alloc = vec![0; routes.len()];
    let mut runs: Vec<Run> = routes
        .iter()
        .zip(&defenders)
        .map(|(r, d)| run(b.armies[r.source], None, d))
        .collect();
    let product = |runs: &[Run]| runs.iter().map(|r| r.p_success).product::<f64>();
    let mut left = to_place;
    let chunk = 1.max((to_place + 9) / 10);
    while left > 0 && product(&runs) < enough {
        let step = chunk.min(left);
        let current = product(&runs);
        let mut chosen: Option<(usize, Run)> = None;
        let mut best_p = current;
        let mut weakest = 0;
        for i in 0..routes.len() {
            if runs[i].p_success < runs[weakest].p_success {
                weakest = i;
            }
            let r = run(
                b.armies[routes[i].source] + alloc[i] + step,
                None,
                &defenders[i],
            );
            let p: f64 = (0..runs.len())
                .map(|j| {
                    if j == i {
                        r.p_success
                    } else {
                        runs[j].p_success
                    }
                })
                .product();
            if p > best_p + 1e-9 {
                best_p = p;
                chosen = Some((i, r));
            }
        }
        let (i, r) = match chosen {
            Some(c) => c,
            None => {
                // While two routes are both hopeless no single chunk shows a gain: feed the weaker.
                if current > 0.0 || runs[weakest].p_success >= 0.999 {
                    break;
                }
                let w = weakest;
                (
                    w,
                    run(
                        b.armies[routes[w].source] + alloc[w] + step,
                        None,
                        &defenders[w],
                    ),
                )
            }
        };
        alloc[i] += step;
        left -= step;
        runs[i] = r;
    }
    Some(CapturePlan {
        p_route: runs.iter().map(|r| r.p_success).collect(),
        p_success: product(&runs),
        arrive: runs.iter().map(|r| r.arrive).collect(),
        routes,
        alloc,
        leftover: left,
    })
}

/// `targets`, each connected group kept whole and in its own order, the cheapest group (its
/// defenders and an army left on each) first: a stack leading two groups leaves its detachment
/// for the cheap one and goes on with the rest, as the move-in plays it.
pub fn cheap_groups_first(b: &Board, targets: &[usize]) -> Vec<usize> {
    let mut group_of = [usize::MAX; N];
    let is_target = targets.iter().fold(0u64, |m, &t| m | 1 << t);
    let mut cost: Vec<i32> = Vec::new();
    for &start in targets {
        if group_of[start] != usize::MAX {
            continue;
        }
        let g = cost.len();
        cost.push(0);
        group_of[start] = g;
        let mut stack = vec![start];
        while let Some(t) = stack.pop() {
            cost[g] += b.armies[t] + 1;
            for &n in ADJACENCY[t] {
                if is_target & 1 << n != 0 && group_of[n] == usize::MAX {
                    group_of[n] = g;
                    stack.push(n);
                }
            }
        }
    }
    let mut out = targets.to_vec();
    if cost.len() > 1 {
        let mut rank = vec![0; cost.len()];
        let mut by_cost: Vec<usize> = (0..cost.len()).collect();
        by_cost.sort_by_key(|&g| (cost[g], g));
        for (r, &g) in by_cost.iter().enumerate() {
            rank[g] = r;
        }
        out.sort_by_key(|&t| rank[group_of[t]]);
    }
    out
}

thread_local! {
    static KILLS: Memo<f64> = new_memo(16);
}

/// The chance `attacker` eliminates `victim` this turn with `to_place` armies. Remembered by what
/// it reads: the victim's land and everything beside it, and the attacker's stacks a territory
/// further out.
pub fn kill_chance(b: &Board, scan: &Scan, attacker: Seat, victim: Seat, to_place: i32) -> f64 {
    let land = b.own(victim);
    if land == 0 {
        return 0.0;
    }
    // Beside the victim, a territory's armies matter only where the attacker can launch from it or
    // break through it; further out, only the attacker's stacks. The key's territories carry their
    // owners, so the victim's land and the attacker's within reach are in it too.
    let near = spread(land);
    let theirs = b.own(attacker) & spread(near);
    let key = scan.full_of(land | (near & spread(theirs)) | theirs)
        ^ super::board::mix128(
            0x6b11 << 32 | (attacker as u64) << 8 | victim as u64,
            to_place as u32 as u64,
        );
    remembered(&KILLS, key, || {
        compute_kill_chance(b, attacker, victim, to_place)
    })
}

fn compute_kill_chance(b: &Board, attacker: Seat, victim: Seat, to_place: i32) -> f64 {
    let land = b.own(victim);
    let theirs = b.own(attacker);
    let mut screen = 1.0;
    let mut unreachable = false;
    let mut left = land;
    while left != 0 {
        let group = component(land, left.trailing_zeros() as usize);
        left &= !group;
        let near = launch_near(b, theirs, group);
        if near < 0 {
            unreachable = true;
        }
        let attackers = near.max(0) + to_place;
        let size = group.count_ones() as usize;
        if attackers < size as i32 {
            return 0.0;
        }
        let mut defenders = [0i32; N];
        for (d, t) in defenders.iter_mut().zip(territories_in(group)) {
            *d = b.armies[t];
        }
        defenders[..size].sort_unstable();
        screen *= walked_run(attackers, &defenders[..size]);
    }
    if screen < KILL_SCREEN {
        return screen;
    }
    if unreachable {
        return 0.0;
    }
    let targets: Vec<usize> = territories_in(land).collect();
    plan_capture(b, attacker, &cheap_groups_first(b, &targets), to_place, 1.0)
        .map_or(0.0, |cp| cp.p_success)
}

/// The most armies a stack of `theirs` beside `group`, or one third player's territory away, can
/// bring to it (at least 0), or -1 when there is no such stack.
fn launch_near(b: &Board, theirs: u64, group: u64) -> i32 {
    let mut found = false;
    let mut best = 0;
    for n in territories_in(spread(group) & !group) {
        if theirs & 1 << n != 0 {
            found = true;
            best = best.max(b.armies[n] - 1);
        } else {
            for s in territories_in(ADJACENT[n] & theirs) {
                found = true;
                best = best.max(b.armies[s] - 1 - (b.armies[n] + 1));
            }
        }
    }
    if found {
        best
    } else {
        -1
    }
}

/// The chance `attackers` take every one of `defenders` in turn, walked forward on their expected
/// survivors, each capture leaving one behind.
fn walked_run(attackers: i32, defenders: &[i32]) -> f64 {
    let mut a = attackers;
    let mut p = 1.0;
    for &d in defenders {
        if a <= 0 {
            return 0.0;
        }
        p *= fights::win(a, d);
        if p < KILL_SCREEN {
            return p;
        }
        a = round(fights::arrive(a, d)) - 1;
    }
    p
}

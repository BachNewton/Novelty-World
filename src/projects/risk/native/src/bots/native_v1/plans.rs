//! The turn planner: a few dozen whole-turn plans (hold, single captures, continents, kills,
//! sweeps), each with its own placement, scored by the evaluation over the turn's possible ends,
//! the best committed. A bot is a pure function of its view, so it plans afresh at every decision.

use super::board::{board_hash, mix128, round, Board, Scan, N};
use super::evaluate::{breakdown, Judge};
use super::fights;
use super::hands::{forced_trade, EMPTY};
use super::memo::{new_memo, remembered, Memo};
use super::opponents::{expected_income, SURE};
use super::routes::{cheap_groups_first, kill_chance, plan_capture, CapturePlan, Route};
use crate::engine::{Seat, MAX_SEATS};
use crate::map::{territories_in, ADJACENCY, ADJACENT, CONTINENTS, CONTINENT_MASKS, TERRITORIES};
use crate::odds::path_run;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlanKind {
    Hold,
    Capture,
    Continent,
    Kill,
    Sweep,
}

#[derive(Clone, Debug)]
pub struct Plan {
    pub kind: PlanKind,
    pub capture: Option<CapturePlan>,
    /// Armies to place, by territory.
    pub place: [i32; N],
    pub value: f64,
}

impl Plan {
    /// The plan's biggest allocation, the lowest territory of equals: what the turn places first.
    pub fn first_placement(&self) -> Option<(usize, i32)> {
        let mut best: Option<(usize, i32)> = None;
        for (t, &a) in self.place.iter().enumerate() {
            if a > 0 && best.is_none_or(|(_, x)| a > x) {
                best = Some((t, a));
            }
        }
        best
    }
}

/// Leftover armies onto the front stack: my biggest territory with an enemy beside it.
fn stack_allocation(b: &Board, me: Seat, armies: i32, place: &mut [i32; N]) {
    if armies <= 0 {
        return;
    }
    let mut best: Option<usize> = None;
    for t in territories_in(b.own(me)) {
        if !b.enemy_beside(t) {
            continue;
        }
        if best.is_none_or(|x| b.armies[t] + place[t] > b.armies[x] + place[x]) {
            best = Some(t);
        }
    }
    let at = best.unwrap_or_else(|| b.own(me).trailing_zeros() as usize);
    place[at] += armies;
}

/// Leftover armies in chunks, each where it most cuts the expected loss to that territory's
/// strongest attacker (with its income), a held continent counting its bonus over the horizon.
fn guard_allocation(
    b: &Board,
    me: Seat,
    armies: i32,
    place: &mut [i32; N],
    income: &[f64; MAX_SEATS],
    horizon: f64,
) {
    if armies <= 0 {
        return;
    }
    let mut front: Vec<(usize, i32, f64)> = Vec::new();
    for t in territories_in(b.own(me)) {
        let attackers = territories_in(ADJACENT[t] & !b.own(me))
            .map(|n| b.armies[n] - 1 + round(income[b.owner[n] as usize]))
            .max()
            .unwrap_or(0)
            .max(0);
        if attackers == 0 {
            continue;
        }
        let c = TERRITORIES[t].continent;
        let bonus = if b.holds(me, c) {
            horizon * CONTINENTS[c].bonus as f64
        } else {
            0.0
        };
        front.push((t, attackers, bonus));
    }
    if front.is_empty() {
        return stack_allocation(b, me, armies, place);
    }
    let loss = |place: &[i32; N], &(t, attackers, bonus): &(usize, i32, f64), extra: i32| {
        let held = b.armies[t] + place[t] + extra;
        fights::win(attackers, held) * (held as f64 + bonus)
    };
    let mut left = armies;
    let chunk = 1.max((armies + 3) / 4);
    while left > 0 {
        let step = chunk.min(left);
        let mut best = front[0].0;
        let mut best_gain = f64::NEG_INFINITY;
        for f in &front {
            let gain = loss(place, f, 0) - loss(place, f, step) + step as f64;
            if gain > best_gain {
                best_gain = gain;
                best = f.0;
            }
        }
        place[best] += step;
        left -= step;
    }
}

fn placed(b: &Board, place: &[i32; N]) -> Board {
    let mut out = *b;
    for (a, p) in out.armies.iter_mut().zip(place) {
        *a += p;
    }
    out
}

/// The forced trades of `ELIM-3`, their armies on my front stack. The victim's cards are unseen,
/// so the hand kept is counted as unseen too.
fn forced_trades(b: &mut Board, me: Seat) {
    let (armies, kept) = forced_trade(b.hand[me as usize]);
    if armies == 0.0 {
        return;
    }
    b.hand[me as usize] = kept;
    b.known = EMPTY;
    let mut place = [0; N];
    stack_allocation(b, me, armies as i32, &mut place);
    *b = placed(b, &place);
}

/// Takes `t` from `from` with `survivors` arriving. A run moves them all on; a single capture
/// (`split`) divides them as the move-in would: the least into a territory with no enemy beside
/// it, everything out of a source left with none, otherwise half each.
fn take_one(b: &mut Board, me: Seat, from: usize, t: usize, survivors: i32, split: bool) {
    let victim = b.owner[t];
    b.set_owner(t, me);
    let mut into = survivors;
    if split {
        if !b.enemy_beside(t) {
            into = survivors.min(3);
        } else if b.enemy_beside(from) {
            into = (survivors + 1) / 2;
        }
    }
    into = into.max(1);
    b.armies[t] = into;
    b.armies[from] = 1 + 0.max(survivors - into);
    if b.eliminate_if_empty(victim, me) {
        forced_trades(b, me);
    }
    b.card_earned = true;
}

/// Route `r` run on `b`, taking its first `up_to` territories, the armies arriving shared among
/// the branch ends (where the next target isn't beside the last one taken), the rest keeping one.
fn run_route(b: &mut Board, me: Seat, r: &Route, up_to: usize, arrive: i32) {
    let ends: Vec<usize> = (0..up_to)
        .filter(|&k| k == up_to - 1 || ADJACENT[r.path[k]] & 1 << r.path[k + 1] == 0)
        .collect();
    let mut visited = vec![r.source];
    for k in 0..up_to {
        let t = r.path[k];
        // The attack comes from the latest territory of the run beside it: after a fork, the
        // launch stack it forked from.
        let from = visited
            .iter()
            .rev()
            .find(|&&v| ADJACENT[v] & 1 << t != 0)
            .copied()
            .unwrap_or(visited[visited.len() - 1]);
        let share = match ends.iter().position(|&e| e == k) {
            None => 1,
            Some(end) => {
                let n = ends.len() as i32;
                1.max(arrive / n + i32::from((end as i32) < arrive % n))
            }
        };
        take_one(b, me, from, t, share, r.path.len() == 1);
        visited.push(t);
    }
}

/// The board when every route succeeds, each arriving with its expected armies.
pub(crate) fn success_board(b: &Board, me: Seat, cp: &CapturePlan) -> Board {
    let mut out = *b;
    for (r, &arrive) in cp.routes.iter().zip(&cp.arrive) {
        run_route(&mut out, me, r, r.path.len(), 1.max(round(arrive)));
    }
    out
}

/// The board when the plan falls short in its likeliest way: routes better than even succeed,
/// the rest stop at their likeliest stopping place (at least one stops).
pub(crate) fn failure_board(b: &Board, me: Seat, cp: &CapturePlan) -> Board {
    let mut out = *b;
    let mut weakest = 0;
    for (i, &p) in cp.p_route.iter().enumerate() {
        if p < cp.p_route[weakest] {
            weakest = i;
        }
    }
    let all_succeed = cp.p_route.iter().all(|&p| p >= 0.5);
    for (i, r) in cp.routes.iter().enumerate() {
        let fails = cp.p_route[i] < 0.5 || (all_succeed && i == weakest);
        if !fails {
            run_route(&mut out, me, r, r.path.len(), 1.max(round(cp.arrive[i])));
            continue;
        }
        let defenders: Vec<i32> = r.path.iter().map(|&t| out.armies[t]).collect();
        let (at, attackers) = stop_of(out.armies[r.source], &defenders);
        let stopped = r.path[at];
        let left = surviving_defenders(attackers, out.armies[stopped]);
        run_route(&mut out, me, r, at, 1);
        let last = if at == 0 { r.source } else { r.path[at - 1] };
        out.armies[last] = 1;
        out.armies[stopped] = left;
    }
    out
}

/// The defender at which a run is likeliest to stop, and the attackers reaching it, walking the
/// expected armies forward. A run spent before a defender reaches it with none.
fn stop_of(armies: i32, defenders: &[i32]) -> (usize, i32) {
    let mut a = armies - 1;
    for (i, &d) in defenders.iter().enumerate() {
        if fights::win(a, d) < 0.5 || i == defenders.len() - 1 {
            return (i, a);
        }
        let left = a - d - 1;
        if left <= 0 {
            return (i + 1, 0);
        }
        a = left;
    }
    unreachable!("a run has at least one defender")
}

/// The defenders left, on average, when `a` attackers fail to take `d`: all of them when no
/// attacker reaches it.
fn surviving_defenders(a: i32, d: i32) -> i32 {
    if a <= 0 {
        return d;
    }
    let o = crate::odds::battle_outcome(a as usize, d.max(1) as usize);
    let fails: f64 = o.fail[1..].iter().sum();
    let left: f64 = o.fail.iter().enumerate().map(|(y, f)| y as f64 * f).sum();
    if fails > 0.0 {
        1.max(round(left / fails))
    } else {
        1
    }
}

/// Armies placed on a launch stack beyond what its routes were costed with march with its first
/// route.
fn carrying(b: &Board, after: &Board, cp: &CapturePlan) -> CapturePlan {
    let mut spare = [None::<i32>; N];
    for (r, &alloc) in cp.routes.iter().zip(&cp.alloc) {
        let s = spare[r.source].unwrap_or(after.armies[r.source] - b.armies[r.source]);
        spare[r.source] = Some(s - alloc);
    }
    let mut out = cp.clone();
    for (r, arrive) in cp.routes.iter().zip(out.arrive.iter_mut()) {
        if let Some(extra) = spare[r.source].take() {
            *arrive += extra.max(0) as f64;
        }
    }
    out
}

/// A plan's end of turn, valued. A run that ends behind my lines leaves its stack there for the
/// turn's fortify to take back to the front, so that stack isn't charged as idle.
fn value_of(b: &Board, judge: &Judge, cp: Option<&CapturePlan>) -> f64 {
    let bd = breakdown(b, judge);
    let Some(cp) = cp else { return bd.value };
    let mut stranded = 0;
    for r in &cp.routes {
        let end = r.path[r.path.len() - 1];
        if b.owner[end] == judge.me && !b.enemy_beside(end) {
            stranded = stranded.max(b.armies[end] - 1);
        }
    }
    bd.value + judge.prefs.idle_weight * stranded as f64 / bd.total
}

fn score_capture(b: &Board, after: &Board, judge: &Judge, cp: &CapturePlan, carry: bool) -> f64 {
    let p = cp.p_success;
    let win = if p > 0.001 {
        let carried;
        let cp_end = if carry {
            carried = carrying(b, after, cp);
            &carried
        } else {
            cp
        };
        value_of(&success_board(after, judge.me, cp_end), judge, Some(cp))
    } else {
        0.0
    };
    let lose = if p < 0.999 {
        value_of(&failure_board(after, judge.me, cp), judge, None)
    } else {
        0.0
    };
    p * win + (1.0 - p) * lose
}

/// Target sets worth a plan: the eight best single captures, small continents to complete, and
/// victims. Under a common threat the others are allies (their land only for the turn's card,
/// never a continent break, a kill only when the cards force a trade); a card-less victim at a
/// table of five or more is a buffer, never finished.
fn candidate_targets(
    b: &Board,
    scan: &Scan,
    me: Seat,
    to_place: i32,
    threat: Option<Seat>,
) -> Vec<(PlanKind, Vec<usize>)> {
    let mut out = Vec::new();
    let ally = |t: usize| threat.is_some_and(|x| x != me && b.owner[t] != x);
    let ally_blocked = |targets: u64| {
        territories_in(targets)
            .any(|t| ally(t) && (b.card_earned || b.holds(b.owner[t], TERRITORIES[t].continent)))
    };
    let alive = b.alive_count();
    let buffers: Vec<Seat> = b
        .alive_seats()
        .filter(|&v| v != me && b.hand[v as usize] == 0 && alive >= 5)
        .collect();
    let finishes_buffer = |targets: u64| buffers.iter().any(|&v| b.own(v) & !targets == 0);

    let mut singles: Vec<(usize, f64)> = Vec::new();
    for t in territories_in(!b.own(me) & crate::map::ALL_TERRITORIES) {
        let source = territories_in(ADJACENT[t] & b.own(me))
            .map(|n| b.armies[n])
            .max()
            .unwrap_or(0);
        if source == 0 || finishes_buffer(1 << t) || ally_blocked(1 << t) {
            continue;
        }
        let p = fights::win(source - 1 + to_place, b.armies[t]);
        if p < 0.25 {
            continue;
        }
        let breaks = b.holds(b.owner[t], TERRITORIES[t].continent) as u8 as f64;
        singles.push((t, p * (1.0 + breaks) - 0.05 * b.armies[t] as f64));
    }
    singles.sort_by(|x, y| y.1.total_cmp(&x.1).then(x.0.cmp(&y.0)));
    for &(t, _) in singles.iter().take(8) {
        out.push((PlanKind::Capture, vec![t]));
    }

    for &mask in &CONTINENT_MASKS {
        let missing = mask & !b.own(me);
        let n = missing.count_ones();
        if n >= 2
            && n <= mask.count_ones().div_ceil(2)
            && !finishes_buffer(missing)
            && !ally_blocked(missing)
        {
            out.push((PlanKind::Continent, territories_in(missing).collect()));
        }
    }

    for v in b.alive_seats() {
        if v == me || buffers.contains(&v) {
            continue;
        }
        if threat.is_some_and(|x| x != me && v != x) && b.hand[v as usize] + b.hand[me as usize] < 5
        {
            continue;
        }
        if kill_chance(b, scan, me, v, to_place) > 0.02 {
            out.push((PlanKind::Kill, territories_in(b.own(v)).collect()));
        }
    }
    out
}

/// The territories a stack of `armies` on `source` takes in a sweep: always the thinnest enemy
/// territory beside it that it is sure of, the one with more ways on of two as thin, until no
/// capture is sure. A path, never a fork.
fn sweep_path(
    b: &Board,
    me: Seat,
    source: usize,
    armies: i32,
    open: impl Fn(usize) -> bool,
) -> Vec<usize> {
    let mut taken = 0u64;
    let mut path = Vec::new();
    let mut at = source;
    let mut a = armies - 1;
    loop {
        let mut next: Option<(usize, u32)> = None;
        for &t in ADJACENCY[at] {
            if b.owner[t] == me
                || taken & 1 << t != 0
                || !open(t)
                || fights::win(a, b.armies[t]) < SURE
            {
                continue;
            }
            let onward = (ADJACENT[t] & !b.own(me) & !taken).count_ones();
            let better = match next {
                None => true,
                Some((n, o)) => {
                    b.armies[t] < b.armies[n] || (b.armies[t] == b.armies[n] && onward > o)
                }
            };
            if better {
                next = Some((t, onward));
            }
        }
        let Some((t, _)) = next else { return path };
        taken |= 1 << t;
        path.push(t);
        a = round(fights::arrive(a, b.armies[t])) - 1;
        at = t;
        if a <= 0 {
            return path;
        }
    }
}

/// The sweeps worth a plan: from the two stacks whose sweeps run longest, everything to place on
/// the stack, the whole sweep and its first half. Under a common threat a sweep goes only through
/// the threat; a buffer is never finished.
fn sweep_plans(b: &Board, me: Seat, to_place: i32, threat: Option<Seat>) -> Vec<CapturePlan> {
    let alive = b.alive_count();
    let buffer = |s: Seat| s != me && b.hand[s as usize] == 0 && alive >= 5;
    let open = |t: usize| threat.is_none_or(|x| x == me || b.owner[t] == x);
    let sparing = |path: Vec<usize>| -> Vec<usize> {
        let mut left: [u32; MAX_SEATS] = std::array::from_fn(|s| b.count(s as Seat));
        for (i, &t) in path.iter().enumerate() {
            let s = b.owner[t];
            if buffer(s) {
                left[s as usize] -= 1;
                if left[s as usize] == 0 {
                    return path[..i].to_vec();
                }
            }
        }
        path
    };
    let mut found: Vec<(usize, Vec<usize>)> = Vec::new();
    for t in territories_in(b.own(me)) {
        if !b.enemy_beside(t) || b.armies[t] + to_place < 3 {
            continue;
        }
        let path = sparing(sweep_path(b, me, t, b.armies[t] + to_place, open));
        if path.len() >= 2 {
            found.push((t, path));
        }
    }
    found.sort_by(|x, y| {
        y.1.len()
            .cmp(&x.1.len())
            .then(b.armies[y.0].cmp(&b.armies[x.0]))
            .then(x.0.cmp(&y.0))
    });
    let mut out = Vec::new();
    for (source, path) in found.into_iter().take(2) {
        let half = path.len().div_ceil(2);
        for k in [path.len(), half] {
            if k < 2 || (k == half && half == path.len()) {
                continue;
            }
            let route = path[..k].to_vec();
            let defenders: Vec<usize> = route.iter().map(|&t| b.armies[t] as usize).collect();
            let run = path_run((b.armies[source] + to_place) as usize, &defenders);
            out.push(CapturePlan {
                routes: vec![Route {
                    source,
                    path: route,
                }],
                alloc: vec![to_place],
                leftover: 0,
                p_route: vec![run.p_success],
                p_success: run.p_success,
                arrive: vec![run.arrive],
            });
        }
    }
    out
}

/// A target set's plans: the capture planned to the three bars of sureness (90%, 99%, every army
/// that still helps), each with its placement and its value.
pub(crate) fn target_plans(
    b: &Board,
    judge: &Judge,
    to_place: i32,
    kind: PlanKind,
    targets: &[usize],
    income: &[f64; MAX_SEATS],
    out: &mut Vec<Plan>,
) {
    let me = judge.me;
    let horizon = judge.prefs.income_horizon;
    let ordered = cheap_groups_first(b, targets);
    let variants: &[f64] = if to_place > 0 {
        &[0.9, 0.99, 1.0]
    } else {
        &[1.0]
    };
    for &enough in variants {
        let Some(cp) = plan_capture(b, me, &ordered, to_place, enough) else {
            continue;
        };
        if cp
            .routes
            .iter()
            .zip(&cp.alloc)
            .any(|(r, &a)| b.armies[r.source] + a < 2)
        {
            continue;
        }
        let mut place = [0; N];
        for (r, &a) in cp.routes.iter().zip(&cp.alloc) {
            place[r.source] += a;
        }
        if enough < 1.0 {
            guard_allocation(b, me, cp.leftover, &mut place, income, horizon);
        } else if let Some(r) = cp.routes.first() {
            place[r.source] += cp.leftover;
        }
        let after = placed(b, &place);
        let value = score_capture(b, &after, judge, &cp, true);
        let done = cp.leftover == 0 && enough < 1.0;
        out.push(Plan {
            kind,
            capture: Some(cp),
            place,
            value,
        });
        if done {
            break;
        }
    }
}

/// Every plan for this position, scored.
pub fn plans(b: &Board, judge: &Judge, to_place: i32) -> Vec<Plan> {
    let me = judge.me;
    let scan = Scan::new(b);
    let income = expected_income(b, me);
    let threat = breakdown(b, judge).threat;
    let horizon = judge.prefs.income_horizon;
    let mut out = Vec::new();

    let hold = |place: [i32; N], out: &mut Vec<Plan>| {
        let value = value_of(&placed(b, &place), judge, None);
        out.push(Plan {
            kind: PlanKind::Hold,
            capture: None,
            place,
            value,
        });
    };
    let mut stack = [0; N];
    stack_allocation(b, me, to_place, &mut stack);
    hold(stack, &mut out);
    if to_place > 0 {
        let mut guard = [0; N];
        guard_allocation(b, me, to_place, &mut guard, &income, horizon);
        hold(guard, &mut out);
    }

    for (kind, targets) in candidate_targets(b, &scan, me, to_place, threat) {
        target_plans(b, judge, to_place, kind, &targets, &income, &mut out);
    }

    for cp in sweep_plans(b, me, to_place, threat) {
        let mut place = [0; N];
        if to_place > 0 {
            place[cp.routes[0].source] = to_place;
        }
        let after = placed(b, &place);
        let value = score_capture(b, &after, judge, &cp, false);
        out.push(Plan {
            kind: PlanKind::Sweep,
            capture: Some(cp),
            place,
            value,
        });
    }
    out
}

thread_local! {
    static BEST: Memo<Plan> = new_memo(12);
}

/// The plan to commit to: the best, a kill held to the commit margin. Remembered by the board, the
/// armies to place and the judge.
pub fn best_plan(b: &Board, judge: &Judge, to_place: i32) -> Plan {
    let scan = Scan::new(b);
    let key = board_hash(b, &scan) ^ judge.id ^ mix128(0xbe57, to_place as u32 as u64);
    remembered(&BEST, key, || {
        let mut best: Option<Plan> = None;
        let mut best_kill: Option<Plan> = None;
        for p in plans(b, judge, to_place) {
            let slot = if p.kind == PlanKind::Kill {
                &mut best_kill
            } else {
                &mut best
            };
            if slot.as_ref().is_none_or(|s| p.value > s.value) {
                *slot = Some(p);
            }
        }
        let best = best.expect("the planner always has a hold");
        match best_kill {
            Some(k) if k.value > best.value + judge.prefs.kill_commit_margin => k,
            _ => best,
        }
    })
}

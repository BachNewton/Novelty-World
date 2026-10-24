//! The opponent model (`ideas/native-v1.md`): what I believe each other seat does with its turn
//! before my next one: whom it kills, who is the common threat, and how hard its turn lands on me.
//! Its pairwise parts (each opponent's kill chances, and its blows and sweep against each seat)
//! are remembered by the region of the board each reads, so a plan that changes only my side of
//! the board recomputes only the parts that read it.

use super::board::{income_of, mix128, round, spread, Board, Scan, N};
use super::fights;
use super::hands::{card_worth, hand_value, hidden_cards, hidden_hand, size, DRAW_CHANCE};
use super::knobs::{BorderMode, Knobs, Reprice};
use super::memo::{new_memo, remembered, Memo};
use super::params::{OpponentModel, Preferences};
use super::routes::kill_chance;
use crate::engine::{Event, EventKind, Seat, MAX_SEATS};
use crate::list::List;
use crate::map::{territories_in, ADJACENCY, CONTINENTS, CONTINENT_MASKS};

/// A capture an opponent's sweep counts as sure: Balanced Blitz makes the favourite's fight
/// certain, so it takes every such territory it can reach.
pub const SURE: f64 = 0.9;
/// The most third-party territories a sweep crosses on its way to me.
const WAY_IN: usize = 2;

/// What this game has shown of each opponent: per attacker, per victim, the territories taken,
/// each turn of the attacker's weighing `decay` times the one after it. Only the opponents' turns
/// feed it, so it holds still through my own.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Record {
    pub taken: [[f64; MAX_SEATS]; MAX_SEATS],
}

impl Record {
    pub fn read(history: &[Event], decay: f64, me: Seat) -> Record {
        let mut r = Record::default();
        for e in history {
            match e.kind {
                EventKind::TurnStarted { seat, .. } => {
                    for x in &mut r.taken[seat as usize] {
                        *x *= decay;
                    }
                }
                EventKind::Captured { seat, from, .. } if seat != me => {
                    r.taken[seat as usize][from as usize] += 1.0
                }
                _ => {}
            }
        }
        r
    }

    pub fn hash(&self) -> u128 {
        self.taken.iter().flatten().fold(0u128, |h, x| {
            mix128(h as u64 ^ (h >> 64) as u64, x.to_bits())
        })
    }
}

/// An opponent's turn against one seat, before any preference prices it.
#[derive(Clone, Copy, Debug, Default)]
pub struct Turn {
    /// The most armies one exchange wins.
    pub exchange: f64,
    /// Per continent the seat holds, the best chance of breaking it.
    pub break_chance: [f64; 6],
    /// The sweep: the armies the seat loses, and the territories taken from it.
    pub lost: f64,
    pub taken: u64,
}

impl Turn {
    /// The blows' cost, a broken continent's bonus counted over `horizon` turns.
    pub fn blow_cost(&self, horizon: f64) -> f64 {
        let mut worst = self.exchange;
        for (c, &p) in self.break_chance.iter().enumerate() {
            worst = worst.max(p * (horizon * CONTINENTS[c].bonus as f64));
        }
        worst
    }

    /// The sweep's cost to `land`: its armies lost, and its income lost over `horizon` turns.
    pub fn sweep_cost(&self, land: u64, horizon: f64, continent_weight: f64) -> f64 {
        if self.lost == 0.0 {
            return 0.0;
        }
        self.lost
            + horizon
                * (income_of(land, continent_weight)
                    - income_of(land & !self.taken, continent_weight))
    }
}

thread_local! {
    static TURNS: Memo<Turn> = new_memo(15);
}

/// `q`'s turn against `v`: its best blows and its sweep. Remembered by what it reads: `v`'s land,
/// `q`'s stacks beside it, and `q`'s biggest stack with the territories within two of it.
pub fn turn_against(b: &Board, scan: &Scan, v: Seat, q: Seat, q_income: i32) -> Turn {
    let land = b.own(v);
    let biggest = biggest_stack(b, q);
    let reach = biggest.map_or(0, |t| spread(spread(1 << t)));
    let key = scan.full_of(land | (spread(land) & b.own(q)) | reach)
        ^ mix128(
            0x7a2e << 32 | (q as u64) << 8 | v as u64,
            q_income as u32 as u64 | (biggest.map_or(63, |t| t as u64)) << 32,
        );
    remembered(&TURNS, key, || {
        let (exchange, break_chance) = blows(b, v, q, q_income);
        let (lost, taken) = sweep(b, v, q, q_income, biggest);
        Turn {
            exchange,
            break_chance,
            lost,
            taken,
        }
    })
}

fn biggest_stack(b: &Board, q: Seat) -> Option<usize> {
    let mut best: Option<usize> = None;
    for t in territories_in(b.own(q)) {
        if best.is_none_or(|x| b.armies[t] > b.armies[x]) {
            best = Some(t);
        }
    }
    best
}

/// The armies `q`'s strongest territory beside `t` can attack with, or -1 with none beside it. A
/// territory on one army still threatens: `q`'s income lands there first.
fn strongest_beside(b: &Board, q: Seat, t: usize) -> i32 {
    territories_in(crate::map::ADJACENT[t] & b.own(q))
        .map(|n| b.armies[n] - 1)
        .max()
        .unwrap_or(-1)
}

/// `q`'s best single blow against `v`: the most armies one exchange wins (big battles favour the
/// attacker), and each continent of `v`'s it can break, reached through at most one territory of
/// `v`'s on the way.
fn blows(b: &Board, v: Seat, q: Seat, q_income: i32) -> (f64, [f64; 6]) {
    let land = b.own(v);
    let mut worst = 0.0f64;
    for t in territories_in(land) {
        let a = strongest_beside(b, q, t);
        if a >= 0 && a + q_income > 0 {
            worst = worst.max(fights::exchange(a + q_income, b.armies[t]));
        }
    }
    let mut breaks = [0.0; 6];
    for (c, &mask) in CONTINENT_MASKS.iter().enumerate() {
        if land & mask != mask {
            continue;
        }
        let mut p = 0.0f64;
        for m in territories_in(mask) {
            let direct = strongest_beside(b, q, m);
            if direct >= 0 && direct + q_income > 0 {
                p = p.max(fights::win(direct + q_income, b.armies[m]));
            }
            for &n in ADJACENCY[m] {
                if b.owner[n] != v {
                    continue;
                }
                let via = strongest_beside(b, q, n);
                if via >= 0 && via + q_income > 0 {
                    let run = fights::run(via + 1 + q_income, None, &[b.armies[n], b.armies[m]]);
                    p = p.max(run.p_success);
                }
            }
        }
        breaks[c] = p;
    }
    (worst, breaks)
}

/// `q`'s sweep through `v`'s territories: the worse of the one from its stacks beside `v` and the
/// one from its biggest stack through a third player's land.
fn sweep(b: &Board, v: Seat, q: Seat, q_income: i32, biggest: Option<usize>) -> (f64, u64) {
    let direct = sweep_beside(b, v, q, q_income);
    match biggest.and_then(|t| sweep_through(b, v, q, q_income, t)) {
        Some(via) if via.0 > direct.0 => via,
        _ => direct,
    }
}

/// From `q`'s stacks beside `v`, its income on the biggest, the cheapest territory it is sure of,
/// on and on until no capture is sure. A stack goes on from any territory it has taken (the
/// move-in can leave armies at a fork), each capture leaving one behind.
fn sweep_beside(b: &Board, v: Seat, q: Seat, q_income: i32) -> (f64, u64) {
    let land = b.own(v);
    let beside = spread(land) & b.own(q);
    let mut biggest: Option<usize> = None;
    let mut stacks = [usize::MAX; N];
    let mut ready: Vec<i32> = Vec::new();
    for t in territories_in(beside) {
        stacks[t] = ready.len();
        ready.push(b.armies[t] - 1);
        if biggest.is_none_or(|x| b.armies[t] > b.armies[x]) {
            biggest = Some(t);
        }
    }
    let Some(biggest) = biggest else {
        return (0.0, 0);
    };
    ready[stacks[biggest]] += q_income;
    sweep_from(b, land, stacks, ready)
}

/// The sweep loop over `land`, from stacks `stacks` (each territory's stack index) of `ready`
/// attackers.
fn sweep_from(b: &Board, land: u64, mut stacks: [usize; N], mut ready: Vec<i32>) -> (f64, u64) {
    let mut left = land;
    let mut lost = 0.0;
    loop {
        let mut best: Option<(usize, usize)> = None;
        for t in territories_in(left) {
            let mut stack = usize::MAX;
            for &n in ADJACENCY[t] {
                let s = stacks[n];
                if s != usize::MAX
                    && ready[s] > 0
                    && (stack == usize::MAX || ready[s] > ready[stack])
                {
                    stack = s;
                }
            }
            if stack == usize::MAX || fights::win(ready[stack], b.armies[t]) < SURE {
                continue;
            }
            if best.is_none_or(|(_, to)| b.armies[t] < b.armies[to]) {
                best = Some((stack, t));
            }
        }
        let Some((stack, to)) = best else {
            return (lost, land & !left);
        };
        let moved = fights::arrive(ready[stack], b.armies[to]);
        lost += b.armies[to] as f64;
        left &= !(1 << to);
        stacks[to] = stack;
        ready[stack] = 0.max(round(moved) - 1);
    }
}

/// `q`'s sweep from its biggest stack, everything to place on it, when that stack isn't beside
/// `v`: it breaks through at most two of a third player's territories, each a sure capture, to the
/// one beside `v`'s land it reaches with the most armies, and sweeps `v` from there. None when
/// there is no way in.
fn sweep_through(b: &Board, v: Seat, q: Seat, q_income: i32, biggest: usize) -> Option<(f64, u64)> {
    let land = b.own(v);
    let beside_v = spread(land) & !land;
    if beside_v & 1 << biggest != 0 {
        return None;
    }
    let blocked = b.own(q) | land;
    let mut best: Option<(usize, i32)> = None;
    let mut consider = |at: usize, armies: i32| {
        if best.is_none_or(|(_, a)| armies > a) {
            best = Some((at, armies));
        }
    };
    let start = b.armies[biggest] - 1 + q_income;
    for &n in ADJACENCY[biggest] {
        let Some(left) = sure_step(b, blocked, 0, start, n) else {
            continue;
        };
        if beside_v & 1 << n != 0 {
            consider(n, left);
        } else if WAY_IN > 1 {
            for &m in ADJACENCY[n] {
                let Some(left2) = sure_step(b, blocked, 1 << n, left, m) else {
                    continue;
                };
                if beside_v & 1 << m != 0 {
                    consider(m, left2);
                }
            }
        }
    }
    let (at, armies) = best?;
    let mut stacks = [usize::MAX; N];
    stacks[at] = 0;
    Some(sweep_from(b, land, stacks, vec![armies]))
}

/// The armies left to go on after a sure capture of `n` by `armies`, or None when `n` can't be
/// taken on the way.
fn sure_step(b: &Board, blocked: u64, path: u64, armies: i32, n: usize) -> Option<i32> {
    if (blocked | path) & 1 << n != 0 || fights::win(armies, b.armies[n]) < SURE {
        return None;
    }
    let left = round(fights::arrive(armies, b.armies[n])) - 1;
    (left > 0).then_some(left)
}

/// Each seat's expected armies next turn: income, the set its hand is expected to trade, and a
/// later seat's first-turn bonus. Mine is the board's income alone.
pub fn expected_income(b: &Board, me: Seat) -> [f64; MAX_SEATS] {
    let mut income = [0.0; MAX_SEATS];
    for q in b.opponents_in_order(me) {
        income[q as usize] = b.income(q) as f64
            + hidden_hand(b.hand[q as usize]).next_trade
            + b.first_turn_bonus(q) as f64;
    }
    income[me as usize] = b.income(me) as f64;
    income
}

/// My hand's worth in armies now: the cards I know, any taken unseen, and the card this turn's
/// capture draws.
pub fn my_cards(b: &Board, me: Seat) -> f64 {
    hand_value(b.known, unknown_cards(b, me))
}

pub fn unknown_cards(b: &Board, me: Seat) -> u8 {
    (b.hand[me as usize] + b.card_earned as u8).saturating_sub(size(b.known))
}

pub struct Forecast {
    /// Everyone's power, its armies priced by the settings' `power`.
    pub power: [f64; MAX_SEATS],
    pub total: f64,
    /// The common-threat bar at this table.
    pub ratio: f64,
    /// The common threat `power` names.
    pub threat: Option<Seat>,
    /// The common threat the opponents aim by and the planner builds its plans round: face
    /// power's, unless the settings re-price fully.
    pub plan_threat: Option<Seat>,
    /// The chance each seat outlives every opponent's turn before mine.
    pub spared: [f64; MAX_SEATS],
    /// My expected border losses: each opponent's aim times its hit, summed.
    pub border_loss: f64,
    pub income: [f64; MAX_SEATS],
}

pub fn forecast(
    b: &Board,
    scan: &Scan,
    me: Seat,
    prefs: &Preferences,
    om: &OpponentModel,
    record: &Record,
    knobs: &Knobs,
) -> Forecast {
    let h = prefs.income_horizon;
    let my_hand = b.hand[me as usize] + b.card_earned as u8;
    let card_income = DRAW_CHANCE * card_worth();
    let income = expected_income(b, me);
    let mut alive: List<Seat, MAX_SEATS> = List::new();
    b.alive_seats().for_each(|s| alive.push(s));
    let mut opponents: List<Seat, MAX_SEATS> = List::new();
    b.opponents_in_order(me).for_each(|s| opponents.push(s));

    let mut power = [0.0; MAX_SEATS];
    for &p in alive.iter() {
        let weight = if p == me {
            prefs.my_continent_weight
        } else {
            1.0
        };
        let cards = if p == me {
            prefs.my_card_weight * my_cards(b, me)
        } else {
            hidden_cards(b.hand[p as usize])
        };
        power[p as usize] =
            b.armies_of(p) as f64 + h * (income_of(b.own(p), weight) + card_income) + cards;
    }
    // Priced power is face power less each seat's armies' discount. It is carried beside face
    // power through the kills below, which scale a victim's whole power and add only cards and
    // income to the killer's, so the discount is scaled exactly as the armies it discounts.
    let priced = knobs.armies_priced();
    let mut priced_power = power;
    if priced {
        for &p in alive.iter() {
            let armies = b.armies_of(p) as f64;
            let discount = armies - knobs.priced_armies(armies, income_of(b.own(p), 1.0));
            priced_power[p as usize] -= discount;
        }
    }

    // Each opponent takes at most one victim before my next turn: it weighs the kills open to it
    // by what they pay, best first, going for each at its measured rate only if it passed over
    // every better one. A third player's death moves its cards and its land's income to the killer.
    let mut spared = [1.0; MAX_SEATS];
    let my_count = b.count(me);
    for &q in opponents.iter() {
        let to_place = round(income[q as usize]);
        let mut open: List<(Seat, f64, f64), MAX_SEATS> = List::new();
        for &v in alive.iter() {
            if v == q {
                continue;
            }
            let hand = if v == me { my_hand } else { b.hand[v as usize] };
            if hand == 0 && v != me {
                continue;
            }
            let p = kill_chance(b, scan, q, v, to_place);
            if p == 0.0 {
                continue;
            }
            let pays = hand + b.hand[q as usize] >= 5 || hand >= 3 || (v == me && my_count <= 2);
            let rate = if v == me {
                om.my_kill_rate
            } else {
                om.kill_rate
            };
            let taken =
                p * if p >= om.kill_bar || pays {
                    1.0
                } else {
                    om.unpaid_kill_chance
                } * rate;
            open.push((v, taken, taken * (hand as f64 + 1.0)));
        }
        open.as_mut_slice()
            .sort_by(|x, y| y.2.total_cmp(&x.2).then(x.0.cmp(&y.0)));
        let mut passed = 1.0;
        for &(v, taken, _) in open.iter() {
            let chance = passed * taken;
            passed -= chance;
            spared[v as usize] *= 1.0 - chance;
            if v == me {
                continue;
            }
            let gain = income_of(b.own(q) | b.own(v), 1.0) - income_of(b.own(q), 1.0);
            power[q as usize] += chance * (hidden_cards(b.hand[v as usize]) + h * gain);
            power[v as usize] *= 1.0 - chance;
            if priced {
                priced_power[q as usize] += chance * (hidden_cards(b.hand[v as usize]) + h * gain);
                priced_power[v as usize] *= 1.0 - chance;
            }
        }
    }
    let ratio = om.leader_ratio + om.leader_ratio_per_player * (alive.len() as f64 - 4.0);
    let threat_of = |power: &[f64; MAX_SEATS]| {
        let mut threat = None;
        for &p in alive.iter() {
            if alive
                .iter()
                .all(|&q| q == p || power[p as usize] > ratio * power[q as usize])
            {
                threat = Some(p);
            }
        }
        threat
    };
    let face_threat = threat_of(&power);
    let (power, threat) = if priced {
        (priced_power, threat_of(&priced_power))
    } else {
        (power, face_threat)
    };
    let total: f64 = alive.iter().map(|&p| power[p as usize]).sum();
    let plan_threat = if priced && knobs.reprice == Reprice::Full {
        threat
    } else {
        face_threat
    };

    // Each opponent's turn against me, weighted by how likely I am the one it hits: the worse of
    // its best blow and its sweep. Summed: each takes its own turn.
    let mut border_loss = 0.0;
    let mut worst_loss = 0.0f64;
    let mut counted = 0;
    let my_land = b.own(me);
    for &q in opponents.iter() {
        let q_income = round(income[q as usize]);
        let mut seen = b.neighbour_seats(q);
        let mine = turn_against(b, scan, me, q, q_income);
        if seen & 1 << me == 0 {
            if mine.lost == 0.0 {
                continue;
            }
            seen |= 1 << me;
        }
        let count = seen.count_ones() as f64;
        let mut aim = if plan_threat == Some(me) {
            om.leader_aim
        } else if plan_threat.is_some_and(|t| t != q) {
            om.ally_aim
        } else {
            let hurt = |v: Seat, t: &Turn| t.blow_cost(h).max(t.sweep_cost(b.own(v), h, 1.0));
            let hurt_me = hurt(me, &mine);
            let mut all = 0.0;
            for v in 0..b.players {
                if seen & 1 << v == 0 {
                    continue;
                }
                all += if v == me {
                    hurt_me
                } else {
                    hurt(v, &turn_against(b, scan, v, q, q_income))
                };
            }
            let even = 1.0 / count;
            let share = if all > 0.0 { hurt_me / all } else { even };
            even + om.aim_slope * (share - even)
        };
        let row = &record.taken[q as usize];
        let taken: f64 = (0..b.players)
            .filter(|&v| seen & 1 << v != 0)
            .map(|v| row[v as usize])
            .sum();
        aim = (om.history_prior * aim + row[me as usize]) / (om.history_prior + taken);
        let cw = prefs.my_continent_weight;
        let hit = mine.blow_cost(h * cw).max(mine.sweep_cost(my_land, h, cw));
        border_loss += aim * hit;
        worst_loss = worst_loss.max(aim * hit);
        counted += 1;
    }
    let border_loss = match knobs.border {
        BorderMode::Sum => border_loss,
        BorderMode::Max => worst_loss,
        BorderMode::Mean if counted == 0 => 0.0,
        BorderMode::Mean => border_loss / counted as f64,
    };
    Forecast {
        power,
        total,
        ratio,
        threat,
        plan_threat,
        spared,
        border_loss,
        income,
    }
}

/// What the opponents' believed sweeps cost me, summed, and the most territories one of them
/// takes.
pub fn believed_sweeps(b: &Board, scan: &Scan, me: Seat, prefs: &Preferences) -> (f64, u32) {
    let income = expected_income(b, me);
    let mut cost = 0.0;
    let mut most = 0;
    for q in b.opponents_in_order(me) {
        let t = turn_against(b, scan, me, q, round(income[q as usize]));
        cost += t.sweep_cost(b.own(me), prefs.income_horizon, prefs.my_continent_weight);
        most = most.max(t.taken.count_ones());
    }
    (cost, most)
}

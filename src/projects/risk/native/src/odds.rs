//! `src/projects/risk/bots/rule-v1/odds.ts`: exact attack odds under the ranked rules, a blitz by
//! Balanced Blitz and a single battle by fair dice, mixed the best way. The caches are the
//! TypeScript's in spirit only: they change time, never answers.

use crate::blitz::{balanced_fight, capture_chance, fair_fight};
use crate::jsmath::{js_max, js_min, js_round};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::OnceLock;

/// For each attacker dice (1–3) and defender dice (1–2): the chance the attacker loses k armies.
fn roll_table() -> &'static [Vec<f64>] {
    static ROLL: OnceLock<Vec<Vec<f64>>> = OnceLock::new();
    ROLL.get_or_init(|| {
        let mut table = Vec::new();
        for ad in 1..=3usize {
            for dd in 1..=2usize {
                let pairs = ad.min(dd);
                let mut counts = vec![0usize; pairs + 1];
                let total = 6usize.pow((ad + dd) as u32);
                for code in 0..total {
                    let mut c = code;
                    let mut a = Vec::with_capacity(ad);
                    let mut d = Vec::with_capacity(dd);
                    for _ in 0..ad {
                        a.push(c % 6);
                        c /= 6;
                    }
                    for _ in 0..dd {
                        d.push(c % 6);
                        c /= 6;
                    }
                    a.sort_by(|x, y| y.cmp(x));
                    d.sort_by(|x, y| y.cmp(x));
                    let lost = (0..pairs).filter(|&i| a[i] <= d[i]).count();
                    counts[lost] += 1;
                }
                table.push(counts.iter().map(|&n| n as f64 / total as f64).collect());
            }
        }
        table
    })
}

/// The chance the attacker loses k armies in one battle of `a` attackers against `d`.
pub fn roll_odds(a: usize, d: usize) -> &'static [f64] {
    &roll_table()[(a.min(3) - 1) * 2 + (d.min(2) - 1)]
}

/// How an attack of `a` against `d` ends when played the best way: `win[x]` is the chance it
/// captures with x attackers left (x ≥ 1), `fail[y]` the chance it runs out with y defenders left.
#[derive(Clone, Debug)]
pub struct BattleOutcome {
    pub win: Vec<f64>,
    pub fail: Vec<f64>,
    pub p_win: f64,
    /// The fewest survivors with a chance worth counting.
    pub win_from: usize,
    /// Whether the best way starts with a single battle rather than a blitz.
    pub roll: bool,
    /// The sum of x · win[x] over every x ≥ 1.
    pub survivors: f64,
}

const NEGLIGIBLE: f64 = 1e-12;
const ROLL_LIMIT: usize = 60;
const EXACT_LIMIT: usize = 300;
const DENSE: usize = 100;

type Cache<K, V> = RefCell<HashMap<K, Rc<V>>>;

thread_local! {
    static DENSE_OUTCOMES: RefCell<Vec<Option<Rc<BattleOutcome>>>> = RefCell::new(vec![None; DENSE * DENSE]);
    static OUTCOMES: Cache<(usize, usize), BattleOutcome> = RefCell::new(HashMap::new());
    static RUNS: Cache<(usize, Vec<usize>), PathRun> = RefCell::new(HashMap::new());
    static EXCHANGES: RefCell<Vec<f64>> = RefCell::new(vec![f64::NAN; DENSE * DENSE]);
}

/// A large fight's outcome from the same fight scaled down, its survivors scaled back up.
fn scaled_outcome(a: usize, d: usize) -> BattleOutcome {
    let f = EXACT_LIMIT as f64 / (a + d) as f64;
    let sa = js_max(1.0, js_round(a as f64 * f));
    let sd = js_max(1.0, js_round(d as f64 * f));
    let small = battle_outcome(sa as usize, sd as usize);
    let af = a as f64;
    let df = d as f64;
    let mut win = vec![0.0f64; a + 1];
    let mut fail = vec![0.0f64; d + 1];
    for x in 1..=sa as usize {
        let at = js_min(af, js_max(1.0, js_round((x as f64 * af) / sa)));
        win[at as usize] += small.win[x];
    }
    for y in 1..=sd as usize {
        let at = js_min(df, js_max(1.0, js_round((y as f64 * df) / sd)));
        fail[at as usize] += small.fail[y];
    }
    finish(win, fail, small.roll)
}

fn blitz_outcome(a: usize, d: usize) -> BattleOutcome {
    let fight = balanced_fight(a, d).unwrap_or_else(|| Rc::new(fair_fight(a, d)));
    let mut win = vec![0.0f64; a + 1];
    let mut fail = vec![0.0f64; d + 1];
    for lost in 0..a {
        win[a - lost] = fight.attacker_lost[lost];
    }
    for lost in 0..d {
        fail[d - lost] = fight.defender_lost[lost];
    }
    finish(win, fail, false)
}

fn finish(win: Vec<f64>, fail: Vec<f64>, roll: bool) -> BattleOutcome {
    let mut p_win = 0.0;
    for &p in &win {
        p_win += p;
    }
    let mut win_from = 1;
    while win_from < win.len() - 1 && win[win_from] < NEGLIGIBLE {
        win_from += 1;
    }
    let mut survivors = 0.0;
    for (x, &w) in win.iter().enumerate().skip(1) {
        survivors += x as f64 * w;
    }
    BattleOutcome {
        win,
        fail,
        p_win,
        win_from,
        roll,
        survivors,
    }
}

/// One battle with the most dice, then the best play from wherever it leaves the fight.
fn roll_outcome(a: usize, d: usize) -> BattleOutcome {
    let mut win = vec![0.0f64; a + 1];
    let mut fail = vec![0.0f64; d + 1];
    let odds = roll_odds(a, d);
    let pairs = odds.len() - 1;
    for (k, &p) in odds.iter().enumerate() {
        let x = a - k;
        let y = d - (pairs - k);
        if y == 0 {
            win[x] += p;
        } else if x == 0 {
            fail[y] += p;
        } else {
            let next = battle_outcome(x, y);
            for (w, &n) in win[1..=x].iter_mut().zip(&next.win[1..=x]) {
                *w += p * n;
            }
            for (f, &n) in fail[1..=y].iter_mut().zip(&next.fail[1..=y]) {
                *f += p * n;
            }
        }
    }
    finish(win, fail, true)
}

pub fn battle_outcome(a: usize, d: usize) -> Rc<BattleOutcome> {
    let small = a < DENSE && d < DENSE;
    let known = if small {
        DENSE_OUTCOMES.with(|c| c.borrow()[a * DENSE + d].clone())
    } else {
        OUTCOMES.with(|c| c.borrow().get(&(a, d)).cloned())
    };
    if let Some(known) = known {
        return known;
    }
    let result = Rc::new(if a + d > EXACT_LIMIT {
        scaled_outcome(a, d)
    } else {
        best_outcome(a, d)
    });
    if small {
        DENSE_OUTCOMES.with(|c| c.borrow_mut()[a * DENSE + d] = Some(result.clone()));
    } else {
        OUTCOMES.with(|c| {
            let mut c = c.borrow_mut();
            if c.len() > 1_500 {
                c.clear();
            }
            c.insert((a, d), result.clone());
        });
    }
    result
}

fn best_outcome(a: usize, d: usize) -> BattleOutcome {
    let blitz = blitz_outcome(a, d);
    if a <= ROLL_LIMIT && d <= ROLL_LIMIT && blitz.p_win < 1.0 {
        let roll = roll_outcome(a, d);
        if roll.p_win > blitz.p_win + 1e-9 {
            return roll;
        }
    }
    blitz
}

/// The chance `a` attackers capture a territory held by `d`, played the best way.
pub fn win_prob(a: usize, d: usize) -> f64 {
    if d == 0 {
        return 1.0;
    }
    if a == 0 {
        return 0.0;
    }
    battle_outcome(a, d).p_win
}

/// The fewest attackers whose blitz is as sure of the capture as committing all `a`.
pub fn blitz_commit(a: usize, d: usize) -> usize {
    let most = (a as i64).min(EXACT_LIMIT as i64 - d as i64);
    if most < 1 {
        return a;
    }
    let most = most as usize;
    let best = capture_chance(most, d);
    if most < a && best < 0.995 {
        return a;
    }
    let mut lo = 1;
    let mut hi = most;
    while lo < hi {
        let k = (lo + hi) >> 1;
        if capture_chance(k, d) >= best - 0.005 {
            hi = k;
        } else {
            lo = k + 1;
        }
    }
    lo
}

/// A run along a path: `armies` stand on the launch territory, the defenders are taken one after
/// another, each capture moving all but one army forward.
#[derive(Clone, Debug)]
pub struct PathRun {
    /// The chance every defender falls.
    pub p_success: f64,
    /// Given success, the expected armies on the last territory taken.
    pub arrive: f64,
    /// The chance the run stops at defender i.
    pub stop_at: Vec<f64>,
}

pub fn path_run(armies: usize, defenders: &[usize]) -> Rc<PathRun> {
    remembered_run(armies, defenders.to_vec())
}

/// The run against `first` and then `defenders`.
pub fn path_run_via(armies: usize, first: usize, defenders: &[usize]) -> Rc<PathRun> {
    let mut all = Vec::with_capacity(defenders.len() + 1);
    all.push(first);
    all.extend_from_slice(defenders);
    remembered_run(armies, all)
}

fn remembered_run(armies: usize, defenders: Vec<usize>) -> Rc<PathRun> {
    let key = (armies, defenders);
    if let Some(known) = RUNS.with(|r| r.borrow().get(&key).cloned()) {
        return known;
    }
    let run = Rc::new(compute_path_run(armies, &key.1));
    RUNS.with(|r| {
        let mut r = r.borrow_mut();
        if r.len() > 3_000 {
            r.clear();
        }
        r.insert(key, run.clone());
    });
    run
}

fn compute_path_run(armies: usize, defenders: &[usize]) -> PathRun {
    let attackers = armies.saturating_sub(1);
    let size = attackers + 1;
    let mut dist = vec![0.0f64; size];
    let mut next = vec![0.0f64; size];
    dist[attackers] = 1.0;
    let mut stop_at = vec![0.0f64; defenders.len()];
    for (i, &defender) in defenders.iter().enumerate() {
        next.fill(0.0);
        let mut lost = 0.0;
        for (x, &m) in dist.iter().enumerate() {
            if m < NEGLIGIBLE {
                continue;
            }
            if x == 0 {
                lost += m;
                continue;
            }
            let o = battle_outcome(x, defender);
            lost += m * (1.0 - o.p_win);
            for s in o.win_from..o.win.len() {
                next[s - 1] += m * o.win[s];
            }
        }
        stop_at[i] = lost;
        std::mem::swap(&mut dist, &mut next);
    }
    let mut p_success = 0.0;
    let mut arrive = 0.0;
    for (x, &m) in dist.iter().enumerate() {
        p_success += m;
        arrive += m * (x + 1) as f64;
    }
    PathRun {
        p_success,
        arrive: if p_success > 0.0 {
            arrive / p_success
        } else {
            0.0
        },
        stop_at,
    }
}

/// The expected attackers lost taking a territory, given the capture.
pub fn expected_loss(a: usize, d: usize) -> f64 {
    let o = battle_outcome(a, d);
    if o.p_win == 0.0 {
        return a as f64;
    }
    let mut survivors = 0.0;
    for (x, &w) in o.win.iter().enumerate().skip(1) {
        survivors += x as f64 * w;
    }
    a as f64 - survivors / o.p_win
}

/// The armies the defender loses beyond what the attacker loses when `a` attack `d` to the end,
/// or 0 when the attacker would come off worse.
pub fn exchange(a: usize, d: usize) -> f64 {
    if a >= DENSE || d >= DENSE {
        return compute_exchange(a, d);
    }
    let id = a * DENSE + d;
    let known = EXCHANGES.with(|e| e.borrow()[id]);
    if !known.is_nan() {
        return known;
    }
    let value = compute_exchange(a, d);
    EXCHANGES.with(|e| e.borrow_mut()[id] = value);
    value
}

fn compute_exchange(a: usize, d: usize) -> f64 {
    let o = battle_outcome(a, d);
    let af = a as f64;
    let df = d as f64;
    let mut attacker_lost = 0.0;
    let mut defender_lost = 0.0;
    for x in 1..o.win.len() {
        attacker_lost += o.win[x] * (a - x) as f64;
        defender_lost += o.win[x] * df;
    }
    for y in 1..o.fail.len() {
        attacker_lost += o.fail[y] * af;
        defender_lost += o.fail[y] * (d - y) as f64;
    }
    js_max(0.0, defender_lost - attacker_lost)
}

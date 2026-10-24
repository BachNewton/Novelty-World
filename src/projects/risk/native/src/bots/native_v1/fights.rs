//! The battle odds the bot asks most, read from tables: `odds.rs`'s exact answers for the small
//! fights, worked out once, so a sweep, a screen or a path run reads a slice instead of a cache.
//! Every answer is `odds.rs`'s, to the bit (a test holds them equal).

use super::board::mix128;
use super::memo::{new_memo, remembered, Memo};
use crate::odds::battle_outcome;
use std::sync::OnceLock;

const SMALL: usize = 64;
/// `odds.rs`'s threshold below which a path run's mass is dropped.
const NEGLIGIBLE: f64 = 1e-12;

struct Fight {
    p_win: f64,
    arrive: f64,
    win_from: usize,
    /// Where `win[win_from..=a]` starts in the table's `wins`.
    at: usize,
}

struct Table {
    fights: Vec<Fight>,
    wins: Vec<f64>,
}

fn table() -> &'static Table {
    static TABLE: OnceLock<Table> = OnceLock::new();
    TABLE.get_or_init(|| {
        let mut fights = Vec::with_capacity(SMALL * SMALL);
        let mut wins = Vec::new();
        for a in 0..SMALL {
            for d in 0..SMALL {
                if a == 0 || d == 0 {
                    fights.push(Fight {
                        p_win: 0.0,
                        arrive: 0.0,
                        win_from: 1,
                        at: 0,
                    });
                    continue;
                }
                let o = battle_outcome(a, d);
                fights.push(Fight {
                    p_win: o.p_win,
                    arrive: if o.p_win > 0.0 {
                        o.survivors / o.p_win
                    } else {
                        0.0
                    },
                    win_from: o.win_from,
                    at: wins.len(),
                });
                wins.extend_from_slice(&o.win[o.win_from..]);
            }
        }
        Table { fights, wins }
    })
}

fn small(a: usize, d: usize) -> Option<&'static Fight> {
    (a < SMALL && d < SMALL).then(|| &table().fights[a * SMALL + d])
}

/// The chance `a` attackers capture a territory held by `d`, played the best way.
pub fn win(a: i32, d: i32) -> f64 {
    if d <= 0 {
        return 1.0;
    }
    if a <= 0 {
        return 0.0;
    }
    let (a, d) = (a as usize, d as usize);
    match small(a, d) {
        Some(f) => f.p_win,
        None => battle_outcome(a, d).p_win,
    }
}

/// The armies that arrive, on average, when `a` attackers capture a territory held by `d`.
pub fn arrive(a: i32, d: i32) -> f64 {
    if a <= 0 {
        return 0.0;
    }
    if d <= 0 {
        return a as f64;
    }
    let (a, d) = (a as usize, d as usize);
    match small(a, d) {
        Some(f) => f.arrive,
        None => {
            let o = battle_outcome(a, d);
            if o.p_win > 0.0 {
                o.survivors / o.p_win
            } else {
                0.0
            }
        }
    }
}

/// A run along a path, as `odds::path_run` gives it: the chance every defender falls, and the
/// armies expected on the last territory taken.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Run {
    pub p_success: f64,
    pub arrive: f64,
}

thread_local! {
    static RUNS: Memo<Run> = new_memo(16);
    static EXCHANGES: Memo<f64> = new_memo(12);
}

/// `odds::exchange`, remembered for the big fights its own table leaves out.
pub fn exchange(a: i32, d: i32) -> f64 {
    let (a, d) = (a.max(0) as usize, d.max(0) as usize);
    if a < 100 && d < 100 {
        return crate::odds::exchange(a, d);
    }
    remembered(&EXCHANGES, mix128(a as u64, d as u64), || {
        crate::odds::exchange(a, d)
    })
}

/// `armies` on the launch territory taking `via` (when some) and then `defenders` one after
/// another, each capture moving all but one army on. Remembered by its arguments' hash.
pub fn run(armies: i32, via: Option<i32>, defenders: &[i32]) -> Run {
    let armies = armies.max(0) as usize;
    let count = defenders.len() + via.is_some() as usize;
    let mut key = mix128(armies as u64 | (count as u64) << 48, 0x9a7);
    for &d in via.iter().chain(defenders) {
        key = mix128((key as u64) ^ d.max(0) as u64, (key >> 64) as u64);
    }
    remembered(&RUNS, key, || {
        compute_run(
            armies,
            via.iter().chain(defenders).map(|&d| d.max(0) as usize),
        )
    })
}

/// `odds.rs`'s path run, its sums in the same order, on the table's distributions.
fn compute_run(armies: usize, defenders: impl Iterator<Item = usize>) -> Run {
    let attackers = armies.saturating_sub(1);
    let size = attackers + 1;
    let mut dist = vec![0.0f64; size];
    let mut next = vec![0.0f64; size];
    dist[attackers] = 1.0;
    let t = table();
    for defender in defenders {
        next.fill(0.0);
        for (x, &m) in dist.iter().enumerate() {
            if m < NEGLIGIBLE || x == 0 {
                continue;
            }
            match small(x, defender) {
                Some(f) => {
                    let wins = &t.wins[f.at..f.at + x + 1 - f.win_from];
                    for (s, &w) in (f.win_from..).zip(wins) {
                        next[s - 1] += m * w;
                    }
                }
                None => {
                    let o = battle_outcome(x, defender);
                    for s in o.win_from..o.win.len() {
                        next[s - 1] += m * o.win[s];
                    }
                }
            }
        }
        std::mem::swap(&mut dist, &mut next);
    }
    let mut p_success = 0.0;
    let mut arrive = 0.0;
    for (x, &m) in dist.iter().enumerate() {
        p_success += m;
        arrive += m * (x + 1) as f64;
    }
    Run {
        p_success,
        arrive: if p_success > 0.0 {
            arrive / p_success
        } else {
            0.0
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::odds::path_run;

    #[test]
    fn the_tables_answer_as_odds_does() {
        let cases: &[(usize, &[usize])] = &[
            (10, &[2, 1, 1, 3]),
            (4, &[1]),
            (30, &[5, 1, 8, 2, 2]),
            (70, &[3, 40, 1]),
            (2, &[1, 1]),
            (63, &[63]),
            (120, &[64, 10]),
        ];
        for &(armies, defenders) in cases {
            let exact = path_run(armies, defenders);
            let d: Vec<i32> = defenders.iter().map(|&x| x as i32).collect();
            let mine = run(armies as i32, None, &d);
            assert_eq!(mine.p_success, exact.p_success, "{armies} {defenders:?}");
            assert_eq!(mine.arrive, exact.arrive, "{armies} {defenders:?}");
            assert_eq!(run(armies as i32, Some(d[0]), &d[1..]), mine);
        }
        for a in 1..80 {
            for d in 1..80 {
                let o = battle_outcome(a as usize, d as usize);
                assert_eq!(win(a, d), o.p_win);
            }
        }
    }
}

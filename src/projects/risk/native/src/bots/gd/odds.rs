//! `bots/gd/odds.ts`: the battle odds GD's AI reads (`BlitzC.GetCalculatedOrEstimatedAttackWinChance`
//! and `GetCalculatedOrEstimatedIdealAttackUnits`).

use crate::blitz::{balanced_fight, estimated_win_chance};
use crate::jsmath::{fround, pow};
use std::cell::RefCell;
use std::collections::HashMap;

pub use crate::blitz::round_half_even;

const ESTIMATED_ABOVE: i64 = 2000;

/// `BlitzC.AppleWinChanceBalance` with GD's default balance (0.05, 1.3, 0.1).
pub fn balance_win_chance(chance: f64) -> f64 {
    let mut p = chance;
    if 0.05 > p {
        p = 0.0;
    } else if p > 1.0 - 0.05 {
        p = 1.0;
    }
    let push = pow(p, 1.3);
    let w = push / (push + pow(1.0 - p, 1.3));
    let mut win = w - 0.1;
    let mut hold = 1.0 - w - 0.1;
    if 0.0 > win {
        hold += -win;
        win = 0.0;
    }
    if 0.0 > hold {
        win += -hold;
        hold = 0.0;
    }
    win / (win + hold)
}

/// The chance a blitz of `attack` armies takes `defend`. GD runs its odds on any count, so no
/// attackers is no chance.
pub fn win_chance(attack: i64, defend: i64) -> f64 {
    if attack <= 0 {
        return 0.0;
    }
    if attack + defend > ESTIMATED_ABOVE {
        return balance_win_chance(estimated_win_chance(attack as usize, defend as usize));
    }
    let fight = balanced_fight(attack as usize, defend as usize)
        .unwrap_or_else(|| panic!("no odds for {attack} against {defend}"));
    fight.defender_lost[defend as usize]
}

const INT_MAX: i64 = 2147483647;

/// The default threshold of `idealAttackUnits`.
pub fn ideal_threshold() -> f64 {
    fround(0.9)
}

thread_local! {
    static IDEAL: RefCell<HashMap<(i64, u64), i64>> = RefCell::new(HashMap::new());
}

/// `GetCalculatedOrEstimatedIdealAttackUnits`: the fewest attackers whose chance of taking `defend`
/// reaches `threshold`, by GD's doubling then halving search.
pub fn ideal_attack_units(defend: i64, threshold: f64) -> i64 {
    let key = (defend, threshold.to_bits());
    if let Some(known) = IDEAL.with(|m| m.borrow().get(&key).copied()) {
        return known;
    }
    let ideal = search_ideal(defend, threshold);
    IDEAL.with(|m| m.borrow_mut().insert(key, ideal));
    ideal
}

fn search_ideal(defend: i64, threshold: f64) -> i64 {
    let d = defend.max(1);
    let required = threshold.clamp(0.0, 1.0);
    let start = round_half_even(fround(fround(d as f64) * fround(0.2))) as i64;
    let mut lo = 1;
    let mut hi = start.max(1);
    while required > win_chance(hi, d) {
        lo = hi;
        hi *= 2;
        if hi > INT_MAX {
            hi = INT_MAX;
            break;
        }
    }
    for probes in 0.. {
        if lo + 1 >= hi {
            return hi;
        }
        let mid = 1.max(lo + (hi - lo) / 2);
        if win_chance(mid, d) >= required {
            hi = mid;
        } else {
            lo = mid;
        }
        if probes >= 100 {
            return INT_MAX;
        }
    }
    unreachable!()
}

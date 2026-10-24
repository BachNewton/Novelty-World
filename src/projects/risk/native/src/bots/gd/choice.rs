//! `bots/gd/choice.ts`: GD's `AIHelper.GetChoice` at Expert, `GetIterativeArray` and
//! `ApplyStepVariance`.

use super::odds::round_half_even;
use crate::rng::Rng;

/// The best-scoring candidate, the earliest on a tie; when none scores above 0, the first whose
/// score is NaN (GD's test lets NaN through), or None. Every candidate is scored, in order, even
/// when the first is unbeatable: a score may draw from the bot's random stream.
pub fn get_choice<T: Copy>(candidates: &[T], mut score: impl FnMut(T) -> f64) -> Option<T> {
    let mut best = None;
    let mut best_score = 0.0;
    let mut first_nan = None;
    for &candidate in candidates {
        let s = score(candidate);
        if s.is_nan() {
            first_nan = first_nan.or(Some(candidate));
        } else if s > best_score {
            best = Some(candidate);
            best_score = s;
        }
    }
    best.or(first_nan)
}

/// `AIHelper.GetIterativeArray(start, end)`: every amount when there are at most 100, otherwise
/// 100 spread evenly, with the step's half as the variance the caller jitters its pick by.
pub fn iterative_array(start: i64, end: i64) -> (Vec<i64>, i64) {
    let diff = end - start;
    if diff < 100 {
        return ((start..=end).collect(), 0);
    }
    let step = diff as f64 / 99.0;
    let mut amounts: Vec<i64> = (0..100)
        .map(|i| round_half_even(i as f64 * step) as i64 + start)
        .collect();
    amounts[0] = start;
    amounts[99] = end;
    (amounts, (step * 0.5).floor() as i64)
}

/// `UnityEngine.Random.Range(min, max)` on ints: `max` excluded.
pub fn random_range(rng: &mut Rng, min: i64, max: i64) -> i64 {
    min + (rng.next() * (max - min) as f64).floor() as i64
}

/// `AIHelper.ApplyStepVariance`, as the deploy, move-in and fortify loops inline it.
pub fn apply_step_variance(value: i64, min: i64, max: i64, variance: i64, rng: &mut Rng) -> i64 {
    if variance <= 0 {
        return if value == 0 { min } else { value };
    }
    let r = if value <= min {
        value + random_range(rng, 0, variance)
    } else if value >= max {
        value - random_range(rng, 0, variance)
    } else {
        value + random_range(rng, -variance, variance)
    };
    if r < min {
        min
    } else if r > max {
        max
    } else {
        r
    }
}

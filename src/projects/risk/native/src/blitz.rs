//! `src/projects/risk/blitz.ts`: Balanced Blitz (`COMBAT-8`), as RISK: Global Domination resolves
//! it. The layout of a fight's two arrays is the TypeScript's, documented there.

use crate::jsmath::{exp, fround, js_max, js_min, log, pow, MIN_VALUE};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::OnceLock;

#[derive(Clone, Debug)]
pub struct Fight {
    pub attacker_lost: Vec<f64>,
    pub defender_lost: Vec<f64>,
}

#[derive(Clone, Copy, Debug)]
struct RoundOutcome {
    attacker_losses: usize,
    defender_losses: usize,
    p: f64,
}

/// The outcomes in the order the TypeScript's `Map` first meets them while enumerating rolls:
/// `fair_fight` adds them in that order, so it fixes its sums.
fn rounds(attack_dice: usize, defend_dice: usize) -> &'static [RoundOutcome] {
    static ROUNDS: OnceLock<Vec<Vec<RoundOutcome>>> = OnceLock::new();
    let table = ROUNDS.get_or_init(|| {
        let mut table = Vec::new();
        for attack_dice in 1..=3usize {
            for defend_dice in 1..=2usize {
                let dice = attack_dice + defend_dice;
                let total = 6usize.pow(dice as u32);
                let mut counts: Vec<((usize, usize), usize)> = Vec::new();
                for roll in 0..total {
                    let faces: Vec<usize> = (0..dice)
                        .map(|i| (roll / 6usize.pow(i as u32)) % 6)
                        .collect();
                    let mut attack = faces[..attack_dice].to_vec();
                    let mut defend = faces[attack_dice..].to_vec();
                    attack.sort_by(|x, y| y.cmp(x));
                    defend.sort_by(|x, y| y.cmp(x));
                    let mut attacker_losses = 0;
                    let mut defender_losses = 0;
                    for i in 0..attack_dice.min(defend_dice) {
                        if attack[i] > defend[i] {
                            defender_losses += 1;
                        } else {
                            attacker_losses += 1;
                        }
                    }
                    let key = (attacker_losses, defender_losses);
                    match counts.iter_mut().find(|(k, _)| *k == key) {
                        Some((_, count)) => *count += 1,
                        None => counts.push((key, 1)),
                    }
                }
                table.push(
                    counts
                        .into_iter()
                        .map(|((attacker_losses, defender_losses), count)| RoundOutcome {
                            attacker_losses,
                            defender_losses,
                            p: count as f64 / total as f64,
                        })
                        .collect(),
                );
            }
        }
        table
    });
    &table[(attack_dice - 1) * 2 + (defend_dice - 1)]
}

/// The fair odds of fighting `a` against `d` to the end (step 1 of `COMBAT-8`).
pub fn fair_fight(a: usize, d: usize) -> Fight {
    let width = d + 1;
    let mut chance = vec![0.0f64; (a + 1) * width];
    chance[a * width + d] = 1.0;
    let mut total = a + d;
    while total >= 2 {
        let top = a.min(total - 1);
        let bottom = 1.max(total.saturating_sub(d));
        let mut x = top;
        while x >= bottom {
            let y = total - x;
            let p = chance[x * width + y];
            if p != 0.0 {
                for o in rounds(x.min(3), y.min(2)) {
                    chance[(x - o.attacker_losses) * width + (y - o.defender_losses)] += o.p * p;
                }
            }
            x -= 1;
        }
        total -= 1;
    }
    let mut attacker_lost = vec![0.0f64; a + 1];
    let mut defender_lost = vec![0.0f64; d + 1];
    for x in 0..=a {
        for y in 0..=d {
            if x != 0 && y != 0 {
                continue;
            }
            attacker_lost[a - x] += chance[x * width + y];
            defender_lost[d - y] += chance[x * width + y];
        }
    }
    Fight {
        attacker_lost,
        defender_lost,
    }
}

fn win_chance_cutoff() -> f64 {
    fround(0.05)
}
fn win_chance_power() -> f64 {
    fround(1.3)
}
fn outcome_cutoff() -> f64 {
    fround(0.1)
}
fn outcome_power() -> f64 {
    fround(1.8)
}

/// Scales `values[from .. from + length]` to sum to `total`: all zero when `total` is not
/// positive, an even share each when they sum to nothing.
fn scale_to(values: &mut [f64], total: f64, from: usize, length: usize) {
    let range = from..from + length;
    if total <= 0.0 {
        values[range].fill(0.0);
        return;
    }
    let mut sum = 0.0;
    for &v in &values[range.clone()] {
        sum += v;
    }
    if sum <= 0.0 {
        values[range].fill(total / length as f64);
        return;
    }
    for v in &mut values[range] {
        *v *= total / sum;
    }
}

/// Steps 2 to 5 of `COMBAT-8`, on a copy of the fair odds.
pub fn balance(fair: &Fight) -> Fight {
    let mut al = fair.attacker_lost.clone();
    let mut dl = fair.defender_lost.clone();
    let a = al.len() - 1;
    let d = dl.len() - 1;

    if win_chance_cutoff() >= dl[d] {
        al.fill(0.0);
        al[a] = 1.0;
        dl[d] = 0.0;
        scale_to(&mut dl, 1.0, 0, d);
    }
    if win_chance_cutoff() >= al[a] {
        dl.fill(0.0);
        dl[d] = 1.0;
        al[a] = 0.0;
        scale_to(&mut al, 1.0, 0, a);
    }

    let push_win = pow(dl[d], win_chance_power());
    let push_hold = pow(al[a], win_chance_power());
    let win = push_win / (push_win + push_hold);
    let hold = push_hold / (push_win + push_hold);
    scale_to(&mut al, win, 0, a);
    scale_to(&mut dl, hold, 0, d);
    dl[d] = win;
    al[a] = hold;

    let mut combined = vec![0.0f64; a + d];
    combined[..a].copy_from_slice(&al[..a]);
    for j in 0..d {
        combined[a + d - 1 - j] = dl[j];
    }
    trim_front(&mut combined);
    combined.reverse();
    trim_front(&mut combined);
    combined.reverse();
    al[..a].copy_from_slice(&combined[..a]);
    for j in 0..d {
        dl[j] = combined[a + d - 1 - j];
    }
    let mut captures = 0.0;
    let mut holds = 0.0;
    for &v in &al[..a] {
        captures += v;
    }
    for &v in &dl[..d] {
        holds += v;
    }
    let k = 1.0 / (holds + captures);
    scale_to(&mut al, captures * k, 0, a);
    scale_to(&mut dl, holds * k, 0, d);
    al[a] = holds * k;
    dl[d] = captures * k;

    for v in &mut al[..a] {
        *v = pow(*v, outcome_power());
    }
    for v in &mut dl[..d] {
        *v = pow(*v, outcome_power());
    }
    let capture = dl[d];
    scale_to(&mut al, capture, 0, a);
    let held = al[a];
    scale_to(&mut dl, held, 0, d);
    Fight {
        attacker_lost: al,
        defender_lost: dl,
    }
}

fn trim_front(values: &mut [f64]) {
    let mut sum = 0.0;
    for v in values.iter_mut() {
        sum += *v;
        if sum <= outcome_cutoff() {
            *v = 0.0;
        } else {
            *v = sum - outcome_cutoff();
            return;
        }
    }
}

const ESTIMATED_ABOVE: usize = 2000;
const ROLLED_ABOVE: usize = 100_000;

thread_local! {
    static BALANCED: RefCell<HashMap<(usize, usize), Rc<Fight>>> = RefCell::new(HashMap::new());
}

/// The balanced odds of a blitz of `a` against `d`, or None when GD rolls a fight that large with
/// fair dice instead.
pub fn balanced_fight(a: usize, d: usize) -> Option<Rc<Fight>> {
    if a + d > ROLLED_ABOVE {
        return None;
    }
    if let Some(known) = BALANCED.with(|b| b.borrow().get(&(a, d)).cloned()) {
        return Some(known);
    }
    let fair = if a + d > ESTIMATED_ABOVE {
        estimate_fight(a, d)
    } else {
        fair_fight(a, d)
    };
    let fight = Rc::new(balance(&fair));
    BALANCED.with(|b| {
        let mut b = b.borrow_mut();
        if b.len() > 50_000 {
            b.clear();
        }
        b.insert((a, d), fight.clone());
    });
    Some(fight)
}

/// The chance a blitz of `a` against `d` captures.
pub fn capture_chance(a: usize, d: usize) -> f64 {
    if d == 0 {
        return 1.0;
    }
    if a == 0 {
        return 0.0;
    }
    match balanced_fight(a, d) {
        Some(fight) => fight.defender_lost[d],
        None => fair_fight(a, d).defender_lost[d],
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BlitzResult {
    pub attacker_losses: usize,
    pub defender_losses: usize,
}

/// A blitz of `a` against `d`, resolved by one uniform draw `r` in [0, 1) from the balanced odds;
/// fights too large to balance are rolled battle by battle with `roll`.
pub fn resolve_blitz(a: usize, d: usize, r: f64, roll: &mut dyn FnMut() -> f64) -> BlitzResult {
    let Some(fight) = balanced_fight(a, d) else {
        return roll_fight(a, d, roll);
    };
    let draw = if r <= 0.0 { MIN_VALUE } else { r };
    let al = &fight.attacker_lost;
    let dl = &fight.defender_lost;
    if dl[d] >= draw {
        return BlitzResult {
            attacker_losses: pick_outcome(al, a, draw),
            defender_losses: d,
        };
    }
    BlitzResult {
        attacker_losses: a,
        defender_losses: pick_outcome(dl, d, draw - dl[d]),
    }
}

/// The first outcome below `end` whose running total reaches `draw`, or the likeliest one when
/// rounding leaves the total just short.
fn pick_outcome(chances: &[f64], end: usize, draw: f64) -> usize {
    let mut sum = 0.0;
    let mut likeliest = 0;
    for (i, &c) in chances[..end].iter().enumerate() {
        if c > chances[likeliest] {
            likeliest = i;
        }
        if c <= 0.0 {
            continue;
        }
        sum += c;
        if sum >= draw {
            return i;
        }
    }
    likeliest
}

fn roll_fight(a: usize, d: usize, roll: &mut dyn FnMut() -> f64) -> BlitzResult {
    let mut x = a;
    let mut y = d;
    while x > 0 && y > 0 {
        let mut attack: Vec<u32> = (0..x.min(3))
            .map(|_| 1 + (roll() * 6.0).floor() as u32)
            .collect();
        attack.sort_by(|p, q| q.cmp(p));
        let mut defend: Vec<u32> = (0..y.min(2))
            .map(|_| 1 + (roll() * 6.0).floor() as u32)
            .collect();
        defend.sort_by(|p, q| q.cmp(p));
        for i in 0..attack.len().min(defend.len()) {
            if attack[i] > defend[i] {
                y -= 1;
            } else {
                x -= 1;
            }
        }
    }
    BlitzResult {
        attacker_losses: a - x,
        defender_losses: d - y,
    }
}

// GD's estimate of the fair odds of a fight too large to work out.

/// .NET's `Math.Round`: halves round to even.
fn round_half_even(x: f64) -> f64 {
    let floor = x.floor();
    let fraction = x - floor;
    if fraction > 0.5 {
        return floor + 1.0;
    }
    if fraction < 0.5 {
        return floor;
    }
    if floor % 2.0 == 0.0 {
        floor
    } else {
        floor + 1.0
    }
}

fn combined_order(fight: &Fight) -> Vec<f64> {
    let a = fight.attacker_lost.len() - 1;
    let d = fight.defender_lost.len() - 1;
    let mut combined = vec![0.0f64; a + d];
    combined[..a].copy_from_slice(&fight.attacker_lost[..a]);
    for j in 0..d {
        combined[a + d - 1 - j] = fight.defender_lost[j];
    }
    combined
}

/// The first index of the combined order at which the running total reaches `target`.
fn outcome_index(combined: &[f64], target: f64) -> usize {
    let mut sum = 0.0;
    for (k, &c) in combined.iter().enumerate() {
        sum += c;
        if sum >= target {
            return k;
        }
    }
    combined.len() - 1
}

/// Least squares through the points: y ≈ slope · x + intercept.
fn fit_line(xs: &[f64], ys: &[f64]) -> (f64, f64) {
    let n = xs.len() as f64;
    let mut sx = 0.0;
    let mut sy = 0.0;
    let mut sxy = 0.0;
    let mut sxx = 0.0;
    for i in 0..xs.len() {
        sx += xs[i];
        sy += ys[i];
        sxy += xs[i] * ys[i];
        sxx += xs[i] * xs[i];
    }
    let slope = (n * sxy - sy * sx) / (n * sxx - sx * sx);
    (slope, sy / n - (sx / n) * slope)
}

/// GD's model of the capture chance as fights grow: a line when it hardly changes, otherwise an
/// exponential approach to 1 (when it rises) or to 0 (when it falls).
fn win_chance_model(xs: &[f64], ws: &[f64]) -> Box<dyn Fn(f64) -> f64> {
    let first = ws[0];
    let last = ws[ws.len() - 1];
    if (last - first).abs() <= 0.0001 {
        let (slope, intercept) = fit_line(xs, ws);
        return Box::new(move |x| slope * x + intercept);
    }
    let rising = last > first;
    let kept: Vec<(f64, f64)> = xs
        .iter()
        .zip(ws)
        .map(|(&x, &w)| (x, if rising { 1.0 - w } else { w }))
        .filter(|&(_, y)| y > 0.0)
        .collect();
    let mut scale = 0.0;
    let mut rate = 0.0;
    if kept.len() >= 2 {
        let kx: Vec<f64> = kept.iter().map(|p| p.0).collect();
        let ky: Vec<f64> = kept.iter().map(|p| log(p.1)).collect();
        let (slope, intercept) = fit_line(&kx, &ky);
        scale = exp(intercept);
        rate = -slope;
    }
    if rising {
        Box::new(move |x| 1.0 - scale * exp(-rate * x))
    } else {
        Box::new(move |x| scale * exp(-rate * x))
    }
}

/// Spreads `source[s0 .. s1]` over `dest[t0 .. t1]` in proportion.
fn stretch(source: &[f64], s0: usize, s1: usize, dest: &mut [f64], t0: f64, t1: f64) {
    if s1 <= s0 || t1 <= t0 {
        return;
    }
    let scale = (t1 - t0) / (s1 - s0) as f64;
    for (k, &chance) in source[s0..s1].iter().enumerate() {
        let start = t0 + k as f64 * scale;
        let end = start + scale;
        let mut cell = start.floor();
        while cell < js_min(t1, end.ceil()) {
            let overlap = js_min(end, cell + 1.0) - js_max(start, cell);
            if overlap > 0.0 {
                dest[cell as usize] += (chance * overlap) / scale;
            }
            cell += 1.0;
        }
    }
}

struct EstimateSteps {
    xs: Vec<f64>,
    ws: Vec<f64>,
    best: Vec<usize>,
    mid: Vec<usize>,
    worst: Vec<usize>,
    largest: Vec<f64>,
}

/// The ten exactly worked smaller fights of the proportions of `a` against `d` that GD fits its
/// estimate to.
fn estimate_steps(a: usize, d: usize) -> EstimateSteps {
    let ratio = fround(fround(a as f64) / fround(d as f64));
    let mut steps = EstimateSteps {
        xs: Vec::new(),
        ws: Vec::new(),
        best: Vec::new(),
        mid: Vec::new(),
        worst: Vec::new(),
        largest: Vec::new(),
    };
    for i in 0..10 {
        let total = i as f64 * (1900.0 / 9.0) + 100.0;
        let step_a = js_max(1.0, round_half_even((ratio * total) / (ratio + 1.0))) as usize;
        let step_d = js_max(
            1.0,
            round_half_even(total - round_half_even((ratio * total) / (ratio + 1.0))),
        ) as usize;
        let fight = fair_fight(step_a, step_d);
        let combined = combined_order(&fight);
        steps.xs.push((step_a + step_d) as f64);
        steps
            .ws
            .push(js_min(1.0, js_max(0.0, fight.defender_lost[step_d])));
        steps.best.push(outcome_index(&combined, 0.01));
        steps.mid.push(outcome_index(&combined, 0.5));
        steps.worst.push(outcome_index(&combined, 0.99));
        steps.largest = combined;
    }
    steps
}

/// GD's `EstimateAttackWinChance`: the fair capture chance of `a` against `d` from its fitted
/// model, unclamped.
pub fn estimated_win_chance(a: usize, d: usize) -> f64 {
    let steps = estimate_steps(a, d);
    win_chance_model(&steps.xs, &steps.ws)((a + d) as f64)
}

/// GD's estimate of the fair odds of `a` against `d`. GD's arrays copy the defender's side one
/// place off, and that is kept, so the odds match the game's.
fn estimate_fight(a: usize, d: usize) -> Fight {
    let n = a + d;
    let nf = n as f64;
    let steps = estimate_steps(a, d);
    let win_chance = js_min(1.0, js_max(0.0, win_chance_model(&steps.xs, &steps.ws)(nf)));
    let at = |ys: &[usize]| {
        let ys: Vec<f64> = ys.iter().map(|&y| y as f64).collect();
        let (slope, intercept) = fit_line(&steps.xs, &ys);
        js_min(
            nf - 1.0,
            js_max(0.0, round_half_even(fround(nf * slope + intercept))),
        )
    };
    let mut dest = vec![0.0f64; n];
    let largest = &steps.largest;
    stretch(
        largest,
        steps.best[9],
        steps.mid[9],
        &mut dest,
        at(&steps.best),
        at(&steps.mid),
    );
    stretch(
        largest,
        steps.mid[9],
        steps.worst[9],
        &mut dest,
        at(&steps.mid),
        at(&steps.worst),
    );

    let mut attacker_lost = vec![0.0f64; a + 1];
    let mut defender_lost = vec![0.0f64; d + 1];
    attacker_lost[..a].copy_from_slice(&dest[..a]);
    for j in 0..d {
        defender_lost[j] = dest[n - 2 - j];
    }
    attacker_lost[a] = 1.0 - win_chance;
    defender_lost[d] = win_chance;
    scale_to(&mut attacker_lost, win_chance, 0, a);
    scale_to(&mut defender_lost, 1.0 - win_chance, 0, d);
    Fight {
        attacker_lost,
        defender_lost,
    }
}

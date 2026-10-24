//! What hands are worth under Fixed set values (`CARDS-6`): a small decision process over a hand's
//! symbols, solved once. Each turn its holder may trade one set (must, at 5 cards) and draws a card
//! if it captured; its value function prices any hand in armies, its policy is the trade rule.
//! Every number here is objective: it prices any player's cards, mine included.

use crate::cards::{symbol_of, Card};
use crate::map::Symbol;
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::OnceLock;

/// Symbol counts: infantry, cavalry, artillery, wilds.
pub type Shape = [u8; 4];

pub const EMPTY: Shape = [0; 4];
const DECK: [u8; 4] = [13, 14, 15, 2];
const DECK_SIZE: u8 = 44;
/// What an army next turn is worth against one now.
pub const CARD_DISCOUNT: f64 = 0.9;
/// The chance a player captures, so draws a card, on a turn: Balanced Blitz makes a capture from
/// any stack of 4 beside a 1-army territory certain.
pub const DRAW_CHANCE: f64 = 0.9;
/// The largest hand the process covers: 4 kept and the card drawn.
const MAX_HAND: u8 = 5;
/// Counts up to 12 a symbol, for keys of hands past the process's.
const KEY_BASE: usize = 13;

pub fn shape_of(cards: &[Card]) -> Shape {
    let mut s = EMPTY;
    for &c in cards {
        s[match symbol_of(c) {
            Some(Symbol::Infantry) => 0,
            Some(Symbol::Cavalry) => 1,
            Some(Symbol::Artillery) => 2,
            None => 3,
        }] += 1;
    }
    s
}

pub fn size(s: Shape) -> u8 {
    s[0] + s[1] + s[2] + s[3]
}

fn key(s: Shape) -> usize {
    ((s[0] as usize * KEY_BASE + s[1] as usize) * KEY_BASE + s[2] as usize) * KEY_BASE
        + s[3] as usize
}

fn add(s: Shape, t: Shape) -> Shape {
    std::array::from_fn(|i| s[i] + t[i])
}

pub fn sub(s: Shape, t: Shape) -> Shape {
    std::array::from_fn(|i| s[i] - t[i])
}

fn fits(t: Shape, s: Shape) -> bool {
    (0..4).all(|i| t[i] <= s[i])
}

fn one(k: usize) -> Shape {
    let mut s = EMPTY;
    s[k] = 1;
    s
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SetShape {
    pub shape: Shape,
    pub value: u32,
}

/// Every valid set (`CARDS-3`) as a shape, with its worth, a wild counting as whichever symbol
/// makes it worth most.
fn all_sets() -> &'static [SetShape] {
    static SETS: OnceLock<Vec<SetShape>> = OnceLock::new();
    SETS.get_or_init(|| {
        let mut out = Vec::new();
        for i in 0..=3u8 {
            for c in 0..=3 - i {
                for a in 0..=3 - i - c {
                    let w = 3 - i - c - a;
                    if w > 2 {
                        continue;
                    }
                    let symbols = [i, c, a].iter().filter(|&&n| n > 0).count() as u8;
                    let same_kind = symbols == 1 && w == 0;
                    let mixed = symbols + w == 3 && (symbols > 1 || w > 1);
                    if !(w >= 1 || same_kind || (i == 1 && c == 1 && a == 1)) {
                        continue;
                    }
                    let kind = if i > 0 {
                        4
                    } else if c > 0 {
                        6
                    } else {
                        8
                    };
                    out.push(SetShape {
                        shape: [i, c, a, w],
                        value: if mixed { 10 } else { kind },
                    });
                }
            }
        }
        out
    })
}

fn sets_of(s: Shape) -> impl Iterator<Item = SetShape> {
    all_sets()
        .iter()
        .copied()
        .filter(move |set| fits(set.shape, s))
}

fn choose(k: u8, r: u8) -> f64 {
    if r > k {
        return 0.0;
    }
    let mut x = 1.0;
    for j in 0..r {
        x = x * (k - j) as f64 / (j + 1) as f64;
    }
    x
}

/// Every shape of `n` cards with the chance `n` cards drawn from those not `held` have it.
fn hands_of(n: u8, held: Shape) -> Vec<(Shape, f64)> {
    let left: [u8; 4] = std::array::from_fn(|i| DECK[i] - held[i]);
    let total = choose(DECK_SIZE - size(held), n);
    let mut out = Vec::new();
    for i in 0..=n {
        for c in 0..=n - i {
            for a in 0..=n - i - c {
                let w = n - i - c - a;
                let p = choose(left[0], i)
                    * choose(left[1], c)
                    * choose(left[2], a)
                    * choose(left[3], w)
                    / total;
                if p > 0.0 {
                    out.push(([i, c, a, w], p));
                }
            }
        }
    }
    out
}

fn draw_chance(h: Shape, k: usize) -> f64 {
    (DECK[k] - h[k]) as f64 / (DECK_SIZE - size(h)) as f64
}

struct Solved {
    /// A hand's worth in armies at the start of its holder's turn, by key, for up to 5 cards.
    value: Vec<f64>,
    /// The set the policy trades, by key.
    policy: Vec<Option<SetShape>>,
    hidden: [HiddenHand; 13],
    card_worth: f64,
}

/// A hidden hand of `n` cards: its worth, and the armies its holder is expected to trade on their
/// next turn.
#[derive(Clone, Copy, Debug, Default)]
pub struct HiddenHand {
    pub worth: f64,
    pub next_trade: f64,
}

fn solved() -> &'static Solved {
    static SOLVED: OnceLock<Solved> = OnceLock::new();
    SOLVED.get_or_init(solve)
}

fn solve() -> Solved {
    let slots = KEY_BASE.pow(4);
    let mut value = vec![0.0f64; slots];
    let mut policy = vec![None; slots];
    let all: Vec<Shape> = (0..=MAX_HAND)
        .flat_map(|n| hands_of(n, EMPTY).into_iter().map(|(s, _)| s))
        .collect();
    let next = |value: &[f64], h: Shape| -> f64 {
        if size(h) >= MAX_HAND {
            return value[key(h)];
        }
        let mut drawn = 0.0;
        for k in 0..4 {
            let p = draw_chance(h, k);
            if p > 0.0 {
                drawn += p * value[key(add(h, one(k)))];
            }
        }
        DRAW_CHANCE * drawn + (1.0 - DRAW_CHANCE) * value[key(h)]
    };
    for _ in 0..400 {
        let mut change = 0.0f64;
        for &h in &all {
            let mut best = if size(h) < MAX_HAND {
                CARD_DISCOUNT * next(&value, h)
            } else {
                f64::NEG_INFINITY
            };
            let mut choice = None;
            for set in sets_of(h) {
                let v = set.value as f64 + CARD_DISCOUNT * next(&value, sub(h, set.shape));
                if v > best + 1e-12 {
                    best = v;
                    choice = Some(set);
                }
            }
            change = change.max((best - value[key(h)]).abs());
            value[key(h)] = best;
            policy[key(h)] = choice;
        }
        if change < 1e-9 {
            break;
        }
    }
    let mut solved = Solved {
        value,
        policy,
        hidden: [HiddenHand::default(); 13],
        card_worth: 0.0,
    };
    for n in 0..=12u8 {
        let mut next_trade = 0.0;
        for (shape, p) in hands_of(n, EMPTY) {
            next_trade += p * if n > MAX_HAND {
                best_forced_in(&solved, shape).armies
            } else {
                solved.policy[key(shape)].map_or(0.0, |s| s.value as f64)
            };
        }
        solved.hidden[n as usize] = HiddenHand {
            worth: worth_in(&solved, EMPTY, n),
            next_trade,
        };
    }
    solved.card_worth = long_run_card_worth(&solved);
    solved
}

/// What a player trading by the policy makes per card drawn, following a hand drawing every turn
/// from empty.
fn long_run_card_worth(s: &Solved) -> f64 {
    let mut dist: Vec<(Shape, f64)> = vec![(EMPTY, 1.0)];
    let mut armies = 0.0;
    let turns = 400;
    for _ in 0..turns {
        let mut next: HashMap<usize, (Shape, f64)> = HashMap::new();
        let mut order = Vec::new();
        for &(shape, p) in &dist {
            let trade = s.policy[key(shape)];
            let kept = trade.map_or(shape, |t| sub(shape, t.shape));
            armies += p * trade.map_or(0.0, |t| t.value as f64);
            for k in 0..4 {
                let q = draw_chance(kept, k);
                if q == 0.0 {
                    continue;
                }
                let h = add(kept, one(k));
                next.entry(key(h))
                    .and_modify(|e| e.1 += p * q)
                    .or_insert_with(|| {
                        order.push(key(h));
                        (h, p * q)
                    });
            }
        }
        dist = order.iter().map(|k| next[k]).collect();
    }
    armies / turns as f64
}

#[derive(Clone, Copy)]
struct Forced {
    armies: f64,
    kept: Shape,
    first: Option<SetShape>,
}

/// The trades that take a hand of more than 4 down to 4 (`CARDS-5`, `ELIM-3`): the sets whose
/// armies and the kept cards' worth come to most.
fn best_forced_in(s: &Solved, h: Shape) -> Forced {
    if size(h) <= 4 {
        return Forced {
            armies: 0.0,
            kept: h,
            first: None,
        };
    }
    let mut best = Forced {
        armies: f64::NEG_INFINITY,
        kept: h,
        first: None,
    };
    let mut best_total = f64::NEG_INFINITY;
    for set in sets_of(h) {
        let rest = best_forced_in(s, sub(h, set.shape));
        let total = set.value as f64 + rest.armies + CARD_DISCOUNT * s.value[key(rest.kept)];
        if total > best_total {
            best_total = total;
            best = Forced {
                armies: set.value as f64 + rest.armies,
                kept: rest.kept,
                first: Some(set),
            };
        }
    }
    best
}

fn worth_in(s: &Solved, known: Shape, unknown: u8) -> f64 {
    let mut total = 0.0;
    for (shape, p) in hands_of(unknown, known) {
        let h = add(known, shape);
        total += p * if size(h) <= MAX_HAND {
            s.value[key(h)]
        } else {
            let f = best_forced_in(s, h);
            f.armies + CARD_DISCOUNT * s.value[key(f.kept)]
        };
    }
    total
}

thread_local! {
    static WORTH: RefCell<HashMap<(usize, u8), f64>> = RefCell::new(HashMap::new());
}

/// What `known` cards and `unknown` unseen ones are worth at the start of the holder's next turn,
/// after any trades a hand over 4 must make at once.
pub fn hand_worth(known: Shape, unknown: u8) -> f64 {
    let id = (key(known), unknown);
    if let Some(w) = WORTH.with(|m| m.borrow().get(&id).copied()) {
        return w;
    }
    let w = worth_in(solved(), known, unknown);
    WORTH.with(|m| m.borrow_mut().insert(id, w));
    w
}

pub fn hidden_hand(n: u8) -> HiddenHand {
    solved().hidden[(n as usize).min(12)]
}

/// The set the policy trades from a hand at the start of a turn, or None to hold.
pub fn policy_trade(h: Shape) -> Option<SetShape> {
    if size(h) > MAX_HAND {
        return best_forced_in(solved(), h).first;
    }
    solved().policy[key(h)]
}

/// The armies a forced trade turns a hand of `n` mostly unseen cards into at once, and the cards
/// it keeps (`ELIM-3`).
pub fn forced_trade(n: u8) -> (f64, u8) {
    if n <= 4 {
        return (0.0, n);
    }
    let s = solved();
    let armies = hands_of(n.min(12), EMPTY)
        .into_iter()
        .map(|(shape, p)| p * best_forced_in(s, shape).armies)
        .sum();
    (armies, n - 3 * (n - 4).div_ceil(3))
}

/// A card's long-run worth in armies.
pub fn card_worth() -> f64 {
    solved().card_worth
}

/// What an empty hand is worth: the cards to come, which every player draws alike and income
/// counts instead. A hand is worth what it adds to that.
fn no_hand() -> f64 {
    solved().value[key(EMPTY)]
}

/// What `n` cards nobody but their holder has seen are worth, in armies now.
pub fn hidden_cards(n: u8) -> f64 {
    CARD_DISCOUNT * (hidden_hand(n).worth - no_hand())
}

/// What a hand of `known` cards and `unknown` unseen ones is worth in armies now.
pub fn hand_value(known: Shape, unknown: u8) -> f64 {
    CARD_DISCOUNT * (hand_worth(known, unknown) - no_hand())
}

/// The armies a hand is expected to trade at the start of its holder's next turn.
pub fn next_trade(known: Shape, unknown: u8) -> f64 {
    if unknown == 0 {
        return policy_trade(known).map_or(0.0, |s| s.value as f64);
    }
    hidden_hand(size(known) + unknown).next_trade
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_card_is_worth_about_three_armies() {
        let w = card_worth();
        assert!((2.8..2.95).contains(&w), "{w}");
    }

    #[test]
    fn the_policy_trades_the_big_sets_and_holds_three_infantry() {
        assert_eq!(policy_trade([1, 1, 1, 0]).unwrap().value, 10);
        assert_eq!(policy_trade([0, 0, 3, 0]).unwrap().value, 8);
        assert_eq!(policy_trade([3, 0, 0, 0]), None);
        assert_eq!(policy_trade([2, 0, 0, 1]), None);
    }

    #[test]
    fn hidden_hands_trade_more_as_they_grow() {
        let trades: Vec<f64> = (0..=6).map(|n| hidden_hand(n).next_trade).collect();
        assert_eq!(trades[0], 0.0);
        assert!(
            trades.windows(2).all(|w| w[0] <= w[1] + 1e-12),
            "{trades:?}"
        );
        assert_eq!(forced_trade(5).1, 2);
        assert_eq!(forced_trade(8).1, 2);
        assert!(forced_trade(5).0 > 5.0);
    }
}

//! `bots/gd/cards.ts`: GD's choice of set (`GameControlCards.GetBestCardMatch` with Fixed values,
//! and `GetCardsFromArrayByType`) and the territory its +2 goes to.

use crate::cards::{is_wild, symbol_of, territory_of, Card};
use crate::engine::{Seat, Territory};
use crate::map::Symbol;

/// GD's card types: A infantry, B cavalry, C artillery, W wild.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    A,
    B,
    C,
    W,
}

fn kind_of(card: Card) -> Kind {
    match symbol_of(card) {
        Some(Symbol::Infantry) => Kind::A,
        Some(Symbol::Cavalry) => Kind::B,
        Some(Symbol::Artillery) => Kind::C,
        None => Kind::W,
    }
}

/// The set GD's AI trades from `hand`, its cards in GD's order, or None when the hand holds none.
pub fn best_card_match(hand: &[Card], owns: impl Fn(Territory) -> bool) -> Option<Vec<Card>> {
    use Kind::{A, B, C, W};
    if hand.len() < 3 {
        return None;
    }
    let count = |k: Kind| hand.iter().filter(|&&c| kind_of(c) == k).count();
    let (a, b, c, w) = (count(A), count(B), count(C), count(W));
    let kinds = [a, b, c].iter().filter(|&&n| n > 0).count();
    let mut pattern: Option<[Kind; 3]> = None;
    let mut troops = 0;
    if kinds == 3 {
        pattern = Some([A, B, C]);
        troops = 10;
    } else if kinds == 2 && w >= 1 {
        pattern = Some(if c == 0 {
            [A, B, W]
        } else if b == 0 {
            [A, W, C]
        } else {
            [W, B, C]
        });
        troops = 10;
    } else if kinds == 1 && w >= 2 {
        pattern = Some(if a > 0 {
            [A, W, W]
        } else if b > 0 {
            [W, B, W]
        } else {
            [W, W, C]
        });
        troops = 10;
    } else if w >= 3 {
        pattern = Some([W, W, W]);
        troops = 10;
    }
    for (kind, value) in [(C, 8), (B, 6), (A, 4)] {
        let n = count(kind);
        if value > troops && (n >= 3 || (n == 2 && w >= 1) || (n == 1 && w >= 2) || w >= 3) {
            troops = value;
            pattern = Some(match n {
                3.. => [kind, kind, kind],
                2 => [kind, kind, W],
                1 => [kind, W, W],
                _ => [W, W, W],
            });
        }
    }
    pattern.map(|p| cards_by_type(hand, &p, &owns))
}

fn owned_card(card: Card, owns: &impl Fn(Territory) -> bool) -> bool {
    territory_of(card).is_some_and(|t| owns(t as Territory))
}

/// `GetCardsFromArrayByType`: the pattern's cards taken first in hand order, then swapped so the
/// set pictures exactly one owned territory where the hand allows.
fn cards_by_type(hand: &[Card], pattern: &[Kind], owns: &impl Fn(Territory) -> bool) -> Vec<Card> {
    let mut set: Vec<Card> = Vec::new();
    let mut owned = 0;
    for &kind in pattern {
        let Some(&card) = hand
            .iter()
            .find(|&&x| !set.contains(&x) && kind_of(x) == kind)
        else {
            continue;
        };
        set.push(card);
        if kind != Kind::W && owned_card(card, owns) {
            owned += 1;
        }
    }
    if owned == 0 {
        for i in 0..set.len() {
            let card = set[i];
            if is_wild(card) {
                continue;
            }
            let swap = hand
                .iter()
                .copied()
                .find(|&x| !set.contains(&x) && kind_of(x) == kind_of(card) && owned_card(x, owns));
            if let Some(swap) = swap {
                set.remove(i);
                set.push(swap);
                break;
            }
        }
    } else if owned >= 2 {
        let mut removed = Vec::new();
        let mut added = Vec::new();
        for &card in &set {
            if owned == 1 {
                break;
            }
            if is_wild(card) || !owned_card(card, owns) {
                continue;
            }
            let swap = hand.iter().copied().find(|&x| {
                !set.contains(&x)
                    && !added.contains(&x)
                    && !is_wild(x)
                    && kind_of(x) == kind_of(card)
                    && !owned_card(x, owns)
            });
            if let Some(swap) = swap {
                added.push(swap);
                removed.push(card);
                owned -= 1;
            }
        }
        set.retain(|c| !removed.contains(c));
        set.extend(added);
    }
    set
}

/// The territory GD gives a set's +2: the first card in the set's order picturing one the trader
/// owns.
pub fn bonus_territory_of(
    set: &[Card],
    seat: Seat,
    owner_of: impl Fn(Territory) -> Seat,
) -> Option<Territory> {
    set.iter()
        .filter_map(|&c| territory_of(c))
        .map(|t| t as Territory)
        .find(|&t| owner_of(t) == seat)
}

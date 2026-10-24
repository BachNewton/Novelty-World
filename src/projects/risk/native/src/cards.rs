//! `src/projects/risk/cards.ts`. A card is a `u8`: 0–41 the territory of that index, 42 and 43
//! the two wilds.

use crate::list::List;
use crate::map::{Symbol, TERRITORIES, TERRITORY_COUNT};

pub type Card = u8;

pub const WILD_1: Card = 42;
pub const WILD_2: Card = 43;

/// The whole deck in its fixed order for shuffling: the territory cards in map order, then the wilds.
pub const FULL_DECK: [Card; 44] = {
    let mut deck = [0u8; 44];
    let mut i = 0;
    while i < 44 {
        deck[i] = i as u8;
        i += 1;
    }
    deck
};

pub fn is_wild(card: Card) -> bool {
    card == WILD_1 || card == WILD_2
}

/// The card's symbol, or None for a wild.
pub fn symbol_of(card: Card) -> Option<Symbol> {
    if is_wild(card) {
        None
    } else {
        Some(TERRITORIES[card as usize].symbol)
    }
}

/// The territory a card pictures; wilds picture none.
pub fn territory_of(card: Card) -> Option<usize> {
    if is_wild(card) {
        None
    } else {
        debug_assert!((card as usize) < TERRITORY_COUNT);
        Some(card as usize)
    }
}

pub fn is_valid_set(cards: &[Card]) -> bool {
    if cards.len() != 3 {
        return false;
    }
    if cards.iter().any(|&c| is_wild(c)) {
        return true;
    }
    let a = symbol_of(cards[0]);
    let b = symbol_of(cards[1]);
    let c = symbol_of(cards[2]);
    (a == b && b == c) || (a != b && b != c && a != c)
}

/// C(12, 3): every three cards of the largest hand.
pub const MAX_SETS: usize = 220;

/// Every valid set in a hand, each once, its cards in hand order.
pub fn sets_in(hand: &[Card]) -> List<[Card; 3], MAX_SETS> {
    let mut sets = List::new();
    for i in 0..hand.len() {
        for j in i + 1..hand.len() {
            for k in j + 1..hand.len() {
                let set = [hand[i], hand[j], hand[k]];
                if is_valid_set(&set) {
                    sets.push(set);
                }
            }
        }
    }
    sets
}

const ONE_OF_EACH: u32 = 10;

fn three_of(symbol: Symbol) -> u32 {
    match symbol {
        Symbol::Infantry => 4,
        Symbol::Cavalry => 6,
        Symbol::Artillery => 8,
    }
}

/// What a valid set is worth, a wild counting as whichever symbol makes it worth most.
pub fn set_value(cards: &[Card]) -> u32 {
    let mut first = None;
    let mut seen = [false; 3];
    let mut wilds = 0;
    for &card in cards {
        match symbol_of(card) {
            Some(s) => {
                first.get_or_insert(s);
                seen[s as usize] = true;
            }
            None => wilds += 1,
        }
    }
    let distinct = seen.iter().filter(|&&s| s).count();
    if distinct + wilds == 3 && (distinct > 1 || wilds > 1) {
        return ONE_OF_EACH;
    }
    three_of(first.expect("a valid set holds a symbol card"))
}

pub const MAX_SET_VALUE: u32 = ONE_OF_EACH;

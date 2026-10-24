//! The bot's own board: a position as a `Copy` struct of masks and flat arrays, built only from a
//! seat's view, copied whole for every end of turn the planner pictures.

use super::hands::{shape_of, Shape};
use crate::engine::{first_turn_bonus, Seat, View, MAX_SEATS};
use crate::map::{territories_in, ADJACENT, CONTINENTS, CONTINENT_MASKS, TERRITORY_COUNT};

pub const N: usize = TERRITORY_COUNT;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Board {
    pub players: u8,
    /// Seat order: `order[0]` played first.
    pub order: [Seat; MAX_SEATS],
    pub owner: [Seat; N],
    pub armies: [i32; N],
    /// Each seat's territories, kept equal to `owner`.
    pub owned: [u64; MAX_SEATS],
    pub alive: [bool; MAX_SEATS],
    pub hand: [u8; MAX_SEATS],
    /// The symbols of the cards the bot knows are in its own hand: all of them, until a plan takes
    /// a victim's unseen cards.
    pub known: Shape,
    /// Whether the seat to move has captured this turn, so draws a card as it ends (`CARDS-1`).
    pub card_earned: bool,
    /// Turns begun in the game: a seat whose place in the order is at or past it has not had its
    /// first turn (`REINF-6`).
    pub turn: u32,
}

impl Board {
    pub fn from_view(view: &View) -> Board {
        let players = view.seats.len();
        let mut b = Board {
            players: players as u8,
            order: [0; MAX_SEATS],
            owner: [0; N],
            armies: [0; N],
            owned: view.owned,
            alive: [false; MAX_SEATS],
            hand: [0; MAX_SEATS],
            known: shape_of(view.hand.as_ref().map_or(&[][..], |h| h.as_slice())),
            card_earned: view.card_earned,
            turn: view.turn,
        };
        b.order[..players].copy_from_slice(&view.turn_order);
        for (t, tv) in view.territories.iter().enumerate() {
            b.owner[t] = tv.owner;
            b.armies[t] = tv.armies;
        }
        for s in view.seats.iter() {
            b.alive[s.seat as usize] = !s.eliminated;
            b.hand[s.seat as usize] = s.hand_size;
        }
        // A seat whose last territory was just taken is out once the move-in is made (`ELIM-2`):
        // its cards are the capturer's already.
        for s in 0..players as Seat {
            b.eliminate_if_empty(s, view.active);
        }
        b
    }

    pub fn order(&self) -> &[Seat] {
        &self.order[..self.players as usize]
    }

    pub fn alive_count(&self) -> usize {
        self.alive.iter().filter(|&&a| a).count()
    }

    pub fn alive_seats(&self) -> impl Iterator<Item = Seat> + '_ {
        (0..self.players).filter(|&s| self.alive[s as usize])
    }

    pub fn set_owner(&mut self, t: usize, seat: Seat) {
        let bit = 1u64 << t;
        self.owned[self.owner[t] as usize] &= !bit;
        self.owned[seat as usize] |= bit;
        self.owner[t] = seat;
    }

    pub fn own(&self, seat: Seat) -> u64 {
        self.owned[seat as usize]
    }

    pub fn count(&self, seat: Seat) -> u32 {
        self.own(seat).count_ones()
    }

    pub fn armies_of(&self, seat: Seat) -> i32 {
        territories_in(self.own(seat)).map(|t| self.armies[t]).sum()
    }

    pub fn holds(&self, seat: Seat, continent: usize) -> bool {
        let mask = CONTINENT_MASKS[continent];
        self.own(seat) & mask == mask
    }

    pub fn enemy_beside(&self, t: usize) -> bool {
        ADJACENT[t] & !self.own(self.owner[t]) != 0
    }

    /// `REINF-2` and `REINF-3`: the armies `seat` gets from the board at the start of a turn.
    pub fn income(&self, seat: Seat) -> i32 {
        income_of(self.own(seat), 1.0) as i32
    }

    /// The seats still in the game that move after `seat` and before its next turn, in order.
    pub fn opponents_in_order(&self, seat: Seat) -> impl Iterator<Item = Seat> + '_ {
        let order = self.order();
        let at = order.iter().position(|&s| s == seat).unwrap_or(0);
        (1..order.len())
            .map(move |step| order[(at + step) % order.len()])
            .filter(|&s| self.alive[s as usize])
    }

    /// Marks a seat out once it holds nothing, handing its cards to `by` (`ELIM-2`).
    pub fn eliminate_if_empty(&mut self, victim: Seat, by: Seat) -> bool {
        let v = victim as usize;
        if !self.alive[v] || self.owned[v] != 0 {
            return false;
        }
        self.alive[v] = false;
        self.hand[by as usize] += self.hand[v];
        self.hand[v] = 0;
        true
    }

    /// `REINF-6`: the extra armies `seat` gets on its first turn, if it is still to come.
    pub fn first_turn_bonus(&self, seat: Seat) -> i32 {
        let at = self.order().iter().position(|&s| s == seat).unwrap_or(0);
        if (at as u32) < self.turn {
            return 0;
        }
        first_turn_bonus(self.players as usize, at)
    }

    /// The seats owning territories beside `seat`'s, as a mask of seats.
    pub fn neighbour_seats(&self, seat: Seat) -> u8 {
        let around = spread(self.own(seat)) & !self.own(seat);
        let mut seats = 0u8;
        for s in 0..self.players {
            if self.own(s) & around != 0 {
                seats |= 1 << s;
            }
        }
        seats
    }
}

/// Income from the territories in `own`, continents weighted by `continent_weight`.
pub fn income_of(own: u64, continent_weight: f64) -> f64 {
    let mut income = 3.max(own.count_ones() as i32 / 3) as f64;
    for (c, &mask) in CONTINENT_MASKS.iter().enumerate() {
        if own & mask == mask {
            income += CONTINENTS[c].bonus as f64 * continent_weight;
        }
    }
    income
}

/// `mask` and every territory beside it.
pub fn spread(mask: u64) -> u64 {
    let mut out = mask;
    for t in territories_in(mask) {
        out |= ADJACENT[t];
    }
    out
}

/// JavaScript's `Math.round` for the positive amounts the bot rounds.
pub fn round(x: f64) -> i32 {
    (x + 0.5).floor() as i32
}

// ---------------------------------------------------------------------------------------------
// Content hashes: a region of the board as 128 bits, for memos keyed by exactly what they read.
// ---------------------------------------------------------------------------------------------

fn mix(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9e37_79b9_7f4a_7c15);
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^ (x >> 31)
}

pub fn mix128(a: u64, b: u64) -> u128 {
    let lo = mix(a ^ mix(b));
    let hi = mix(a.rotate_left(17) ^ mix(b ^ 0x5851_f42d_4c95_7f2d));
    ((hi as u128) << 64) | lo as u128
}

/// Each territory's owner and armies on one board, as a hash.
#[derive(Clone)]
pub struct Scan {
    pub full: [u128; N],
}

impl Scan {
    pub fn new(b: &Board) -> Scan {
        let mut scan = Scan { full: [0; N] };
        for t in 0..N {
            scan.retake(b, t);
        }
        scan
    }

    /// Reads territory `t` again from `b`.
    pub fn retake(&mut self, b: &Board, t: usize) {
        let base = (t as u64) << 40 | (b.owner[t] as u64) << 32;
        self.full[t] = mix128(base, b.armies[t] as u32 as u64);
    }

    pub fn full_of(&self, mask: u64) -> u128 {
        territories_in(mask).fold(0, |h, t| h ^ self.full[t])
    }
}

/// The whole position as a hash, for remembering what a board scores.
pub fn board_hash(b: &Board, scan: &Scan) -> u128 {
    let mut seats = 0u64;
    for s in 0..MAX_SEATS {
        seats = seats << 8 | b.hand[s] as u64 | (b.alive[s] as u64) << 7;
    }
    let mut rest = b.turn as u64;
    rest = rest << 8 | b.card_earned as u64;
    for k in b.known {
        rest = rest << 4 | k as u64;
    }
    for &s in b.order() {
        rest = rest.rotate_left(3) ^ s as u64;
    }
    scan.full_of(crate::map::ALL_TERRITORIES) ^ mix128(seats, rest)
}

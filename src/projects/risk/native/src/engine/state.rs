//! The engine's whole game, laid out for speed: ownership as a mask per seat beside an owner per
//! territory, armies as a flat array, hands and the deck inline. It is `Copy`, so a search copies
//! a position as a few hundred bytes. Setup (`SETUP-*`) lives here too.

use super::events::{ContinentBonus, EventKind, EventSink};
use crate::cards::{Card, FULL_DECK};
use crate::list::List;
use crate::map::{territories_in, CONTINENTS, CONTINENT_MASKS, TERRITORY_COUNT};
use crate::rng::Rng;

/// A seat at the table, 0-based in seat order.
pub type Seat = u8;
/// A territory, its index in `map::TERRITORIES`.
pub type Territory = u8;

pub const MAX_SEATS: usize = 6;
/// The most cards a hand can hold here: `canonical.ts` lays a hand out in 12 slots, and the rules
/// keep a hand far below it (at most 5 outside a turn, plus an eliminated player's 5 or fewer).
pub const HAND_MAX: usize = 12;
pub const DECK_SIZE: usize = 44;

pub type Hand = List<Card, HAND_MAX>;
/// `deck[0]` is the top card: the order is a rule (`CARDS-8`).
pub type Deck = List<Card, DECK_SIZE>;

/// Setup takes no decisions (`SETUP-4`, `SETUP-5`), so a game starts in its first reinforce phase.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Phase {
    /// `REINF-*`, `CARDS-5`; also mid-attack after `ELIM-3`.
    #[default]
    Reinforce,
    Attack,
    Fortify,
    GameOver,
}

/// Bookkeeping for one reinforce phase: the turn's own (`REINF-*`, `CARDS-5`) or the mid-attack
/// one after an elimination (`ELIM-3`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Reinforce {
    pub armies_to_place: i32,
    /// Trades come before placing (`CARDS-5`): the first placement closes trading.
    pub placed_any: bool,
    pub after_elimination: bool,
}

/// A capture waiting for its move-in (`COMBAT-6`). `min` armies are already in `to` (`INV-1`);
/// `min` and `max` bound the total an `occupy` names.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Occupying {
    pub from: Territory,
    pub to: Territory,
    pub min: i32,
    pub max: i32,
    /// The seat whose last territory this was: its elimination waits for the move-in (`ELIM-3`,
    /// note `elimination-order`).
    pub eliminating: Option<Seat>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Game {
    pub players: u8,
    /// The seeded random source's state (`INV-10`).
    pub rng: u32,
    /// Seat order, `turn_order[0]` first (`SETUP-3`); entries past `players` are unused.
    pub turn_order: [Seat; MAX_SEATS],
    pub owner: [Seat; TERRITORY_COUNT],
    pub armies: [i32; TERRITORY_COUNT],
    /// Each seat's territories as a mask, kept equal to `owner`.
    pub owned: [u64; MAX_SEATS],
    pub hands: [Hand; MAX_SEATS],
    pub deck: Deck,
    /// Sets traded so far. Which cards they were is public and in the history (`Traded` events).
    pub trades: u32,
    pub eliminated: [bool; MAX_SEATS],
    /// The first turn is 1.
    pub turn: u32,
    /// Rounds of the turn order completed: 0 during every seat's first turn (`REINF-6`).
    pub round: u32,
    pub active: Seat,
    pub phase: Phase,
    pub reinforce: Option<Reinforce>,
    pub occupying: Option<Occupying>,
    /// Whether the active seat has captured a territory this turn (`CARDS-1`).
    pub captured_this_turn: bool,
    pub winner: Option<Seat>,
}

/// `SETUP-1`: starting armies by player count.
pub fn starting_armies(players: usize) -> i32 {
    match players {
        3 => 35,
        4 => 30,
        5 => 25,
        6 => 20,
        _ => panic!("Risk is for 3 to 6 players, not {players}"),
    }
}

/// `REINF-6`: the extra armies on each seat's first turn, by position in the turn order.
pub fn first_turn_bonus(players: usize, position: usize) -> i32 {
    const BONUS: [[i32; 6]; 4] = [
        [0, 0, 1, 0, 0, 0],
        [0, 0, 0, 1, 0, 0],
        [0, 0, 0, 1, 2, 0],
        [0, 0, 0, 1, 2, 3],
    ];
    BONUS[players - 3][position]
}

/// `REINF-2` and `REINF-3`, counted from what a seat owns.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Reinforcements {
    pub from_territories: i32,
    pub from_continents: List<ContinentBonus, 6>,
    pub total: i32,
}

pub fn reinforcements(own: u64) -> Reinforcements {
    let from_territories = 3.max(own.count_ones() as i32 / 3);
    let mut from_continents = List::new();
    let mut total = from_territories;
    for (c, &mask) in CONTINENT_MASKS.iter().enumerate() {
        if own & mask == mask {
            let bonus = CONTINENTS[c].bonus as i32;
            from_continents.push(ContinentBonus {
                continent: c as u8,
                bonus,
            });
            total += bonus;
        }
    }
    Reinforcements {
        from_territories,
        from_continents,
        total,
    }
}

impl Game {
    /// A new game, set up and waiting on the first player's first reinforcement. The random
    /// source is drawn in this order: the seat order (`SETUP-3`), the deal of the 42 territory
    /// cards (`SETUP-4`), each starting army's territory (`SETUP-5`), and the 44-card deck
    /// (`SETUP-6`).
    pub fn new(players: usize, seed: &str, events: &mut impl EventSink) -> Game {
        let per_seat = starting_armies(players);
        let mut rng = Rng::from_seed(seed);
        let seats: Vec<Seat> = (0..players as Seat).collect();
        let order = rng.shuffle(&seats);
        events.push(
            "SETUP-3",
            EventKind::TurnOrder {
                order: List::from_slice(&order),
            },
        );

        // SETUP-4: the wilds set aside, the territory cards shuffled and dealt round the seat
        // order from the first player, 1 army on each.
        let dealt = rng.shuffle(&FULL_DECK[..TERRITORY_COUNT]);
        let mut owner = [0; TERRITORY_COUNT];
        let mut armies = [0; TERRITORY_COUNT];
        for (i, &t) in dealt.iter().enumerate() {
            owner[t as usize] = order[i % players];
            armies[t as usize] = 1;
        }
        events.push(
            "SETUP-4",
            EventKind::Dealt {
                owners: Box::new(owner),
            },
        );

        // SETUP-5: each player's remaining armies, one at a time, on a random territory of their
        // own, chosen among them in the order they were dealt.
        for &seat in &order {
            let own: Vec<Card> = dealt
                .iter()
                .copied()
                .filter(|&t| owner[t as usize] == seat)
                .collect();
            for _ in 0..per_seat - own.len() as i32 {
                armies[*rng.pick(&own) as usize] += 1;
            }
        }
        events.push(
            "SETUP-5",
            EventKind::StartingArmies {
                armies: Box::new(armies),
            },
        );

        let mut turn_order = [0; MAX_SEATS];
        turn_order[..players].copy_from_slice(&order);
        let mut game = Game {
            players: players as u8,
            rng: 0,
            turn_order,
            owner,
            armies,
            owned: [0; MAX_SEATS],
            hands: [Hand::new(); MAX_SEATS],
            // SETUP-6: the wilds returned and all 44 cards shuffled as the deck.
            deck: Deck::from_slice(&rng.shuffle(&FULL_DECK)),
            trades: 0,
            eliminated: [false; MAX_SEATS],
            turn: 0,
            round: 0,
            active: order[0],
            phase: Phase::Reinforce,
            reinforce: None,
            occupying: None,
            captured_this_turn: false,
            winner: None,
        };
        game.recount_owned();
        events.push("SETUP-6", EventKind::DeckReshuffled);
        game.start_turn(order[0], "SETUP-7", events);
        game.rng = rng.state();
        game
    }

    /// Rebuilds the masks from `owner`, for a position built by hand.
    pub fn recount_owned(&mut self) {
        self.owned = [0; MAX_SEATS];
        for t in 0..TERRITORY_COUNT {
            self.owned[self.owner[t] as usize] |= 1 << t;
        }
    }

    pub fn set_owner(&mut self, territory: Territory, seat: Seat) {
        let bit = 1u64 << territory;
        self.owned[self.owner[territory as usize] as usize] &= !bit;
        self.owned[seat as usize] |= bit;
        self.owner[territory as usize] = seat;
    }

    pub fn turn_order(&self) -> &[Seat] {
        &self.turn_order[..self.players as usize]
    }

    /// The seat's position in the turn order.
    pub fn position(&self, seat: Seat) -> usize {
        self.turn_order()
            .iter()
            .position(|&s| s == seat)
            .unwrap_or_else(|| panic!("seat {seat} is not in the turn order"))
    }

    pub fn seats_in_game(&self) -> usize {
        self.turn_order()
            .iter()
            .filter(|&&s| !self.eliminated[s as usize])
            .count()
    }

    pub fn territory_count(&self, seat: Seat) -> u32 {
        self.owned[seat as usize].count_ones()
    }

    pub fn army_count(&self, seat: Seat) -> i32 {
        territories_in(self.owned[seat as usize])
            .map(|t| self.armies[t])
            .sum()
    }

    /// A turn begins with its reinforce phase (`TURN-1`, `REINF-1`).
    pub(super) fn start_turn(
        &mut self,
        seat: Seat,
        rule: &'static str,
        events: &mut impl EventSink,
    ) {
        self.turn += 1;
        self.active = seat;
        self.captured_this_turn = false;
        events.push(
            rule,
            EventKind::TurnStarted {
                seat,
                turn: self.turn,
            },
        );
        let earned = reinforcements(self.owned[seat as usize]);
        let bonus = if self.round == 0 {
            first_turn_bonus(self.players as usize, self.position(seat))
        } else {
            0
        };
        events.push(
            "REINF-1",
            EventKind::Reinforcements {
                seat,
                from_territories: earned.from_territories,
                from_continents: earned.from_continents,
                first_turn_bonus: bonus,
            },
        );
        self.reinforce = Some(Reinforce {
            armies_to_place: earned.total + bonus,
            placed_any: false,
            after_elimination: false,
        });
        self.set_phase(Phase::Reinforce, "TURN-1", events);
    }

    pub(super) fn set_phase(
        &mut self,
        phase: Phase,
        rule: &'static str,
        events: &mut impl EventSink,
    ) {
        self.phase = phase;
        events.push(rule, EventKind::Phase { phase });
    }
}

//! What happened: `contract.ts`'s `GameEvent`. Every event names the rule (or `RULES.md` note)
//! behind it, and carries only what the seat it is shown to may see (`redact`).

use super::state::{Phase, Seat, Territory};
use crate::cards::Card;
use crate::list::List;
use crate::map::TERRITORY_COUNT;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Event {
    pub rule: &'static str,
    pub kind: EventKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct ContinentBonus {
    pub continent: u8,
    pub bonus: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TradeBonus {
    pub territory: Territory,
    pub armies: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EventKind {
    TurnOrder {
        order: List<Seat, 6>,
    },
    /// The setup deal (`SETUP-4`): each territory's first owner, with 1 army on it.
    Dealt {
        owners: Box<[Seat; TERRITORY_COUNT]>,
    },
    /// Each territory's armies once the starting armies are placed (`SETUP-5`).
    StartingArmies {
        armies: Box<[i32; TERRITORY_COUNT]>,
    },
    Placed {
        owner: Seat,
        territory: Territory,
        armies: i32,
    },
    Reinforcements {
        seat: Seat,
        from_territories: i32,
        from_continents: List<ContinentBonus, 6>,
        /// A later seat's extra armies on its first turn (`REINF-6`); 0 otherwise.
        first_turn_bonus: i32,
    },
    Traded {
        seat: Seat,
        cards: [Card; 3],
        armies: i32,
        bonus: Option<TradeBonus>,
    },
    Battle {
        from: Territory,
        to: Territory,
        attacker_dice: List<u8, 3>,
        defender_dice: List<u8, 2>,
        attacker_losses: i32,
        defender_losses: i32,
    },
    /// A blitz (`COMBAT-8`), resolved at once: no dice are rolled.
    Blitzed {
        from: Territory,
        to: Territory,
        attacker_losses: i32,
        defender_losses: i32,
    },
    Captured {
        seat: Seat,
        territory: Territory,
        from: Seat,
    },
    Occupied {
        from: Territory,
        to: Territory,
        armies: i32,
    },
    Eliminated {
        seat: Seat,
        by: Seat,
        cards_taken: u8,
    },
    /// `card` is present only for the seat that drew it.
    CardDrawn {
        seat: Seat,
        card: Option<Card>,
    },
    DeckReshuffled,
    Fortified {
        from: Territory,
        to: Territory,
        armies: i32,
    },
    TurnStarted {
        seat: Seat,
        turn: u32,
    },
    Phase {
        phase: Phase,
    },
    GameOver {
        winner: Seat,
    },
}

impl Event {
    /// The event as `viewer` may see it: a card drawn by anyone else loses its face.
    pub fn redacted(&self, viewer: Option<Seat>) -> Event {
        match self.kind {
            EventKind::CardDrawn { seat, .. } if Some(seat) != viewer => Event {
                rule: self.rule,
                kind: EventKind::CardDrawn { seat, card: None },
            },
            _ => self.clone(),
        }
    }
}

/// The events as `viewer` may see them.
pub fn redact(events: &[Event], viewer: Option<Seat>) -> Vec<Event> {
    events.iter().map(|e| e.redacted(viewer)).collect()
}

/// Where a move's events go: a `Vec` to keep them, `Quiet` to drop them when only the state
/// matters (a search playing a line forward).
pub trait EventSink {
    fn push(&mut self, rule: &'static str, kind: EventKind);
}

impl EventSink for Vec<Event> {
    fn push(&mut self, rule: &'static str, kind: EventKind) {
        Vec::push(self, Event { rule, kind });
    }
}

pub struct Quiet;

impl EventSink for Quiet {
    #[inline]
    fn push(&mut self, _rule: &'static str, _kind: EventKind) {}
}

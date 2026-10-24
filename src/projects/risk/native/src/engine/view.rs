//! What one viewer may see (`CARDS-2`, note `public-cards`): `contract.ts`'s `GameView`. The
//! board, every hand's size, the traded cards and the viewer's own hand; never the deck's order,
//! other hands or the random source.

use super::state::{Game, Hand, Phase, Seat, Territory, MAX_SEATS};
use crate::cards::Card;
use crate::list::List;
use crate::map::TERRITORY_COUNT;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct TerritoryView {
    pub owner: Seat,
    pub armies: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct SeatView {
    pub seat: Seat,
    pub eliminated: bool,
    pub territories: u32,
    pub armies: i32,
    pub hand_size: u8,
}

/// A set traded, public once traded (`CARDS-2`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Trade {
    pub seat: Seat,
    pub cards: [Card; 3],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OccupyingView {
    pub from: Territory,
    pub to: Territory,
    pub min: i32,
    pub max: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct View {
    pub viewer: Option<Seat>,
    /// Seat order: `turn_order[0]` played first.
    pub turn_order: List<Seat, MAX_SEATS>,
    pub seats: List<SeatView, MAX_SEATS>,
    pub territories: [TerritoryView; TERRITORY_COUNT],
    /// Each seat's territories as a mask.
    pub owned: [u64; MAX_SEATS],
    pub turn: u32,
    pub active: Seat,
    pub phase: Phase,
    /// Armies the active seat still has to place this phase.
    pub armies_to_place: i32,
    /// Cards left in the deck.
    pub deck: u8,
    /// Every set traded so far, oldest first: its cards went back into the deck.
    pub traded: Vec<Trade>,
    /// The viewer's own hand; None for a spectator.
    pub hand: Option<Hand>,
    /// Set after a capture until the attacker moves in (`COMBAT-6`). The minimum has already
    /// moved in, so `territories` shows it.
    pub occupying: Option<OccupyingView>,
    /// Whether the active seat has captured this turn, so draws a card as it ends (`CARDS-1`).
    pub card_earned: bool,
    pub winner: Option<Seat>,
}

impl Game {
    /// What `viewer` may see. The state keeps only how many sets were traded, so the trades
    /// themselves come from whoever keeps the history (`runner` does); `traded` must hold them
    /// all.
    pub fn view(&self, viewer: Option<Seat>, traded: &[Trade]) -> View {
        if let Some(v) = viewer {
            assert!(v < self.players, "seat {v} is not at this table");
        }
        assert_eq!(
            traded.len(),
            self.trades as usize,
            "the view needs every trade made"
        );
        let mut territories = [TerritoryView::default(); TERRITORY_COUNT];
        for (t, view) in territories.iter_mut().enumerate() {
            *view = TerritoryView {
                owner: self.owner[t],
                armies: self.armies[t],
            };
        }
        let mut seats = List::new();
        for seat in 0..self.players {
            seats.push(SeatView {
                seat,
                eliminated: self.eliminated[seat as usize],
                territories: self.territory_count(seat),
                armies: self.army_count(seat),
                hand_size: self.hands[seat as usize].len() as u8,
            });
        }
        View {
            viewer,
            turn_order: List::from_slice(self.turn_order()),
            seats,
            territories,
            owned: self.owned,
            turn: self.turn,
            active: self.active,
            phase: self.phase,
            armies_to_place: self.reinforce.map_or(0, |r| r.armies_to_place),
            deck: self.deck.len() as u8,
            traded: traded.to_vec(),
            hand: viewer.map(|v| self.hands[v as usize]),
            occupying: self.occupying.map(|o| OccupyingView {
                from: o.from,
                to: o.to,
                min: o.min,
                max: o.max,
            }),
            card_earned: self.captured_this_turn,
            winner: self.winner,
        }
    }
}

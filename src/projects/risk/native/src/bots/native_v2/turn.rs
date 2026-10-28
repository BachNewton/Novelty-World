//! The turn's search point, rebuilt at any later decision of the turn from the seat's history: the
//! board as it stood before the turn's first placement, replayed from the public events. A bot keeps
//! no state, so the switches that carry the turn's plan or its leader past the placement (`execute`,
//! `threat`) read it back here.

use crate::bots::native_v1::board::Board;
use crate::engine::{
    Event, EventKind, Hand, Phase, SeatView, TerritoryView, Trade, View, DECK_SIZE, MAX_SEATS,
};
use crate::list::List;
use crate::map::TERRITORY_COUNT;

/// The public board after `events`: what every seat may see.
struct Public {
    owner: [u8; TERRITORY_COUNT],
    armies: [i32; TERRITORY_COUNT],
    hand: [u8; MAX_SEATS],
    eliminated: [bool; MAX_SEATS],
    deck: i32,
    traded: Vec<Trade>,
}

fn replay(events: &[Event]) -> Public {
    let mut p = Public {
        owner: [0; TERRITORY_COUNT],
        armies: [0; TERRITORY_COUNT],
        hand: [0; MAX_SEATS],
        eliminated: [false; MAX_SEATS],
        deck: 0,
        traded: Vec::new(),
    };
    for e in events {
        match &e.kind {
            EventKind::Dealt { owners } => {
                p.owner = **owners;
                p.armies = [1; TERRITORY_COUNT];
            }
            EventKind::StartingArmies { armies } => p.armies = **armies,
            EventKind::DeckReshuffled => p.deck = DECK_SIZE as i32,
            &EventKind::Placed {
                territory, armies, ..
            } => p.armies[territory as usize] += armies,
            &EventKind::Traded {
                seat, cards, bonus, ..
            } => {
                if let Some(b) = bonus {
                    p.armies[b.territory as usize] += b.armies;
                }
                p.hand[seat as usize] -= 3;
                p.deck += 3;
                p.traded.push(Trade { seat, cards });
            }
            &EventKind::Battle {
                from,
                to,
                attacker_losses,
                defender_losses,
                ..
            }
            | &EventKind::Blitzed {
                from,
                to,
                attacker_losses,
                defender_losses,
            } => {
                p.armies[from as usize] -= attacker_losses;
                p.armies[to as usize] -= defender_losses;
            }
            // COMBAT-6: the minimum moves in with the capture; the move-in names its total.
            &EventKind::Captured {
                seat, territory, ..
            } => p.owner[territory as usize] = seat,
            &EventKind::Occupied { from, to, armies }
            | &EventKind::Fortified { from, to, armies } => {
                p.armies[from as usize] -= armies;
                p.armies[to as usize] += armies;
            }
            &EventKind::Eliminated {
                seat,
                by,
                cards_taken,
            } => {
                p.eliminated[seat as usize] = true;
                p.hand[by as usize] += cards_taken;
                p.hand[seat as usize] = 0;
            }
            &EventKind::CardDrawn { seat, .. } => {
                p.hand[seat as usize] += 1;
                p.deck -= 1;
            }
            _ => {}
        }
    }
    p
}

/// The turn's search point as it stood before its first placement, and where in the history that
/// was, from any decision of the seat's own turn after it. None outside the seat's turn, before
/// its first placement, and once the seat has taken an eliminated seat's cards this turn: their
/// faces aren't in the history, so the hand it searched with can't be read back.
pub fn turn_point(view: &View, history: &[Event]) -> Option<(View, usize)> {
    let me = view.viewer?;
    if view.active != me {
        return None;
    }
    let start = history
        .iter()
        .rposition(|e| matches!(e.kind, EventKind::TurnStarted { .. }))?;
    match history[start].kind {
        EventKind::TurnStarted { seat, .. } if seat == me => {}
        _ => return None,
    }
    let phase = start
        + history[start..].iter().position(|e| {
            matches!(
                e.kind,
                EventKind::Phase {
                    phase: Phase::Reinforce
                }
            )
        })?;
    let first = phase
        + history[phase..]
            .iter()
            .position(|e| matches!(e.kind, EventKind::Placed { .. }))?;
    let mut to_place = 0;
    for e in &history[first..] {
        match e.kind {
            EventKind::Placed { armies, .. } => to_place += armies,
            EventKind::Phase { .. } => break,
            _ => {}
        }
    }
    if history[first..]
        .iter()
        .any(|e| matches!(e.kind, EventKind::Eliminated { by, .. } if by == me))
    {
        return None;
    }
    let public = replay(&history[..first]);
    Some((seen_by(view, public, to_place, view.hand), first))
}

/// The view `view`'s seat had of `public`, in its own reinforce phase with `to_place` to place.
fn seen_by(view: &View, p: Public, to_place: i32, hand: Option<Hand>) -> View {
    let me = view.viewer.expect("a seat's view");
    let mut owned = [0u64; MAX_SEATS];
    let mut territories = [TerritoryView::default(); TERRITORY_COUNT];
    for t in 0..TERRITORY_COUNT {
        owned[p.owner[t] as usize] |= 1 << t;
        territories[t] = TerritoryView {
            owner: p.owner[t],
            armies: p.armies[t],
        };
    }
    let mut seats = List::new();
    for s in view.seats.iter() {
        let own = owned[s.seat as usize];
        seats.push(SeatView {
            seat: s.seat,
            eliminated: p.eliminated[s.seat as usize],
            territories: own.count_ones(),
            armies: crate::map::territories_in(own).map(|t| p.armies[t]).sum(),
            hand_size: p.hand[s.seat as usize],
        });
    }
    View {
        viewer: Some(me),
        turn_order: view.turn_order,
        seats,
        territories,
        owned,
        turn: view.turn,
        active: me,
        phase: Phase::Reinforce,
        armies_to_place: to_place,
        deck: p.deck as u8,
        traded: p.traded,
        hand,
        occupying: None,
        card_earned: false,
        winner: None,
    }
}

/// The board at the start of the seat's own turn, before its trades, as everyone sees it (its own
/// cards unseen): what `threat` names the turn's leader from, once a turn.
pub fn turn_start(view: &View, history: &[Event]) -> Option<Board> {
    let me = view.viewer?;
    if view.active != me {
        return None;
    }
    let start = history
        .iter()
        .rposition(|e| matches!(e.kind, EventKind::TurnStarted { .. }))?;
    let phase = start
        + history[start..].iter().position(|e| {
            matches!(
                e.kind,
                EventKind::Phase {
                    phase: Phase::Reinforce
                }
            )
        })?;
    Some(Board::from_view(&seen_by(
        view,
        replay(&history[..phase]),
        0,
        None,
    )))
}

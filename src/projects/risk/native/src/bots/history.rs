//! `bots/history.ts`: what bots read back from the game's public history. A bot keeps no state
//! between moves, so anything it remembers it derives here, from the events its seat saw.

use crate::engine::{Event, EventKind, Seat, Territory};
use crate::map::TERRITORY_COUNT;

/// The active seat's turn so far.
#[derive(Clone, Debug, Default)]
pub struct TurnSoFar {
    /// Battles and blitzes made.
    pub attacks: usize,
    /// Territories captured, in order.
    pub captured: Vec<Territory>,
    /// Territories armies were placed on (in any reinforce phase of the turn), in order, each once.
    pub placed_on: Vec<Territory>,
    /// Sets traded.
    pub traded: usize,
}

/// The turn under way: the events since the last turn began.
pub fn turn_so_far(history: &[Event]) -> TurnSoFar {
    let start = history
        .iter()
        .rposition(|e| matches!(e.kind, EventKind::TurnStarted { .. }))
        .expect("a turn has started");
    let mut so = TurnSoFar::default();
    for e in &history[start + 1..] {
        match e.kind {
            EventKind::Battle { .. } | EventKind::Blitzed { .. } => so.attacks += 1,
            EventKind::Captured { territory, .. } => so.captured.push(territory),
            EventKind::Placed { territory, .. } if !so.placed_on.contains(&territory) => {
                so.placed_on.push(territory)
            }
            EventKind::Traded { .. } => so.traded += 1,
            _ => {}
        }
    }
    so
}

/// The board as the events rebuild it.
#[derive(Clone, Copy, Debug)]
pub struct Board {
    pub owner: [Seat; TERRITORY_COUNT],
    pub armies: [i32; TERRITORY_COUNT],
}

/// Walks the board as it stood when each turn ended (the moment the next turn began): `visit`
/// sees the seat whose turn it was and the board. Returning true stops the walk, and the walk
/// returns whether it was stopped.
pub fn for_each_turn_end(history: &[Event], mut visit: impl FnMut(Seat, &Board) -> bool) -> bool {
    let mut board = Board {
        owner: [0; TERRITORY_COUNT],
        armies: [0; TERRITORY_COUNT],
    };
    let mut current: Option<Seat> = None;
    for e in history {
        match &e.kind {
            EventKind::Dealt { owners } => {
                board.owner = **owners;
                board.armies = [1; TERRITORY_COUNT];
            }
            EventKind::StartingArmies { armies } => board.armies = **armies,
            &EventKind::Placed {
                territory, armies, ..
            } => board.armies[territory as usize] += armies,
            EventKind::Traded {
                bonus: Some(bonus), ..
            } => board.armies[bonus.territory as usize] += bonus.armies,
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
                board.armies[from as usize] -= attacker_losses;
                board.armies[to as usize] -= defender_losses;
            }
            &EventKind::Captured {
                seat, territory, ..
            } => board.owner[territory as usize] = seat,
            // The move-in names its total, the minimum that went in with the capture included.
            &EventKind::Occupied { from, to, armies }
            | &EventKind::Fortified { from, to, armies } => {
                board.armies[from as usize] -= armies;
                board.armies[to as usize] += armies;
            }
            &EventKind::TurnStarted { seat, .. } => {
                if current.is_some_and(|ended| visit(ended, &board)) {
                    return true;
                }
                current = Some(seat);
            }
            _ => {}
        }
    }
    false
}

/// Rounds of the turn order completed (`REINF-6`): 0 while every seat is on its first turn. A
/// round ends when the turn passes back to a seat earlier in the turn order.
pub fn rounds_completed(history: &[Event]) -> u32 {
    let mut order: &[Seat] = &[];
    let mut last: Option<usize> = None;
    let mut rounds = 0;
    for e in history {
        match &e.kind {
            EventKind::TurnOrder { order: o } => order = o,
            EventKind::TurnStarted { seat, .. } => {
                let at = order
                    .iter()
                    .position(|s| s == seat)
                    .expect("every seat is in the turn order");
                if last.is_some_and(|last| at <= last) {
                    rounds += 1;
                }
                last = Some(at);
            }
            _ => {}
        }
    }
    rounds
}

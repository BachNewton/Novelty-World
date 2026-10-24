//! `RULES.md`'s invariants (`INV-*`), checked on a state and on a step from one state to the next.
//! The fuzz runs them after every move; the lockstep may too. `INV-10` (determinism) is a property
//! of whole games and is checked by replaying them.

use super::events::{Event, EventKind};
use super::state::{Game, Phase};
use crate::cards::{is_valid_set, set_value};
use crate::map::{ALL_TERRITORIES, TERRITORY_COUNT};

fn fail(rule: &str, what: String) -> Result<(), String> {
    Err(format!("{rule}: {what}"))
}

/// The invariants a single state must hold.
pub fn check_state(g: &Game) -> Result<(), String> {
    let players = g.players as usize;

    // INV-1: every territory has one owner, a seat in the game, and at least 1 army; the masks
    // agree with the owners.
    let mut covered = 0u64;
    for seat in 0..players {
        if covered & g.owned[seat] != 0 {
            return fail("INV-1", format!("seat {seat}'s mask overlaps another's"));
        }
        covered |= g.owned[seat];
    }
    if covered != ALL_TERRITORIES || g.owned[players..].iter().any(|&m| m != 0) {
        return fail(
            "INV-1",
            "the seats' masks don't cover the board exactly".into(),
        );
    }
    for t in 0..TERRITORY_COUNT {
        let owner = g.owner[t] as usize;
        if owner >= players || g.owned[owner] & (1 << t) == 0 {
            return fail(
                "INV-1",
                format!("territory {t}'s owner {owner} disagrees with the masks"),
            );
        }
        if g.armies[t] < 1 {
            return fail(
                "INV-1",
                format!("territory {t} holds {} armies", g.armies[t]),
            );
        }
    }

    // INV-4: the 44 cards, each in exactly one place.
    let mut seen = [0u8; 44];
    for &card in g.deck.iter() {
        seen[card as usize] += 1;
    }
    for hand in &g.hands[..players] {
        for &card in hand.iter() {
            seen[card as usize] += 1;
        }
    }
    if g.hands[players..].iter().any(|h| !h.is_empty()) {
        return fail("INV-4", "a seat past the table holds cards".into());
    }
    if let Some(card) = seen.iter().position(|&n| n != 1) {
        return fail("INV-4", format!("card {card} is in {} places", seen[card]));
    }

    // INV-8: a seat with no territory is out and holds no cards; a seat with one is in. A seat
    // whose last territory was just captured is out once the move-in is made (note
    // `elimination-order`).
    let pending = g.occupying.and_then(|o| o.eliminating);
    for seat in 0..players {
        let out = g.eliminated[seat];
        if pending == Some(seat as u8) {
            if out || g.owned[seat] != 0 {
                return fail(
                    "INV-8",
                    format!("seat {seat} awaits elimination but is out or owns territory"),
                );
            }
            continue;
        }
        if out != (g.owned[seat] == 0) {
            return fail(
                "INV-8",
                format!(
                    "seat {seat} eliminated {out} owning {}",
                    g.owned[seat].count_ones()
                ),
            );
        }
        if out && !g.hands[seat].is_empty() {
            return fail("INV-8", format!("eliminated seat {seat} holds cards"));
        }
    }
    if g.phase != Phase::GameOver && g.eliminated[g.active as usize] {
        return fail("INV-8", format!("eliminated seat {} is active", g.active));
    }

    // INV-9: the game is over exactly when one seat remains, and it won.
    let left = g.seats_in_game();
    let over = g.phase == Phase::GameOver;
    if over != (left == 1) {
        return fail(
            "INV-9",
            format!("phase {:?} with {left} seats in the game", g.phase),
        );
    }
    if over != g.winner.is_some() || (over && g.winner != Some(g.active)) {
        return fail(
            "INV-9",
            format!("winner {:?} in phase {:?}", g.winner, g.phase),
        );
    }
    if over && (0..g.players).any(|s| g.options(s).is_some()) {
        return fail("INV-9", "a move is offered after the game ended".into());
    }

    // INV-3: the phase's bookkeeping matches the phase.
    if (g.phase == Phase::Reinforce) != g.reinforce.is_some() {
        return fail(
            "INV-3",
            format!("phase {:?} with reinforce {:?}", g.phase, g.reinforce),
        );
    }
    if g.occupying.is_some() && g.phase != Phase::Attack {
        return fail("INV-3", format!("a move-in pending in phase {:?}", g.phase));
    }
    if let Some(r) = g.reinforce {
        if r.armies_to_place < 0
            || (r.armies_to_place == 0 && !(r.after_elimination && g.must_trade()))
        {
            return fail(
                "INV-3",
                format!("a reinforce phase with {} to place", r.armies_to_place),
            );
        }
    }

    // INV-6: hand sizes.
    let active = g.active as usize;
    for seat in 0..players {
        let size = g.hands[seat].len();
        let limit = match (seat == active, g.phase, g.reinforce) {
            (true, Phase::GameOver, _) => usize::MAX,
            (true, Phase::Attack | Phase::Fortify, _) => 4,
            (true, Phase::Reinforce, Some(r)) if r.after_elimination => 9,
            _ => 5,
        };
        if size > limit {
            return fail(
                "INV-6",
                format!("seat {seat} holds {size} cards in phase {:?}", g.phase),
            );
        }
    }
    Ok(())
}

/// The invariants of one applied move: `before`, its events, and `after`.
pub fn check_step(before: &Game, events: &[Event], after: &Game) -> Result<(), String> {
    let total = |g: &Game| -> i64 { g.armies.iter().map(|&a| a as i64).sum() };
    let mut placed = 0i64;
    let mut lost = 0i64;
    let mut fortified = 0;
    let mut drawn = 0;
    let mut captured = before.captured_this_turn;
    for event in events {
        match &event.kind {
            EventKind::Placed { armies, .. } => placed += *armies as i64,
            EventKind::Traded {
                cards,
                armies,
                bonus,
                ..
            } => {
                // INV-5 and INV-7.
                if !is_valid_set(cards) || *armies != set_value(cards) as i32 {
                    return fail("INV-5", format!("a trade of {cards:?} worth {armies}"));
                }
                if let Some(b) = bonus {
                    if b.armies != 2 {
                        return fail("INV-7", format!("a bonus of {}", b.armies));
                    }
                    placed += 2;
                }
            }
            EventKind::Battle {
                attacker_dice,
                defender_dice,
                attacker_losses,
                defender_losses,
                ..
            } => {
                // INV-2: a battle removes exactly min(attacker dice, defender dice) armies.
                let pairs = attacker_dice.len().min(defender_dice.len()) as i32;
                if attacker_losses + defender_losses != pairs {
                    return fail(
                        "INV-2",
                        format!(
                            "a battle of {pairs} pairs lost {}",
                            attacker_losses + defender_losses
                        ),
                    );
                }
                if fortified > 0 {
                    return fail("INV-3", "a battle after fortifying".into());
                }
                lost += (attacker_losses + defender_losses) as i64;
            }
            EventKind::Blitzed {
                attacker_losses,
                defender_losses,
                ..
            } => {
                if fortified > 0 {
                    return fail("INV-3", "a blitz after fortifying".into());
                }
                lost += (attacker_losses + defender_losses) as i64;
            }
            EventKind::Fortified { .. } => fortified += 1,
            EventKind::CardDrawn { .. } => drawn += 1,
            EventKind::Captured { .. } => captured = true,
            EventKind::TurnStarted { seat, .. } if after.hands[*seat as usize].len() > 5 => {
                return fail(
                    "INV-6",
                    format!("seat {seat} starts its turn holding more than 5 cards"),
                );
            }
            _ => {}
        }
    }
    if total(after) - total(before) != placed - lost {
        return fail(
            "INV-2",
            format!(
                "the board went from {} to {} armies, placing {placed} and losing {lost}",
                total(before),
                total(after)
            ),
        );
    }
    if fortified > 1 {
        return fail("INV-3", format!("{fortified} fortifying moves in a turn"));
    }
    if drawn > 1 || (drawn == 1 && !captured) {
        return fail("INV-4", format!("{drawn} cards drawn as a turn ended"));
    }
    check_state(after)
}

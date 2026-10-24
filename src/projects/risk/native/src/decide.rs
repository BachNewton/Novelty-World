//! The bots in lockstep with recorded games: at every decision of a TypeScript record, the native
//! bot its seat names is asked for its move on the exact input the runner builds, and must play
//! the recorded one.

use crate::bots::bot;
use crate::engine::Options;
use crate::record::{encode_move, read_records, recorded_move, RecordedGame};
use crate::runner::drive;
use std::collections::BTreeMap;
use std::path::Path;

/// Asks the record's bots every decision; returns the decisions compared, or the first mismatch.
pub fn check_bots(record: &RecordedGame) -> Result<usize, String> {
    let bots = record
        .bots
        .iter()
        .map(|label| bot(label).ok_or_else(|| format!("no native bot \"{label}\"")))
        .collect::<Result<Vec<_>, _>>()?;
    let game = drive(
        &record.seed,
        record.players,
        record.max_turns,
        |decision, input| {
            let at = |what: String| {
                format!(
                    "decision {decision} (turn {}, {:?}, seat {}): {what}",
                    input.view.turn, input.view.phase, input.seat
                )
            };
            let recorded = record
                .moves
                .get(decision as usize)
                .ok_or_else(|| at("the record ends and the game goes on".into()))?;
            let (seat, mv) = recorded_move(recorded).map_err(at)?;
            if seat != input.seat {
                return Err(at(format!("the record has seat {seat} to move")));
            }
            let mine = bots[seat as usize].decide(input);
            let [kind, x, y, z, w] = encode_move(mine);
            let encoded = [seat as i64, kind, x, y, z, w];
            if encoded != *recorded {
                return Err(at(format!(
                    "bot \"{}\" plays {encoded:?} ({mine:?}), the record has {recorded:?} ({mv:?})",
                    record.bots[seat as usize]
                )));
            }
            Ok(mv)
        },
        |_| {},
    )?;
    if game.decisions as usize != record.moves.len() {
        return Err(format!(
            "the game ended after {} decisions, the record has {}",
            game.decisions,
            record.moves.len()
        ));
    }
    Ok(record.moves.len())
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Tally {
    pub games: usize,
    pub decisions: usize,
}

/// Checks every record in a file, stopping at the first mismatch.
pub fn check_file(path: &Path) -> Result<Tally, String> {
    let mut tally = Tally::default();
    for (i, record) in read_records(path)?.iter().enumerate() {
        let compared = check_bots(record).map_err(|e| {
            format!(
                "{}: game {i} (seed \"{}\", bots {:?}), {e}",
                path.display(),
                record.seed,
                record.bots
            )
        })?;
        tally.games += 1;
        tally.decisions += compared;
    }
    Ok(tally)
}

/// How often `label` decides as a record's own seats did, by decision kind: at every decision of a
/// seat whose recorded bot is `seats` (every seat when None), `label` is asked on the exact input
/// the runner builds, and the game goes on with the recorded move. Returns per kind the decisions
/// agreed and asked.
pub fn agreement(
    path: &Path,
    label: &str,
    seats: Option<&str>,
) -> Result<BTreeMap<&'static str, (u32, u32)>, String> {
    let mine = bot(label).ok_or_else(|| format!("no native bot \"{label}\""))?;
    let mut tally = BTreeMap::new();
    for record in read_records(path)? {
        drive(
            &record.seed,
            record.players,
            record.max_turns,
            |decision, input| {
                let recorded = record.moves.get(decision as usize).ok_or_else(|| {
                    format!("{}: the record ends and the game goes on", record.seed)
                })?;
                let (seat, mv) = recorded_move(recorded)?;
                if seats.is_none_or(|l| record.bots[seat as usize] == l) {
                    let kind = match input.options {
                        Options::Reinforce(r) if !r.sets.is_empty() => "trade",
                        Options::Reinforce(_) => "placement",
                        Options::Attack(_) => "attack",
                        Options::Occupy { .. } => "move-in",
                        Options::Fortify(_) => "fortify",
                    };
                    let e: &mut (u32, u32) = tally.entry(kind).or_default();
                    e.1 += 1;
                    e.0 += u32::from(mine.decide(input) == mv);
                }
                Ok(mv)
            },
            |_| {},
        )?;
    }
    Ok(tally)
}

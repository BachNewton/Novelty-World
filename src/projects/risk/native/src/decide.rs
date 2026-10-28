//! The bots in lockstep with recorded games: at every decision of a TypeScript record, the native
//! bot its seat names is asked for its move on the exact input the runner builds, and must play
//! the recorded one.

use crate::bots::bot;
use crate::engine::{Move, Options};
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

/// An online game's log (`eval/online-log.ts`'s `OnlineLog`): its seed, a label per seat (a bot's
/// label, or a person's name), and every move made.
#[derive(serde::Deserialize)]
pub struct OnlineLog {
    pub seed: String,
    pub labels: Vec<String>,
    pub moves: Vec<LoggedMove>,
}

#[derive(serde::Deserialize)]
pub struct LoggedMove {
    pub seat: crate::engine::Seat,
    #[serde(rename = "move")]
    pub mv: crate::wire::MoveJson,
}

/// Whether a log's seat label names a bot rather than a person.
pub fn is_bot_label(label: &str) -> bool {
    [
        "rule-", "gd-", "greedy", "native-", "net-", "student-", "random", "sweeper-", "vulture-",
    ]
    .iter()
    .any(|p| label.starts_with(p))
}

pub fn read_online_log(path: &Path) -> Result<OnlineLog, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))
}

/// How often a bot decides as an online game's seats did.
#[derive(Default)]
pub struct OnlineAgreement {
    /// Per decision kind, the decisions agreed and asked.
    pub kinds: BTreeMap<&'static str, (u32, u32)>,
    /// The bot's time on each of the seats' turns, in nanoseconds.
    pub turn_nanos: Vec<u128>,
    /// The turn-start placements it decided otherwise: decision index, turn, its move, the move
    /// played.
    pub differed: Vec<(u32, u32, Move, Move)>,
}

/// Asks `label` every decision of `seats` in an online game, on the exact input the runner builds
/// (people's seats flagged as people), the game going on with the move played. Once the bot
/// answers one of a reinforce phase's decisions otherwise than the move played, the phase's later
/// decisions are off its path and it isn't asked them: a bot that plans the phase whole can only
/// place the rest of its own plan.
pub fn online_agreement(
    log: &OnlineLog,
    label: &str,
    seats: &[crate::engine::Seat],
) -> Result<OnlineAgreement, String> {
    use crate::engine::{EventKind, Phase};
    let mine = bot(label).ok_or_else(|| format!("no native bot \"{label}\""))?;
    let humans: Vec<bool> = log.labels.iter().map(|l| !is_bot_label(l)).collect();
    let mut out = OnlineAgreement::default();
    let mut off_path: Option<u32> = None;
    let mut turn_of: Option<u32> = None;
    crate::runner::drive_seated(
        &log.seed,
        &humans,
        100_000,
        |decision, input| {
            let logged = log
                .moves
                .get(decision as usize)
                .ok_or_else(|| format!("decision {decision}: the log ends and the game goes on"))?;
            if logged.seat != input.seat {
                return Err(format!(
                    "decision {decision}: the log has seat {} to move",
                    logged.seat
                ));
            }
            let played = logged.mv.to_move()?;
            if !seats.contains(&input.seat) {
                return Ok(played);
            }
            if off_path
                .is_some_and(|t| t != input.view.turn || input.view.phase != Phase::Reinforce)
            {
                off_path = None;
            }
            if off_path.is_some() {
                return Ok(played);
            }
            let first_placement = matches!(input.options, Options::Reinforce(r) if r.may_place)
                && !input.history[input
                    .history
                    .iter()
                    .rposition(|e| matches!(e.kind, EventKind::Phase { .. }))
                    .unwrap_or(0)..]
                    .iter()
                    .any(|e| matches!(e.kind, EventKind::Placed { .. }));
            let kind = match input.options {
                Options::Reinforce(r) if !r.sets.is_empty() => "trade",
                Options::Reinforce(_) if first_placement => "first placement",
                Options::Reinforce(_) => "placement",
                Options::Attack(_) => "attack",
                Options::Occupy { .. } => "move-in",
                Options::Fortify(_) => "fortify",
            };
            let t = std::time::Instant::now();
            let mv = mine.decide(input);
            let spent = t.elapsed().as_nanos();
            if turn_of != Some(input.view.turn) {
                turn_of = Some(input.view.turn);
                out.turn_nanos.push(0);
            }
            *out.turn_nanos.last_mut().expect("a turn has begun") += spent;
            let e = out.kinds.entry(kind).or_default();
            e.1 += 1;
            if mv == played {
                e.0 += 1;
            } else {
                if matches!(input.options, Options::Reinforce(_)) {
                    off_path = Some(input.view.turn);
                }
                if first_placement {
                    out.differed.push((decision, input.view.turn, mv, played));
                }
            }
            Ok(played)
        },
        |_| {},
    )?;
    Ok(out)
}

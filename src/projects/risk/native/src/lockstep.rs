//! Lockstep replay of TypeScript games as a rules check (`ideas/native-port.md`, "Verifying the
//! engine"): every move of a recorded reference game must be legal here, offered among the same
//! options, and lead to the same state, hash for hash; then the result must be the runner's.

use crate::canonical::{options_fields, options_hash, state_field_name, state_fields, state_hash};
use crate::engine::Game;
use crate::map::TERRITORIES;
use crate::record::{read_records, recorded_move, RecordedGame, RecordedResult};
use crate::runner::{stopped, Places};
use std::fmt::Write;
use std::path::Path;

/// The first place a record and this engine part ways.
#[derive(Debug)]
pub struct Divergence {
    /// None before the first move or after the last.
    pub decision: Option<usize>,
    pub what: String,
}

fn diverged(decision: Option<usize>, what: String) -> Divergence {
    Divergence { decision, what }
}

/// A readable dump of a state: what matters to a rules question, then every canonical field.
pub fn describe(g: &Game) -> String {
    let mut out = String::new();
    let _ = writeln!(
        out,
        "turn {} round {}, seat {} active, {:?}; reinforce {:?}; occupying {:?}; captured {}; winner {:?}",
        g.turn, g.round, g.active, g.phase, g.reinforce, g.occupying, g.captured_this_turn, g.winner
    );
    let _ = writeln!(
        out,
        "turn order {:?}, eliminated {:?}",
        g.turn_order(),
        &g.eliminated[..g.players as usize]
    );
    for seat in 0..g.players {
        let _ = writeln!(
            out,
            "seat {seat}: {} territories, {} armies, hand {:?}",
            g.territory_count(seat),
            g.army_count(seat),
            g.hands[seat as usize]
        );
    }
    let board: Vec<String> = (0..TERRITORIES.len())
        .map(|t| format!("{}={}:{}", TERRITORIES[t].id, g.owner[t], g.armies[t]))
        .collect();
    let _ = writeln!(out, "board {}", board.join(" "));
    let _ = writeln!(out, "deck {:?} ({} trades)", g.deck, g.trades);
    let fields: Vec<String> = state_fields(g)
        .iter()
        .enumerate()
        .map(|(i, v)| format!("{}={v}", state_field_name(i)))
        .collect();
    let _ = write!(out, "fields {}", fields.join(" "));
    out
}

/// Replays one record; returns its move count.
pub fn replay(record: &RecordedGame) -> Result<usize, Divergence> {
    let moves = record.moves.len();
    if record.bots.len() != record.players {
        return Err(diverged(
            None,
            format!(
                "{} players but {} bot labels",
                record.players,
                record.bots.len()
            ),
        ));
    }
    if record.state_hashes.len() != moves || record.options_hashes.len() != moves {
        return Err(diverged(
            None,
            format!(
                "{moves} moves, {} state hashes, {} options hashes",
                record.state_hashes.len(),
                record.options_hashes.len()
            ),
        ));
    }
    if !(3..=6).contains(&record.players) {
        return Err(diverged(None, format!("{} players", record.players)));
    }
    let (mut game, _) = crate::engine::new_game(record.players, &record.seed);
    let hash = state_hash(&game);
    if hash != record.initial_hash {
        return Err(diverged(
            None,
            format!(
                "initial state hash {hash}, the record has {}\n{}",
                record.initial_hash,
                describe(&game)
            ),
        ));
    }
    let mut places = Places::new(record.players);
    let mut decision = 0;
    let (winner, turns) = loop {
        if let Some(end) = stopped(&game, record.max_turns) {
            break end;
        }
        let d = Some(decision);
        let Some(fields) = record.moves.get(decision) else {
            return Err(diverged(
                d,
                format!("the record ends and the game goes on\n{}", describe(&game)),
            ));
        };
        let (seat, mv) = recorded_move(fields)
            .map_err(|e| diverged(d, format!("the move {fields:?} doesn't decode: {e}")))?;
        if seat != game.active {
            return Err(diverged(
                d,
                format!(
                    "seat {} is to move, the record has seat {seat}\n{}",
                    game.active,
                    describe(&game)
                ),
            ));
        }
        let options = game.options(seat).ok_or_else(|| {
            diverged(
                d,
                format!(
                    "seat {seat} is to move but has no options\n{}",
                    describe(&game)
                ),
            )
        })?;
        let hash = options_hash(&options);
        if hash != record.options_hashes[decision] {
            return Err(diverged(
                d,
                format!(
                    "options hash {hash} before {mv:?}, the record has {}\nnative options {options:?}\noptions fields {:?}\n{}",
                    record.options_hashes[decision],
                    options_fields(&options),
                    describe(&game)
                ),
            ));
        }
        let before = game;
        let events = game.apply(seat, mv).map_err(|reason| {
            diverged(
                d,
                format!("{mv:?} is refused here ({reason})\n{}", describe(&before)),
            )
        })?;
        let hash = state_hash(&game);
        if hash != record.state_hashes[decision] {
            return Err(diverged(
                d,
                format!(
                    "state hash {hash} after {mv:?}, the record has {}\nevents {events:?}\nbefore: {}\nafter: {}",
                    record.state_hashes[decision],
                    describe(&before),
                    describe(&game)
                ),
            ));
        }
        places.record(&events);
        decision += 1;
    };
    if decision != moves {
        return Err(diverged(
            None,
            format!("the game ended after {decision} moves, the record has {moves}"),
        ));
    }
    let result = RecordedResult {
        winner: winner.map_or(-1, |w| w as i32),
        turns,
        capped: winner.is_none(),
        places: places.places().to_vec(),
    };
    if result != record.result {
        return Err(diverged(
            None,
            format!(
                "the result is {result:?}, the record has {:?}",
                record.result
            ),
        ));
    }
    if decision as u32 != record.decisions {
        return Err(diverged(
            None,
            format!("{decision} decisions, the record has {}", record.decisions),
        ));
    }
    Ok(moves)
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Tally {
    pub games: usize,
    pub moves: usize,
}

/// Replays every record in a file, stopping at the first divergence with a full report.
pub fn replay_file(path: &Path) -> Result<Tally, String> {
    let records = read_records(path)?;
    let mut tally = Tally::default();
    for (i, record) in records.iter().enumerate() {
        match replay(record) {
            Ok(moves) => {
                tally.games += 1;
                tally.moves += moves;
            }
            Err(d) => {
                let at = match d.decision {
                    Some(n) => format!("move {n}"),
                    None => "outside the moves".into(),
                };
                return Err(format!(
                    "{}: game {i} (seed \"{}\", {} players, bots {:?}) diverges at {at}: {}",
                    path.display(),
                    record.seed,
                    record.players,
                    record.bots,
                    d.what
                ));
            }
        }
    }
    Ok(tally)
}

//! `eval/gpu-record.ts`: game records, a game kept as its seed, its seating, its moves and the
//! canonical hashes of the active seat's options before every move and of the state after it, one
//! JSON object a line, gzipped when the name ends in `.gz`.

use crate::bots::bot;
use crate::canonical::{options_hash, state_hash};
use crate::cards::Card;
use crate::engine::{Move, Seat, Territory};
use crate::map::TERRITORY_COUNT;
use crate::runner::drive;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecordedResult {
    /// The winning seat, −1 when the turn cap ended the game.
    pub winner: i32,
    pub turns: u32,
    pub capped: bool,
    /// Each seat's finishing place, as the runner counts them.
    pub places: Vec<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordedGame {
    pub seed: String,
    pub players: usize,
    pub max_turns: u32,
    pub bots: Vec<String>,
    pub initial_hash: String,
    /// `[seat, kind, x, y, z, w]`.
    pub moves: Vec<[i64; 6]>,
    pub state_hashes: Vec<String>,
    pub options_hashes: Vec<String>,
    pub result: RecordedResult,
    pub decisions: u32,
}

fn territory(x: i64) -> Result<Territory, String> {
    if (0..TERRITORY_COUNT as i64).contains(&x) {
        Ok(x as Territory)
    } else {
        Err(format!("no territory at index {x}"))
    }
}

fn card(x: i64) -> Result<Card, String> {
    if (0..44).contains(&x) {
        Ok(x as Card)
    } else {
        Err(format!("no card at index {x}"))
    }
}

fn int(x: i64) -> Result<i32, String> {
    i32::try_from(x).map_err(|_| format!("{x} is not an int32"))
}

/// A move from its kind and four fields, as `decodeMove` reads them.
pub fn decode_move(fields: &[i64]) -> Result<Move, String> {
    let &[kind, x, y, z, w] = fields else {
        return Err(format!("a move is 5 fields, not {}", fields.len()));
    };
    Ok(match kind {
        0 => Move::Place {
            territory: territory(x)?,
            armies: int(y)?,
        },
        1 => Move::Trade {
            cards: [card(x)?, card(y)?, card(z)?],
            bonus: if w == -1 { None } else { Some(territory(w)?) },
        },
        2 => {
            if !(1..=3).contains(&z) {
                return Err(format!("an attack rolls 1 to 3 dice, not {z}"));
            }
            Move::Attack {
                from: territory(x)?,
                to: territory(y)?,
                dice: z as u8,
            }
        }
        3 => Move::Blitz {
            from: territory(x)?,
            to: territory(y)?,
            keep_at_least: int(z)?,
        },
        4 => Move::Occupy { armies: int(x)? },
        5 => Move::EndAttack,
        6 => Move::Fortify {
            from: territory(x)?,
            to: territory(y)?,
            armies: int(z)?,
        },
        7 => Move::EndTurn,
        _ => return Err(format!("no move kind {kind}")),
    })
}

/// A move as its kind and four fields, unused fields 0.
pub fn encode_move(mv: Move) -> [i64; 5] {
    match mv {
        Move::Place { territory, armies } => [0, territory as i64, armies as i64, 0, 0],
        Move::Trade { cards, bonus } => [
            1,
            cards[0] as i64,
            cards[1] as i64,
            cards[2] as i64,
            bonus.map_or(-1, |t| t as i64),
        ],
        Move::Attack { from, to, dice } => [2, from as i64, to as i64, dice as i64, 0],
        Move::Blitz {
            from,
            to,
            keep_at_least,
        } => [3, from as i64, to as i64, keep_at_least as i64, 0],
        Move::Occupy { armies } => [4, armies as i64, 0, 0, 0],
        Move::EndAttack => [5, 0, 0, 0, 0],
        Move::Fortify { from, to, armies } => [6, from as i64, to as i64, armies as i64, 0],
        Move::EndTurn => [7, 0, 0, 0, 0],
    }
}

/// The seat and move of a record's move.
pub fn recorded_move(fields: &[i64; 6]) -> Result<(Seat, Move), String> {
    let seat = u8::try_from(fields[0]).map_err(|_| format!("no seat {}", fields[0]))?;
    Ok((seat, decode_move(&fields[1..])?))
}

/// Every record in a file.
pub fn read_records(path: &Path) -> Result<Vec<RecordedGame>, String> {
    let file = File::open(path).map_err(|e| format!("can't open {}: {e}", path.display()))?;
    let reader: Box<dyn Read> = if path.extension().is_some_and(|e| e == "gz") {
        Box::new(GzDecoder::new(file))
    } else {
        Box::new(file)
    };
    let mut records = Vec::new();
    for (i, line) in BufReader::new(reader).lines().enumerate() {
        let line = line.map_err(|e| format!("{} line {}: {e}", path.display(), i + 1))?;
        if line.trim().is_empty() {
            continue;
        }
        let record = serde_json::from_str(&line)
            .map_err(|e| format!("{} line {}: {e}", path.display(), i + 1))?;
        records.push(record);
    }
    Ok(records)
}

/// Writes records one a line, gzipped when the name ends in `.gz`; returns the bytes written.
pub fn write_records(path: &Path, records: &[RecordedGame]) -> Result<u64, String> {
    let mut text = String::new();
    for record in records {
        text += &serde_json::to_string(record).map_err(|e| e.to_string())?;
        text.push('\n');
    }
    let bytes = if path.extension().is_some_and(|e| e == "gz") {
        let mut gz = GzEncoder::new(Vec::new(), flate2::Compression::default());
        gz.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        gz.finish().map_err(|e| e.to_string())?
    } else {
        text.into_bytes()
    };
    std::fs::write(path, &bytes).map_err(|e| format!("can't write {}: {e}", path.display()))?;
    Ok(bytes.len() as u64)
}

/// Plays a game on the runner, a native bot at each seat by label, and keeps it as a record, as
/// `recordGame` keeps a TypeScript one.
pub fn record_game(seed: &str, labels: &[String], max_turns: u32) -> Result<RecordedGame, String> {
    let bots = labels
        .iter()
        .map(|label| bot(label).ok_or_else(|| format!("no native bot \"{label}\"")))
        .collect::<Result<Vec<_>, _>>()?;
    let mut moves = Vec::new();
    let mut options_hashes = Vec::new();
    let mut state_hashes = Vec::new();
    let game = drive(
        seed,
        labels.len(),
        max_turns,
        |_, input| {
            let mv = bots[input.seat as usize].decide(input);
            let [kind, x, y, z, w] = encode_move(mv);
            options_hashes.push(options_hash(input.options));
            moves.push([input.seat as i64, kind, x, y, z, w]);
            Ok(mv)
        },
        |game| state_hashes.push(state_hash(game)),
    )?;
    Ok(RecordedGame {
        seed: seed.to_string(),
        players: labels.len(),
        max_turns,
        bots: labels.to_vec(),
        initial_hash: state_hash(&crate::engine::new_game(labels.len(), seed).0),
        moves,
        state_hashes,
        options_hashes,
        result: RecordedResult {
            winner: game.winner.map_or(-1, |w| w as i32),
            turns: game.turns,
            capped: game.winner.is_none(),
            places: game.places,
        },
        decisions: game.decisions,
    })
}

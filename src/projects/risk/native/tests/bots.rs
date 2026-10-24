//! The ported bots held to recorded TypeScript games decision for decision, so `cargo test` alone
//! guards greedy and GD's four personas (the binary's `decide` runs every fixture).

use risk_native::decide::{check_bots, check_file};
use risk_native::lockstep::replay;
use risk_native::record::{read_records, record_game, write_records};
use std::path::PathBuf;

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures/records")
        .join(name)
}

#[test]
fn greedy_and_the_gd_personas_play_every_recorded_move() {
    for name in ["greedy-3p.jsonl.gz", "mixed-5p.jsonl.gz"] {
        let tally = check_file(&fixture(name)).unwrap_or_else(|e| panic!("{e}"));
        assert!(
            tally.games >= 20 && tally.decisions > 10_000,
            "{name}: {tally:?}"
        );
    }
}

#[test]
fn a_move_the_bot_would_not_make_is_reported_where_it_was_changed() {
    let mut record = read_records(&fixture("mixed-5p.jsonl.gz"))
        .unwrap()
        .remove(0);
    let end_attack = record.moves.iter().position(|m| m[1] == 5).unwrap();
    let previous = record.moves[end_attack - 1];
    // A blitz the record never made, at the same seat: the bot's move differs first there.
    record.moves[end_attack] = [previous[0], 3, 0, 1, 1, 0];
    let error = check_bots(&record).unwrap_err();
    assert!(
        error.starts_with(&format!("decision {end_attack} ")),
        "{error}"
    );
}

#[test]
fn a_native_game_records_and_replays() {
    let labels: Vec<String> = ["gd-stacker", "greedy", "gd-continental", "gd-defensive"]
        .map(String::from)
        .to_vec();
    let record = record_game("native-bots-test", &labels, 600).unwrap();
    let path = std::env::temp_dir().join("risk-native-bots-test.jsonl.gz");
    write_records(&path, std::slice::from_ref(&record)).unwrap();
    let read = read_records(&path).unwrap();
    std::fs::remove_file(&path).unwrap();
    assert_eq!(read.len(), 1);
    assert_eq!(replay(&read[0]).unwrap(), record.moves.len());
    assert_eq!(check_bots(&read[0]).unwrap(), record.moves.len());
}

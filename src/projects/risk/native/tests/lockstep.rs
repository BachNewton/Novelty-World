//! Lockstep replay of recorded TypeScript games, so `cargo test` alone guards it (the binary's
//! `lockstep` runs every fixture), and the runner and `serve` around the engine.

use risk_native::bots;
use risk_native::lockstep::{replay, replay_file};
use risk_native::record::read_records;
use risk_native::runner::{play_game, run_spec, RiskGameSpec};
use risk_native::serve::play_batch;
use std::path::PathBuf;

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures/records")
        .join(name)
}

#[test]
fn replays_the_greedy_and_mixed_fixtures() {
    for name in ["greedy-3p.jsonl.gz", "mixed-5p.jsonl.gz"] {
        let tally = replay_file(&fixture(name)).unwrap_or_else(|e| panic!("{e}"));
        assert!(
            tally.games >= 20 && tally.moves > 10_000,
            "{name}: {tally:?}"
        );
    }
}

#[test]
fn a_tampered_record_diverges_where_it_was_changed() {
    let records = read_records(&fixture("mixed-5p.jsonl.gz")).unwrap();
    let record = &records[0];

    let mut hashes = record.clone();
    hashes.state_hashes[40] = "0000000000000000".into();
    assert_eq!(replay(&hashes).unwrap_err().decision, Some(40));

    let mut options = record.clone();
    options.options_hashes[7] = "0000000000000000".into();
    assert_eq!(replay(&options).unwrap_err().decision, Some(7));

    let mut initial = record.clone();
    initial.initial_hash = "0000000000000000".into();
    assert_eq!(replay(&initial).unwrap_err().decision, None);

    let mut result = record.clone();
    result.result.turns += 1;
    assert!(replay(&result).is_err());

    let mut moves = record.clone();
    let end_turn = moves.moves.iter().position(|m| m[1] == 7).unwrap();
    moves.moves[end_turn][1] = 5;
    assert_eq!(
        replay(&moves).unwrap_err().decision,
        Some(end_turn),
        "an end-attack in the fortify phase is refused"
    );
}

fn spec(index: u64, labels: &[&str]) -> RiskGameSpec {
    RiskGameSpec {
        index,
        seed: format!("serve-{index}"),
        labels: labels.iter().map(|s| s.to_string()).collect(),
        max_turns: 60,
    }
}

#[test]
fn a_game_is_a_function_of_its_seed_and_seating() {
    let random = bots::bot("random").unwrap();
    let seats = [random.as_ref(); 4];
    let a = play_game("runner", &seats, 80).unwrap();
    assert_eq!(a, play_game("runner", &seats, 80).unwrap());
    assert_eq!(a.places.len(), 4);
    if a.winner.is_none() {
        assert_eq!(a.turns, 80, "a capped game counts the cap");
    }
}

#[test]
fn serve_plays_a_batch_in_order_on_any_number_of_workers() {
    let specs: Vec<RiskGameSpec> = (0..12)
        .map(|i| spec(i, &["random", "random", "random"]))
        .collect();
    let one = play_batch(&specs, 1);
    let four = play_batch(&specs, 4);
    assert_eq!(one, four);
    assert_eq!(
        one.iter().map(|r| r.index).collect::<Vec<_>>(),
        (0..12).collect::<Vec<_>>()
    );
    assert!(one.iter().all(|r| r.error.is_none()));
}

#[test]
fn an_unknown_label_is_an_error_result() {
    let result = run_spec(&spec(3, &["random", "nobody", "random"]), bots::bot);
    assert!(result.error.unwrap().contains("nobody"));
    assert_eq!(
        (result.winner, result.turns, result.decisions),
        (None, 0, 0)
    );
}

#[test]
fn results_serialise_as_the_harness_reads_them() {
    let result = run_spec(&spec(5, &["random", "random", "random"]), bots::bot);
    let json = serde_json::to_value(&result).unwrap();
    let keys: Vec<&String> = json.as_object().unwrap().keys().collect();
    assert_eq!(
        keys,
        [
            "decisions",
            "index",
            "labels",
            "places",
            "seed",
            "turns",
            "winner"
        ]
    );
    let parsed: RiskGameSpec =
        serde_json::from_str(r#"{"index":1,"seed":"s","labels":["random"],"maxTurns":9}"#).unwrap();
    assert_eq!(parsed.max_turns, 9);
}

#[test]
fn serve_answers_each_line_of_specs_with_a_line_of_results() {
    let input = concat!(
        r#"{"id":7,"specs":[{"index":0,"seed":"a","labels":["random","random","random"],"maxTurns":20},{"index":1,"seed":"b","labels":["random","random","random","random"],"maxTurns":20}]}"#,
        "\n\n",
        r#"{"id":8,"specs":[{"index":2,"seed":"c","labels":["random","random","random"],"maxTurns":20}]}"#,
        "\n"
    );
    let mut output = Vec::new();
    risk_native::serve::serve(input.as_bytes(), &mut output, 2).unwrap();
    let lines: Vec<serde_json::Value> = String::from_utf8(output)
        .unwrap()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0]["id"], 7);
    assert_eq!(lines[1]["id"], 8);
    assert_eq!(lines[0]["results"].as_array().unwrap().len(), 2);
    assert_eq!(lines[1]["results"][0]["index"], 2);
    assert_eq!(lines[1]["results"][0]["seed"], "c");
}

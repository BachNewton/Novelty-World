//! The TypeScript harness's two ways into the crate, JSON lines over stdin and stdout
//! (`eval/native/`):
//!
//! - `serve` plays whole games. Each line in is a batch, `{"id": n, "specs": [RiskGameSpec...]}`;
//!   each line out is its results in the same order, `{"id": n, "results": [RiskGameResult...]}`,
//!   played on a pool of `workers` threads. The id lets several batches be in flight.
//! - `bots_serve` answers one seat's decisions at a table the TypeScript runner plays: a decision
//!   in, `{"id", "slot", "label", "seat", "view", "options", "latest", "history": {"from",
//!   "events"}, "humans", "seed"}`, its move out, `{"id", "move"}`. The history comes as it grows:
//!   a slot is one seat's game, kept here, and each decision sends only the events since the last
//!   (`from` is how many the slot already holds; 0 starts the slot afresh). `latest` is how many
//!   of the history's last events the latest write caused.

use crate::bot::{Bot, BotInput};
use crate::bots;
use crate::engine::{Event, Seat};
use crate::runner::{run_spec, RiskGameResult, RiskGameSpec};
use crate::wire::{EventJson, MoveJson, OptionsJson, ViewJson};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

#[derive(Deserialize)]
struct Batch {
    id: u64,
    specs: Vec<RiskGameSpec>,
}

#[derive(Serialize)]
struct Results {
    id: u64,
    results: Vec<RiskGameResult>,
}

/// Plays a batch on `workers` threads, each taking the next unplayed spec, so no worker waits on
/// another's slow game. Results come back in the specs' order.
pub fn play_batch(specs: &[RiskGameSpec], workers: usize) -> Vec<RiskGameResult> {
    let next = AtomicUsize::new(0);
    let results: Mutex<Vec<Option<RiskGameResult>>> = Mutex::new(vec![None; specs.len()]);
    std::thread::scope(|scope| {
        for _ in 0..workers.max(1).min(specs.len().max(1)) {
            scope.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                let Some(spec) = specs.get(i) else { break };
                let result = run_spec(spec, bots::bot);
                results
                    .lock()
                    .expect("no worker panics holding the results")[i] = Some(result);
            });
        }
    });
    results
        .into_inner()
        .expect("the workers are done")
        .into_iter()
        .map(|r| r.expect("every spec was played"))
        .collect()
}

pub fn serve(input: impl BufRead, mut output: impl Write, workers: usize) -> Result<(), String> {
    for line in input.lines() {
        let line = line.map_err(|e| format!("reading a batch: {e}"))?;
        if line.trim().is_empty() {
            continue;
        }
        let batch: Batch = serde_json::from_str(&line)
            .map_err(|e| format!("a batch isn't {{\"id\": n, \"specs\": [...]}}: {e}"))?;
        let results = Results {
            id: batch.id,
            results: play_batch(&batch.specs, workers),
        };
        write_line(&mut output, &results)?;
    }
    Ok(())
}

fn write_line(output: &mut impl Write, value: &impl Serialize) -> Result<(), String> {
    let text = serde_json::to_string(value).map_err(|e| e.to_string())?;
    writeln!(output, "{text}").map_err(|e| format!("writing an answer: {e}"))?;
    output
        .flush()
        .map_err(|e| format!("writing an answer: {e}"))
}

#[derive(Deserialize)]
struct History {
    from: usize,
    events: Vec<EventJson>,
}

#[derive(Deserialize)]
struct Decision {
    id: u64,
    slot: usize,
    label: String,
    seat: Seat,
    view: ViewJson,
    options: OptionsJson,
    latest: usize,
    history: History,
    humans: Vec<bool>,
    seed: String,
}

#[derive(Serialize)]
struct Answer {
    id: u64,
    #[serde(rename = "move")]
    mv: MoveJson,
}

/// One seat's game as `bots_serve` has heard it: its history so far and its last decision.
struct Session {
    history: Vec<Event>,
    decision: u64,
}

/// The decision's number, from its seed `"<bots seed>/<n>"`.
fn decision_number(seed: &str) -> Result<u64, String> {
    seed.rsplit_once('/')
        .and_then(|(_, n)| n.parse().ok())
        .ok_or_else(|| format!("a decision's seed is \"<bots seed>/<n>\", not \"{seed}\""))
}

/// Grows the slot's session by the decision's history, failing loudly on a history that doesn't
/// continue the one kept.
fn grow<'a>(sessions: &'a mut Vec<Option<Session>>, d: &Decision) -> Result<&'a Session, String> {
    let decision = decision_number(&d.seed)?;
    if sessions.len() <= d.slot {
        sessions.resize_with(d.slot + 1, || None);
    }
    let session = &mut sessions[d.slot];
    match session {
        Some(s) if d.history.from > 0 => {
            if d.history.from != s.history.len() || decision <= s.decision {
                return Err(format!(
                    "slot {}: history from {} at decision {decision}, but the slot holds {} events up to decision {}",
                    d.slot,
                    d.history.from,
                    s.history.len(),
                    s.decision
                ));
            }
            s.decision = decision;
        }
        _ if d.history.from > 0 => {
            return Err(format!(
                "slot {} is new, so its history starts from 0, not {}",
                d.slot, d.history.from
            ))
        }
        _ => {
            *session = Some(Session {
                history: Vec::new(),
                decision,
            })
        }
    }
    let s = session.as_mut().expect("set above");
    for e in &d.history.events {
        s.history.push(e.to_event()?);
    }
    if d.latest > s.history.len() {
        return Err(format!(
            "the latest {} events of a history of {}",
            d.latest,
            s.history.len()
        ));
    }
    Ok(s)
}

pub fn bots_serve(input: impl BufRead, mut output: impl Write) -> Result<(), String> {
    let mut sessions: Vec<Option<Session>> = Vec::new();
    let mut seated: HashMap<String, Box<dyn Bot>> = HashMap::new();
    for line in input.lines() {
        let line = line.map_err(|e| format!("reading a decision: {e}"))?;
        if line.trim().is_empty() {
            continue;
        }
        let d: Decision =
            serde_json::from_str(&line).map_err(|e| format!("a decision doesn't read: {e}"))?;
        if !seated.contains_key(&d.label) {
            let bot =
                bots::bot(&d.label).ok_or_else(|| format!("no native bot \"{}\"", d.label))?;
            seated.insert(d.label.clone(), bot);
        }
        let view = d.view.to_view()?;
        if d.seat as usize >= view.seats.len() {
            return Err(format!(
                "no seat {} at a table of {}",
                d.seat,
                view.seats.len()
            ));
        }
        let options = d.options.to_options(view.owned[d.seat as usize])?;
        let session = grow(&mut sessions, &d)?;
        let history = session.history.as_slice();
        let input = BotInput {
            seat: d.seat,
            view: &view,
            options: &options,
            events: &history[history.len() - d.latest..],
            history,
            humans: &d.humans,
            seed: &d.seed,
        };
        let mv = seated[&d.label].decide(&input);
        write_line(
            &mut output,
            &Answer {
                id: d.id,
                mv: MoveJson::from_move(mv),
            },
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::drive;
    use crate::wire::EventJson;
    use serde_json::json;

    /// The decision lines the TypeScript adapter would send for a whole native game, one slot a
    /// seat, each history sent as it grew, and the moves the bots made.
    fn game_lines(seed: &str, labels: &[&str]) -> (Vec<String>, Vec<MoveJson>) {
        let bots: Vec<_> = labels.iter().map(|l| bots::bot(l).unwrap()).collect();
        let mut sent = vec![0usize; labels.len()];
        let mut lines = Vec::new();
        let mut moves = Vec::new();
        drive(
            seed,
            labels.len(),
            600,
            |decision, input| {
                let seat = input.seat as usize;
                let events: Vec<_> = input.history[sent[seat]..]
                    .iter()
                    .map(EventJson::from_event)
                    .collect();
                lines.push(
                    json!({
                        "id": decision,
                        "slot": seat,
                        "label": labels[seat],
                        "seat": seat,
                        "view": ViewJson::from_view(input.view),
                        "options": OptionsJson::from_options(input.options),
                        "latest": input.events.len(),
                        "history": { "from": sent[seat], "events": events },
                        "humans": input.humans,
                        "seed": input.seed,
                    })
                    .to_string(),
                );
                sent[seat] = input.history.len();
                let mv = bots[seat].decide(input);
                moves.push(MoveJson::from_move(mv));
                Ok(mv)
            },
            |_| {},
        )
        .unwrap();
        (lines, moves)
    }

    #[test]
    fn bots_serve_answers_every_decision_of_a_game_as_the_bots_decide_it() {
        let (lines, moves) = game_lines("bots-serve-1", &["gd-stacker", "greedy", "gd-aggressive"]);
        let mut output = Vec::new();
        bots_serve(
            (lines.join(
                "
",
            ) + "
")
            .as_bytes(),
            &mut output,
        )
        .unwrap();
        let answers: Vec<serde_json::Value> = String::from_utf8(output)
            .unwrap()
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        assert_eq!(answers.len(), moves.len());
        for (i, (answer, mv)) in answers.iter().zip(&moves).enumerate() {
            assert_eq!(answer["id"], i as u64);
            assert_eq!(
                answer["move"],
                serde_json::to_value(mv).unwrap(),
                "decision {i}"
            );
        }
    }

    #[test]
    fn a_history_that_does_not_continue_the_slot_fails_loudly() {
        let (mut lines, _) = game_lines("bots-serve-2", &["greedy", "greedy", "greedy"]);
        // Seat 0's second decision, sent as if the slot already held one event more.
        let second = lines
            .iter()
            .enumerate()
            .filter(|(_, l)| l.contains("\"slot\":0"))
            .nth(1)
            .unwrap()
            .0;
        let mut line: serde_json::Value = serde_json::from_str(&lines[second]).unwrap();
        line["history"]["from"] = json!(line["history"]["from"].as_u64().unwrap() + 1);
        lines[second] = line.to_string();
        let error = bots_serve(
            lines[..=second]
                .join(
                    "
",
                )
                .as_bytes(),
            Vec::new(),
        )
        .unwrap_err();
        assert!(error.starts_with("slot 0: history from"), "{error}");
    }
}

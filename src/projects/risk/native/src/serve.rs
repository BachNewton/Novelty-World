//! `serve`: plays whole games for the TypeScript harness over stdin and stdout, JSON lines. Each
//! line in is a batch, `{"specs": [RiskGameSpec...]}`; each line out is its results in the same
//! order, `{"results": [RiskGameResult...]}`, played on a pool of `workers` threads.

use crate::bots;
use crate::runner::{run_spec, RiskGameResult, RiskGameSpec};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

#[derive(Deserialize)]
struct Batch {
    specs: Vec<RiskGameSpec>,
}

#[derive(Serialize)]
struct Results {
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
            .map_err(|e| format!("a batch isn't {{\"specs\": [...]}}: {e}"))?;
        let results = Results {
            results: play_batch(&batch.specs, workers),
        };
        let text = serde_json::to_string(&results).map_err(|e| e.to_string())?;
        writeln!(output, "{text}").map_err(|e| format!("writing results: {e}"))?;
        output
            .flush()
            .map_err(|e| format!("writing results: {e}"))?;
    }
    Ok(())
}

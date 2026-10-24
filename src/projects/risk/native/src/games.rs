//! `risk-native games`: a quick native measuring run for developing native bots. Tables play wholly
//! in the crate on a thread pool. With `--rotate` the first bot sits alone among copies of the
//! second, rotated through every seat on each seed (`eval/parallel.ts`'s `tableSpecs`); otherwise
//! the bots are the seating. It prints the lone seat's win share with its standard error, game
//! length, the cap rate, and each label's time per decision and per turn.

use risk_native::bots;
use risk_native::runner::drive;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

struct Spec {
    seed: String,
    labels: Vec<String>,
}

#[derive(Default)]
struct Timing {
    decisions: u64,
    turns: u64,
    nanos: u128,
}

#[derive(Default)]
struct Tally {
    lone_wins: u32,
    decisive: u32,
    capped: u32,
    errors: Vec<String>,
    turns: u64,
    by_label: BTreeMap<String, Timing>,
}

pub fn games(args: &[String]) -> Result<(), String> {
    let mut labels: Option<Vec<String>> = None;
    let mut players: Option<usize> = None;
    let mut prefix: Option<String> = None;
    let mut count: Option<usize> = None;
    let mut max_turns = 600;
    let mut rotate = false;
    let mut workers = std::thread::available_parallelism()
        .map_or(1, |n| n.get() / 2)
        .max(1);
    let mut i = 0;
    while i < args.len() {
        let flag = args[i].as_str();
        if flag == "--rotate" {
            rotate = true;
            i += 1;
            continue;
        }
        let value = args
            .get(i + 1)
            .ok_or_else(|| format!("{flag} has no value"))?;
        let number = || {
            value
                .parse::<usize>()
                .map_err(|_| format!("{flag} takes a number, not \"{value}\""))
        };
        match flag {
            "--bots" => labels = Some(value.split(',').map(String::from).collect()),
            "--players" => players = Some(number()?),
            "--seeds" => prefix = Some(value.clone()),
            "--count" => count = Some(number()?),
            "--turns" => max_turns = number()? as u32,
            "--workers" => workers = number()?.max(1),
            _ => return Err(format!("unknown argument \"{flag}\"")),
        }
        i += 2;
    }
    let (Some(labels), Some(prefix), Some(count)) = (labels, prefix, count) else {
        return Err("name --bots, --seeds and --count".into());
    };
    for label in &labels {
        bots::bot(label).ok_or_else(|| format!("no native bot \"{label}\""))?;
    }
    let specs: Vec<Spec> = if rotate {
        let [lone, rest] = labels.as_slice() else {
            return Err("--rotate seats two bots: the lone one, then the rest".into());
        };
        let p = players.ok_or("--rotate needs --players")?;
        (0..count)
            .map(|k| Spec {
                seed: format!("{prefix}-{}", k / p + 1),
                labels: (0..p)
                    .map(|seat| if seat == k % p { lone } else { rest }.clone())
                    .collect(),
            })
            .collect()
    } else {
        if players.is_some_and(|p| p != labels.len()) {
            return Err("without --rotate the bots are the seating".into());
        }
        (1..=count)
            .map(|n| Spec {
                seed: format!("{prefix}-{n}"),
                labels: labels.clone(),
            })
            .collect()
    };

    let started = Instant::now();
    let next = AtomicUsize::new(0);
    let tally = Mutex::new(Tally::default());
    std::thread::scope(|scope| {
        for _ in 0..workers.min(specs.len()) {
            scope.spawn(|| loop {
                let k = next.fetch_add(1, Ordering::Relaxed);
                let Some(spec) = specs.get(k) else { break };
                play(spec, max_turns, &labels[0], &tally);
            });
        }
    });
    let t = tally
        .into_inner()
        .expect("no worker panics holding the tally");
    let players = specs[0].labels.len();
    let lone_seats = specs[0].labels.iter().filter(|l| **l == labels[0]).count();
    let par = lone_seats as f64 / players as f64;
    let n = t.decisive as f64;
    let share = t.lone_wins as f64 / n;
    let se = (share * (1.0 - share) / n).sqrt();
    let elo = if lone_seats == 1 && share > 0.0 && share < 1.0 {
        let gamma = share * (players - 1) as f64 / (1.0 - share);
        format!("{:+.0}", 400.0 * gamma.log10())
    } else {
        "n/a".into()
    };
    println!(
        "{}: {} games at {players}p, {} decisive, {} capped ({:.1}%), {} errors, mean {:.1} turns, {:.1} s",
        labels.join(","),
        specs.len(),
        t.decisive,
        t.capped,
        100.0 * t.capped as f64 / specs.len() as f64,
        t.errors.len(),
        t.turns as f64 / specs.len() as f64,
        started.elapsed().as_secs_f64(),
    );
    println!(
        "  {} wins {}/{} = {:.1}% ± {:.1} (par {:.1}%), win Elo a seat {elo}",
        labels[0],
        t.lone_wins,
        t.decisive,
        100.0 * share,
        100.0 * se,
        100.0 * par,
    );
    for (label, timing) in &t.by_label {
        println!(
            "  {label}: {:.1} us a decision, {:.2} ms a turn ({} decisions, {} turns)",
            timing.nanos as f64 / timing.decisions.max(1) as f64 / 1e3,
            timing.nanos as f64 / timing.turns.max(1) as f64 / 1e6,
            timing.decisions,
            timing.turns,
        );
    }
    for e in t.errors.iter().take(5) {
        println!("  ERROR {e}");
    }
    if t.errors.is_empty() {
        Ok(())
    } else {
        Err(format!("{} games failed", t.errors.len()))
    }
}

fn play(spec: &Spec, max_turns: u32, lone: &str, tally: &Mutex<Tally>) {
    let seated: Vec<_> = spec
        .labels
        .iter()
        .map(|l| bots::bot(l).expect("labels were checked"))
        .collect();
    let mut timing: Vec<Timing> = spec.labels.iter().map(|_| Timing::default()).collect();
    let mut last_turn = vec![0u32; spec.labels.len()];
    let result = drive(
        &spec.seed,
        spec.labels.len(),
        max_turns,
        |_, input| {
            let seat = input.seat as usize;
            if input.view.turn != last_turn[seat] {
                last_turn[seat] = input.view.turn;
                timing[seat].turns += 1;
            }
            let t = Instant::now();
            let mv = seated[seat].decide(input);
            timing[seat].nanos += t.elapsed().as_nanos();
            timing[seat].decisions += 1;
            Ok(mv)
        },
        |_| {},
    );
    let mut tally = tally.lock().expect("no worker panics holding the tally");
    match result {
        Err(e) => tally.errors.push(format!("{}: {e}", spec.seed)),
        Ok(record) => {
            tally.turns += record.turns as u64;
            match record.winner {
                None => tally.capped += 1,
                Some(w) => {
                    tally.decisive += 1;
                    if spec.labels[w as usize] == lone {
                        tally.lone_wins += 1;
                    }
                }
            }
            for (label, t) in spec.labels.iter().zip(timing) {
                let entry = tally.by_label.entry(label.clone()).or_default();
                entry.decisions += t.decisions;
                entry.turns += t.turns;
                entry.nanos += t.nanos;
            }
        }
    }
}

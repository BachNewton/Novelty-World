//! `risk-native sweep` and `sweep-report`: a map of native-v1's rule-v6.1 settings
//! (`ideas/rule-bot-v6.1.md`, "The native map"). Every point is a set of settings, played wholly in
//! the crate at each table size against native-v1 itself in three seatings: one-in (the candidate
//! alone among native-v1s), one-out (native-v1 alone among candidates), each a seed group with the
//! lone seat rotated through every seat as the gauntlet seats them, and the mirror (the candidate
//! in every seat), for its stall rate. Every point plays the same seeds, so points are compared on
//! the same deals. A game is a pure function of its seed and seating, so a run is deterministic
//! whatever the worker count, and seed ranges played in separate runs add up. `--in-seeds` and
//! `--out-seeds` name the mixtures' seeds instead, so a TypeScript gauntlet's own tables can be replayed.
//!
//! `sweep` writes one JSON line per point, table and seating as each finishes; `sweep-report`
//! sums any number of those files by point and prints, per table, the mirror's cap rate and
//! decided games' length, each mixture's win share against its par with a 95% interval, and a win
//! Elo a seat (the Luce model, one-in and one-out pooled by their variances), and the point's Elo
//! over every table.

use risk_native::bots;
use risk_native::runner::drive;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

#[derive(Deserialize)]
struct Point {
    id: String,
    /// rule-v6.1's settings by its names, as `native-v1~` takes them.
    knobs: serde_json::Value,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
enum Seating {
    In,
    Out,
    Mirror,
}

#[derive(Serialize, Deserialize, Default, Clone)]
struct Tally {
    games: u32,
    decisive: u32,
    /// Decisive games a candidate seat won (a mirror's are all the candidate's).
    cand_wins: u32,
    capped: u32,
    /// Turns of the decisive games.
    decided_turns: u64,
    errors: u32,
}

#[derive(Serialize, Deserialize)]
struct Line {
    id: String,
    label: String,
    base: String,
    players: usize,
    seating: Seating,
    /// The seed numbers played, `from` to `to` inclusive: seed groups for one-in and one-out,
    /// games for the mirror.
    from: usize,
    to: usize,
    #[serde(flatten)]
    tally: Tally,
}

struct Task {
    point: usize,
    players: usize,
    seating: Seating,
    from: usize,
    to: usize,
    games: Vec<(String, Vec<bool>)>,
    tally: Mutex<(Tally, usize)>,
}

fn range(value: &str, flag: &str) -> Result<(usize, usize), String> {
    let bad = || format!("{flag} takes a range like 1-200, not \"{value}\"");
    let (a, b) = value.split_once('-').ok_or_else(bad)?;
    let (a, b) = (a.parse().map_err(|_| bad())?, b.parse().map_err(|_| bad())?);
    if a == 0 || b < a {
        return Err(bad());
    }
    Ok((a, b))
}

pub fn sweep(args: &[String]) -> Result<(), String> {
    let mut points_file = None;
    let mut out = None;
    let mut players = vec![5usize, 6];
    let mut groups: Option<(usize, usize)> = None;
    let mut mirror: Option<(usize, usize)> = None;
    let mut prefix = "sweep".to_string();
    let mut base = "native-v1".to_string();
    let mut in_seeds: Option<String> = None;
    let mut out_seeds: Option<String> = None;
    let mut max_turns = 600u32;
    let mut workers = std::thread::available_parallelism().map_or(1, |n| n.get());
    for pair in args.chunks(2) {
        let [flag, value] = pair else {
            return Err(format!("{} has no value", pair[0]));
        };
        match flag.as_str() {
            "--points" => points_file = Some(value.clone()),
            "--out" => out = Some(value.clone()),
            "--players" => {
                players = value
                    .split(',')
                    .map(|p| p.parse().map_err(|_| format!("--players: \"{p}\"")))
                    .collect::<Result<_, _>>()?
            }
            "--groups" => groups = Some(range(value, flag)?),
            "--mirror" => mirror = Some(range(value, flag)?),
            "--prefix" => prefix = value.clone(),
            "--base" => base = value.clone(),
            "--in-seeds" => in_seeds = Some(value.clone()),
            "--out-seeds" => out_seeds = Some(value.clone()),
            "--turns" => max_turns = value.parse().map_err(|_| format!("--turns: \"{value}\""))?,
            "--workers" => {
                workers = value
                    .parse::<usize>()
                    .map_err(|_| format!("--workers: \"{value}\""))?
                    .max(1)
            }
            _ => return Err(format!("unknown argument \"{flag}\"")),
        }
    }
    let (Some(points_file), Some(out)) = (points_file, out) else {
        return Err("name --points <file.jsonl> and --out <results.jsonl>".into());
    };
    let text = std::fs::read_to_string(&points_file).map_err(|e| format!("{points_file}: {e}"))?;
    let points: Vec<Point> = text
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str(l).map_err(|e| format!("{points_file}: {e}: {l}")))
        .collect::<Result<_, _>>()?;
    let labels: Vec<String> = points
        .iter()
        .map(|p| format!("native-v1~{}", p.knobs))
        .collect();
    bots::bot(&base).ok_or_else(|| format!("no native bot \"{base}\""))?;
    for l in &labels {
        bots::bot(l).ok_or_else(|| format!("no native bot \"{l}\""))?;
    }

    let mut tasks = Vec::new();
    for point in 0..points.len() {
        for &p in &players {
            let mut add = |seating: Seating, (from, to): (usize, usize)| {
                let mut games = Vec::new();
                for n in from..=to {
                    match seating {
                        Seating::Mirror => {
                            games.push((format!("{prefix}-mirror-{p}p-{n}"), vec![true; p]))
                        }
                        Seating::In | Seating::Out => {
                            let named = match seating {
                                Seating::In => &in_seeds,
                                _ => &out_seeds,
                            };
                            let seed = match named {
                                Some(prefix) => format!("{prefix}-{n}"),
                                None => format!("{prefix}-{p}p-{n}"),
                            };
                            for lone in 0..p {
                                let cand = (0..p)
                                    .map(|s| (s == lone) == (seating == Seating::In))
                                    .collect();
                                games.push((seed.clone(), cand));
                            }
                        }
                    }
                }
                let count = games.len();
                tasks.push(Task {
                    point,
                    players: p,
                    seating,
                    from,
                    to,
                    games,
                    tally: Mutex::new((Tally::default(), count)),
                });
            };
            if let Some(m) = mirror {
                add(Seating::Mirror, m);
            }
            if let Some(g) = groups {
                add(Seating::In, g);
                add(Seating::Out, g);
            }
        }
    }
    let jobs: Vec<(usize, usize)> = tasks
        .iter()
        .enumerate()
        .flat_map(|(t, task)| (0..task.games.len()).map(move |g| (t, g)))
        .collect();
    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&out)
        .map_err(|e| format!("{out}: {e}"))?;
    let writer = Mutex::new(file);
    let started = Instant::now();
    let next = AtomicUsize::new(0);
    let finished = AtomicUsize::new(0);
    eprintln!(
        "{} points, {} tables, {} games on {workers} workers",
        points.len(),
        tasks.len(),
        jobs.len()
    );
    std::thread::scope(|scope| {
        for _ in 0..workers.min(jobs.len()) {
            scope.spawn(|| loop {
                let k = next.fetch_add(1, Ordering::Relaxed);
                let Some(&(t, g)) = jobs.get(k) else { break };
                let task = &tasks[t];
                let (seed, cand) = &task.games[g];
                let cand_bot = bots::bot(&labels[task.point]).expect("labels were checked");
                let base_bot = bots::bot(&base).expect("labels were checked");
                let result = drive(
                    seed,
                    cand.len(),
                    max_turns,
                    |_, input| {
                        let seat = input.seat as usize;
                        Ok(if cand[seat] { &cand_bot } else { &base_bot }.decide(input))
                    },
                    |_| {},
                );
                let mut guard = task.tally.lock().expect("no worker panics holding a tally");
                let (tally, left) = &mut *guard;
                tally.games += 1;
                match result {
                    Err(e) => {
                        tally.errors += 1;
                        eprintln!("ERROR {seed} {}: {e}", labels[task.point]);
                    }
                    Ok(r) => match r.winner {
                        None => tally.capped += 1,
                        Some(w) => {
                            tally.decisive += 1;
                            tally.decided_turns += r.turns as u64;
                            tally.cand_wins += u32::from(cand[w as usize]);
                        }
                    },
                }
                *left -= 1;
                if *left == 0 {
                    let line = Line {
                        id: points[task.point].id.clone(),
                        label: labels[task.point].clone(),
                        base: base.clone(),
                        players: task.players,
                        seating: task.seating,
                        from: task.from,
                        to: task.to,
                        tally: tally.clone(),
                    };
                    let json = serde_json::to_string(&line).expect("a line serialises");
                    let mut w = writer.lock().expect("no worker panics holding the file");
                    writeln!(w, "{json}")
                        .and_then(|_| w.flush())
                        .expect("results are written");
                    let done = finished.fetch_add(1, Ordering::Relaxed) + 1;
                    eprintln!(
                        "[{done}/{}] {:.0} s  {} {}p {:?}: {} games, {} capped",
                        tasks.len(),
                        started.elapsed().as_secs_f64(),
                        line.id,
                        line.players,
                        line.seating,
                        line.tally.games,
                        line.tally.capped
                    );
                }
            });
        }
    });
    let errors: u32 = tasks
        .iter()
        .map(|t| t.tally.lock().expect("workers are done").0.errors)
        .sum();
    if errors > 0 {
        return Err(format!("{errors} games failed"));
    }
    Ok(())
}

/// Wilson's 95% interval for `k` of `n`.
fn wilson(k: f64, n: f64) -> (f64, f64) {
    if n == 0.0 {
        return (0.0, 1.0);
    }
    let z = 1.96f64;
    let p = k / n;
    let d = 1.0 + z * z / n;
    let c = (p + z * z / (2.0 * n)) / d;
    let h = z * (p * (1.0 - p) / n + z * z / (4.0 * n * n)).sqrt() / d;
    (c - h, c + h)
}

/// A seat's log-strength (natural log of the Luce γ) and its variance from one mixture: the
/// candidate's win share `s` of `n` decisive games with `k` of `p` seats. Shares at 0 or 1 are
/// moved half a game in, so every table gives a finite estimate.
fn log_gamma(wins: f64, n: f64, k: usize, p: usize) -> Option<(f64, f64)> {
    if n == 0.0 {
        return None;
    }
    let s = ((wins + 0.5) / (n + 1.0)).clamp(1e-9, 1.0 - 1e-9);
    // One candidate among p − 1 bases: s = γ / (γ + p − 1). One base among p − 1 candidates:
    // the base's share 1 − s = 1 / (1 + (p − 1) γ).
    let lg = if k == 1 {
        (s / (1.0 - s) * (p - 1) as f64).ln()
    } else {
        (s / ((1.0 - s) * (p - 1) as f64)).ln()
    };
    Some((lg, 1.0 / (n * s * (1.0 - s))))
}

fn pooled(estimates: &[(f64, f64)]) -> Option<(f64, f64)> {
    if estimates.is_empty() {
        return None;
    }
    let w: f64 = estimates.iter().map(|e| 1.0 / e.1).sum();
    let m = estimates.iter().map(|e| e.0 / e.1).sum::<f64>() / w;
    Some((m, 1.0 / w))
}

fn elo(lg: (f64, f64)) -> (f64, f64) {
    let scale = 400.0 / std::f64::consts::LN_10;
    (lg.0 * scale, lg.1.sqrt() * scale)
}

#[derive(Serialize)]
struct Row {
    id: String,
    label: String,
    players: usize,
    mirror_games: u32,
    mirror_capped: u32,
    mirror_capped_upper: f64,
    mirror_decided_turns: f64,
    in_games: u32,
    in_share: f64,
    in_low: f64,
    in_high: f64,
    out_games: u32,
    out_share: f64,
    out_low: f64,
    out_high: f64,
    capped_mixed: f64,
    elo: Option<f64>,
    elo_se: Option<f64>,
}

#[derive(Serialize)]
struct Summary {
    id: String,
    label: String,
    elo: Option<f64>,
    elo_se: Option<f64>,
    tables: Vec<Row>,
}

pub fn report(args: &[String]) -> Result<(), String> {
    let mut json_out = None;
    let mut files = Vec::new();
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--json" {
            json_out = Some(args.get(i + 1).ok_or("--json has no value")?.clone());
            i += 2;
        } else {
            files.push(args[i].clone());
            i += 1;
        }
    }
    let mut sums: BTreeMap<(String, String, usize, Seating), Tally> = BTreeMap::new();
    let mut order: Vec<String> = Vec::new();
    for f in &files {
        let file = std::fs::File::open(f).map_err(|e| format!("{f}: {e}"))?;
        for line in std::io::BufReader::new(file).lines() {
            let line = line.map_err(|e| format!("{f}: {e}"))?;
            if line.trim().is_empty() {
                continue;
            }
            let l: Line = serde_json::from_str(&line).map_err(|e| format!("{f}: {e}"))?;
            if !order.contains(&l.id) {
                order.push(l.id.clone());
            }
            let t = sums
                .entry((l.id.clone(), l.label.clone(), l.players, l.seating))
                .or_default();
            t.games += l.tally.games;
            t.decisive += l.tally.decisive;
            t.cand_wins += l.tally.cand_wins;
            t.capped += l.tally.capped;
            t.decided_turns += l.tally.decided_turns;
            t.errors += l.tally.errors;
        }
    }
    let mut summaries = Vec::new();
    for id in &order {
        let keys: Vec<_> = sums.keys().filter(|k| &k.0 == id).cloned().collect();
        let label = keys[0].1.clone();
        let mut tables: Vec<usize> = keys.iter().map(|k| k.2).collect();
        tables.dedup();
        let empty = Tally::default();
        let mut rows = Vec::new();
        let mut all = Vec::new();
        for p in tables {
            let get = |s: Seating| {
                sums.get(&(id.clone(), label.clone(), p, s))
                    .unwrap_or(&empty)
            };
            let (m, a, b) = (get(Seating::Mirror), get(Seating::In), get(Seating::Out));
            let mut est = Vec::new();
            est.extend(log_gamma(a.cand_wins as f64, a.decisive as f64, 1, p));
            est.extend(log_gamma(b.cand_wins as f64, b.decisive as f64, p - 1, p));
            let pe = pooled(&est);
            all.extend(est);
            let share = |t: &Tally| t.cand_wins as f64 / (t.decisive.max(1)) as f64;
            let (il, ih) = wilson(a.cand_wins as f64, a.decisive as f64);
            let (ol, oh) = wilson(b.cand_wins as f64, b.decisive as f64);
            rows.push(Row {
                id: id.clone(),
                label: label.clone(),
                players: p,
                mirror_games: m.games,
                mirror_capped: m.capped,
                mirror_capped_upper: wilson(m.capped as f64, m.games as f64).1,
                mirror_decided_turns: m.decided_turns as f64 / m.decisive.max(1) as f64,
                in_games: a.games,
                in_share: share(a),
                in_low: il,
                in_high: ih,
                out_games: b.games,
                out_share: share(b),
                out_low: ol,
                out_high: oh,
                capped_mixed: (a.capped + b.capped) as f64 / (a.games + b.games).max(1) as f64,
                elo: pe.map(|e| elo(e).0),
                elo_se: pe.map(|e| elo(e).1),
            });
        }
        let pe = pooled(&all);
        summaries.push(Summary {
            id: id.clone(),
            label,
            elo: pe.map(|e| elo(e).0),
            elo_se: pe.map(|e| elo(e).1),
            tables: rows,
        });
    }
    let fmt = |x: Option<f64>, se: Option<f64>| match (x, se) {
        (Some(x), Some(se)) => format!("{x:+6.1} ±{:4.1}", 1.96 * se),
        _ => "     n/a    ".into(),
    };
    for s in &summaries {
        println!("{}  Elo {}  {}", s.id, fmt(s.elo, s.elo_se), s.label);
        for r in &s.tables {
            println!(
                "  {}p  mirror {:>3}/{:<4} capped (≤{:4.1}%) decided {:5.1} turns | in {:4.1}% [{:4.1},{:4.1}] par {:4.1} n={:<5} | out {:4.1}% [{:4.1},{:4.1}] par {:4.1} n={:<5} | mixed capped {:4.1}% | Elo {}",
                r.players,
                r.mirror_capped,
                r.mirror_games,
                100.0 * r.mirror_capped_upper,
                r.mirror_decided_turns,
                100.0 * r.in_share,
                100.0 * r.in_low,
                100.0 * r.in_high,
                100.0 / r.players as f64,
                r.in_games,
                100.0 * r.out_share,
                100.0 * r.out_low,
                100.0 * r.out_high,
                100.0 * (r.players - 1) as f64 / r.players as f64,
                r.out_games,
                100.0 * r.capped_mixed,
                fmt(r.elo, r.elo_se),
            );
        }
    }
    if let Some(path) = json_out {
        let json = serde_json::to_string_pretty(&summaries).map_err(|e| e.to_string())?;
        std::fs::write(&path, json).map_err(|e| format!("{path}: {e}"))?;
    }
    Ok(())
}

//! `risk-native games`: a quick native measuring run for developing native bots. Tables play wholly
//! in the crate on a thread pool. With `--rotate` the first bot sits alone among copies of the
//! second, rotated through every seat on each seed (`eval/parallel.ts`'s `tableSpecs`); otherwise
//! the bots are the seating. It prints the lone seat's win share with its standard error, game
//! length, the cap rate, and each label's time per decision and per turn.
//!
//! A run can be split over machines (`docs/actions.md`): `--shard i/N --out <file>` plays every N-th
//! seed group from the i-th and writes each game's result, and `--games-from <dir>` reads every
//! shard's file and prints the report the whole run gives, reading the games in the run's order.

use risk_native::bots;
use risk_native::runner::drive;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

#[derive(Clone, Debug, PartialEq)]
struct Spec {
    seed: String,
    labels: Vec<String>,
}

/// One seat's time in one game, or one label's over a run.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
struct Timing {
    decisions: u64,
    turns: u64,
    nanos: u64,
    /// Each turn's time, for its spread: a bot's bar is a share of turns under a time.
    per_turn: Vec<u64>,
}

/// One game's result, as a shard writes it: its place in the run, its spec (so a merge can tell
/// a shard of other arguments), and its outcome or error.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
struct Played {
    game: usize,
    seed: String,
    labels: Vec<String>,
    outcome: Result<Outcome, String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
struct Outcome {
    winner: Option<u8>,
    turns: u32,
    seats: Vec<Timing>,
}

/// One machine's share of a run.
#[derive(Serialize, Deserialize)]
struct ShardFile {
    shard: usize,
    shards: usize,
    seconds: f64,
    games: Vec<Played>,
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

struct Args {
    labels: Vec<String>,
    specs: Vec<Spec>,
    /// The seats at a seed: the games sharing one seed are a group, kept whole on one shard.
    group: usize,
    max_turns: u32,
    workers: usize,
    shard: Option<(usize, usize)>,
    out: Option<String>,
    games_from: Option<String>,
}

pub fn games(args: &[String]) -> Result<(), String> {
    let args = parse(args)?;
    if let Some(dir) = &args.games_from {
        let (played, seconds) = merged(Path::new(dir), &args.specs)?;
        return report(&args.labels, &args.specs, &played, seconds);
    }
    let (shard, shards) = args.shard.unwrap_or((0, 1));
    let picked: Vec<usize> = (0..args.specs.len())
        .filter(|k| k / args.group % shards == shard)
        .collect();
    let started = Instant::now();
    let played = play_all(&args.specs, &picked, args.max_turns, args.workers);
    let seconds = started.elapsed().as_secs_f64();
    match &args.out {
        None => report(&args.labels, &args.specs, &played, seconds),
        Some(out) => {
            let file = ShardFile {
                shard,
                shards,
                seconds,
                games: played,
            };
            let json = serde_json::to_vec(&file).map_err(|e| e.to_string())?;
            std::fs::write(out, json).map_err(|e| format!("{out}: {e}"))?;
            println!(
                "{out}: shard {shard}/{shards}, {} of {} games, {seconds:.1} s",
                file.games.len(),
                args.specs.len()
            );
            Ok(())
        }
    }
}

fn parse(args: &[String]) -> Result<Args, String> {
    let mut labels: Option<Vec<String>> = None;
    let mut players: Option<usize> = None;
    let mut prefix: Option<String> = None;
    let mut count: Option<usize> = None;
    let mut max_turns = 600;
    let mut rotate = false;
    let mut workers = std::thread::available_parallelism()
        .map_or(1, |n| n.get() / 2)
        .max(1);
    let mut shard = None;
    let mut out = None;
    let mut games_from = None;
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
            "--bots" => labels = Some(crate::labels(value)),
            "--players" => players = Some(number()?),
            "--seeds" => prefix = Some(value.clone()),
            "--count" => count = Some(number()?),
            "--turns" => max_turns = number()? as u32,
            "--workers" => workers = number()?.max(1),
            "--shard" => shard = Some(parse_shard(value)?),
            "--out" => out = Some(value.clone()),
            "--games-from" => games_from = Some(value.clone()),
            _ => return Err(format!("unknown argument \"{flag}\"")),
        }
        i += 2;
    }
    let (Some(labels), Some(prefix), Some(count)) = (labels, prefix, count) else {
        return Err("name --bots, --seeds and --count".into());
    };
    if shard.is_some() != out.is_some() {
        return Err("--shard and --out go together: a shard writes its games".into());
    }
    if games_from.is_some() && out.is_some() {
        return Err("--games-from reports games already played: it plays none to --out".into());
    }
    if count == 0 {
        return Err("--count is at least 1".into());
    }
    for label in &labels {
        bots::bot(label).ok_or_else(|| format!("no native bot \"{label}\""))?;
    }
    let (specs, group) = if rotate {
        let [lone, rest] = labels.as_slice() else {
            return Err("--rotate seats two bots: the lone one, then the rest".into());
        };
        let p = players.ok_or("--rotate needs --players")?;
        let specs = (0..count)
            .map(|k| Spec {
                seed: format!("{prefix}-{}", k / p + 1),
                labels: (0..p)
                    .map(|seat| if seat == k % p { lone } else { rest }.clone())
                    .collect(),
            })
            .collect();
        (specs, p)
    } else {
        if players.is_some_and(|p| p != labels.len()) {
            return Err("without --rotate the bots are the seating".into());
        }
        let specs = (1..=count)
            .map(|n| Spec {
                seed: format!("{prefix}-{n}"),
                labels: labels.clone(),
            })
            .collect();
        (specs, 1)
    };
    Ok(Args {
        labels,
        specs,
        group,
        max_turns,
        workers,
        shard,
        out,
        games_from,
    })
}

/// `i/N`: the i-th of N shards, counted from 0.
fn parse_shard(value: &str) -> Result<(usize, usize), String> {
    let parsed = value
        .split_once('/')
        .and_then(|(i, n)| Some((i.parse().ok()?, n.parse().ok()?)));
    match parsed {
        Some((i, n)) if i < n => Ok((i, n)),
        _ => Err(format!(
            "--shard takes i/N, the i-th of N counted from 0, not \"{value}\""
        )),
    }
}

/// The games `picked` names, played on `workers` threads, in the run's order.
fn play_all(specs: &[Spec], picked: &[usize], max_turns: u32, workers: usize) -> Vec<Played> {
    let next = AtomicUsize::new(0);
    let done = Mutex::new(Vec::with_capacity(picked.len()));
    std::thread::scope(|scope| {
        for _ in 0..workers.min(picked.len()) {
            scope.spawn(|| loop {
                let n = next.fetch_add(1, Ordering::Relaxed);
                let Some(&k) = picked.get(n) else { break };
                let played = play(k, &specs[k], max_turns);
                done.lock()
                    .expect("no worker panics holding the results")
                    .push(played);
            });
        }
    });
    let mut played = done
        .into_inner()
        .expect("no worker panics holding the results");
    played.sort_by_key(|p| p.game);
    played
}

fn play(game: usize, spec: &Spec, max_turns: u32) -> Played {
    let seated: Vec<_> = spec
        .labels
        .iter()
        .map(|l| bots::bot(l).expect("labels were checked"))
        .collect();
    let mut seats: Vec<Timing> = spec.labels.iter().map(|_| Timing::default()).collect();
    let mut last_turn = vec![0u32; spec.labels.len()];
    let result = drive(
        &spec.seed,
        spec.labels.len(),
        max_turns,
        |_, input| {
            let seat = input.seat as usize;
            if input.view.turn != last_turn[seat] {
                last_turn[seat] = input.view.turn;
                seats[seat].turns += 1;
                seats[seat].per_turn.push(0);
            }
            let t = Instant::now();
            let mv = seated[seat].decide(input);
            let spent = t.elapsed().as_nanos() as u64;
            seats[seat].nanos += spent;
            *seats[seat].per_turn.last_mut().expect("a turn has begun") += spent;
            seats[seat].decisions += 1;
            Ok(mv)
        },
        |_| {},
    );
    Played {
        game,
        seed: spec.seed.clone(),
        labels: spec.labels.clone(),
        outcome: result
            .map(|record| Outcome {
                winner: record.winner,
                turns: record.turns,
                seats,
            })
            .map_err(|e| format!("{}: {e}", spec.seed)),
    }
}

/// Every shard file in `dir`, as the whole run's games in its order, and the slowest shard's time.
/// Fails on a game missing, played twice, or played from other arguments.
fn merged(dir: &Path, specs: &[Spec]) -> Result<(Vec<Played>, f64), String> {
    let mut slots: Vec<Option<Played>> = vec![None; specs.len()];
    let mut seconds = 0f64;
    let entries = std::fs::read_dir(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    for entry in entries {
        let path = entry.map_err(|e| e.to_string())?.path();
        let bytes = std::fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        let file: ShardFile = serde_json::from_slice(&bytes)
            .map_err(|e| format!("{}: not a shard's games ({e})", path.display()))?;
        seconds = seconds.max(file.seconds);
        for played in file.games {
            let spec = specs.get(played.game).ok_or_else(|| {
                format!(
                    "{}: game {} is past this run's {} games",
                    path.display(),
                    played.game,
                    specs.len()
                )
            })?;
            if played.seed != spec.seed || played.labels != spec.labels {
                return Err(format!(
                    "{}: game {} was {} [{}], this run's is {} [{}]: other arguments",
                    path.display(),
                    played.game,
                    played.seed,
                    played.labels.join(","),
                    spec.seed,
                    spec.labels.join(",")
                ));
            }
            let slot = &mut slots[played.game];
            if slot.is_some() {
                return Err(format!(
                    "{}: game {} was played twice",
                    path.display(),
                    played.game
                ));
            }
            *slot = Some(played);
        }
    }
    let played = slots
        .into_iter()
        .zip(specs)
        .enumerate()
        .map(|(k, (slot, spec))| {
            slot.ok_or_else(|| {
                format!(
                    "game {k} ({} [{}]) is in no shard's file",
                    spec.seed,
                    spec.labels.join(",")
                )
            })
        })
        .collect::<Result<_, _>>()?;
    Ok((played, seconds))
}

fn tally(lone: &str, played: &[Played]) -> Tally {
    let mut tally = Tally::default();
    for p in played {
        match &p.outcome {
            Err(e) => tally.errors.push(e.clone()),
            Ok(outcome) => {
                tally.turns += outcome.turns as u64;
                match outcome.winner {
                    None => tally.capped += 1,
                    Some(w) => {
                        tally.decisive += 1;
                        if p.labels[w as usize] == lone {
                            tally.lone_wins += 1;
                        }
                    }
                }
                for (label, t) in p.labels.iter().zip(&outcome.seats) {
                    let entry = tally.by_label.entry(label.clone()).or_default();
                    entry.decisions += t.decisions;
                    entry.turns += t.turns;
                    entry.nanos += t.nanos;
                    entry.per_turn.extend(&t.per_turn);
                }
            }
        }
    }
    tally
}

fn report(
    labels: &[String],
    specs: &[Spec],
    played: &[Played],
    seconds: f64,
) -> Result<(), String> {
    let t = tally(&labels[0], played);
    print!("{}", report_text(labels, specs, &t, seconds));
    if t.errors.is_empty() {
        Ok(())
    } else {
        Err(format!("{} games failed", t.errors.len()))
    }
}

fn report_text(labels: &[String], specs: &[Spec], t: &Tally, seconds: f64) -> String {
    use std::fmt::Write;
    let mut out = String::new();
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
    let _ = writeln!(
        out,
        "{}: {} games at {players}p, {} decisive, {} capped ({:.1}%), {} errors, mean {:.1} turns, {seconds:.1} s",
        labels.join(","),
        specs.len(),
        t.decisive,
        t.capped,
        100.0 * t.capped as f64 / specs.len() as f64,
        t.errors.len(),
        t.turns as f64 / specs.len() as f64,
    );
    let _ = writeln!(
        out,
        "  {} wins {}/{} = {:.1}% ± {:.1} (par {:.1}%), win Elo a seat {elo}",
        labels[0],
        t.lone_wins,
        t.decisive,
        100.0 * share,
        100.0 * se,
        100.0 * par,
    );
    for (label, timing) in &t.by_label {
        let mut turns = timing.per_turn.clone();
        turns.sort_unstable();
        let at = |q: f64| {
            turns
                .get(((turns.len() as f64 * q) as usize).min(turns.len().saturating_sub(1)))
                .map_or(0.0, |&n| n as f64 / 1e6)
        };
        let _ = writeln!(
            out,
            "  {label}: {:.1} us a decision, {:.2} ms a turn ({} decisions, {} turns); turns: median {:.1} ms, 9 in 10 under {:.1} ms, longest {:.1} ms",
            timing.nanos as f64 / timing.decisions.max(1) as f64 / 1e3,
            timing.nanos as f64 / timing.turns.max(1) as f64 / 1e6,
            timing.decisions,
            timing.turns,
            at(0.5),
            at(0.9),
            turns.last().map_or(0.0, |&n| n as f64 / 1e6),
        );
    }
    for e in t.errors.iter().take(5) {
        let _ = writeln!(out, "  ERROR {e}");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    /// The report with every time zeroed: what a run's games decide, not the machine's speed.
    fn untimed(labels: &[String], specs: &[Spec], played: &[Played]) -> String {
        let mut played = played.to_vec();
        for p in &mut played {
            if let Ok(outcome) = &mut p.outcome {
                for seat in &mut outcome.seats {
                    seat.nanos = 0;
                    seat.per_turn.iter_mut().for_each(|t| *t = 0);
                }
            }
        }
        report_text(labels, specs, &tally(&labels[0], &played), 0.0)
    }

    #[test]
    fn shards_merged_report_what_the_whole_run_does() {
        // 8 games at 3 seats: two whole rotation groups and a part one, over 3 shards, one of
        // which gets a single group.
        let run = [
            "--bots",
            "greedy,random",
            "--players",
            "3",
            "--seeds",
            "shard-test",
            "--count",
            "8",
            "--rotate",
            "--workers",
            "2",
        ];
        let whole = parse(&args(&run)).unwrap();
        let all: Vec<usize> = (0..whole.specs.len()).collect();
        let at_once = play_all(&whole.specs, &all, whole.max_turns, 2);

        let dir = std::env::temp_dir().join(format!("risk-native-shards-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for i in 0..3 {
            let out = dir.join(format!("{i}.json"));
            let mut sharded = args(&run);
            sharded.extend(args(&[
                "--shard",
                &format!("{i}/3"),
                "--out",
                out.to_str().unwrap(),
            ]));
            games(&sharded).unwrap();
        }
        let shard_files: Vec<ShardFile> = (0..3)
            .map(|i| {
                serde_json::from_slice(&std::fs::read(dir.join(format!("{i}.json"))).unwrap())
                    .unwrap()
            })
            .collect();
        let merge = merged(&dir, &whole.specs);
        std::fs::remove_dir_all(&dir).unwrap();
        let (merged, _) = merge.unwrap();

        // Seed groups stay whole: every game of a seed is on one shard.
        for file in &shard_files {
            for p in &file.games {
                assert_eq!(
                    p.game / 3 % 3,
                    file.shard,
                    "game {} on shard {}",
                    p.game,
                    file.shard
                );
            }
        }
        assert_eq!(merged.len(), at_once.len());
        assert_eq!(
            untimed(&whole.labels, &whole.specs, &merged),
            untimed(&whole.labels, &whole.specs, &at_once)
        );
        // Beyond the report, every game's winner, length and decision counts match.
        let strip = |p: &[Played]| -> Vec<_> {
            p.iter()
                .map(|p| {
                    let o = p.outcome.as_ref().unwrap();
                    let counts: Vec<_> = o.seats.iter().map(|s| (s.decisions, s.turns)).collect();
                    (p.game, o.winner, o.turns, counts)
                })
                .collect()
        };
        assert_eq!(strip(&merged), strip(&at_once));
    }

    #[test]
    fn a_merge_fails_loudly_on_a_missing_shard() {
        let run = [
            "--bots",
            "greedy,random,random",
            "--seeds",
            "shard-miss",
            "--count",
            "2",
        ];
        let whole = parse(&args(&run)).unwrap();
        let dir = std::env::temp_dir().join(format!("risk-native-miss-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("0.json");
        let mut sharded = args(&run);
        sharded.extend(args(&["--shard", "0/2", "--out", out.to_str().unwrap()]));
        games(&sharded).unwrap();
        let merge = merged(&dir, &whole.specs);
        std::fs::remove_dir_all(&dir).unwrap();
        let err = merge.expect_err("a shard is missing");
        assert!(err.contains("game 1 (shard-miss-2"), "{err}");
    }

    #[test]
    fn a_shard_names_its_place() {
        assert_eq!(parse_shard("3/20"), Ok((3, 20)));
        assert!(parse_shard("20/20").is_err());
        assert!(parse_shard("3").is_err());
    }
}

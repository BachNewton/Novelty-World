mod games;
mod sweep;

use risk_native::decide::check_file;
use risk_native::engine::new_game;
use risk_native::lockstep::replay_file;
use risk_native::record::{read_records, record_game, recorded_move, write_records};
use std::path::Path;
use std::process::ExitCode;
use std::time::Instant;

const USAGE: &str = "usage:
  risk-native lockstep <records.jsonl[.gz]...>   replay recorded TypeScript games move for move
  risk-native decide <records.jsonl[.gz]...>     ask each seat's native bot every recorded decision
  risk-native play --bots <a,b,c...> [--players P] --seeds <prefix> --count N [--turns T] --out <file>
                                                 play native games and write them as records
  risk-native serve [--workers N]                play the harness's game specs, JSON lines on stdin
  risk-native bots                               list the native bots' labels, as JSON
  risk-native bots-serve                         answer seats' decisions, JSON lines on stdin
  risk-native bench <records.jsonl[.gz]...>      time options + apply over the records' positions
  risk-native games --bots <a,b...> [--players P] --seeds <prefix> --count N [--rotate] [--turns T] [--workers W]
                                                 play native tables and report the lone bot's win share and time
                    [--shard i/N --out <file>]   play every N-th seed group from the i-th and write its games
                    [--games-from <dir>]         report the shards' games, as one run of these arguments would
  risk-native agree --bot <label> [--seats <recorded label>] <records.jsonl[.gz]...>
                                                 how often a native bot decides as the recorded seats did
  risk-native agree-log --bot <label> --seats <s,s...> <online-log.json...>
                                                 how often a native bot decides as an online game's seats
                                                 did, and its time on their turns
  risk-native sweep --points <points.jsonl> --out <results.jsonl> [--players 5,6] [--groups A-B] [--mirror A-B]
                    [--prefix P] [--base native-v1] [--turns T] [--workers W]
                    [--in-seeds S] [--out-seeds S]  (one-in, one-out groups seeded S-1, S-2...: a gauntlet's own)
                                                 map native-v1's rule-v6.1 settings against the base
  risk-native sweep-report <results.jsonl...> [--json <out.json>]
                                                 sum sweep results by point: cap rates, win shares, Elo";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("lockstep") if args.len() > 1 => lockstep(&args[1..]),
        Some("serve") => workers(&args[1..]).and_then(|w| {
            risk_native::serve::serve(std::io::stdin().lock(), std::io::stdout().lock(), w)
        }),
        Some("bots") if args.len() == 1 => {
            let labels: Vec<_> = risk_native::bots::labels().collect();
            serde_json::to_string(&labels)
                .map(|json| println!("{json}"))
                .map_err(|e| e.to_string())
        }
        Some("bots-serve") if args.len() == 1 => {
            risk_native::serve::bots_serve(std::io::stdin().lock(), std::io::stdout().lock())
        }
        Some("decide") if args.len() > 1 => decide(&args[1..]),
        Some("play") => play(&args[1..]),
        Some("bench") if args.len() > 1 => bench(&args[1..]),
        Some("games") => games::games(&args[1..]),
        Some("agree") => agree(&args[1..]),
        Some("agree-log") => agree_log(&args[1..]),
        Some("sweep") => sweep::sweep(&args[1..]),
        Some("sweep-report") if args.len() > 1 => sweep::report(&args[1..]),
        _ => Err(USAGE.to_string()),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

/// A comma-separated list of bot labels, a tuned label's JSON kept whole: the commas inside its
/// braces separate settings, not labels (`native-v1~{"power":"armies","armyRounds":16},greedy`).
fn labels(list: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut depth = 0i32;
    let mut start = 0;
    for (i, c) in list.char_indices() {
        match c {
            '{' => depth += 1,
            '}' => depth -= 1,
            ',' if depth == 0 => {
                out.push(list[start..i].to_string());
                start = i + 1;
            }
            _ => {}
        }
    }
    out.push(list[start..].to_string());
    out
}

fn workers(args: &[String]) -> Result<usize, String> {
    match args {
        [] => Ok(std::thread::available_parallelism().map_or(1, |n| n.get())),
        [flag, n] if flag == "--workers" => n
            .parse()
            .ok()
            .filter(|&n| n > 0)
            .ok_or_else(|| format!("--workers takes a positive number, not \"{n}\"")),
        _ => Err(USAGE.to_string()),
    }
}

fn lockstep(files: &[String]) -> Result<(), String> {
    let mut failed = 0;
    for file in files {
        match replay_file(Path::new(file)) {
            Ok(t) => println!(
                "{file}: {} games, {} moves, all in lockstep",
                t.games, t.moves
            ),
            Err(e) => {
                failed += 1;
                println!("FAIL {e}");
            }
        }
    }
    if failed > 0 {
        return Err(format!("{failed} of {} files diverged", files.len()));
    }
    Ok(())
}

fn decide(files: &[String]) -> Result<(), String> {
    for file in files {
        let t = check_file(Path::new(file))?;
        println!(
            "{file}: {} games, {} decisions, every one the recorded move",
            t.games, t.decisions
        );
    }
    Ok(())
}

/// `risk:native-fixtures`'s arguments and seeds (`<prefix>-1` to `<prefix>-<count>`), so the
/// TypeScript checker can hold the games to its own bots.
fn play(args: &[String]) -> Result<(), String> {
    let mut bots: Option<Vec<String>> = None;
    let mut players: Option<usize> = None;
    let mut prefix: Option<String> = None;
    let mut count: Option<u32> = None;
    let mut max_turns = 600;
    let mut out: Option<String> = None;
    let number = |flag: &str, value: &str| {
        value
            .parse::<u32>()
            .map_err(|_| format!("{flag} takes a number, not \"{value}\""))
    };
    for pair in args.chunks(2) {
        let [flag, value] = pair else {
            return Err(format!(
                "{} has no value
{USAGE}",
                pair[0]
            ));
        };
        match flag.as_str() {
            "--bots" => bots = Some(labels(value)),
            "--players" => players = Some(number(flag, value)? as usize),
            "--seeds" => prefix = Some(value.clone()),
            "--count" => count = Some(number(flag, value)?),
            "--turns" => max_turns = number(flag, value)?,
            "--out" => out = Some(value.clone()),
            _ => {
                return Err(format!(
                    "unknown argument \"{flag}\"
{USAGE}"
                ))
            }
        }
    }
    let (Some(bots), Some(prefix), Some(count), Some(out)) = (bots, prefix, count, out) else {
        return Err(format!(
            "name --bots, --seeds, --count and --out
{USAGE}"
        ));
    };
    let seated = match players {
        Some(_) if bots.len() != 1 => {
            return Err("--players seats one bot at every seat: name a single bot with it".into())
        }
        Some(p) => vec![bots[0].clone(); p],
        None => bots,
    };
    let started = Instant::now();
    let games = (1..=count)
        .map(|n| record_game(&format!("{prefix}-{n}"), &seated, max_turns))
        .collect::<Result<Vec<_>, _>>()?;
    let bytes = write_records(Path::new(&out), &games)?;
    let decisions: u32 = games.iter().map(|g| g.decisions).sum();
    let capped = games.iter().filter(|g| g.result.capped).count();
    println!(
        "{out}: {} games [{}], {capped} capped, {decisions} decisions, {} KB, {:.1} s",
        games.len(),
        seated.join(","),
        bytes / 1024,
        started.elapsed().as_secs_f64()
    );
    Ok(())
}

fn bench(files: &[String]) -> Result<(), String> {
    let mut games = Vec::new();
    for file in files {
        for record in read_records(Path::new(file))? {
            let moves = record
                .moves
                .iter()
                .map(recorded_move)
                .collect::<Result<Vec<_>, _>>()?;
            games.push((record.players, record.seed, moves));
        }
    }
    let total: usize = games.iter().map(|g| g.2.len()).sum();
    let rounds = (2_000_000 / total.max(1)).max(1);
    let started = Instant::now();
    let mut setups = 0.0;
    for _ in 0..rounds {
        for (players, seed, moves) in &games {
            let t = Instant::now();
            let (mut game, _) = new_game(*players, seed);
            setups += t.elapsed().as_secs_f64();
            for &(seat, mv) in moves {
                std::hint::black_box(game.options(seat));
                game.apply_quiet(seat, mv)
                    .map_err(|e| format!("{seed}: {mv:?} refused ({e})"))?;
            }
        }
    }
    let elapsed = started.elapsed().as_secs_f64() - setups;
    let n = (total * rounds) as f64;
    println!(
        "{} positions x {rounds}: {:.0} ns per options + apply, {:.1} M moves a second; setup {:.1} us a game",
        total,
        elapsed / n * 1e9,
        n / elapsed / 1e6,
        setups / (games.len() * rounds) as f64 * 1e6
    );
    Ok(())
}

fn agree(args: &[String]) -> Result<(), String> {
    let mut label = None;
    let mut seats = None;
    let mut files = Vec::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--bot" => {
                label = args.get(i + 1).cloned();
                i += 2;
            }
            "--seats" => {
                seats = args.get(i + 1).cloned();
                i += 2;
            }
            _ => {
                files.push(args[i].clone());
                i += 1;
            }
        }
    }
    let label = label.ok_or("name --bot")?;
    let mut total = std::collections::BTreeMap::<&str, (u32, u32)>::new();
    for f in &files {
        for (k, (a, n)) in risk_native::decide::agreement(Path::new(f), &label, seats.as_deref())? {
            let e = total.entry(k).or_default();
            e.0 += a;
            e.1 += n;
        }
    }
    let (mut a, mut n) = (0, 0);
    let mut parts = Vec::new();
    for (k, (x, y)) in &total {
        a += x;
        n += y;
        parts.push(format!(
            "{k} {x}/{y} ({:.1}%)",
            100.0 * *x as f64 / *y as f64
        ));
    }
    println!(
        "{label}: {a}/{n} = {:.2}% | {}",
        100.0 * a as f64 / n.max(1) as f64,
        parts.join(", ")
    );
    Ok(())
}

fn agree_log(args: &[String]) -> Result<(), String> {
    let mut label = None;
    let mut seats: Vec<u8> = Vec::new();
    let mut files = Vec::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--bot" => {
                label = args.get(i + 1).cloned();
                i += 2;
            }
            "--seats" => {
                let list = args.get(i + 1).ok_or("--seats has no value")?;
                seats = list
                    .split(',')
                    .map(|s| {
                        s.parse()
                            .map_err(|_| format!("--seats takes seat numbers, not \"{s}\""))
                    })
                    .collect::<Result<_, _>>()?;
                i += 2;
            }
            _ => {
                files.push(args[i].clone());
                i += 1;
            }
        }
    }
    let label = label.ok_or("name --bot")?;
    if seats.is_empty() || files.is_empty() {
        return Err(format!(
            "name --seats and a log
{USAGE}"
        ));
    }
    for f in &files {
        let log = risk_native::decide::read_online_log(Path::new(f))?;
        let a = risk_native::decide::online_agreement(&log, &label, &seats)?;
        let (mut agreed, mut asked) = (0, 0);
        let mut parts = Vec::new();
        for (k, (x, n)) in &a.kinds {
            agreed += x;
            asked += n;
            parts.push(format!(
                "{k} {x}/{n} ({:.1}%)",
                100.0 * *x as f64 / *n as f64
            ));
        }
        println!(
            "{f}: {label} at seats {seats:?}: {agreed}/{asked} = {:.1}% | {}",
            100.0 * agreed as f64 / asked.max(1) as f64,
            parts.join(", ")
        );
        let mut turns = a.turn_nanos.clone();
        turns.sort_unstable();
        if !turns.is_empty() {
            let at = |q: f64| {
                turns[((turns.len() as f64 * q) as usize).min(turns.len() - 1)] as f64 / 1e6
            };
            println!(
                "  {} turns: median {:.1} ms, 9 in 10 under {:.1} ms, longest {:.1} ms",
                turns.len(),
                at(0.5),
                at(0.9),
                at(1.0)
            );
        }
        for (d, turn, mine, played) in &a.differed {
            println!("  d{d} (turn {turn}): plays {mine:?}, the game {played:?}");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn a_tuned_labels_commas_stay_in_it() {
        assert_eq!(
            super::labels(r#"native-v1~{"power":"armies","armyRounds":16},greedy"#),
            [r#"native-v1~{"power":"armies","armyRounds":16}"#, "greedy"]
        );
        assert_eq!(super::labels("greedy"), ["greedy"]);
    }
}

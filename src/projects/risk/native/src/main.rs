mod games;

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
  risk-native bench <records.jsonl[.gz]...>      time options + apply over the records' positions
  risk-native games --bots <a,b...> [--players P] --seeds <prefix> --count N [--rotate] [--turns T] [--workers W]
                                                 play native tables and report the lone bot's win share and time";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("lockstep") if args.len() > 1 => lockstep(&args[1..]),
        Some("serve") => workers(&args[1..]).and_then(|w| {
            risk_native::serve::serve(std::io::stdin().lock(), std::io::stdout().lock(), w)
        }),
        Some("decide") if args.len() > 1 => decide(&args[1..]),
        Some("play") => play(&args[1..]),
        Some("bench") if args.len() > 1 => bench(&args[1..]),
        Some("games") => games::games(&args[1..]),
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
            "--bots" => bots = Some(value.split(',').map(String::from).collect()),
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

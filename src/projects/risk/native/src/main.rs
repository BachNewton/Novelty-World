use risk_native::engine::new_game;
use risk_native::lockstep::replay_file;
use risk_native::record::{read_records, recorded_move};
use std::path::Path;
use std::process::ExitCode;
use std::time::Instant;

const USAGE: &str = "usage:
  risk-native lockstep <records.jsonl[.gz]...>   replay recorded TypeScript games move for move
  risk-native serve [--workers N]                play the harness's game specs, JSON lines on stdin
  risk-native bench <records.jsonl[.gz]...>      time options + apply over the records' positions";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("lockstep") if args.len() > 1 => lockstep(&args[1..]),
        Some("serve") => workers(&args[1..]).and_then(|w| {
            risk_native::serve::serve(std::io::stdin().lock(), std::io::stdout().lock(), w)
        }),
        Some("bench") if args.len() > 1 => bench(&args[1..]),
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

//! Throwaway diagnosis: who attacks whom in 6-player tables of a v6.1 point and native-v6.
//! usage: diag61 <cand label> <base label> <seating in|out|mirror|base> <players> <groups> [prefix]

use risk_native::bots;
use risk_native::engine::{Game, Seat};
use risk_native::map::ADJACENCY;
use risk_native::runner::drive;
use std::sync::Mutex;

const SAMPLE_TURNS: [u32; 4] = [50, 100, 200, 300];

#[derive(Default, Clone)]
struct Agg {
    seats: f64,
    wins: f64,
    turns_alive: f64,
    dealt: [f64; 2],    // damage dealt to [cand, base]
    received: [f64; 2], // damage received from [cand, base]
    attack_loss: f64,
    placed: f64,
    captures_from: [f64; 2],
    kills: [f64; 2],
    // at sample turns: (armies share, idle share, biggest stack, count present)
    armies_share: [f64; 4],
    idle_frac: [f64; 4],
    biggest: [f64; 4],
    present: [f64; 4],
    // turns of the seat's own with no capture
    passive_turns: f64,
    own_turns: f64,
    // winner-only
}

fn idle(g: &Game, s: Seat) -> (i32, i32) {
    let mut all = 0;
    let mut idle = 0;
    for t in 0..42 {
        if g.owner[t] == s {
            all += g.armies[t];
            if ADJACENCY[t].iter().all(|&n| g.owner[n] == s) {
                idle += g.armies[t] - 1;
            }
        }
    }
    (all, idle)
}

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let cand = &a[0];
    let base = &a[1];
    let seating = a[2].as_str();
    let p: usize = a[3].parse().unwrap();
    let groups: usize = a[4].parse().unwrap();
    let prefix = a.get(5).cloned().unwrap_or("v61map".into());
    let mut games: Vec<(String, Vec<bool>)> = Vec::new();
    for n in 1..=groups {
        let seed = format!("{prefix}-{p}p-{n}");
        match seating {
            "mirror" => games.push((format!("{prefix}-mirror-{p}p-{n}"), vec![true; p])),
            "base" => games.push((format!("{prefix}-mirror-{p}p-{n}"), vec![false; p])),
            _ => {
                for lone in 0..p {
                    games.push((
                        seed.clone(),
                        (0..p).map(|s| (s == lone) == (seating == "in")).collect(),
                    ))
                }
            }
        }
    }
    // [by winner kind: 0 cand won, 1 base won, 2 capped][seat kind]
    let total: Mutex<Vec<[Agg; 2]>> = Mutex::new(vec![Default::default(); 3]);
    let counts: Mutex<[f64; 3]> = Mutex::new([0.0; 3]);
    let turns_sum: Mutex<[f64; 3]> = Mutex::new([0.0; 3]);
    let next = std::sync::atomic::AtomicUsize::new(0);
    let workers: usize = std::env::var("W")
        .ok()
        .and_then(|w| w.parse().ok())
        .unwrap_or(12);
    std::thread::scope(|sc| {
        for _ in 0..workers {
            sc.spawn(|| loop {
                let i = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                if i >= games.len() {
                    break;
                }
                let (seed, is_cand) = &games[i];
                let bs: Vec<Box<dyn risk_native::bot::Bot>> = is_cand
                    .iter()
                    .map(|&c| bots::bot(if c { cand } else { base }).unwrap())
                    .collect();
                let kind = |s: usize| if is_cand[s] { 0 } else { 1 };
                let mut agg: [Agg; 2] = Default::default();
                let mut prev: Option<Game> = None;
                let mut sampled = [false; 4];
                let mut alive_turns = vec![0f64; p];
                let mut captured_turn = false;
                let mut last_turn = 0u32;
                let mut last_active: Seat = 255;
                let mut passive = vec![0f64; p];
                let mut own = vec![0f64; p];
                let mut kills = vec![[0f64; 2]; p];
                let mut dealt = vec![[0f64; 2]; p];
                let mut received = vec![[0f64; 2]; p];
                let mut attack_loss = vec![0f64; p];
                let mut placed = vec![0f64; p];
                let mut capf = vec![[0f64; 2]; p];
                let mut samples = vec![[[0f64; 4]; 3]; p]; // share, idle frac, biggest
                let mut present = vec![[0f64; 4]; p];
                let rec = drive(
                    seed,
                    p,
                    600,
                    |_, input| Ok(bs[input.seat as usize].decide(input)),
                    |g: &Game| {
                        if let Some(pr) = &prev {
                            let act = pr.active as usize;
                            if g.turn != last_turn {
                                // a turn ended (pr.active's)
                                if last_active != 255 {
                                    own[last_active as usize] += 1.0;
                                    if !captured_turn {
                                        passive[last_active as usize] += 1.0;
                                    }
                                }
                                captured_turn = false;
                                last_turn = g.turn;
                                for s in 0..p {
                                    if !g.eliminated[s] {
                                        alive_turns[s] += 1.0;
                                    }
                                }
                            }
                            last_active = g.active;
                            for s in 0..p {
                                let before: i32 = (0..42)
                                    .filter(|&t| pr.owner[t] as usize == s)
                                    .map(|t| pr.armies[t])
                                    .sum();
                                let after: i32 = (0..42)
                                    .filter(|&t| g.owner[t] as usize == s)
                                    .map(|t| g.armies[t])
                                    .sum();
                                let d = (after - before) as f64;
                                if s == act {
                                    if d < 0.0 {
                                        attack_loss[s] -= d;
                                    } else {
                                        placed[s] += d;
                                    }
                                } else if d < 0.0 {
                                    dealt[act][kind(s)] -= d;
                                    received[s][kind(act)] -= d;
                                }
                            }
                            for t in 0..42 {
                                if pr.owner[t] != g.owner[t] {
                                    captured_turn = true;
                                    capf[act][kind(pr.owner[t] as usize)] += 1.0;
                                }
                            }
                            for s in 0..p {
                                if g.eliminated[s] && !pr.eliminated[s] {
                                    kills[act][kind(s)] += 1.0;
                                }
                            }
                        }
                        for (k, &st) in SAMPLE_TURNS.iter().enumerate() {
                            if !sampled[k] && g.turn >= st {
                                sampled[k] = true;
                                let tot: i32 = g.armies.iter().sum();
                                for s in 0..p {
                                    if g.eliminated[s] {
                                        continue;
                                    }
                                    let (all, id) = idle(g, s as Seat);
                                    let big = (0..42)
                                        .filter(|&t| g.owner[t] as usize == s)
                                        .map(|t| g.armies[t])
                                        .max()
                                        .unwrap_or(0);
                                    samples[s][0][k] += all as f64 / tot as f64;
                                    samples[s][1][k] += id as f64 / all.max(1) as f64;
                                    samples[s][2][k] += big as f64;
                                    present[s][k] += 1.0;
                                }
                            }
                        }
                        prev = Some(*g);
                    },
                )
                .unwrap();
                let wk = match rec.winner {
                    None => 2,
                    Some(w) => kind(w as usize),
                };
                for s in 0..p {
                    let a = &mut agg[kind(s)];
                    a.seats += 1.0;
                    a.wins += (rec.winner == Some(s as Seat)) as u8 as f64;
                    a.turns_alive += alive_turns[s];
                    for k in 0..2 {
                        a.dealt[k] += dealt[s][k];
                        a.received[k] += received[s][k];
                        a.captures_from[k] += capf[s][k];
                        a.kills[k] += kills[s][k];
                    }
                    a.attack_loss += attack_loss[s];
                    a.placed += placed[s];
                    a.passive_turns += passive[s];
                    a.own_turns += own[s];
                    for k in 0..4 {
                        a.armies_share[k] += samples[s][0][k];
                        a.idle_frac[k] += samples[s][1][k];
                        a.biggest[k] += samples[s][2][k];
                        a.present[k] += present[s][k];
                    }
                }
                let mut t = total.lock().unwrap();
                for k in 0..2 {
                    let d = &mut t[wk][k];
                    let s = &agg[k];
                    d.seats += s.seats;
                    d.wins += s.wins;
                    d.turns_alive += s.turns_alive;
                    for j in 0..2 {
                        d.dealt[j] += s.dealt[j];
                        d.received[j] += s.received[j];
                        d.captures_from[j] += s.captures_from[j];
                        d.kills[j] += s.kills[j];
                    }
                    d.attack_loss += s.attack_loss;
                    d.placed += s.placed;
                    d.passive_turns += s.passive_turns;
                    d.own_turns += s.own_turns;
                    for j in 0..4 {
                        d.armies_share[j] += s.armies_share[j];
                        d.idle_frac[j] += s.idle_frac[j];
                        d.biggest[j] += s.biggest[j];
                        d.present[j] += s.present[j];
                    }
                }
                counts.lock().unwrap()[wk] += 1.0;
                turns_sum.lock().unwrap()[wk] += rec.turns as f64;
            });
        }
    });
    let t = total.into_inner().unwrap();
    let c = counts.into_inner().unwrap();
    let ts = turns_sum.into_inner().unwrap();
    let names = ["cand", "base"];
    let mut all: [Agg; 2] = Default::default();
    for wk in 0..3 {
        for k in 0..2 {
            let s = &t[wk][k];
            let d = &mut all[k];
            d.seats += s.seats;
            d.wins += s.wins;
            d.turns_alive += s.turns_alive;
            for j in 0..2 {
                d.dealt[j] += s.dealt[j];
                d.received[j] += s.received[j];
                d.captures_from[j] += s.captures_from[j];
                d.kills[j] += s.kills[j];
            }
            d.attack_loss += s.attack_loss;
            d.placed += s.placed;
            d.passive_turns += s.passive_turns;
            d.own_turns += s.own_turns;
            for j in 0..4 {
                d.armies_share[j] += s.armies_share[j];
                d.idle_frac[j] += s.idle_frac[j];
                d.biggest[j] += s.biggest[j];
                d.present[j] += s.present[j];
            }
        }
    }
    let print = |title: &str, agg: &[Agg; 2], n: f64, turns: f64| {
        println!(
            "== {title}: {n} games, mean turns {:.0}",
            turns / n.max(1.0)
        );
        for k in 0..2 {
            let a = &agg[k];
            if a.seats == 0.0 {
                continue;
            }
            let per = |x: f64| x / a.turns_alive.max(1.0) * 6.0; // per round-ish (per 6 table turns alive)
            println!(
                "  {:4} seats {:4} win {:.3} alive {:.0}t | per 6 turns alive: dealt c/b {:.2}/{:.2} recv c/b {:.2}/{:.2} atkloss {:.2} placed {:.2} capt c/b {:.2}/{:.2} | kills c/b {:.2}/{:.2} per seat | passive {:.2}",
                names[k], a.seats, a.wins / a.seats, a.turns_alive / a.seats,
                per(a.dealt[0]), per(a.dealt[1]), per(a.received[0]), per(a.received[1]),
                per(a.attack_loss), per(a.placed), per(a.captures_from[0]), per(a.captures_from[1]),
                a.kills[0] / a.seats, a.kills[1] / a.seats, a.passive_turns / a.own_turns.max(1.0)
            );
            let mut line = String::from("        at turn");
            for j in 0..4 {
                if a.present[j] > 0.0 {
                    line += &format!(
                        " {}: share {:.3} idle {:.2} big {:.0} (n {});",
                        SAMPLE_TURNS[j],
                        a.armies_share[j] / a.present[j],
                        a.idle_frac[j] / a.present[j],
                        a.biggest[j] / a.present[j],
                        a.present[j]
                    );
                }
            }
            println!("{line}");
        }
    };
    print("all", &all, c.iter().sum(), ts.iter().sum());
    print("cand won", &t[0], c[0], ts[0]);
    print("base won", &t[1], c[1], ts[1]);
    print("capped", &t[2], c[2], ts[2]);
}

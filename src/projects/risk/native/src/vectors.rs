//! The port held to the TypeScript bit for bit, on the vectors `npm run risk:native-vectors`
//! exports (`eval/native/vectors.ts`, which documents their layout).

use crate::blitz::{balance, capture_chance, estimated_win_chance, fair_fight, resolve_blitz};
use crate::cards::{is_valid_set, set_value, sets_in, FULL_DECK};
use crate::jsmath::{exp, fround, js_round, log, pow, to_base36};
use crate::map::{Symbol, ADJACENCY, CONTINENTS, TERRITORIES};
use crate::odds::{
    battle_outcome, blitz_commit, exchange, expected_loss, path_run, path_run_via, roll_odds,
    win_prob,
};
use crate::rng::Rng;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::path::PathBuf;

fn load(name: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures/vectors")
        .join(name);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!(
            "can't read {} ({e}): run `npm run risk:native-vectors` to export the vectors",
            path.display()
        )
    });
    serde_json::from_str(&text).expect("vectors are JSON")
}

fn floats(v: &Value) -> Vec<f64> {
    let s = v.as_str().expect("a hex run");
    assert!(
        s.len().is_multiple_of(16),
        "a hex run of {} digits",
        s.len()
    );
    (0..s.len() / 16)
        .map(|i| f64::from_bits(u64::from_str_radix(&s[i * 16..i * 16 + 16], 16).expect("hex")))
        .collect()
}

fn float(v: &Value) -> f64 {
    let all = floats(v);
    assert_eq!(all.len(), 1);
    all[0]
}

fn int(v: &Value) -> usize {
    v.as_u64().expect("an integer") as usize
}

fn ints(v: &Value) -> Vec<usize> {
    v.as_array().expect("an array").iter().map(int).collect()
}

fn same(a: f64, b: f64) -> bool {
    a.to_bits() == b.to_bits() || (a.is_nan() && b.is_nan())
}

fn check(what: &str, expected: f64, got: f64) {
    assert!(
        same(expected, got),
        "{what}: expected {expected:e} ({:016x}), got {got:e} ({:016x})",
        expected.to_bits(),
        got.to_bits()
    );
}

fn check_all(what: &str, expected: &[f64], got: &[f64]) {
    assert_eq!(expected.len(), got.len(), "{what}: lengths");
    for (i, (&e, &g)) in expected.iter().zip(got).enumerate() {
        check(&format!("{what}[{i}]"), e, g);
    }
}

fn digest(values: &[f64]) -> String {
    let mut hasher = Sha256::new();
    for v in values {
        hasher.update(v.to_bits().to_le_bytes());
    }
    hasher.finalize()[..8]
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

// --- rng -------------------------------------------------------------------

#[test]
fn rng_matches() {
    let v = load("rng.json");
    for case in v["seeds"].as_array().unwrap() {
        let seed = case["seed"].as_str().unwrap();
        let mut rng = Rng::from_seed(seed);
        assert_eq!(
            rng.state() as u64,
            case["state"].as_u64().unwrap(),
            "state of {seed:?}"
        );
        let got: Vec<f64> = (0..32).map(|_| rng.next()).collect();
        check_all(&format!("draws of {seed:?}"), &floats(&case["draws"]), &got);
    }
    for case in v["states"].as_array().unwrap() {
        let state = case["state"].as_u64().unwrap() as u32;
        let mut rng = Rng::from_state(state);
        let got: Vec<f64> = (0..32).map(|_| rng.next()).collect();
        check_all(
            &format!("draws of state {state}"),
            &floats(&case["draws"]),
            &got,
        );
    }
    let c = &v["checksum"];
    let mut rng = Rng::from_seed(c["seed"].as_str().unwrap());
    let mut sum = 0.0;
    for _ in 0..int(&c["count"]) {
        sum += rng.next();
    }
    check("checksum sum", float(&c["sum"]), sum);
    assert_eq!(
        rng.state() as u64,
        c["state"].as_u64().unwrap(),
        "checksum state"
    );
    for case in v["shuffles"].as_array().unwrap() {
        let mut rng = Rng::from_seed(case["seed"].as_str().unwrap());
        let items: Vec<usize> = (0..44).collect();
        assert_eq!(
            rng.shuffle(&items),
            ints(&case["out"]),
            "shuffle {}",
            case["seed"]
        );
        assert_eq!(rng.state() as u64, case["state"].as_u64().unwrap());
    }
    for case in v["base36"].as_array().unwrap() {
        let n = case["n"].as_u64().unwrap() as u32;
        assert_eq!(to_base36(n), case["s"].as_str().unwrap(), "{n} in base 36");
    }
}

// --- jsmath ----------------------------------------------------------------

#[test]
fn round_matches() {
    let v = load("jsmath.json");
    let xs = floats(&v["round"]["x"]);
    let out = floats(&v["round"]["out"]);
    for (&x, &o) in xs.iter().zip(&out) {
        check(
            &format!("Math.round({x:e} = {:016x})", x.to_bits()),
            o,
            js_round(x),
        );
    }
}

fn check_pow(x: f64, y: f64, expected: f64) {
    check(
        &format!(
            "{x:e} ({:016x}) ** {y:e} ({:016x})",
            x.to_bits(),
            y.to_bits()
        ),
        expected,
        pow(x, y),
    );
}

#[test]
fn pow_matches_on_special_and_fed_inputs() {
    let v = load("jsmath.json");
    let p = &v["pow"];
    for triple in floats(&p["pairs"]).chunks(3) {
        check_pow(triple[0], triple[1], triple[2]);
    }
    for case in p["powersOfTwo"].as_array().unwrap() {
        let y = float(&case["y"]);
        let out = floats(&case["out"]);
        assert_eq!(out.len(), 1075);
        for (i, &o) in out.iter().enumerate() {
            let e = i as i32 - 1074;
            let x = if e < -1022 {
                f64::from_bits(1u64 << (e + 1074))
            } else {
                f64::from_bits(((e + 1023) as u64) << 52)
            };
            check_pow(x, y, o);
        }
    }
    for case in p["fed"].as_array().unwrap() {
        let y = float(&case["y"]);
        for (&x, &o) in floats(&case["x"]).iter().zip(&floats(&case["out"])) {
            check_pow(x, y, o);
        }
    }
}

/// The sweeps' inputs, built as `eval/native/vectors.ts` builds them.
fn random_bits(rng: &mut Rng, e_lo: u64, e_hi: u64) -> f64 {
    let high = (rng.next() * 4294967296.0).floor() as u64;
    let low = (rng.next() * 4294967296.0).floor() as u64;
    let exponent = e_lo + (rng.next() * (e_hi - e_lo + 1) as f64).floor() as u64;
    f64::from_bits((exponent << 52) | ((high & 0xfffff) << 32) | low)
}

fn check_sweep(what: &str, sweep: &Value, inputs: &[String], outputs: &[f64]) {
    let count = int(&sweep["count"]);
    assert_eq!(outputs.len(), count, "{what}: count");
    let every = int(&sweep["every"]);
    let samples = floats(&sweep["samples"]);
    for (k, &expected) in samples.iter().enumerate() {
        let i = k * every;
        check(&format!("{what} #{i}: {}", inputs[i]), expected, outputs[i]);
    }
    let chunk = int(&sweep["chunk"]);
    for (c, expected) in sweep["chunks"].as_array().unwrap().iter().enumerate() {
        let from = c * chunk;
        let to = count.min(from + chunk);
        assert_eq!(
            digest(&outputs[from..to]),
            expected.as_str().unwrap(),
            "{what}: the outputs of inputs {from}..{to} differ from the TypeScript's (first input {}); \
             export that chunk's outputs to find the input",
            inputs[from]
        );
    }
}

fn describe(x: f64) -> String {
    format!("{x:e} ({:016x})", x.to_bits())
}

#[test]
fn pow_matches_on_the_sweep() {
    let v = load("jsmath.json");
    let sweep = &v["pow"]["sweep"];
    let per = int(&sweep["perExponent"]);
    let mut rng = Rng::from_seed("pow-sweep");
    let mut inputs = Vec::new();
    let mut outputs = Vec::new();
    for y in [fround(1.3), fround(1.8), 1.3, 1.8] {
        for i in 0..per {
            let x = match i % 4 {
                0 => rng.next(),
                1 => random_bits(&mut rng, 23, 1022),
                2 => rng.next() * rng.next(),
                _ => random_bits(&mut rng, 0, 1022),
            };
            inputs.push(format!("{} ** {}", describe(x), describe(y)));
            outputs.push(pow(x, y));
        }
    }
    check_sweep("pow sweep", sweep, &inputs, &outputs);
}

#[test]
fn exp_matches() {
    let v = load("jsmath.json");
    let e = &v["exp"];
    for (&x, &o) in floats(&e["specials"]["x"])
        .iter()
        .zip(&floats(&e["specials"]["out"]))
    {
        check(&format!("exp({})", describe(x)), o, exp(x));
    }
    let count = int(&e["sweep"]["count"]);
    let mut rng = Rng::from_seed("exp-sweep");
    let xs: Vec<f64> = (0..count)
        .map(|i| match i % 3 {
            0 => -50.0 + rng.next() * 100.0,
            1 => -745.0 + rng.next() * 1455.0,
            _ => {
                let negative = rng.next() < 0.5;
                let x = random_bits(&mut rng, 900, 1030);
                if negative {
                    -x
                } else {
                    x
                }
            }
        })
        .collect();
    let inputs: Vec<String> = xs
        .iter()
        .map(|&x| format!("exp({})", describe(x)))
        .collect();
    let outputs: Vec<f64> = xs.iter().map(|&x| exp(x)).collect();
    check_sweep("exp sweep", &e["sweep"], &inputs, &outputs);
}

#[test]
fn log_matches() {
    let v = load("jsmath.json");
    let l = &v["log"];
    for (&x, &o) in floats(&l["specials"]["x"])
        .iter()
        .zip(&floats(&l["specials"]["out"]))
    {
        check(&format!("log({})", describe(x)), o, log(x));
    }
    let count = int(&l["sweep"]["count"]);
    let mut rng = Rng::from_seed("log-sweep");
    let xs: Vec<f64> = (0..count)
        .map(|i| match i % 3 {
            0 => rng.next() * 1000.0,
            1 => random_bits(&mut rng, 0, 1032),
            _ => 1.0 + (rng.next() - 0.5) * 1e-3,
        })
        .collect();
    let inputs: Vec<String> = xs
        .iter()
        .map(|&x| format!("log({})", describe(x)))
        .collect();
    let outputs: Vec<f64> = xs.iter().map(|&x| log(x)).collect();
    check_sweep("log sweep", &l["sweep"], &inputs, &outputs);
}

// --- map and cards ---------------------------------------------------------

#[test]
fn map_matches() {
    let v = load("map.json");
    let continents = v["continents"].as_array().unwrap();
    assert_eq!(continents.len(), CONTINENTS.len());
    for (c, ours) in continents.iter().zip(&CONTINENTS) {
        assert_eq!(c["id"].as_str().unwrap(), ours.id);
        assert_eq!(
            c["bonus"].as_u64().unwrap() as u32,
            ours.bonus,
            "{}'s bonus",
            ours.id
        );
    }
    let territories = v["territories"].as_array().unwrap();
    assert_eq!(territories.len(), TERRITORIES.len());
    for (i, (t, ours)) in territories.iter().zip(&TERRITORIES).enumerate() {
        assert_eq!(int(&t["index"]), i);
        assert_eq!(t["id"].as_str().unwrap(), ours.id);
        assert_eq!(
            int(&t["continent"]),
            ours.continent,
            "{}'s continent",
            ours.id
        );
        let symbol = match t["symbol"].as_str().unwrap() {
            "infantry" => Symbol::Infantry,
            "cavalry" => Symbol::Cavalry,
            "artillery" => Symbol::Artillery,
            other => panic!("unknown symbol {other}"),
        };
        assert_eq!(symbol, ours.symbol, "{}'s symbol", ours.id);
    }
    for (i, neighbours) in v["adjacency"].as_array().unwrap().iter().enumerate() {
        assert_eq!(
            ints(neighbours),
            ADJACENCY[i],
            "{}'s neighbours",
            TERRITORIES[i].id
        );
    }
}

fn cards(v: &Value) -> Vec<u8> {
    ints(v).into_iter().map(|c| c as u8).collect()
}

#[test]
fn cards_match() {
    let v = load("cards.json");
    assert_eq!(cards(&v["fullDeck"]), FULL_DECK.to_vec());
    for case in v["hands"].as_array().unwrap() {
        let hand = cards(&case["hand"]);
        let sets = sets_in(&hand);
        let expected: Vec<Vec<u8>> = case["sets"].as_array().unwrap().iter().map(cards).collect();
        let got: Vec<Vec<u8>> = sets.iter().map(|s| s.to_vec()).collect();
        assert_eq!(got, expected, "sets in {hand:?}");
        let values: Vec<usize> = sets.iter().map(|s| set_value(s) as usize).collect();
        assert_eq!(values, ints(&case["values"]), "set values in {hand:?}");
    }
    for case in v["isValidSet"].as_array().unwrap() {
        let c = cards(&case["cards"]);
        assert_eq!(is_valid_set(&c), case["valid"].as_bool().unwrap(), "{c:?}");
    }
}

// --- blitz -----------------------------------------------------------------

#[test]
fn fair_fights_and_their_balance_match() {
    let v = load("blitz.json");
    for case in v["fair"].as_array().unwrap() {
        let (a, d) = (int(&case["a"]), int(&case["d"]));
        let fight = fair_fight(a, d);
        check_all(
            &format!("fairFight({a}, {d}).attackerLost"),
            &floats(&case["attackerLost"]),
            &fight.attacker_lost,
        );
        check_all(
            &format!("fairFight({a}, {d}).defenderLost"),
            &floats(&case["defenderLost"]),
            &fight.defender_lost,
        );
        let balanced = balance(&fight);
        let both = [balanced.attacker_lost, balanced.defender_lost].concat();
        check_all(
            &format!("balance(fairFight({a}, {d}))"),
            &floats(&case["balanced"]),
            &both,
        );
    }
}

#[test]
fn balanced_blitzes_match() {
    let v = load("blitz.json");
    let mut never = || -> f64 { panic!("a balanced fight never rolls") };
    for case in v["balanced"].as_array().unwrap() {
        let (a, d) = (int(&case["a"]), int(&case["d"]));
        let fight = crate::blitz::balanced_fight(a, d).expect("balanced");
        if let Some(expected) = case.get("attackerLost") {
            check_all(
                &format!("balancedFight({a}, {d}).attackerLost"),
                &floats(expected),
                &fight.attacker_lost,
            );
            check_all(
                &format!("balancedFight({a}, {d}).defenderLost"),
                &floats(&case["defenderLost"]),
                &fight.defender_lost,
            );
        }
        let both = [fight.attacker_lost.clone(), fight.defender_lost.clone()].concat();
        assert_eq!(
            digest(&both),
            case["digest"].as_str().unwrap(),
            "balancedFight({a}, {d}) differs"
        );
        check(
            &format!("captureChance({a}, {d})"),
            float(&case["capture"]),
            capture_chance(a, d),
        );
        for (r, expected) in floats(&case["r"])
            .iter()
            .zip(case["resolved"].as_array().unwrap())
        {
            let result = resolve_blitz(a, d, *r, &mut never);
            let expected = ints(expected);
            assert_eq!(
                [result.attacker_losses, result.defender_losses],
                [expected[0], expected[1]],
                "resolveBlitz({a}, {d}, {})",
                describe(*r)
            );
        }
    }
}

#[test]
fn rolled_and_estimated_blitzes_match() {
    let v = load("blitz.json");
    let mut rng = Rng::from_seed("blitz-rolled");
    for case in v["rolled"].as_array().unwrap() {
        let (a, d) = (int(&case["a"]), int(&case["d"]));
        let result = resolve_blitz(a, d, 0.5, &mut || rng.next());
        assert_eq!(
            result.attacker_losses,
            int(&case["attackerLosses"]),
            "rolled {a} against {d}"
        );
        assert_eq!(
            result.defender_losses,
            int(&case["defenderLosses"]),
            "rolled {a} against {d}"
        );
    }
    assert_eq!(rng.state() as u64, v["rolledState"].as_u64().unwrap());
    for case in v["estimated"].as_array().unwrap() {
        let (a, d) = (int(&case["a"]), int(&case["d"]));
        check(
            &format!("estimatedWinChance({a}, {d})"),
            float(&case["chance"]),
            estimated_win_chance(a, d),
        );
    }
}

// --- odds ------------------------------------------------------------------

#[test]
fn odds_match() {
    let v = load("odds.json");
    for case in v["roll"].as_array().unwrap() {
        let (a, d) = (int(&case["a"]), int(&case["d"]));
        check_all(
            &format!("rollOdds({a}, {d})"),
            &floats(&case["odds"]),
            roll_odds(a, d),
        );
    }
    for case in v["outcomes"].as_array().unwrap() {
        let (a, d) = (int(&case["a"]), int(&case["d"]));
        let o = battle_outcome(a, d);
        let name = format!("battleOutcome({a}, {d})");
        if let Some(win) = case.get("win") {
            check_all(&format!("{name}.win"), &floats(win), &o.win);
            check_all(&format!("{name}.fail"), &floats(&case["fail"]), &o.fail);
        }
        let both = [o.win.clone(), o.fail.clone()].concat();
        assert_eq!(
            digest(&both),
            case["digest"].as_str().unwrap(),
            "{name} differs"
        );
        check(&format!("{name}.pWin"), float(&case["pWin"]), o.p_win);
        assert_eq!(o.win_from, int(&case["winFrom"]), "{name}.winFrom");
        assert_eq!(o.roll, case["roll"].as_bool().unwrap(), "{name}.roll");
        check(
            &format!("{name}.survivors"),
            float(&case["survivors"]),
            o.survivors,
        );
        check(
            &format!("winProb({a}, {d})"),
            float(&case["winProb"]),
            win_prob(a, d),
        );
        assert_eq!(
            blitz_commit(a, d),
            int(&case["blitzCommit"]),
            "blitzCommit({a}, {d})"
        );
        check(
            &format!("exchange({a}, {d})"),
            float(&case["exchange"]),
            exchange(a, d),
        );
        check(
            &format!("expectedLoss({a}, {d})"),
            float(&case["expectedLoss"]),
            expected_loss(a, d),
        );
    }
    for case in v["runs"].as_array().unwrap() {
        let armies = int(&case["armies"]);
        let defenders = ints(&case["defenders"]);
        let run = if case["via"].as_bool().unwrap() {
            path_run_via(armies, defenders[0], &defenders[1..])
        } else {
            path_run(armies, &defenders)
        };
        let name = format!("pathRun({armies}, {defenders:?})");
        check(
            &format!("{name}.pSuccess"),
            float(&case["pSuccess"]),
            run.p_success,
        );
        check(
            &format!("{name}.arrive"),
            float(&case["arrive"]),
            run.arrive,
        );
        check_all(
            &format!("{name}.stopAt"),
            &floats(&case["stopAt"]),
            &run.stop_at,
        );
    }
}

//! `eval/native/canonical.ts`: the canonical byte layout of a state and of a seat's options, and
//! their hashes, written exactly as the TypeScript writes them, so a game record's hashes prove the
//! two engines move for move. Every field is a 4-byte little-endian int32 (the random source's
//! bits as one).

use crate::engine::{Game, Options, Phase, HAND_MAX, MAX_SEATS};
use crate::map::{territories_in, ADJACENCY, TERRITORY_COUNT};
use sha2::{Digest, Sha256};

pub const STATE_FIELDS: usize = 238;

/// The int32 fields being written.
struct Layout(Vec<i32>);

impl Layout {
    fn int(&mut self, n: i32) {
        self.0.push(n);
    }

    fn flag(&mut self, b: bool) {
        self.0.push(b as i32);
    }

    /// `items`, then −1 up to `length`.
    fn padded(&mut self, items: impl ExactSizeIterator<Item = i32>, length: usize) {
        assert!(
            items.len() <= length,
            "{} entries past {length}",
            items.len()
        );
        let n = items.len();
        self.0.extend(items);
        self.0.extend(std::iter::repeat_n(-1, length - n));
    }

    fn territories(&mut self, mask: u64) {
        self.0
            .extend((0..TERRITORY_COUNT).map(|t| ((mask >> t) & 1) as i32));
    }

    fn bytes(&self) -> Vec<u8> {
        self.0.iter().flat_map(|v| v.to_le_bytes()).collect()
    }
}

fn phase_code(phase: Phase) -> i32 {
    match phase {
        Phase::Reinforce => 0,
        Phase::Attack => 1,
        Phase::Fortify => 2,
        Phase::GameOver => 3,
    }
}

/// The state's 238 fields: players; rng; turnOrder[6]; owner[42]; armies[42]; per seat handLen and
/// hand[12]; deckLen; deck[44]; trade count; eliminated[6]; turn; round; active; phase; the
/// reinforce record (present, armiesToPlace, placedAny, afterElimination); the occupying record
/// (present, from, to, min, max, eliminating); capturedThisTurn; winner.
pub fn state_fields(g: &Game) -> Vec<i32> {
    let mut f = Layout(Vec::with_capacity(STATE_FIELDS));
    let players = g.players as usize;
    f.int(players as i32);
    f.int(g.rng as i32);
    f.padded(g.turn_order().iter().map(|&s| s as i32), MAX_SEATS);
    f.0.extend(g.owner.iter().map(|&o| o as i32));
    f.0.extend(g.armies.iter().copied());
    for seat in 0..MAX_SEATS {
        let hand = if seat < players {
            &g.hands[seat][..]
        } else {
            &[]
        };
        f.int(hand.len() as i32);
        f.padded(hand.iter().map(|&c| c as i32), HAND_MAX);
    }
    f.int(g.deck.len() as i32);
    f.padded(g.deck.iter().map(|&c| c as i32), 44);
    f.int(g.trades as i32);
    for seat in 0..MAX_SEATS {
        f.flag(seat < players && g.eliminated[seat]);
    }
    f.int(g.turn as i32);
    f.int(g.round as i32);
    f.int(g.active as i32);
    f.int(phase_code(g.phase));
    let r = g.reinforce;
    f.flag(r.is_some());
    f.int(r.map_or(0, |r| r.armies_to_place));
    f.flag(r.is_some_and(|r| r.placed_any));
    f.flag(r.is_some_and(|r| r.after_elimination));
    let o = g.occupying;
    f.flag(o.is_some());
    f.int(o.map_or(-1, |o| o.from as i32));
    f.int(o.map_or(-1, |o| o.to as i32));
    f.int(o.map_or(0, |o| o.min));
    f.int(o.map_or(0, |o| o.max));
    f.int(o.and_then(|o| o.eliminating).map_or(-1, |s| s as i32));
    f.flag(g.captured_this_turn);
    f.int(g.winner.map_or(-1, |s| s as i32));
    assert_eq!(f.0.len(), STATE_FIELDS);
    f.0
}

/// The names of the state's fields, for a readable divergence report.
pub fn state_field_name(i: usize) -> String {
    const TAIL: [&str; 21] = [
        "trades",
        "eliminated[0]",
        "eliminated[1]",
        "eliminated[2]",
        "eliminated[3]",
        "eliminated[4]",
        "eliminated[5]",
        "turn",
        "round",
        "active",
        "phase",
        "reinforce",
        "reinforce.armiesToPlace",
        "reinforce.placedAny",
        "reinforce.afterElimination",
        "occupying",
        "occupying.from",
        "occupying.to",
        "occupying.min",
        "occupying.max",
        "occupying.eliminating",
    ];
    match i {
        0 => "players".into(),
        1 => "rng".into(),
        2..=7 => format!("turnOrder[{}]", i - 2),
        8..=49 => format!("owner[{}]", i - 8),
        50..=91 => format!("armies[{}]", i - 50),
        92..=169 => {
            let (seat, k) = ((i - 92) / 13, (i - 92) % 13);
            if k == 0 {
                format!("handLen[{seat}]")
            } else {
                format!("hand[{seat}][{}]", k - 1)
            }
        }
        170 => "deckLen".into(),
        171..=214 => format!("deck[{}]", i - 171),
        215..=235 => TAIL[i - 215].into(),
        236 => "capturedThisTurn".into(),
        237 => "winner".into(),
        _ => format!("field {i}"),
    }
}

/// The options' fields: a kind (0 reinforce, 1 attack, 2 occupy, 3 fortify), then by kind.
/// Reinforce: armiesToPlace, mayPlace, mustTrade, own[42], setCount and each set's three cards,
/// bonus[42]. Attack: maxDice over the 166 directed borders, 0 where not legal. Occupy: from, to,
/// min, max. Fortify: maxArmies[42 × 42] by [from][to], 0 where not legal.
pub fn options_fields(options: &Options) -> Vec<i32> {
    let mut f = Layout(Vec::new());
    match options {
        Options::Reinforce(r) => {
            f.int(0);
            f.int(r.armies_to_place);
            f.flag(r.may_place);
            f.flag(r.must_trade);
            f.territories(r.own);
            f.int(r.sets.len() as i32);
            for set in r.sets.iter() {
                f.0.extend(set.iter().map(|&c| c as i32));
            }
            let bonus = r.bonus_territories.iter().fold(0u64, |m, &t| m | 1 << t);
            f.territories(bonus);
        }
        Options::Attack(a) => {
            f.int(1);
            let mut dice = [[0i32; 6]; TERRITORY_COUNT];
            for attack in a.attacks.iter() {
                let k = ADJACENCY[attack.from as usize]
                    .iter()
                    .position(|&n| n == attack.to as usize)
                    .expect("an attack crosses a border");
                dice[attack.from as usize][k] = attack.max_dice as i32;
            }
            for (t, neighbours) in ADJACENCY.iter().enumerate() {
                f.0.extend(&dice[t][..neighbours.len()]);
            }
        }
        &Options::Occupy { from, to, min, max } => {
            f.int(2);
            f.int(from as i32);
            f.int(to as i32);
            f.int(min);
            f.int(max);
        }
        Options::Fortify(fo) => {
            f.int(3);
            let mut armies = vec![0i32; TERRITORY_COUNT * TERRITORY_COUNT];
            for s in fo.sources.iter() {
                for to in territories_in(s.reach) {
                    armies[s.from as usize * TERRITORY_COUNT + to] = s.max_armies;
                }
            }
            f.0.extend(armies);
        }
    }
    f.0
}

pub fn fields_bytes(fields: &[i32]) -> Vec<u8> {
    Layout(fields.to_vec()).bytes()
}

/// SHA-256 of a layout, the first 16 lowercase hex characters.
pub fn hash_fields(fields: &[i32]) -> String {
    let digest = Sha256::digest(fields_bytes(fields));
    digest[..8].iter().map(|b| format!("{b:02x}")).collect()
}

pub fn state_hash(g: &Game) -> String {
    hash_fields(&state_fields(g))
}

pub fn options_hash(options: &Options) -> String {
    hash_fields(&options_fields(options))
}

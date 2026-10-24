//! `eval/runner.ts`'s game runner in Rust: one seeded game, a bot per seat. It is the only code that
//! holds the game; each bot is given only what its seat may see and a seed of its own, built
//! exactly as the TypeScript builds them, so a game is a pure function of its seed and seating.

use crate::bot::{Bot, BotInput};
use crate::engine::{new_game, Event, EventKind, Game, Phase, Seat, Trade};
use crate::jsmath::to_base36;
use crate::rng::Rng;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GameRecord {
    /// The winning seat, or None when the turn cap ended the game: a draw.
    pub winner: Option<Seat>,
    /// Each seat's finishing place, 1 for the winner.
    pub places: Vec<u32>,
    /// Player-turns played (the engine's turn count, the cap when capped).
    pub turns: u32,
    /// Moves the bots made.
    pub decisions: u32,
}

/// Finishing places as the harness counts them: a seat eliminated while k seats were in the game
/// finishes k-th; the survivors of a capped game share 1st.
pub struct Places {
    places: Vec<u32>,
    in_game: u32,
}

impl Places {
    pub fn new(players: usize) -> Places {
        Places {
            places: vec![1; players],
            in_game: players as u32,
        }
    }

    pub fn record(&mut self, events: &[Event]) {
        for event in events {
            if let EventKind::Eliminated { seat, .. } = event.kind {
                self.places[seat as usize] = self.in_game;
                self.in_game -= 1;
            }
        }
    }

    pub fn places(&self) -> &[u32] {
        &self.places
    }
}

/// Whether the game stops before its next decision, and how: the winner (None for a draw) and the
/// turns counted. The cap is checked before every decision, so a game stops once its turn passes
/// `max_turns` (`never-ending`: the cap is the harness's, not a rule).
pub fn stopped(game: &Game, max_turns: u32) -> Option<(Option<Seat>, u32)> {
    if game.phase == Phase::GameOver {
        return Some((game.winner, game.turn));
    }
    (game.turn > max_turns).then_some((None, max_turns))
}

/// The bots' own random stream for a game: derived from its seed through a hash, so nothing about
/// the game's dice or deck can be read from it. Decision `n`'s seed is `"<this>/<n>"`.
pub fn bots_seed(seed: &str) -> String {
    to_base36(Rng::from_seed(&format!("bots|{seed}")).state())
}

/// Every seat's redacted history, grown move by move, and the public trades for views.
struct Histories {
    seats: Vec<Vec<Event>>,
    latest: Vec<usize>,
    trades: Vec<Trade>,
}

impl Histories {
    fn record(&mut self, events: &[Event]) {
        for (seat, history) in self.seats.iter_mut().enumerate() {
            self.latest[seat] = history.len();
            history.extend(events.iter().map(|e| e.redacted(Some(seat as Seat))));
        }
        for event in events {
            if let EventKind::Traded { seat, cards, .. } = event.kind {
                self.trades.push(Trade { seat, cards });
            }
        }
    }
}

/// Plays one game to its end or the turn cap. A bot's illegal move is an error: a bug in the bot,
/// never a move to be quietly replaced.
pub fn play_game(seed: &str, bots: &[&dyn Bot], max_turns: u32) -> Result<GameRecord, String> {
    let players = bots.len();
    if !(3..=6).contains(&players) {
        return Err(format!("Risk is for 3 to 6 players, not {players}"));
    }
    let (mut game, events) = new_game(players, seed);
    let mut histories = Histories {
        seats: vec![Vec::new(); players],
        latest: vec![0; players],
        trades: Vec::new(),
    };
    histories.record(&events);
    let humans = vec![false; players];
    let bots_seed = bots_seed(seed);
    let mut places = Places::new(players);

    for decision in 0u32.. {
        if let Some((winner, turns)) = stopped(&game, max_turns) {
            return Ok(GameRecord {
                winner,
                places: places.places().to_vec(),
                turns,
                decisions: decision,
            });
        }
        let seat = game.active;
        let view = game.view(Some(seat), &histories.trades);
        let options = game.options(seat).ok_or_else(|| {
            format!(
                "seat {seat} is to move but has no options ({:?})",
                game.phase
            )
        })?;
        let history = &histories.seats[seat as usize];
        let decision_seed = format!("{bots_seed}/{decision}");
        let input = BotInput {
            seat,
            view: &view,
            options: &options,
            events: &history[histories.latest[seat as usize]..],
            history,
            humans: &humans,
            seed: &decision_seed,
        };
        let mv = bots[seat as usize].decide(&input);
        let events = game.apply(seat, mv).map_err(|reason| {
            format!("seat {seat}'s bot made an illegal move ({reason}): {mv:?}")
        })?;
        places.record(&events);
        histories.record(&events);
    }
    unreachable!("a game stops at its turn cap")
}

// ---------------------------------------------------------------------------------------------
// Games as the pool plays them: a spec names the bots by label, the result is compact.
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskGameSpec {
    /// Global position in the stream, so results map back whichever worker ran it.
    pub index: u64,
    pub seed: String,
    /// The bot label at each seat.
    pub labels: Vec<String>,
    pub max_turns: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RiskGameResult {
    pub index: u64,
    pub seed: String,
    pub labels: Vec<String>,
    pub winner: Option<Seat>,
    pub places: Vec<u32>,
    pub turns: u32,
    pub decisions: u32,
    /// Set only when the game failed (a bot's illegal move, an unknown label, an engine panic):
    /// the game is excluded from every tally and surfaced as a red flag.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
}

/// Plays a spec, its labels resolved to bots by `resolve` (the registry, unless a test brings
/// bots of its own).
pub fn run_spec(
    spec: &RiskGameSpec,
    resolve: impl Fn(&str) -> Option<Box<dyn Bot>>,
) -> RiskGameResult {
    let played = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let bots = spec
            .labels
            .iter()
            .map(|label| resolve(label).ok_or_else(|| format!("no native bot \"{label}\"")))
            .collect::<Result<Vec<_>, _>>()?;
        let seated: Vec<&dyn Bot> = bots.iter().map(|b| b.as_ref()).collect();
        play_game(&spec.seed, &seated, spec.max_turns)
    }));
    // One broken game must not take the batch with it: it comes back as an error.
    let outcome = played.unwrap_or_else(|panic| {
        let message = panic
            .downcast_ref::<String>()
            .cloned()
            .or_else(|| panic.downcast_ref::<&str>().map(|s| s.to_string()))
            .unwrap_or_else(|| "the game panicked".into());
        Err(format!("panic: {message}"))
    });
    let (record, error) = match outcome {
        Ok(record) => (record, None),
        Err(e) => (
            GameRecord {
                winner: None,
                places: Vec::new(),
                turns: 0,
                decisions: 0,
            },
            Some(e),
        ),
    };
    RiskGameResult {
        index: spec.index,
        seed: spec.seed.clone(),
        labels: spec.labels.clone(),
        winner: record.winner,
        places: record.places,
        turns: record.turns,
        decisions: record.decisions,
        error,
    }
}

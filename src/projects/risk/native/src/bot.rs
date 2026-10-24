//! The seam every native bot plays through, `bots/bot.ts`'s in Rust: a bot is a pure function from
//! what its seat may legally know to a move. It is given the seat's view, its options and the
//! game's public history as that seat may see it, never the game, so hidden information is out of
//! its reach by construction. What a bot remembers it reads back from the history, so a bot keeps
//! no state of its own.

use crate::engine::{Event, Move, Options, Seat, View};

pub struct BotInput<'a> {
    pub seat: Seat,
    pub view: &'a View,
    pub options: &'a Options,
    /// The latest move's events, redacted for this seat: the tail of `history`.
    pub events: &'a [Event],
    /// Every event since the game began, oldest first, redacted for this seat.
    pub history: &'a [Event],
    /// Per seat, whether a person plays it. Public: every table shows it.
    pub humans: &'a [bool],
    /// For the bot's own random choices: `"<bots seed>/<decision>"`, never the game's seed.
    pub seed: &'a str,
}

pub trait Bot {
    fn decide(&self, input: &BotInput) -> Move;
}

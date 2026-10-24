//! The native bots, seated by label (`bots/index.ts`'s registry in Rust).

pub mod gd;
mod greedy;
pub mod history;
mod random;

pub use gd::{GdBot, Persona};
pub use greedy::GreedyBot;
pub use random::RandomBot;

use crate::bot::Bot;

/// The bot a label names, or None when no native bot has that label.
pub fn bot(label: &str) -> Option<Box<dyn Bot>> {
    let gd = |persona| Some(Box::new(GdBot { persona }) as Box<dyn Bot>);
    match label {
        "random" => Some(Box::new(RandomBot)),
        "greedy" => Some(Box::new(GreedyBot)),
        "gd-defensive" => gd(Persona::Defensive),
        "gd-continental" => gd(Persona::Continental),
        "gd-aggressive" => gd(Persona::Aggressive),
        "gd-stacker" => gd(Persona::Stacker),
        _ => None,
    }
}

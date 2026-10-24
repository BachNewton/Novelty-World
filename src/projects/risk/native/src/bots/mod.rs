//! The native bots, seated by label (`bots/index.ts`'s registry in Rust).

mod random;

pub use random::RandomBot;

use crate::bot::Bot;

/// The bot a label names, or None when no native bot has that label.
pub fn bot(label: &str) -> Option<Box<dyn Bot>> {
    match label {
        "random" => Some(Box::new(RandomBot)),
        _ => None,
    }
}

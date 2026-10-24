//! The native bots, seated by label (`bots/index.ts`'s registry in Rust).

pub mod gd;
mod greedy;
pub mod history;
pub mod native_v1;
mod random;

pub use gd::{GdBot, Persona};
pub use greedy::GreedyBot;
pub use random::RandomBot;

use crate::bot::Bot;

/// Builds a seated bot.
type Build = fn() -> Box<dyn Bot>;

/// Every native bot, by label: the registry `bot` reads and `risk-native bots` lists.
const REGISTRY: &[(&str, Build)] = &[
    ("random", || Box::new(RandomBot)),
    ("greedy", || Box::new(GreedyBot)),
    ("gd-defensive", || {
        Box::new(GdBot {
            persona: Persona::Defensive,
        })
    }),
    ("gd-continental", || {
        Box::new(GdBot {
            persona: Persona::Continental,
        })
    }),
    ("gd-aggressive", || {
        Box::new(GdBot {
            persona: Persona::Aggressive,
        })
    }),
    ("gd-stacker", || {
        Box::new(GdBot {
            persona: Persona::Stacker,
        })
    }),
    ("native-v1", || {
        Box::new(native_v1::NativeV1 {
            params: native_v1::NATIVE_V1,
        })
    }),
];

/// The bot a label names, or None when no native bot has that label.
pub fn bot(label: &str) -> Option<Box<dyn Bot>> {
    REGISTRY
        .iter()
        .find(|(name, _)| *name == label)
        .map(|(_, build)| build())
}

/// Every native bot's label, in the registry's order.
pub fn labels() -> impl Iterator<Item = &'static str> {
    REGISTRY.iter().map(|(name, _)| *name)
}

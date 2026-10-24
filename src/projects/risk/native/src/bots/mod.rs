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

/// The bot a label names, or None when no native bot has that label. native-v1 also takes
/// rule-v6.1's settings as a tuned label: `native-v1~{"power":"armies","armyRounds":10}`.
pub fn bot(label: &str) -> Option<Box<dyn Bot>> {
    if let Some(json) = label.strip_prefix("native-v1~") {
        // A malformed tuned label is a mistake in the run's arguments: say what is wrong with it.
        return Some(tuned_native_v1(json).unwrap_or_else(|e| panic!("{e}")));
    }
    REGISTRY
        .iter()
        .find(|(name, _)| *name == label)
        .map(|(_, build)| build())
}

/// Every native bot's label, in the registry's order.
pub fn labels() -> impl Iterator<Item = &'static str> {
    REGISTRY.iter().map(|(name, _)| *name)
}

/// native-v1 on the rule-v6.1 settings a tuned label's JSON names.
pub fn tuned_native_v1(json: &str) -> Result<Box<dyn Bot>, String> {
    let knobs = native_v1::Knobs::parse(json)?;
    let base = native_v1::NATIVE_V1;
    Ok(Box::new(native_v1::NativeV1 {
        params: native_v1::Params {
            knobs,
            small_table_seats: match knobs.small_table_seats {
                0 => base.small_table_seats,
                n => n,
            },
            ..base
        },
    }))
}

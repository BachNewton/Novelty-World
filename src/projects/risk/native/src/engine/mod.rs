//! Risk's native engine, designed for speed and held to `RULES.md` (`ideas/native-port.md`, "The
//! engine"). It keeps three things the same as the reference engine: the random source and the
//! order of its draws, Balanced Blitz, and the contract's shapes (view, options, moves, events).

mod events;
pub mod invariants;
mod options;
mod rules;
mod state;
mod view;

pub use events::{redact, ContinentBonus, Event, EventKind, EventSink, Quiet, TradeBonus};
pub use options::{
    fortify_destinations, Attack, AttackOptions, FortifyMove, FortifyOptions, FortifySource,
    Options, ReinforceOptions, EDGE_COUNT,
};
pub use rules::{pair_dice, Move, Refusal};
pub use state::{
    first_turn_bonus, reinforcements, starting_armies, Deck, Game, Hand, Occupying, Phase,
    Reinforce, Reinforcements, Seat, Territory, DECK_SIZE, HAND_MAX, MAX_SEATS,
};
pub use view::{OccupyingView, SeatView, TerritoryView, Trade, View};

/// A new game of `players` (3 to 6) from `seed`, and its setup's events.
pub fn new_game(players: usize, seed: &str) -> (Game, Vec<Event>) {
    let mut events = Vec::new();
    let game = Game::new(players, seed, &mut events);
    (game, events)
}

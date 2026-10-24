//! Risk's native engine and bots (`ideas/native-port.md`): an engine designed for speed and held
//! to `RULES.md`, proven by its rules suite and by lockstep replay of recorded TypeScript games.

pub mod blitz;
pub mod bot;
pub mod bots;
pub mod canonical;
pub mod cards;
pub mod engine;
pub mod jsmath;
pub mod list;
pub mod lockstep;
pub mod map;
pub mod odds;
pub mod record;
pub mod rng;
pub mod runner;
pub mod serve;

#[cfg(test)]
mod vectors;

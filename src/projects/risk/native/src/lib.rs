//! Risk's engine and rule bots, ported from the TypeScript bit for bit (`ideas/native-port.md`).

pub mod blitz;
pub mod cards;
pub mod jsmath;
pub mod map;
pub mod odds;
pub mod rng;

#[cfg(test)]
mod vectors;

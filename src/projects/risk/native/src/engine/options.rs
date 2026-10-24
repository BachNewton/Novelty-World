//! The legal moves for one seat, grouped as `contract.ts`'s `Options`: every move these allow is
//! accepted by `apply`, and no other move is. `EndAttack` is allowed whenever the kind is attack,
//! and `EndTurn` whenever it is fortify. Lists come in the reference engine's order, so a bot
//! ported from TypeScript that takes "the first best" takes the same one.

use super::state::{Game, Phase, Seat, Territory};
use crate::cards::{sets_in, Card, MAX_SETS};
use crate::list::List;
use crate::map::{component, territories_in, ADJACENCY, ADJACENT, TERRITORY_COUNT};

/// The board's directed borders.
pub const EDGE_COUNT: usize = 166;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Options {
    Reinforce(ReinforceOptions),
    Attack(AttackOptions),
    Occupy {
        from: Territory,
        to: Territory,
        min: i32,
        max: i32,
    },
    Fortify(FortifyOptions),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ReinforceOptions {
    pub armies_to_place: i32,
    /// False while a trade is required (`CARDS-5`, `ELIM-3`): placing must wait for it.
    pub may_place: bool,
    pub must_trade: bool,
    /// The seat's territories, any of which may take armies.
    pub own: u64,
    /// The sets the seat may trade now, each in hand order, in `cards::sets_in`'s order.
    pub sets: List<[Card; 3], MAX_SETS>,
    /// Owned territories pictured on cards in hand, in hand order: a trade's `bonus` must be one
    /// of its own cards' territories in this list, and is required when the set has two or more.
    pub bonus_territories: List<Territory, 12>,
}

impl ReinforceOptions {
    pub fn own_territories(&self) -> impl Iterator<Item = Territory> {
        territories_in(self.own).map(|t| t as Territory)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Attack {
    pub from: Territory,
    pub to: Territory,
    pub max_dice: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AttackOptions {
    /// In canonical edge order: each territory in map order, each neighbour in `ADJACENCY` order.
    pub attacks: List<Attack, EDGE_COUNT>,
}

/// A territory armies may march from, and everywhere they may reach (`FORT-1`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct FortifySource {
    pub from: Territory,
    pub max_armies: i32,
    pub reach: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct FortifyMove {
    pub from: Territory,
    pub to: Territory,
    pub max_armies: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FortifyOptions {
    pub own: u64,
    /// In map order.
    pub sources: List<FortifySource, TERRITORY_COUNT>,
}

impl FortifyOptions {
    /// Every legal (from, to) with its most armies, in the reference engine's order: sources in
    /// map order, each one's destinations in the order its search reaches them.
    pub fn moves(&self) -> impl Iterator<Item = FortifyMove> + '_ {
        self.sources.iter().flat_map(move |s| {
            fortify_destinations(self.own, s.from)
                .into_iter()
                .map(move |to| FortifyMove {
                    from: s.from,
                    to,
                    max_armies: s.max_armies,
                })
        })
    }
}

/// `FORT-1`: the territories joined to `from` through `own`, in the order a depth-first search
/// from `from` first reaches them (the reference engine lists them so).
pub fn fortify_destinations(own: u64, from: Territory) -> List<Territory, TERRITORY_COUNT> {
    let mut reached = 1u64 << from;
    let mut order = List::new();
    let mut stack: List<Territory, TERRITORY_COUNT> = List::from_slice(&[from]);
    while let Some(&at) = stack.last() {
        stack.remove(stack.len() - 1);
        for &next in ADJACENCY[at as usize] {
            let bit = 1u64 << next;
            if own & bit != 0 && reached & bit == 0 {
                reached |= bit;
                order.push(next as Territory);
                stack.push(next as Territory);
            }
        }
    }
    order
}

impl Game {
    /// The legal moves for `seat` now, or None when it has nothing to do.
    pub fn options(&self, seat: Seat) -> Option<Options> {
        if self.phase == Phase::GameOver || seat != self.active {
            return None;
        }
        let own = self.owned[seat as usize];
        Some(match self.phase {
            Phase::Reinforce => {
                let r = self
                    .reinforce
                    .expect("a reinforce phase has its bookkeeping");
                let hand = &self.hands[seat as usize];
                let must_trade = self.must_trade();
                Options::Reinforce(ReinforceOptions {
                    armies_to_place: r.armies_to_place,
                    may_place: !must_trade,
                    must_trade,
                    own,
                    sets: if self.may_trade() {
                        sets_in(hand)
                    } else {
                        List::new()
                    },
                    bonus_territories: self.bonus_territories(hand),
                })
            }
            Phase::Attack => match self.occupying {
                Some(o) => Options::Occupy {
                    from: o.from,
                    to: o.to,
                    min: o.min,
                    max: o.max,
                },
                None => {
                    let mut attacks = List::new();
                    for from in territories_in(own) {
                        let armies = self.armies[from];
                        if armies < 2 || ADJACENT[from] & !own == 0 {
                            continue;
                        }
                        let max_dice = 3.min(armies - 1) as u8;
                        for &to in ADJACENCY[from] {
                            if own & (1 << to) == 0 {
                                attacks.push(Attack {
                                    from: from as Territory,
                                    to: to as Territory,
                                    max_dice,
                                });
                            }
                        }
                    }
                    Options::Attack(AttackOptions { attacks })
                }
            },
            Phase::Fortify => {
                let mut sources = List::new();
                let mut components = [0u64; TERRITORY_COUNT];
                let mut seen = 0u64;
                for from in territories_in(own) {
                    if seen & (1 << from) == 0 {
                        let joined = component(own, from);
                        for t in territories_in(joined) {
                            components[t] = joined;
                        }
                        seen |= joined;
                    }
                    let reach = components[from] & !(1 << from);
                    if self.armies[from] >= 2 && reach != 0 {
                        sources.push(FortifySource {
                            from: from as Territory,
                            max_armies: self.armies[from] - 1,
                            reach,
                        });
                    }
                }
                Options::Fortify(FortifyOptions { own, sources })
            }
            Phase::GameOver => unreachable!("checked above"),
        })
    }
}

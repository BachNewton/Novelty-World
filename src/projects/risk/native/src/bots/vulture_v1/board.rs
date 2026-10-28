//! vulture-v1's reading of the board: its seat's view as masks and counts, the names its rules use
//! (the base, its gates and their guards, the weakest seat, the leader, the head), and the two
//! things it costs with the crate's odds: a greedy sweep and a kill.

use super::SURE;
use crate::blitz::capture_chance;
use crate::engine::{Event, EventKind, Seat, Territory, View, MAX_SEATS};
use crate::map::{
    territories_in, ADJACENT, AFRICA, ALL_TERRITORIES, AUSTRALIA, CONTINENTS, CONTINENT_MASKS,
    SOUTH_AMERICA, TERRITORY_COUNT,
};
use crate::odds::{expected_loss, path_run};

/// The cheap continents he took for his base: those worth at most 3.
pub(super) const BASES: [usize; 3] = [SOUTH_AMERICA, AFRICA, AUSTRALIA];

#[derive(Clone, Copy, Debug)]
pub(super) struct Board {
    pub me: Seat,
    pub armies: [i32; TERRITORY_COUNT],
    /// Each seat's territories.
    pub owned: [u64; MAX_SEATS],
    pub players: usize,
    pub alive: [bool; MAX_SEATS],
    pub hand: [u8; MAX_SEATS],
}

/// The territories beside any in `mask`.
pub(super) fn beside(mask: u64) -> u64 {
    territories_in(mask).fold(0, |m, t| m | ADJACENT[t])
}

fn bit(t: usize) -> u64 {
    1 << t
}

/// The chance a blitz of `attackers` captures a territory of `defenders`.
pub(super) fn chance(attackers: i32, defenders: i32) -> f64 {
    if attackers < 1 {
        return 0.0;
    }
    capture_chance(attackers as usize, defenders as usize)
}

impl Board {
    pub fn from_view(view: &View, me: Seat) -> Board {
        let players = view.seats.len();
        let mut alive = [false; MAX_SEATS];
        let mut hand = [0; MAX_SEATS];
        for s in view.seats.iter() {
            // A seat whose last territory was just taken is out once the move-in is made.
            alive[s.seat as usize] = !s.eliminated && view.owned[s.seat as usize] != 0;
            hand[s.seat as usize] = s.hand_size;
        }
        Board {
            me,
            armies: std::array::from_fn(|t| view.territories[t].armies),
            owned: view.owned,
            players,
            alive,
            hand,
        }
    }

    pub fn mine(&self) -> u64 {
        self.owned[self.me as usize]
    }

    pub fn enemy(&self) -> u64 {
        ALL_TERRITORIES & !self.mine()
    }

    pub fn is_mine(&self, t: usize) -> bool {
        self.mine() & bit(t) != 0
    }

    fn opponents(&self) -> impl Iterator<Item = usize> + '_ {
        (0..self.players).filter(move |&s| s != self.me as usize && self.alive[s])
    }

    pub fn income(&self, seat: usize) -> u32 {
        let owned = self.owned[seat];
        let held: u32 = CONTINENTS
            .iter()
            .zip(CONTINENT_MASKS)
            .filter(|(_, m)| owned & m == *m)
            .map(|(c, _)| c.bonus)
            .sum();
        (owned.count_ones() / 3).max(3) + held
    }

    /// The opponent with the most income, the first in seat order among equals.
    pub fn leader(&self) -> Option<usize> {
        self.opponents()
            .fold(None, |best: Option<usize>, s| match best {
                Some(b) if self.income(b) >= self.income(s) => Some(b),
                _ => Some(s),
            })
    }

    /// The opponent with the fewest territories; the most cards, then the fewest armies, break a tie.
    pub fn weakest(&self) -> Option<usize> {
        let key = |s: usize| {
            let armies: i32 = territories_in(self.owned[s]).map(|t| self.armies[t]).sum();
            (
                self.owned[s].count_ones(),
                std::cmp::Reverse(self.hand[s]),
                armies,
            )
        };
        self.opponents().min_by_key(|&s| key(s))
    }

    pub fn alive_opponents(&self) -> usize {
        self.opponents().count()
    }

    /// The leader's whole continents.
    pub fn leader_land(&self) -> u64 {
        let Some(l) = self.leader() else { return 0 };
        CONTINENT_MASKS
            .iter()
            .filter(|&&m| self.owned[l] & m == m)
            .fold(0, |a, m| a | m)
    }

    /// The bases held whole.
    pub fn held_bases(&self) -> u64 {
        BASES
            .iter()
            .map(|&c| CONTINENT_MASKS[c])
            .filter(|&m| self.mine() & m == m)
            .fold(0, |a, m| a | m)
    }

    /// The held bases' territories that border another continent.
    pub fn gates(&self) -> u64 {
        BASES
            .iter()
            .map(|&c| CONTINENT_MASKS[c])
            .filter(|&m| self.mine() & m == m)
            .fold(0, |a, m| {
                a | territories_in(m)
                    .filter(|&t| ADJACENT[t] & !m != 0)
                    .fold(0, |g, t| g | bit(t))
            })
    }

    /// A gate's guard: the biggest enemy stack beside it; 0 off a gate.
    pub fn guard(&self, t: usize) -> i32 {
        if self.gates() & bit(t) == 0 {
            return 0;
        }
        territories_in(ADJACENT[t] & self.enemy())
            .map(|n| self.armies[n])
            .max()
            .unwrap_or(0)
    }

    /// The armies a territory of mine keeps: its guard on a gate, else 1.
    pub fn keep(&self, t: usize) -> i32 {
        self.guard(t).max(1)
    }

    /// The armies a territory of mine may attack or march with.
    pub fn spare(&self, t: usize) -> i32 {
        self.armies[t] - self.keep(t)
    }

    /// The gate most short of its guard, and by how much.
    pub fn short_gate(&self) -> Option<(usize, i32)> {
        territories_in(self.gates())
            .map(|g| (g, self.guard(g) - self.armies[g]))
            .filter(|&(_, short)| short > 0)
            .fold(None, |best, x| match best {
                Some(b) if b.1 >= x.1 => Some(b),
                _ => Some(x),
            })
    }

    /// Holding no base: the base whose enemy land holds the fewest armies, among those I have land
    /// in or beside.
    pub fn target_base(&self) -> Option<usize> {
        if self.held_bases() != 0 {
            return None;
        }
        let near = self.mine() | beside(self.mine());
        BASES
            .iter()
            .copied()
            .filter(|&c| CONTINENT_MASKS[c] & near != 0)
            .min_by_key(|&c| {
                territories_in(CONTINENT_MASKS[c] & self.enemy())
                    .map(|t| self.armies[t])
                    .sum::<i32>()
            })
    }

    /// Home: the bases held, or holding none, the base it goes for.
    pub fn home(&self) -> u64 {
        match self.held_bases() {
            0 => self.target_base().map_or(0, |c| CONTINENT_MASKS[c]),
            held => held,
        }
    }

    /// Steps from home to every territory (all 0 with no home).
    pub fn steps_home(&self) -> [u32; TERRITORY_COUNT] {
        match self.home() {
            0 => [0; TERRITORY_COUNT],
            home => Board::distance_from(home),
        }
    }

    /// How many territories a stack of `attackers` on `from` takes surely, always going on through
    /// the thinnest enemy territory beside it and moving everything in.
    pub fn sweep_length(&self, from: usize, attackers: i32) -> u32 {
        let mut taken = 0u64;
        let mut head = from;
        let mut a = attackers;
        let mut n = 0;
        while let Some(t) = self.thinnest(ADJACENT[head] & self.enemy() & !taken) {
            let d = self.armies[t];
            if chance(a, d) < SURE {
                break;
            }
            let survivors = (a as f64 - expected_loss(a as usize, d as usize)).round() as i32;
            a = survivors - 1;
            taken |= bit(t);
            head = t;
            n += 1;
        }
        n
    }

    /// The territory of `mask` with the fewest armies, the first in map order among equals.
    pub fn thinnest(&self, mask: u64) -> Option<usize> {
        territories_in(mask).min_by_key(|&t| self.armies[t])
    }

    /// The chance of killing `victim` this turn, and its first step: the victim's land covered by
    /// walks from my stacks, the stack with most to spare beside what is left walking the longest
    /// chain it can, each walk's chance the crate's path odds, the chances multiplied. `extra`
    /// adds armies to one territory first (the turn's placement).
    pub fn kill(&self, victim: usize, extra: Option<(usize, i32)>) -> Option<(f64, usize, usize)> {
        let mut b = *self;
        if let Some((t, n)) = extra {
            b.armies[t] += n;
        }
        let mut remaining = b.owned[victim];
        let mut used = 0u64;
        let mut p = 1.0;
        let mut first = None;
        while remaining != 0 {
            let launchers = b.mine() & !used & beside(remaining);
            let launcher = territories_in(launchers)
                .filter(|&t| b.spare(t) >= 1)
                .max_by_key(|&t| (b.spare(t), std::cmp::Reverse(t)))?;
            // Into the end of a chain first, so the walk can run along it.
            let open = |t: usize, walked: u64| (ADJACENT[t] & remaining & !walked).count_ones();
            let entry = territories_in(ADJACENT[launcher] & remaining)
                .min_by_key(|&t| (open(t, bit(t)), b.armies[t]))
                .expect("a launcher borders the land left");
            let mut walked = bit(entry);
            let mut defenders = vec![b.armies[entry] as usize];
            let mut at = entry;
            while let Some(next) = territories_in(ADJACENT[at] & remaining & !walked)
                .min_by_key(|&t| (open(t, walked | bit(t)), b.armies[t]))
            {
                walked |= bit(next);
                defenders.push(b.armies[next] as usize);
                at = next;
            }
            p *= path_run(b.spare(launcher) as usize + 1, &defenders).p_success;
            first.get_or_insert((launcher, entry));
            remaining &= !walked;
            used |= bit(launcher);
        }
        first.map(|(from, to)| (p, from, to))
    }

    /// BFS steps from `mask` to every territory, over the whole map.
    pub fn distance_from(mask: u64) -> [u32; TERRITORY_COUNT] {
        let mut dist = [u32::MAX; TERRITORY_COUNT];
        let mut reached = mask;
        let mut frontier = mask;
        let mut d = 0;
        while frontier != 0 {
            for t in territories_in(frontier) {
                dist[t] = d;
            }
            frontier = beside(frontier) & !reached;
            reached |= frontier;
            d += 1;
        }
        dist
    }
}

/// The turn so far, as the seat's history shows it.
#[derive(Clone, Debug, Default)]
pub(super) struct Turn {
    /// Where the turn's armies went, first first.
    pub placed: Vec<Territory>,
    pub traded: usize,
    /// Each capture: where it came from and what it took.
    pub captures: Vec<(Territory, Territory)>,
}

impl Turn {
    pub fn read(history: &[Event]) -> Turn {
        let start = history
            .iter()
            .rposition(|e| matches!(e.kind, EventKind::TurnStarted { .. }))
            .map_or(0, |i| i + 1);
        let mut turn = Turn::default();
        let mut from = None;
        for e in &history[start..] {
            match e.kind {
                EventKind::Placed { territory, .. } if !turn.placed.contains(&territory) => {
                    turn.placed.push(territory)
                }
                EventKind::Traded { .. } => turn.traded += 1,
                EventKind::Battle { from: f, .. } | EventKind::Blitzed { from: f, .. } => {
                    from = Some(f)
                }
                EventKind::Captured { territory, .. } => {
                    if let Some(f) = from {
                        turn.captures.push((f, territory));
                    }
                }
                _ => {}
            }
        }
        turn
    }

    /// The head: the bigger end of the last capture that is still mine, or before any capture,
    /// where the turn's armies went.
    pub fn head(&self, b: &Board) -> Option<usize> {
        match self.captures.last() {
            Some(&(from, to)) => [to as usize, from as usize]
                .into_iter()
                .filter(|&t| b.is_mine(t))
                .max_by_key(|&t| (b.armies[t], std::cmp::Reverse(t != to as usize))),
            None => self
                .placed
                .first()
                .map(|&t| t as usize)
                .filter(|&t| b.is_mine(t)),
        }
    }
}

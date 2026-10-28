//! The evaluation of a turn's end (`ideas/native-v1.md`): my power's share, cut by my chance of
//! being eliminated before my next turn, less my expected border losses, plus next turn's best
//! kill, less idle armies, less the common threat's excess.

use super::board::{board_hash, income_of, mix128, round, Board, Scan};
use super::hands::{hidden_cards, next_trade};
use super::knobs::Knobs;
use super::memo::{new_memo, remembered, Memo};
use super::opponents::{forecast, unknown_cards, Record};
use super::params::{OpponentModel, Preferences};
use super::routes::kill_chance;
use crate::engine::Seat;
use crate::map::{territories_in, ADJACENCY};

/// What native-v2's switches add to the evaluation's beliefs and charges (`ideas/native-v2.md`).
/// All off (`Extra::OFF`) is native-v1's own evaluation, float for float.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Extra {
    /// `humans`: seats believed to take every kill open to them, with kill chances that count
    /// several stacks and a kill paid for by a first kill's cards. A mask of seats.
    pub bold: u8,
    /// `threat`: the leader, named once a turn, and its weight on the smooth scale (0 to 1). It
    /// replaces the power ratio's common threat.
    pub leader: Option<(Seat, f64)>,
    /// `hoard`: my stacks past what their front needs count at the priced armies' rate at any
    /// income.
    pub hoard: bool,
}

impl Extra {
    pub const OFF: Extra = Extra {
        bold: 0,
        leader: None,
        hoard: false,
    };

    pub fn hash(&self) -> u128 {
        if *self == Extra::OFF {
            return 0;
        }
        let (leader, weight) = self.leader.map_or((7, -1.0), |(s, w)| (s as u64, w));
        mix128(
            0x0065_7874_7261 << 16 | (self.bold as u64) << 8 | leader,
            weight.to_bits() ^ self.hoard as u64,
        )
    }
}

/// Everything a decision's boards are scored against: the seat, the preferences in force, the
/// opponent model and this game's record of the opponents.
pub struct Judge {
    pub me: Seat,
    /// The rule-v6.1 settings this decision plays by, gates already read.
    pub knobs: Knobs,
    pub prefs: Preferences,
    pub om: OpponentModel,
    pub record: Record,
    pub extra: Extra,
    /// The preferences and the record as a hash, for memos of answers that read them.
    pub id: u128,
}

impl Judge {
    pub fn new(
        me: Seat,
        prefs: Preferences,
        om: OpponentModel,
        record: Record,
        knobs: Knobs,
    ) -> Judge {
        let id = mix128(
            (prefs.hash() ^ record.hash()) as u64,
            ((prefs.hash() >> 64) ^ (record.hash() >> 64)) as u64 ^ me as u64,
        ) ^ knobs.hash();
        Judge {
            me,
            knobs,
            prefs,
            om,
            record,
            extra: Extra::OFF,
            id,
        }
    }

    /// The same judge with native-v2's `extra` beliefs and charges.
    pub fn with_extra(self, extra: Extra) -> Judge {
        Judge {
            id: self.id ^ extra.hash(),
            extra,
            ..self
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Breakdown {
    pub value: f64,
    /// The common threat the planner builds its plans round.
    pub threat: Option<Seat>,
    /// Everyone's power: the scale every term of the value is divided by.
    pub total: f64,
}

thread_local! {
    static BREAKDOWNS: Memo<Breakdown> = new_memo(14);
}

pub fn breakdown(b: &Board, judge: &Judge) -> Breakdown {
    let scan = Scan::new(b);
    let key = board_hash(b, &scan) ^ judge.id;
    remembered(&BREAKDOWNS, key, || compute(b, &scan, judge))
}

pub fn evaluate(b: &Board, judge: &Judge) -> f64 {
    breakdown(b, judge).value
}

/// The board as `victim` leaves it for my next turn: its income placed on its territory facing my
/// strongest launch (beside it, or a third player's territory away), where my kill would start.
fn reinforced(b: &Board, me: Seat, victim: Seat, income: i32) -> Option<(usize, Board)> {
    let mut entry = None;
    let mut facing = 0;
    for t in territories_in(b.own(victim)) {
        for &n in ADJACENCY[t] {
            if b.owner[n] == me {
                if b.armies[n] - 1 > facing {
                    facing = b.armies[n] - 1;
                    entry = Some(t);
                }
            } else if b.owner[n] != victim {
                for &s in ADJACENCY[n] {
                    let attackers = b.armies[s] - 1 - (b.armies[n] + 1);
                    if b.owner[s] == me && attackers > facing {
                        facing = attackers;
                        entry = Some(t);
                    }
                }
            }
        }
    }
    let t = entry?;
    let mut out = *b;
    out.armies[t] += income;
    Some((t, out))
}

/// What `attrition` scales the border weight by: min(1, k × the alive seats' board income ÷ their
/// armies), so 1 while the board holds up to k rounds of its income; 1 always with k at 0.
fn attrition_scale(b: &Board, k: f64) -> f64 {
    if k == 0.0 {
        return 1.0;
    }
    let (mut income, mut armies) = (0.0, 0.0);
    for s in b.alive_seats() {
        income += income_of(b.own(s), 1.0);
        armies += b.armies_of(s) as f64;
    }
    (k * income / armies).min(1.0)
}

fn compute(b: &Board, scan: &Scan, judge: &Judge) -> Breakdown {
    let me = judge.me;
    let p = &judge.prefs;
    if !b.alive[me as usize] {
        return Breakdown {
            value: 0.0,
            threat: None,
            total: 1.0,
        };
    }
    if b.alive_count() == 1 {
        return Breakdown {
            value: 1.0,
            threat: None,
            total: 1.0,
        };
    }
    let knobs = &judge.knobs;
    let f = forecast(
        b,
        scan,
        me,
        p,
        &judge.om,
        &judge.record,
        knobs,
        &judge.extra,
    );
    let kill_exposure = 1.0 - f.spared[me as usize];

    let my_next = round(b.income(me) as f64 + next_trade(b.known, unknown_cards(b, me)));
    let mut opportunity = 0.0f64;
    for v in b
        .opponents_in_order(me)
        .filter(|_| p.opportunity_weight != 0.0)
    {
        let hand = b.hand[v as usize];
        if hand == 0 {
            continue;
        }
        let chance = match reinforced(b, me, v, round(f.income[v as usize])) {
            Some((t, board)) => {
                let mut scan = scan.clone();
                scan.retake(&board, t);
                kill_chance(&board, &scan, me, v, my_next)
            }
            None => kill_chance(b, scan, me, v, my_next),
        };
        opportunity =
            opportunity.max(chance * f.spared[v as usize] * p.my_card_weight * hidden_cards(hand));
    }

    let mut idle = 0;
    for t in territories_in(b.own(me)) {
        if !b.enemy_beside(t) {
            idle += b.armies[t] - 1;
        }
    }

    let total = f.total;
    let share = f.power[me as usize] / total;
    let border_weight = if knobs.is_off() {
        p.border_weight
    } else {
        p.border_weight * knobs.border_scale * attrition_scale(b, knobs.attrition)
    };
    let mut value = share * (1.0 - p.vulnerability_weight * kill_exposure)
        - border_weight * f.border_loss / total
        + p.opportunity_weight * opportunity / total
        - p.idle_weight * idle as f64 / total;
    let strongest_but = |x: Seat| {
        b.alive_seats()
            .filter(|&s| s != x)
            .map(|s| f.power[s as usize])
            .fold(0.0, f64::max)
    };
    if let Some((t, w)) = judge.extra.leader {
        // `threat`: the leader's lead over the next seat, on the smooth scale of its weight.
        if b.alive[t as usize] {
            let weight = if t == me {
                p.lead_penalty_weight
            } else {
                p.common_threat_weight
            };
            value -= w * weight * (f.power[t as usize] - strongest_but(t)).max(0.0) / total;
        }
        return Breakdown {
            value,
            threat: f.plan_threat,
            total,
        };
    }
    match f.threat {
        Some(t) if t != me => {
            value -=
                p.common_threat_weight * (f.power[t as usize] - f.ratio * strongest_but(t)) / total
        }
        Some(_) => {
            value -=
                p.lead_penalty_weight * (f.power[me as usize] - f.ratio * strongest_but(me)) / total
        }
        None => {}
    }
    Breakdown {
        value,
        threat: f.plan_threat,
        total,
    }
}

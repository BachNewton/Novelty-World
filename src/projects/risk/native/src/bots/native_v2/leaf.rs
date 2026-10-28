//! What scores a reply's end: v7.1's standing (`rule-bot-v7.1.md`), my share of everyone's power
//! less the charge for a runaway leader, with every seat's armies priced as v6.1 prices them where
//! its settings are in effect. The replies have played the opponents' turns the opponent model
//! forecasts, and I move first from here, so none of the forecast's terms are counted again.

use super::threat::leader;
use crate::bots::native_v1::board::{income_of, round, Board, Scan};
use crate::bots::native_v1::bold::bold_kill_chance;
use crate::bots::native_v1::hands::{card_worth, forced_trade, hidden_cards, DRAW_CHANCE};
use crate::bots::native_v1::knobs::Knobs as Settings;
use crate::bots::native_v1::opponents::{expected_income, hoard_discount, my_cards, HOARD_BEYOND};
use crate::bots::native_v1::params::{OpponentModel, Preferences};
use crate::bots::native_v1::routes::kill_chance;
use crate::engine::{Seat, MAX_SEATS};

/// How a search scores its leaves: the preferences and opponent model at its search point, and the
/// v6.1 settings of the table, whose gates are read at the leaf's own seats alive.
#[derive(Clone, Copy, Debug)]
pub struct Scale {
    pub me: Seat,
    pub prefs: Preferences,
    pub om: OpponentModel,
    pub settings: Settings,
    /// `hoard`: my stacks past what their front needs count at the priced rate at any income.
    pub hoard: bool,
    /// `threat`: the leader is named by what its next turn could do, on a smooth scale, not by
    /// the power ratio.
    pub smooth: bool,
}

/// Every seat's power as the standing counts it: armies (priced), income over the horizon, cards.
pub fn powers(b: &Board, s: &Scale) -> [f64; MAX_SEATS] {
    let me = s.me;
    let settings = s.settings.in_effect(b.players as usize, b.alive_count());
    let priced = settings.armies_priced();
    let h = s.prefs.income_horizon;
    let card_income = DRAW_CHANCE * card_worth();
    let mut power = [0.0; MAX_SEATS];
    let hoarded = if s.hoard {
        let beyond = if priced {
            settings.army_beyond
        } else {
            HOARD_BEYOND
        };
        hoard_discount(b, me, &expected_income(b, me), beyond)
    } else {
        0.0
    };
    for p in b.alive_seats() {
        let face = b.armies_of(p) as f64;
        let mut armies = if priced {
            settings.priced_armies(face, income_of(b.own(p), 1.0), p == me)
        } else {
            face
        };
        if p == me && s.hoard {
            armies = armies.min(face - hoarded);
        }
        let weight = if p == me {
            s.prefs.my_continent_weight
        } else {
            1.0
        };
        let cards = if p == me {
            s.prefs.my_card_weight * my_cards(b, me)
        } else {
            hidden_cards(b.hand[p as usize])
        };
        power[p as usize] = armies + h * (income_of(b.own(p), weight) + card_income) + cards;
    }
    power
}

/// The common-threat bar at this table, scaled where priced armies are in effect.
pub fn leader_ratio(b: &Board, s: &Scale) -> f64 {
    let alive = b.alive_count() as f64;
    let settings = s.settings.in_effect(b.players as usize, b.alive_count());
    let scale = if settings.armies_priced() {
        settings.threat_scale
    } else {
        1.0
    };
    (s.om.leader_ratio + s.om.leader_ratio_per_player * (alive - 4.0)) * scale
}

/// My standing at the start of my turn, from `power` with `total` its sum (a caller may count in
/// more than the board's living seats: `feed` keeps a rival killed by another seat in it).
pub fn standing_of(b: &Board, s: &Scale, power: &[f64; MAX_SEATS], total: f64) -> f64 {
    let me = s.me;
    if s.smooth {
        let mut value = power[me as usize] / total;
        if let Some((t, w)) = leader(b, &s.prefs, &s.om) {
            let next = b
                .alive_seats()
                .filter(|&p| p != t)
                .map(|p| power[p as usize])
                .fold(0.0, f64::max);
            let weight = if t == me {
                s.prefs.lead_penalty_weight
            } else {
                s.prefs.common_threat_weight
            };
            value -= w * weight * (power[t as usize] - next).max(0.0) / total;
        }
        return value;
    }
    let ratio = leader_ratio(b, s);
    let mut threat = None;
    for p in b.alive_seats() {
        if b.alive_seats()
            .all(|q| q == p || power[p as usize] > ratio * power[q as usize])
        {
            threat = Some(p);
        }
    }
    let mut value = power[me as usize] / total;
    if let Some(t) = threat {
        let next = b
            .alive_seats()
            .filter(|&p| p != t)
            .map(|p| power[p as usize])
            .fold(0.0, f64::max);
        let weight = if t == me {
            s.prefs.lead_penalty_weight
        } else {
            s.prefs.common_threat_weight
        };
        value -= weight * (power[t as usize] - ratio * next) / total;
    }
    value
}

/// v7.1's standing: 0 out, 1 alone, otherwise my share less the runaway leader's charge.
pub fn standing(b: &Board, s: &Scale) -> f64 {
    if !b.alive[s.me as usize] {
        return 0.0;
    }
    if b.alive_count() == 1 {
        return 1.0;
    }
    let power = powers(b, s);
    let total = b.alive_seats().map(|p| power[p as usize]).sum();
    standing_of(b, s, &power, total)
}

/// `feed`: what the kills a board opens to the opponents are worth to them, in armies: each
/// opponent after me takes its best kill of a rival (never me: my own exposure is the forecast's
/// and the replies'), at its chance, gaining the victim's cards valued as the trade they force (a
/// hand of five or more trades at once) and the victim's land's income over the horizon. Per
/// opponent, the gain to it; summed, what my share loses to kills I didn't make.
pub fn fed(b: &Board, me: Seat, horizon: f64, bold: u8) -> [f64; MAX_SEATS] {
    let scan = Scan::new(b);
    let income = expected_income(b, me);
    let mut gains = [0.0; MAX_SEATS];
    for q in b.opponents_in_order(me) {
        let to_place = round(income[q as usize]);
        let mut best = 0.0f64;
        for v in b.alive_seats() {
            if v == me || v == q || b.own(v) == 0 {
                continue;
            }
            let p = if bold & 1 << q != 0 {
                bold_kill_chance(b, &scan, q, v, to_place)
            } else {
                kill_chance(b, &scan, q, v, to_place)
            };
            if p == 0.0 {
                continue;
            }
            let cards = b.hand[q as usize] + b.hand[v as usize];
            let worth = if cards >= 5 {
                forced_trade(cards).0
            } else {
                hidden_cards(b.hand[v as usize])
            };
            let land = income_of(b.own(q) | b.own(v), 1.0) - income_of(b.own(q), 1.0);
            best = best.max(p * (worth + horizon * land));
        }
        gains[q as usize] = best;
    }
    gains
}

/// v7.1's standing with `feed`'s charge at weight `w`: every opponent's power grows by the kill it
/// is open to, and a rival killed in the reply by another seat keeps its power at the search point
/// in the total, so neither kill raises my share.
pub fn fed_standing(b: &Board, s: &Scale, w: f64, killed: f64, bold: u8) -> f64 {
    if !b.alive[s.me as usize] {
        return 0.0;
    }
    if b.alive_count() == 1 {
        return 1.0;
    }
    let mut power = powers(b, s);
    let gains = fed(b, s.me, s.prefs.income_horizon, bold);
    let mut total: f64 = b.alive_seats().map(|p| power[p as usize]).sum();
    for p in b.alive_seats() {
        power[p as usize] += w * gains[p as usize];
        total += w * gains[p as usize];
    }
    standing_of(b, s, &power, total + w * killed)
}

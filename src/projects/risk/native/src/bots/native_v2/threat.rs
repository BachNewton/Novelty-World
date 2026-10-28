//! `threat` (`ideas/native-v2.md`): the leader named by what its next turn could do, weighed on a
//! smooth scale, instead of v6's hard power ratio, which flickers on and off within a turn. A seat's
//! reach is its power (armies, its income over the horizon, continents included, and its cards) and
//! the most its believed sweep could take from any one seat next turn (the armies and the income it
//! breaks). The leader is the seat of the greatest reach; its weight runs from 0, level with the
//! next seat, to 1 at the table's leader bar. It reads only what every seat can see, my own cards
//! counted by their number as anyone else's are, so it is fixed once a turn from the board at the
//! turn's start.

use crate::bots::native_v1::board::{income_of, round, Board, Scan};
use crate::bots::native_v1::hands::{card_worth, hidden_cards, hidden_hand, DRAW_CHANCE};
use crate::bots::native_v1::opponents::turn_against;
use crate::bots::native_v1::params::{OpponentModel, Preferences};
use crate::engine::{Seat, MAX_SEATS};

/// Each seat's reach: its public power and the most its believed sweep takes from one seat.
pub fn reach(b: &Board, prefs: &Preferences) -> [f64; MAX_SEATS] {
    let h = prefs.income_horizon;
    let scan = Scan::new(b);
    let card_income = DRAW_CHANCE * card_worth();
    let mut out = [0.0; MAX_SEATS];
    for p in b.alive_seats() {
        let power = b.armies_of(p) as f64
            + h * (income_of(b.own(p), 1.0) + card_income)
            + hidden_cards(b.hand[p as usize]);
        let income = round(b.income(p) as f64 + hidden_hand(b.hand[p as usize]).next_trade);
        let mut take = 0.0f64;
        for v in b.alive_seats() {
            if v == p {
                continue;
            }
            let turn = turn_against(b, &scan, v, p, income);
            take = take.max(turn.sweep_cost(b.own(v), h, 1.0));
        }
        out[p as usize] = power + take;
    }
    out
}

/// The leader and its weight on the smooth scale, or None at a table of one.
pub fn leader(b: &Board, prefs: &Preferences, om: &OpponentModel) -> Option<(Seat, f64)> {
    let r = reach(b, prefs);
    let mut order: Vec<Seat> = b.alive_seats().collect();
    if order.len() < 2 {
        return None;
    }
    order.sort_by(|&x, &y| r[y as usize].total_cmp(&r[x as usize]).then(x.cmp(&y)));
    let (lead, next) = (r[order[0] as usize], r[order[1] as usize]);
    let bar = om.leader_ratio + om.leader_ratio_per_player * (order.len() as f64 - 4.0);
    let w = if next > 0.0 {
        ((lead / next - 1.0) / (bar - 1.0)).clamp(0.0, 1.0)
    } else {
        1.0
    };
    Some((order[0], w))
}

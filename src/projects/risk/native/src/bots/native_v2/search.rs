//! The search (`ideas/native-v2.md`, v7.1's in `rule-bot-v7.md`): at the turn's first placement,
//! the base planner's candidates are each played forward through the same imagined worlds, their
//! placement as real moves, the rest of my turn by my own play, then each opponent's turn by a
//! reply bot, to the start of my next turn, where the board is scored. Every candidate meets the
//! same guess at the hidden cards, the same dice seed and the same reply bots (common random
//! numbers), so a difference between two is the plans' and not the luck's.

use super::Context;
use crate::bot::BotInput;
use crate::bots::native_v1::board::{mix128, Board, N};
use crate::engine::{Event, EventKind, Game, Move, Options, Phase, Seat, Trade, View};
use crate::rng::Rng;
use crate::sim::{build_world, read_history, sample_hidden, PublicRecord};
use std::cell::RefCell;
use std::collections::HashMap;

/// Where the turn's plan is chosen: the turn's own reinforce phase as it stood before its first
/// placement, which every placement of the phase rebuilds from its own view and history.
pub struct SearchPoint<'a> {
    pub view: View,
    pub history: &'a [Event],
    /// What the phase has placed since, by territory.
    pub placed: [i32; N],
}

/// The search point of the reinforce phase in progress, or None outside the turn's own one (an
/// elimination's forced trade mid-attack is the base bot's alone).
pub fn search_point<'a>(view: &View, history: &'a [Event]) -> Option<SearchPoint<'a>> {
    if view.phase != Phase::Reinforce {
        return None;
    }
    let at = history
        .iter()
        .rposition(|e| matches!(e.kind, EventKind::Phase { .. }))?;
    match history[at].kind {
        EventKind::Phase {
            phase: Phase::Reinforce,
        } if history[at].rule != "ELIM-3" => {}
        _ => return None,
    }
    let mut placed = [0; N];
    let mut first = None;
    for (i, e) in history.iter().enumerate().skip(at + 1) {
        if let EventKind::Placed {
            territory, armies, ..
        } = e.kind
        {
            first.get_or_insert(i);
            placed[territory as usize] += armies;
        }
    }
    let Some(first) = first else {
        return Some(SearchPoint {
            view: view.clone(),
            history,
            placed,
        });
    };
    let mut point = view.clone();
    let mut total = 0;
    for (t, &armies) in placed.iter().enumerate() {
        point.territories[t].armies -= armies;
        total += armies;
    }
    for s in point.seats.as_mut_slice() {
        if s.seat == view.active {
            s.armies -= total;
        }
    }
    point.armies_to_place += total;
    Some(SearchPoint {
        view: point,
        history: &history[..first],
        placed,
    })
}

/// The next placement of a plan, its biggest allocation still to place (the lowest territory of
/// equals), or None once the plan has placed everything.
pub fn next_placement(place: &[i32; N], placed: &[i32; N]) -> Option<(usize, i32)> {
    let mut best: Option<(usize, i32)> = None;
    for t in 0..N {
        let armies = place[t] - placed[t];
        assert!(
            armies >= 0,
            "placed more on territory {t} than the plan did"
        );
        if armies > 0 && best.is_none_or(|(_, a)| armies > a) {
            best = Some((t, armies));
        }
    }
    best
}

/// The search's own random source: the same for every placement of the phase, which each rebuilds
/// the search from, and read from nothing the seat can't see.
pub fn search_seed(point: &SearchPoint, me: Seat) -> String {
    format!("native-v2|{me}|{}|{}", point.view.turn, point.history.len())
}

/// The bots a reply's opponents are drawn from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReplyBot {
    /// rule-v6.1, natively: the strongest model of a careful player.
    V61,
    /// GD's Aggressive persona and greedy attack wherever they are bigger: the sweeping play the
    /// opponent model underrates.
    GdAggressive,
    Greedy,
    /// A person's seat under `humans`, once vulture-v1 is registered: the style of the person the
    /// bots lose to.
    Person,
}

/// The mix, by weight: v7's.
const MIX: [(ReplyBot, f64); 3] = [
    (ReplyBot::V61, 2.0),
    (ReplyBot::GdAggressive, 1.0),
    (ReplyBot::Greedy, 1.0),
];

/// Each seat's reply bot in a reply, drawn from the reply's seed; None for mine.
pub fn reply_bots(
    players: usize,
    me: Seat,
    mixed: bool,
    persons: &[bool],
    at: &str,
) -> Vec<Option<ReplyBot>> {
    let mut rng = Rng::from_seed(&format!("{at}|bots"));
    let weight: f64 = MIX.iter().map(|m| m.1).sum();
    (0..players as Seat)
        .map(|s| {
            if s == me {
                return None;
            }
            if !mixed {
                return Some(ReplyBot::V61);
            }
            let mut x = rng.next() * weight;
            let mut drawn = MIX[MIX.len() - 1].0;
            for &(bot, w) in &MIX {
                x -= w;
                if x < 0.0 {
                    drawn = bot;
                    break;
                }
            }
            // Drawn either way, so a person's seat changes no other seat's draw.
            Some(if persons[s as usize] {
                ReplyBot::Person
            } else {
                drawn
            })
        })
        .collect()
}

/// A reply can't run on: no game of Risk takes this many decisions for one round.
const MOST_DECISIONS: u32 = 20_000;

/// How a reply ended.
#[derive(Clone, Debug)]
pub enum End {
    /// The game ended (whether I won), or I was eliminated (false).
    Over(bool),
    /// My turn started again: the board as I see it, and the seats that were alive at the search
    /// point and were killed since by a seat other than me.
    Turn(Box<Board>, u8),
}

/// One search's shared inputs: the search point's view, its record and every seat's history.
pub struct Searcher<'a> {
    pub me: Seat,
    pub view: &'a View,
    pub record: PublicRecord,
    /// Every seat's history as that seat sees it, grown while a reply plays and cut back after.
    pub histories: Vec<Vec<Event>>,
    pub humans: &'a [bool],
    pub ctx: &'a Context,
    pub rounds: u32,
}

/// What my own play does in a reply once the candidate is placed.
pub trait Mine {
    fn decide(&self, input: &BotInput, game: &Game) -> Move;
}

impl<'a> Searcher<'a> {
    pub fn new(
        point: &'a SearchPoint,
        me: Seat,
        humans: &'a [bool],
        ctx: &'a Context,
        rounds: u32,
    ) -> Searcher<'a> {
        let record = read_history(&point.view, point.history)
            .unwrap_or_else(|e| panic!("a search point's history: {e}"));
        let histories = (0..point.view.seats.len() as Seat)
            .map(|s| point.history.iter().map(|e| e.redacted(Some(s))).collect())
            .collect();
        Searcher {
            me,
            view: &point.view,
            record,
            histories,
            humans,
            ctx,
            rounds,
        }
    }

    /// Reply `r`'s world and bots: hidden cards and dice drawn from the search's seed, never the
    /// game's.
    pub fn world(&self, seed: &str, r: u32, mixed: bool, persons: &[bool]) -> Reply {
        let at = format!("{seed}|{r}");
        let hidden = sample_hidden(
            self.view,
            &self.record,
            &mut Rng::from_seed(&format!("{at}|cards")),
        );
        Reply {
            world: build_world(self.view, &self.record, &hidden, &format!("{at}|dice")),
            bots: reply_bots(self.view.seats.len(), self.me, mixed, persons, &at),
            seed: at,
        }
    }

    /// Plays `place` and then the rounds to my next turn in the reply's world, my own play after the
    /// placement by `mine`.
    pub fn play(&mut self, reply: &Reply, place: &[i32; N], mine: &dyn Mine) -> End {
        let lens: Vec<usize> = self.histories.iter().map(Vec::len).collect();
        let end = self.play_from(reply, place, mine);
        for (h, &len) in self.histories.iter_mut().zip(&lens) {
            h.truncate(len);
        }
        end
    }

    fn play_from(&mut self, reply: &Reply, place: &[i32; N], mine: &dyn Mine) -> End {
        let me = self.me;
        let mut game = reply.world;
        let mut trades: Vec<Trade> = self.view.traded.clone();
        let mut latest: Vec<usize> = self.histories.iter().map(Vec::len).collect();
        let mut placed = [0; N];
        let mut own_reinforce = true;
        let mut turns_left = self.rounds;
        let mut killed_by_others = 0u8;
        let at_start = self
            .view
            .seats
            .iter()
            .filter(|s| !s.eliminated)
            .fold(0u8, |m, s| m | 1 << s.seat);
        for decision in 0..MOST_DECISIONS {
            let active = game.active;
            let view = game.view(Some(active), &trades);
            let options = game.options(active).unwrap_or_else(|| {
                panic!("seat {active} is to move in a reply but has no options")
            });
            let mut mv = None;
            if active == me && own_reinforce {
                if let Options::Reinforce(r) = &options {
                    if r.may_place {
                        mv = next_placement(place, &placed).map(|(t, armies)| {
                            placed[t] += armies;
                            Move::Place {
                                territory: t as u8,
                                armies,
                            }
                        });
                    }
                }
            }
            let mv = mv.unwrap_or_else(|| {
                let history = &self.histories[active as usize];
                let seed = format!("{}|{decision}", reply.seed);
                let input = BotInput {
                    seat: active,
                    view: &view,
                    options: &options,
                    events: &history[latest[active as usize]..],
                    history,
                    humans: self.humans,
                    seed: &seed,
                };
                if active == me {
                    mine.decide(&input, &game)
                } else {
                    let bot =
                        reply.bots[active as usize].expect("a reply has a bot for every opponent");
                    self.ctx.reply_bot(bot).decide(&input)
                }
            });
            let events = game.apply(active, mv).unwrap_or_else(|reason| {
                panic!("seat {active}'s bot made an illegal move in a reply ({reason}): {mv:?}")
            });
            for (seat, h) in self.histories.iter_mut().enumerate() {
                latest[seat] = h.len();
                h.extend(events.iter().map(|e| e.redacted(Some(seat as Seat))));
            }
            for e in &events {
                match e.kind {
                    EventKind::Traded { seat, cards, .. } => trades.push(Trade { seat, cards }),
                    EventKind::GameOver { winner } => return End::Over(winner == me),
                    EventKind::Eliminated { seat, .. } if seat == me => return End::Over(false),
                    EventKind::Eliminated { seat, by, .. }
                        if by != me && at_start & 1 << seat != 0 =>
                    {
                        killed_by_others |= 1 << seat
                    }
                    EventKind::Phase { phase } if phase != Phase::Reinforce => {
                        own_reinforce = false
                    }
                    EventKind::TurnStarted { seat, .. } if seat == me => {
                        turns_left -= 1;
                        if turns_left == 0 {
                            let view = game.view(Some(me), &trades);
                            return End::Turn(Box::new(Board::from_view(&view)), killed_by_others);
                        }
                    }
                    _ => {}
                }
            }
        }
        panic!("a reply passed {MOST_DECISIONS} decisions without reaching my next turn")
    }
}

/// One imagined world of a search, the same for every candidate.
pub struct Reply {
    pub world: Game,
    pub bots: Vec<Option<ReplyBot>>,
    pub seed: String,
}

/// The candidates' scores, one row a reply, and the chosen candidate.
#[derive(Clone, Debug)]
pub struct Scores {
    pub by_reply: Vec<Vec<f64>>,
}

impl Scores {
    pub fn means(&self, candidates: usize) -> Vec<f64> {
        let n = self.by_reply.len() as f64;
        (0..candidates)
            .map(|c| self.by_reply.iter().map(|row| row[c] / n).sum())
            .collect()
    }

    /// v7.1's choice: the best mean, the earlier candidate of equals.
    pub fn best(&self, candidates: usize) -> usize {
        let means = self.means(candidates);
        let mut chosen = 0;
        for c in 1..candidates {
            if means[c] > means[chosen] {
                chosen = c;
            }
        }
        chosen
    }

    /// `margin`: the best mean among the candidates whose paired difference from the base plan's
    /// (candidate 0) across the replies exceeds `k` of its standard errors; the base plan when none
    /// does. A difference with no spread at all is taken as it is.
    pub fn best_by_margin(&self, candidates: usize, k: f64) -> usize {
        let means = self.means(candidates);
        let n = self.by_reply.len() as f64;
        let mut chosen = 0;
        for c in 1..candidates {
            let d: Vec<f64> = self.by_reply.iter().map(|row| row[c] - row[0]).collect();
            let mean = d.iter().sum::<f64>() / n;
            let var = if n > 1.0 {
                d.iter().map(|x| (x - mean) * (x - mean)).sum::<f64>() / (n - 1.0)
            } else {
                0.0
            };
            let se = (var / n).sqrt();
            if mean > k * se && mean > 0.0 && means[c] > means[chosen] {
                chosen = c;
            }
        }
        chosen
    }
}

thread_local! {
    static CHOSEN: RefCell<HashMap<u128, usize>> = RefCell::new(HashMap::new());
}

/// The candidate chosen at a search point, remembered by `key`.
pub fn remembered(key: u128, search: impl FnOnce() -> usize) -> usize {
    if let Some(p) = CHOSEN.with(|m| m.borrow().get(&key).copied()) {
        return p;
    }
    let p = search();
    CHOSEN.with(|m| {
        let mut m = m.borrow_mut();
        if m.len() >= 64 {
            m.clear();
        }
        m.insert(key, p);
    });
    p
}

/// Forgets every remembered search, so a test can ask for a fresh one.
#[cfg(test)]
pub fn forget() {
    CHOSEN.with(|m| m.borrow_mut().clear());
}

/// A search point as a hash: everything a search reads from it.
pub fn point_key(point: &SearchPoint, me: Seat, humans: &[bool], knobs: u64) -> u128 {
    let v = &point.view;
    let mut h = mix128(
        (me as u64) << 48 | (v.turn as u64) << 16 | point.history.len() as u64,
        knobs ^ (v.armies_to_place as u32 as u64) << 32,
    );
    for (t, tv) in v.territories.iter().enumerate() {
        h ^= mix128(
            (t as u64) << 40 | (tv.owner as u64) << 32,
            tv.armies as u32 as u64,
        )
        .rotate_left(t as u32);
    }
    let hand = v.hand.as_ref().map_or(&[][..], |x| x.as_slice());
    let cards = hand.iter().fold(0u64, |m, &c| m << 6 ^ c as u64);
    let persons = humans.iter().fold(0u64, |m, &x| m << 1 | x as u64);
    h ^ mix128(cards, persons | (hand.len() as u64) << 32)
}

//! native-v2 (`ideas/native-v2.md`): v7.1's search on native-v1 with rule-v6.1's settings, and the
//! switches the design doc tests against it. With every switch off it is v7.1's search: the base
//! planner's best few placements, each played through the same imagined rounds of the opponents'
//! turns (reply bots drawn per seat from a mix), the start of my next turn scored by v7.1's
//! standing. A pure function of its seat's view, options and history: its random draws come from a
//! seed read from the search point, never the game's, and its work is a fixed count of replies.

mod execute;
mod knobs;
mod leaf;
mod search;
mod threat;
mod turn;

pub use knobs::Knobs;

use crate::bot::{Bot, BotInput};
use crate::bots::gd::{GdBot, Persona};
use crate::bots::native_v1::board::Board;
use crate::bots::native_v1::evaluate::{Extra, Judge};
use crate::bots::native_v1::fights;
use crate::bots::native_v1::opponents::expected_income;
use crate::bots::native_v1::plans::{best_plan, plans, target_plans, Plan, PlanKind};
use crate::bots::native_v1::{self, judge_for, NativeV1, NATIVE_V1};
use crate::bots::GreedyBot;
use crate::engine::{Game, Move, Options, Seat};
use crate::map::{territories_in, ADJACENT, CONTINENT_MASKS};
use leaf::Scale;
use search::{
    next_placement, point_key, remembered, search_point, search_seed, End, Mine, ReplyBot, Scores,
    SearchPoint, Searcher,
};

/// rule-v6.1 natively (`rule-bot-v6.1.md`, "The native map"): native-v1 on v6.1's pick, with v6's
/// small-table cutoff of 4 seats alive, so the base planner is v6.1's as v7.1's is.
pub const V6_1: native_v1::Params = native_v1::Params {
    small_table_seats: 4,
    knobs: native_v1::Knobs {
        power: native_v1::knobs::PowerMode::Armies,
        army_rounds: 16.0,
        army_beyond: 0.75,
        reprice: native_v1::knobs::Reprice::Full,
        border_scale: 1.2,
        rival_beyond: 1.25,
        min_players: 5,
        ..native_v1::Knobs::OFF
    },
    ..NATIVE_V1
};

/// The bots a search plays: the base (v6.1, my own play and the mix's careful player) and the mix's
/// sweepers, and the bot that plays a person's seat under `humans`, once one is registered.
pub struct Context {
    pub base: NativeV1,
    aggressive: GdBot,
    greedy: GreedyBot,
    /// vulture-v1 (`vulture-v1.md`), Bot Killer's play, when the registry has it.
    person: Option<Box<dyn Bot>>,
}

/// The label a person's seat is played by in replies under `humans`.
pub const PERSON_BOT: &str = "vulture-v1";

impl Context {
    fn new() -> Context {
        Context {
            base: NativeV1 { params: V6_1 },
            aggressive: GdBot {
                persona: Persona::Aggressive,
            },
            greedy: GreedyBot,
            person: crate::bots::bot(PERSON_BOT),
        }
    }

    pub fn reply_bot(&self, bot: ReplyBot) -> &dyn Bot {
        match bot {
            ReplyBot::V61 => &self.base,
            ReplyBot::GdAggressive => &self.aggressive,
            ReplyBot::Greedy => &self.greedy,
            ReplyBot::Person => self
                .person
                .as_deref()
                .expect("a person's seat is drawn only once its bot is registered"),
        }
    }
}

pub struct NativeV2 {
    pub knobs: Knobs,
    ctx: Context,
}

impl NativeV2 {
    pub fn new(knobs: Knobs) -> NativeV2 {
        NativeV2 {
            knobs,
            ctx: Context::new(),
        }
    }
}

/// A search's candidates, each one's score in every reply, and the one chosen.
pub struct SearchResult {
    pub candidates: Vec<Plan>,
    pub scores: Scores,
    pub chosen: usize,
}

/// Whether two plans are one candidate: they place alike, since the rest of the turn is the base
/// bot's either way; under `execute`, they also capture alike, since the rest of the turn is theirs.
fn alike(a: &Plan, b: &Plan, execute: bool) -> bool {
    let targets = |p: &Plan| {
        p.capture.as_ref().map(|cp| {
            cp.routes
                .iter()
                .flat_map(|r| r.path.iter().copied())
                .collect::<Vec<_>>()
        })
    };
    a.place == b.place && (!execute || targets(a) == targets(b))
}

/// The base planner's choice first, then its other plans by value, one per candidate.
pub fn candidates(
    b: &Board,
    judge: &Judge,
    to_place: i32,
    most: usize,
    execute: bool,
) -> Vec<Plan> {
    let chosen = best_plan(b, judge, to_place);
    let mut ranked = plans(b, judge, to_place);
    ranked.sort_by(|x, y| y.value.total_cmp(&x.value));
    let mut out: Vec<Plan> = Vec::new();
    for plan in std::iter::once(chosen).chain(ranked) {
        if out.iter().any(|p| alike(p, &plan, execute)) {
            continue;
        }
        out.push(plan);
        if out.len() >= most {
            break;
        }
    }
    out
}

/// The kinds `kinds` keeps the best of, in the order they are added.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Hold,
    Capture,
    Sweep,
    Continent,
    /// A capture inside a continent the leader holds whole.
    Break,
    Kill,
}

/// The way into a continent the leader holds whole that my stacks are likeliest to take: a
/// territory of it beside me, or one beside its gate (the leader's territory between it and me),
/// the gate taken first.
fn way_in(b: &Board, me: Seat, leader: Seat, mask: u64, to_place: i32) -> Option<Vec<usize>> {
    let stack_beside = |t: usize| {
        territories_in(ADJACENT[t] & b.own(me))
            .map(|n| b.armies[n])
            .max()
    };
    let mut best: Option<(Vec<usize>, f64)> = None;
    let mut consider = |targets: Vec<usize>, p: f64| {
        if best.as_ref().is_none_or(|(_, x)| p > *x) {
            best = Some((targets, p));
        }
    };
    for t in territories_in(mask) {
        if let Some(stack) = stack_beside(t) {
            consider(vec![t], fights::win(stack - 1 + to_place, b.armies[t]));
        }
        for g in territories_in(ADJACENT[t] & b.own(leader) & !mask) {
            if let Some(stack) = stack_beside(g) {
                let defenders = [b.armies[g].max(1) as usize, b.armies[t].max(1) as usize];
                let run = crate::odds::path_run((stack + to_place) as usize, &defenders);
                consider(vec![g, t], run.p_success);
            }
        }
    }
    best.map(|(targets, _)| targets)
}

/// `kinds`: the base planner's choice first, then the best `per_kind` of each kind by value, one
/// per candidate. The breaks of the leader's continents are planned here: for each continent the
/// leader holds whole, the way into it my stacks are likeliest to take.
pub fn kinds(
    b: &Board,
    judge: &Judge,
    to_place: i32,
    per_kind: usize,
    leader: Option<Seat>,
    execute: bool,
) -> Vec<(Kind, Plan)> {
    let me = judge.me;
    let all = plans(b, judge, to_place);
    let mut breaks = Vec::new();
    if let Some(l) = leader.filter(|&l| l != me && b.alive[l as usize]) {
        let income = expected_income(b, me);
        for (c, &mask) in CONTINENT_MASKS.iter().enumerate() {
            if !b.holds(l, c) {
                continue;
            }
            if let Some(targets) = way_in(b, me, l, mask, to_place) {
                target_plans(
                    b,
                    judge,
                    to_place,
                    PlanKind::Capture,
                    &targets,
                    &income,
                    &mut breaks,
                );
            }
        }
    }
    let kind_of = |p: &Plan| match p.kind {
        PlanKind::Hold => Kind::Hold,
        PlanKind::Capture => Kind::Capture,
        PlanKind::Sweep => Kind::Sweep,
        PlanKind::Continent => Kind::Continent,
        PlanKind::Kill => Kind::Kill,
    };
    let chosen = best_plan(b, judge, to_place);
    let mut out: Vec<(Kind, Plan)> = vec![(kind_of(&chosen), chosen)];
    let mut groups: Vec<(Kind, Vec<Plan>)> =
        [Kind::Hold, Kind::Capture, Kind::Sweep, Kind::Continent]
            .iter()
            .map(|&k| (k, all.iter().filter(|p| kind_of(p) == k).cloned().collect()))
            .collect();
    groups.push((Kind::Break, breaks));
    groups.push((
        Kind::Kill,
        all.iter()
            .filter(|p| p.kind == PlanKind::Kill)
            .cloned()
            .collect(),
    ));
    for (kind, mut group) in groups {
        group.sort_by(|x, y| y.value.total_cmp(&x.value));
        let mut taken = 0;
        for plan in group {
            if taken >= per_kind {
                break;
            }
            if out.iter().any(|(_, p)| alike(p, &plan, execute)) {
                continue;
            }
            out.push((kind, plan));
            taken += 1;
        }
    }
    out
}

/// My own play in a reply after the placement, and in my real turn: the base bot's, judged with
/// the switches' beliefs, the turn's attacks and move-ins carried out from `plan` under `execute`.
struct MyPlay<'a> {
    base: &'a NativeV1,
    extra: Extra,
    /// The plan being carried out, and the turn it is for.
    plan: Option<(&'a Plan, u32)>,
    feed: f64,
}

impl MyPlay<'_> {
    fn decide(&self, input: &BotInput) -> Move {
        let Some((plan, _)) = self.plan.filter(|&(_, turn)| turn == input.view.turn) else {
            return self.base.decide_with(input, self.extra);
        };
        let b = Board::from_view(input.view);
        let judge = judge_for(&V6_1, &b, input.seat, input.history).with_extra(self.extra);
        match *input.options {
            Options::Attack(_) => execute::attack(&b, &judge, plan, self.feed),
            Options::Occupy { from, to, min, max } => Move::Occupy {
                armies: execute::occupy(&b, &judge, plan, from as usize, to as usize, min, max),
            },
            _ => self.base.decide_with(input, self.extra),
        }
    }
}

impl Mine for MyPlay<'_> {
    fn decide(&self, input: &BotInput, _game: &Game) -> Move {
        MyPlay::decide(self, input)
    }
}

impl NativeV2 {
    /// The beliefs and charges the switches add to the base planner at a decision of my turn: the
    /// people's seats under `humans`, the turn's leader under `threat` (named from the board at the
    /// turn's start, so once a turn), and `hoard`.
    fn extra(&self, input: &BotInput) -> Extra {
        let k = &self.knobs;
        let leader = if k.threat == 1 {
            turn::turn_start(input.view, input.history)
                .and_then(|b| threat::leader(&b, V6_1.prefs_for(b.alive_count()), &V6_1.opponents))
        } else {
            None
        };
        Extra {
            bold: if k.humans == 1 {
                input
                    .humans
                    .iter()
                    .enumerate()
                    .fold(0, |m, (s, &h)| if h { m | 1 << s } else { m })
            } else {
                0
            },
            leader,
            hoard: k.hoard == 1,
        }
    }

    /// The weight execute's beyond-the-plan test charges `feed` at: `feed`'s own, or 1 while it
    /// is off.
    fn feed_weight(&self) -> f64 {
        if self.knobs.feed > 0.0 {
            self.knobs.feed
        } else {
            1.0
        }
    }

    fn scale(&self, me: Seat, judge: &Judge) -> Scale {
        Scale {
            me,
            prefs: judge.prefs,
            om: judge.om,
            settings: V6_1.knobs,
            hoard: self.knobs.hoard == 1,
            smooth: self.knobs.threat == 1,
        }
    }

    /// The candidates at a search point: v6.1's top few, or the best of each kind under `kinds`.
    pub fn candidates_at(&self, point: &SearchPoint, me: Seat, extra: Extra) -> (Vec<Plan>, Judge) {
        let k = &self.knobs;
        let b = Board::from_view(&point.view);
        let judge = judge_for(&V6_1, &b, me, point.history).with_extra(extra);
        let to_place = point.view.armies_to_place;
        let plans = if k.kinds > 0 {
            let leader = extra.leader.map(|(l, _)| l).or_else(|| {
                let power = leaf::powers(&b, &self.scale(me, &judge));
                b.alive_seats().filter(|&s| s != me).max_by(|&x, &y| {
                    power[x as usize]
                        .total_cmp(&power[y as usize])
                        .then(y.cmp(&x))
                })
            });
            kinds(
                &b,
                &judge,
                to_place,
                k.kinds as usize,
                leader,
                k.execute == 1,
            )
            .into_iter()
            .map(|(_, p)| p)
            .collect()
        } else {
            candidates(&b, &judge, to_place, k.candidates as usize, k.execute == 1)
        };
        (plans, judge)
    }

    /// The search at a search point: the candidates, each played through the same replies, and the
    /// best by the rule in force.
    pub fn search(
        &self,
        point: &SearchPoint,
        me: Seat,
        humans: &[bool],
        extra: Extra,
    ) -> SearchResult {
        let (plans, judge) = self.candidates_at(point, me, extra);
        let scores = self.score(point, me, humans, extra, &plans, &judge);
        let chosen = self.choose(&scores, plans.len());
        SearchResult {
            candidates: plans,
            scores,
            chosen,
        }
    }

    fn choose(&self, scores: &Scores, candidates: usize) -> usize {
        if scores.by_reply.is_empty() {
            0
        } else if self.knobs.margin > 0.0 {
            scores.best_by_margin(candidates, self.knobs.margin)
        } else {
            scores.best(candidates)
        }
    }

    /// Every candidate played through the same replies; each end scored by v7.1's standing, with
    /// `feed`'s charge when it is on.
    fn score(
        &self,
        point: &SearchPoint,
        me: Seat,
        humans: &[bool],
        extra: Extra,
        plans: &[Plan],
        judge: &Judge,
    ) -> Scores {
        let k = &self.knobs;
        let mut scores = Scores {
            by_reply: Vec::new(),
        };
        if plans.len() < 2 || k.replies == 0 {
            return scores;
        }
        let scale = self.scale(me, judge);
        let at_point = leaf::powers(&Board::from_view(&point.view), &scale);
        let persons: Vec<bool> = if k.humans == 1 && self.ctx.person.is_some() {
            humans.to_vec()
        } else {
            vec![false; humans.len()]
        };
        let mut s = Searcher::new(point, me, humans, &self.ctx, k.rounds);
        let seed = search_seed(point, me);
        let turn = point.view.turn;
        for r in 0..k.replies {
            let reply = s.world(&seed, r, k.mixed == 1, &persons);
            let row = plans
                .iter()
                .map(|plan| {
                    let mine = MyPlay {
                        base: &self.ctx.base,
                        extra,
                        plan: (k.execute == 1).then_some((plan, turn)),
                        feed: self.feed_weight(),
                    };
                    match s.play(&reply, &plan.place, &mine) {
                        End::Over(won) => f64::from(u8::from(won)),
                        End::Turn(b, killed) if k.feed > 0.0 => {
                            let lost: f64 = (0..at_point.len())
                                .filter(|&x| killed & 1 << x != 0)
                                .map(|x| at_point[x])
                                .sum();
                            leaf::fed_standing(&b, &scale, k.feed, lost, extra.bold)
                        }
                        End::Turn(b, _) => leaf::standing(&b, &scale),
                    }
                })
                .collect();
            scores.by_reply.push(row);
        }
        scores
    }

    /// The candidates at a search point and the one the search chose, remembered so the turn's
    /// later decisions don't search again: the key covers everything the search reads, so a
    /// remembered choice is the one a fresh search makes, only sooner.
    fn chosen(
        &self,
        point: &SearchPoint,
        me: Seat,
        humans: &[bool],
        extra: Extra,
    ) -> (Vec<Plan>, usize) {
        let (plans, judge) = self.candidates_at(point, me, extra);
        let key = point_key(point, me, humans, self.knobs.hash());
        let chosen = remembered(key, || {
            let scores = self.score(point, me, humans, extra, &plans, &judge);
            self.choose(&scores, plans.len())
        });
        (plans, chosen)
    }
}

impl NativeV2 {
    /// The search at the turn's search point, as lines to read: each candidate's kind, the base
    /// planner's value, where it places, what it captures, its mean score over the replies, and
    /// which is chosen. None away from the turn's own placements. For probes and reviews.
    pub fn explain(&self, input: &BotInput) -> Option<Vec<String>> {
        let point = search_point(input.view, input.history)?;
        let extra = self.extra(input);
        let r = self.search(&point, input.seat, input.humans, extra);
        let means = if r.scores.by_reply.is_empty() {
            vec![f64::NAN; r.candidates.len()]
        } else {
            r.scores.means(r.candidates.len())
        };
        let name = |t: usize| crate::map::TERRITORIES[t].id;
        Some(
            r.candidates
                .iter()
                .zip(means)
                .enumerate()
                .map(|(i, (p, mean))| {
                    let place: Vec<String> = (0..crate::bots::native_v1::board::N)
                        .filter(|&t| p.place[t] > 0)
                        .map(|t| format!("{}+{}", name(t), p.place[t]))
                        .collect();
                    let takes: Vec<&str> = p
                        .capture
                        .as_ref()
                        .map(|cp| {
                            cp.routes
                                .iter()
                                .flat_map(|r| r.path.iter().map(|&t| name(t)))
                                .collect()
                        })
                        .unwrap_or_default();
                    format!(
                        "{} {:?} value {:.4} mean {:.4} | place {} | takes {}",
                        if i == r.chosen { "*" } else { " " },
                        p.kind,
                        p.value,
                        mean,
                        place.join(" "),
                        takes.join(" ")
                    )
                })
                .collect(),
        )
    }
}

impl Bot for NativeV2 {
    fn decide(&self, input: &BotInput) -> Move {
        let extra = self.extra(input);
        let base = MyPlay {
            base: &self.ctx.base,
            extra,
            plan: None,
            feed: self.feed_weight(),
        };
        match input.options {
            Options::Reinforce(r) if self.knobs.replies > 0 && r.may_place => {
                // Trading is the base bot's call, made before the first placement, so the search
                // point comes after it.
                if !r.sets.is_empty() {
                    let mv = base.decide(input);
                    if matches!(mv, Move::Trade { .. }) {
                        return mv;
                    }
                }
                let Some(point) = search_point(input.view, input.history) else {
                    return base.decide(input);
                };
                let (plans, chosen) = self.chosen(&point, input.seat, input.humans, extra);
                let Some((territory, armies)) = next_placement(&plans[chosen].place, &point.placed)
                else {
                    return base.decide(input);
                };
                assert!(
                    armies <= r.armies_to_place,
                    "the plan places {armies} with {} to place",
                    r.armies_to_place
                );
                Move::Place {
                    territory: territory as u8,
                    armies,
                }
            }
            Options::Attack(_) | Options::Occupy { .. } if self.knobs.execute == 1 => {
                let Some((view, first)) = turn::turn_point(input.view, input.history) else {
                    return base.decide(input);
                };
                let point = SearchPoint {
                    view,
                    history: &input.history[..first],
                    placed: [0; crate::bots::native_v1::board::N],
                };
                let (plans, chosen) = self.chosen(&point, input.seat, input.humans, extra);
                MyPlay {
                    plan: Some((&plans[chosen], input.view.turn)),
                    ..base
                }
                .decide(input)
            }
            _ => base.decide(input),
        }
    }
}

#[cfg(test)]
mod tests;

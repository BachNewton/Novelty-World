//! native-v1's settings, in the project's two kinds (`ideas/native-v1.md`, `ideas/rule-bot-v1.md`
//! §3): PREFERENCES say what the bot itself values and may be tuned; the OPPONENT MODEL says how
//! the other seats behave and is pinned, because a model of others tuned by self-play learns a
//! convenient fiction.

use super::board::mix128;

/// What I value. Each is read by my own equity only, unless its note says otherwise.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Preferences {
    /// Turns of income a player's power counts: every player's alike, and the turns a broken
    /// continent of mine is worth.
    pub income_horizon: f64,
    /// My cards' worth: card grabs, kill payoffs, trade or hold, next turn's kill.
    pub my_card_weight: f64,
    /// My continents' bonuses in my power and in what a blow against me costs.
    pub my_continent_weight: f64,
    /// A kill plan must beat the best plan that isn't one by this much.
    pub kill_commit_margin: f64,
    /// My fear of being eliminated before my next turn.
    pub vulnerability_weight: f64,
    /// My expected border losses.
    pub border_weight: f64,
    /// Armies with no enemy beside them.
    pub idle_weight: f64,
    /// Next turn's best kill, as a share of its payoff.
    pub opportunity_weight: f64,
    /// Another seat's power past the common-threat bar, against me.
    pub common_threat_weight: f64,
    /// My own power past that bar, when I am the threat.
    pub lead_penalty_weight: f64,
}

/// How the other seats behave: measured, never tuned.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OpponentModel {
    /// A player whose power is this many times every other's is everyone's target, at 4 players;
    /// the bar rises by `leader_ratio_per_player` a player more. Read for others and for me.
    pub leader_ratio: f64,
    pub leader_ratio_per_player: f64,
    /// An opponent takes a kill this likely whether or not it pays; below it, an unpaid kill only
    /// at `unpaid_kill_chance`.
    pub kill_bar: f64,
    pub unpaid_kill_chance: f64,
    /// The aim at me with no common threat: my share of what its turn could do to each
    /// neighbour, pulled toward an even split, keeping this much of the gap.
    pub aim_slope: f64,
    /// The aim at me while I am the common threat.
    pub leader_aim: f64,
    /// The aim at me while another seat is the threat and the opponent isn't it.
    pub ally_aim: f64,
    /// How many captures the aim's prior counts as against this game's record.
    pub history_prior: f64,
    /// Each turn of an opponent's counts this much of the one after it in its record.
    pub history_decay: f64,
    /// The chance an opponent takes a kill open to it, per unit of its chance: of a third player,
    /// and of me.
    pub kill_rate: f64,
    pub my_kill_rate: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Params {
    /// While more than `small_table_seats` are alive, or fewer than 3.
    pub prefs: Preferences,
    /// While 3 to `small_table_seats` are alive.
    pub small_table: Preferences,
    pub small_table_seats: usize,
    pub opponents: OpponentModel,
}

impl Params {
    /// The preferences a table plays by, from the seats still alive.
    pub fn prefs_for(&self, alive: usize) -> &Preferences {
        if (3..=self.small_table_seats).contains(&alive) {
            &self.small_table
        } else {
            &self.prefs
        }
    }
}

impl Preferences {
    /// The preferences as a hash, for memos of answers that read them.
    pub fn hash(&self) -> u128 {
        [
            self.income_horizon,
            self.my_card_weight,
            self.my_continent_weight,
            self.kill_commit_margin,
            self.vulnerability_weight,
            self.border_weight,
            self.idle_weight,
            self.opportunity_weight,
            self.common_threat_weight,
            self.lead_penalty_weight,
        ]
        .iter()
        .fold(0, |h: u128, x| {
            mix128((h >> 64) as u64 ^ h as u64, x.to_bits()) ^ h.rotate_left(7)
        })
    }
}

/// The large table's preferences are rule-v3's, the small table's rule-v4's (tuned against a mixed
/// field), the opponent model rule-v4's measured beliefs: the evaluation they weigh is the same.
pub const NATIVE_V1: Params = Params {
    prefs: Preferences {
        income_horizon: 3.0,
        my_card_weight: 1.0,
        my_continent_weight: 1.0,
        kill_commit_margin: 0.0,
        vulnerability_weight: 1.0,
        border_weight: 0.5,
        idle_weight: 0.3,
        opportunity_weight: 0.5,
        common_threat_weight: 1.0,
        lead_penalty_weight: 0.1,
    },
    small_table: Preferences {
        income_horizon: 1.5,
        my_card_weight: 1.229,
        my_continent_weight: 1.8312,
        kill_commit_margin: -0.0292,
        vulnerability_weight: 0.4289,
        border_weight: 0.4862,
        idle_weight: 0.2252,
        opportunity_weight: 0.0,
        common_threat_weight: 1.9327,
        lead_penalty_weight: 0.0076,
    },
    small_table_seats: 5,
    opponents: OpponentModel {
        leader_ratio: 1.3,
        leader_ratio_per_player: 0.1,
        kill_bar: 0.6,
        unpaid_kill_chance: 0.5,
        aim_slope: 0.5,
        leader_aim: 0.7,
        ally_aim: 0.3,
        history_prior: 6.0,
        history_decay: 0.7,
        kill_rate: 0.25,
        my_kill_rate: 0.5,
    },
};

//! rule-v6.1's settings (`ideas/rule-bot-v6.1.md`), designed into native-v1's evaluation: how the
//! border loss gathers the opponents, how armies enter a seat's power, whether the border weight
//! eases as the board's armies outgrow its income, and the table-size gates. With every setting
//! off (`Knobs::OFF`) native-v1 is native-v1, float for float.
//!
//! A label carries them as rule-v6.1's tuned labels do, by the same names:
//! `native-v1~{"power":"armies","armyRounds":10,"armyBeyond":0.75,"reprice":"full"}`.

use super::board::mix128;
use serde::Deserialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BorderMode {
    /// Every opponent's aim × hit added up (native-v1's).
    Sum,
    /// The single largest.
    Max,
    /// Their mean over the opponents that reach me.
    Mean,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PowerMode {
    /// Every army at full value for ever (native-v1's).
    Face,
    /// A seat's armies count fully up to `army_rounds` rounds of its board income and at
    /// `army_beyond` each past that.
    Armies,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Reprice {
    /// The re-priced power reaches the value only (its share, total and threat terms); the
    /// opponents' aims and the planner's plans read the threat face power names.
    Value,
    /// It reaches the opponents' aims and the planner's threat plans too.
    Full,
}

#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase", default)]
pub struct Knobs {
    pub border: BorderMode,
    /// Multiplies the border weight in force (rule-v6.1's C3, at both tables' preferences alike).
    pub border_scale: f64,
    pub power: PowerMode,
    pub army_rounds: f64,
    pub army_beyond: f64,
    pub reprice: Reprice,
    /// The border weight times min(1, k × the board's income ÷ its armies); 0 is off.
    pub attrition: f64,
    /// Every setting applies only at a table that started with at least this many seats...
    pub min_players: usize,
    /// ...and while at least this many are alive at the decision.
    pub min_alive: usize,
    /// `attrition` alone applies only while at least this many seats are alive.
    pub attrition_alive: usize,
    /// Not a rule-v6.1 setting: the most seats alive at which the small table's preferences are
    /// played, when not 0 (native-v1's own is 5; rule-v6's is 4). It moves no other setting.
    pub small_table_seats: usize,
}

impl Default for Knobs {
    fn default() -> Knobs {
        Knobs::OFF
    }
}

impl Knobs {
    pub const OFF: Knobs = Knobs {
        border: BorderMode::Sum,
        border_scale: 1.0,
        power: PowerMode::Face,
        army_rounds: 6.0,
        army_beyond: 0.25,
        reprice: Reprice::Value,
        attrition: 0.0,
        min_players: 0,
        min_alive: 0,
        attrition_alive: 0,
        small_table_seats: 0,
    };

    /// Reads a label's settings, loudly.
    pub fn parse(json: &str) -> Result<Knobs, String> {
        let k: Knobs =
            serde_json::from_str(json).map_err(|e| format!("native-v1 settings {json}: {e}"))?;
        if k.army_rounds.is_nan() || k.army_rounds < 0.0 || !(0.0..=1.0).contains(&k.army_beyond) {
            return Err(format!(
                "native-v1 settings {json}: armyRounds is 0 or more, armyBeyond 0 to 1"
            ));
        }
        if k.attrition.is_nan()
            || k.attrition < 0.0
            || k.border_scale.is_nan()
            || k.border_scale < 0.0
        {
            return Err(format!(
                "native-v1 settings {json}: attrition and borderScale are 0 or more"
            ));
        }
        Ok(k)
    }

    /// Whether these settings leave native-v1's own value.
    pub fn is_off(&self) -> bool {
        self.border == BorderMode::Sum
            && self.border_scale == 1.0
            && self.power == PowerMode::Face
            && self.attrition == 0.0
    }

    /// The settings a decision plays by at a table that started with `players` seats and has
    /// `alive` left. Read once per decision, so every board one decision scores is scored alike.
    pub fn in_effect(&self, players: usize, alive: usize) -> Knobs {
        if players < self.min_players || alive < self.min_alive {
            return Knobs::OFF;
        }
        let mut k = *self;
        k.small_table_seats = 0;
        if alive < self.attrition_alive {
            k.attrition = 0.0;
        }
        if k.is_off() {
            Knobs::OFF
        } else {
            k
        }
    }

    pub fn armies_priced(&self) -> bool {
        self.power == PowerMode::Armies
    }

    /// A seat's armies as `power` counts them.
    pub fn priced_armies(&self, armies: f64, income: f64) -> f64 {
        let cap = self.army_rounds * income;
        if armies <= cap {
            armies
        } else {
            cap + self.army_beyond * (armies - cap)
        }
    }

    /// The settings as a hash, for memos of answers that read them; 0 when off.
    pub fn hash(&self) -> u128 {
        if self.is_off() {
            return 0;
        }
        [
            self.border as u64 as f64,
            self.border_scale,
            self.power as u64 as f64,
            self.army_rounds,
            self.army_beyond,
            self.reprice as u64 as f64,
            self.attrition,
        ]
        .iter()
        .fold(0x6b6e_6f62, |h: u128, x| {
            mix128((h >> 64) as u64 ^ h as u64, x.to_bits()) ^ h.rotate_left(11)
        })
    }
}

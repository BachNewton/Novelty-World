//! native-v2's knobs (`ideas/native-v2.md`): the search's budget and the switches, each off by
//! default. A label carries them by these names, as rule-v7's tuned labels carry its budget:
//! `native-v2~{"replies":16,"execute":1,"margin":2}`. Every knob is a fixed amount of work or a
//! rule, never a clock.

use serde::Deserialize;

#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase", default)]
pub struct Knobs {
    /// Imagined rounds played per candidate. 0 plays v6.1 natively.
    pub replies: u32,
    /// Candidates searched, the base plan's choice first (without `kinds`).
    pub candidates: u32,
    /// Whether the opponents in a reply are drawn from the mix (1) or are all v6.1 (0).
    pub mixed: u32,
    /// Rounds of the opponents' turns a reply plays before its end is scored; my own turns between
    /// are v6.1's.
    pub rounds: u32,
    /// `execute`: the chosen candidate's whole plan is carried out (1).
    pub execute: u32,
    /// `kinds`: the best of each kind of plan, this many of each; 0 is v6.1's top `candidates`.
    pub kinds: u32,
    /// `margin`: the search leaves the base plan only when the paired difference across replies
    /// exceeds this many of its standard errors; 0 is the plain best mean.
    pub margin: f64,
    /// `feed`: the weight of the leaf's charge for the kills a board opens to another opponent,
    /// and of a rival's death by another seat kept out of my share; 0 is off.
    pub feed: f64,
    /// `humans`: a person's seat is believed to take the kills open to it, its kill chances count
    /// several stacks and a kill paid for by a first kill's cards, and replies seat vulture-v1 for
    /// it once that bot is registered (1).
    pub humans: u32,
    /// `threat`: the leader is named once a turn by what its next turn could do, on a smooth scale
    /// (1).
    pub threat: u32,
    /// `hoard`: a stack past what its front needs is priced down at any income, and a fortify that
    /// strips a gate facing a bigger stack is charged (1).
    pub hoard: u32,
}

impl Default for Knobs {
    fn default() -> Knobs {
        Knobs::BASELINE
    }
}

impl Knobs {
    /// v7.1's search: 8 replies over 4 candidates, the mixed replies, one round, every switch off.
    pub const BASELINE: Knobs = Knobs {
        replies: 8,
        candidates: 4,
        mixed: 1,
        rounds: 1,
        execute: 0,
        kinds: 0,
        margin: 0.0,
        feed: 0.0,
        humans: 0,
        threat: 0,
        hoard: 0,
    };

    /// Reads a label's knobs, loudly.
    pub fn parse(json: &str) -> Result<Knobs, String> {
        let k: Knobs =
            serde_json::from_str(json).map_err(|e| format!("native-v2 knobs {json}: {e}"))?;
        let switch = |name: &str, v: u32| {
            if v > 1 {
                Err(format!("native-v2 knobs {json}: {name} is 0 or 1"))
            } else {
                Ok(())
            }
        };
        switch("mixed", k.mixed)?;
        switch("execute", k.execute)?;
        switch("humans", k.humans)?;
        switch("threat", k.threat)?;
        switch("hoard", k.hoard)?;
        if k.candidates == 0 || k.rounds == 0 {
            return Err(format!(
                "native-v2 knobs {json}: candidates and rounds are 1 or more"
            ));
        }
        if k.margin.is_nan() || k.margin < 0.0 || k.feed.is_nan() || k.feed < 0.0 {
            return Err(format!(
                "native-v2 knobs {json}: margin and feed are 0 or more"
            ));
        }
        Ok(k)
    }

    pub fn hash(&self) -> u64 {
        [
            self.replies as f64,
            self.candidates as f64,
            self.mixed as f64,
            self.rounds as f64,
            self.execute as f64,
            self.kinds as f64,
            self.margin,
            self.feed,
            self.humans as f64,
            self.threat as f64,
            self.hoard as f64,
        ]
        .iter()
        .fold(0x006e_7632_u64, |h, x| {
            (h ^ x.to_bits())
                .wrapping_mul(0x100_0000_01b3)
                .rotate_left(29)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_label_moves_only_what_it_names() {
        let k = Knobs::parse(r#"{"replies":16,"execute":1,"margin":2.5}"#).unwrap();
        assert_eq!(
            k,
            Knobs {
                replies: 16,
                execute: 1,
                margin: 2.5,
                ..Knobs::BASELINE
            }
        );
        assert_eq!(Knobs::parse("{}").unwrap(), Knobs::BASELINE);
    }

    #[test]
    fn a_bad_label_says_what_is_wrong() {
        assert!(Knobs::parse(r#"{"replys":8}"#)
            .unwrap_err()
            .contains("replys"));
        assert!(Knobs::parse(r#"{"execute":2}"#)
            .unwrap_err()
            .contains("execute"));
        assert!(Knobs::parse(r#"{"margin":-1}"#).is_err());
        assert!(Knobs::parse(r#"{"candidates":0}"#).is_err());
    }
}

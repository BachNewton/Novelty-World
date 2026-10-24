//! The TypeScript contract's JSON (`contract.ts`'s `GameView`, `Options`, `GameEvent` and `Move`),
//! read into the crate's own shapes and written back, so a native bot can answer a seat at a table
//! the TypeScript runner plays (`bots-serve`). Territories and continents are named by their
//! `map.ts` ids, cards by their territory's id or `wild-1` / `wild-2`.

use crate::cards::{Card, WILD_1, WILD_2};
use crate::engine::{
    Attack, AttackOptions, ContinentBonus, Event, EventKind, FortifyOptions, FortifySource, Move,
    OccupyingView, Options, Phase, ReinforceOptions, Seat, SeatView, Territory, TerritoryView,
    Trade, TradeBonus, View, MAX_SEATS,
};
use crate::list::List;
use crate::map::{CONTINENTS, TERRITORIES, TERRITORY_COUNT};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::sync::{Mutex, OnceLock};

fn territory(id: &str) -> Result<Territory, String> {
    TERRITORIES
        .iter()
        .position(|t| t.id == id)
        .map(|i| i as Territory)
        .ok_or_else(|| format!("no territory \"{id}\""))
}

fn territory_id(t: Territory) -> String {
    TERRITORIES[t as usize].id.to_string()
}

fn card(id: &str) -> Result<Card, String> {
    match id {
        "wild-1" => Ok(WILD_1),
        "wild-2" => Ok(WILD_2),
        _ => territory(id).map_err(|_| format!("no card \"{id}\"")),
    }
}

fn card_id(c: Card) -> String {
    match c {
        WILD_1 => "wild-1".into(),
        WILD_2 => "wild-2".into(),
        _ => territory_id(c),
    }
}

fn cards3(ids: &[String; 3]) -> Result<[Card; 3], String> {
    Ok([card(&ids[0])?, card(&ids[1])?, card(&ids[2])?])
}

fn card_ids3(cards: [Card; 3]) -> [String; 3] {
    cards.map(card_id)
}

fn continent(id: &str) -> Result<u8, String> {
    CONTINENTS
        .iter()
        .position(|c| c.id == id)
        .map(|i| i as u8)
        .ok_or_else(|| format!("no continent \"{id}\""))
}

fn phase(id: &str) -> Result<Phase, String> {
    Ok(match id {
        "reinforce" => Phase::Reinforce,
        "attack" => Phase::Attack,
        "fortify" => Phase::Fortify,
        "game-over" => Phase::GameOver,
        _ => return Err(format!("no phase \"{id}\"")),
    })
}

fn phase_id(p: Phase) -> String {
    match p {
        Phase::Reinforce => "reinforce",
        Phase::Attack => "attack",
        Phase::Fortify => "fortify",
        Phase::GameOver => "game-over",
    }
    .into()
}

fn mask(ids: &[String]) -> Result<u64, String> {
    ids.iter()
        .try_fold(0u64, |m, id| Ok(m | 1 << territory(id)?))
}

fn by_territory<T: Copy + Default>(
    record: &BTreeMap<String, T>,
) -> Result<[T; TERRITORY_COUNT], String> {
    if record.len() != TERRITORY_COUNT {
        return Err(format!(
            "a board names {TERRITORY_COUNT} territories, not {}",
            record.len()
        ));
    }
    let mut out = [T::default(); TERRITORY_COUNT];
    for (id, &value) in record {
        out[territory(id)? as usize] = value;
    }
    Ok(out)
}

fn record_of<T: Copy>(values: &[T; TERRITORY_COUNT]) -> BTreeMap<String, T> {
    values
        .iter()
        .enumerate()
        .map(|(t, &v)| (territory_id(t as Territory), v))
        .collect()
}

/// An event's rule id as the `&'static str` the engine's events carry. The rules are a few dozen
/// ids, so each is leaked once.
fn intern(rule: &str) -> &'static str {
    static RULES: OnceLock<Mutex<HashSet<&'static str>>> = OnceLock::new();
    let mut rules = RULES
        .get_or_init(Default::default)
        .lock()
        .expect("no thread panics holding the rules");
    if let Some(&known) = rules.get(rule) {
        return known;
    }
    let leaked: &'static str = Box::leak(rule.to_owned().into_boxed_str());
    rules.insert(leaked);
    leaked
}

// ---------------------------------------------------------------------------------------------
// GameView
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct TerritoryJson {
    pub owner: Seat,
    pub armies: i32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeatJson {
    pub seat: Seat,
    pub eliminated: bool,
    pub territories: u32,
    pub armies: i32,
    pub hand_size: u8,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TradeJson {
    pub seat: Seat,
    pub cards: [String; 3],
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CardsJson {
    pub deck: u8,
    pub traded: Vec<TradeJson>,
    pub hand: Option<Vec<String>>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OccupyingJson {
    pub from: String,
    pub to: String,
    pub min: i32,
    pub max: i32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewJson {
    pub viewer: Option<Seat>,
    pub turn_order: Vec<Seat>,
    pub seats: Vec<SeatJson>,
    pub territories: BTreeMap<String, TerritoryJson>,
    pub turn: u32,
    pub active: Seat,
    pub phase: String,
    pub armies_to_place: i32,
    pub cards: CardsJson,
    pub occupying: Option<OccupyingJson>,
    pub card_earned: bool,
    pub winner: Option<Seat>,
}

impl ViewJson {
    pub fn to_view(&self) -> Result<View, String> {
        if self.seats.len() > MAX_SEATS || self.turn_order.len() > MAX_SEATS {
            return Err(format!("a table seats at most {MAX_SEATS}"));
        }
        let board = by_territory(&self.territories)?;
        let mut territories = [TerritoryView::default(); TERRITORY_COUNT];
        let mut owned = [0u64; MAX_SEATS];
        for (t, (view, json)) in territories.iter_mut().zip(board).enumerate() {
            if json.owner as usize >= MAX_SEATS {
                return Err(format!("no seat {}", json.owner));
            }
            *view = TerritoryView {
                owner: json.owner,
                armies: json.armies,
            };
            owned[json.owner as usize] |= 1 << t;
        }
        let mut seats = List::new();
        for s in &self.seats {
            seats.push(SeatView {
                seat: s.seat,
                eliminated: s.eliminated,
                territories: s.territories,
                armies: s.armies,
                hand_size: s.hand_size,
            });
        }
        let traded = self
            .cards
            .traded
            .iter()
            .map(|t| {
                Ok(Trade {
                    seat: t.seat,
                    cards: cards3(&t.cards)?,
                })
            })
            .collect::<Result<_, String>>()?;
        let hand = match &self.cards.hand {
            None => None,
            Some(ids) => {
                let cards = ids
                    .iter()
                    .map(|id| card(id))
                    .collect::<Result<Vec<_>, _>>()?;
                Some(List::from_slice(&cards))
            }
        };
        let occupying = match &self.occupying {
            None => None,
            Some(o) => Some(OccupyingView {
                from: territory(&o.from)?,
                to: territory(&o.to)?,
                min: o.min,
                max: o.max,
            }),
        };
        Ok(View {
            viewer: self.viewer,
            turn_order: List::from_slice(&self.turn_order),
            seats,
            territories,
            owned,
            turn: self.turn,
            active: self.active,
            phase: phase(&self.phase)?,
            armies_to_place: self.armies_to_place,
            deck: self.cards.deck,
            traded,
            hand,
            occupying,
            card_earned: self.card_earned,
            winner: self.winner,
        })
    }

    pub fn from_view(v: &View) -> ViewJson {
        let board = v.territories.map(|t| TerritoryJson {
            owner: t.owner,
            armies: t.armies,
        });
        ViewJson {
            viewer: v.viewer,
            turn_order: v.turn_order.to_vec(),
            seats: v
                .seats
                .iter()
                .map(|s| SeatJson {
                    seat: s.seat,
                    eliminated: s.eliminated,
                    territories: s.territories,
                    armies: s.armies,
                    hand_size: s.hand_size,
                })
                .collect(),
            territories: record_of(&board),
            turn: v.turn,
            active: v.active,
            phase: phase_id(v.phase),
            armies_to_place: v.armies_to_place,
            cards: CardsJson {
                deck: v.deck,
                traded: v
                    .traded
                    .iter()
                    .map(|t| TradeJson {
                        seat: t.seat,
                        cards: card_ids3(t.cards),
                    })
                    .collect(),
                hand: v.hand.map(|h| h.iter().map(|&c| card_id(c)).collect()),
            },
            occupying: v.occupying.map(|o| OccupyingJson {
                from: territory_id(o.from),
                to: territory_id(o.to),
                min: o.min,
                max: o.max,
            }),
            card_earned: v.card_earned,
            winner: v.winner,
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttackJson {
    pub from: String,
    pub to: String,
    pub max_dice: u8,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FortifyMoveJson {
    pub from: String,
    pub to: String,
    pub max_armies: i32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum OptionsJson {
    Reinforce {
        armies_to_place: i32,
        may_place: bool,
        own_territories: Vec<String>,
        must_trade: bool,
        sets: Vec<[String; 3]>,
        bonus_territories: Vec<String>,
    },
    Attack {
        attacks: Vec<AttackJson>,
    },
    Occupy {
        from: String,
        to: String,
        min: i32,
        max: i32,
    },
    Fortify {
        moves: Vec<FortifyMoveJson>,
    },
}

impl OptionsJson {
    /// The options as the engine groups them. A fortify's options are its sources with their
    /// reach, which the moves list spells out, and the seat's territories, which `own` gives.
    pub fn to_options(&self, own: u64) -> Result<Options, String> {
        Ok(match self {
            OptionsJson::Reinforce {
                armies_to_place,
                may_place,
                own_territories,
                must_trade,
                sets,
                bonus_territories,
            } => {
                let mut set_list = List::new();
                for set in sets {
                    set_list.push(cards3(set)?);
                }
                let bonus = bonus_territories
                    .iter()
                    .map(|id| territory(id))
                    .collect::<Result<Vec<_>, _>>()?;
                Options::Reinforce(ReinforceOptions {
                    armies_to_place: *armies_to_place,
                    may_place: *may_place,
                    must_trade: *must_trade,
                    own: mask(own_territories)?,
                    sets: set_list,
                    bonus_territories: List::from_slice(&bonus),
                })
            }
            OptionsJson::Attack { attacks } => {
                let mut list = List::new();
                for a in attacks {
                    list.push(Attack {
                        from: territory(&a.from)?,
                        to: territory(&a.to)?,
                        max_dice: a.max_dice,
                    });
                }
                Options::Attack(AttackOptions { attacks: list })
            }
            OptionsJson::Occupy { from, to, min, max } => Options::Occupy {
                from: territory(from)?,
                to: territory(to)?,
                min: *min,
                max: *max,
            },
            OptionsJson::Fortify { moves } => {
                let mut sources: List<FortifySource, TERRITORY_COUNT> = List::new();
                for m in moves {
                    let (from, to) = (territory(&m.from)?, territory(&m.to)?);
                    match sources.iter().position(|s| s.from == from) {
                        Some(i) => sources.as_mut_slice()[i].reach |= 1 << to,
                        None => sources.push(FortifySource {
                            from,
                            max_armies: m.max_armies,
                            reach: 1 << to,
                        }),
                    }
                }
                Options::Fortify(FortifyOptions { own, sources })
            }
        })
    }

    pub fn from_options(options: &Options) -> OptionsJson {
        let ids = |m: u64| {
            (0..TERRITORY_COUNT)
                .filter(|&t| m & 1 << t != 0)
                .map(|t| territory_id(t as Territory))
                .collect()
        };
        match options {
            Options::Reinforce(r) => OptionsJson::Reinforce {
                armies_to_place: r.armies_to_place,
                may_place: r.may_place,
                own_territories: ids(r.own),
                must_trade: r.must_trade,
                sets: r.sets.iter().map(|&s| card_ids3(s)).collect(),
                bonus_territories: r
                    .bonus_territories
                    .iter()
                    .map(|&t| territory_id(t))
                    .collect(),
            },
            Options::Attack(a) => OptionsJson::Attack {
                attacks: a
                    .attacks
                    .iter()
                    .map(|a| AttackJson {
                        from: territory_id(a.from),
                        to: territory_id(a.to),
                        max_dice: a.max_dice,
                    })
                    .collect(),
            },
            &Options::Occupy { from, to, min, max } => OptionsJson::Occupy {
                from: territory_id(from),
                to: territory_id(to),
                min,
                max,
            },
            Options::Fortify(f) => OptionsJson::Fortify {
                moves: f
                    .moves()
                    .map(|m| FortifyMoveJson {
                        from: territory_id(m.from),
                        to: territory_id(m.to),
                        max_armies: m.max_armies,
                    })
                    .collect(),
            },
        }
    }
}

// ---------------------------------------------------------------------------------------------
// GameEvent
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ContinentBonusJson {
    pub continent: String,
    pub bonus: i32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TradeBonusJson {
    pub territory: String,
    pub armies: i32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum EventKindJson {
    TurnOrder {
        order: Vec<Seat>,
    },
    Dealt {
        owners: BTreeMap<String, Seat>,
    },
    StartingArmies {
        armies: BTreeMap<String, i32>,
    },
    Placed {
        owner: Seat,
        territory: String,
        armies: i32,
    },
    Reinforcements {
        seat: Seat,
        from_territories: i32,
        from_continents: Vec<ContinentBonusJson>,
        first_turn_bonus: i32,
    },
    Traded {
        seat: Seat,
        cards: [String; 3],
        armies: i32,
        bonus: Option<TradeBonusJson>,
    },
    Battle {
        from: String,
        to: String,
        attacker_dice: Vec<u8>,
        defender_dice: Vec<u8>,
        attacker_losses: i32,
        defender_losses: i32,
    },
    Blitzed {
        from: String,
        to: String,
        attacker_losses: i32,
        defender_losses: i32,
    },
    Captured {
        seat: Seat,
        territory: String,
        from: Seat,
    },
    Occupied {
        from: String,
        to: String,
        armies: i32,
    },
    Eliminated {
        seat: Seat,
        by: Seat,
        cards_taken: u8,
    },
    CardDrawn {
        seat: Seat,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        card: Option<String>,
    },
    DeckReshuffled,
    Fortified {
        from: String,
        to: String,
        armies: i32,
    },
    TurnStarted {
        seat: Seat,
        turn: u32,
    },
    Phase {
        phase: String,
    },
    GameOver {
        winner: Seat,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EventJson {
    pub rule: String,
    #[serde(flatten)]
    pub kind: EventKindJson,
}

impl EventJson {
    pub fn to_event(&self) -> Result<Event, String> {
        use EventKindJson as J;
        let kind = match &self.kind {
            J::TurnOrder { order } => {
                if order.len() > MAX_SEATS {
                    return Err(format!("a table seats at most {MAX_SEATS}"));
                }
                EventKind::TurnOrder {
                    order: List::from_slice(order),
                }
            }
            J::Dealt { owners } => EventKind::Dealt {
                owners: Box::new(by_territory(owners)?),
            },
            J::StartingArmies { armies } => EventKind::StartingArmies {
                armies: Box::new(by_territory(armies)?),
            },
            J::Placed {
                owner,
                territory: t,
                armies,
            } => EventKind::Placed {
                owner: *owner,
                territory: territory(t)?,
                armies: *armies,
            },
            J::Reinforcements {
                seat,
                from_territories,
                from_continents,
                first_turn_bonus,
            } => {
                let mut bonuses = List::new();
                for b in from_continents {
                    bonuses.push(ContinentBonus {
                        continent: continent(&b.continent)?,
                        bonus: b.bonus,
                    });
                }
                EventKind::Reinforcements {
                    seat: *seat,
                    from_territories: *from_territories,
                    from_continents: bonuses,
                    first_turn_bonus: *first_turn_bonus,
                }
            }
            J::Traded {
                seat,
                cards,
                armies,
                bonus,
            } => EventKind::Traded {
                seat: *seat,
                cards: cards3(cards)?,
                armies: *armies,
                bonus: match bonus {
                    None => None,
                    Some(b) => Some(TradeBonus {
                        territory: territory(&b.territory)?,
                        armies: b.armies,
                    }),
                },
            },
            J::Battle {
                from,
                to,
                attacker_dice,
                defender_dice,
                attacker_losses,
                defender_losses,
            } => {
                if attacker_dice.len() > 3 || defender_dice.len() > 2 {
                    return Err("a battle rolls at most 3 dice against 2".into());
                }
                EventKind::Battle {
                    from: territory(from)?,
                    to: territory(to)?,
                    attacker_dice: List::from_slice(attacker_dice),
                    defender_dice: List::from_slice(defender_dice),
                    attacker_losses: *attacker_losses,
                    defender_losses: *defender_losses,
                }
            }
            J::Blitzed {
                from,
                to,
                attacker_losses,
                defender_losses,
            } => EventKind::Blitzed {
                from: territory(from)?,
                to: territory(to)?,
                attacker_losses: *attacker_losses,
                defender_losses: *defender_losses,
            },
            J::Captured {
                seat,
                territory: t,
                from,
            } => EventKind::Captured {
                seat: *seat,
                territory: territory(t)?,
                from: *from,
            },
            J::Occupied { from, to, armies } => EventKind::Occupied {
                from: territory(from)?,
                to: territory(to)?,
                armies: *armies,
            },
            J::Eliminated {
                seat,
                by,
                cards_taken,
            } => EventKind::Eliminated {
                seat: *seat,
                by: *by,
                cards_taken: *cards_taken,
            },
            J::CardDrawn { seat, card: c } => EventKind::CardDrawn {
                seat: *seat,
                card: c.as_deref().map(card).transpose()?,
            },
            J::DeckReshuffled => EventKind::DeckReshuffled,
            J::Fortified { from, to, armies } => EventKind::Fortified {
                from: territory(from)?,
                to: territory(to)?,
                armies: *armies,
            },
            J::TurnStarted { seat, turn } => EventKind::TurnStarted {
                seat: *seat,
                turn: *turn,
            },
            J::Phase { phase: p } => EventKind::Phase { phase: phase(p)? },
            J::GameOver { winner } => EventKind::GameOver { winner: *winner },
        };
        Ok(Event {
            rule: intern(&self.rule),
            kind,
        })
    }

    pub fn from_event(event: &Event) -> EventJson {
        use EventKindJson as J;
        let kind = match &event.kind {
            EventKind::TurnOrder { order } => J::TurnOrder {
                order: order.to_vec(),
            },
            EventKind::Dealt { owners } => J::Dealt {
                owners: record_of(owners),
            },
            EventKind::StartingArmies { armies } => J::StartingArmies {
                armies: record_of(armies),
            },
            &EventKind::Placed {
                owner,
                territory,
                armies,
            } => J::Placed {
                owner,
                territory: territory_id(territory),
                armies,
            },
            EventKind::Reinforcements {
                seat,
                from_territories,
                from_continents,
                first_turn_bonus,
            } => J::Reinforcements {
                seat: *seat,
                from_territories: *from_territories,
                from_continents: from_continents
                    .iter()
                    .map(|b| ContinentBonusJson {
                        continent: CONTINENTS[b.continent as usize].id.into(),
                        bonus: b.bonus,
                    })
                    .collect(),
                first_turn_bonus: *first_turn_bonus,
            },
            &EventKind::Traded {
                seat,
                cards,
                armies,
                bonus,
            } => J::Traded {
                seat,
                cards: card_ids3(cards),
                armies,
                bonus: bonus.map(|b| TradeBonusJson {
                    territory: territory_id(b.territory),
                    armies: b.armies,
                }),
            },
            EventKind::Battle {
                from,
                to,
                attacker_dice,
                defender_dice,
                attacker_losses,
                defender_losses,
            } => J::Battle {
                from: territory_id(*from),
                to: territory_id(*to),
                attacker_dice: attacker_dice.to_vec(),
                defender_dice: defender_dice.to_vec(),
                attacker_losses: *attacker_losses,
                defender_losses: *defender_losses,
            },
            &EventKind::Blitzed {
                from,
                to,
                attacker_losses,
                defender_losses,
            } => J::Blitzed {
                from: territory_id(from),
                to: territory_id(to),
                attacker_losses,
                defender_losses,
            },
            &EventKind::Captured {
                seat,
                territory,
                from,
            } => J::Captured {
                seat,
                territory: territory_id(territory),
                from,
            },
            &EventKind::Occupied { from, to, armies } => J::Occupied {
                from: territory_id(from),
                to: territory_id(to),
                armies,
            },
            &EventKind::Eliminated {
                seat,
                by,
                cards_taken,
            } => J::Eliminated {
                seat,
                by,
                cards_taken,
            },
            &EventKind::CardDrawn { seat, card } => J::CardDrawn {
                seat,
                card: card.map(card_id),
            },
            EventKind::DeckReshuffled => J::DeckReshuffled,
            &EventKind::Fortified { from, to, armies } => J::Fortified {
                from: territory_id(from),
                to: territory_id(to),
                armies,
            },
            &EventKind::TurnStarted { seat, turn } => J::TurnStarted { seat, turn },
            &EventKind::Phase { phase } => J::Phase {
                phase: phase_id(phase),
            },
            &EventKind::GameOver { winner } => J::GameOver { winner },
        };
        EventJson {
            rule: event.rule.to_string(),
            kind,
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum MoveJson {
    Place {
        territory: String,
        armies: i32,
    },
    Trade {
        cards: [String; 3],
        #[serde(default, skip_serializing_if = "Option::is_none")]
        bonus_territory: Option<String>,
    },
    Attack {
        from: String,
        to: String,
        dice: u8,
    },
    Blitz {
        from: String,
        to: String,
        keep_at_least: i32,
    },
    Occupy {
        armies: i32,
    },
    EndAttack,
    Fortify {
        from: String,
        to: String,
        armies: i32,
    },
    EndTurn,
}

impl MoveJson {
    pub fn from_move(mv: Move) -> MoveJson {
        match mv {
            Move::Place { territory, armies } => MoveJson::Place {
                territory: territory_id(territory),
                armies,
            },
            Move::Trade { cards, bonus } => MoveJson::Trade {
                cards: card_ids3(cards),
                bonus_territory: bonus.map(territory_id),
            },
            Move::Attack { from, to, dice } => MoveJson::Attack {
                from: territory_id(from),
                to: territory_id(to),
                dice,
            },
            Move::Blitz {
                from,
                to,
                keep_at_least,
            } => MoveJson::Blitz {
                from: territory_id(from),
                to: territory_id(to),
                keep_at_least,
            },
            Move::Occupy { armies } => MoveJson::Occupy { armies },
            Move::EndAttack => MoveJson::EndAttack,
            Move::Fortify { from, to, armies } => MoveJson::Fortify {
                from: territory_id(from),
                to: territory_id(to),
                armies,
            },
            Move::EndTurn => MoveJson::EndTurn,
        }
    }

    pub fn to_move(&self) -> Result<Move, String> {
        Ok(match self {
            MoveJson::Place {
                territory: t,
                armies,
            } => Move::Place {
                territory: territory(t)?,
                armies: *armies,
            },
            MoveJson::Trade {
                cards,
                bonus_territory,
            } => Move::Trade {
                cards: cards3(cards)?,
                bonus: bonus_territory.as_deref().map(territory).transpose()?,
            },
            MoveJson::Attack { from, to, dice } => Move::Attack {
                from: territory(from)?,
                to: territory(to)?,
                dice: *dice,
            },
            MoveJson::Blitz {
                from,
                to,
                keep_at_least,
            } => Move::Blitz {
                from: territory(from)?,
                to: territory(to)?,
                keep_at_least: *keep_at_least,
            },
            MoveJson::Occupy { armies } => Move::Occupy { armies: *armies },
            MoveJson::EndAttack => Move::EndAttack,
            MoveJson::Fortify { from, to, armies } => Move::Fortify {
                from: territory(from)?,
                to: territory(to)?,
                armies: *armies,
            },
            MoveJson::EndTurn => Move::EndTurn,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bots::bot;
    use crate::record::{decode_move, encode_move};
    use crate::runner::drive;

    #[test]
    fn every_kind_of_move_reads_as_the_record_format_does() {
        let cases = [
            (
                r#"{"kind":"place","territory":"alaska","armies":3}"#,
                [0, 0, 3, 0, 0],
            ),
            (
                r#"{"kind":"trade","cards":["alaska","wild-1","wild-2"],"bonusTerritory":"alaska"}"#,
                [1, 0, 42, 43, 0],
            ),
            (
                r#"{"kind":"trade","cards":["alaska","alberta","wild-2"]}"#,
                [1, 0, 3, 43, -1],
            ),
            (
                r#"{"kind":"attack","from":"alaska","to":"kamchatka","dice":3}"#,
                [2, 0, territory("kamchatka").unwrap() as i64, 3, 0],
            ),
            (
                r#"{"kind":"blitz","from":"alaska","to":"alberta","keepAtLeast":2}"#,
                [3, 0, 3, 2, 0],
            ),
            (r#"{"kind":"occupy","armies":4}"#, [4, 4, 0, 0, 0]),
            (r#"{"kind":"end-attack"}"#, [5, 0, 0, 0, 0]),
            (
                r#"{"kind":"fortify","from":"alberta","to":"alaska","armies":1}"#,
                [6, 3, 0, 1, 0],
            ),
            (r#"{"kind":"end-turn"}"#, [7, 0, 0, 0, 0]),
        ];
        for (json, fields) in cases {
            let wire: MoveJson = serde_json::from_str(json).unwrap();
            let mv = wire.to_move().unwrap();
            assert_eq!(mv, decode_move(&fields).unwrap(), "{json}");
            let back = serde_json::to_string(&MoveJson::from_move(mv)).unwrap();
            assert_eq!(back, json);
            assert_eq!(decode_move(&encode_move(mv)).unwrap(), mv);
        }
    }

    #[test]
    fn a_bad_id_fails_loudly() {
        let wire: MoveJson =
            serde_json::from_str(r#"{"kind":"place","territory":"atlantis","armies":3}"#).unwrap();
        assert_eq!(wire.to_move().unwrap_err(), "no territory \"atlantis\"");
    }

    /// Every decision of whole native games, its view, options and history written as the
    /// TypeScript contract's JSON and read back, comes back the same, and the bot decides the
    /// same on what was read.
    #[test]
    fn every_input_of_whole_games_reads_back_the_same() {
        for (seed, labels) in [
            (
                "wire-1",
                ["gd-stacker", "greedy", "gd-aggressive"].as_slice(),
            ),
            (
                "wire-2",
                [
                    "gd-continental",
                    "gd-defensive",
                    "greedy",
                    "random",
                    "gd-stacker",
                ]
                .as_slice(),
            ),
        ] {
            let bots: Vec<_> = labels.iter().map(|l| bot(l).unwrap()).collect();
            // Each seat's history as read back, grown by the events new since its last decision.
            let mut read_back: Vec<Vec<Event>> = vec![Vec::new(); labels.len()];
            drive(
                seed,
                labels.len(),
                600,
                |_, input| {
                    let view_json =
                        serde_json::to_string(&ViewJson::from_view(input.view)).unwrap();
                    let view = serde_json::from_str::<ViewJson>(&view_json)
                        .unwrap()
                        .to_view()
                        .unwrap();
                    assert_eq!(&view, input.view);
                    let options_json =
                        serde_json::to_string(&OptionsJson::from_options(input.options)).unwrap();
                    let options = serde_json::from_str::<OptionsJson>(&options_json)
                        .unwrap()
                        .to_options(view.owned[input.seat as usize])
                        .unwrap();
                    assert_eq!(&options, input.options);
                    let history = &mut read_back[input.seat as usize];
                    for e in &input.history[history.len()..] {
                        let json = serde_json::to_string(&EventJson::from_event(e)).unwrap();
                        history.push(
                            serde_json::from_str::<EventJson>(&json)
                                .unwrap()
                                .to_event()
                                .unwrap(),
                        );
                    }
                    assert_eq!(history.as_slice(), input.history);
                    let mv = bots[input.seat as usize].decide(input);
                    let read = crate::bot::BotInput {
                        view: &view,
                        options: &options,
                        history,
                        events: &history[history.len() - input.events.len()..],
                        ..*input
                    };
                    assert_eq!(bots[input.seat as usize].decide(&read), mv);
                    Ok(mv)
                },
                |_| {},
            )
            .unwrap();
        }
    }
}

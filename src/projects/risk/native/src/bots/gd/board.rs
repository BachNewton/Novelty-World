//! `bots/gd/board.ts`: the board as GD's AI walks it. GD's ties go to whichever candidate it
//! visits first, so the order matters: territories by their ids, which are alphabetical (that the
//! scene's array holds them in id order is PORT.md's open reading 1), and each territory's
//! neighbours in the order its map asset lists them.

use crate::engine::{first_turn_bonus, Seat, Territory, TerritoryView, View};
use crate::map::{CONTINENTS, TERRITORIES, TERRITORY_COUNT};
use std::sync::OnceLock;

/// Every territory with its links, in GD's order.
const GD_MAP: [(&str, &[&str]); TERRITORY_COUNT] = [
    (
        "afghanistan",
        &["china", "india", "ural", "ukraine", "middle-east"],
    ),
    ("alaska", &["alberta", "northwest-territory", "kamchatka"]),
    (
        "alberta",
        &[
            "western-united-states",
            "alaska",
            "ontario",
            "northwest-territory",
        ],
    ),
    ("argentina", &["brazil", "peru"]),
    (
        "brazil",
        &["north-africa", "argentina", "peru", "venezuela"],
    ),
    (
        "central-america",
        &[
            "venezuela",
            "western-united-states",
            "eastern-united-states",
        ],
    ),
    (
        "china",
        &[
            "mongolia",
            "siam",
            "siberia",
            "afghanistan",
            "india",
            "ural",
        ],
    ),
    ("congo", &["south-africa", "north-africa", "east-africa"]),
    (
        "east-africa",
        &[
            "middle-east",
            "madagascar",
            "egypt",
            "north-africa",
            "south-africa",
            "congo",
        ],
    ),
    ("eastern-australia", &["new-guinea", "western-australia"]),
    (
        "eastern-united-states",
        &[
            "quebec",
            "central-america",
            "western-united-states",
            "ontario",
        ],
    ),
    (
        "egypt",
        &[
            "middle-east",
            "east-africa",
            "north-africa",
            "southern-europe",
        ],
    ),
    (
        "great-britain",
        &[
            "western-europe",
            "iceland",
            "scandinavia",
            "northern-europe",
        ],
    ),
    (
        "greenland",
        &["northwest-territory", "iceland", "quebec", "ontario"],
    ),
    ("iceland", &["greenland", "scandinavia", "great-britain"]),
    ("india", &["siam", "middle-east", "afghanistan", "china"]),
    ("indonesia", &["new-guinea", "western-australia", "siam"]),
    ("irkutsk", &["yakutsk", "kamchatka", "siberia", "mongolia"]),
    ("japan", &["kamchatka", "mongolia"]),
    (
        "kamchatka",
        &["yakutsk", "japan", "irkutsk", "mongolia", "alaska"],
    ),
    ("madagascar", &["east-africa", "south-africa"]),
    (
        "middle-east",
        &[
            "india",
            "east-africa",
            "ukraine",
            "afghanistan",
            "southern-europe",
            "egypt",
        ],
    ),
    (
        "mongolia",
        &["japan", "china", "kamchatka", "siberia", "irkutsk"],
    ),
    (
        "new-guinea",
        &["indonesia", "eastern-australia", "western-australia"],
    ),
    (
        "north-africa",
        &[
            "congo",
            "brazil",
            "western-europe",
            "southern-europe",
            "east-africa",
            "egypt",
        ],
    ),
    (
        "northern-europe",
        &[
            "southern-europe",
            "western-europe",
            "scandinavia",
            "great-britain",
            "ukraine",
        ],
    ),
    (
        "northwest-territory",
        &["alaska", "greenland", "ontario", "alberta"],
    ),
    (
        "ontario",
        &[
            "alberta",
            "northwest-territory",
            "western-united-states",
            "greenland",
            "quebec",
            "eastern-united-states",
        ],
    ),
    ("peru", &["argentina", "venezuela", "brazil"]),
    ("quebec", &["greenland", "eastern-united-states", "ontario"]),
    (
        "scandinavia",
        &["iceland", "ukraine", "northern-europe", "great-britain"],
    ),
    ("siam", &["indonesia", "india", "china"]),
    (
        "siberia",
        &["ural", "yakutsk", "mongolia", "china", "irkutsk"],
    ),
    ("south-africa", &["madagascar", "congo", "east-africa"]),
    (
        "southern-europe",
        &[
            "western-europe",
            "north-africa",
            "northern-europe",
            "ukraine",
            "middle-east",
            "egypt",
        ],
    ),
    (
        "ukraine",
        &[
            "scandinavia",
            "ural",
            "afghanistan",
            "middle-east",
            "northern-europe",
            "southern-europe",
        ],
    ),
    ("ural", &["ukraine", "siberia", "china", "afghanistan"]),
    ("venezuela", &["peru", "central-america", "brazil"]),
    (
        "western-australia",
        &["eastern-australia", "indonesia", "new-guinea"],
    ),
    (
        "western-europe",
        &[
            "southern-europe",
            "north-africa",
            "northern-europe",
            "great-britain",
        ],
    ),
    (
        "western-united-states",
        &[
            "central-america",
            "alberta",
            "eastern-united-states",
            "ontario",
        ],
    ),
    ("yakutsk", &["siberia", "kamchatka", "irkutsk"]),
];

pub struct GdMap {
    /// Territories in GD's order.
    pub order: [Territory; TERRITORY_COUNT],
    /// Each territory's links in GD's order, by territory.
    pub links: Vec<Vec<Territory>>,
    /// Each continent's territories in GD's order.
    pub continent_territories: Vec<Vec<Territory>>,
}

fn index_of(id: &str) -> Territory {
    TERRITORIES
        .iter()
        .position(|t| t.id == id)
        .unwrap_or_else(|| panic!("GD's map names \"{id}\", which ours hasn't")) as Territory
}

pub fn gd_map() -> &'static GdMap {
    static MAP: OnceLock<GdMap> = OnceLock::new();
    MAP.get_or_init(|| {
        let order = GD_MAP.map(|(id, _)| index_of(id));
        let mut links = vec![Vec::new(); TERRITORY_COUNT];
        for (id, neighbours) in GD_MAP {
            links[index_of(id) as usize] = neighbours.iter().map(|n| index_of(n)).collect();
        }
        let continent_territories = (0..CONTINENTS.len())
            .map(|c| {
                order
                    .iter()
                    .copied()
                    .filter(|&t| continent_of(t) == c)
                    .collect()
            })
            .collect();
        GdMap {
            order,
            links,
            continent_territories,
        }
    })
}

pub fn continent_of(t: Territory) -> usize {
    TERRITORIES[t as usize].continent
}

pub fn links(t: Territory) -> &'static [Territory] {
    &gd_map().links[t as usize]
}

/// GD's `Map.MaxContinentBonus`.
pub const MAX_CONTINENT_BONUS: u32 = 7;

/// The board and the table as GD's AI reads them, from one seat's view.
#[derive(Clone)]
pub struct Board<'a> {
    pub view: &'a View,
    /// The view's territories, which the move-in rewrites to GD's moment (`occupy`).
    pub territories: [TerritoryView; TERRITORY_COUNT],
    /// Whether the turn order hasn't yet come round: GD's `currentRound == 0`, read as our engine
    /// counts rounds (PORT.md's open reading 4).
    pub first_round: bool,
}

impl<'a> Board<'a> {
    pub fn new(view: &'a View, first_round: bool) -> Board<'a> {
        Board {
            view,
            territories: view.territories,
            first_round,
        }
    }

    pub fn owner(&self, t: Territory) -> Seat {
        self.territories[t as usize].owner
    }

    pub fn units(&self, t: Territory) -> i64 {
        self.territories[t as usize].armies as i64
    }

    /// `GetCountries(player, minUnits, false)`: in GD's order.
    pub fn countries(&self, seat: Seat, min_units: i64) -> Vec<Territory> {
        gd_map()
            .order
            .iter()
            .copied()
            .filter(|&t| self.owner(t) == seat && self.units(t) >= min_units)
            .collect()
    }

    /// `Territory.Enemies`: neighbours another seat holds, in link order.
    pub fn enemies(&self, t: Territory) -> Vec<Territory> {
        links(t)
            .iter()
            .copied()
            .filter(|&n| self.owner(n) != self.owner(t))
            .collect()
    }

    pub fn count_enemies(&self, t: Territory) -> usize {
        links(t)
            .iter()
            .filter(|&&n| self.owner(n) != self.owner(t))
            .count()
    }

    /// `Region.Owner`: the seat holding all of a continent.
    pub fn continent_owner(&self, c: usize) -> Option<Seat> {
        let territories = &gd_map().continent_territories[c];
        let first = self.owner(territories[0]);
        territories
            .iter()
            .all(|&t| self.owner(t) == first)
            .then_some(first)
    }

    /// `Territory.OwnerOwnsContinent`.
    pub fn owner_owns_continent(&self, t: Territory) -> bool {
        self.continent_owner(continent_of(t)) == Some(self.owner(t))
    }

    /// `MapManager.GetConnectedCountries`, less the territory itself: every territory its owner
    /// holds that a chain of the owner's territories joins to it, in GD's breadth-first order.
    pub fn connected(&self, t: Territory) -> Vec<Territory> {
        let owner = self.owner(t);
        let mut found = vec![t];
        let mut i = 0;
        while i < found.len() {
            for &n in links(found[i]) {
                if self.owner(n) == owner && !found.contains(&n) {
                    found.push(n);
                }
            }
            i += 1;
        }
        found.remove(0);
        found
    }

    /// `Player.totalUnits`: the armies on the board and those still to place this turn.
    pub fn total_units(&self, seat: Seat) -> i64 {
        let on_board: i64 = (0..TERRITORY_COUNT as Territory)
            .filter(|&t| self.owner(t) == seat)
            .map(|t| self.units(t))
            .sum();
        let to_place = if seat == self.view.active {
            self.view.armies_to_place as i64
        } else {
            0
        };
        on_board + to_place
    }

    pub fn countries_owned(&self, seat: Seat) -> i64 {
        self.view.seats[seat as usize].territories as i64
    }

    pub fn cards(&self, seat: Seat) -> i64 {
        self.view.seats[seat as usize].hand_size as i64
    }

    /// `GameControl.GetSimpleHandoutUnitInfo(player).UnclampedTotal`: reinforcements by
    /// territories (at least 3) and continents, and the first-turn bonus while the turn order
    /// hasn't come round.
    pub fn income(&self, seat: Seat) -> i64 {
        let mut sum = 3.max(self.countries_owned(seat) / 3);
        for (c, continent) in CONTINENTS.iter().enumerate() {
            if self.continent_owner(c) == Some(seat) {
                sum += continent.bonus as i64;
            }
        }
        if self.first_round {
            let order = &self.view.turn_order;
            let position = order
                .iter()
                .position(|&s| s == seat)
                .expect("every seat is in the turn order");
            sum += first_turn_bonus(order.len(), position) as i64;
        }
        sum
    }

    /// `GameControl.nextPlayer`: the seat after the active one still in the game.
    pub fn next_player(&self) -> Seat {
        let order = &self.view.turn_order;
        let at = order
            .iter()
            .position(|&s| s == self.view.active)
            .expect("the active seat is in the turn order");
        (1..=order.len())
            .map(|step| order[(at + step) % order.len()])
            .find(|&seat| !self.view.seats[seat as usize].eliminated)
            .unwrap_or(self.view.active)
    }

    /// `GameManager.players`, taken to be in turn order (PORT.md's open reading 2).
    pub fn players(&self) -> &[Seat] {
        &self.view.turn_order
    }
}

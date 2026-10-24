//! `src/projects/risk/map.ts`: the classic board. A territory is its index in `TERRITORIES`, a
//! continent its index in `CONTINENTS`.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Symbol {
    Infantry,
    Cavalry,
    Artillery,
}

pub struct Continent {
    pub id: &'static str,
    pub bonus: u32,
}

pub struct Territory {
    pub id: &'static str,
    pub continent: usize,
    pub symbol: Symbol,
}

pub const NORTH_AMERICA: usize = 0;
pub const SOUTH_AMERICA: usize = 1;
pub const EUROPE: usize = 2;
pub const AFRICA: usize = 3;
pub const ASIA: usize = 4;
pub const AUSTRALIA: usize = 5;

pub const CONTINENTS: [Continent; 6] = [
    Continent {
        id: "north-america",
        bonus: 5,
    },
    Continent {
        id: "south-america",
        bonus: 2,
    },
    Continent {
        id: "europe",
        bonus: 5,
    },
    Continent {
        id: "africa",
        bonus: 3,
    },
    Continent {
        id: "asia",
        bonus: 7,
    },
    Continent {
        id: "australia",
        bonus: 2,
    },
];

pub const TERRITORY_COUNT: usize = 42;

const fn t(id: &'static str, continent: usize, symbol: Symbol) -> Territory {
    Territory {
        id,
        continent,
        symbol,
    }
}

use Symbol::{Artillery as A, Cavalry as C, Infantry as I};

pub const TERRITORIES: [Territory; TERRITORY_COUNT] = [
    t("alaska", NORTH_AMERICA, I),
    t("northwest-territory", NORTH_AMERICA, A),
    t("greenland", NORTH_AMERICA, C),
    t("alberta", NORTH_AMERICA, I),
    t("ontario", NORTH_AMERICA, A),
    t("quebec", NORTH_AMERICA, A),
    t("western-united-states", NORTH_AMERICA, I),
    t("eastern-united-states", NORTH_AMERICA, A),
    t("central-america", NORTH_AMERICA, C),
    t("venezuela", SOUTH_AMERICA, A),
    t("peru", SOUTH_AMERICA, C),
    t("brazil", SOUTH_AMERICA, A),
    t("argentina", SOUTH_AMERICA, C),
    t("iceland", EUROPE, I),
    t("great-britain", EUROPE, C),
    t("scandinavia", EUROPE, A),
    t("northern-europe", EUROPE, C),
    t("western-europe", EUROPE, I),
    t("southern-europe", EUROPE, C),
    t("ukraine", EUROPE, A),
    t("north-africa", AFRICA, I),
    t("egypt", AFRICA, I),
    t("east-africa", AFRICA, A),
    t("congo", AFRICA, C),
    t("south-africa", AFRICA, A),
    t("madagascar", AFRICA, I),
    t("ural", ASIA, C),
    t("siberia", ASIA, A),
    t("yakutsk", ASIA, C),
    t("kamchatka", ASIA, C),
    t("irkutsk", ASIA, I),
    t("mongolia", ASIA, A),
    t("japan", ASIA, I),
    t("afghanistan", ASIA, I),
    t("china", ASIA, C),
    t("middle-east", ASIA, A),
    t("india", ASIA, I),
    t("siam", ASIA, A),
    t("indonesia", AUSTRALIA, C),
    t("new-guinea", AUSTRALIA, C),
    t("western-australia", AUSTRALIA, A),
    t("eastern-australia", AUSTRALIA, I),
];

/// Each territory's neighbours in `ADJACENCY`'s order, land borders and sea lines alike.
pub const ADJACENCY: [&[usize]; TERRITORY_COUNT] = [
    &[1, 3, 29],
    &[0, 3, 4, 2],
    &[1, 4, 5, 13],
    &[0, 1, 4, 6],
    &[1, 3, 6, 7, 5, 2],
    &[4, 7, 2],
    &[3, 4, 7, 8],
    &[6, 4, 5, 8],
    &[6, 7, 9],
    &[8, 10, 11],
    &[9, 11, 12],
    &[9, 10, 12, 20],
    &[10, 11],
    &[2, 14, 15],
    &[13, 15, 16, 17],
    &[13, 14, 16, 19],
    &[14, 15, 19, 18, 17],
    &[14, 16, 18, 20],
    &[17, 16, 19, 35, 21, 20],
    &[15, 16, 18, 35, 33, 26],
    &[11, 17, 18, 21, 22, 23],
    &[20, 18, 35, 22],
    &[21, 20, 23, 24, 25, 35],
    &[20, 22, 24],
    &[23, 22, 25],
    &[24, 22],
    &[19, 27, 34, 33],
    &[26, 28, 30, 31, 34],
    &[27, 30, 29],
    &[28, 30, 31, 32, 0],
    &[27, 28, 29, 31],
    &[27, 30, 29, 32, 34],
    &[29, 31],
    &[19, 26, 34, 36, 35],
    &[33, 26, 27, 31, 37, 36],
    &[18, 19, 33, 36, 21, 22],
    &[35, 33, 34, 37],
    &[36, 34, 38],
    &[37, 39, 40],
    &[38, 41, 40],
    &[38, 39, 41],
    &[40, 39],
];

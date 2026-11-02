"""Which facade a building gets (`art/facades`): the rule `buildings.py` runs per building, and what it reads from OSM.

It reads what the data knows, in order of how much that's worth: OSM's own word for a building's material, then what kind
of thing NLS says it is, then its shape and street. Everything else is a seeded roll, so a rebuild gives the same town.

Nothing is wood because it's central. The town's own record says about fifty Hongell and Sonck buildings survive, most
around Södragatan and Mariegatan, and that many wooden houses on those same streets went for modern blocks after 1945.
So a villa takes a street on the short list, a house's size, a pitched roof, and even then only a share of them.

The class `pipeline/buildings.py` calls PUBLIC, 42231, is NLS's holiday cottages: its median is 59–72 m² and OSM calls
them cabins. They stay timber here.
"""

import json
import xml.etree.ElementTree as ElementTree
from dataclasses import dataclass, field
from pathlib import Path

import shapely
from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon

from grid import to_local

IDS = json.loads((Path(__file__).resolve().parent.parent / "art" / "facades" / "facade-ids.json").read_text(encoding="utf-8"))
STYLES = IDS["styles"]
PAINT = {name: at for at, name in enumerate(IDS["paints"])}
WORD = {name: at for at, name in enumerate(IDS["words"])}
FRONT = IDS["fronts"]
ROOF = 0

HOUSE = 42211
APARTMENTS = 42212
COMMERCIAL = (42221, 42222)
COTTAGE = (42231, 42232)
INDUSTRIAL = (42241, 42242)
OUTBUILDINGS = (42260, 42261, 42262, 42270)

# A street's share of villas, ranked by the record above.
VILLA_STREETS = {
    "Södragatan": 0.72,
    "Mariegatan": 0.68,
    "Norragatan": 0.55,
    "Skolgatan": 0.42,
    "Nygatan": 0.42,
    "Parkgatan": 0.42,
    "Södra Esplanadgatan": 0.5,
    "Norra Esplanadgatan": 0.35,
    "Östra Esplanadgatan": 0.4,
    "Västra Esplanadgatan": 0.4,
    "Östra Skolgatan": 0.4,
    "Neptunigatan": 0.25,
    "Badhusgatan": 0.42,
    "Strandgatan": 0.3,
    "Storagatan": 0.25,
    "Elverksgatan": 0.3,
}
VILLA_AREA_M2 = (55, 330)
VILLA_EAVES_M = (2.6, 7.6)
# A roof rising less than this over its eaves isn't a villa's pitched roof.
PITCHED_RISE_M = 1.6

FLAT_RISE_M = 1.2
BIG_BOX_M2 = 450
# A box fills its hull; a school's wings or a round tower don't.
BOX_FILL = 0.82
BOX_RISE_M = 3.0
# A wide hall rises further on the same shallow pitch.
BOX_RISE_SHARE = 0.13
GLASS_RISE_M = 3.0
GLASS_AREA_M2 = 300
BLOCK_LOWEST_EAVES_M = 5.2
FARM_BARN_M2 = 70
BLOCK_EAVES_M = 7.5
RECENT_DATES = ("20", "199")

VILLA_PAINTS = (("villa-butter", 0.2), ("wall-cream", 0.14), ("villa-sage", 0.14), ("villa-sky", 0.12), ("villa-rose", 0.1), ("wall-white", 0.13), ("villa-sand", 0.09), ("villa-ash", 0.08))
BRICK_PAINTS = (("brick-red", 0.5), ("brick-brown", 0.3), ("brick-yellow", 0.2))
BLOCK_PAINTS = (("render-sand", 0.26), ("render-grey", 0.2), ("wall-white", 0.14), ("render-salmon", 0.14), ("render-ochre", 0.14), ("wall-pale", 0.12))
GLASS_PAINTS = (("panel-graphite", 0.55), ("panel-slate", 0.45))
HALL_PAINTS = (("clad-white", 0.3), ("clad-grey", 0.26), ("clad-blue", 0.18), ("clad-green", 0.12), ("clad-dark", 0.14))
BARN_PAINTS = (("barn-red", 0.62), ("barn-silver", 0.24), ("barn-tar", 0.14))

OSM_COLOURS = {"white": "wall-white", "red": "wall-red", "yellow": "villa-butter", "lightgoldenrodyellow": "villa-butter", "blue": "villa-sky", "green": "villa-sage", "tan": "villa-sand", "#ffe0a0": "villa-butter", "#fffacd": "villa-butter", "#da9898": "villa-rose", "#bcc1bd": "wall-pale", "#bb0707": "wall-red"}

# A sign says the trade, from OSM's shop value.
TRADE_WORDS = {"bakery": "BAGERI", "kiosk": "KIOSK", "coffee": "KAFFE", "chemist": "APOTEK", "books": "BOKHANDEL", "florist": "BLOMMOR", "clothes": "KLÄDER", "fashion": "KLÄDER", "shoes": "SKOR", "hairdresser": "FRISÖR", "beauty": "FRISÖR", "seafood": "FISK", "bicycle": "CYKLAR", "jewelry": "GULDSMED", "car": "BILAR", "car_repair": "BILAR", "car_parts": "BILAR", "tyres": "BILAR", "furniture": "MÖBLER", "interior_decoration": "MÖBLER", "optician": "OPTIK", "paint": "FÄRG", "gift": "PRESENTER", "craft": "PRESENTER", "sports": "SPORT", "toys": "LEKSAKER", "hardware": "JÄRN", "doityourself": "JÄRN", "pet": "DJUR", "second_hand": "LOPPIS", "supermarket": "MAT", "convenience": "MAT", "deli": "MAT", "alcohol": "VINBODEN", "electronics": "BUTIK", "garden_centre": "BLOMMOR"}
# A chain takes an invented house name of its trade.
CHAIN_WORDS = {"supermarket": ("MATHOLMEN", "SKUTHALLEN"), "convenience": ("HAVSBODEN",), "clothes": ("VÄSTANVIND",), "sports": ("RODDAREN",), "optician": ("SKARPÖGA",), "pet": ("TASSEN",), "doityourself": ("BYGGHOLMEN",), "furniture": ("SOFFKOBBEN",), "electronics": ("VOLTVIKEN",), "car": ("BILVIKEN",), "tyres": ("DÄCKHOLMEN",)}
# Shops that take a whole big building, not a ground floor.
BIG_SHOPS = ("supermarket", "doityourself", "furniture", "electronics", "variety_store", "department_store")
BIG_SHOP_M2 = 600
NOT_A_FRONT = ("vacant", "no", "ticket", "yes", "mall")


@dataclass
class Facts:
    """What the data says about a building."""

    kind: int
    area: float
    eaves: float
    # The roof's highest point over the eaves.
    rise: float
    seed: int
    street: str | None = None
    tags: dict = field(default_factory=dict)
    shop: dict | None = None
    rural: bool = False
    # Its area over its hull's.
    fill: float = 1.0


@dataclass
class Choice:
    style: int
    paint: int
    front: int = 0
    word: int = 0
    why: str = ""

    def tint(self, door: bool, shade: int) -> tuple[int, int, int, int]:
        """A wall vertex's four tint bytes: red holds paint and front, green door and word, as `facade.ts` reads them."""
        return (self.paint | (self.front << 5), (128 if door else 0) | self.word, shade, self.style)


def _roll(seed: int, salt: int) -> float:
    return (((seed + salt * 40503) * 2654435761 % 4294967296) >> 8) % 1000 / 1000


def _pick(seed: int, salt: int, choices: tuple) -> int:
    roll = _roll(seed, salt)
    for name, chance in choices:
        roll -= chance
        if roll < 0:
            return PAINT[name]
    return PAINT[choices[0][0]]


def _own_colour(tags: dict, otherwise: int) -> int:
    name = OSM_COLOURS.get(tags.get("building:colour", "").lower())
    return PAINT[name] if name else otherwise


def is_chain(shop: dict) -> bool:
    return "brand" in shop or "brand:wikidata" in shop


def sign_word(shop: dict, seed: int) -> int:
    """A chain's sign is an invented name, an independent's its trade. OSM's `name` never reaches a sign."""
    trade = shop.get("shop", "")
    if is_chain(shop) and trade in CHAIN_WORDS:
        names = CHAIN_WORDS[trade]
        return WORD[names[seed % len(names)]]
    return WORD[TRADE_WORDS.get(trade, "BUTIK")]


def _with_front(choice: Choice, facts: Facts) -> Choice:
    shop = facts.shop
    if shop is None or shop.get("shop") in NOT_A_FRONT:
        return choice
    choice.word = sign_word(shop, facts.seed)
    big = shop.get("shop") in BIG_SHOPS and facts.area > BIG_SHOP_M2
    choice.front = FRONT["supermarket" if big else "shop"]
    return choice


def _by_material(facts: Facts) -> Choice | None:
    material = facts.tags.get("building:material")
    seed = facts.seed
    if material == "brick":
        return Choice(STYLES["brick"], _pick(seed, 1, BRICK_PAINTS), why="osm says brick")
    if material == "glass":
        return Choice(STYLES["glass"], _pick(seed, 2, GLASS_PAINTS), why="osm says glass")
    if material in ("concrete", "plaster"):
        return Choice(STYLES["block"], _own_colour(facts.tags, _pick(seed, 3, BLOCK_PAINTS)), why=f"osm says {material}")
    if material == "wood" and facts.street in VILLA_STREETS and facts.kind not in OUTBUILDINGS:
        return Choice(STYLES["villa"], _own_colour(facts.tags, _pick(seed, 4, VILLA_PAINTS)), why="osm says wood, on a villa street")
    return None


def _is_villa(facts: Facts) -> bool:
    share = VILLA_STREETS.get(facts.street or "")
    if share is None or facts.kind != HOUSE or facts.tags.get("building") == "apartments":
        return False
    fits = VILLA_AREA_M2[0] <= facts.area <= VILLA_AREA_M2[1] and VILLA_EAVES_M[0] <= facts.eaves <= VILLA_EAVES_M[1] and facts.rise >= PITCHED_RISE_M
    return fits and _roll(facts.seed, 5) < share


def _is_recent(facts: Facts) -> bool:
    return facts.tags.get("building") in ("office", "hotel", "retail", "hospital") or facts.tags.get("start_date", "").startswith(RECENT_DATES)


def _rule(facts: Facts) -> Choice | None:
    seed, kind, area, eaves = facts.seed, facts.kind, facts.area, facts.eaves
    osm = facts.tags.get("building")
    if osm in ("church", "chapel", "ship", "boathouse", "ruins") or facts.tags.get("historic") == "ship":
        return None
    if kind in OUTBUILDINGS or osm in ("barn", "farm_auxiliary"):
        if facts.rural and area >= FARM_BARN_M2:
            return Choice(STYLES["barn"], _pick(seed, 6, BARN_PAINTS), why="big rural outbuilding")
        return None
    if kind in COTTAGE:
        return None
    if _is_villa(facts):
        return Choice(STYLES["villa"], _own_colour(facts.tags, _pick(seed, 4, VILLA_PAINTS)), why="house, pitched, villa street")
    if kind in INDUSTRIAL or osm in ("industrial", "warehouse"):
        return Choice(STYLES["hall"], _pick(seed, 7, HALL_PAINTS), why="industrial")
    if kind in COMMERCIAL or osm in ("retail", "commercial", "supermarket", "office", "hotel", "school", "public", "hospital"):
        if area >= BIG_BOX_M2 and eaves < BLOCK_EAVES_M and facts.fill >= BOX_FILL and facts.rise < max(BOX_RISE_M, BOX_RISE_SHARE * facts.area**0.5):
            return Choice(STYLES["hall"], _pick(seed, 7, HALL_PAINTS), why="big low commercial")
        if area >= GLASS_AREA_M2 and facts.rise < GLASS_RISE_M and _roll(seed, 8) < (0.6 if _is_recent(facts) else 0.22):
            return Choice(STYLES["glass"], _pick(seed, 2, GLASS_PAINTS), why="recent commercial")
        if osm == "school" or _roll(seed, 9) < 0.34:
            return Choice(STYLES["brick"], _pick(seed, 1, BRICK_PAINTS), why="school or brick commercial")
        if eaves < BLOCK_LOWEST_EAVES_M:
            return None
        return Choice(STYLES["block"], _own_colour(facts.tags, _pick(seed, 3, BLOCK_PAINTS)), why="rendered commercial")
    if kind == APARTMENTS or osm == "apartments" or eaves >= BLOCK_EAVES_M:
        if _roll(seed, 10) < 0.2:
            return Choice(STYLES["brick"], _pick(seed, 1, BRICK_PAINTS), why="brick apartments")
        return Choice(STYLES["block"], _own_colour(facts.tags, _pick(seed, 3, BLOCK_PAINTS)), why="apartments")
    # Town houses of the 1960s and 70s: near-flat roofs, often brick.
    if kind == HOUSE and not facts.rural and facts.rise < FLAT_RISE_M and _roll(seed, 11) < 0.5:
        return Choice(STYLES["brick"], _pick(seed, 1, BRICK_PAINTS), why="flat town house")
    return None


def choose(facts: Facts) -> Choice | None:
    """A building's facade, or None to keep what the pipeline already draws."""
    choice = _by_material(facts) or _rule(facts)
    if choice is None:
        if facts.shop is None or facts.shop.get("shop") in NOT_A_FRONT:
            return None
        choice = Choice(STYLES["block"], _own_colour(facts.tags, _pick(facts.seed, 3, BLOCK_PAINTS)), why="a shop in a plain building")
    return _with_front(choice, facts)


# What OSM says round the buildings

STREET_REACH_M = 34
SHOP_REACH_M = 6
RURAL_REACH_M = 120
RURAL_BELOW = 14
_to_grid = Transformer.from_crs(4326, 3067, always_xy=True)


def _local(lon: float, lat: float) -> tuple[float, float]:
    return to_local(*_to_grid.transform(lon, lat))


@dataclass
class Osm:
    """A tile's named streets, tagged buildings and shops, in the pipeline's local metres."""

    streets: list[tuple[LineString, str]]
    tagged: list[tuple[Polygon, dict]]
    shops: list[tuple[Point, dict]]

    def __post_init__(self):
        self._streets = shapely.STRtree([line for line, _ in self.streets])
        self._tagged = shapely.STRtree([outline for outline, _ in self.tagged])
        self._shops = shapely.STRtree([point for point, _ in self.shops])

    def street(self, middle: Point) -> str | None:
        found = self._streets.query_nearest(middle, max_distance=STREET_REACH_M)
        return self.streets[int(found[0])][1] if len(found) else None

    def tags(self, middle: Point) -> dict:
        return next((self.tagged[at][1] for at in self._tagged.query(middle) if self.tagged[at][0].contains(middle)), {})

    def shop(self, outline: Polygon) -> dict | None:
        return next((self.shops[at][1] for at in self._shops.query(outline.buffer(SHOP_REACH_M))), None)


def read_osm(xml_files: list[Path]) -> Osm:
    """The API's answers for a tile, as untrusted data. A shop is a node or a building's own tags."""
    streets, tagged, shops = [], [], []
    for path in xml_files:
        nodes = {}
        for _, element in ElementTree.iterparse(path, events=("end",)):
            if element.tag == "node":
                place = _local(float(element.get("lon")), float(element.get("lat")))
                nodes[element.get("id")] = place
                tags = {tag.get("k"): tag.get("v") for tag in element.findall("tag")}
                if "shop" in tags:
                    shops.append((Point(place), tags))
                element.clear()
            elif element.tag == "way":
                tags = {tag.get("k"): tag.get("v") for tag in element.findall("tag")}
                points = [nodes[nd.get("ref")] for nd in element.findall("nd") if nd.get("ref") in nodes]
                if "highway" in tags and "name" in tags and len(points) >= 2:
                    streets.append((LineString(points), tags["name"]))
                if "building" in tags and len(points) >= 4 and points[0] == points[-1]:
                    outline = shapely.make_valid(Polygon(points))
                    tagged.append((outline, tags))
                    if "shop" in tags:
                        shops.append((outline.representative_point(), tags))
                element.clear()
            elif element.tag == "relation":
                element.clear()
    return Osm(streets, tagged, shops)


# What OSM says round the buildings

STREET_REACH_M = 34
SHOP_REACH_M = 6
RURAL_REACH_M = 120
RURAL_BELOW = 14
_to_grid = Transformer.from_crs(4326, 3067, always_xy=True)


@dataclass
class Osm:
    """A tile's named streets, tagged buildings and shops, in the pipeline's local metres."""

    streets: list[tuple[LineString, str]]
    tagged: list[tuple[Polygon, dict]]
    shops: list[tuple[Point, dict]]

    def __post_init__(self):
        self._streets = shapely.STRtree([line for line, _ in self.streets])
        self._tagged = shapely.STRtree([outline for outline, _ in self.tagged])
        self._shops = shapely.STRtree([point for point, _ in self.shops])

    def street(self, middle: Point) -> str | None:
        found = self._streets.query_nearest(middle, max_distance=STREET_REACH_M)
        return self.streets[int(found[0])][1] if len(found) else None

    def tags(self, middle: Point) -> dict:
        return next((self.tagged[at][1] for at in self._tagged.query(middle) if self.tagged[at][0].contains(middle)), {})

    def shop(self, outline: Polygon) -> dict | None:
        return next((self.shops[at][1] for at in self._shops.query(outline.buffer(SHOP_REACH_M))), None)


def read_osm(xml_files: list[Path]) -> Osm:
    """OSM's answers for a tile, as untrusted data. A shop is a node of its own or a building's own tags."""
    streets, tagged, shops = [], [], []
    for path in xml_files:
        nodes = {}
        for _, element in ElementTree.iterparse(path, events=("end",)):
            if element.tag == "node":
                place = to_local(*_to_grid.transform(float(element.get("lon")), float(element.get("lat"))))
                nodes[element.get("id")] = place
                tags = {tag.get("k"): tag.get("v") for tag in element.findall("tag")}
                if "shop" in tags:
                    shops.append((Point(place), tags))
                element.clear()
            elif element.tag == "way":
                tags = {tag.get("k"): tag.get("v") for tag in element.findall("tag")}
                points = [nodes[nd.get("ref")] for nd in element.findall("nd") if nd.get("ref") in nodes]
                if "highway" in tags and "name" in tags and len(points) >= 2:
                    streets.append((LineString(points), tags["name"]))
                if "building" in tags and len(points) >= 4 and points[0] == points[-1]:
                    outline = shapely.make_valid(Polygon(points))
                    tagged.append((outline, tags))
                    if "shop" in tags:
                        shops.append((outline.representative_point(), tags))
                element.clear()
            elif element.tag == "relation":
                element.clear()
    return Osm(streets, tagged, shops)

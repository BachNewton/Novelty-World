"""The fixed board on the device, from `data/board.json` (exported by `npm run risk:gpu-tables`).

Territories are in `map.ts` order; cards by card index (a territory's card has its territory's
index, 42 and 43 are the wilds); seats by seat id. Lists of neighbours are padded with −1 and keep
their source order, which the bots' tie-breaks read.
"""

import json
import os
from dataclasses import dataclass

import torch

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
TERRITORIES = 42
CONTINENTS = 6
CARDS = 44
MAX_SEATS = 6
MAX_NEIGHBOURS = 6


def _padded(rows: list[list[int]], width: int) -> list[list[int]]:
    assert all(len(row) <= width for row in rows), "a row is wider than its padding"
    return [row + [-1] * (width - len(row)) for row in rows]


@dataclass
class Board:
    territory_ids: list[str]
    card_ids: list[str]
    adjacency: torch.Tensor  # [42, 42] bool
    adjacent: torch.Tensor  # [42, 6] int64, ADJACENCY order, −1 padded
    edges: torch.Tensor  # [166, 2] int64, canonical order
    edge_id: torch.Tensor  # [42, 42] int64, −1 where no border
    continent_of: torch.Tensor  # [42] int64
    continent_members: torch.Tensor  # [6, 42] bool
    continent_bonus: torch.Tensor  # [6] int32
    card_symbol: torch.Tensor  # [44] int64, −1 for wilds
    card_territory: torch.Tensor  # [44] int64, −1 for wilds
    gd_order: torch.Tensor  # [42] int64
    gd_links: torch.Tensor  # [42, 6] int64, −1 padded
    starting_armies: torch.Tensor  # [7] int32 by player count, 0 where no game
    first_turn_bonus: torch.Tensor  # [7, 6] int32 by player count then turn-order position

    @staticmethod
    def load(device: torch.device | str, path: str = os.path.join(DATA, "board.json")) -> "Board":
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        territories = raw["territories"]
        assert len(territories) == TERRITORIES, len(territories)
        assert len(raw["continents"]) == CONTINENTS
        assert len(raw["cards"]) == CARDS
        territory_ids = [t["id"] for t in territories]
        assert raw["cards"][:TERRITORIES] == territory_ids, "territory cards are not in map order"

        def tensor(data, dtype=torch.int64):
            return torch.tensor(data, dtype=dtype, device=device)

        adjacent_lists = raw["adjacency"]
        adjacency = torch.zeros(TERRITORIES, TERRITORIES, dtype=torch.bool)
        for t, neighbours in enumerate(adjacent_lists):
            adjacency[t, neighbours] = True
        edges = tensor(raw["edges"])
        edge_id = torch.full((TERRITORIES, TERRITORIES), -1, dtype=torch.int64)
        for k, (a, b) in enumerate(raw["edges"]):
            edge_id[a, b] = k
        members = torch.zeros(CONTINENTS, TERRITORIES, dtype=torch.bool)
        for c, continent in enumerate(raw["continents"]):
            members[c, continent["territories"]] = True
        symbols = [t["symbol"] for t in territories] + [-1] * (CARDS - TERRITORIES)
        card_territory = list(range(TERRITORIES)) + [-1] * (CARDS - TERRITORIES)
        starting = [0] * (MAX_SEATS + 1)
        bonus = [[0] * MAX_SEATS for _ in range(MAX_SEATS + 1)]
        for players, armies in raw["startingArmies"].items():
            starting[int(players)] = armies
        for players, row in raw["firstTurnBonus"].items():
            assert len(row) == int(players)
            bonus[int(players)][: len(row)] = row

        return Board(
            territory_ids=territory_ids,
            card_ids=list(raw["cards"]),
            adjacency=adjacency.to(device),
            adjacent=tensor(_padded(adjacent_lists, MAX_NEIGHBOURS)),
            edges=edges,
            edge_id=edge_id.to(device),
            continent_of=tensor([t["continent"] for t in territories]),
            continent_members=members.to(device),
            continent_bonus=tensor([c["bonus"] for c in raw["continents"]], torch.int32),
            card_symbol=tensor(symbols),
            card_territory=tensor(card_territory),
            gd_order=tensor(raw["gdOrder"]),
            gd_links=tensor(_padded(raw["gdLinks"], MAX_NEIGHBOURS)),
            starting_armies=tensor(starting, torch.int32),
            first_turn_bonus=tensor(bonus, torch.int32),
        )

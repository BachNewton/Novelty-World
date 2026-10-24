"""The board and the table as GD's AI reads them (`bots/gd/board.ts`), batched: one row per game,
for the seat to move. Territories are named by index tensors of any shape after the batch
(`[B]`, `[B, 42]`, `[B, 42, 6]`), so each method reads as the TypeScript's for one territory.

GD's ties go to the first candidate it visits: territories in `gd_order`, each one's neighbours
in `gd_links` order, and the territories joined to one in breadth-first order from it.
"""

from functools import cached_property

import torch

from ..board import MAX_NEIGHBOURS, MAX_SEATS, TERRITORIES, Board

_NONE = 1 << 30


class GDBoard:
    def __init__(
        self, board: Board, *, owner: torch.Tensor, armies: torch.Tensor, active: torch.Tensor, to_place: torch.Tensor,
        hand_len: torch.Tensor, eliminated: torch.Tensor, turn_order: torch.Tensor, players: torch.Tensor,
        first_round: torch.Tensor, graphable: bool = False,
    ):
        self.board = board
        self.owners = owner.to(torch.int64)  # [B, 42]
        self.armies = armies.to(torch.int64)  # [B, 42]
        self.active = active.to(torch.int64)  # [B]
        self.to_place = to_place.to(torch.int64)  # [B]: the view's `armiesToPlace`
        self.hand_len = hand_len.to(torch.int64)  # [B, 6]
        self.eliminated = eliminated  # [B, 6]
        self.turn_order = turn_order.to(torch.int64)  # [B, 6], −1 past the players
        self.players_count = players.to(torch.int64)  # [B]
        self.first_round = first_round  # [B]: GD's `currentRound == 0`
        self.batch = owner.shape[0]
        self.device = owner.device
        self.graphable = graphable  # no host sync: `connected` walks a fixed 42 steps

    # --- reading the board at territories and seats ---------------------------------------------

    @staticmethod
    def at(values: torch.Tensor, index: torch.Tensor) -> torch.Tensor:
        """`values [B, N]` read at `index [B, ...]` (each row its own)."""
        flat = index.reshape(index.shape[0], -1)
        return values.gather(1, flat).reshape(index.shape)

    def owner(self, t: torch.Tensor) -> torch.Tensor:
        return self.at(self.owners, t)

    def units(self, t: torch.Tensor) -> torch.Tensor:
        return self.at(self.armies, t)

    def links(self, t: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """`GD_LINKS[t]`: the neighbours `[..., 6]` in link order (0 in the padding) and which slots
        hold one."""
        n = self.board.gd_links[t]
        return n.clamp(min=0), n >= 0

    def all_territories(self) -> torch.Tensor:
        """Every territory `[B, 42]`, in map order."""
        return torch.arange(TERRITORIES, device=self.device).expand(self.batch, -1)

    # --- the board ---------------------------------------------------------------------------------

    def countries(self, seat: torch.Tensor, min_units: int = 1) -> torch.Tensor:
        """`countries(seat, minUnits)` as a mask over the territories `[B, 42]` in map order (the
        caller walks it in `gd_order`)."""
        return (self.owners == seat[:, None]) & (self.armies >= min_units)

    def enemies(self, t: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """`enemies(t)`: the neighbours in link order and which of them another seat holds."""
        n, valid = self.links(t)
        return n, valid & (self.owner(n) != self.owner(t)[..., None])

    def count_enemies(self, t: torch.Tensor) -> torch.Tensor:
        return self.enemies(t)[1].sum(-1)

    @cached_property
    def continent_owners(self) -> torch.Tensor:
        """`continentOwner(c)` for every continent `[B, 6]`: the seat holding all of it, or −1."""
        members = self.board.continent_members  # [6, 42]
        first = members.to(torch.int64).argmax(1)  # a member of each continent
        holder = self.owners[:, first]  # [B, 6]
        whole = ((self.owners[:, None, :] == holder[:, :, None]) | ~members[None]).all(-1)
        return torch.where(whole, holder, -1)

    def continent_owner(self, c: torch.Tensor) -> torch.Tensor:
        return self.at(self.continent_owners, c)

    def owner_owns_continent(self, t: torch.Tensor) -> torch.Tensor:
        return self.continent_owner(self.board.continent_of[t]) == self.owner(t)

    def connected(self, t: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """`connected(t)` for sources `t [B, S]`: the territories its owner holds that a chain of
        the owner's territories joins to it, less itself, in GD's breadth-first order `[B, S, 41]`
        (−1 after them), and the same set as a mask `[B, S, 42]`. Breadth first, as the TypeScript
        walks its `found` list: each territory found, in turn, adds its owner's unfound neighbours
        in link order."""
        batch, sources = t.shape
        owner = self.owner(t)  # [B, S]
        found = torch.full((batch, sources, TERRITORIES + 1), -1, dtype=torch.int64, device=self.device)
        found[:, :, 0] = t
        seen = torch.zeros(batch, sources, TERRITORIES + 1, dtype=torch.bool, device=self.device)
        seen.scatter_(2, t[..., None], True)
        count = torch.ones(batch, sources, dtype=torch.int64, device=self.device)
        owners = self.owners[:, None, :].expand(-1, sources, -1)
        if self.graphable:
            # Each territory found adds all its owner's unfound neighbours at once, ranked in link
            # order: the same walk, since a territory's neighbours are distinct, so adding one never
            # changes whether the next is added. Entries that add nothing write past the board.
            for i in range(TERRITORIES):
                at = found[:, :, i].clamp(min=0)
                n = self.board.gd_links[at]  # [B, S, 6]
                nc = n.clamp(min=0)
                adds = ((i < count)[..., None] & (n >= 0) & (owners.gather(2, nc) == owner[..., None])
                        & ~seen.gather(2, nc))
                rank = adds.cumsum(-1) - 1
                found.scatter_(2, torch.where(adds, count[..., None] + rank, TERRITORIES), nc)
                seen.scatter_(2, torch.where(adds, nc, TERRITORIES), True)
                count = count + adds.sum(-1)
        else:
            # A walk finds at most every territory its owner holds.
            longest = int((self.owners[:, :, None] == torch.arange(MAX_SEATS, device=self.device)).sum(1).max())
            for i in range(longest):
                walking = i < count
                at = found[:, :, i].clamp(min=0)
                for slot in range(MAX_NEIGHBOURS):
                    n = self.board.gd_links[at, slot]
                    nc = n.clamp(min=0)
                    adds = walking & (n >= 0) & (owners.gather(2, nc[..., None])[..., 0] == owner) & ~seen.gather(2, nc[..., None])[..., 0]
                    found.scatter_(2, torch.where(adds, count, TERRITORIES)[..., None], nc[..., None])
                    seen.scatter_(2, torch.where(adds, nc, TERRITORIES)[..., None], True)
                    count = count + adds.to(torch.int64)
        found[:, :, TERRITORIES] = -1
        member = seen[:, :, :TERRITORIES].clone()
        member.scatter_(2, t[..., None], False)
        return found[:, :, 1:TERRITORIES], member

    # --- the seats -----------------------------------------------------------------------------

    @cached_property
    def _countries_owned(self) -> torch.Tensor:
        seats = torch.arange(MAX_SEATS, device=self.device)
        return (self.owners[:, :, None] == seats).sum(1)  # [B, 6]

    @cached_property
    def _total_units(self) -> torch.Tensor:
        """`totalUnits` per seat `[B, 6]`: the armies on the board and, for the seat to move, those
        still to place."""
        seats = torch.arange(MAX_SEATS, device=self.device)
        on_board = ((self.owners[:, :, None] == seats) * self.armies[:, :, None]).sum(1)
        return on_board + torch.where(seats[None, :] == self.active[:, None], self.to_place[:, None], 0)

    @cached_property
    def _income(self) -> torch.Tensor:
        """`income` per seat `[B, 6]`: max(3, ⌊territories / 3⌋), the continents held whole, and
        the first-turn bonus while the turn order hasn't come round."""
        seats = torch.arange(MAX_SEATS, device=self.device)
        income = torch.clamp(self._countries_owned // 3, min=3)
        held = self.continent_owners[:, :, None] == seats  # [B, 6 continents, 6 seats]
        income = income + (held * self.board.continent_bonus.to(torch.int64)[None, :, None]).sum(1)
        position = (self.turn_order[:, None, :] == seats[None, :, None]).to(torch.int64).argmax(-1)  # [B, 6]
        bonus = self.board.first_turn_bonus.to(torch.int64)[self.players_count[:, None], position]
        return income + torch.where(self.first_round[:, None], bonus, 0)

    def countries_owned(self, seat: torch.Tensor) -> torch.Tensor:
        return self.at(self._countries_owned, seat)

    def total_units(self, seat: torch.Tensor) -> torch.Tensor:
        return self.at(self._total_units, seat)

    def cards(self, seat: torch.Tensor) -> torch.Tensor:
        return self.at(self.hand_len, seat)

    def income(self, seat: torch.Tensor) -> torch.Tensor:
        return self.at(self._income, seat)

    @cached_property
    def next_player(self) -> torch.Tensor:
        """`nextPlayer()` `[B]`: the seat after the one to move, in turn order, still in the game."""
        rows = torch.arange(self.batch, device=self.device)
        at = (self.turn_order == self.active[:, None]).to(torch.int64).argmax(1)
        steps = torch.arange(1, MAX_SEATS + 1, device=self.device)[None, :]
        live_step = steps <= self.players_count[:, None]
        seats = self.turn_order.gather(1, (at[:, None] + steps) % self.players_count[:, None])
        eligible = live_step & ~self.eliminated.gather(1, seats)
        first = torch.where(eligible, steps, _NONE).min(1).values
        return torch.where(first < _NONE, seats[rows, (first - 1).clamp(max=MAX_SEATS - 1)], self.active)

    def players(self) -> list[tuple[torch.Tensor, torch.Tensor]]:
        """`players()`: each turn-order position as (the seat `[B]`, whether the row has it)."""
        return [(self.turn_order[:, k].clamp(min=0), k < self.players_count) for k in range(MAX_SEATS)]


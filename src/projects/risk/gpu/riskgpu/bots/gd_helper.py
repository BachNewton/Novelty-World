"""GD's `AIHelper` (`bots/gd/helper.ts`), batched: the features the personas weigh, each a port of
the TypeScript method of the same name, over territories named by index tensors `[B, ...]`.

A loop over a territory's neighbours is a fold over its six link slots in link order, keeping the
TypeScript's own comparison (`!(m > v)`, `v > best`), so NaN goes wherever it goes there. Every
float is float64, combined in the TypeScript's order.

The scorers ask only about territories the bot owns (and, for an attack, the enemy neighbours of
one it owns); the odds of fights it would never weigh are not worked out (an attack of 0 armies).
"""

from functools import cached_property

import torch

from .gd_board import GDBoard
from .gd_odds import Odds, div, fround, fround_t, round_half_even

# The Expert multiplier of `GetAttackTurnsLimit`.
EXPERT_ATTACK_TURNS = 0.75


def clamp01(x: torch.Tensor) -> torch.Tensor:
    """GD's `clamp01`: NaN passes through, as GD's compare-and-branch lets it."""
    return torch.where(0 > x, 0.0, torch.where(x > 1, 1.0, x))


def cut_off(value: torch.Tensor, cut: float) -> torch.Tensor:
    """`AIHelper.CutOff`."""
    return torch.where(cut > value, 0.0, clamp01(div(value - cut, 1 - cut)))


class Helper:
    def __init__(
        self, board: GDBoard, odds: Odds, *, hand: torch.Tensor, humans: torch.Tensor, conquered_this_turn: torch.Tensor,
        attacks_this_turn: torch.Tensor, attack_success_threshold: float,
    ):
        self.board = board
        self.odds = odds
        self.me = board.active
        self.hand = hand.to(torch.int64)  # [B, 12], −1 past the hand
        self.humans = humans  # [B, 6]
        self.conquered_this_turn = conquered_this_turn.to(torch.int64)
        self.attacks_this_turn = attacks_this_turn.to(torch.int64)
        self.attack_success_threshold = attack_success_threshold

    def units(self, t: torch.Tensor) -> torch.Tensor:
        return self.board.units(t)

    def owner(self, t: torch.Tensor) -> torch.Tensor:
        return self.board.owner(t)

    def _me(self, t: torch.Tensor) -> torch.Tensor:
        """The bot's seat, shaped as `t`."""
        return self.me.view(-1, *([1] * (t.dim() - 1))).expand(t.shape)

    def _slots(self, t: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """`t` with a link-slot axis, its neighbours, and which slots hold one."""
        n, valid = self.board.links(t)
        return t[..., None].expand(n.shape), n, valid

    def desperate(self) -> torch.Tensor:
        """`GetDesperateMode`: nothing captured yet this turn."""
        return self.conquered_this_turn == 0

    def attack_turns_limit(self, multiplier: float, most: float) -> torch.Tensor:
        """`GetAttackTurnsLimit(multiplier, max)` at Expert, `[B]`."""
        r = self.attacks_this_turn.to(torch.float64) * EXPERT_ATTACK_TURNS * multiplier
        r = torch.where(0 > r, 0.0, torch.where(r > most, most, r))
        return torch.where(self.conquered_this_turn == 0, 0.0, r)

    # --- battle odds -------------------------------------------------------------------------------

    def battle_success_units(self, a: torch.Tensor, d: torch.Tensor, attack_units: torch.Tensor, ask: torch.Tensor | None = None) -> torch.Tensor:
        """`GetBattleSuccess(attacker, defender, attackUnits)`, where `ask` holds."""
        skip = (self.units(a) <= 1) | (self.owner(a) == self.owner(d))
        if ask is not None:
            skip = skip | ~ask
        return self.odds.win_chance(torch.where(skip, 0, attack_units), self.units(d))

    def battle_success(self, a: torch.Tensor, d: torch.Tensor, ask: torch.Tensor | None = None) -> torch.Tensor:
        return self.battle_success_units(a, d, self.units(a) - 1, ask)

    def battle_success_against(self, a: torch.Tensor, defend_units: torch.Tensor, ask: torch.Tensor) -> torch.Tensor:
        skip = (self.units(a) <= 1) | ~ask
        return self.odds.win_chance(torch.where(skip, 0, self.units(a)), defend_units)

    def enemy_slots(self, s: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        s_, n, valid = self._slots(s)
        return s_, n, valid & (self.owner(n) != self.owner(s_))

    def battle_success_min(self, s: torch.Tensor, units_attack: torch.Tensor) -> torch.Tensor:
        """`GetBattleSuccessMin(territory, unitsAttack)`: 1 with no enemy neighbour."""
        s_, n, enemy = self.enemy_slots(s)
        v = self.battle_success_units(s_, n, units_attack[..., None].expand(n.shape), enemy)
        least = torch.ones(s.shape, dtype=torch.float64, device=s.device)
        for k in range(n.shape[-1]):
            least = torch.where(enemy[..., k] & ~(v[..., k] > least), v[..., k], least)
        return least

    def battle_success_max(self, s: torch.Tensor) -> torch.Tensor:
        """`GetBattleSuccessMax(territory)`: 0 with no enemy neighbour."""
        s_, n, enemy = self.enemy_slots(s)
        v = self.battle_success(s_, n, enemy)
        most = torch.zeros(s.shape, dtype=torch.float64, device=s.device)
        for k in range(n.shape[-1]):
            most = torch.where(enemy[..., k] & ~(most > v[..., k]), v[..., k], most)
        return most

    # --- continents --------------------------------------------------------------------------------

    def steal_continent_bonus(self, s: torch.Tensor, t: torch.Tensor) -> torch.Tensor:
        """`GetStealContinentBonus(source, target)`."""
        b = self.board.board
        owns = self.board.owner_owns_continent(t)
        x = self.battle_success(s, t, owns) * 0.4
        bonus = b.continent_bonus.to(torch.int64)[b.continent_of[t]]
        r = torch.trunc(bonus.to(torch.float64) / b.continent_bonus.max().to(torch.float64)) * 0.4
        x = x + 0.2
        x = x + r
        return torch.where(owns, clamp01(x), 0.0)

    def chance_continent_loss(self, src: torch.Tensor) -> torch.Tensor:
        """`GetChanceContinentLoss(territory)`."""
        own = self.continent_ownership(self.board.board.continent_of[src])
        _, n, valid = self._slots(src)
        enemy = (torch.where(valid & (self.owner(n) != self._me(n)), self.units(n), 0)).sum(-1)
        fights = enemy > 0
        loss = (1 - self.battle_success_against(src, enemy.clamp(min=1), fights)) * own
        return torch.where(fights, loss, 0.0)

    def border_weakness(self, c: torch.Tensor) -> torch.Tensor:
        """`GetBorderWeakness(territory)`."""
        continent_of = self.board.board.continent_of
        continent = continent_of[c]
        whole = self.board.continent_owner(continent) == self.owner(c)
        ideal = self.odds.ideal_attack_units(self.units(c))
        _, n, valid = self._slots(c)
        outside = valid & (self.owner(n) != self._me(n)) & (continent_of[n] != continent[..., None])
        total = torch.where(outside, self.units(n), 0).sum(-1)
        weakness = clamp01((total.to(torch.float64) / ideal) * 0.5)
        return torch.where(whole, weakness, 0.0)

    # --- players -----------------------------------------------------------------------------------

    def chance_eliminate_player_to(self, src: torch.Tensor, enemy: torch.Tensor) -> torch.Tensor:
        """`GetChanceEliminatePlayerTo(source, enemy)`."""
        board = self.board
        mine = self.owner(src)
        my_c = board.countries_owned(mine).to(torch.float64)
        my_u = board.total_units(mine).to(torch.float64)
        e_c = board.countries_owned(enemy).to(torch.float64)
        e_u = board.total_units(enemy).to(torch.float64)
        units = self.units(src).to(torch.float64)
        a = clamp01((my_c - e_c) / my_c)
        b = clamp01((my_u - e_u) / my_u)
        c = clamp01((units - e_u) / units)
        d = clamp01(div(board.cards(enemy), 5))
        r = b * 1.2
        r = r + a * 0.8
        r = r + c * 1.4
        r = r + d * 0.6
        return torch.where((e_c >= my_c) | (e_u >= my_u), 0.0, clamp01(r * 0.25))

    def chance_eliminate_player_from(self, src: torch.Tensor) -> torch.Tensor:
        """`GetChanceEliminatePlayerFrom(source)`."""
        s_, n, enemy = self.enemy_slots(src)
        v = self.chance_eliminate_player_to(s_, self.owner(n))
        m = torch.zeros(src.shape, dtype=torch.float64, device=src.device)
        for k in range(n.shape[-1]):
            m = torch.where(enemy[..., k] & ~(m > v[..., k]), v[..., k], m)
        return m

    def enemy_strength_of(self, src: torch.Tensor, tgt: torch.Tensor) -> torch.Tensor:
        """`GetEnemyStrength(source, target)`."""
        board = self.board
        ideal = self.odds.ideal_attack_units(self.units(src))
        enemy = self.owner(tgt)
        s = torch.clamp(self.units(tgt), min=3).to(torch.float64)
        s = s + round_half_even(fround_t(board.income(enemy).to(torch.float64) * fround(0.4)))
        cards = board.cards(enemy)
        s = s + torch.where(cards == 3, 2.0, torch.where(cards == 4, 4.0, torch.where(cards == 5, 6.0, 0.0)))
        next_player = board.next_player.view(-1, *([1] * (enemy.dim() - 1)))
        s = torch.where(next_player == enemy, round_half_even(s * 1.5), s)
        return clamp01(div(s / ideal, 3))

    def enemy_strength(self, src: torch.Tensor) -> torch.Tensor:
        """`GetEnemyStrength(source)`."""
        s_, n, enemy = self.enemy_slots(src)
        v = self.enemy_strength_of(s_, n)
        m = torch.zeros(src.shape, dtype=torch.float64, device=src.device)
        for k in range(n.shape[-1]):
            m = torch.where(enemy[..., k] & ~(m > v[..., k]), v[..., k], m)
        return m

    def country_power(self, c: torch.Tensor) -> torch.Tensor:
        """`GetCountryPower(territory)` (0/0 when every stack is 1, as GD divides)."""
        board = self.board
        largest = torch.where(board.countries(self.me), board.armies, 0).max(1).values
        largest = largest.view(-1, *([1] * (c.dim() - 1)))
        return (self.units(c) - 1).to(torch.float64) / (largest - 1).to(torch.float64)

    @cached_property
    def _leading_player(self) -> torch.Tensor:
        """`GetLeadingPlayer` `[B]`: the most reinforcements coming, the first in turn order on a
        tie (some seat always has 3 or more)."""
        leader = torch.full_like(self.me, -1)
        best = torch.zeros_like(self.me)
        for seat, present in self.board.players():
            income = self.board.income(seat)
            better = present & (income > best)
            leader = torch.where(better, seat, leader)
            best = torch.where(better, income, best)
        return leader

    def player_dominance(self, p: torch.Tensor) -> torch.Tensor:
        """`GetPlayerDominance`."""
        half = round_half_even(self.board.total_units(p).to(torch.float64) * 0.5)
        return self.board.income(p).to(torch.float64) + half

    @cached_property
    def _leading_player_dominance_ratio(self) -> torch.Tensor:
        """`GetLeadingPlayerDominanceRatio` `[B]`."""
        has_first = torch.zeros_like(self.me, dtype=torch.bool)
        has_second = torch.zeros_like(has_first)
        s1 = torch.full(self.me.shape, -1.0, dtype=torch.float64, device=self.me.device)
        s2 = s1.clone()
        for seat, present in self.board.players():
            d = self.player_dominance(seat)
            top = present & (d > s1)
            runner_up = present & ~top & (d > s2)
            has_second = torch.where(top, has_first, has_second | runner_up)
            s2 = torch.where(top, s1, torch.where(runner_up, d, s2))
            has_first = has_first | top
            s1 = torch.where(top, d, s1)
        return torch.where(has_first & has_second, clamp01(1 - s2 / s1), 0.0)

    def leading_player_enemy_ratio(self, c: torch.Tensor) -> torch.Tensor:
        """`GetLeadingPlayerEnemyRatio(territory)`."""
        leader = self._leading_player.view(-1, *([1] * c.dim()))
        _, n, valid = self._slots(c)
        k = (valid & (self.owner(n) == leader)).sum(-1)
        mine = (self._leading_player == self.me).view(-1, *([1] * (c.dim() - 1)))
        return torch.where(mine, 0.0, clamp01(k.to(torch.float64) * 0.25))

    def focus_leading_player_source(self, c: torch.Tensor) -> torch.Tensor:
        """`CalculateFocusLeadingPlayerSource(territory)`."""
        other = (self._leading_player != self.me).view(-1, *([1] * (c.dim() - 1)))
        dom = self._leading_player_dominance_ratio.view(-1, *([1] * (c.dim() - 1)))
        er = self.leading_player_enemy_ratio(c)
        r = torch.where(other & (er > 0), (dom + dom + er) * 0.5, 0.0)
        return clamp01(r)

    def focus_leading_player_target(self) -> torch.Tensor:
        """The leading-player term of `GetAttackTargetCountry`, `[B]`."""
        return torch.where(self._leading_player != self.me, self._leading_player_dominance_ratio, 0.0)

    def is_human(self, seat: torch.Tensor) -> torch.Tensor:
        return GDBoard.at(self.humans, seat)

    @cached_property
    def _continent_held(self) -> torch.Tensor:
        """The territories of each continent the bot holds `[B, 6]`."""
        members = self.board.board.continent_members
        mine = self.board.owners == self.me[:, None]
        return (mine[:, None, :] & members[None]).sum(-1)

    def continent_ownership(self, continent: torch.Tensor) -> torch.Tensor:
        """`GetContinentOwnership(region, me)`: the share of the continent the bot holds."""
        size = self.board.board.continent_members.sum(-1)[continent]
        return GDBoard.at(self._continent_held, continent).to(torch.float64) / size.to(torch.float64)

    @cached_property
    def _picture_owned(self) -> torch.Tensor:
        """`[B]`: some card in the hand pictures a territory the bot owns."""
        territory = self.board.board.card_territory[self.hand.clamp(min=0)]
        pictured = (self.hand >= 0) & (territory >= 0)
        owner = self.board.owners.gather(1, territory.clamp(min=0))
        return (pictured & (owner == self.me[:, None])).any(1)

    def cards_superior_goal(self, units: torch.Tensor, s: torch.Tensor, tgt: torch.Tensor, ask: torch.Tensor) -> torch.Tensor:
        """`ClassicAIHelper.GetCardsSuperiorGoal`."""
        hand_len = (self.hand >= 0).sum(1)
        weight = torch.where(self._picture_owned, 3.0, torch.where(hand_len + 1 >= 3, 4.0, 1.0))
        weight = weight.view(-1, *([1] * (s.dim() - 1)))
        conquered = (self.conquered_this_turn > 0).view(-1, *([1] * (s.dim() - 1)))
        bs = self.battle_success_units(s, tgt, units, ask & ~conquered)
        score = (weight * 1 + 10 * bs) / (weight + 10)
        return torch.where(conquered, 0.0, cut_off(score, fround(0.1)))

    def continent_superior_goal(self, units: torch.Tensor, s: torch.Tensor, tgt: torch.Tensor, ask: torch.Tensor) -> torch.Tensor:
        """`ClassicAIHelper.GetContinentSuperiorGoal`: the persona's threshold (0 to 100) clamped to 1
        by the odds search, as GD passes it."""
        b = self.board.board
        continent = b.continent_of[tgt]
        size = b.continent_members.sum(-1)[continent]
        enemy = size - GDBoard.at(self._continent_held, continent)
        own = (size - enemy + 1).to(torch.float64) / size.to(torch.float64)
        bs = self.battle_success_units(s, tgt, units, ask)
        required = min(1.0, max(0.0, float(self.attack_success_threshold)))
        ideal = self.odds.ideal_attack_units(self.units(tgt), required)
        m = clamp01(div(units - ideal, 5))
        score = div(4 * own + 2 * bs + 2 * (1 - m), 8)
        return cut_off(score, fround(0.55))

    def _best_over_enemies(self, goal, units: torch.Tensor, s: torch.Tensor) -> torch.Tensor:
        s_, n, enemy = self.enemy_slots(s)
        v = goal(units[..., None].expand(n.shape), s_, n, enemy)
        best = torch.zeros(s.shape, dtype=torch.float64, device=s.device)
        for k in range(n.shape[-1]):
            best = torch.where(enemy[..., k] & (v[..., k] > best), v[..., k], best)
        return best

    def cards_superior_goal_of_enemies(self, units: torch.Tensor, s: torch.Tensor) -> torch.Tensor:
        """`GetCardsSuperiorGoalOfEnemies(units, source)`."""
        return self._best_over_enemies(self.cards_superior_goal, units, s)

    def continent_superior_goal_of_enemies(self, units: torch.Tensor, s: torch.Tensor) -> torch.Tensor:
        """`GetContinentSuperiorGoalOfEnemies(units, source)`."""
        return self._best_over_enemies(self.continent_superior_goal, units, s)


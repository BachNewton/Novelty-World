"""GD's `AIPersona` scoring (`bots/gd/persona.ts`), batched: each method scores the candidates of
every game at once, a weighted sum of the helper's features in the TypeScript's order, normalised
by the method's maximum. Territories are index tensors; the bot passes only territories its seat
owns where the TypeScript asks about one (an attack's targets excepted).
"""

from dataclasses import dataclass

import torch

from .gd_choice import draw
from .gd_helper import Helper, clamp01
from .gd_odds import fround, fround_t, round_half_even
from .gd_personas import Weights


def normalize_score(score: torch.Tensor, most: float) -> torch.Tensor:
    """`AIPersona.NormalizeScore`: capped at the maximum, floored at 0, over the maximum."""
    s = torch.where(score > most, most, score)
    return torch.where(0 >= s, 0.0, s) / most


def _column(x: torch.Tensor, like: torch.Tensor) -> torch.Tensor:
    """A per-game value `[B]` shaped to broadcast against `like [B, ...]`."""
    return x.view(-1, *([1] * (like.dim() - 1)))


@dataclass
class DeployContext:
    to_place: torch.Tensor  # [B]: GD's `Player.Units`
    placed_on: torch.Tensor  # [B, 42] bool: `AIDeploy._lastCountries`
    seed: torch.Tensor  # [B]: the decision's stream, drawn from its start


class BaseScorer:
    def __init__(self, persona: str, w: Weights, h: Helper, deploy: DeployContext):
        self.persona = persona
        self.w = w
        self.h = h
        self.deploy = deploy

    def units(self, t: torch.Tensor) -> torch.Tensor:
        return self.h.board.units(t)

    def count_enemies(self, t: torch.Tensor) -> torch.Tensor:
        return self.h.board.count_enemies(t)

    def deploy_country(self, c: torch.Tensor, units: torch.Tensor) -> torch.Tensor:
        """`GetDeployCountry` for territories `c [B, N]` and the amount `units [B]`."""
        w, h = self.w, self.h
        board = h.board
        enemies = self.count_enemies(c)
        attack = self.units(c) + _column(units, c) - 1
        enemy = h.enemy_strength(c)
        elim = h.chance_eliminate_player_from(c)
        cont = h.continent_ownership(board.board.continent_of[c])
        bw = h.border_weakness(c)
        cards = h.cards_superior_goal_of_enemies(attack, c)
        superior_continent = h.continent_superior_goal_of_enemies(attack, c)
        lead = h.focus_leading_player_source(c)
        s = cards * w.card_bonus
        s = s + superior_continent * w.continent_bonus
        s = s + cont * w.deploy_continent_ownership
        s = s + bw * w.deploy_border_weakness
        s = s + enemy * w.deploy_enemy_strength
        s = s + elim * w.eliminate_player
        s = s + lead * w.focus_leading_player
        placed_on = self.deploy.placed_on
        # GD counts an enemy once for each placed-on territory it borders, so the count can exceed
        # the enemies and miss the discount.
        # Counted in integers, not as a float64 matrix product: MKL's dgemm leaves this process's
        # C-library `floor` returning infinity on some machines, and the odds' search calls it.
        bordering = (placed_on[:, :, None] & board.board.adjacency[None]).sum(1)  # [B, 42]
        _, n, enemy_slot = h.enemy_slots(c)
        k = torch.where(enemy_slot, board.at(bordering, n), 0).sum(-1)
        s = torch.where(board.at(placed_on, c), s / 1.5, torch.where(k == enemies, s / fround(1.85), s))
        s = torch.where(0 > s, 0.0, s)
        most = (w.card_bonus + w.continent_bonus + w.deploy_continent_ownership + w.deploy_border_weakness
                + w.deploy_enemy_strength + w.eliminate_player + w.focus_leading_player)
        return torch.where(enemies == 0, 0.0, normalize_score(s, most))

    def deploy_units_amount(self, amounts: torch.Tensor, listed: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """`GetDeployUnitsAmount` for every amount `[B, K]`, each drawing its own ideal (the k-th
        amount the k-th draw), and the draws that takes."""
        to_place = self.deploy.to_place[:, None]
        k = torch.arange(amounts.shape[1], device=amounts.device).expand(amounts.shape)
        r = fround_t(1.5 + draw(self.deploy.seed, k) * 0.5)
        ideal = torch.ceil(fround_t(to_place / r))
        ideal = torch.where(to_place <= 3, to_place.to(torch.float64), ideal)
        d = clamp01(torch.abs(amounts - ideal) / ideal)
        return normalize_score(clamp01(1 - d), 1), listed.sum(1)

    def attack_source(self, c: torch.Tensor) -> torch.Tensor:
        """`GetAttackSourceCountry`: 0 below the success threshold (the desperate one until the
        turn's first capture)."""
        w, h = self.w, self.h
        co = h.continent_ownership(h.board.board.continent_of[c])
        loss = h.chance_continent_loss(c)
        elim = h.chance_eliminate_player_from(c)
        bs_max = h.battle_success_max(c)
        sup_c = h.cards_superior_goal_of_enemies(self.units(c) - 1, c)
        sup_k = h.continent_superior_goal_of_enemies(self.units(c) - 1, c)
        es = h.enemy_strength(c)
        threshold = _column(self.threshold(), c)
        focus = h.focus_leading_player_source(c)
        turns = _column(h.attack_turns_limit(20, 150), c)
        s = sup_c * w.card_bonus
        s = s + sup_k * w.continent_bonus
        s = s + co * w.attack_from_continent_ownership
        s = s + (100 - w.risky) * bs_max
        s = s + elim * w.eliminate_player
        s = s + focus * w.focus_leading_player
        s = s - loss * w.attack_continent_loss
        s = s - es * w.attack_enemy_strength
        s = s - turns
        s = torch.where(0 > s, 0.0, s)
        return torch.where(clamp01(threshold / 100) > bs_max, 0.0, normalize_score(s, self.attack_source_max()))

    def threshold(self) -> torch.Tensor:
        """The attack's success threshold `[B]`: the desperate one until the turn's first capture."""
        w = self.w
        desperate = self.h.desperate()
        return torch.where(desperate, float(w.attack_success_desperate_threshold), float(w.attack_success_threshold))

    def attack_source_max(self) -> int:
        w = self.w
        return (w.card_bonus + w.continent_bonus + w.attack_from_continent_ownership + (100 - w.risky)
                + w.eliminate_player + w.focus_leading_player)

    def attack_target(self, source: torch.Tensor, c: torch.Tensor) -> torch.Tensor:
        """`GetAttackTargetCountry` for one source `[B]` and targets `c [B, N]`."""
        w, h = self.w, self.h
        src = source[:, None].expand(c.shape)
        co = h.continent_ownership(h.board.board.continent_of[c])
        elim = h.chance_eliminate_player_to(src, h.board.owner(c))
        bs = h.battle_success(src, c)
        steal = h.steal_continent_bonus(src, c)
        threshold = _column(self.threshold(), c)
        es = h.enemy_strength_of(src, c)
        lead = _column(h.focus_leading_player_target(), c)
        s = co * w.attack_to_continent_ownership
        s = s + elim * w.eliminate_player
        s = s + (100 - w.risky) * bs
        s = s + steal * w.continent_bonus
        s = s + lead * w.focus_leading_player
        s = s - es * w.attack_enemy_strength
        s = torch.where(0 >= s, 0.0, s)
        most = w.attack_to_continent_ownership + w.eliminate_player + (100 - w.risky) + w.continent_bonus + w.focus_leading_player
        return torch.where(clamp01(threshold / 100) > bs, 0.0, normalize_score(s, most))

    def attack_move_units_amount(self, low: torch.Tensor, high: torch.Tensor, source: torch.Tensor, target: torch.Tensor,
                                 amounts: torch.Tensor) -> torch.Tensor:
        """`GetAttackMoveUnitsAmount`: the move-in split by the threat at each end."""
        h = self.h
        n_s = self.count_enemies(source).to(torch.float64)
        n_t = self.count_enemies(target).to(torch.float64)
        bw_s = h.border_weakness(source)
        bw_t = h.border_weakness(target)
        es_s = h.enemy_strength(source)
        es_t = h.enemy_strength(target)
        bw_s = torch.where(torch.isnan(bw_s), 0.0, bw_s)
        w_t = bw_t * 5 + 5 * n_t + es_t * 10
        total = 5 * n_s + bw_s * 5 + es_s * 10 + w_t
        span = (high - low).to(torch.float64)
        ideal = (w_t / total) * span + low
        diff = amounts - round_half_even(ideal)[:, None]
        f = 1 - torch.abs(diff) / span[:, None]
        f = clamp01(f)
        f = torch.where(torch.isnan(f), 1.0, f)
        return normalize_score(f, 1)

    def fortify_source(self, c: torch.Tensor) -> torch.Tensor:
        """`GetFortifySourceCountry`."""
        w, h = self.w, self.h
        power = h.country_power(c)
        no_enemy_power = torch.where(self.count_enemies(c) == 0, power * 0.5 + 0.5, 0.0)
        bw = h.border_weakness(c)
        es = h.enemy_strength(c)
        raw = (power * w.fortify_unit_count + no_enemy_power * w.fortify_no_enemies_power
               - bw * w.fortify_border_weakness - es * w.fortify_enemy_strength)
        return normalize_score(raw, w.fortify_unit_count + w.fortify_no_enemies_power)

    def fortify_end(self, t: torch.Tensor, attack_units: torch.Tensor) -> torch.Tensor:
        """One end's score in `GetFortifyTargetCountry`."""
        w, h = self.w, self.h
        t_, n, enemy = h.enemy_slots(t)
        enemy_owner = h.board.owner(n)
        enemies = enemy.sum(-1)
        humans = (enemy & h.is_human(enemy_owner)).sum(-1)
        cont = h.continent_ownership(h.board.board.continent_of[t])
        bw = h.border_weakness(t)
        elim = h.chance_eliminate_player_from(t)
        es = h.enemy_strength(t)
        first = enemy_owner.gather(-1, enemy.to(torch.int64).argmax(-1, keepdim=True))
        several = (enemy & (enemy_owner != first)).any(-1)
        elim = torch.where(several, 0.0, elim)
        bs = h.battle_success_min(t, attack_units)
        human_ratio = torch.where((humans > 0) & (enemies > 0), humans.to(torch.float64) / enemies.to(torch.float64), 0.0)
        return (cont * w.fortify_continent_ownership + bw * w.fortify_border_weakness + elim * w.eliminate_player
                + (100 - w.risky) * bs + es * w.fortify_enemy_strength - human_ratio * w.fortify_human_ratio)

    def fortify_target(self, source: torch.Tensor, t: torch.Tensor) -> torch.Tensor:
        """`GetFortifyTargetCountry` for one source `[B]` and targets `t [B, N]`: 0 unless the target
        beats the source when the source faces enemies itself."""
        w = self.w
        src = source[:, None]
        score = self.fortify_end(t, self.units(t) + self.units(src) - 2)
        faces = self.count_enemies(src) > 0
        source_score = torch.where(faces, self.fortify_end(src, self.units(src) - 1), 0.0)
        most = w.fortify_continent_ownership + w.fortify_border_weakness + w.eliminate_player + (100 - w.risky) + w.fortify_enemy_strength
        return torch.where(source_score >= score, 0.0, normalize_score(score, most))

    def fortify_move_units_amount(self, source: torch.Tensor, target: torch.Tensor, amounts: torch.Tensor) -> torch.Tensor:
        """`GetFortifyMoveUnitsAmount`: the armies split in proportion to the threat at each end."""
        h = self.h
        max_move = (self.units(source) - 1).to(torch.float64)
        s_es = h.enemy_strength(source)
        t_es = h.enemy_strength(target)
        s_bw = h.border_weakness(source)
        t_bw = h.border_weakness(target)
        t_threat = t_bw + t_es
        total = s_bw + s_es + t_threat
        ideal = (t_threat / total) * max_move
        diff = torch.abs(ideal[:, None] - amounts)
        raw = 1 - diff / max_move[:, None]
        return normalize_score(raw, 1)


class StackerScorer(BaseScorer):
    """`StackerAIPersona`: everything it places, moves in or fortifies with onto one stack, attacks
    only from near-certain sources, and the base attack target scoring."""

    def __init__(self, w: Weights, h: Helper, deploy: DeployContext):
        super().__init__("stacker", w, h, deploy)

    def deploy_country(self, c: torch.Tensor, units: torch.Tensor) -> torch.Tensor:
        h = self.h
        interior = (self.count_enemies(c) == 0).to(torch.float64)
        s = h.country_power(c) * 3 + h.enemy_strength(c) + h.border_weakness(c) - interior * 3
        return normalize_score(s, 3 + 1 + 1)

    def deploy_units_amount(self, amounts: torch.Tensor, listed: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        whole = (amounts == self.deploy.to_place[:, None]).to(torch.float64)
        return normalize_score(whole, 1), torch.zeros_like(self.deploy.to_place)

    def attack_source(self, c: torch.Tensor) -> torch.Tensor:
        h = self.h
        power = h.country_power(c)
        smax = h.battle_success_max(c)
        threshold = _column(self.threshold(), c)
        limit = _column(h.attack_turns_limit(fround(0.45), 3), c)
        return torch.where(clamp01(threshold / 100) > smax, 0.0, normalize_score(power + smax - limit, 1 + 1))

    def attack_move_units_amount(self, low: torch.Tensor, high: torch.Tensor, source: torch.Tensor, target: torch.Tensor,
                                 amounts: torch.Tensor) -> torch.Tensor:
        return normalize_score((amounts == high[:, None]).to(torch.float64), 1)

    def fortify_source(self, c: torch.Tensor) -> torch.Tensor:
        """The most powerful territory joined to each source, the first in breadth-first order on a
        tie, and its power less itself if it faces no enemy."""
        h = self.h
        order, _ = h.board.connected(c)  # [B, N, 41]
        joined = order >= 0
        t = torch.where(joined, order, c[..., None])
        p = h.country_power(t)
        positive = joined & (p > 0)
        max_p = torch.where(positive, p, 0.0).max(-1, keepdim=True).values
        column = torch.arange(order.shape[-1], device=c.device)
        first = torch.where(positive & (p == max_p), column, order.shape[-1]).min(-1, keepdim=True).values
        has_best = first[..., 0] < order.shape[-1]
        best = t.gather(-1, first.clamp(max=order.shape[-1] - 1))[..., 0]
        max_p = max_p[..., 0]
        interior_p = torch.where(has_best & (self.count_enemies(best) == 0), max_p, 0.0)
        s = max_p * 5 + h.country_power(c) - interior_p * 5
        return normalize_score(s, 5 + 1)

    def fortify_target(self, source: torch.Tensor, t: torch.Tensor) -> torch.Tensor:
        h = self.h
        src = source[:, None]
        target = h.country_power(t) * fround(1.8) + h.enemy_strength(t) + h.border_weakness(t)
        frm = h.country_power(src) * fround(1.8) + h.enemy_strength(src) + h.border_weakness(src)
        blocked = (self.count_enemies(src) > 0) & (frm >= target)
        score = torch.where(blocked, 0.0, normalize_score(target, fround(1.8) + 1 + 1))
        return torch.where(self.count_enemies(t) == 0, 0.0, score)

    def fortify_move_units_amount(self, source: torch.Tensor, target: torch.Tensor, amounts: torch.Tensor) -> torch.Tensor:
        return normalize_score((amounts == (self.units(source) - 1)[:, None]).to(torch.float64), 1)

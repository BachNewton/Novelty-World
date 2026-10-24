"""GD's persona weights (`bots/gd/personas.ts`, its `DAIStats`, 0 to 100), for the four personas
its Expert tier deals."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Weights:
    risky: int
    continent_bonus: int
    card_bonus: int
    eliminate_player: int
    focus_leading_player: int
    deploy_continent_ownership: int
    deploy_border_weakness: int
    deploy_enemy_strength: int
    attack_from_continent_ownership: int
    attack_to_continent_ownership: int
    attack_continent_loss: int
    attack_enemy_strength: int
    attack_success_threshold: int
    attack_success_desperate_threshold: int
    fortify_no_enemies_power: int
    fortify_border_weakness: int
    fortify_continent_ownership: int
    fortify_human_ratio: int
    fortify_enemy_strength: int
    fortify_unit_count: int


PERSONAS = ("defensive", "continental", "aggressive", "stacker")

WEIGHTS: dict[str, Weights] = {
    "defensive": Weights(
        risky=50, continent_bonus=25, card_bonus=30, eliminate_player=35, focus_leading_player=30,
        deploy_continent_ownership=30, deploy_border_weakness=70, deploy_enemy_strength=45,
        attack_from_continent_ownership=20, attack_to_continent_ownership=45, attack_continent_loss=40,
        attack_enemy_strength=95, attack_success_threshold=80, attack_success_desperate_threshold=40,
        fortify_no_enemies_power=80, fortify_border_weakness=50, fortify_continent_ownership=40,
        fortify_human_ratio=0, fortify_enemy_strength=70, fortify_unit_count=30,
    ),
    "continental": Weights(
        risky=60, continent_bonus=65, card_bonus=25, eliminate_player=45, focus_leading_player=65,
        deploy_continent_ownership=35, deploy_border_weakness=60, deploy_enemy_strength=75,
        attack_from_continent_ownership=30, attack_to_continent_ownership=60, attack_continent_loss=45,
        attack_enemy_strength=60, attack_success_threshold=55, attack_success_desperate_threshold=25,
        fortify_no_enemies_power=80, fortify_border_weakness=60, fortify_continent_ownership=60,
        fortify_human_ratio=0, fortify_enemy_strength=50, fortify_unit_count=40,
    ),
    "aggressive": Weights(
        risky=70, continent_bonus=45, card_bonus=55, eliminate_player=70, focus_leading_player=70,
        deploy_continent_ownership=15, deploy_border_weakness=40, deploy_enemy_strength=95,
        attack_from_continent_ownership=5, attack_to_continent_ownership=50, attack_continent_loss=25,
        attack_enemy_strength=30, attack_success_threshold=45, attack_success_desperate_threshold=10,
        fortify_no_enemies_power=60, fortify_border_weakness=35, fortify_continent_ownership=15,
        fortify_human_ratio=0, fortify_enemy_strength=30, fortify_unit_count=45,
    ),
    "stacker": Weights(
        risky=40, continent_bonus=50, card_bonus=50, eliminate_player=30, focus_leading_player=10,
        deploy_continent_ownership=0, deploy_border_weakness=0, deploy_enemy_strength=0,
        attack_from_continent_ownership=20, attack_to_continent_ownership=75, attack_continent_loss=40,
        attack_enemy_strength=60, attack_success_threshold=99, attack_success_desperate_threshold=45,
        fortify_no_enemies_power=0, fortify_border_weakness=0, fortify_continent_ownership=0,
        fortify_human_ratio=0, fortify_enemy_strength=0, fortify_unit_count=0,
    ),
}

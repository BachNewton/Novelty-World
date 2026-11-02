"""The rule's fiddly cases: python art/facades/test_assign.py, from the project folder, with the pipeline's venv."""

import unittest

import assign
from assign import Facts, choose, sign_word

VILLA = assign.STYLES["villa"]


def house(seed: int, street: str = "Södragatan", **overrides) -> Facts:
    facts = {"kind": assign.HOUSE, "area": 150.0, "eaves": 5.0, "rise": 4.0, "seed": seed, "street": street}
    return Facts(**{**facts, **overrides})


def villas(**overrides) -> int:
    return sum(1 for seed in range(1000) if (choice := choose(house(seed, **overrides))) and choice.style == VILLA)


class Rule(unittest.TestCase):
    def test_being_central_does_not_make_a_house_wooden(self):
        self.assertEqual(villas(street="Torggatan"), 0)

    def test_even_on_the_best_street_some_were_replaced(self):
        self.assertTrue(600 < villas() < 850)

    def test_a_flat_roof_is_not_a_villa(self):
        self.assertEqual(villas(rise=0.5), 0)

    def test_apartments_are_not_villas(self):
        self.assertEqual(villas(kind=assign.APARTMENTS), 0)

    def test_osm_material_outranks_the_street(self):
        choice = choose(house(1, tags={"building:material": "brick"}))
        self.assertEqual(choice.style, assign.STYLES["brick"])

    def test_a_church_keeps_its_own_look(self):
        self.assertIsNone(choose(Facts(42211, 500.0, 12.0, 6.0, 3, tags={"building": "church"})))

    def test_a_cottage_stays_timber(self):
        self.assertIsNone(choose(Facts(42231, 60.0, 2.6, 2.0, 3, rural=True)))

    def test_a_small_shed_stays_boards_and_a_big_rural_one_is_a_barn(self):
        self.assertIsNone(choose(Facts(42261, 30.0, 2.6, 2.0, 3, rural=True)))
        self.assertEqual(choose(Facts(42261, 200.0, 3.5, 3.0, 3, rural=True)).style, assign.STYLES["barn"])

    def test_a_hipped_commercial_block_is_not_glass(self):
        for seed in range(200):
            choice = choose(Facts(42221, 400.0, 8.0, 6.0, seed, tags={"building": "retail"}))
            self.assertNotEqual(choice and choice.style, assign.STYLES["glass"])

    def test_a_tint_keeps_the_door_and_word_apart(self):
        choice = assign.Choice(assign.STYLES["block"], 7, assign.FRONT["shop"], 5)
        self.assertEqual(choice.tint(True, 200), (7 | (1 << 5), 128 | 5, 200, assign.STYLES["block"]))


class Signs(unittest.TestCase):
    def test_a_chain_is_invented_and_an_independent_is_its_trade(self):
        self.assertIn(assign.IDS["words"][sign_word({"shop": "supermarket", "brand": "S-market", "name": "S-market"}, 1)], ("MATHOLMEN", "SKUTHALLEN"))
        self.assertEqual(assign.IDS["words"][sign_word({"shop": "bakery", "name": "Pettas"}, 1)], "BAGERI")

    def test_every_word_the_rule_can_use_is_on_the_sheet(self):
        for word in assign.TRADE_WORDS.values():
            self.assertIn(word, assign.WORD)
        for words in assign.CHAIN_WORDS.values():
            for word in words:
                self.assertIn(word, assign.WORD)


if __name__ == "__main__":
    unittest.main()

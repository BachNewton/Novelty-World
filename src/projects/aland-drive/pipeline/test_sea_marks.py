"""Which of the kit's models each official aid to navigation becomes: the mapping a change can quietly break."""

import unittest

from sea_marks import model_of


def aid(kind: str, side: int | None = None, colours: str = "", name: str = "") -> dict:
    return {"turvalaitetyyppifi": kind, "navigointilajikoodi": side, "paivatunnusten_tiedot": f"Väri: {colours}, Väritys: ", "nimifi": name}


class Marks(unittest.TestCase):
    def test_a_buoy_takes_its_iala_meaning_from_the_register(self):
        self.assertEqual(model_of(aid("Viitta", 1)), "spar-port")
        self.assertEqual(model_of(aid("Viitta", 2)), "spar-starboard")
        self.assertEqual(model_of(aid("Poiju", 3)), "pillar-north")
        self.assertEqual(model_of(aid("Reunamerkki", 6)), "fixed-east")

    def test_a_buoy_with_no_meaning_is_not_drawn(self):
        self.assertIsNone(model_of(aid("Viitta", 99)))

    def test_a_leading_mark_is_front_or_rear_and_wears_its_stripes(self):
        self.assertEqual(model_of(aid("Linjamerkki", 99, "Punainen/keltainen/punainen", "Golland alempi")), "leading-front-red-yellow")
        self.assertEqual(model_of(aid("Linjamerkki", 99, "Keltainen/punainen/keltainen", "Degerby ylempi")), "leading-rear-yellow-red")

    def test_a_radar_mark_wears_its_bands(self):
        self.assertEqual(model_of(aid("Tutkamerkki", 99, "Valkoinen/oranssi/valkoinen")), "radar-white-orange")


if __name__ == "__main__":
    unittest.main()

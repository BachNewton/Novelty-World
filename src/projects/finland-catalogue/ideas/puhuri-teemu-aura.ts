import type { Idea } from "../types";

export const puhuriTeemuAura: Idea = {
  slug: "puhuri-teemu-aura",
  title: "Puhuri by Patisserie Teemu Aura (\"The Red Café\")",
  shortDescription:
    "A pastry café run by celebrated Helsinki pâtissier Teemu Aura inside the Red Villa — Lauttasaari's oldest building (1792) and the third-oldest wooden house in Helsinki — serving handmade viennoiserie, seasonal breakfast and lunch, and rotating Kone Foundation art exhibitions on the walls. The local-favourite weekend morning stop.",
  longDescription: [
    "The Red Villa (Punainen Huvila) sits in the courtyard of the 1837 Lauttasaari Manor, behind a small park three minutes' walk from the metro station. It was built around 1792 — the oldest building on Lauttasaari and the third-oldest wooden structure in Helsinki, originally the manor's main residence and one of the small handful of buildings that predate the city's growth around the island. The Kone Foundation bought the manor and its grounds in 2015 and has run the Red Villa as a leased café space ever since, alternating tenants every few years (Tartine until 2021, Patisserie Teemu Aura since January 2022). The current incarnation is the most accomplished food the building has ever housed.",
    "Patisserie Teemu Aura is one of the small group of Helsinki pâtissiers operating at competition-level — Aura himself trained classically and the shop turns out the kind of viennoiserie (kouign-amann, croissants laminated 81 times, cardamom buns, brioche), gateaux, tarts, and seasonal cakes that the third-wave-coffee crowd shows up for on Saturday morning with a paperback. Puhuri is the all-day version of the patisserie: the full pastry case is augmented by a seasonal breakfast menu (eggs, toast, granola, salmon dishes, the classic ruisleipä-and-cheese breakfast plate) and a tight lunch list — typically a salmon soup and two rotating weekly mains served with house bread, all in the €6–16 range. Coffee is from a quality roaster, and a piece of cake plus a cortado in the bright front room with the antique tile stove is the easiest possible way to spend forty-five minutes on Lauttasaari.",
    "What makes it more than a good café is the building and the curation. The Red Villa is itself worth the visit — log construction, glass porch, original tile stoves, the kind of room where a coffee tastes better just by being in it — and the Kone Foundation rotates contemporary art exhibitions through the walls (recent shows have included photography, painting, and small sculpture by emerging Finnish artists, all free to view). In the warm months, a summer terrace opens onto the manor courtyard, well-behaved dogs welcome, and the whole place becomes the centre of gravity of a Lauttasaari weekend morning. Locally — including the kid-vocabulary in this household — it's just \"the Red Café,\" which is what most regulars actually call it.",
    "Open Mon–Wed 10:00–16:00 (kitchen 10:00–14:00), Thu–Fri 10:00–18:00 (kitchen 10:00–14:00), Sat 9:00–17:00 (kitchen 9:00–14:00), closed Sundays. No reservations — walk in, queue at the counter, find a table. Saturday morning is the busiest window (expect a 5–10 minute counter queue and a wait for a window seat); Wednesday afternoon is the quietest. Coffee €4–5, pastries €5–7, breakfast plates €10–14, lunch €12–16. From elsewhere in Lauttasaari, ~5 min walk from Lauttasaari metro station via Kauppaneuvoksentie. Address: Kauppaneuvoksentie 18, 00200 Helsinki.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Punainen_huvila.jpg",
  galleryUrls: [
    "https://patisserieteemuaura.fi/wp-content/uploads/2022/01/3nKGYQI0-2-e1731578540496-1185x1500.jpeg",
    "https://koneensaatio.fi/wp-content/uploads/2021/12/Image-from-iOS-2-1060x795.jpg",
    "https://www.lauttasaari.fi/content/uploads/2019/03/Punainenhuv_pieni-800x0-c-default.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaaren_kartano.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Mon–Wed 10:00–16:00 (kitchen 10:00–14:00), Thu–Fri 10:00–18:00 (kitchen 10:00–14:00), Sat 9:00–17:00 (kitchen 9:00–14:00), closed Sundays.",
    notes:
      "Year-round. Saturday morning is the busiest and most atmospheric window — expect a brief counter queue and a wait for a window seat. Quietest mid-week afternoons. Summer terrace open roughly May–September weather permitting; the indoor room with the antique tile stove is the winter draw.",
  },
  location: {
    region: ["Helsinki", "Lauttasaari", "Uusimaa"],
    address: "Kauppaneuvoksentie 18, 00200 Helsinki (Red Villa, Lauttasaari Manor courtyard)",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~5 min walk",
    notes:
      "Same island. ~5 min walk from Lauttasaari metro station along Kauppaneuvoksentie — the Red Villa sits behind the larger 1837 manor building in the small park. Bus 21 along Lauttasaarentie also stops nearby. From central Helsinki, M1/M2 metro to Lauttasaari (~3 min from Kamppi).",
  },
  cost: {
    perPersonEur: 12,
    notes:
      "Coffee €4–5, pastries €5–7, breakfast plates €10–14, lunch dishes €12–16. A coffee-and-pastry stop runs about €10; a full breakfast or lunch closer to €15–18. Cash and card. The art exhibitions are always free to view.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "No reservations — walk-in only. Saturday 10:00–12:30 is the peak; arrive at opening (9:00) for the calmest window with the full pastry case still intact. Pastries sell out by mid-afternoon on busy weekends.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Family-friendly: stroller-accessible front entrance, the broad pastry case is a hit with kids, and the manor courtyard has open green space for a child to escape to between bites. No high-chair guarantee but the bench seating works fine for sharing. Well-behaved dogs allowed too.",
  indoorOutdoor: "mixed",
  physicalIntensity: "low",
  duration: "<1h",
  website: "https://patisserieteemuaura.fi/myymalat/puhuri-by-patisserie-teemu-aura/",
  tags: ["food", "café", "historical"],
};

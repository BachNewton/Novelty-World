import type { Idea } from "../types";

export const cafeRegatta: Idea = {
  slug: "cafe-regatta",
  title: "Cafe Regatta",
  shortDescription:
    "A pocket-sized red wooden cottage on Taivallahti bay near the Sibelius Monument — order a cinnamon bun and coffee through the door, sit by the outdoor fire pit, and grill your own sausage on the always-lit grill.",
  longDescription: [
    "Cafe Regatta sits in a 1887 red-painted log cabin originally built as a fishnet shed for the Paulig coffee dynasty, on the Taivallahti bay shore a couple of minutes' walk from the Sibelius Monument. It's tiny — the inside is one cluttered room of mismatched chairs, vintage enamel signs, and old kitchen tools nailed to every available beam — so most of the seating is outside on the rocky shore, on benches around the always-burning fire pit, and at picnic tables looking out at the masts of the Töölö yacht club.",
    "The pull is twofold: the building itself, which is the postcard image of cosy Finnish coffee culture, and the cinnamon buns (korvapuusti) — denser and less sweet than the Swedish version, baked through the day, and inexpensive enough that locals bring visitors here precisely because the bill never feels touristy. The other classics on the counter are blueberry pie (mustikkapiirakka), salmon soup, and rye-bread sandwiches. Order at the hatch, take a number, the staff bring it out.",
    "The fire pit is the secret weapon — it's lit year-round, and the café sells sausages and skewers you can grill yourself over the embers. In winter you sit bundled with a hot glögi while snow lands on the lid of your cup; in summer the rocks are sunbathing-hot and the café's sub-brand SUP Regatta rents kayaks, SUPs, and rowing boats off the dock 5 metres away. There's no booking and no table service — at peak summer-Saturday hours the queue snakes back to the road, but the line moves fast.",
    "From central Helsinki, walk along the Töölö coastal path (~25 min from the train station) or take tram 4 to Töölön halli and walk five minutes down. Combine with the Sibelius Monument (3 min walk), the Hietaniemi cemetery and beach (15 min walk south), or as a stop on the coastal bike loop.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Cafe_Regatta_in_Helsinki.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Cafe_Regatta_2018-1.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Café_Regatta_in_Helsinki,_Finland,_2022_October.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Café_Regatta_feb_2015.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/2018_January_in_Helsinki_(46315531434).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Cafe_Regatta.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule: "Daily ~08:00–21:00 (slightly shorter in deepest winter).",
    notes:
      "Genuine year-round destination — the fire pit and cottage charm work just as well in February snow as in July sun. Lunchtime weekend queues in summer are heaviest 11:00–14:00.",
  },
  location: {
    region: ["Helsinki", "Töölö", "Uusimaa"],
    address: "Merikannontie 8, 00260 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~25 min",
    notes:
      "Metro from Lauttasaari to Ruoholahti (~3 min), then tram 4 to Töölön halli and a 5-min walk down the slope to the bay. In summer the prettier route is to bike or walk the coastal path over the Hietaniemi bridge (~30 min from northern Lauttasaari). 2-min walk from the Sibelius Monument.",
  },
  cost: {
    perPersonEur: 8,
    notes:
      "Coffee + cinnamon bun ~€7. Salmon soup ~€12. Sausage to grill ~€4. Cash and card. SUP/kayak rental from a separate counter (~€20/hour) in summer.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "No bookings — walk-up only. At peak summer-Saturday hours the queue can be 20–30 minutes; weekday mornings are wide open.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Kid-friendly in every sense — outdoor space, the fire pit (supervised), buns big enough to share, and rocks to scramble on. Stroller-friendly approach but the actual cafe interior is too small for one inside; park outside.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "<1h",
  website: "https://www.caferegatta.fi/in-english",
  tags: ["food", "café", "nautical"],
};

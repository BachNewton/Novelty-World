import type { Idea } from "../types";

export const andante: Idea = {
  slug: "andante",
  title: "Andante",
  shortDescription:
    "A florist-turned-specialty-café on Fredrikinkatu in Punavuori, named for the musical \"moderately, slow\" — a rotating list of Nordic and European award-winning roasters, hand-brew filter, scones and Basque cheesecake, and exposed-brick light all afternoon.",
  longDescription: [
    "Andante opened in a former Punavuori flower shop that had been on the same Fredrikinkatu block since 1990, and the bones of the old place — exposed red brick, reclaimed wood, plants still tucked along the windows — became the bones of the café. The name is musical: andante, \"moderately, slow.\" That's the pace of the room and the philosophy of the bar; nothing is rushed, hand-brews are pulled at filter temperature, conversation runs long, and the staff are happy to talk you through the day's beans without making it feel like a quiz.",
    "The coffee programme is rotational rather than house-roast. On any given visit there are two or three filter options and one or two espressos drawn from a list of European award-winning roasters that has included Kawa (Paris), La Cabra (Copenhagen), Manhattan Coffee (Rotterdam), Dak (Amsterdam), and Helsinki's own Samples — the kind of line-up that Helsinki coffee-people rotate through over a weekend and Andante curates into a single bar. Filter is the move; if you order one drink, make it the V60.",
    "Pastry is the other reason to stay. Daily-baked scones, matcha tiramisu, Basque cheesecake, and a strong carrot cake — all baked in-house, all available until they sell out (which happens earlier than you'd expect on weekends). The kitchen also runs raw and vegan options, a holdover from the early concept. House-made granola and drip-bag coffee are sold to take home; merchandise is light but tasteful.",
    "Open Mon–Fri 09:00–18:00 and Sat 11:00–18:00, closed Sundays. Coffee €4–6, pastries €5–8, the typical sit-down stop is €10–12. Walk-in only — no reservations, and no hot food beyond pastry, so it's a coffee-and-cake stop rather than a meal. From Lauttasaari, the easiest route is bus 21 to Erottaja or the metro to Kamppi and a 10-minute walk south through the Design District. Pair naturally with a wander through Punavuori's small design shops on the same afternoon.",
  ],
  thumbnailUrl:
    "https://andantecoffee.com/cdn/shop/files/IMG_6108.jpg",
  galleryUrls: [
    "https://andantecoffee.com/cdn/shop/files/IMG_4967.jpg",
    "https://andantecoffee.com/cdn/shop/files/IMG_5142.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Fredrikinkatu_on_an_afternoon_in_August_2024.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Fredrikinkatu_from_Ratakatu.JPG",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule: "Mon–Fri 09:00–18:00, Sat 11:00–18:00, closed Sundays",
    notes:
      "Year-round. Especially welcome on a winter afternoon — the room is bright, the brick walls absorb the cold, and the brew time matches the pace you'd want anyway.",
  },
  location: {
    region: ["Helsinki", "Punavuori", "Uusimaa"],
    address: "Fredrikinkatu 20, 00120 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~15 min",
    notes:
      "Bus 21 from Lauttasaari to Erottaja stop (~12 min) puts you a 3-min walk away. Alternative: M1/M2 metro to Kamppi (~3 min), then a 10-min walk south through the Design District along Fredrikinkatu.",
  },
  cost: {
    perPersonEur: 8,
    notes:
      "Filter coffee €4–5, espresso drinks €4–6, pastries €5–8. A typical sit-down coffee-and-cake stop is €10–12.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-in only, no reservations. Busiest weekend afternoons — go before 11:00 on Saturday or any weekday morning to be sure of a table and the full pastry case.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Stroller-accessible — single ground-floor room, no steps. Quiet, conversational atmosphere; older kids do fine, toddlers may find the slow pace boring. No high chairs guaranteed but a low bench seat works for sharing.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "<1h",
  website: "https://andantecoffee.com/",
  tags: ["food", "café"],
};

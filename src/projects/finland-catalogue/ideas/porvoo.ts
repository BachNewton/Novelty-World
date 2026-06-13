import type { Idea } from "../types";

export const porvoo: Idea = {
  slug: "porvoo",
  title: "Porvoo (by m/s J.L. Runeberg)",
  shortDescription:
    "Finland's second-oldest town — a perfectly preserved medieval old town of cobbled lanes, red wooden riverside warehouses, and the 15th-century Porvoo Cathedral — reached from Helsinki by a 3.5-hour cruise on the historic 1912 steamer m/s J.L. Runeberg.",
  longDescription: [
    "Porvoo (Borgå in Swedish) is the second-oldest town in Finland — granted town rights around 1380, eclipsed only by Turku — and its old town is the postcard-perfect bit. A grid of wooden houses on medieval foundations spilling down a hill to the Porvoonjoki river, anchored by the stone-and-brick Porvoo Cathedral (built 1410–1418, partially burnt and restored in 2008) at the top and the famous red-painted timber warehouses along the water's edge at the bottom. About two-thirds of the town burned in a 1760 fire, but it was rebuilt on the same medieval street pattern, so what you walk through today is genuinely centuries-old in plan if not in every plank.",
    "The town is small — you can do the entire old town in 90 minutes, longer if you stop. The classic loop: walk up Kirkkokatu to the cathedral, down through the Devil's Steps alleyway, along Välikatu's pastel wooden facades, finish at Brunberg's chocolate factory shop (Porvoo's other claim to fame — soft toffees and chocolate kisses since 1871). Lunch options range from Café Helmi for cardamom buns to Sicapelle for proper sit-down. There's a small Runeberg cake shop near the Runeberg House museum (the home of national poet J.L. Runeberg, after whom the boat is named).",
    "The marquee way to get there is the m/s J.L. Runeberg, a steel-hulled passenger steamer built in 1912 and still in seasonal service. She sails from Linnanlaituri at Helsinki's South Harbour at 10:00, takes 3.5 hours along the archipelago to Porvoo, gives you 2.5 hours ashore, then sails back at 16:00 and docks Helsinki at ~19:30. Round-trip €50 adult / €25 child 7–15 / under-7 free; senior €46. Optional onboard lunch (Finnish salmon soup with bread, Runeberg cake, coffee) is €16 if pre-booked, €18 onboard. Operates May–September: Tue/Wed/Fri/Sat year-round, plus Sundays in June–August. In rough weather she sometimes substitutes the smaller Queen.",
    "If you'd rather a quick out-and-back without dedicating the whole day, take the OnniBus from Kamppi terminal — €6–9, ~50 minutes, hourly through the day — and you can be back in Helsinki for dinner. The boat is the experience, but the bus is the practical answer for a short visit.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Old_Porvoo_riverside.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Porvoo_in_January.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Porvoo_Cathedral_and_old_town_Dec_2017.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Vanha_Porvoo_Kirkkokatu.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Porvoon_Tuomiokirkko.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Barns_on_the_shore_of_the_river.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Porvoo_Old_Town_Hall.jpg",
  ],
  availability: {
    suitableMonths: [5, 6, 7, 8, 9, 10, 11, 12],
    notes:
      "Old town itself is open and walkable year-round and is especially atmospheric under snow in December. The m/s J.L. Runeberg cruise runs only May–September; outside that window, take the OnniBus from Helsinki Kamppi terminal (~50 min, hourly).",
  },
  location: {
    region: ["Helsinki", "Porvoo", "Uusimaa"],
    address: "Old Porvoo, 06100 Porvoo (~50 km east of Helsinki)",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~1h 5m by bus, or ~4h cruise each way",
    notes:
      "Two routes, both starting with a short metro hop. (1) Metro to Helsinki Central (~6 min), walk to Kamppi bus terminal (~5 min), then OnniBus to Porvoo — hourly, ~50 min, €6–9, year-round. (2) Metro to Helsinki Central, walk to Linnanlaituri at the South Harbour (~10 min) for the m/s J.L. Runeberg cruise at 10:00, returning from Porvoo 16:00 — May–Sept, Tue/Wed/Fri/Sat plus Sun Jun–Aug.",
  },
  cost: {
    perPersonEur: 50,
    notes:
      "Round-trip cruise €50 adult / €46 senior / €25 child 7–15 / under-7 free. Optional lunch package €16 pre-booked / €18 onboard. Bus alternative €12–18 round-trip. Lunch in old Porvoo €15–25.",
  },
  booking: {
    leadTime: "weeks",
    notes:
      "Book the cruise online a week or two ahead in summer — Saturdays and Sundays in July sell out. Bus tickets fine same-day.",
  },
  suitableAgeRange: { min: 5 },
  childrenNotes:
    "Old town is stroller-doable on the flat riverside but the cobbled hill streets are bumpy and the Devil's Steps are stairs only — bring a carrier for under-3s. Kids enjoy the chocolate factory shop and the boat ride; the cathedral and museums skew adult.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "full-day",
  website: "https://msjlruneberg.fi/en/",
  tags: ["historical", "landmark", "nautical"],
};

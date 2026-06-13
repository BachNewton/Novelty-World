import type { Idea } from "../types";

export const kieppiSecondHand: Idea = {
  slug: "kieppi-second-hand",
  title: "Kieppi Second-Hand Market at Iso Omena",
  shortDescription:
    "Five of Finland's biggest charity thrift chains — Fida, UFF, iCare, Kierrätyskeskus, and Lillipop — lined up along a single second-floor corridor of the Matinkylä mall, the easiest one-stop secondhand crawl in the metro area.",
  longDescription: [
    "Kieppi is Iso Omena's dedicated second-hand corridor, opened in stages from 2023 as the mall's bet on the Finnish thrift boom. Five of the country's biggest charity-run secondhand operators share the same stretch of the second floor: UFF (vintage-leaning clothing, climate-focused charity), Fida (clothing, hobby supplies, and home goods funding international development), iCare (the Salvation Army's shop, 130-plus years in Finland), Kierrätyskeskus — the Recycling Centre — (clothes, tableware, decor, supports environmental work), and Lillipop (children's clothing on consignment). Add Ompun Ompelimo nearby for alterations and you can buy a coat and have it taken in without leaving the floor.",
    "The appeal is the density. Each shop is its own door, but the layout is a single linear browse — you pop in, find nothing, walk five paces, try the next one. A successful visit can land you a Marimekko dress at UFF, a stack of Iittala ramekins at Kierrätyskeskus, a wool sweater at Fida, and an outgrown ski jacket at Lillipop, in under an hour. Pricing is the genuinely-cheap kind, not curated-vintage-cheap: clothing mostly €3–15, housewares €1–10. Inventory turns over fast and the regulars treat it as a weekly stop — go in the morning if you want first crack at fresh donations.",
    "Iso Omena itself is the western terminus of the Helsinki metro: the Matinkylä station sits directly under the mall, the M1 line runs there from Lauttasaari in about fifteen minutes with no transfers. Take the escalator up two floors, follow the Kieppi signs, and the five shops are in a row. Combine with Kirjasto Omena (the Espoo public library on the same floor) for a half-day, or with a coffee at one of the food-court counters. Sundays are the quietest browsing day; mid-morning Saturday is the busiest.",
  ],
  thumbnailUrl:
    "https://www.isoomena.fi/app/uploads/sites/13/2026/03/Kieppi_www_desktop-hero_1920x800px.png",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Iso_Omena_shopping_centre,_Matinkylä,_Espoo_(March_2019).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Ison_Omenan_vanha_puoli.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Entrance_to_Iso_Omena_on_an_afternoon_in_October_2024.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Iso_Omena_christmas_2025.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Piispansilta_near_Iso_Omena_on_an_evening_in_October_2023.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Mall is open daily 06:00–24:00; individual Kieppi shops generally Mon–Fri 10:00–20:00, Sat 10:00–18:00, Sun 12:00–18:00 (each store sets its own hours within that window).",
    notes:
      "Inventory turns fast — go mid-morning on a weekday for the freshest racks. Sunday afternoon is the quietest browsing window; mid-morning Saturday is the busiest.",
  },
  location: {
    region: ["Espoo", "Uusimaa"],
    address:
      "Iso Omena, 2nd floor (Kieppi corridor), Piispansilta 11, 02230 Espoo",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~20 min",
    notes:
      "M1 metro west from Lauttasaari direct to Matinkylä (~15 min, no transfer). The metro station is built into the south end of Iso Omena — exit, take the escalators up two floors, follow the Kieppi signage along the corridor.",
  },
  cost: {
    perPersonEur: 0,
    notes:
      "Free to browse. Budget €10–40 for typical finds: clothing mostly €3–15, housewares €1–10. Lillipop's consignment items can run higher than the charity-shop prices next door.",
  },
  booking: {
    leadTime: "same-day",
    notes: "Walk-in. No reservations for any of the shops.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Stroller-friendly throughout, family bathrooms on the same floor, and Lillipop is purpose-built for kids' clothing if you're shopping for them. Older kids who like sorting through racks tend to enjoy it; toddlers will get bored fast — pair with a swing through Kirjasto Omena's children's section as a reset.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://www.isoomena.fi/en/kieppi-second-hand-market/",
  tags: ["mall"],
};

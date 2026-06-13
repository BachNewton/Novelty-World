import type { Idea } from "../types";

export const kauppatori: Idea = {
  slug: "kauppatori",
  title: "Kauppatori (Market Square)",
  shortDescription:
    "Helsinki's open-air harbourside market — fresh Finnish food and crafts at orange-tarp stalls right where the Suomenlinna ferries dock, with the Cathedral, Presidential Palace, and Esplanadi all one block away.",
  longDescription: [
    "Kauppatori (Salutorget in Swedish) is Helsinki's main open-air market square, occupying the corner where Esplanadi meets the South Harbour. It has been a market spot since at least the 16th century — originally the muddy floor of a small bay where fishermen sold their catch, now a paved square anchored by Havis Amanda's fountain and ringed by the City Hall, Presidential Palace, and Swedish Embassy. The Suomenlinna ferries leave from the dock right beside it.",
    "Stalls open from spring through autumn under bright orange tarps, selling salmon soup (lohikeitto), fried vendace (muikku), Karelian pies, reindeer skewers, mustamakkara, and seasonal berries; alongside the food stands are fur hats, Lappi-themed knick-knacks, and Marimekko knock-offs (the real shop is up on Esplanadi). Late summer brings the herring market (Silakkamarkkinat), a tradition running since 1743 — fishing boats moor at the quay and sell straight from the deck. In December the square hosts the St Thomas Christmas Market.",
    "Open roughly Mon–Fri 6:30–18:00, Sat 6:30–16:00, Sun 10:00–17:00 in summer, with shorter winter hours. Free to walk through. Plan to grab lunch from a stall (€10–15 a bowl), eat at a tarp-table seat with a view of the boats, then walk straight up Unioninkatu to Senate Square or onto a Suomenlinna ferry. The official-looking gold-onion-domed building visible across the harbour is Uspenski Cathedral — five minutes' walk if you want to add it.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kauppatori_(69913).jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Market_Square_(Helsinki,_Finland).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kauppatori_Helsinki_from_city_ferry_2022-09-18_02.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Market_Square_in_Helsinki,_Finland,_2024_May.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kauppatori_Helsinki1.jpg",
  ],
  availability: {
    suitableMonths: [4, 5, 6, 7, 8, 9, 10],
    events: [
      {
        from: "10-01",
        to: "10-10",
        name: "Silakkamarkkinat (Helsinki Baltic Herring Market)",
      },
    ],
    weeklySchedule:
      "Summer: Mon–Fri 6:30–18:00, Sat 6:30–16:00, Sun 10:00–17:00. Winter hours are shorter (~8:00–16:00 weekdays, limited Sundays).",
    notes:
      "Market stalls scale way back in winter — a few year-round vendors and a coffee tent rather than a full square of food. The square stays walkable but the experience is in summer.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Kauppatori, 00170 Helsinki (South Harbour)",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~15 min",
    notes:
      "Bus 21 from Lauttasaari runs straight to Kauppatori — most direct. Alternative: metro to Helsinki Central (~6 min), then a 10-min walk down Esplanadi. Ferry to Suomenlinna leaves from the same square.",
  },
  cost: {
    perPersonEur: 15,
    notes:
      "Free to walk through. Budget €10–20 for a stall meal and coffee. Souvenirs are tourist-priced — better deals in proper shops.",
  },
  booking: {
    leadTime: "same-day",
    notes: "No booking. Walk-up.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Stroller-friendly flat paving. Watch the seagulls — they will steal lihapiirakka straight out of a child's hand.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "<1h",
  website: "https://helsingintorit.fi/en/market-squares/kauppatori-2/",
  tags: ["food"],
};

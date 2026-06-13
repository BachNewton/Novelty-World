import type { Idea } from "../types";

export const balticHerringMarket: Idea = {
  slug: "baltic-herring-market",
  title: "Helsinki Baltic Herring Market (Stadin Silakkamarkkinat)",
  shortDescription:
    "Finland's oldest continually-running public event — a week every October since 1743 when archipelago fishing boats moor at Helsinki's South Harbour and sell silakka (Baltic herring) in every conceivable preparation, plus archipelago bread, smoked fish, sea-buckthorn jam, and wool from small island producers.",
  longDescription: [
    "The Helsinki Baltic Herring Market (Stadin Silakkamarkkinat) is one of the oldest ongoing event traditions in Finland, held continuously in some form since 1743 — predating American independence by a comfortable margin. Established by royal decree to give Helsinki a reliable autumn fish supply, the market settled at the South Harbour by 1820 and runs there still, the same week-in-October arrangement that produced the same kind of crowd in 1850 and 1950 as it does today. After a quiet stretch in the mid-20th century the event was revived in the 1980s and now draws roughly 90,000 visitors over its single week. The 2026 edition runs 4–10 October.",
    "The premise has barely changed: archipelago fishing boats moor along the quay, lay planks across to the cobblestones, and sell silakka — Finland's tiny Baltic herring, one of the foundational fish of Finnish food — in every preparation a fishing family has ever invented. Pickled in cream and dill, smoked over alder, fermented as the famously divisive surströmming-adjacent hapansilakka, marinated in mustard, in lingonberry, in sea-buckthorn, in beetroot. Beyond the herring boats, around 60 stalls along the perimeter sell other small-producer Finnish food: jälkiuunileipä (the dense rye archipelago bread baked overnight in cooling ovens), home-pressed apple juices, smoked sausage, hand-knitted wool mittens, juniper-smoked vendace, and preserved wild mushrooms. Two annual competitions run through the week — Best Salted Herring and Best Archipelago Bread — and the winning stalls sport a sticker for a full year afterwards.",
    "The atmosphere is half festival, half working market. Fishermen in oilskins call orders across to one another. The seagulls are aggressive — guard your lihapiirakka. October weather along the harbour is unpredictable: bring a rain jacket and don't trust the morning forecast. In 2026 the organisers are replacing the previous tents with wooden huts for a more atmospheric setup and adding a maritime restaurant area with a few sit-down tables.",
    "Free to attend; budget €10–25 for a sampling of fish, bread, and a coffee. Stalls open 9:00–19:00 Sun–Fri and 9:00–16:00 on the closing Saturday. Bring cash — some smaller producers don't take cards — and a sealable bag for the herring jars (the smell carries). From Lauttasaari, bus 21 runs straight to Kauppatori in 15 minutes. Pair with a quick stop at the Old Market Hall (3 min walk), Uspenski Cathedral (10 min walk uphill), or a Suomenlinna ferry from the same dock.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Crowds_at_the_2023_Helsinki_herring_market.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Herring_market_2024.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Baltic_Herring_Market_(52432256701).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Baltic_Herring_Market1.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Baltic_Herring_Market2.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Baltic_Herring_Market3.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Silakkamarkkinat.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Eteläsatama,_Helsinki_1912.jpg",
  ],
  availability: {
    suitableMonths: [10],
    events: [
      {
        from: "10-04",
        to: "10-10",
        name: "Stadin Silakkamarkkinat (Helsinki Baltic Herring Market)",
      },
    ],
    weeklySchedule:
      "Sun–Fri 9:00–19:00, Sat 9:00–16:00 (closing day). Runs the first Sunday in October through the following Saturday — 2026 dates: 4–10 October.",
    notes:
      "Date-locked: only runs one week a year, the first Sunday of October through the following Saturday. Outside this window the South Harbour reverts to the year-round Kauppatori stalls.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Kauppatori (Market Square), Eteläranta, 00170 Helsinki (South Harbour quay)",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~15 min",
    notes:
      "Bus 21 from Lauttasaari runs straight to Kauppatori (~15 min, direct). Alternative: metro to Helsinki Central (~6 min), then a 10-min walk down Esplanadi.",
  },
  cost: {
    perPersonEur: 0,
    notes:
      "Free entry. Budget €10–25 for a sampling — a small jar of pickled herring runs ~€8, smoked fish portions ~€10–15, a slice of archipelago bread with butter ~€3. Bring cash; smaller producers may not take cards.",
  },
  booking: {
    leadTime: "same-day",
    notes: "No tickets, no booking. Walk straight onto the quay.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Stroller-friendly flat paving along the harbour. Strong fish smell — younger kids may baulk, but the boats, the gulls, and the cookie/jam stalls usually win them over. Bring a warm layer; October on the open quay can drop to single digits.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://silakkamarkkinat.fi/en/",
  tags: ["food", "historical", "nautical"],
};

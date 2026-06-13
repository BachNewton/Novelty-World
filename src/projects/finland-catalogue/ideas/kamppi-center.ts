import type { Idea } from "../types";

export const kamppiCenter: Idea = {
  slug: "kamppi-center",
  title: "Kamppi Center",
  shortDescription:
    "Helsinki's downtown shopping-and-transit hub built directly over the central bus terminal: 7 floors of shops above 17 city-bus and 32 long-distance bus platforms, the metro 30 metres beneath, and Europe's largest MUJI on the top floor.",
  longDescription: [
    "Kamppi Center is the four-year, 37,000 m² complex at the western edge of Helsinki's central business district, built between 2002 and 2006 as the largest single construction project in Finnish history. Architect Juhani Pallasmaa led the design; the result stacks the city's busiest transport node and a seven-floor shopping centre on top of each other. Below ground sit the city bus terminal (17 platforms, ~900 city buses daily) and long-distance bus terminal (32 platforms, ~700 intercity buses daily, open 24/7), reached via the ceramic-tiled \"Gekko\" capsule entrance in the lobby. The metro station is 30 metres further down. Above ground, you walk straight off Mannerheimintie into the mall.",
    "The shopping is mainstream rather than design-led — H&M, Stadium, Lindex, the standard Finnish chains, a Lidl in the basement, a couple of supermarkets, and a flag-and-cinema scattering of cafés and quick-service restaurants. The reason the mall earns its own entry rather than functioning as just commute scenery is the top floor: MUJI Kamppi is the largest MUJI in Europe (3,500 m²), and it includes a permanent Local Design Village shop-in-shop, a Local Food Store with 100+ small Finnish producers, a Small Gallery hosting rotating Finnish-artist shows, and a sit-down MUJI restaurant — see the dedicated entry for the bi-weekly community market that runs there. Forum, the older shopping centre across Mannerheimintie, is connected via an underground passage and worth pairing with Kamppi for a complete downtown indoor afternoon.",
    "The square out front, Narinkkatori, is the social side of the building: a large plaza that hosts food trucks in summer, a Christmas market in December, occasional pop-ups and demonstrations, and the wooden Kamppi Chapel of Silence at its eastern edge — a small, unstaffed silent room open to anyone who wants to sit for a moment. Worth stepping into, even (especially) if you don't think you have time.",
    "Kamppi is one stop east of Lauttasaari on the metro — about three minutes, no transfer, and the train surfaces directly into the building. Mall hours are Mon–Fri 10:00–20:00, Sat 10:00–19:00, Sun 12:00–19:00. Free to enter. If you only have a couple of hours and want a feel for everyday downtown Helsinki shopping, plus the MUJI flagship, plus the bus terminal that ties the whole capital region together, this is the single best stop.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Diagonal_view_of_Narinkkatori_with_Kamppi_Center_on_a_sunny_afternoon_in_May_2024.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kamppi_Center_on_an_evening_in_February_2025.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Entrance_to_Kamppi_Center_on_an_evening_in_February_2025.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kamppi_shopping_centre_on_an_August_evening.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Narinkkatori_with_Kamppi_Center_in_April_2023.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kamppi_bus_station_on_an_afternoon_in_August_2024.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Shops Mon–Fri 10:00–20:00, Sat 10:00–19:00, Sun 12:00–19:00. Long-distance bus terminal open 24/7. Restaurants and cafés set their own hours, generally 09:00–22:00.",
    notes:
      "Year-round. The clear winter visit is December for Narinkkatori's Christmas market on the square out front. Quietest weekday mornings; commuter peaks around 08:00 and 17:00 if you're sensitive to crowds.",
  },
  location: {
    region: ["Helsinki", "Kamppi", "Uusimaa"],
    address: "Urho Kekkosen katu 1, 00100 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~5 min",
    notes:
      "M1 or M2 metro one stop east from Lauttasaari direct to Kamppi (~3 min). The metro station opens directly into the shopping centre — no walk needed. Bus 21 from Lauttasaari also stops at the city bus terminal underneath.",
  },
  cost: {
    perPersonEur: 0,
    notes:
      "Free to enter and browse. Budget €8–15 for café/quick-service lunch, €15–30 for a sit-down restaurant on the upper floors. The Lidl in the basement is the cheapest grocery stop in central Helsinki.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-in for everything in the mall. Long-distance bus tickets (Matkahuolto, OnniBus) book online via matkahuolto.fi or onnibus.com.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Stroller-friendly throughout — wide aisles, lifts on every floor, family bathrooms. The Kamppi Chapel of Silence on Narinkkatori is a useful five-minute reset for tired toddlers (silent room, soft lighting). Kids' clothing brands on the lower floors.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://www.kamppihelsinki.fi/en",
  tags: ["mall"],
};

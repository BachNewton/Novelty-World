import type { Idea } from "../types";

export const mujiKamppiCommunityMarket: Idea = {
  slug: "muji-kamppi-community-market",
  title: "MUJI Kamppi — Local Design Village & Community Market",
  shortDescription:
    "Inside the largest MUJI in Europe (the entire 4th floor of Kamppi mall), a permanent Finnish-makers shop-in-shop runs year-round and a bi-weekly community market expands it into a Friday–Saturday craft-fair drop-in.",
  longDescription: [
    "MUJI's Kamppi flagship is unusual for the chain: rather than a clean grid of MUJI's own household goods, a meaningful slice of the floor is given over to local Finnish makers. The whole top floor of the Kamppi shopping centre — about 3,500 m², the largest MUJI store in Europe — has been split into a Japanese-house aesthetic surrounding a Finnish-design pocket. Two pieces of that pocket are why this entry exists: the year-round Local Design Village shop-in-shop, and the bi-weekly MUJI Community Market that turns Fridays and Saturdays into a small craft fair inside the store.",
    "The Local Design Village is a permanent counter and shelving area on the 4th floor that rotates dozens of small Finnish brands. It's a way to find the maker-scale ceramics, illustration prints, jewellery, candles, kids' clothes, wooden goods, and small-batch food that would otherwise mean tracking down ten different studios in the Design District. Sits alongside a Local Food Store with products from over 100 small Finnish producers — coffee, rye bread, jams, beverages, Karelian pastries — and a Small Gallery that hosts rotating exhibitions by Finnish artists.",
    "The Community Market is the every-other-Friday-and-Saturday version: independent makers physically come into the store with their tables and their goods, and you can talk to them while you shop. Schedule is published on the MUJI Kamppi Instagram (@mujikamppi); roughly two weekends a month, daytime hours. If you've ever walked through a craft fair and wished you could fold it into a bigger shopping run rather than committing to a Saturday on the cobblestones, this is that.",
    "Free to browse all of it. Mall hours: Mon–Fri 10:00–20:00, Sat 10:00–19:00, Sun 12:00–18:00 (Sundays the Community Market itself isn't running; the Local Design Village stays open). MUJI Ravintola — the on-site restaurant, also Europe's first MUJI restaurant — does Japanese-leaning lunches and deli food daily, plus authentic dinner service Thu–Sat evenings. From Lauttasaari, the metro stops directly at Kamppi (~3 min, no walk needed); take the lift to the 4th floor.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Diagonal_view_of_Narinkkatori_with_Kamppi_Center_on_a_sunny_afternoon_in_May_2024.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Entrance_to_Kamppi_Center_on_an_evening_in_February_2025.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_KamppiCenter_01.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kamppi_shopping_centre_on_an_August_evening.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Narinkkatori_in_June_2024.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Mall: Mon–Fri 10:00–20:00, Sat 10:00–19:00, Sun 12:00–18:00. Community Market: every other Fri–Sat — confirm the next dates via @mujikamppi on Instagram.",
    notes:
      "Local Design Village runs year-round during mall hours. Community Market is bi-weekly Fri–Sat — pick a market weekend if you want the maker-fair experience, otherwise the Local Design Village still gives you the curated Finnish-design selection.",
  },
  location: {
    region: ["Helsinki", "Kamppi", "Uusimaa"],
    address: "Kamppi Shopping Centre, 4th floor, Urho Kekkosen katu 1, 00100 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~10 min",
    notes:
      "M1 or M2 metro one stop east from Lauttasaari direct to Kamppi (~3 min). The Kamppi metro station opens directly into the shopping centre — take the lift or escalators to the 4th floor for MUJI.",
  },
  cost: {
    perPersonEur: 0,
    notes:
      "Free to browse. Local Design Village price points vary — postcards and small prints under €10, ceramics and jewellery typically €30–150. Community Market vendors set their own prices, often slightly cheaper than at retail.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-in. No reservations for the market or the store. MUJI Ravintola dinner service Thu–Sat evenings benefits from a same-day reservation.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Stroller-friendly throughout — wide aisles, lifts directly to the 4th floor. MUJI's children's section and a few kids' brands at Local Design Village give younger visitors something to look at, but a craft-shopping pop-up still lands better with under-10s for ~30 minutes than for a full hour.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://www.muji.com/flagship/kamppi-helsinki/en/",
  tags: ["design", "mall"],
};

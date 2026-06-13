import type { Idea } from "../types";

export const allasPool: Idea = {
  slug: "allas-pool",
  title: "Allas Sea Pool",
  shortDescription:
    "An open-air seawater pool, a heated 27°C pool, and three Finnish saunas right on the South Harbour next to the SkyWheel — swim outdoors year-round with the Cathedral, the Suomenlinna ferries, and the Helsinki skyline as a backdrop.",
  longDescription: [
    "Allas Sea Pool opened in 2016 on the wooden quay between Kauppatori and the Katajanokka SkyWheel — three pools and three saunas built directly on the harbour deck, with the Lutheran Cathedral, the Presidential Palace, and the Stockholm ferries all visible from the loungers. The whole complex is open-air; the only indoor bits are the changing rooms and the saunas. The architectural play is the pull: you swim outside, in the harbour, with the city set-piece as your view, and you can do it through January snowfall.",
    "There are three pools. The 25-metre lap pool is heated to a comfortable 27°C year-round — the workhorse if you actually want to swim. The smaller children's pool runs warmer (~30°C). The headline pool is the Sea Pool — filtered Baltic seawater pumped in from a cleaner intake offshore, UV-treated, but otherwise unheated, so it's 18°C in August and 2°C in February. Combined with the saunas (one mixed Corner Sauna at 90°C, plus separate men's and women's panorama saunas with floor-to-ceiling windows over the water) it's the city's most accessible introduction to the Finnish löyly-and-cold-plunge ritual.",
    "Allas runs as a public pool, not a spa: tickets are €18 weekday adult, €25 weekend/peak, with reduced and child rates and 0–2 free. You bring your own swimsuit and towel (rentals available); shampoo and shower gel are stocked. There's a counter restaurant on the upper deck and a sun terrace that turns into the city's de facto sunset bar in July (separate, no pool ticket needed). Towels, robes, and bag lockers are extra paid items — budget another €10 if you turn up empty-handed.",
    "Walk from Helsinki Central Station in 10 minutes via Esplanadi and Market Square — Allas is at the harbour end of Katajanokanlaituri, right under the SkyWheel. Tram 4 stops nearby. Bookings aren't required even on busy summer Saturdays — the place handles 1,500+ guests on peak days without feeling oversold.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Allas_Sea_Pool_in_Katajanokka,_Helsinki,_Finland,_2021_June.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Allas_Sea_Pool_in_September_2019.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/SkyWheel_Helsinki_and_Allas_Sea_Pool_in_Fog_(2024).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Allas_Sea_Pool_kauppatori.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/2018_Winter_in_Helsinki,_Finland_(26611927908).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Allas_Sea_Pool_by_Petri_Sipilä_2016.jpeg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Allas_Sea_Pool_Feb_18.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Mon–Thu 06:00–22:00, Fri–Sat 06:00–01:00, Sun 09:00–21:00. Ticket sales end 1h before closing; swimming/sauna ends 20 min before closing.",
    notes:
      "Genuine year-round destination — the saunas and heated pool make it work in deep winter, and the experience flips from a sun-deck scene in July to a steaming-pool-against-snow tableau in February. Closed for an annual maintenance week (usually mid-January); check the site if your trip lands then.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Katajanokanlaituri 2a, 00160 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~20 min",
    notes:
      "Bus 21 from Lauttasaari to Kauppatori, then a 5-min walk along the quay to Katajanokanlaituri. Alternative: metro to Helsinki Central (~6 min), then a 10-min walk down Esplanadi and across Market Square. Right under the SkyWheel.",
  },
  cost: {
    perPersonEur: 18,
    notes:
      "Weekday adults €18, weekend/peak €25; reduced (3–17/student/senior) €13–18; under-3 free. Towel rental ~€5, robe ~€8, swimsuit ~€10, locker €2. Restaurant prices separate (~€12–22 a plate).",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-in. No reservations for the pools. Capacity-managed only on the busiest July evenings — buy online to skip the door queue.",
  },
  suitableAgeRange: { min: 3 },
  childrenNotes:
    "Dedicated heated 30°C children's pool with shallow steps. The Sea Pool itself is too cold for most under-7s most of the year. Lockers and changing rooms are stroller-friendly. Saunas are mixed in swimsuits — no nudity, fine for kids who are comfortable with the heat.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://www.allaspool.fi/en/",
  tags: ["sauna"],
};

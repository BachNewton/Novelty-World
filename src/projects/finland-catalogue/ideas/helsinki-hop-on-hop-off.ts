import type { Idea } from "../types";

export const helsinkiHopOnHopOff: Idea = {
  slug: "helsinki-hop-on-hop-off",
  title: "Helsinki Hop-On Hop-Off Bus",
  shortDescription:
    "A red open-top double-decker that loops nineteen stops past every major Helsinki sight in 90 minutes — the lazy, jet-lagged-traveller way to orient yourself on day one before deciding what to come back to.",
  longDescription: [
    "There are two operators running near-identical Hop-On Hop-Off routes in Helsinki: Strömma (Strawberry Group) and Red Sightseeing (City Sightseeing affiliate). Both run open-top red double-deckers that depart from Senate Square, follow a 19-stop loop past every major central sight, and let you reboard with the same ticket as many times as you like over a 24-hour or 48-hour window. They're functionally interchangeable — pick whichever gate is in front of you when you decide.",
    "The route hits the obvious set: Senate Square / Helsinki Cathedral, Uspenski Cathedral, Market Square and the harbour, Esplanadi, Kamppi Chapel of Silence, the Sibelius Monument, the Olympic Stadium, the Temppeliaukio (Rock) Church, the National Museum, Kiasma, the Helsinki Art Museum, and the Botanic Garden. The full loop without getting off is about 90 minutes; with hop-offs at three or four favourites it's an easy day. Recorded audio commentary plays through earbuds at every seat in 8–11 languages.",
    "Tickets €36 adult / €32.40 online (24h); 48-hour and combo tickets with the canal cruise are about 30% more. Kids 7–17 are typically half-price; under-7 free with an adult. The 2026 season runs roughly 2 May – 10 October; service is daily, every 30–40 minutes, with the first bus leaving Senate Square around 10:00 and the last around 16:00. Outside the season the buses are off the road entirely — there's no winter hop-on bus.",
    "Honest take: it's not a deep dive into Helsinki, but it's exactly what it claims — the fastest way to map the city, especially if you're off a cruise ship or jet-lagged on day one. If you only have one day in Helsinki, save the bus and walk; if you have three, the bus is a worthwhile €30 and a comfortable seat for the longer cross-town transfers (e.g. Senate Square → Sibelius Monument is 25 minutes by bus and worth it once).",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Hop_On_Hop_Off_Helsinki_sightseeing-kierros_kaksikerrosbussilla_2017_(HK8048-72).jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/11-07-29-helsinki-by-RalfR-040.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki,_Neoplan_N4026_3_č._27.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki,_Neoplan_N4026_3L_č._46.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Cathedral_in_2019.08.jpg",
  ],
  availability: {
    suitableMonths: [5, 6, 7, 8, 9, 10],
    weeklySchedule:
      "Daily during season. 2026 runs ~2 May – 10 October. First departure from Senate Square around 10:00, last around 16:00, every 30–40 minutes.",
    notes:
      "Strictly summer-season — the buses are off the road from mid-October to late April. Open-top deck is closed in heavy rain; lower deck stays warm and dry.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Main boarding point: Senate Square (Senaatintori), 00170 Helsinki. Tickets also sold at Market Square and onboard.",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~15 min",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), then a 5-min walk up Aleksanterinkatu to Senate Square. Buy tickets online for the discount; otherwise pay the driver in cash or card at the door.",
  },
  cost: {
    perPersonEur: 32,
    notes:
      "24h adult €32.40 online / €36 at the door. 48h adult ~€42–48. Kids 7–17 half-price; under-7 free with an adult. Combo tickets with Strömma's harbour canal cruise add ~€10–15.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-on. Buy online for a small discount or just board. Buses don't sell out.",
  },
  suitableAgeRange: { min: 4 },
  childrenNotes:
    "Open-top deck is a hit with kids; bring a hat and warm layer even in summer (sea wind is colder than it looks). Strollers fit on the lower deck. The audio commentary is too dry for under-8s — bring something for them to look at out the window.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "half-day",
  website: "https://www.stromma.com/en-fi/helsinki/sightseeing/sightseeing-by-bus/hop-on-hop-off/",
  tags: [],
};

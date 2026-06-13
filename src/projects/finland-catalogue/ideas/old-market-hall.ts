import type { Idea } from "../types";

export const oldMarketHall: Idea = {
  slug: "old-market-hall",
  title: "Old Market Hall (Vanha kauppahalli)",
  shortDescription:
    "Helsinki's 1889 brick-and-cast-iron market hall on the South Harbour — over twenty stalls of fish, cheese, charcuterie, pastries, and small-plate counters tucked under a wooden-vaulted nave.",
  longDescription: [
    "Vanha kauppahalli is Helsinki's oldest market hall, built in 1889 to a design by Gustaf Nyström as the city's first roofed food market. The exterior is red brick with iron-framed windows; the interior is one long aisle under a wooden-rib ceiling, with little dark-wood stalls running down both sides like booths in a long restaurant. It was renovated 2012–2014 and has been a deliberate go-to of the food-tourism circuit since.",
    "The 20-odd vendors lean traditional and local: salmon and Baltic herring from Eriksson's fish counter, reindeer cuts and lapland charcuterie at Salaska, Karelian pies at Story, cheeses at Hopia, and chocolate from Kultainen Hetki. About a third of the stalls are sit-down counters — Story does excellent salmon soup, Soppakeittiö across from it is famous for its rotating soup-of-the-day, and there's a small bar in the middle for a beer and oysters. Lunch is the right meal here; many stalls close at six.",
    "Hours are roughly Mon–Sat 10:00–18:00, closed Sundays (individual stalls vary). It's a 30-second walk from Kauppatori — the two pair perfectly: outdoor stalls and ferry-watching at Kauppatori, then duck inside for lunch. Free to walk through; budget €15–25 for a sit-down meal.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Vanha_kauppahalli_(14092).jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kauppahalli_-_inside,_Helsinki_FIN.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Vanha_kauppahalli_Helsinki_at_night_2022-09-18_01.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Antiguo_Mercado_de_Helsinki,_Finlandia,_2012-08-14,_DD_01.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Old_Market_Hall_-_Vanha_Kauppahalli,_Helsinki_(29282721726).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Vanha_Kauppahalli_Helsinki_04.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule: "Mon–Sat 10:00–18:00. Closed Sundays.",
    notes:
      "Individual stalls set their own hours — some close at 17:00, a few at 16:00 on Saturday. Sunday closure is firm.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Eteläranta, 00130 Helsinki (South Harbour, beside Kauppatori)",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~15 min",
    notes:
      "Bus 21 from Lauttasaari runs to Kauppatori — the hall is a 30-second walk from the stop. Alternative: metro to Helsinki Central (~6 min), then a 10-min walk down Esplanadi.",
  },
  cost: {
    perPersonEur: 20,
    notes:
      "Free to enter. Sit-down lunch ~€15–25. Browsing and snacks ~€5–10.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-in. Soppakeittiö and Story can have queues at lunch — go before noon or after 13:30 to skip them.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Stroller-friendly aisle but it gets tight at lunchtime. High chairs are scarce; plan to share a counter seat.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "<1h",
  website: "https://vanhakauppahalli.fi/en/",
  tags: ["food"],
};

import type { Idea } from "../types";

export const helsinkiCityMuseum: Idea = {
  slug: "helsinki-city-museum",
  title: "Helsinki City Museum",
  shortDescription:
    "Finland's second most visited museum, free every day, threaded across five connected old buildings off Senate Square — including Sederholm House (1757, the oldest building in Helsinki) and its hands-on Children's Town.",
  longDescription: [
    "Helsinki City Museum (Helsingin kaupunginmuseo) tells the story of the city itself — how a fishing town founded in 1550 became a Russian-empire capital, an industrial port, and the modern Finnish capital — through five connected historic buildings on Aleksanterinkatu just off Senate Square. The main entrance is at Aleksanterinkatu 16 in a pair of stitched-together 19th-century merchant houses; the complex extends west into Sederholm House, the oldest building in Helsinki, completed in 1757 by merchant Johan Sederholm and the only stone civilian building to survive the fires that repeatedly swept through wooden Helsinki.",
    "The permanent exhibitions rotate but always sit in the same register: scale models of vanished neighbourhoods, photographs of street corners then-and-now, recreated 1930s shop interiors, and personal objects donated by Helsinkians. Exhibitions running through 2026 include \"The Unknown Suburb\" (the post-war ring of concrete-slab estates that house most of the city's population) and \"In the Quarters of Kruununhaka\" (the patrician district immediately around the museum). A new main exhibition opens in summer 2026.",
    "The unmissable piece if you're visiting with kids is Children's Town inside Sederholm House — a hands-on indoor playground threaded through the 18th-century rooms. Children climb into a horse-drawn carriage, steer a wooden ship, play shopkeeper in a recreated Sederholm-era store, sit at desks in a 1930s schoolroom while a stern schoolmaster looms in projection, and explore Grandma's 1970s flat with the period TV running cartoons of the day. It's calibrated for roughly ages 3–10 and works in any weather.",
    "Free entry to everything, all the time, no ticket needed. From Lauttasaari, take the metro to Helsinki Central (~6 min), then walk 8–10 minutes east through Senate Square — the museum is on the north side of Aleksanterinkatu. Pair it naturally with the Cathedral, the Old Market Hall (10 min walk south), or Uspenski (10 min east). Allow 1–2 hours, more with kids in Children's Town.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kaupunginmuseo2.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/New_Helsinki_City_Museum,_enter.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kaupunginmuseo_sisäpiha.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Aleksanterinkatu_near_Helsinki_City_Museum_on_a_sunny_evening_in_July_2023.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Sederholmin_talo.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Sederholm_House_-_Sederholmin_talo_2008_C_HPIM0721.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Sederholmin_talon_seinä.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule: "Mon–Fri 11:00–19:00, Sat–Sun 11:00–17:00. Closed on most public holidays — check the site before holiday-week visits.",
    notes:
      "Year-round, indoor, weather-proof. Especially welcome on a cold or rainy day, and a natural pair with other Senate Square sights that are also walkable in any season.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Aleksanterinkatu 16, 00170 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~20 min",
    notes:
      "Metro from Lauttasaari east to Helsinki Central (~6 min), then 8–10 min walk east via Aleksanterinkatu through Senate Square. Sederholm House is two doors further east at no. 18.",
  },
  cost: {
    perPersonEur: 0,
    notes: "Always free entry to all five museum buildings.",
  },
  booking: {
    leadTime: "same-day",
    notes: "Walk-in. No reservations needed.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Children's Town in Sederholm House is the headline draw for kids — calibrated for roughly ages 3–10, hands-on and interactive throughout. Stroller-friendly entrances and lifts in the main museum; the 18th-century Sederholm House has a few uneven thresholds but accommodates buggies. Free family bathrooms and a quiet baby-feeding nook.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://www.helsinginkaupunginmuseo.fi/en/",
  tags: ["museum", "historical"],
};

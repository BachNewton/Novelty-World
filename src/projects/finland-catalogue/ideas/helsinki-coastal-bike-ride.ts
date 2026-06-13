import type { Idea } from "../types";

export const helsinkiCoastalBikeRide: Idea = {
  slug: "helsinki-coastal-bike-ride",
  title: "Helsinki & Espoo Coastal Trail",
  shortDescription:
    "Helsinki's Rantareitti and Espoo's Rantaraitti link end-to-end into one of Northern Europe's longest dedicated seaside cycling and walking routes — over 130 km of paved, car-free paths skirting beaches, embassies, rocky islets, and harbour cafés.",
  longDescription: [
    "Most capitals have a token waterfront promenade. Helsinki has 130 kilometres of them. The Rantareitti (\"shore route\") wraps the entire coastal edge of the city as a continuous, dedicated, car-separated path, then crosses into Espoo where it becomes the Rantaraitti and continues another 40+ km past Westend, Haukilahti, Matinkylä, Suomenoja, and Kivenlahti almost to Kirkkonummi. The surface flips between paved promenade, fine gravel, and timber boardwalk depending on the section, but it's almost always flat, well-marked, and shared courteously between cyclists, joggers, dog-walkers, and parents with strollers.",
    "The most photogenic stretch — the one to do if you only have an afternoon — is the southern Helsinki loop: from Kauppatori along the South Harbour, around Kaivopuisto's rocky shoreline (where the trail opens onto the open Baltic with Suomenlinna on the horizon), past the Eira and Ullanlinna embassy villas, along the Hietaniemi waterfront and beach, and over the bridge into Lauttasaari. Roughly 15 km round-trip, two hours casual, and you can stop at half a dozen seaside cafés along the way (Café Ursula on Ehrenströmintie, Cafe Birgitta at Hietaniemi, Mattolaituri).",
    "If you want a longer day, ride west into Espoo's Rantaraitti — the trail runs through nature reserves, past coastal cliffs, modern marina developments, and historic manors, with seaside cafés like Mellsten and Haukilahden Paviljonki to break up the ride. East of the city centre, the parallel Eastern Coastal Route runs ~23 km from Kalasatama out to the Uutela nature reserve through Mustikkamaa, Kulosaari, and Vuosaari pine woods.",
    "For visitors, the easiest bike option is HSL Citybikes — bright yellow Alepa-branded share bikes with 460+ stations across Helsinki and Espoo, in season 1 April – 31 October. Day pass €5, week €10, season €35; each pass gives unlimited 30-minute rides, with a small extra fee if you stay on a single bike longer (the trick on a long ride is to dock and re-rent every 30 min). Register in the HSL app with a card and a 4-digit PIN. Outside the season, several private rentals operate year-round; the trails themselves are cleared and ridable in winter but icy in patches — pick a clear day. Mid-May through mid-September is the sweet spot.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kaivopuisto_and_Suomenlinna_2020.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Espoon_rantaraitti_Espoonlahti_190519_b.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Westendin_rantaa_250719_d.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Espoon_rantaraitti_Kaitaa_rantametsikkö_300519_b.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Espoon_rantaraitti_Haukilahden_silta_070619.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kävelysilta_Nuottaniemi_rantaraitti_300519_b.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Kaivopuisto_Syksy_2018_01.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Hyväntoivonpuisto_park_in_Jätkäsaari,_Helsinki,_Finland,_2020_November.jpg",
  ],
  availability: {
    suitableMonths: [4, 5, 6, 7, 8, 9, 10],
    notes:
      "Citybike season runs 1 April – 31 October — bikes are removed for winter. Mid-May through mid-September is the sweet spot for warmth and dry pavement. You can also bring or rent your own bike outside the city-bike season; the paths are cleared and ridable but cold and often icy.",
  },
  location: {
    region: ["Helsinki", "Espoo", "Uusimaa"],
    address: "Coastal cycle path — easiest to start at Kauppatori (Market Square) or Kaivopuisto, both with city-bike stations.",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "Start straight from Lauttasaari",
    notes:
      "Lauttasaari is directly on the coastal route — Citybike stations are dotted across the island, and the rantareitti runs around the whole shore. Cross the Hietaniemi bridge to pick up the central Helsinki section, or head west into Espoo's Rantaraitti. Register the HSL Citybike app first (debit/credit card + 4-digit PIN), buy a day/week/season pass, then unlock any yellow bike.",
  },
  cost: {
    perPersonEur: 5,
    notes:
      "Day pass €5, week €10, season €35 (each gives unlimited 30-min rides; €1 per additional 30 min if you stay on a single bike longer). Coffee/lunch stops along the route €5–15.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "No booking needed — just register the HSL Citybikes app on the day. Season passes go on sale 16 March each year.",
  },
  suitableAgeRange: { min: 8 },
  childrenNotes:
    "Citybikes are adult-sized and the system has no children's bikes or child seats — bring kids on their own bikes from a private rental. The paths themselves are kid-friendly: separated from cars, flat, well-marked. Keep an eye on the busier sections through Kalasatama and the Lauttasaari bridge approach.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "moderate",
  duration: "half-day",
  website: "https://www.hsl.fi/en/citybikes",
  tags: ["nature", "nautical"],
};

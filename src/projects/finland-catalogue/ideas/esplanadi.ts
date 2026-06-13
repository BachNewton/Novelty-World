import type { Idea } from "../types";

export const esplanadi: Idea = {
  slug: "esplanadi",
  title: "Esplanadi",
  shortDescription:
    "Helsinki's central tree-lined park-boulevard running from the Swedish Theatre to Market Square — the city's living room, with free summer concerts on the Espa Stage and a parade of cafés, statues, and high-end shops along its flanks.",
  longDescription: [
    "Esplanadi is a long, narrow park laid out in 1818 between two streets — Pohjoisesplanadi and Eteläesplanadi — running from the Swedish Theatre at one end to Market Square and the harbour at the other. Carl Ludvig Engel (the same architect as Helsinki Cathedral) designed the surrounding plan as part of the city's neoclassical centre. The park is wider than a typical median strip and narrower than a real park; locals call it Espa and treat it as the city's open-air living room.",
    "Down the middle runs a gravel walking path with benches, statues (Runeberg the national poet, Eino Leino, the writer Zachris Topelius), and the Espa Stage — a small permanent bandstand that hosts free concerts almost every day in summer. Programming includes Jazz Espa, Etno-Espa folk weeks, Roots Espa, and one-off pop-ups around Helsinki Day and the Night of the Arts. The flanking streets are the city's flagship retail strip — Marimekko, Iittala, Stockmann, Kämp Galleria — and the south side has the historic Kappeli and Esplanade Chapel restaurants.",
    "There's nothing to book and nothing to pay for. Walk the length once to get oriented (it takes maybe ten minutes), grab an ice cream from the kiosk by the Swedish Theatre, and sit on a bench during a free concert. In winter the park is quieter but the trees get strung with lights, and the kiosks become glögg stops during the December market season.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Esplanadin_puisto_2020.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Johan_Ludvig_Runeberg_statue_in_Esplanadi_park_Helsinki_Finland.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Esplanade_Chapel_restaurant_in_Helsinki,_Finland,_2021_January.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Hotel_Kämp_(73404).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Havis_Amanda_(40026).jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    notes:
      "Best from May to September when the trees are out and the Espa Stage runs free concerts. Pleasant in winter for a short walk between cathedrals/market hall but you won't linger.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Esplanadi park, between Erottaja and Market Square, 00130 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~15 min",
    notes:
      "Bus 21 from Lauttasaari runs straight through downtown — get off at Erottaja or Kauppatori for either end of the park. Alternative: metro to Helsinki Central (~6 min), then a 5-min walk down Mannerheimintie.",
  },
  cost: {
    perPersonEur: 0,
    notes:
      "Free. Espa Stage concerts are free. Surrounding cafés and restaurants are mid-to-high priced.",
  },
  booking: {
    leadTime: "same-day",
    notes: "No booking. Just show up.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Stroller-friendly flat gravel paths. Works for any age. The kiosks have ice cream all summer.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "<1h",
  website: "https://www.myhelsinki.fi/places/esplanadi/",
  tags: [],
};

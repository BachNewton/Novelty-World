import type { Idea } from "../types";

export const tapiolaIceGarden: Idea = {
  slug: "tapiola-ice-garden",
  title: "Tapiola Ice Garden",
  shortDescription:
    "A free 330-metre artificial ice loop circling Tapiola's central fountain pool — lit at night, hockey sticks banned, and the easiest place west of Helsinki to lace up skates and just glide for an hour.",
  longDescription: [
    "Tapiolan Jääpuutarha — the \"Ice Garden\" — is a 330-metre artificial ice track that loops around the central fountain pool in Tapiola's cultural square, with a 1,700m² rink in the middle. The site is professionally maintained, free to use, and turns the centrepiece of Aarne Ervi's 1950s modernist town plan into an open-air winter living room from mid-November through early March. Hockey sticks are banned, which keeps the loop civil and family-paced — this is a place for laps, not pickup games.",
    "The 330m loop is long enough to actually get a rhythm going. Half a dozen laps and you're warm; twenty and you've earned a coffee. Floodlights stay on after dark, which matters in December when the sun sets at 15:15 and most of your skating happens under the lights. Ice condition is noticeably best the morning after a fresh resurface, and the crowd thins out after dinner. Warm changing rooms and toilets sit alongside the rink, but the on-site café and skate rental (Café Hile) are closed indefinitely — bring your own skates and a thermos.",
    "Season runs roughly 17 November through 8 March, with cold-snap exceptions at either end; Espoo posts live conditions on ulkoliikunta.fi if you want to check before going. Take the M2 metro from Lauttasaari direct to Tapiola (~10 minutes, no transfer); the Ice Garden is a three-minute walk from the metro exit at Tapionaukio, sitting between the Ainoa shopping centre, the Tapiola swimming hall, and the cultural centre. Combine with the Espoo Museum of Modern Art (EMMA) at the WeeGee complex one stop further west if your legs are ready to be done.",
  ],
  thumbnailUrl:
    "https://static.espoo.fi/cdn/ff/jSa55ugnin12iEjGyJxfMoNbXm9efSV8vxK39BFbFyQ/1690272439/public/2023-07/Tapiolan%20j%C3%A4%C3%A4puutarha.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Fountain_pool_in_Tapiola.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Illuminated_fountain_jets_in_Tapiola_on_New_Year's_Eve_2023.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Illuminated_tree_in_Tapiola.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Mini-Tapiola_in_December.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kulttuuriaukio_Kulturplatsen_Espoo_Esbo_2023-10-06.jpg",
  ],
  availability: {
    suitableMonths: [11, 12, 1, 2, 3],
    notes:
      "Season runs ~17 November to ~8 March, with weather-dependent shifts at either end. Lit until late evening; no formal open/close hours within the season. Café and skate rental are closed indefinitely — bring your own skates.",
  },
  location: {
    region: ["Espoo", "Uusimaa"],
    address: "Tapionaukio 3, 02100 Espoo",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~15 min",
    notes:
      "M2 metro from Lauttasaari direct to Tapiola (~10 min, no transfer — Tapiola is the M2 western terminus). The Ice Garden is a 3-minute walk from the metro exit at Tapionaukio, between the Ainoa shopping centre and the cultural centre.",
  },
  cost: {
    perPersonEur: 0,
    notes:
      "Free to skate. Bring your own skates — the on-site rental (Café Hile) is closed indefinitely. No ticket, no entry fee.",
  },
  booking: {
    leadTime: "same-day",
    notes: "Walk-in. No reservations, no time slots.",
  },
  suitableAgeRange: { min: 4 },
  childrenNotes:
    "Kids who can stand on skates will enjoy the loop — the no-hockey-stick rule keeps the pace gentle. Strollers stay off the ice but can park alongside the warm changing rooms. Toddlers and unsteady first-timers will tire fast; an hour is plenty.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "moderate",
  duration: "1-3h",
  website: "https://www.espoo.fi/en/units/tapiola-ice-garden",
  tags: [],
};

import type { Idea } from "../types";

export const helsinkiWinterGarden: Idea = {
  slug: "helsinki-winter-garden",
  title: "Helsinki Winter Garden (Talvipuutarha)",
  shortDescription:
    "A free 1893 greenhouse just north of Töölönlahti Bay — three glass rooms of cacti, palms, a 130-year-old camellia tree, and the unreasonably warm, plant-scented quiet of a Finnish winter Saturday.",
  longDescription: [
    "The Helsinki Winter Garden — Helsingin kaupungin Talvipuutarha — was a gift to the city by the businessman and philanthropist Wilhelm Bäckman, opened to the public in 1893 and free of charge ever since. It sits at the northern end of Töölönlahti Bay, on the slope below the Olympic Stadium tower, in a row of greenhouses that the city still uses to grow flowers for parks and public buildings. The Winter Garden itself is the public-facing one — a long glass house split into three rooms, kept warm year-round, and quietly maintained by Stara, the city's own works department.",
    "Inside there are more than 200 plant species across three connected halls. The Palm Room is the centrepiece: tall fan palms reaching toward the glass roof, a Magnolia grandiflora, a marble fountain, and the camellia tree that has been alive since the building opened — over 130 years old now and one of the oldest camellias in Finland, blooming with pink flowers around January and February. The Cactus Room next door is a low, dry collection of spiral-ribbed cacti and succulents that flower in two short windows (May–June and November–December). The Western Wing rotates seasonal flowering displays — Easter lilies in spring, autumn chrysanthemums, hyacinths and orchids through the dark months. There are tables and chairs scattered through the rooms; bringing a thermos and a bun is a respectable use of an hour.",
    "What makes the place so beloved by Helsinki regulars is what it does in February. From the outside it's a small white-and-glass building with snow piled on the roof; you walk in through the heavy door and the air goes from -10°C to humid 22°C, the smell of soil and plants washes over you, and the windows are fogged in a way that feels like a held secret. It's the warmest, greenest, most-alive room in central Helsinki on the worst day of the year, and it costs nothing. The Rose Garden in front of the greenhouse — open separately May 1 to October 31 — is the summer companion, with grouped roses blooming July through September.",
    "Open Mon–Thu and Sat–Sun 10:00–16:00, closed Fridays, closed entirely on Christmas Eve, Christmas Day, Midsummer Eve, and Midsummer Day. Free entry, coat racks and toilets on site, no café (snacks from home are fine — locals do this constantly). From Lauttasaari, take the M1/M2 metro to Helsinki Central (~6 min) and either walk north through Töölönlahti park (~15 min, scenic past Finlandia Hall and Oodi) or pick up tram 2 northbound to Auroran sairaala stop (~5 min) and walk down. Pair with the Olympic Stadium tower next door for a winter half-day, or with a long lakeside walk around Töölönlahti in summer.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Winter_Garden,_Helsinki_03.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsingin_Talvipuutarha_2021_(202169;+G67445).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsingin_Talvipuutarha_2022_(202220;+G70695).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Winter_Garden,_Helsinki_01.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Cactus_in_Helsinki_Winter_Garden.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Aporocactus_flagelliformis_Käärmekaktus_Ormkaktus_IM5678_C.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Easter_flowers_in_Talvipuutarha_IM5508_C.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Talvipuutarha_huhtikuussa_IM5507_C.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Ruusutarha_Helsinki_2022-09-19_01.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/HelsinkiCityWinterGarden.JPG",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule: "Mon–Thu 10:00–16:00, Sat–Sun 10:00–16:00. Closed Fridays.",
    notes:
      "Year-round, but the magic is loudest in winter — the contrast between the greenhouse warmth and the cold outside is the experience. Camellia blooms in January–February; cacti flower May–June and November–December. Closed Christmas Eve, Christmas Day, Midsummer Eve, and Midsummer Day.",
  },
  location: {
    region: ["Helsinki", "Töölö", "Uusimaa"],
    address: "Hammarskjöldintie 1 A, 00250 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~25 min",
    notes:
      "M1/M2 metro from Lauttasaari to Helsinki Central (~6 min), then either a 15-min walk north along Töölönlahti past Finlandia Hall and Oodi, or tram 2 northbound from Rautatientori to Auroran sairaala stop (~5 min) and a short walk down toward the bay.",
  },
  cost: {
    perPersonEur: 0,
    notes:
      "Free entry. No café on site — bring a thermos if you want to stay for an hour.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-in. No tickets, no booking, no queues. Mid-afternoon weekends in January–February are the busiest window — locals know.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Stroller-friendly — single ground floor, wide paths between the rooms. Quiet enough that a sleeping baby will keep sleeping; calm enough that a toddler can wander without breaking anything obvious. Older kids enjoy spotting the spiral cacti and the giant camellia. Don't touch the cacti — that's most of the parental work.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "<1h",
  website:
    "https://www.hel.fi/en/culture-and-leisure/outdoor-activities-parks-and-nature-destinations/parks/the-winter-garden",
  tags: ["nature", "historical"],
};

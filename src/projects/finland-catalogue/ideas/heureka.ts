import type { Idea } from "../types";

export const heureka: Idea = {
  slug: "heureka",
  title: "Heureka – The Finnish Science Centre",
  shortDescription:
    "Finland's flagship hands-on science museum in Tikkurila — three floors of touch-everything exhibitions, a domed planetarium, and a summer outdoor science park, all 25 minutes from Helsinki Central by train.",
  longDescription: [
    "Heureka opened in 1989 in the Tikkurila district of Vantaa, in a striking concrete-and-steel cube designed by Heikkinen–Komonen Architects (the building has won awards for both materials separately). The brief was to popularise science the way the Exploratorium did in San Francisco — touch the exhibits, run the experiments yourself, no \"do not lean on the glass\" signs. Three decades later it pulls about 300,000 visitors a year and is the obvious rainy-day move for any Helsinki-area family with curious kids.",
    "Inside, the permanent and rotating exhibitions cover physics, biology, technology, the human mind, and Earth science — pendulums you set in motion, optical illusions, simulators, a big roomy space about probability and chance, an electricity demonstration that culminates in a live Tesla coil. The Planetarium runs digital fulldome films through the day on rotation (included with admission) — think astronomy and natural history rather than commercial blockbusters. Summer adds the outdoor Galileo Science Park: water-flow experiments, big-format puzzles, a dinosaur trail.",
    "Tickets €26 adult / €23 in advance / under-5 free with an adult; child and senior pricing slots in between. Thursday evenings 15:00–20:00 is a flat €10 for everyone, advance or door — easily the best value if you can swing a weekday late visit. Allow 3–4 hours (longer with kids who don't want to leave). Open daily; high-summer hours (1 Jun – 9 Aug 2026) are Mon–Fri 09:00–18:00, Sat–Sun 10:00–18:00; the rest of the year it follows a similar pattern with a couple of seasonal closures.",
    "From Lauttasaari, hop on the metro to Helsinki Central (~6 min) and pick up any commuter train heading north to Tikkurila — lines I, P, K, R, T, D, N, Z all stop there, about 20 minutes from Central Station. Then it's a 700-metre signposted walk to the Heureka entrance.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Science_centre_Heureka_in_Tikkurila,_Vantaa,_Finland,_2022_June.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Cubes_at_Heureka,_optical_illusion.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Smilodon_model_at_Heureka.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Heureka,_Tiedepuisto_Galilei.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Heureka_bedrock_exhibition_in_Vantaa.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Summer (1 Jun – 9 Aug 2026): Mon–Fri 09:00–18:00, Sat–Sun 10:00–18:00. Off-season: typically Tue–Fri 10:00–17:00, Sat–Sun 10:00–18:00, closed Mondays. Thursday evenings 15:00–20:00 are flat €10.",
    notes:
      "Closed a few public holidays — verify before Easter weekend or late December. Year-round indoor destination; the outdoor Galileo Science Park is summer-only.",
  },
  location: {
    region: ["Vantaa", "Uusimaa"],
    address: "Tiedepuisto 1, 01300 Vantaa (Tikkurila district)",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~45 min",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), then any northbound VR commuter train (I, P, K, R, T, D, N, or Z) to Tikkurila (~20 min). 700-m signposted walk from the station. Whole trip is one HSL ABC zone ticket.",
  },
  cost: {
    perPersonEur: 26,
    notes:
      "Adults €26 (€23 advance online); seniors/students discounted; children 7–17 cheaper; under-5 free with an adult. Thursday 15:00–20:00 is €10 flat for everyone. Includes all exhibitions, planetarium films, and the summer outdoor science park.",
  },
  booking: {
    leadTime: "few-days",
    notes:
      "Book online a few days ahead for the €3 advance discount and to skip the ticket queue at peak weekends and school holidays. Thursday €10 evening doesn't sell out but does fill up.",
  },
  suitableAgeRange: { min: 4 },
  childrenNotes:
    "The whole place is built for families — strollers fit everywhere, there are family bathrooms, and most exhibits work for ages 4 up. Older kids (~10+) get the most out of the physics and probability rooms; younger ones gravitate to the rat basketball arena and the outdoor science park in summer.",
  indoorOutdoor: "mixed",
  physicalIntensity: "low",
  duration: "half-day",
  website: "https://www.heureka.fi/en",
  tags: ["museum"],
};

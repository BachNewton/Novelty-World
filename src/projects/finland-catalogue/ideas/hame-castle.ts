import type { Idea } from "../types";

export const hameCastle: Idea = {
  slug: "hame-castle",
  title: "Häme Castle",
  shortDescription:
    "A 14th-century red-brick Swedish-era castle on the shore of Lake Vanajavesi in Hämeenlinna — a tidy two-hour stop on the train line between Helsinki and Tampere.",
  longDescription: [
    "Häme Castle (Hämeen linna) sits on the south shore of Lake Vanajavesi in the town of Hämeenlinna, halfway up the Helsinki–Tampere main line. Construction probably began in the late 13th or early 14th century as a Swedish administrative stronghold over the region of Häme; the surviving granite-and-red-brick walls date mostly to the 1320s onwards. Unlike Turku Castle (sea-facing, military-merchant) Häme is squarer, more compact, and more obviously medieval — a square keep with corner turrets, encircling curtain walls, and a moat.",
    "After Finland passed to Russia the castle was converted into a prison, and it served that role from the early 1800s until 1953. Restoration ran from the 1950s through 1979, when it reopened as a museum operated by the Finnish National Board of Antiquities. Inside, you walk through the King's Hall on the upper floor (with its restored painted-rib brick vaulting), period-furnished chambers, the chapel, and the prison-era cells in the lower courses. There are interpretive exhibits on medieval Häme and a few thematic events through the year — a Renaissance fair in summer, Christmas events in December.",
    "Adult ticket €15; family ticket (2 adults + 1–4 kids) €35. Museum Card OK. The combined ticket (€28) adds the Museo Militaria military museum and the old county prison, both on the same peninsula and worth pairing if you've made the train trip.",
    "Hämeenlinna is ~1 hour from Helsinki on a VR Intercity or Pendolino — a genuine half-day excursion with no overnight needed. The castle is a 15-minute walk from the train station along the lake.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Hame_Castle_2019-08.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Lake_Vanajavesi_and_Häme_Castle_from_air.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/CastleOfHame_29042006_inside3.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Roof_of_King's_Hall_in_the_Castle_of_Hame.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/CastleOfHame_29042006_inside.JPG",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Jan 2 – Apr 30: Tue–Fri 10:00–16:00, Sat–Sun 11:00–16:00, closed Mondays. May daily 10:00–16:00. Jun–Aug daily 10:00–17:00. Ticket sales close 30 min before.",
    notes:
      "Closed 1 Jan, Good Friday, Easter Monday, 1 May, Midsummer Eve, and 15 Dec – 1 Jan (Christmas closure).",
  },
  location: {
    region: ["Hämeenlinna"],
    address: "Kustaa III:n katu 6, 13100 Hämeenlinna (~100 km north of Helsinki)",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~1h 25m each way",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), then VR Intercity or Pendolino to Hämeenlinna (~1h, frequent), then a 15-min walk along the lake from the station to the castle peninsula. Easy half-day from Lauttasaari — no overnight needed.",
  },
  cost: {
    perPersonEur: 15,
    notes:
      "Adults €15, children 7–17 €7, reduced €10. Family ticket (2 adults + 1–4 kids) €35. Combined ticket with Museo Militaria + Prison is €28 (May–Sept). Museum Card covered.",
  },
  booking: {
    leadTime: "same-day",
    notes: "Walk-in. Pre-book online if visiting during a Renaissance fair weekend.",
  },
  suitableAgeRange: { min: 5 },
  childrenNotes:
    "Older kids enjoy the towers and dungeons; the steep brick staircases are tough for toddlers and impossible with a stroller — bring a carrier.",
  indoorOutdoor: "indoor",
  physicalIntensity: "moderate",
  duration: "1-3h",
  website: "https://www.kansallismuseo.fi/en/haemeenlinna",
  tags: ["museum", "landmark", "historical", "castle"],
};

import type { Idea } from "../types";

export const savonlinna: Idea = {
  slug: "savonlinna",
  title: "Savonlinna & Olavinlinna Castle",
  shortDescription:
    "A small lakeside town built on islands in the heart of Saimaa Lakeland, anchored by the 1475 Olavinlinna castle — a near-perfectly preserved three-tower medieval fortress that hosts the Savonlinna Opera Festival in its courtyard every July.",
  longDescription: [
    "Savonlinna sits on a chain of islands where the wide arms of Lake Saimaa narrow into a pair of fast-running straits — Kyrönsalmi and Haapasalmi. The town's name (\"Savo Castle\") refers to Olavinlinna, the medieval fortress founded in 1475 by Erik Axelsson Tott to defend Sweden's eastern border against Novgorod. It's the only Finnish medieval castle still standing largely as built — three round towers connected by curtain walls, perched directly on a rocky islet in the strait, with the lake lapping the foot of the bastions on both sides. The setting is the magic: from the bridge you walk across to enter, the castle reads as a stone ship moored in the lake.",
    "Inside, the museum experience is straightforward: a self-guided route through the King's Hall, the chapel, the ramparts, and the bell tower; a small permanent exhibition on the castle's history; and guided tours in English and Finnish through the day. Allow two hours. The town itself is small — a 30-minute walk takes you past the cathedral, the Riihisaari lake-and-Saimaa-seal museum, the harbour with its old steamships, and the market square (Kauppatori) for a bowl of muikku (fried whitebait). It's an easy two-day trip: castle and town one day, a Lake Saimaa cruise the next.",
    "The town's headline event is the Savonlinna Opera Festival (3 July – 1 August 2026), now in its second century. The covered courtyard becomes a 2,200-seat opera house under the medieval walls — the 2026 programme runs Madama Butterfly, Nabucco, The Marriage of Figaro, La Traviata, and concert performances of Norma with Lisette Oropesa. The acoustic and the setting (candlelit ramparts, cool lake air, the floodlit castle reflecting in Kyrönsalmi) genuinely is a one-off experience even for non-opera people. Tickets €70–230 depending on seat tier and night, on sale months ahead — premium nights sell out by spring.",
    "From Helsinki the train takes ~4h 10m via VR (transfer at Parikkala onto a Pieksämäki connection), so this is comfortably a multi-day trip rather than a day excursion. Stay at the central Hotel Original Sokos Seurahuone (next to the market), or for atmosphere splurge on the SS Heinävesi or Punkaharju Resort 30 minutes south — Punkaharju's pine-ridge esker is the most-photographed landscape in Finland and is worth the detour if you have a spare half-day.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Olavinlinna_20180811.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Olavinlinna_(3).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Olavinlinna_Olofsborg_courtyard_01.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Olavinlinna_Kingshall.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Church_tower_staircase_Olavinlinna.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Savonlinna_Opera_Festival_Canopy.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kyrönsalmi_bridge_and_Olavinlinna.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Olofsborg_från_sjösidan.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/SS_Saimaa_at_Olavinlinna.JPG",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    events: [
      {
        from: "07-03",
        to: "08-01",
        name: "Savonlinna Opera Festival",
      },
    ],
    weeklySchedule:
      "Castle: Jan 2 – Apr 30 Tue–Fri 10:00–16:00, Sat–Sun 11:00–16:00 (closed Mondays). May daily 10:00–16:00. Jun–Sept daily 11:00–18:00. Oct 1 – Dec 15 Tue–Sun 10:00–16:00.",
    notes:
      "Year-round destination but the experience swings hard with the season. July is peak (opera festival, lake at its warmest, 19+ hours of daylight). Snowy lake-and-castle scenery in February is genuinely beautiful but most lake activities pause. Castle closed New Year, Easter, May Day, and 16–26 Dec.",
  },
  location: {
    region: ["Savonlinna", "Lakeland"],
    address: "Olavinkatu 27, 57130 Savonlinna",
  },
  accessFromLauttasaari: {
    complexity: "complex",
    duration: "~4h 20m each way by train",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), then VR train Helsinki → Parikkala (~3h) with a 5–10 min transfer onto the Parikkala → Savonlinna connecting train (~1h). About 11 services a day. Effectively a multi-day trip — a same-day return is not realistic. Driving (~4h) is the alternative.",
  },
  cost: {
    perPersonEur: 15,
    notes:
      "Castle entry adults €15 (€10 advance/group/student/senior, €7 child 7–17, family ticket €35, under-7 free). Museum Card covered. Opera Festival tickets are separate: €70–230 per night, €40–60 for restricted-view seats; book months ahead via operafestival.fi.",
  },
  booking: {
    leadTime: "weeks",
    notes:
      "Castle walk-in fine. Opera Festival tickets and Savonlinna hotels for July sell out 3–6 months ahead — book by March for opening-week premium nights. Outside opera season, hotels are easy a few days ahead.",
  },
  suitableAgeRange: { min: 5 },
  childrenNotes:
    "Castle interior has steep stone staircases and uneven thresholds — bring a carrier rather than a stroller for under-3s. Older kids enjoy the towers, dungeons, and the wooden bridge that swings out for boats. Opera evenings are not a kids' activity (long, late, formal-ish).",
  indoorOutdoor: "mixed",
  physicalIntensity: "moderate",
  duration: "multi-day",
  website: "https://www.kansallismuseo.fi/en/olavinlinna",
  tags: ["museum", "landmark", "historical", "castle"],
};

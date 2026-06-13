import type { Idea } from "../types";

export const forumMarinum: Idea = {
  slug: "forum-marinum",
  title: "Forum Marinum Maritime Centre",
  shortDescription:
    "Turku's national maritime museum on the Aura River — twelve historic vessels you can board (in summer) plus exhibition halls of shipbuilding, naval, and merchant-marine history.",
  longDescription: [
    "Forum Marinum is Finland's national maritime museum, on the Aura riverside next to Turku Castle. It was formed in 1999 by merging the Turku Maritime Museum and Åbo Akademi's older maritime collection. The indoor exhibition halls cover Finnish shipbuilding, life at sea, naval history, and the wartime navy — but the real draw is the fleet moored along the river: thirteen historic vessels including the full-rigged ship Suomen Joutsen, the wooden barque Sigyn (1887), the former steam cruiser MS Bore, gunboats, a minelayer, and motor torpedo boats.",
    "From May through September the ships are open and you can board most of them — climb below decks on Suomen Joutsen, walk the rigging gangways on Sigyn, see the cramped officers' quarters of a Cold War minelayer. Outside summer the ships are closed but the indoor exhibitions stay open year-round. Allow two to three hours in summer (longer if you really like ships); ninety minutes is enough in the off-season.",
    "Adults €12, children 5-12 €7, under-5 free; covered by the Museum Card. Open daily 11:00–19:00 in summer (May–Sept), Tue–Sun 10:00–18:00 the rest of the year. The site is right next to Turku Castle so the two pair naturally as a single day from Helsinki — VR train Helsinki–Turku ~2h, then bus 1 or a riverside walk from the station.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Forum_Marinum_Panorama.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Sigyn_docked_in_Turku.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Rautaville_Forum_Marinum.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/MKL-2103_Forum_Marinum_3.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Sulkavene_Vingett_Forum_Marinum_1.JPG",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "May–Sept daily 11:00–19:00. Off-season Tue–Sun 10:00–18:00 (closed Mondays). Last admission 30 min before closing.",
    notes:
      "The museum ships outdoors are only boardable May–September. Indoor exhibitions are open all year.",
  },
  location: {
    region: ["Turku"],
    address: "Linnankatu 72, 20100 Turku",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~2.5h each way",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), VR train Helsinki – Turku (~2h), then Föli bus 1 from the station (~15 min) or a 25-min riverside walk. Right next to Turku Castle — pair them as one day.",
  },
  cost: {
    perPersonEur: 12,
    notes:
      "Adults €12, children 5–12 €7, under-5 free. Museum Card covered. Pricing applies whether or not the ships are boardable.",
  },
  booking: {
    leadTime: "same-day",
    notes: "Walk-in. No advance booking needed.",
  },
  suitableAgeRange: { min: 4 },
  childrenNotes:
    "Boarding the ships is the kid magnet — narrow ladders, ropes, and engine rooms. Steeper than a typical museum; bring sturdy shoes and skip the stroller.",
  indoorOutdoor: "mixed",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://www.forum-marinum.fi/en/",
  tags: ["museum", "historical", "nautical"],
};

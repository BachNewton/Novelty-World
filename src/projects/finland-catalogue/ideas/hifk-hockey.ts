import type { Idea } from "../types";

export const hifkHockey: Idea = {
  slug: "hifk-hockey",
  title: "HIFK Hockey at Nordis (Helsinki Ice Hall)",
  shortDescription:
    "A Liiga night at the 1966-vintage Helsinki Ice Hall — 8,200 seats packed with HIFK's red-and-black faithful, no jumbotron pyrotechnics, just organ stings, organic chants, and Finland's national religion at full volume.",
  longDescription: [
    "HIFK Hockey is the men's ice hockey team of the Helsingfors IFK athletics club, founded in 1897 — Finland's oldest sports club, originally Swedish-speaking. The hockey side has played in the Liiga (Finland's top division) for decades, won seven national titles, and produced a steady stream of NHLers. They wear red and black, their crest is a stylised panther, and they take the ice at Helsinki Ice Hall on Nordenskiöldinkatu — colloquially \"Nordis\" after the address, or \"Petoluola\" (\"the Beast Cave\") after the panther logo. Built in 1966 by architects Jaakko Kontio and Kauko Räike, it's a low-slung concrete bowl that seats 8,200, and it has been HIFK's home since the puck dropped on opening night.",
    "Compared to the bigger, glassier Helsinki Halli (the renamed Hartwall Arena), Nordis is unapologetically old-school. The lighting is dim, the seats are tight, the concourses are narrow, and a few seats have obstructed views — but the soundtrack is a real organ played live, the chants are entirely fan-driven (no scoreboard prompts), and the rink is close enough to feel skates carve and pucks ring off the boards. HIFK fans treat away-team goals with a hush followed by deliberately tepid applause, then erupt at any home counter. The Stadin derby with Jokerit — Helsinki's other club, who returned to the Liiga in 2023 after a KHL detour — is back on the calendar and remains the loudest night of the year.",
    "Finnish hockey culture rewards a visit even if you don't follow the league. Hockey is the country's most-watched sport by a long way; the men's national team (Leijonat — \"the Lions\") has won three world championships and the 2022 Olympic gold, and the Liiga is where most of those players cut their teeth. The on-ice game is structured, defensive, and physically honest — sisu hockey, in the local idiom — and the in-arena rituals (the singing of the second-period intermission anthem, the pre-game player-arrival hand-shaking, the post-goal flag waving from the home end) are tight and consistent in a way you don't get at NHL games.",
    "The regular season runs September through March, with playoffs in April; HIFK plays roughly 30 home games, mostly Tuesday and Friday/Saturday evenings (face-off 18:30). Tickets are around €25 for a standard seat, €40+ for closer; buy via liiga.fi, hifk.fi, or Ticketmaster.fi. From Lauttasaari, take the metro to Helsinki Central (~6 min) and switch to tram 4 or 10 northbound to Auroran sairaala — total ~25 min door-to-door. Beer and food at the arena are pricey but plentiful (alcohol stays on the concourse — not allowed in the seating bowl). The full game runs ~2.5 hours including two 18-minute intermissions; arrive 20 min early to soak up the warm-up.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/HIFK-Tappara.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Ice_Hall_May_2022.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Ice_Hall_2018-11-01_15-17-06.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Nordis_ja_Finnair.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Ice_Hall_(FIN)_2010.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/HIFK-Kärpät_pääty.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Nordis_Valotaulu_HIFK-HPK.jpg",
  ],
  availability: {
    suitableMonths: [9, 10, 11, 12, 1, 2, 3, 4],
    weeklySchedule:
      "Home games typically Tue and Fri or Sat, face-off 18:30. Around 30 home games per regular season + playoffs. Check liiga.fi for the schedule.",
    notes:
      "Liiga regular season runs early September to mid-March; playoffs in late March / April. The Stadin derby (HIFK vs. Jokerit) is the marquee fixture and sells out earliest. No hockey May–August.",
  },
  location: {
    region: ["Helsinki", "Töölö", "Uusimaa"],
    address: "Helsinki Ice Hall (Nordis), Nordenskiöldinkatu 11–13, 00250 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~25 min",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), then tram 4 or 10 northbound to Auroran sairaala (~10 min) — the arena is a 3-min walk from the stop. Alternatively walk 25–30 min from Central straight up Mannerheimintie. The arena sits in the Töölö sports complex right next to the Olympic Stadium.",
  },
  cost: {
    perPersonEur: 25,
    notes:
      "Standard end-zone seats from ~€25, mid-tier ~€35, lower-bowl centre-ice ~€45+. Premium and derby fixtures higher. Beer at arena ~€8–10, hot dogs ~€6. Buy via liiga.fi, hifk.fi, or Ticketmaster.fi.",
  },
  booking: {
    leadTime: "few-days",
    notes:
      "Most regular-season Tuesdays go on sale day-of without trouble. Friday/Saturday games sell briskly — book a few days ahead. The Stadin derby vs. Jokerit and any playoff game need 2–3 weeks' notice.",
  },
  suitableAgeRange: { min: 6 },
  childrenNotes:
    "Family-friendly atmosphere; the arena is loud but no louder than a Finnish school sports day. Bring soft ear protection for under-7s. Family ticket bundles available some weeknights. Strollers fit through accessible entrances; check seat sightlines when booking.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://hifk.fi/",
  tags: [],
};

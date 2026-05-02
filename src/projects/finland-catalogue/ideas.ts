import type { Idea } from "./types";

/**
 * Hand-curated travel ideas for Finland. New entries are added by running
 * the `add-finland-idea` Claude Code skill, which researches each idea on
 * the web and appends a fully-populated entry to this array.
 *
 * Sample images below use picsum.photos placeholders at varied aspect ratios
 * to verify that the catalogue layout handles real-world image variety.
 * Replace with real hotlinked URLs as ideas are properly added via the skill.
 */
export const IDEAS: Idea[] = [
  {
    slug: "allas-sea-pool",
    title: "Allas Sea Pool",
    shortDescription:
      "Heated pools and three saunas at the harbour with a view straight to the ferry terminal and Suomenlinna.",
    longDescription: [
      "Allas Sea Pool sits at the edge of Helsinki's Market Square, a swimming complex perched right on the water with a heated freshwater pool, a heated seawater pool, and a cold sea pool fed directly from the harbour. Three saunas — one mixed, one for women, one for men — round out the experience, all looking out over the Baltic.",
      "It's a quintessentially Finnish way to spend an afternoon: alternate between hot sauna and cold sea, watch the harbour ferries come and go, eat something from the on-site cafe, repeat. The cold pool stays cold year-round (think 4°C in winter), which is the whole point — locals do this every week.",
      "Bring swimwear and a towel, or rent both at reception. The complex gets busy on warm summer evenings and frigid winter weekends — the latter is genuinely the more memorable experience.",
    ],
    thumbnailUrl: "https://picsum.photos/seed/allas-thumb/1200/900",
    galleryUrls: [
      "https://picsum.photos/seed/allas-1/1600/900",
      "https://picsum.photos/seed/allas-2/800/1000",
      "https://picsum.photos/seed/allas-3/1200/800",
      "https://picsum.photos/seed/allas-4/1000/1000",
    ],
    availability: {
      seasons: "year-round",
      weeklySchedule: "Daily, typically 6:30am-9pm (check site for current hours)",
    },
    location: {
      region: "Helsinki",
      address: "Katajanokanlaituri 2 a, 00160 Helsinki",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "10 min",
      notes: "Walk from Helsinki Central Station, or trams 4, 5, and 7 stop at Market Square right next door.",
    },
    cost: {
      perPersonEur: 17,
      notes: "Day ticket. Towel and swimwear rental available for ~€5 each.",
    },
    booking: {
      leadTime: "same-day",
      notes: "Walk-in. Sauna gets crowded on weekend evenings — go early or midweek.",
    },
    toddlerFriendly: true,
    toddlerNotes:
      "Heated pools are toddler-friendly; the cold sea pool obviously isn't. Family changing room available.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "low",
    duration: "1-3h",
    website: "https://allasseapool.fi",
    tags: [],
  },
  {
    slug: "suomenlinna",
    title: "Suomenlinna Sea Fortress",
    shortDescription:
      "UNESCO-listed 18th-century island fortress just a short ferry ride from the Helsinki harbour.",
    longDescription: [
      "Suomenlinna is a sprawling sea fortress built across six interconnected islands, originally constructed by the Swedes in 1748 to defend against Russian expansion. It's a UNESCO World Heritage site, an active residential community of about 800 people, and one of the most-visited destinations in Finland — yet it never feels overrun, because the islands are big enough to absorb the crowds.",
      "Spend half a day wandering the ramparts, ducking into bunker tunnels, walking the cliffs, and visiting one or several of the small museums (Suomenlinna Museum, the WWII submarine Vesikko, the Toy Museum). There are cafes and a brewery if you want to make a meal of it.",
      "The ferry from Market Square is part of Helsinki's public transport — your tram pass gets you there. Pack layers in any season; the wind off the Baltic is real, and it's an outdoor activity at heart.",
    ],
    thumbnailUrl: "https://picsum.photos/seed/suomenlinna-thumb/1600/1200",
    galleryUrls: [
      "https://picsum.photos/seed/suomenlinna-1/1800/1200",
      "https://picsum.photos/seed/suomenlinna-2/1200/1600",
      "https://picsum.photos/seed/suomenlinna-3/1400/900",
    ],
    availability: {
      seasons: "year-round",
      notes:
        "Islands are open year-round; some museums and cafes are summer-only.",
    },
    location: {
      region: "Helsinki",
      address: "Suomenlinna islands, accessible by ferry from Market Square",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "20 min ferry",
      notes:
        "HSL public ferry from Market Square (Kauppatori) — runs every 20-40 min and is included in a standard Helsinki transit ticket.",
    },
    cost: {
      perPersonEur: 0,
      notes:
        "The islands themselves are free. Ferry is covered by a regular HSL ticket (~€3.10). Museums charge €4-10 each.",
    },
    booking: {
      leadTime: "same-day",
    },
    toddlerFriendly: true,
    toddlerNotes:
      "Lots of open space to roam. Some uneven terrain and unfenced cliffs near the shore — kids need supervision.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "moderate",
    duration: "half-day",
    website: "https://www.suomenlinna.fi",
    tags: [],
  },
  {
    slug: "lapland-husky-safari",
    title: "Husky Safari in Lapland",
    shortDescription:
      "Drive your own team of huskies through the snow-covered forests above the Arctic Circle.",
    longDescription: [
      "A husky safari puts you behind a real working sled team — typically 4-8 dogs — pulling you across frozen lakes and through pine forests in deep snow. Most operators pair you up so one person mushes while the other rides; you swap halfway. The dogs are loud and excited at the start line, then settle into a rhythm that's surprisingly quiet once you're moving.",
      "Tours range from a 2-hour taster to a full-day excursion with lunch over a campfire, and there are multi-day expeditions for the truly committed. Most safaris depart from kennels near Rovaniemi, Levi, or Saariselkä; you'll be issued thermal overalls, boots, mittens, and a hat at the kennel — wear your own warm base layers underneath.",
      "Book early in the season. The window is short (December through March), the popular operators sell out months in advance for Christmas and New Year, and 'last-minute' here can mean weeks ahead. This is a flagship Lapland experience and worth doing properly.",
    ],
    thumbnailUrl: "https://picsum.photos/seed/husky-thumb/1400/900",
    galleryUrls: [
      "https://picsum.photos/seed/husky-1/1600/1100",
      "https://picsum.photos/seed/husky-2/900/1200",
      "https://picsum.photos/seed/husky-3/1500/1000",
      "https://picsum.photos/seed/husky-4/1200/1200",
      "https://picsum.photos/seed/husky-5/1800/900",
    ],
    availability: {
      seasons: ["winter"],
      specificDates: "Operates roughly December through March, depending on snow",
    },
    location: {
      region: "Lapland",
      address: "Multiple operators near Rovaniemi, Levi, Saariselkä, and Inari",
    },
    accessFromHelsinki: {
      complexity: "complex",
      duration: "Overnight train (~10-12h) or 1.5h flight to Rovaniemi, then 30-60min transfer to kennel",
      notes:
        "The Santa Claus Express overnight sleeper from Helsinki to Rovaniemi is itself part of the experience. Most kennels offer pickup from town; otherwise rent a car.",
    },
    cost: {
      perPersonEur: 180,
      notes:
        "Typical 2-hour taster €150-200 per person. Half-day with lunch €250-350. Multi-day expeditions €600+.",
    },
    booking: {
      leadTime: "months",
      notes:
        "Christmas/New Year sells out by August. Off-peak weeks (early December, late March) can sometimes be booked a few weeks ahead.",
    },
    toddlerFriendly: false,
    toddlerNotes:
      "Most operators won't take children under 6-8 on the sled. Some kennels offer a separate kids' tour with smaller dogs and a short loop — ask before booking.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "moderate",
    duration: "half-day",
    website: "https://www.visitfinland.com/en/things-to-do/winter-activities/husky-safari/",
    tags: [],
  },
];

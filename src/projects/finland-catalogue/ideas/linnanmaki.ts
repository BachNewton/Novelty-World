import type { Idea } from "../types";

export const linnanmaki: Idea = {
  slug: "linnanmaki",
  title: "Linnanmäki",
  shortDescription:
    "Finland's flagship amusement park: eight roller coasters including the brakeman-operated 1951 wooden Vuoristorata and the launched-steel Taiga (52m, 106 km/h — Finland's tallest, fastest, and longest), all run by a children's-charity foundation right inside Helsinki.",
  longDescription: [
    "Linnanmäki has been the heart of Finnish amusement-park culture since 1950. It sits on a hilltop in Alppila, 2.5 km north of Helsinki Central, and packs 42+ rides into a compact site whose layout — coasters threading between food kiosks and trees — feels nothing like a sprawling Six-Flags. Entry is free; you pay for rides via a wristband or a punch card. The whole operation is owned by the Children's Day Foundation, a non-profit, and a portion of every ticket goes to Finnish child-welfare work. Even the rides have run on wind energy since the 2010s.",
    "The headline coasters cover an unusually wide era-range for one park. Vuoristorata (1951) is the wooden classic, one of only six coasters in the world still operated by a brakeman who stands at the back of the train working the levers — it celebrates its 75th anniversary in July 2026 with special programming. Taiga (2019) is the modern thrill: a launched Intamin steel coaster that is Finland's tallest (52 m), fastest (106 km/h), and longest (1,104 m), with a launch-into-vertical-spike opening that pins riders for a full second. Kirnu, opened 2007, was the first compact 4D coaster in Europe — seats rotate freely as the train moves. Round it out with Salama (a launched roller coaster), Ukko (suspended), Linnunrata eXtra (indoor dark coaster), and the Pikajuna and Tulireki family coasters.",
    "The non-coaster lineup is just as good: Kingi (75 m drop tower), Hurjakuru rapids, the Panoraama observation tower, the classic Ferris wheel Rinkeli, and a swarm of spinners and family rides. The atmosphere shifts entirely after dark during Carnaval de Lumière in mid-October, when the park reopens for ten illuminated nights with light installations, fire performers, and the autumn theme programming — a visually distinct experience from the daytime summer park, and worth planning around if your trip lands then.",
    "Practical notes. The park is closed in winter; the 2026 main season runs April 30 to September 6, with the Carnaval de Lumière event a separate window in mid-October. Buy the Isohupi all-rides wristband (€53 adult, €43 kids' Pikkuhupi for the under-120cm rides) online in advance — same-day buys are fine off-peak but lines slow to a crawl in July. Single ride tickets exist if you only want a few rides. Height limits matter: most thrill coasters require 140 cm; Taiga is 130 cm; the kids' rides start at 90 cm. Plan a full day if you intend to ride everything, and bring a rain layer — the park stays open in showers.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Linnanmäki_ilmasta_27.5.2017.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Linnanmäki_Vuoristorata.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Linnanmäki_Roller_Coaster_1.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Linnanmäki_roller_coaster.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomi100_Linnanmäki.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinkipyörä_Linnanmäki.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Linnanmäki_360°_2020-03-16.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Illuminated_rows_of_lights_at_Linnanmäki_Lights_Carnival_2015.jpg",
  ],
  availability: {
    suitableMonths: [4, 5, 6, 7, 8, 9, 10],
    events: [
      {
        from: "10-09",
        to: "10-18",
        name: "Carnaval de Lumière (Carnival of Light)",
      },
    ],
    notes:
      "Main season runs late April through early September (2026: Apr 30 – Sep 6); Carnaval de Lumière reopens the park for ~10 evenings in mid-October. Closed entirely Nov–Mar. July is busiest; weekday afternoons in May/June and late August are calmest.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Tivolikuja 1, 00510 Helsinki (Alppila)",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~25 min",
    notes:
      "Metro M1/M2 to Kamppi (~10 min), then bus 23 from Kamppi bus terminal to the Linnanmäki stop right at the main gate (~15 min). Alternative: metro to Helsinki Central, then tram 3 or 8 to Alppila — slightly longer but a more scenic walk-up to the South Gate.",
  },
  cost: {
    perPersonEur: 53,
    notes:
      "Entry is free; the €53 Isohupi wristband covers all rides for one day. Kids' Pikkuhupi wristband €43 (height-limited rides only). €5 Area Entrance ticket if you don't ride at all (covers six small kids' rides + activity zones). Buy online for a small discount. Food/drinks add ~€10–20 per person.",
  },
  booking: {
    leadTime: "few-days",
    notes:
      "Wristbands rarely sell out, but online purchase skips the gate ticket queue. Carnaval de Lumière evenings are timed-entry — book those a week or two ahead.",
  },
  suitableAgeRange: { min: 3, max: 16 },
  childrenNotes:
    "Excellent for kids 4–14 — the Pikkuhupi wristband covers a full day of family rides for the under-120cm crowd. Under-3s enter free but most rides have a 90 cm minimum; the activity zones and area-entrance areas have plenty for them. Strollers fine throughout. Heights matter: bring a measuring stick mentality — 90 cm, 120 cm, 130 cm, and 140 cm are the thresholds that gate which rides each child can do.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "moderate",
  duration: "full-day",
  website: "https://www.linnanmaki.fi/en/",
  tags: ["theme park", "landmark"],
};

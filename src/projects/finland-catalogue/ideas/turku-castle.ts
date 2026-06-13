import type { Idea } from "../types";

export const turkuCastle: Idea = {
  slug: "turku-castle",
  title: "Turku Castle",
  shortDescription:
    "Finland's oldest and largest medieval castle, founded c. 1280 at the mouth of the Aura River — now a sprawling museum of stone halls, chapels, and Renaissance royal apartments.",
  longDescription: [
    "Turku Castle (Turun linna) was begun around 1280 as a Swedish military stronghold guarding the mouth of the Aura River. Over the next four centuries it grew into a sprawling residence, peaking under Duke John of Finland and Catherine Jagellon in the mid-16th century, who added Renaissance halls, banqueting rooms, and a chapel. A 1614 fire gutted the upper floors; the castle was eventually restored over decades and reopened to the public in its current form in 1987. It's the most visited museum in Finland.",
    "Inside, the experience is genuinely castle-like — thick stone walls, narrow staircases, vaulted cellars, and a dozen rooms dressed to specific eras. The Renaissance section on the upper floors recreates the royal apartments with period furniture, tapestries, and costumes. The medieval bailey at the front contains the original 13th-century keep with its dungeons; the newer (16th-century) bailey holds the great halls. There's a chapel still occasionally used for services, plus rotating exhibitions on Turku city history.",
    "Allow two to three hours — the castle is bigger than it looks from outside and easy to lose track of time in. Adult entry is €18; the Museum Card covers it. Open Tue–Sun, closed Mondays and a handful of major holidays.",
    "From Helsinki, take a VR train to Turku (~2h), then bus 1 or a short walk along the river (~25 min) from the station. The castle sits right next to the harbour where the Stockholm ferries dock. Combine with Forum Marinum next door for a full day.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Turkucastle_edit.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Turku_Castle_bailey.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Castle_of_Turku,_courtyard_renaissance_part.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Castle_of_Turku,_larger_room.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Åbo_slott_1724.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Turku_Castle_from_Linnankatu.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Turku_Castle_in_September_2024.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Courtyard,_Turunlinna.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Tue–Sun 10:00–17:00 (Jun–Aug 10:00–18:00). Closed Mondays.",
    notes:
      "Closed 1 May, 19–21 Jun (Midsummer), 6 Dec (Independence Day), and 24–25 & 31 Dec. Last admission 30 min before closing.",
  },
  location: {
    region: ["Turku"],
    address: "Linnankatu 80, 20100 Turku",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~2.5h each way",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), VR train Helsinki – Turku (~2h, frequent), then Föli bus 1 from Turku Central Station (~15 min) or a 25-min riverside walk. The castle is by the harbour, next to the ferry terminal.",
  },
  cost: {
    perPersonEur: 18,
    notes:
      "Adults €18. Covered by the Finnish Museum Card. Children/students discounted.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-in fine. Pre-book online to skip the counter on busy summer days.",
  },
  suitableAgeRange: { min: 5 },
  childrenNotes:
    "Older kids enjoy the dungeons, towers, and dress-up corners. Younger kids may struggle with the steep staircases — strollers are awkward; bring a carrier instead.",
  indoorOutdoor: "indoor",
  physicalIntensity: "moderate",
  duration: "1-3h",
  website: "https://turunlinna.fi/en/",
  tags: ["museum", "landmark", "historical", "castle"],
};

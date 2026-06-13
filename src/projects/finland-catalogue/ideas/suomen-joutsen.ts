import type { Idea } from "../types";

export const suomenJoutsen: Idea = {
  slug: "suomen-joutsen",
  title: "Suomen Joutsen",
  shortDescription:
    "Finland's last surviving full-rigged tall ship — board her at Forum Marinum's dock and walk the deck of a 96-metre 1902 sailing vessel that served as a French merchantman, a German training ship, and a Finnish naval cadet school.",
  longDescription: [
    "Suomen Joutsen (\"Finnish Swan\") is a steel-hulled three-masted full-rigger built in 1902 at Chantiers de Penhoët in Saint-Nazaire, France. She had three lives at sea before her current one as a museum ship: as the French merchantman Laënnec on Atlantic and Pacific cargo routes; as the German Oldenburg, training a generation of merchant sailors (including U-boat ace Günther Prien); and from 1930 as a Finnish Navy training vessel that completed eight international voyages before WWII. After the war she became a stationary seamen's school in Turku, training nearly 4,000 cadets, and has been open as a museum since 1991.",
    "She's moored permanently in the Aura River at Forum Marinum's dock, and in summer visitors can go aboard. The exhibition \"The Five Lives of the Full-rigger Suomen Joutsen\" runs across the main deck and below, telling each phase of her story; you can wander the rigging, the captain's cabin, the cadet quarters, and the engine spaces. She's the last remaining full-rigger in Finland and one of only a handful of surviving steel-hulled square-rigged sail training ships anywhere.",
    "Open daily 1 Jun – 16 Aug 2026 (the precise window shifts each year). Visiting is included with Forum Marinum admission (€12 adult, Museum Card OK) — no separate ticket. Outside summer the ship is closed but a guided winter tour can be arranged through the museum.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomen_Joutsen_2.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomen_Joutsen_in_Uusikaupunki.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomen_Joutsen_stern.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomen_Joutsen_4th.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomen_Joutsen_1932.jpg",
  ],
  availability: {
    suitableMonths: [6, 7, 8],
    weeklySchedule:
      "Open daily 1 Jun – 16 Aug 2026, same hours as Forum Marinum (11:00–19:00).",
    notes:
      "Boarding is summer-only. The Forum Marinum indoor exhibition about the ship is open year-round, and winter guided tours can be arranged on request.",
  },
  location: {
    region: ["Turku"],
    address: "Linnankatu 72, 20100 Turku (moored at Forum Marinum dock)",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~2.5h each way",
    notes:
      "Same as Forum Marinum: metro to Helsinki Central (~6 min), VR train Helsinki – Turku (~2h), then Föli bus 1 (~15 min) or 25-min riverside walk. Right next to Turku Castle.",
  },
  cost: {
    perPersonEur: 12,
    notes:
      "Boarding is included with Forum Marinum admission (€12 adult, €7 child 5–12, under-5 free). Museum Card covered.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-in via Forum Marinum. No separate ticket. Winter guided tours need to be arranged in advance via the museum.",
  },
  suitableAgeRange: { min: 5 },
  childrenNotes:
    "Steep companionways and narrow doorways belowdecks — not stroller-friendly. Older kids who like ships will love it; toddlers will struggle with the ladders.",
  indoorOutdoor: "mixed",
  physicalIntensity: "low",
  duration: "<1h",
  website:
    "https://www.forum-marinum.fi/en/exhibitions/museum-ships/the-full-rigger-suomen-joutsen/",
  tags: ["museum", "historical", "nautical"],
};

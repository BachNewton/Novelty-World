import type { Idea } from "../types";

export const moominWorld: Idea = {
  slug: "moomin-world",
  title: "Moomin World",
  shortDescription:
    "Tove Jansson's Moomins brought to life as a walkable summer-only theme park on a small island beside Naantali — climb through the five-storey blueberry-blue Moominhouse and meet the costumed characters.",
  longDescription: [
    "Moomin World (Muumimaailma) opened in 1993 on the island of Kailo next to Naantali's old town, designed by Dennis Livson. It's a theme park in the loose European sense — no rollercoasters or thrill rides. Instead the island is built out as Tove Jansson's storybook world: a blueberry-coloured Moominhouse, the Hemulen's house, Snufkin's camp, the Hattifatteners' cave, Moominpappa's boat, and a small open-air theatre. Costumed Moomintroll, Snork Maiden, Little My, Snufkin, and the Groke wander the paths and pose for photos.",
    "The Moominhouse is the centrepiece — five storeys, every room dressed exactly like Jansson's pen drawings, and you can walk through the lot. The park is gentle and pre-school-paced; the appeal scales hard with how much your kids already love the Moomin books. Older children who don't know the stories may find it too sedate. The whole island is small enough to circle in four to five hours, and there's a sandy swimming spot if it's warm.",
    "It's strictly a summer attraction: the 2026 season runs 9 June – 21 August. Tickets are €43 per adult booked online (€45 at the gate); under-2s are free. From Helsinki, take a VR train to Turku (~2h), then Föli local bus 6 or 6A to Naantali (~30 min). It's a long day-trip — many visitors stay a night in Naantali or Turku. Combine with Naantali's wooden old town for a half-day on either side.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Muumitalo_3.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Inside_the_Moominhouse,_Moominworld.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Hemulin_talo.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Muumimaailma_naantali_11.jpeg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Moominmamma_and_Moominpappa,_Moominworld.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Muumipapan_laiva.jpg",
  ],
  availability: {
    suitableMonths: [6, 7, 8],
    weeklySchedule:
      "9–30 Jun: 11:00–17:00; 1 Jul – 2 Aug: 10:00–17:30; 3–21 Aug: 11:00–17:00",
    notes:
      "Closed entirely outside summer. Park dates shift slightly each year — check the official site before booking transport.",
  },
  location: {
    region: ["Turku"],
    address: "Kailo Island, Naantali (next to Naantali old town, ~16 km west of Turku)",
  },
  accessFromLauttasaari: {
    complexity: "complex",
    duration: "~3h 10m each way",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), VR train Helsinki – Turku (~2h, frequent), then Föli local bus 6 or 6A from Turku to Naantali (~30 min). Park is a short walk from the bus stop across a wooden bridge. Doable as a long day trip but most visitors stay overnight in Naantali or Turku.",
  },
  cost: {
    perPersonEur: 43,
    notes:
      "€43 1-day online, €45 at the gate. 2-day pass €49 online. Family tickets (3-5 people) €123-€205. Children under 2 free.",
  },
  booking: {
    leadTime: "few-days",
    notes:
      "Book online for the discount and to skip the gate queue. No need to book months ahead.",
  },
  suitableAgeRange: { min: 2, max: 10 },
  childrenNotes:
    "The whole park is built for young children — strollers fit everywhere, there are family bathrooms, and characters interact gently. Older kids who don't know the Moomins may find it too sedate.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "half-day",
  website: "https://www.moominworld.fi/",
  tags: ["theme park"],
};

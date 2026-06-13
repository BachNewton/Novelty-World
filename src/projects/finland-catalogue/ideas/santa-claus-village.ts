import type { Idea } from "../types";

export const santaClausVillage: Idea = {
  slug: "santa-claus-village",
  title: "Santa Claus Village",
  shortDescription:
    "Meet Santa Claus year-round at his official residence on the Arctic Circle just outside Rovaniemi — free to enter, with reindeer, the Arctic Circle crossing line, his post office, and a constellation of cabins that doubles as the start point for husky and aurora trips.",
  longDescription: [
    "Santa Claus Village (Joulupukin Pajakylä) opened in 1985, eight kilometres northeast of Rovaniemi at the spot where the Arctic Circle crosses the highway. It started as a single log cabin built for Eleanor Roosevelt's 1950 visit and grew into Finland's most-visited single attraction — a small theme park of timber lodges, reindeer pens, and gift shops, with the painted Arctic Circle line running across the central square. The village is open every day of the year and there's no admission fee.",
    "The headline experience is meeting Santa himself, who holds office at Santa Claus's Office every day from morning to evening. The meeting is free; you only pay if you want the photo or video package (from €55 for a group of up to five — paid on the spot, no booking needed, photos start at around €40). Beyond Santa's office: the official Main Post Office where you can write a letter that gets stamped with the Arctic Circle postmark and posted on Christmas Eve, Mrs. Santa Claus's Cottage at the Reindeer Resort, the Christmas House next door, a snowmobile museum, and a row of husky-, reindeer-, and snowmobile-tour operators who all dispatch from the village.",
    "It's unapologetically commercial — the gift shops outnumber the actual things to do, the queues to meet Santa run long all December — but it lands harder than expected. The Arctic Circle crossing certificate, the reindeer in the snow, the genuinely-old Santa with a thoughtful manner all hit the right notes for kids and the kid-adjacent. November through January is peak: snow on the ground, lights up everywhere, and aurora visible most clear nights. Summer keeps the village open but it loses most of the magic — the cabins look bare without snow.",
    "From Helsinki, the romance is the Santa Claus Express overnight train (departs Helsinki ~19:30 or ~22:30, arrives Rovaniemi around 08:00 — sleeper berths from €49, basic seat from €29 via VR). Once in Rovaniemi, local bus 8 runs to the village year-round (~30 min, €4 single), or it's a quick taxi from the train station. Most people pair this with a husky safari or aurora trip, since you're already up here.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Santa_Claus_Village.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Santa_Land_Rovaniemi_Arctic_Circle1.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Santa_Land_Rovaniemi_Arctic_Circle2.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Rovaniemi-SantaClausVillage.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Snowball_pyramid_at_Santa_Claus'_Village_Large.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Rovaniemi-santa's-post-office.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Rovaniemi_Santa_Claus.JPG",
  ],
  availability: {
    suitableMonths: [11, 12, 1, 2, 3],
    weeklySchedule:
      "Open 365 days a year. Peak season (mid-Nov to early Jan) ~10:00–19:00; Santa's Office runs slightly shorter morning/lunch/afternoon shifts (e.g. 10–11:30, 12–14, 15–17). Off-peak hours shorter.",
    notes:
      "Year-round but the experience is wildly seasonal. November–January is peak Christmas magic with reliable snow. December queues to meet Santa are heaviest 11:00–14:00 — go right at opening or after 16:00. Summer is open but the village looks bare without snow and most of the appeal evaporates.",
  },
  location: {
    region: ["Rovaniemi", "Lapland"],
    address: "Tähtikuja 1, 96930 Napapiiri (Arctic Circle), Rovaniemi",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~12h overnight train (incl. metro to Helsinki Central)",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), then VR's Santa Claus Express overnight train: departs ~19:30 or ~22:30, arrives Rovaniemi ~07:30–08:30; sleeper berths from €49, basic seat from €29. From central Rovaniemi, local bus 8 runs to the village year-round (~30 min, ~€4), or grab a taxi. Long journey but logistically simple — one straightforward overnight train with no fragile connections. Effectively a multi-day trip — almost no one does this as a same-day return.",
  },
  cost: {
    perPersonEur: 0,
    notes:
      "Village entry and meeting Santa are free. Photo packages from ~€40 single / €55 group of 5. Reindeer rides ~€20–40, husky safaris from €130, snowmobile tours from €150. Lunch in a village restaurant ~€15–25. Easy to spend €100+ per person across the day even with free entry.",
  },
  booking: {
    leadTime: "months",
    notes:
      "The village itself doesn't need booking, but December train berths, hotels, and husky/aurora tours sell out months in advance for the Christmas-week window. Aim 4–6 months out for a December trip; 2–3 weeks is fine November or shoulder-season.",
  },
  suitableAgeRange: { min: 2, max: 12 },
  childrenNotes:
    "The whole village is built for young children. Strollers handle the main paths but get bogged down in fresh snow — a sled or carrier is better in deep winter. Bring proper outerwear; daytime temps run −15 to −25°C in midwinter and kids bail fast if they're cold.",
  indoorOutdoor: "mixed",
  physicalIntensity: "low",
  duration: "half-day",
  website: "https://santaclausvillage.info/",
  tags: ["theme park"],
};

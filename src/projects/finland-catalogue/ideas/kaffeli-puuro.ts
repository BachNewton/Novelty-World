import type { Idea } from "../types";

export const kaffeliPuuro: Idea = {
  slug: "kaffeli-puuro",
  title: "Puuro at Kaffeli torikahvila",
  shortDescription:
    "A bowl of rice puuro with butter and lingonberry jam at one of Hakaniementori's tiny outdoor torikahvilas — Kaffeli, on the open market square in front of the hall, where porridge is on the menu all day every day the square is open.",
  longDescription: [
    "Puuro — slow-cooked porridge eaten with a knob of butter melting in the middle and a spoonful of lingonberry jam (puolukkahillo) — isn't a breakfast dish in Finland the way it is elsewhere. It's a meal of its own, eaten any time of day, and the rice version (riisipuuro) in particular is what gets ladled at outdoor market squares from spring through Christmas. Hakaniementori, the open market square in front of Hakaniemi Market Hall, is the easiest place in Helsinki to find one. Kaffeli torikahvila — one of the small wooden cafés that set up tables right on the square — keeps puuro on the menu every day they're open.",
    "Kaffeli is a torikahvila in the original sense: a little café tent and counter on the cobblestones, a handful of outdoor tables, and a menu that doesn't try to be more than the square deserves. Coffee, pulla, vanilla croissants, sandwiches, and a bowl of puuro for under five euros. Rice porridge runs daily, with a second rotating variety (oat, four-grain, sometimes barley) alongside it; demand peaks at Christmas and Midsummer when the seasonal cinnamon-and-prune crowd shows up. Sister café Kahvisiskot has been working the same square for over fifty years and pours from a similar template — both are worth a stop, both let you sit outside and watch the square's traders set up.",
    "Hakaniementori itself was filled in from a strait in 1897 and has been a market spot ever since, with a daily produce-and-flowers market, monthly farmers' market on the first Sunday, and the occasional political demonstration spilling over from the labour movement's deep ties to the Kallio district. The square is right outside the renovated 1914 market hall, so a puuro at Kaffeli pairs naturally with a wander through the hall's stalls afterwards.",
    "Practical: M1 or M2 metro from Lauttasaari direct east to Hakaniemi (~10 min, no transfer), then thirty seconds out the metro exit to the square. Kaffeli runs daytime hours roughly Mon–Sat (closed Sundays); the square's torikahvilas operate from early spring through December and shut down for the deepest winter weeks. Bring cash or card — both work.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Hakaniementori_in_August.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kahvi_Siskot_Hakaniementori_-_panoramio.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Hakaniementori_on_a_July_morning.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Hakaniementori_in_July.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Riisipuuro.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Finnish_Christmas_rice_porridge.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Hakaniementori,_Helsinki_1907.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Hakaniemen_kauppahalli2008b.jpg",
  ],
  availability: {
    suitableMonths: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Approximately Mon–Sat daytime (early morning through early afternoon). Closed Sundays. Hours vary by season — confirm via Kaffeli's Instagram (@kahvilakaffeli) before a long detour.",
    notes:
      "The torikahvilas run early spring through December and shut for the deepest winter weeks. Kahvisiskot's owner works daily \"early spring through December\" — Kaffeli's window is similar. Demand for puuro peaks at Christmas and around Midsummer.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Hakaniementori, 00530 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~15 min",
    notes:
      "M1 or M2 metro from Lauttasaari direct east to Hakaniemi (~10 min, no transfer — five stops via Ruoholahti, Kamppi, Rautatientori, and Helsingin yliopisto). Kaffeli is on the open square 30 seconds from the metro exit, in front of the market hall.",
  },
  cost: {
    perPersonEur: 5,
    notes:
      "Bowl of puuro €4–5, coffee €2–3, pulla or vanilla croissant under €5. A full sit-down stop is €5–10. Card and cash both fine.",
  },
  booking: {
    leadTime: "same-day",
    notes: "Walk-up counter service. No reservations.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Outdoor seating only — a few tables on the cobblestones. Stroller-friendly across the square. Puuro is mild and toddler-friendly; high chairs are scarce, so plan to share a bench.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "<1h",
  website: "https://www.instagram.com/kahvilakaffeli/",
  tags: ["food", "café"],
};

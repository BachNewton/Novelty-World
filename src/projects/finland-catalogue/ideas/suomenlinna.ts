import type { Idea } from "../types";

export const suomenlinna: Idea = {
  slug: "suomenlinna",
  title: "Suomenlinna Sea Fortress",
  shortDescription:
    "An 18th-century star-fortress sprawling across six interlinked islands a 15-minute ferry from Market Square — UNESCO-listed bastions, tunnels, museums, a dry dock, a submarine, beaches, and a small living village all on one ticket.",
  longDescription: [
    "Suomenlinna (\"Castle of Finland\", originally Sveaborg under Swedish rule) was begun in 1748 to defend the eastern Baltic against Russia, designed by Augustin Ehrensvärd along Vauban-influenced principles. The fortress surrendered after a two-month siege in 1808, opening the door to Russia's annexation of Finland; the islands then served as a Russian naval base for a century, became Finnish in 1917, and were a military garrison until 1973. UNESCO listed the site in 1991. Around 800 people still live on the islands year-round.",
    "Six islands are connected by short bridges so you can walk the whole route on foot. The set-piece is Kustaanmiekka at the southern tip — a dramatic line of green ramparts, cannons, and the King's Gate facing open sea. On the way you pass the dry dock (still working — they restore wooden sailing ships there), Ehrensvärd's tomb in the central courtyard, the WWII-era submarine Vesikko (you can climb inside), the Suomenlinna Museum (orientation), the Toy Museum, and a brewery-restaurant. Allow at least three hours; six is closer to honest if you want the museums.",
    "The HSL public ferry leaves from Kauppatori roughly every 20 minutes in summer, every 40–60 in winter, and takes 15 minutes. A standard AB single ticket (€3.30, 90 min) covers it — the same ticket as a tram. The fortress itself is free and always open: museums charge €5–10 each (Museum Card OK), and most close in winter or run reduced hours. Year-round destination, but very different in character — summer is lush and full of picnickers; winter strips it down to icy ramparts and almost no one around.",
    "Bring layers and good shoes. The paths are gravel and uneven cobblestone. There's a café and the brewery on the islands but supplies are limited — most locals pack snacks and a thermos.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomenlinna_aerial.JPG",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomenlinna_mereltä_5.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Turisteja_Kustaanmiekassa.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomenlinna_Tunnels.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomenlinnaferry.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Viapori,_Sveaborg,_Helsinki_-_20240905_-_14.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/King's_Gate,_Kustaanmiekka,_Suomenlinna,_Helsinki,_Finland_02.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Submarine_Vesikko_on_Susisaari_Suomenlinna.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomenlinnan_kirkko_Iso_Mustasaari_Suomenlinna_2022-09-17_01.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Cannons_on_Kustaanmiekka_Suomenlinna_2022-09-17_01.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Islands open 24/7. Most museums and the brewery open May–Sept; the Suomenlinna Museum is the main year-round indoor stop.",
    notes:
      "Genuine year-round destination but the experience flips: summer is the postcard version, winter is empty ramparts and ice. Late spring (May) and early autumn (Sept) hit the sweet spot — open museums, no crowds.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Suomenlinna islands, 00190 Helsinki (15-min ferry from Kauppatori)",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~20 min by boat (May–Oct), ~30 min by ferry (year-round)",
    notes:
      "By boat from HSK Marina (May–Oct): a ~20-minute direct crossing east across the Lauttasaarensalmi and southern harbour into Suomenlinna's Tykistölahti guest harbour — the simplest and fastest option in season. Watch for HSL ferry traffic on the Suomenlinna approach and shipping lanes south of Hernesaari. Off-season / boatless guests: bus 21 from Lauttasaari runs straight to the Suomenlinna HSL ferry pier at Kauppatori (~15 min bus + ~15 min ferry, AB single ticket €3.30 covers both legs). Metro to Helsinki Central + 10-min walk to Kauppatori is the other transit option. The HSL ferry runs every 20 min in summer, 40–60 min in winter; the private JT-Line waterbus runs in summer (separate ticket, more scenic).",
  },
  cost: {
    perPersonEur: 3,
    notes:
      "Ferry €3.30 round-trip with an AB ticket. The fortress is free. Suomenlinna Museum €8, submarine Vesikko €7, Toy Museum €9 — Museum Card covers most. Brewery and cafés are extra.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-up. No tickets needed for the islands. Ferries don't sell out. Brewery restaurant takes reservations in summer if you want lunch with a view.",
  },
  suitableAgeRange: { min: 4 },
  childrenNotes:
    "Strollers work on the main paths but not on the cannon emplacements or tunnel sections. Kids love the cannons, the submarine, and the Toy Museum; rough cobblestones and unfenced ramparts mean keep an eye out near the southern bastions.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "moderate",
  duration: "half-day",
  website: "https://www.suomenlinna.fi/en/",
  tags: ["museum", "landmark", "historical", "nautical", "nature", "island"],
};

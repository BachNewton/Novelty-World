import type { Idea } from "../types";

export const stockholmOvernightFerry: Idea = {
  slug: "stockholm-overnight-ferry",
  title: "Stockholm Overnight Ferry",
  shortDescription:
    "Board a Tallink Silja or Viking Line cruiseferry at Helsinki's Olympia Terminal at 17:00, sleep in a cabin while the ship threads the Åland archipelago, dock in central Stockholm at ~10:00 — a full day in Gamla Stan, then sail back the same way.",
  longDescription: [
    "The Helsinki–Stockholm overnight ferry is one of the great European travel rituals — Finns and Swedes have ridden it for generations as a working booze-cruise (alcohol stays duty-free as long as the route touches Åland's tax-loophole waters), and visitors take it because it's a frankly novel way to add Stockholm to a Helsinki trip. Two operators run it: Tallink Silja with the sister ships Silja Serenade (1990) and Silja Symphony (1991), and Viking Line with the new Viking Glory. All are massive 200-metre cruiseferries with 13 decks, multiple restaurants, bars, a spa, a small casino, kid play areas, and the famous central indoor promenade that runs almost the full length of the ship like a high-street.",
    "The schedule is the appeal: depart Helsinki Olympia Terminal at 17:00, sail across the Gulf of Finland and through the Åland archipelago overnight (a brief stop at Mariehamn around midnight reset the duty-free clock — most passengers sleep through it), and dock in central Stockholm's Värtahamnen at ~10:00. You have a full day in Stockholm — Gamla Stan (the medieval old town), the Vasa Museum, the Royal Palace, Skansen — and reboard at 16:00ish for the return overnight, back in Helsinki by mid-morning. Total trip: two nights aboard plus one day in Stockholm.",
    "Cabins come in tiers: a windowless C-class inside cabin (bunk beds, en-suite, ~9 m²) starts around €70–90 per person twin-share booked early; a sea-view A-class is €100–130; family cabins for four around €150 per person; suites and Commodore class are luxury territory at €250+. Foot-passenger walk-on tickets without a cabin start at €25 each way (you ride in the public lounges for 17 hours), but the cabin is most of the point. Food is à la carte or via the famous breakfast/dinner buffets (~€35 dinner, €15 breakfast, drink package extra).",
    "The ship is the experience as much as Stockholm is. Try to grab a sea-view cabin so you can see the Åland skerries at sunrise; book dinner at the buffet for the full Finnish-Swedish smörgåsbord experience; and budget at least a couple of hours for the duty-free liquor shop on the way back — half the locals onboard are doing exactly that, with carts piled high. Year-round daily service; summer (June–August) is the peak when cabins on prime weekends sell out months ahead. Winter sailings hit ice in the archipelago — quietly spectacular if you're up before sunrise.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Silja_Serenade,_Stockholm,_2019_(02).jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Silja_Serenade_promenade.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/MS_Silja_Symphony_interior_view.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Serenade_Sundeck.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Stortorget_i_Gamla_Stan_i_Stockholm-2.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Sweden._Stockholm._Gamla_stan_051.JPG",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Year-round daily service. Tallink Silja and Viking Line each run one departure per day in each direction. Helsinki → Stockholm departs ~17:00, arrives ~10:00 next day. Stockholm → Helsinki departs ~16:30, arrives ~10:00.",
    notes:
      "Daily year-round. Summer school-holiday weekends sell out cabins 2–3 months ahead. Winter sailings push through Baltic ice — atmospheric, especially around dawn through the Åland archipelago.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Departure: Olympia Terminal, Olympiaranta 1, 00140 Helsinki. Arrival: Värtahamnen, Hamnpirsvägen 10, 11556 Stockholm.",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~17h each way (overnight)",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), then tram 2 to Olympia Terminal (~10 min). Whole transfer covered by one HSL AB ticket. Two-night minimum for the full Stockholm experience — sleep in a cabin both nights, full day in the city in between.",
  },
  cost: {
    perPersonEur: 200,
    notes:
      "Round-trip with a 2-person cabin twin-share: ~€140–250 per person depending on cabin tier and how far ahead you book. Foot-passenger walk-on (no cabin) from €50 round-trip but unrealistic for an overnight. Onboard buffet dinners ~€35, breakfast ~€15. Hotel in Stockholm not needed if you ferry both nights.",
  },
  booking: {
    leadTime: "weeks",
    notes:
      "Book 4–8 weeks ahead for cabin choice and decent prices; summer (Jun–Aug) and Christmas/New Year sell out 2–3 months ahead. Walk-on the day-of works in shoulder season but you'll get what's left, often an inside cabin near the engine.",
  },
  suitableAgeRange: { min: 4 },
  childrenNotes:
    "Both Silja and Viking ships are aggressively kid-friendly: dedicated play areas, kids' meals, family cabins with bunk beds. The ship itself is the experience for ~5–10 year olds — they'll happily explore decks for hours. Bring noise-cancelling headphones for the Mariehamn stop at midnight if you're a light sleeper.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "multi-day",
  website: "https://www.tallink.com/",
  tags: ["nautical"],
};

import type { Idea } from "../types";

export const tallinnFerryDayTrip: Idea = {
  slug: "tallinn-ferry-day-trip",
  title: "Tallinn Day Trip by Ferry",
  shortDescription:
    "Catch a ~2-hour ferry across the Gulf of Finland to Tallinn's medieval UNESCO old town in the morning, wander cobbled lanes and Toompea Hill all day, and ferry back by evening — three operators, ~10 sailings a day, easy walk-on round-trip from €30.",
  longDescription: [
    "Helsinki and Tallinn sit only 80 km apart across the Gulf of Finland, and the ferry corridor between them is one of the busiest in Europe — three operators (Tallink Silja, Eckerö Line, Viking Line) run roughly 10–12 sailings a day in each direction, with crossings between 2h and 2h 30m. Walk-on tickets are cheap, the ferries are oversized cruise ships with restaurants, duty-free, and viewing decks, and Tallinn's UNESCO-listed old town starts a 10-minute walk from the port. It's the easy double-up day from Helsinki — leave at 07:30, back by 22:30, and you've added a country.",
    "Tallinn's Old Town is the draw: a near-fully-intact medieval merchant quarter ringed by walls and towers, with Toompea Hill rising at the western edge crowned by the onion-domed Alexander Nevsky Cathedral and the parliament building. The Lower Town below is denser and busier — Town Hall Square (Raekoja plats), the 14th-century Old Town Hall, the Niguliste Church (now a museum, with the panoramic spire view), the Three Sisters merchant houses on Pikk, and the cluster of Russian-spy-novel cellar bars off Vene. A full lap of the walls plus a Toompea viewpoint plus lunch is a comfortable day; serious museum-going needs two.",
    "Practical: the cheapest, simplest day-trip operator is Eckerö Line on M/S Finlandia from Helsinki West Terminal — round-trip walk-on tickets often €25–35 if you book a few days ahead, two daily round-trip pairings that work for a full day in Tallinn (depart Helsinki ~08:30, depart Tallinn ~17:30 for example). Tallink Silja's MyStar/Megastar are faster (~2h), more frequent (8 daily), and a notch nicer — €35–60 round-trip. Viking Line is in between. All three depart from West Terminal 2 (T2) — 5 min by tram 7 from Central Station — and arrive at Tallinn's D-Terminal, a 10-min walk from the old town gate.",
    "Bring a passport even though Finland and Estonia are both Schengen — onboard purchases (especially alcohol) want ID. The shopping ferries' famous draw for Finns is duty-free booze; Estonian alcohol is cheaper, the currency is the euro, and the ferries themselves run a tax-free shop on the half-hour stretch in international waters. If you're doing only one of the side trips described in this catalogue (Tallinn or Stockholm), Tallinn is the easier choice — same-day return, no overnight planning, and the medieval old town is tighter and more walkable than Stockholm's Gamla Stan.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tallinn-panorama-2011.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tallinn_old_town_roof_tops_2008.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tallinn_Old_Town_(drone_shot)_(22377086281).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Punased_katused_Tallinna_vanalinnas.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tallinna_vanalinn_päikesetõusu_ajal.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Vistas_panorámicas_desde_Toompea,_Tallinn,_Estonia,_2012-08-05,_DD_16.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Oleviste_kirik_ja_Raekoja_plats_Niguliste_kiriku_tornist_74.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    notes:
      "Year-round route — ferries run daily through winter. Summer (May–September) is peak: long days, warm cobbles, packed cafés. Winter trips have shorter daylight (Tallinn closes early in December/January) but the Old Town under snow is genuinely beautiful and the December Christmas Market on Raekoja plats is one of the best in Northern Europe.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Departure: West Terminal (Länsiterminaali) T2, Tyynenmerenkatu 14, 00220 Helsinki. Arrival: D-Terminal, Lootsi 13, Tallinn.",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~2h each way on the ferry; ~10 min to/from terminals",
    notes:
      "West Terminal 2 sits right across the bridge from Lauttasaari. Take bus 21V or 65A to Länsiterminaali, or hop one stop on the metro to Ruoholahti and walk ~10 min. All three ferries (Tallink Silja MyStar/Megastar, Eckerö M/S Finlandia, Viking Line XPRS) depart from T2. In Tallinn the ferries dock at D-Terminal, a 10-min walk or short bus 2 ride to the Old Town gate.",
  },
  cost: {
    perPersonEur: 35,
    notes:
      "Walk-on day-return €25–35 (Eckerö, advance), €35–60 (Tallink Silja MyStar/Megastar). Add €5–15 for an upgraded seat or lounge access. Onboard food/duty-free is extra. Lunch and sightseeing in Tallinn ~€20–40.",
  },
  booking: {
    leadTime: "few-days",
    notes:
      "Book online a few days ahead for the cheap fares — same-day works but you'll pay the door price. Saturday and Sunday round-trips in July fill up; book a week ahead in summer.",
  },
  suitableAgeRange: { min: 5 },
  childrenNotes:
    "The ferries themselves are kid-friendly — play areas, cafés, lots of windows. Tallinn's cobblestone Old Town is hard on strollers (bring a carrier). Old Town has limited public toilets — duck into a café.",
  indoorOutdoor: "mixed",
  physicalIntensity: "low",
  duration: "full-day",
  website: "https://www.tallink.com/",
  tags: ["historical", "landmark", "nautical"],
};

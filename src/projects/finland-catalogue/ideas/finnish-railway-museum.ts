import type { Idea } from "../types";

export const finnishRailwayMuseum: Idea = {
  slug: "finnish-railway-museum",
  title: "Finnish Railway Museum (Suomen Rautatiemuseo)",
  shortDescription:
    "Finland's national railway museum on the working depot of the 1873 Hyvinkää–Hanko line — 25 locomotives in a working roundhouse, the only surviving Russian Imperial saloon cars in the world, and a 7¼-inch gauge miniature steam railway you can ride.",
  longDescription: [
    "The Finnish Railway Museum sits on the original station yard of the Hyvinkää–Hanko railway, Finland's first private rail line, opened in 1873. The wooden station building from that year still stands; the engine roundhouse, water tower, and various depot outbuildings around it are all real working infrastructure rather than reconstructions, which gives the place a different feel from a museum that imported its rolling stock onto a sterile site. The institution itself dates to 1898, founded in Helsinki, and moved out to Hyvinkää in 1974 when it took the depot over wholesale. It's now Finland's national-responsibility museum for railway heritage.",
    "About 25 locomotives are on display — steam, diesel, petrol, narrow-gauge — spread between the roundhouse and the outdoor tracks. The headline pieces are the oldest: Class B1 No. 9 (\"Ram\"), built in 1868 and the oldest preserved locomotive in Finland; Class C1 No. 21 (\"Bristollari\") from the following year; the post-war heavy-freight Tr2 No. 1319, a Soviet-influenced design nicknamed \"Truman\". Manufacturers in the collection include Tampella, Neilson & Co, Swiss Locomotive & Machine Works, and the American Alco. The Heritage Train Valtteri is the working steam-hauled tour train that occasionally pulls out of the museum on charter runs — when it's in the yard, you can usually walk right up to the locomotive.",
    "The most unusual exhibit isn't a locomotive at all. The museum holds the only three surviving carriages of the Russian Imperial train — the Tsar's Saloon, the Tsarina's Saloon, and a saloon car — built in the 1870s for the Tsar's travel between Saint Petersburg and Helsinki, and stranded in Finland by the 1917 revolution. Roughly a hundred Imperial carriages once existed; these three are what's left, anywhere on Earth. The interiors (silk, gilt, velvet, parquet) are absurdly opulent for railway carriages and are worth the trip on their own.",
    "Practicalities: open Tue–Sun 10:00–18:00 in winter (Sept–May, closed Mondays) and daily 10:00–18:00 in summer (Jun–Aug, except Midsummer). Adults €14, children 7–17 €5, family ticket €30, under-7s free. The 7¼-inch gauge miniature live-steam railway runs public rides on summer weekends — kids' favourite by a wide margin, and not extra. Allow half a day on site; with the miniature train, lunch in town, and two laps of the roundhouse, you'll fill it. From Helsinki it's a 40-minute commuter-train ride and a 10-minute walk to the door — easily the most accessible big rail museum in the Nordics.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomen_rautatiemuseo_Hyvinkaa_2013.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/W-RautatieMuseo-c-veturitalli.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/W-RautatieMuseo-f-veturitalli.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/W-RautatieMuseo-h-veturitalli.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/W-RautatieMuseo-l-veturitalli.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Hyvinkaan_rautatieasema_(Hanko-Hyvinkaa)_front.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Rautatiemuseo1.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Sept–May: Tue–Sun 10:00–18:00 (closed Mondays). Jun–Aug: daily 10:00–18:00.",
    notes:
      "Closed during Midsummer (~Jun 19–21) and over Christmas. The miniature live-steam railway runs public rides on summer weekends only — that's the kid sweet spot; the museum content itself is the same year-round.",
  },
  location: {
    region: ["Hyvinkää", "Uusimaa"],
    address: "Hyvinkäänkatu 9, 05800 Hyvinkää (~60 km north of Helsinki)",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~1h each way",
    notes:
      "M1/M2 metro from Lauttasaari to Helsinki Central (~6 min), then VR commuter R train Helsinki Central → Hyvinkää (~40 min, two trains per hour all day), then a 10-min walk from Hyvinkää station to the museum. One easy transfer; very low planning effort.",
  },
  cost: {
    perPersonEur: 14,
    notes:
      "Adult €14 / child 7–17 €5 / under-7 free / family €30. Round-trip VR commuter ticket Helsinki ↔ Hyvinkää ~€20. Lunch in Hyvinkää centre €12–18.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-up at the door year-round. Train tickets cheaper booked online than at the kiosk but same-day is fine.",
  },
  suitableAgeRange: { min: 3 },
  childrenNotes:
    "Excellent for kids — climb-aboard locomotives, the miniature steam railway in summer, a kids' workshop at the back of the roundhouse, baby-care room in the entrance hall. Stroller-friendly inside; the outdoor depot tracks are gravel and ballast so a sturdy stroller is fine but a carrier is easier.",
  indoorOutdoor: "mixed",
  physicalIntensity: "low",
  duration: "half-day",
  website: "https://rautatiemuseo.fi/en/",
  tags: ["museum", "historical", "train"],
};

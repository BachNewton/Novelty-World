import type { Idea } from "../types";

export const finnishAviationMuseum: Idea = {
  slug: "finnish-aviation-museum",
  title: "Finnish Aviation Museum (Suomen Ilmailumuseo)",
  shortDescription:
    "80+ aircraft and a full century of Finnish flight under one roof beside Helsinki Airport — Caudron biplanes, Winter War fighters, MiG-21 and Saab Draken jets, a Caravelle and DC-3 outside, and open cockpits to climb into.",
  longDescription: [
    "The Finnish Aviation Museum (Suomen Ilmailumuseo) sits in the Aviapolis district of Vantaa, three minutes' drive from Helsinki Airport's main terminal — fittingly close to the runways its collection helped open. The Aviation Museum Society was founded in December 1969 by a group of pilots and aviation engineers who refused to watch the country's mid-century aircraft go to scrap; the first public museum opened in 1972 in the basement of the airport terminal itself, and moved into its own purpose-built hangars in 1981. The Foundation now operates ~80 aircraft, 22 of them gliders, plus 9,600 aviation objects and a serious research library of 16,000 books and 160,000 magazines.",
    "What you actually see: rare warbirds and trainers (a Caudron C.60 from the 1920s, the wreck-fragments of a 1928 Gloster Gamecock fighter, the remarkable home-built Heinonen HK-1 Keltiäinen, a Letov Š-218 Smolik), Cold War fast jets (a MiG-21 and a Saab 35 Draken, both flown by the Finnish Air Force), Finnish-designed aircraft you genuinely won't find anywhere else (Valmet Vihuri, VL Tuisku, VL Pyry, the PIK glider series), and big civilian airliners outside the hangar — a Douglas DC-3 and the museum's prize Caravelle that you can sometimes board on open days. The Winter War and Continuation War sections are where the historical weight lands: aircraft, photographs, and personal kit from the period when a country of 4 million held off the Soviet Union with whatever planes it could borrow, buy, or build itself.",
    "Especially good for kids who are into flying. Several cockpits are open for sitting in (the PIK-12 sailplane, a couple of the trainers), the Lentopuisto play hangar has flight simulators and hands-on stations, and the placards run in English alongside Finnish. If your child is mid-piloting-lesson, the docent volunteers — almost all retired pilots themselves — are usually delighted to talk through the cockpit layouts and old aircraft systems. Two hours minimum; three if the kid is engaged.",
    "Adult €14, child 7–17 €7, under-7 free, family ticket €30, concessions €7. Museum Card holders free; Junior Card €20 (yearlong, 7–17). Open winter (Sept–May): closed Mon, Tue 10–17, Wed–Fri 10–20, Sat–Sun 10–17. Summer (Jun–Aug): Mon–Tue 10–17, Wed–Fri 10–20, Sat–Sun 10–17. Closed 6 Dec, 24–26 Dec, 31 Dec, 1 Jan, and Midsummer. Note the exhibition halls are unheated — bring a jacket year-round, a proper coat in winter. From Lauttasaari, take the metro to Helsinki Central (~6 min) then VR Ring Rail (line I or P) to Aviapolis station (~25 min), then walk 300m.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Finnish_Aviation_Museum_exhibition_hall_1_20090419.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/FinnishAviationMuseumBuilding.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomen_ilmailumuseo_20180625.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Caudron_C.60_CA-84.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Gloster_Gamecock_20080619.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Heinonen_HK-1_Keltiäinen.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/VL_Tuisku.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Karhumäki_Karhu_48B.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Letov_Š-218_Smolik.JPG",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Sept–May: Mon closed, Tue 10:00–17:00, Wed–Fri 10:00–20:00, Sat–Sun 10:00–17:00. Jun–Aug: Mon–Tue 10:00–17:00, Wed–Fri 10:00–20:00, Sat–Sun 10:00–17:00.",
    notes:
      "Year-round. Closed 6 Dec (Independence Day), 24–26 Dec, 31 Dec, 1 Jan, and Midsummer. Exhibition halls are unheated — wear a jacket year-round, a proper coat in winter.",
  },
  location: {
    region: ["Vantaa", "Uusimaa"],
    address: "Karhumäentie 12, 01530 Vantaa (Aviapolis, beside Helsinki Airport)",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~50 min",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), then VR Ring Rail (line I or P) to Aviapolis station (~25 min, runs every 10 min). 300m walk from the station to the museum.",
  },
  cost: {
    perPersonEur: 14,
    notes:
      "Adult €14, child 7–17 €7, under-7 free, concessions (students/seniors/unemployed) €7, family ticket (2+3) €30, Junior Card (7–17, yearlong) €20. Museum Card free.",
  },
  booking: {
    leadTime: "same-day",
    notes: "Walk-in fine. Online booking available; rarely needed except for school groups.",
  },
  suitableAgeRange: { min: 4 },
  childrenNotes:
    "Especially good for plane-curious kids. Several cockpits are open for sitting in, the Lentopuisto play hangar has flight simulators and hands-on stations, English placards throughout, and the volunteer docents (often retired pilots) are usually happy to talk through the aircraft. Stroller-accessible. Halls are unheated — bring a coat in winter.",
  indoorOutdoor: "mixed",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://ilmailumuseo.fi/en/",
  tags: ["museum", "historical"],
};

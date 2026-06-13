import type { Idea } from "../types";

export const vapriikkiTampere: Idea = {
  slug: "vapriikki-tampere",
  title: "Vapriikki Museum Centre (Hockey Hall of Fame & Finnish Museum of Games)",
  shortDescription:
    "Tampere's main museum complex packs ten exhibitions into one ticket — including the Finnish Hockey Hall of Fame and the Finnish Museum of Games, the only national gaming museum in the Nordics.",
  longDescription: [
    "Vapriikki is housed inside the converted Tampella ironworks on the Tammerkoski rapids, a hulk of red brick that's a landmark in its own right. One €16 adult ticket gets you into all ten exhibitions under the roof — natural history, the Tampere city museum, the post museum, a mineral collection, the Finnish Shoe Museum, the Doll Museum — but the two that draw most visitors are the Finnish Hockey Hall of Fame and the Finnish Museum of Games.",
    "The Hockey Hall of Fame (Suomen Jääkiekkomuseo) sits on the third floor in a 440 m² hall and traces Finnish ice hockey from the 1930s to the present. Authentic Canada Cup and World Championship trophies, a wall of induction plaques (six new ones added each year since 1985), and a row of artefacts from Selänne, Kurri, and Koivu. The interactive draw is the slap-shot and goaltender simulators — you stand in front of a sensor wall and try to score, which is more fun than it sounds.",
    "The Finnish Museum of Games (Suomen Pelimuseo) is the country's gaming museum proper — about 100 playable games on cabinets, consoles, and PCs spanning 1980 to today, plus themed period rooms (a Pong booth, a Commodore 64 setup, a NES living room, a recreated arcade with Space Invaders and pinball, a 1990s game-store recreation). Notable Finnish titles get pride of place: Afrikan Tähti (the 1951 board game), Max Payne, Angry Birds, Alan Wake, My Summer Car. You can sit down and play almost everything.",
    "Allow three to four hours to do the two flagship exhibits and a third one of your choice (Tampere 1918 — the Civil War exhibit — is the standout among the smaller ones). Open Tue–Sun 10:00–18:00, closed Mondays. Adult €16, family €38 (2 adults + up to 4 kids), kids 7–17 and students €8, under-7 free; Museum Card OK. Friday 15:00–18:00 is free entry.",
    "From Helsinki, VR Pendolino or Intercity to Tampere takes ~1h 50m and runs every 30–60 minutes throughout the day; tickets from ~€5 booked in advance. Vapriikki is a 10-minute walk from Tampere station along the rapids — easy half-day trip, comfortably done with no overnight, though Tampere's worth a longer stay if you have it.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Museum_Centre_Vapriikki.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Vapriikki_-_interior.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Vapriikki_center_hall.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Pelimuseo_overview.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomen_Pelimuseo_2.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Sega_Dreamcast_arcade_machine.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Magnavox_Odyssey_in_museum.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Afrikan_tähti_Suomen_Pelimuseo.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tampere_model.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule: "Tue–Sun 10:00–18:00. Closed Mondays.",
    notes:
      "Open year-round. Free entry every Friday 15:00–18:00. A handful of public-holiday closures and a few exceptional Mondays (Tampere school holidays) — check the site if your trip lands on a Monday.",
  },
  location: {
    region: ["Tampere"],
    address: "Alaverstaanraitti 5, 33100 Tampere",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~2h 10m each way",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), then VR Pendolino or Intercity train Helsinki – Tampere (~1h 50m, every 30–60 min). Vapriikki is a 10-min walk from Tampere station along the Tammerkoski rapids. Doable as a half-day with no overnight.",
  },
  cost: {
    perPersonEur: 16,
    notes:
      "Adults €16, kids 7–17 / students €8, family ticket (2 adults + 1–4 kids) €38, under-7 free. Free entry every Friday 15:00–18:00. Museum Card covered.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-in. Train tickets are cheaper booked a few days ahead via VR.",
  },
  suitableAgeRange: { min: 6 },
  childrenNotes:
    "The games museum is a magnet for ~8+ kids who recognise some of the consoles, but younger kids enjoy just sitting at the controllers. The hockey simulators and dress-up corners suit ~5+. Strollers fit on all floors via lifts.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "half-day",
  website: "https://www.vapriikki.fi/en/",
  tags: ["museum"],
};

import type { Idea } from "../types";

export const moominMuseum: Idea = {
  slug: "moomin-museum",
  title: "Moomin Museum",
  shortDescription:
    "The world's only museum dedicated to Tove Jansson's Moomins — 2,000 original illustrations and a hand-built five-storey Moominhouse tableau, in the basement of Tampere Hall, a 1h45 train ride north of Helsinki.",
  longDescription: [
    "The Moomin Museum (Muumimuseo) sits on the lower level of Tampere Hall and is, by a quirk of donation history, the only museum in the world dedicated to Tove Jansson's work. The collection is the real thing: roughly 2,000 of Jansson's original Moomin illustrations, sketches, book covers, and comic-strip pages — handed to the city of Tampere by Jansson and her partner Tuulikki Pietilä in 1986 — together with around three dozen three-dimensional Moomin tableaux that Jansson, Pietilä, and engineer Pentti Eistola built by hand over several decades. The first version, called Moominvalley, opened in the Metso main library in 1987; it relocated to its much larger current home at Tampere Hall on 17 June 2017, during Finland's centenary year, and was renamed.",
    "The set-piece is a five-storey Moominhouse, just over two metres tall, that Pietilä built across three years from felted wool, paper, papier-mâché, beads, and small carved wooden details — every room a recreation of one of Jansson's own pen drawings, viewable through cutaway windows. Around it, smaller tableaux reconstruct individual scenes from the books: the snowstorm in *Moominland Midwinter*, Snufkin in his tent, the comet over Moominvalley, the hopelessness of the Hattifatteners. The original ink illustrations rotate in and out of display from the 2,000-piece archive; on a typical visit you'll see roughly a hundred on the walls, plus large reproductions on wall panels and a quiet reading library where you can sit and read the Moomin books in a dozen languages.",
    "The Moomin Museum is an art museum more than a theme attraction — there are no costumed characters, no rides, no merchandise pushed at you in the galleries. It works for adults reading Jansson seriously, for kids who already know the books, and as a long, slow afternoon for anyone who recognises the shapes from Iittala glassware and wants to know where they came from. Most visitors take 90 minutes to two hours; serious fans book three. The on-site Restaurant Tuhto serves the Tampere Hall lunch menu, and the museum shop carries a smaller, more curated selection of Moomin books and prints than the Helsinki tourist shops.",
    "Adult €18, child 7–17 €9 (under 7 free), student/senior/unemployed €9, family ticket €36 for two adults plus 1–4 children. Open Tue–Fri 10:00–18:00, Sat–Sun 9:00–17:00, closed Mondays and a handful of major holidays. Buy tickets at the Tampere Hall main desk on entry; the Museokortti museum card covers it. Doable as a day trip from Helsinki — VR InterCity train to Tampere is about 1h45 with departures roughly twice an hour — and pairs well with the Vapriikki museum complex or the Pyynikki ridge for a full day in Tampere.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Muumimuseon_lukukirjasto.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Muumimuseon_sisäänkäynti_Tampere-talossa.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tampere-talo_illuminated.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tampere_Hall_Main_entrance.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tampere-talo_2017.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Tue–Fri 10:00–18:00 (groups from 9:00), Sat–Sun 9:00–17:00. Closed Mondays.",
    notes:
      "Year-round. 2026 closures: 1 Jan, 3 Apr (Good Friday), 1 May (Vappu), 19–21 Jun (Juhannus), 6 Dec (Independence Day), 23–26 Dec (Christmas).",
  },
  location: {
    region: ["Tampere"],
    address: "Tampere Hall, Yliopistonkatu 55, 33100 Tampere",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~2h 15m each way",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), then VR InterCity Helsinki–Tampere (~1h45–2h, departures roughly twice an hour), then a 6-minute walk east along Yliopistonkatu to Tampere Hall. Tampere station has clear English signage. One-way train fare booked a few days ahead is roughly €10–15; on-the-day prices climb to €30+.",
  },
  cost: {
    perPersonEur: 18,
    notes:
      "Adult €18, child 7–17 €9, under-7 free, student/senior/unemployed €9, family ticket €36 (2 adults + 1–4 children). Museokortti (Finnish Museum Card) covers it. Tickets bought at the Tampere Hall main desk on entry.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-in fine for the museum itself. Train tickets to Tampere are worth booking a few days ahead for the cheaper fares.",
  },
  suitableAgeRange: { min: 4 },
  childrenNotes:
    "Stroller-accessible throughout, family bathrooms in Tampere Hall, and the five-storey Moominhouse tableau is the bit kids gravitate to first. Appeal scales hard with how much your child already knows the Moomins — a kid who's met the characters via the books or Moomin World will love it, one who hasn't may find the still-life format slow. The €36 family ticket is the deal.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://www.muumimuseo.fi/en/",
  tags: ["museum"],
};

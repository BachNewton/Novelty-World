import type { Idea } from "../types";

export const mutteriKahvila: Idea = {
  slug: "mutteri-kahvila",
  title: "Kahvila Mutteri",
  shortDescription:
    "The tiny nut-shaped wooden kiosk-café at the Lauttasaari end of the bridge — built in 1927 as a Drumsö steam-ferry ticket office, protected by the city plan, and still selling coffee and pastries on the same spot a century later. It's the smallest landmark in Lauttasaari and arguably the most beloved.",
  longDescription: [
    "Kahvila Mutteri is a hand-built wooden kiosk-café that has stood at Lauttasaarentie 2, on the strip of land between the Lauttasaari bridge and the island itself, since 1927. The architect was Bertel Liljequist (1885–1954), better known for the workers' housing he designed for Kone ja Silta and the industrial buildings of interwar Helsinki. The building is shaped like a hex-nut — six wooden walls, a stubby pyramid roof, a door on one face and a serving window on the next. The name (\"mutteri\" = hardware nut in Finnish) is the etymology; locals just call it the little polygon café. Inside it's surprisingly roomy for the footprint — one café-blog described the effect as a TARDIS.",
    "The kiosk sits where the old Drumsö Strandcafé burned down in November 1926. That café had served passengers waiting for the Drumsö steam-ferry, which ran between Lauttasaari and Helsinki proper from 1914 to 1935 — Lauttasaari was a rural island in those years and the ferry was the only way across. The replacement kiosk opened in 1927 and sold what the era needed: \"ferry tickets, pastries, cranberry juice, coffee and tobacco.\" The first bridge to the mainland was built next to Mutteri in 1935, the ferry stopped soon after, and the building's purpose narrowed to just the café — which is what it has been ever since. The Lauttasaari Foundation took ownership in 1945, briefly sold it in 1995 to a senior-services organisation, watched the building decay through the 80s and 90s as the surrounding city grew up around it, and finally restored it to its original 1927 condition in 1998 because the kiosk was protected in the city plan and couldn't be torn down. It is now one of the oldest cafés in Helsinki operating continuously in its original location.",
    "The current operator (since 2012) keeps it as a traditional Finnish café: filter coffee with free refills, korvapuusti (cinnamon buns), pulla, sweet and savoury pastries from the counter, a few daytime savouries — a properly built ham-cheese toast on sourdough with Dijon and arugula is the regular surprise on the menu — plus seasonal pastries and small cakes through the year. Prices are honest: coffee with a refill ~€3, a pastry €4–5, a savoury toast €8–10. The café occasionally hosts small music evenings (\"musiikki-illat\") which fill the room with maybe twenty people and constitute the only time you'd have to plan ahead to get a seat. There is a tiny terrace on the south side for the warmer months and the bridge view; in winter the room glows yellow from the bridge approach and is one of the genuinely cosy spots on the island.",
    "Open Mon–Fri 8:00–17:00, Sat 10:00–18:00, Sun 10:00–17:00. From central Lauttasaari it's a 1–2 minute walk north along Lauttasaarentie from the metro station; bus 21 or 22 from downtown stops right outside. The café is the first thing you reach when you walk onto the island and the last thing when you walk off, which is part of why it's so embedded in everyone's mental map of Lauttasaari. Drop in once for the coffee and the architecture; come back for a cinnamon bun on a winter Saturday and admire the fact that this tiny wooden polygon has outlasted nearly everything else within a kilometre.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kioski-Cafe_Mutteri_Lauttasaarentie_2_-_panoramio.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Mutterikahvila.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Mutterikahvila_in_winter.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Mutterikahvila_in_March.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Mutterikahvila_plaque.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kioski_Lauttasaarentiellä_-_N11718_-_hkm.HKMS000005-km0023s0.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Mon–Fri 8:00–17:00, Sat 10:00–18:00, Sun 10:00–17:00.",
    notes:
      "Year-round. The terrace is the May–September experience; winter is the warm yellow-glow indoor experience. Occasional music evenings book the small room out — check the café's site if you want a specific evening.",
  },
  location: {
    region: ["Helsinki", "Lauttasaari", "Uusimaa"],
    address: "Lauttasaarentie 2, 00200 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~5 min walk",
    notes:
      "Same island. ~2-min walk north from Lauttasaari metro station along Lauttasaarentie to the bridge — the kiosk sits at the very start of the island where Lauttasaarentie meets the bridge. Bus 21 or 22 from downtown stops directly outside.",
  },
  cost: {
    perPersonEur: 8,
    notes:
      "Coffee with free refills ~€3; pastries (korvapuusti, pulla, cakes) €4–5; savoury toast ~€8–10. A coffee-and-bun stop runs €6–8; a longer sit with a toast and refills €10–12.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-in. No reservations except for the occasional music evening, which is announced on the café's website and Facebook.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Family-friendly daytime café — the room is small but kids are welcome, and there's pulla and juice for the under-5 set. No high chairs guaranteed; stroller access is fine but the doorway is narrow. The terrace in summer is the easy choice with a buggy.",
  indoorOutdoor: "mixed",
  physicalIntensity: "low",
  duration: "<1h",
  website: "https://www.kahvilamutteri.com/",
  tags: ["food", "café", "historical", "landmark"],
};

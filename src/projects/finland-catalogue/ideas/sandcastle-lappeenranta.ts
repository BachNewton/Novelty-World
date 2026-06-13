import type { Idea } from "../types";

export const sandcastleLappeenranta: Idea = {
  slug: "sandcastle-lappeenranta",
  title: "Lappeenranta Sandcastle (Hiekkalinna)",
  shortDescription:
    "Three million kilos of sand sculpted into the largest sandcastle in the Nordics, on the harbour of Lake Saimaa — a different theme every summer, free to walk through, with a bouncy-castle and carousel midway behind it for the kids.",
  longDescription: [
    "Lappeenranta's Hiekkalinna has been built every summer since 2004 in the city's old harbour at the southern end of Lake Saimaa. About three million kilograms of sand are packed into plywood moulds, watered, compacted, then carved top-down by a team of sand sculptors over six weeks in May and early June. The whole structure goes up around a different theme each year — past years have given dinosaurs, the Wild West with a giant steam locomotive, an outer-space castle complete with ET and Darth Vader, and the 2025 \"Lappeenranta — Heart of Lake Saimaa\" lake-life theme. The same sand is reused every year; come autumn it gets watered down, blanket-covered, and saved for next summer's build.",
    "It is genuinely large — a multi-tower castle with carved figures, scenes, and animals worked into the walls and surrounding sandscape, easily ten metres tall at the peaks. Around 100,000–150,000 visitors come through each year, mostly Finnish families on summer road trips and Russian-border day-trippers in normal years. The whole site is free to walk through, no ticket, no queue. You can climb on parts of the structure (the official ones, marked) and there's a fish-and-chips kiosk, an ice-cream stand, and a Fazer candy shop on the harbour boardwalk.",
    "Behind the castle the harbour park does the rest of the family-day work: a bouncy-castle inflatables area, a giant trampoline, a carousel, and a small train that loops the harbour. None of it is theme-park-priced — these are the cheap-ride summer-fair sort of operators, a couple of euros a go. The harbour quay also rents bikes, kayaks, canoes, and SUP boards for the lake, and a 40-minute hop-on-hop-off sightseeing bus runs from the sandcastle through the old town and the Lappeenranta fortress on the hill above. Open daily 10:00–21:00 through the summer; the castle is best in the long evening light from 18:00 onward.",
    "From Helsinki it's a manageable day trip. Direct VR InterCity trains run Helsinki Central to Lappeenranta in just over two hours; from Lappeenranta station it's a flat 15-minute walk down through the old town to the harbour and the sandcastle. The 2026 season runs from Saturday 6 June through 31 August. Combine the sandcastle with a Saimaa lake cruise (the Camilla and other harbour boats run scheduled scenic loops) and a walk up to Lappeenranta Fortress for the half-day version of the trip; add a visit to the Saimaa Canal sluices for a full day.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Lappeenranta,_Finland_-_panoramio_(13).jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Lappeenranta,_Finland_-_panoramio_(10).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Lappeenranta,_Finland_-_panoramio_(11).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Fish_sand_sculpture.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Sandy_horses_-_panoramio.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Lappenranta_sandfigures_-_panoramio.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Lappeenranta,_Finland_-_panoramio_(8).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kiipeilyrata_Lappeenranta.JPG",
  ],
  availability: {
    suitableMonths: [6, 7, 8],
    weeklySchedule: "Daily 10:00–21:00 during the summer season.",
    events: [{ from: "06-06", to: "08-31", name: "Sandcastle of Lappeenranta" }],
    notes:
      "Open early June through end of August only; outside that window the harbour is open but the castle isn't built yet (May) or has been wound down (Sept). 2026 season: 6 Jun – 31 Aug. Long evening light from 18:00–21:00 is the photographic peak; midday weekends are the busiest.",
  },
  location: {
    region: ["Lappeenranta", "Lakeland"],
    address: "Satamatie 11, 53900 Lappeenranta",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~2h 30m each way",
    notes:
      "M1/M2 metro from Lauttasaari to Helsinki Central (~6 min), then VR InterCity train Helsinki ↔ Lappeenranta (~2h 5m, 8–10 services per day), then a flat 15-min walk through the old town down to the harbour. One train, no transfers — easy day trip.",
  },
  cost: {
    perPersonEur: 0,
    notes:
      "Sandcastle area itself is free. Carousel, bouncy castles, trampoline, train rides each ~€3–5 a go. Bike or SUP rental ~€15–25/day. 40-min sightseeing bus ~€15. Round-trip VR train Helsinki ↔ Lappeenranta ~€40–80 depending on how far ahead you book.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "No booking for the sandcastle. VR train tickets are cheaper a few days ahead than at the kiosk. SUP/kayak rental fine to walk up to in the morning, busy weekends sometimes book out by midday.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Sweet-spot ages 2–10. Strollers fine — the harbour is paved and flat. Bouncy castles and the carousel target the under-8 crowd directly; older kids gravitate to the SUP/kayak rentals on the harbour. Bring sunscreen and hats — the harbour is open and hot in July.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://www.visitlappeenranta.fi/en/Experience/Sandcastle",
  tags: ["landmark"],
};

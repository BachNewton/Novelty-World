import type { Idea } from "../types";

export const uivaFlytande: Idea = {
  slug: "uiva-flytande",
  title: "Uiva Flytande – Helsinki Boat-Afloat Show",
  shortDescription:
    "The largest in-water boat show in the Nordics — nearly 300 boats moored at HSK yacht club in Lauttasaari for four days each August, plus 3,000 m² of land-based exhibits and food trucks on the quay.",
  longDescription: [
    "Uiva Flytande (\"Floating\" in Finnish/Swedish) is the Helsinki Boat-Afloat Show, organised every August by Finnboat — the Finnish Marine Industries Federation — at the Helsingfors Segelklubb (HSK) yacht club marina on the eastern shore of Lauttasaari. HSK is one of Finland's oldest sailing clubs, founded in 1899, and the harbour has hosted the show since 1980. The 2026 edition is the 14th to use the Uiva Flytande branding and runs Thu–Sun, 13–16 August.",
    "The pitch is simple: instead of looking at boats parked on land in a convention centre, you walk the floating pontoons and step aboard nearly 300 boats actually in the water — 5–7 m motorboats (the dominant Finnish category), bigger cabin cruisers, sailboats, RIBs, fishing boats, catamarans. About 30 of those are Nordic premieres each year. On shore, 3,000 m² of land-based stands cover engines, electronics, trailers, marine clothing, and brokerage services, plus a row of food trucks, a café tent, and a small stage for product talks and family activities.",
    "Even if you have zero intention of buying a boat, it's a satisfying afternoon — the marina setting is genuinely beautiful, the boats range from approachable runabouts up to half-million-euro yachts you can climb on, and Finnish boating culture is on full display (this is a country with one of the highest boats-per-capita ratios in the world). Allow two to three hours; longer if you actually want to sea-trial something.",
    "Adults €14 online (€18 at the gate), kids 7–15 €5 online (€8 gate), under-7 free. Tickets go on sale in May. From central Lauttasaari, walk down to Vattuniemi (~25 min) or catch the free shuttle bus that runs every 20 min from outside Lauttis shopping centre — it drops you at the gate. Driving is awkward; the lot fills early and costs €10/day.",
  ],
  thumbnailUrl: "https://uiva.fi/wp-content/uploads/2025/08/Uiva36-1024x576.jpg",
  galleryUrls: [
    "https://uiva.fi/wp-content/uploads/2025/08/Uiva94-1024x576.jpg",
    "https://uiva.fi/wp-content/uploads/2025/08/Uiva42-1024x683.jpg",
    "https://uiva.fi/wp-content/uploads/2025/08/Uiva91-1024x577.jpg",
    "https://uiva.fi/wp-content/uploads/2025/08/Uiva29-1024x576.jpg",
    "https://uiva.fi/wp-content/uploads/2025/06/Uiva5-1024x576.jpg",
    "https://uiva.fi/wp-content/uploads/2025/08/Uiva6-1024x579.jpg",
  ],
  availability: {
    suitableMonths: [8],
    events: [
      {
        from: "08-13",
        to: "08-16",
        name: "Uiva Flytande – Helsinki Boat-Afloat Show",
      },
    ],
    weeklySchedule: "Thu–Sat 11:00–19:00, Sun 11:00–18:00",
    notes:
      "Four-day annual event in mid-August. Exact weekend shifts a day or two each year — check uiva.fi before locking in plans around it.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "HSK Yacht Club, Vattuniemen puistotie 1, 00210 Helsinki (Lauttasaari)",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~10–25 min",
    notes:
      "On the same island. From Lauttasaari metro station, hop on the free event shuttle bus from outside Lauttis shopping centre (~10 min, runs every 20 min while the show is open) or walk south down to Vattuniemi (~25 min). Bus 21 also serves the area.",
  },
  cost: {
    perPersonEur: 14,
    notes:
      "Adults €14 online / €18 at the gate. Kids 7–15 €5 online / €8 gate. Under-7 free with a parent. VIP ticket €50 (online only) adds a lounge tent with refreshments. E-tickets carry a small Floud delivery fee.",
  },
  booking: {
    leadTime: "few-days",
    notes:
      "Buy online for the discount and to skip the gate queue. Tickets open in May. No need to book months ahead.",
  },
  suitableAgeRange: { min: 4 },
  childrenNotes:
    "Family activities run on the land area each day — face painting, kid-sized RIB rides in past years. Pontoons are floating planks above open water; keep small kids close. Strollers fit but the gangway joints are bumpy.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://uiva.fi/en/",
  tags: ["nautical"],
};

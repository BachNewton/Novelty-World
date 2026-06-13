import type { Idea } from "../types";

export const skipperi: Idea = {
  slug: "skipperi",
  title: "Helsinki Archipelago by Boat (Skipperi)",
  shortDescription:
    "Skipperi runs the Nordics' biggest boat-sharing platform: a Fleet membership lets you reserve a fully-equipped motorboat from a Helsinki harbour app-and-go style, and the peer-to-peer Rent side lets you book a private owner's sailboat for the day.",
  longDescription: [
    "Helsinki sits at the head of an archipelago of more than 300 islands and 130 km of shoreline — and most of it is invisible from land. Renting or chartering a boat is the way out, but full ownership is overkill for a holiday. Skipperi (founded in Helsinki, 2015) is the practical answer: a tech-led boat-sharing platform that runs two parallel products under one app — a Fleet subscription (their own equipped motorboats) and Rent (peer-to-peer access to private owners' boats, including sailboats).",
    "Skipperi Fleet works like a car-share for boats. Pay a monthly or season subscription, then reserve any of the Fleet motorboats at any harbour through the app — show up, the boat is fueled and prepped, you take it out for the booked window, return it to the same berth. Maintenance, insurance, lifejackets, and the chartplotter are all included; you only pay for fuel. Helsinki-area Fleet harbours include Lauttasaari, Vuosaari, Hanasaari, and a handful of mainland and island bases that put you 10–30 minutes from Suomenlinna, Pihlajasaari, or the open archipelago east toward Porvoo. Pricing tiers run from a weekday-only month to a full-season pass; expect roughly €300–500 per month depending on tier (current pricing on the site — they also do trial weeks).",
    "Skipperi Rent is the Airbnb-style side: private owners list their boats — sailboats, ribs, day cruisers, the occasional bigger yacht — and you book by the day or weekend through the app, with insurance and identity verification handled by the platform. This is the route to a sailboat: Fleet doesn't include sailing yachts, but Rent has dozens listed in the Helsinki area, typically €200–400 a day for a 25–35 ft cruiser. The owner usually meets you at the boat for a handover.",
    "Finland doesn't legally require a boat licence for private craft of any size, but Skipperi requires you to pass their own boating exam (free, online + a short practical) before unlocking the Fleet. Allow an evening for the theory and book a practical session at a Helsinki harbour. Once cleared, you're in their global network — your membership also works in Sweden, Norway, Denmark, and a few overseas markets.",
    "Best months are late May through early September — the season Fleet boats are in the water. Plan for the wind: the open archipelago east of Suomenlinna can get choppy in afternoon onshore breezes; sheltered routes through Lauttasaari and Espoo's Suvisaaristo are the right call for first-time outings. Pack lifejackets-for-everyone (the Fleet boats carry them; check before leaving the dock), sunscreen, and warm layers — even a 25°C day on land is 18°C with wind on the water.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Purjehdus_Helsingin_edustalla_1.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Purjehdus_Helsingin_edustalla_2.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Nordic_folkboats_(14775215050).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Strömsinlahden_venesatama_C_IMG_2160.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suomenlinna_mereltä_5.jpg",
  ],
  availability: {
    suitableMonths: [5, 6, 7, 8, 9],
    notes:
      "Fleet boats are in the water roughly 1 May – 30 September; the exact window shifts a week or two with the weather. Mid-June to mid-August is peak — long daylight, warm water — so popular Saturday morning slots get booked a week or two ahead. Outside the season, no boating, just Skipperi Academy theory courses.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Multiple Helsinki-area Fleet harbours (Lauttasaari, Vuosaari, Hanasaari, others). Rent boats listed at private berths across the metro area.",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "0–25 min to a harbour, then on the water",
    notes:
      "The Lauttasaari Fleet harbour is on the same island — a short walk or bus 21 ride from anywhere central in Lauttasaari. Other harbours (Vuosaari, Hanasaari) are reachable by metro or bus, ~25 min away. Once on board you're 10–30 min by boat to Suomenlinna, Pihlajasaari, or the inner archipelago.",
  },
  cost: {
    perPersonEur: 80,
    notes:
      "Highly variable. Fleet membership: ~€300–500/month for full access in season, or pro-rated trial weeks. Rent (peer-to-peer sailboats): ~€200–400/day for a 25–35 ft cruiser, plus fuel. €80 is a per-person estimate assuming 2–4 people split a typical day on a Rent sailboat or share Fleet usage.",
  },
  booking: {
    leadTime: "weeks",
    notes:
      "Book Fleet slots in the app a few days ahead — same-day works on weekdays, weekends fill 1–2 weeks out. Rent sailboats listed by individual owners; popular boats book several weeks ahead for July–August. Skipperi Academy boating exam must be completed before you can take a Fleet boat out — budget an evening plus a short practical session.",
  },
  childrenNotes:
    "Fleet boats carry kid-sized lifejackets but verify before pushing off. Pick a sheltered route (Lauttasaari, Suvisaaristo) for kids under ~8 — open archipelago waves get genuinely uncomfortable. Bring sunscreen and warm layers regardless of the air temperature on land.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "half-day",
  website: "https://www.skipperi.com/",
  tags: ["nautical"],
};

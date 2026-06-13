import type { Idea } from "../types";

export const pihlajasaarenUimaranta: Idea = {
  slug: "pihlajasaaren-uimaranta",
  title: "Pihlajasaaren uimaranta",
  shortDescription:
    "A 10-minute summer ferry from south Helsinki drops you on a twin-island recreation park with the city's longest sandy beach, three free wood-fired cookshacks, a bookable Aalto sauna, a designated unisex naturist beach, and 1880s wooden villas turned into a restaurant.",
  longDescription: [
    "Pihlajasaari (\"Rowan Island\") is a small twin-island archipelago about a kilometre off the south Helsinki shore — Läntinen (Western) and Itäinen (Eastern) Pihlajasaari, joined by a footbridge — and is the most-loved summer beach escape inside the city limits. The 10-minute JT-Line waterbus from Merisatama (in the Eira/Hernesaari district) and Ruoholahti runs daily 16 May – 30 August 2026, weather permitting; on warm Saturdays the boats run nearly continuously, on cold Septembers the season is over.",
    "The city beach itself is on the western island — a several-hundred-metre crescent of fine sand on the south-west shore, shallow water, changing shelters, an outdoor shower, toilets, a beach-volleyball court, a kiosk, and a small playground (no lifeguards). The rest of Läntinen Pihlajasaari is a mix of glaciated rock outcrops perfect for sunbathing, a 1.8-km marked nature trail through pine and birch, three free wood-fired public cookshacks (firewood and drinking water provided), and a handful of restored 1880s–1890s wooden villas. Restaurant Pihlajasaari fills one of them — a summer-only kitchen running Nordic seasonal plates from a terrace right above the harbour.",
    "Cross the bridge to Itäinen Pihlajasaari for the quieter half: a 1-km nature trail, more open rock, weekend camping pitches (the only place inside Helsinki you can legally pitch a tent for the night), and Finland's most accessible designated unisex naturist beach — a small cove screened from the rest of the shore, gender-mixed in contrast to the segregated Seurasaari nudist beach on the other side of the city. The Aalto sauna, an electric sauna for up to six built by architecture students, can be booked through Helsinki's Varaamo system in 2-hour slots through the summer.",
    "The mindset to bring is \"island day-trip with a beach in the middle.\" Buy the round-trip ticket on the boat or online (€9.80 adult, €6.80 child/senior 2026), bring a towel and food (the kiosk is fine but limited; the cookshacks reward people who packed sausages), and pace yourself — there's a six-hour-long version of the day that includes a bridge crossing, a swim, a nature-trail loop, dinner at the restaurant, and the last boat back at sunset. Out of season the island is officially closed; the restaurant, sauna, kiosk, and toilets all shut.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Pihlajasaari_2016.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Pihlajasaari.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Pihlajasaari_sea_view.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Pihlajasaari_bridge.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Pihlajasaari_VillaHallebo.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Itäinen_Pihlajasaari_and_Läntinen_Pihlajasaari_from_Kustaanmiekka_Suomenlinna_2022-09-17_01.jpg",
  ],
  availability: {
    suitableMonths: [5, 6, 7, 8],
    notes:
      "JT-Line ferry runs daily 16 May – 30 August 2026. Outside that window the island is officially closed and the restaurant, sauna, kiosk, and toilets all shut. Mid-June to mid-August is peak — beach packed on warm weekends, ferries running back-to-back. May and late August are quieter and cooler; on a chilly week the boat may not run.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Läntinen Pihlajasaari, 00150 Helsinki (ferry from Merisatama or Ruoholahti)",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~10 min by boat (May–Oct), ~30 min by ferry (Jun–Aug only)",
    notes:
      "By boat from HSK Marina (May–Oct): a ~10-minute direct crossing south to the Pihlajasaari day-trippers' harbour — the fastest and simplest option in season, and the boat season conveniently brackets the island's own May–August public season. Off-season / boatless guests: bus 21 from Lauttasaari to Ruoholahti pier (~10 min), then the 10-minute JT-Line waterbus to Pihlajasaari (~30 min total). Alternative: tram 6 or 6T to Hernesaari/Merisatama and pick up the same waterbus from there. The Ruoholahti pier is closer; Merisatama runs more frequently in peak season. Note JT-Line waterbus runs only May 16 – August 30 — outside that window the island is effectively unreachable without a private boat.",
  },
  cost: {
    perPersonEur: 10,
    notes:
      "Round-trip ferry €9.80 adult, €6.80 child 7–17 / senior, under-7 free. Restaurant Pihlajasaari mains ~€20–32; kiosk snacks €5–10. Aalto sauna ~€60 for a 2-hour slot (split among up to 6 people). Cookshack and beach use free.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Ferry tickets walk-up; no need to book ahead even on warm Saturdays (boats run continuously and JT-Line scales up). Book the Aalto sauna and Restaurant Pihlajasaari a few days to a week ahead in peak summer through Varaamo and the restaurant site respectively.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Properly kid-friendly — shallow sandy beach, playground, easy nature-trail loop, cookshacks for sausage-grilling. The ferry itself is a hit. No lifeguards on the beach, and the cliff-edge sunbathing rocks need supervision with toddlers. Pack everything you'll need; the kiosk is small.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "half-day",
  website: "https://www.jt-line.fi/eng/pihlajasaari/",
  tags: ["nature", "beach", "nautical", "island"],
};

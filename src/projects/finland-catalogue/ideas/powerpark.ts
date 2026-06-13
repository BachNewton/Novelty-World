import type { Idea } from "../types";

export const powerpark: Idea = {
  slug: "powerpark",
  title: "Huvivaltio PowerPark",
  shortDescription:
    "Finland's biggest amusement park by ride count — 40+ rides including six roller coasters (the GCI wooden Thunderbird, the Gerstlauer Junker, and Pitts Special), plus an FIA-grade karting circuit designed by Mika Salo, all parked in the middle of South Ostrobothnia farmland.",
  longDescription: [
    "PowerPark is Finland's largest amusement park by ride count, sat improbably in flat South Ostrobothnia farmland along Highway 19, halfway between Vaasa and Seinäjoki. The rides area opened in 2002 and has grown into a 40-ride compound with six roller coasters, a karting empire, a hotel, cottages, and a campground — closer in feel to a North-American resort park than to the city-bound Linnanmäki and Särkänniemi. For a coaster enthusiast, this is the only park in Finland that warrants a dedicated trip in its own right.",
    "The coaster lineup is the best in Finland. Thunderbird (GCI, 2006) is the wooden out-and-back — 31m drop, lots of airtime, the only modern wooden coaster in Finland. Junker (Gerstlauer Infinity, 2015) is the modern thrill: 32m vertical lift, ~92 km/h, three inversions including a beyond-vertical drop. Pitts Special (Gerstlauer Infinity Custom, 2020) is the launched newcomer — a low-to-the-ground custom layout themed around a stunt biplane, surprisingly intense. Cobra (Vekoma Boomerang, 2005) is the classic shuttle. Joyride is a smaller family-launch coaster. Neo's Twister is a Fabbri spinning mouse. Add the giga-pendulum Typhoon, the Booster (a 60m sky-flip), the Kwai River water-coaster, and a sprawling kids' area, and a full coaster-focused day actually fills.",
    "The karting deserves its own callout. The outdoor Mika Salo Circuit was designed by the Finnish ex-F1 driver and has hosted the Karting World and European Championships; the indoor PowerPark Arena is one of the largest indoor karting halls in Europe. Sessions are bookable separately from the wristband and are absolutely the move for an adult-leaning group. The on-site hotel and cottages let you split rides one day and karting the next without commuting; the harness-racing track and trotting events occasionally take over weekends in summer.",
    "Practical notes. The 2026 ride season is mid-May through August, with daily operations through June and July and weekend-only operations on the shoulders; the season opener is Sat May 9. Standard MAXI wristband (over 130 cm) is ~€46 at the gate, often discounted to ~€32 for early-summer dated tickets bought online. MINI wristband (under 130 cm) is cheaper. The free PowerPark shuttle bus meets every train at Härmä station and runs straight to the gates — no rental car needed. Plan two nights minimum from Helsinki: this is a ~3h train ride each way, and the resort genuinely earns the overnight.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/PowerPark.JPG",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/PowerPark2.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Thunderbird.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Cobra_Powerpark.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/PowerPark_Typhoon.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Booster_in_PowerPark.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/PowerPark_Karting_Track_20200822.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/PowerPark_area.JPG",
  ],
  availability: {
    suitableMonths: [5, 6, 7, 8],
    notes:
      "Rides open mid-May through August (2026 season opener: Sat May 9). Daily operations June–July; weekend-only on the May/August shoulders. Karting and the hotel run year-round. The park is closed entirely in autumn and winter for the rides side.",
  },
  location: {
    region: ["Ostrobothnia"],
    address: "Jorma Lillbackantie 1, 62300 Härmä (Alahärmä, Kauhava)",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~3h 30m one-way",
    notes:
      "Metro M1/M2 to Helsinki Central (~10 min), then VR InterCity train Helsinki–Härmä (~3h, 2 direct trains/day). PowerPark runs a free dedicated shuttle bus from Härmä station straight to the gates that meets every arriving train — no rental car needed. Realistically a 2-night trip from Helsinki given the journey length.",
  },
  cost: {
    perPersonEur: 46,
    notes:
      "MAXI wristband (over 130 cm) ~€46 at the gate, often ~€32 with online dated early-summer tickets. MINI wristband (under 130 cm) cheaper. Karting sessions (Mika Salo outdoor circuit or indoor arena) are extra and bookable separately. Hotel/cottages on-site if you stay overnight. Train Helsinki–Härmä round-trip ~€60–100 depending on advance booking.",
  },
  booking: {
    leadTime: "weeks",
    notes:
      "Wristbands themselves rarely sell out — book online for the discount. The trip needs more advance planning: the Härmä-direct train runs only twice a day, the hotel sells out on big-event weekends, and karting sessions especially during championships need weeks of lead time.",
  },
  suitableAgeRange: { min: 4, max: 16 },
  childrenNotes:
    "Wikipedia notes PowerPark has the largest selection of children's rides of any Finnish park; the under-130cm MINI wristband is cheaper and covers the family rides. Doghill-style attractions and a kids' farm round out the day for the very young. Stroller-friendly across the whole site. Older kids/teens get the most out of the karting circuits — book in advance.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "moderate",
  duration: "multi-day",
  website: "https://www.powerpark.fi/en/",
  tags: ["theme park"],
};

import type { Idea } from "../types";

export const bluePeter: Idea = {
  slug: "blue-peter",
  title: "Ravintola Blue Peter",
  shortDescription:
    "The clubhouse restaurant of Helsingfors Segelklubb on Lauttasaari's southern shore — open year-round to non-members, with a sea-view terrace looking straight out across the marina and a Thursday-night sailing race that finishes at the bar.",
  longDescription: [
    "Blue Peter has run since 1976 as the clubhouse restaurant of Helsingfors Segelklubb (HSK), one of Finland's oldest and largest sailing clubs (founded 1899, here on Lauttasaari since 1959, ~1,600 members and 600 boats today). It sits in the modern HSK clubhouse, completed in 2010 on the eastern side of the southern Lauttasaari shore at Vattuniemen puistotie 1, looking straight out across the harbour at the lines of moored sailboats and, beyond them, the open Gulf of Finland and the Helsinki skyline. Despite the yacht-club setting, it is fully open to walk-in guests year-round — no membership required, no special access — and has been one of the few seaside restaurants in Helsinki that holds onto regulars through the dark months.",
    "The kitchen is unfussy seaside-bistro tilted toward Finnish ingredients and seafood. The signature is the creamy salmon soup with archipelago bread (a €9 starter or generous portion that can stand in as a full lunch). Bistro mains run €19–31 — pike-perch, roasted duck breast, raw-spiced whitefish, burgers, a children's menu, plus a rotating seasonal menu that follows the Finnish calendar (cloudberry desserts, crayfish in late July, Christmas-period buffet). Lunch is served weekdays 11:00–14:00 with salad-bar, bread, and coffee included; dinner runs evenings through to ~21:00. Wine list is good, sommelier-curated, mid-range.",
    "The view is what carries it. Inside, full-height windows wrap the dining room; outside, the terrace sits a few metres above the water with the marina's wooden piers and rigging directly below. On Thursday evenings May through August the HSK Blue Peter Race series sends a fleet of one-design and handicap classes out into the Gulf, and the boats stream back into the harbour from about 19:30 — sit on the terrace with a glass of something cold and watch them come home. The annual HSK Floating Boat Show in late August (the largest in Finland, since 1998) turns the marina into a full waterborne expo for a weekend; the restaurant is busy but worth pushing through.",
    "From central Lauttasaari it's a 15-min walk south down Lauttasaarentie, through Vattuniemi, to the harbour at the southern end of Vattuniemen puistotie. Bus 21 from Lauttasaarentie to Vattuniemenpuisto and a 5-min walk through the marina is the shortcut. By bike, ~5–8 min from anywhere on the island. Address: Vattuniemen puistotie 1, 00210 Helsinki. Booking advised for Fri–Sat dinner and any sunny evening from May through early September; weekday lunches and winter dinners almost always walkable. Boat moorage and pump-out for guests arriving by their own boat.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Restaurant_Blue_Peter_on_a_cloudy_evening_in_October_2025.jpg",
  galleryUrls: [
    "https://bluepeter.fi/wp-content/uploads/2020/06/Blue_Peter-logo.png",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Mon–Fri 11:00–22:00, Sat 12:00–22:00, Sun 12:00–20:00. Lunch served weekdays 11:00–14:00. Kitchen closes ~1h before closing.",
    notes:
      "Year-round but two distinct experiences: summer terrace with the marina view and the Thursday-night Blue Peter sailing race finish (May–Aug ~19:30); winter is a warm, glass-walled dining room with the harbour iced over outside. HSK Floating Boat Show late August.",
  },
  location: {
    region: ["Helsinki", "Lauttasaari", "Uusimaa"],
    address: "Vattuniemen puistotie 1, 00210 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~15–20 min walk",
    notes:
      "Same island. From Lauttasaari metro station, ~15-min walk south down Lauttasaarentie and through Vattuniemi to the marina at the south end of Vattuniemen puistotie. Bus 21 to Vattuniemenpuisto cuts the walk to ~5 min. By bike ~5–8 min. Boat moorage on site for guests arriving by water.",
  },
  cost: {
    perPersonEur: 40,
    notes:
      "Bistro mains €19–31; salmon-soup-as-a-lunch ~€15 incl. salad and bread; full dinner with a glass of wine ~€40–55 per person. Weekday lunch is the value play.",
  },
  booking: {
    leadTime: "few-days",
    notes:
      "1–2 weeks ahead for summer Fri–Sat dinner on the terrace and Thursday-race nights; same-day fine for winter dinners and weekday lunches. The HSK Floating Boat Show weekend (late August) is the one to book a fortnight ahead for.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Family-friendly — children's menu, high chairs, and the marina full of boats is a built-in distraction for kids who lose interest in the meal. Stroller-friendly inside; the terrace has gaps in the railings so keep small kids close on the outdoor side.",
  indoorOutdoor: "mixed",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://bluepeter.fi/en/",
  tags: ["food", "nautical"],
};

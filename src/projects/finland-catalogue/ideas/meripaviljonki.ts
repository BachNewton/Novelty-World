import type { Idea } from "../types";

export const meripaviljonki: Idea = {
  slug: "meripaviljonki",
  title: "Ravintola Meripaviljonki",
  shortDescription:
    "Finland's first floating public building — a glass-walled seafood restaurant on pontoons in Hakaniemi Bay, with a live lobster tank, a terrace that rises and falls with the water, and the city skyline reflecting off the water at sunset.",
  longDescription: [
    "Meripaviljonki opened in 2015 on Säästöpankinranta in Eläintarhanlahti Bay, the inlet that cuts into Helsinki between Hakaniemi and Kaisaniemi. The building, designed by architect Simo Freese, was a decade in zoning purgatory before it was approved — Finland's first floating public building, and a deliberate riff on the form of a flower on the water. The pavilion sits on pontoons that had to be built in two pieces to fit under the Pitkäsilta bridge so they could be towed into place; it rises and falls with the lake-meets-sea water level the bay is famous for, and the entry walkway is wide and stable enough that you don't really notice you're on water until you sit down.",
    "The kitchen is seafood-led — fish, shellfish, and lobster from the restaurant's own live tank are the headline, with seasonal Finnish ingredients (white asparagus in spring, crayfish in late July through August, mushrooms in autumn) running underneath. The menu does keep meat and vegetable mains in rotation but the reason to come is the fish. The lunch buffet (weekdays 11:00–15:00, ~€34.90, around €20 if taken as a starter) is the more accessible price point and a good way to test the kitchen; the multi-course evening menus run €56–60 per person, mains à la carte €28–42. Wine list is large and Finnish-server-helpful. Run by Graniittiravintolat, who own a handful of Helsinki landmarks.",
    "The terrace is the headline of the experience May through September — glass-railed all around, awnings overhead, gas heaters for cool evenings, sun on the deck right through the day, and the Hakaniemi skyline plus the Linnanmäki Ferris wheel directly across the bay. Dogs are welcome on the terrace if they behave. The dining room is a glass box with the same view from the inside, which is the winter version of the experience — particularly good when the bay freezes and you're eating blini or salmon soup looking out across snow-and-ice cover.",
    "Address: Säästöpankinranta 3, 00530 Helsinki (a 5-min walk from Hakaniemi metro station, on the south shore of the bay just past the Paasitorni building). Reservations strongly recommended for dinner, particularly summer Fri–Sat evenings on the terrace which book out 1–2 weeks ahead; weekday lunch is usually walkable. Boat moorage is available on the dock for guests arriving by their own boat.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Restaurant_Meripaviljonki.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/17_Meripaviljonki.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Interior_of_restaurant_Meripaviljonki.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Seafood_buffet_at_restaurant_Meripaviljonki.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Blini_at_restaurant_Meripaviljonki.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/View_of_restaurant_Meripaviljonki_over_frozen_Baltic_Sea.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Pink_Gin_G%26T_at_restaurant_Meripaviljonki.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Lunch Mon–Fri 11:00–15:00; dinner Mon–Sat from 17:00; closed Sundays. Terrace open ~May–Sept, weather permitting.",
    notes:
      "Two distinct experiences: summer terrace (May–Sept) is the showpiece — sunset over the bay, Linnanmäki across the water; winter dining room with blini and salmon soup looking over the frozen bay is the quieter cult favourite.",
  },
  location: {
    region: ["Helsinki", "Hakaniemi", "Uusimaa"],
    address: "Säästöpankinranta 3, 00530 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~15 min",
    notes:
      "M1/M2 metro from Lauttasaari to Hakaniemi (~10 min), then a 5-min walk west along the bay past Paasitorni to the restaurant. Bus 21 from central Lauttasaari to Hakaniemi works equally well. Boat moorage on site for guests arriving by their own boat (small boats only — Pitkäsilta bridge clearance constrains the approach).",
  },
  cost: {
    perPersonEur: 60,
    notes:
      "Lunch buffet ~€35 weekdays; multi-course evening menus €56–60 per person; à la carte mains €28–42; full dinner with wine €70–90 per person. Home-style daily lunch is the cheap entry at ~€14.",
  },
  booking: {
    leadTime: "weeks",
    notes:
      "1–2 weeks ahead for summer Fri–Sat dinner on the terrace; few-days fine for weekday dinner; weekday lunch typically walk-in.",
  },
  childrenNotes:
    "Kids are allowed and the menu has a children's section, but this is a fine-dining seafood restaurant — not the natural family destination. High chairs available on request. The terrace is fully glass-railed; toddlers won't fall in the water but the long evening tempo of the meal isn't built for them.",
  indoorOutdoor: "mixed",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://meripaviljonki.fi/english/",
  tags: ["food", "nautical"],
};

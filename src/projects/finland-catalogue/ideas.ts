import type { Idea } from "./types";

/**
 * Hand-curated travel ideas for Finland. Populate by running the
 * `add-finland-idea` Claude Code skill, which researches each idea on the
 * web and appends a fully-populated entry to this array.
 */
export const IDEAS: Idea[] = [
  {
    slug: "oodi",
    title: "Oodi – Helsinki Central Library",
    shortDescription:
      "A free, world-award-winning library opposite Parliament where the sweeping wooden architecture is as much the draw as the books.",
    longDescription: [
      "Oodi opened on Finland's 101st Independence Day in 2018 as Helsinki's flagship public library and the country's gift to itself for the centenary. Designed by ALA Architects (winners of an open international competition), it sits on Kansalaistori square directly across from Parliament — a deliberate civic statement that public knowledge belongs at the heart of the city. The exterior is a single sweeping curve clad in 33mm Finnish spruce planks that lifts at one end to form a sheltered canopy over the square.",
      "Inside, the three floors each have a distinct character. The ground floor is the loud, social one: a café, event stage, and Kino Regina cinema. The middle floor is for making — Urban Workshop with 3D printers, sewing machines, and laser cutters, plus bookable music studios, gaming rooms, and meeting spaces (all free). The top floor is the showpiece: a vast wave-ceilinged hall punctured by round skylights, called \"book heaven\" by locals, with the open stacks, a children's area, and a balcony that looks out over Parliament and the Helsinki rooftops. Robots ferry returned books up from the basement.",
      "Even if you don't open a single book, it's worth the half-hour visit just for the architecture and the view from the third-floor balcony. The IFLA named Oodi the world's best public library in 2019 and it remains one of the most visited buildings in Helsinki.",
      "Entry is free, no ticket needed — walk straight in. Combine it with Kiasma (modern art museum) and the Helsinki Music Centre next door, all within a five-minute radius. The café opens with the building, so it's also a perfectly good rainy-day work spot.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsingin_keskustakirjasto_Oodi_2022-09-16_08.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Central_Library_Oodi_in_Helsinki,_Finland,_2023_May.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Oodi_book_area.jpeg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/The_double_spiral_staircase_in_Helsinki_Central_Library_Oodi.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Central_Library_Oodi_at_night_in_2018_December.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Interior_of_Oodi_on_an_afternoon_in_March_2025.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule: "Mon–Fri 8:00–21:00, Sat–Sun 10:00–20:00",
      notes:
        "Especially welcome in winter as a warm, free, all-day refuge in the city centre.",
    },
    location: {
      region: "Helsinki",
      address: "Töölönlahdenkatu 4, 00100 Helsinki",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "~5 min walk",
      notes:
        "Directly opposite Helsinki Central Station across Kansalaistori square. Trams 1, 2, 4, 10 (Lasipalatsi) and 3, 5, 6, 7, 9 (Kaivokatu) also stop within a block.",
    },
    cost: {
      perPersonEur: 0,
      notes: "Entry is free. Café and Kino Regina cinema tickets are extra.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "Walk-in. Recording studios, meeting rooms, and 3D-printer slots are also free but need to be reserved online in advance.",
    },
    toddlerFriendly: true,
    toddlerNotes:
      "Dedicated children's section on the third floor with picture books, play areas, and family bathrooms. Stroller-friendly elevators throughout.",
    indoorOutdoor: "indoor",
    physicalIntensity: "low",
    duration: "1-3h",
    website: "https://oodihelsinki.fi/en/",
    tags: [],
  },
];

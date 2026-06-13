import type { Idea } from "../types";

export const kasinonranta: Idea = {
  slug: "kasinonranta",
  title: "Kasinonranta (Lauttasaari Beach)",
  shortDescription:
    "Helsinki's most central proper sand beach — a wide south-facing crescent on Lauttasaari with a beach café in a 1930s pavilion, a pier to jump off, and a children's playground, ten minutes by metro from the city centre.",
  longDescription: [
    "Kasinonranta (\"Casino Beach\", a nod to the 1930s seaside casino-restaurant that once stood here) sits on the south shore of Lauttasaari, a residential island five minutes by metro west of the city centre. It's the larger and livelier of Lauttasaari's two main beaches — a wide arc of soft sand, calm shallow water, a wooden pier with diving steps, and a backdrop of pine woods and rocky outcrops you can scramble up for a view back over the bay. Helsinki city lifeguards staff it during the official swimming season.",
    "On a warm summer Saturday it's the obvious move: families spread blankets and parasols, teenagers cannonball off the pier, kiteboarders launch from the western end (it's one of the better Helsinki spots for it), and the beach volleyball and basketball courts behind the sand run all afternoon. Facilities are unusually complete for a Finnish city beach — proper changing cabins, showers, toilets, a children's playground with a big wooden climbing ship, and a kiosk for ice cream and beach essentials.",
    "Lauttasaaren Paviljonki (also called Kahvila Kasinonranta or \"Kassari\") sits right on the sand — a wood-and-glass pavilion with a terrace facing the water and a fireplace inside for cooler days. The kitchen runs Nordic-leaning lunches and dinners, the terrace is a destination for sundowners on long July evenings, and they extend the season into autumn with covered heated outdoor seating. The Paseo café-sauna nearby serves the cold-water-swim-and-sauna ritual through winter when the beach itself is quiet.",
    "From central Lauttasaari it's a 10-minute walk south to the shore — or hop on bus 21 if you're staying further north on the island. Free entry, free everything except food and drinks at the pavilion.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaari_beach_in_September.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaari_waterfront_trail_near_the_southern_tip_of_the_island_on_an_evening_in_May_2025.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaari_waterfront_trail_on_the_western_shore_of_the_southern_part_of_the_island_on_an_evening_in_May_2025.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaaren_uimaranta_Kasinon_ranta_-_N2228_(hkm.HKMS000005-000001eb).jpg",
  ],
  availability: {
    suitableMonths: [5, 6, 7, 8, 9],
    notes:
      "Beach is at its best mid-June to mid-August, when the Baltic warms to ~18–20°C and the lifeguards are on duty. May and September are still walkable and atmospheric but too cold for most swimmers. Winter sees ice swimmers and the Paseo sauna scene; the Paviljonki café runs reduced hours.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Vattuniemenranta 4, 00210 Helsinki (Lauttasaari)",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~10 min walk",
    notes:
      "Same island. ~10-min walk south through the residential streets from Lauttasaari metro station to the beach, or shorter from the southern half of the island. Bus 21 also serves the area.",
  },
  cost: {
    perPersonEur: 0,
    notes:
      "Free beach access. Showers, changing rooms, and toilets free. Pavilion lunches ~€18–28; coffee + pastry ~€8.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "No booking for the beach. Pavilion takes reservations for dinner — useful on Friday/Saturday evenings June–August.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Properly kid-friendly — gentle shallow water, lifeguards in season, a big wooden climbing-ship playground, and ice cream from the kiosk. Stroller-accessible on the paved approach but the sand is soft.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "half-day",
  website: "https://www.myhelsinki.fi/places/lauttasaari-beach-kasinonranta/",
  tags: ["nature", "beach", "island"],
};

import type { Idea } from "../types";

export const cafetoria: Idea = {
  slug: "cafetoria",
  title: "Cafetoria Café & Shop",
  shortDescription:
    "Finland's second-oldest specialty micro-roastery, founded by a Peruvian-Finnish couple in 2002 and still roasting on a 1970s German Probat — their Runeberginkatu café in a 1925 Art Deco corner serves the full 16-coffee menu and the espresso of someone who places at the national roasting championships.",
  longDescription: [
    "Cafetoria is what happens when a Peruvian agronomist-turned-roaster (Ivan Ore) marries a Finnish coffee professional (Mia Nikander-Ore) and they decide to import beans from his family's region of Peru rather than just drink them. They started roasting in 2002, making Cafetoria the second-oldest still-active micro-roastery in Finland in its current form. More than two decades in, the operation is still small, still family-run, and still pulls beans direct from the same Peruvian cooperatives Ivan started with — a relationship now well over fifteen years old.",
    "The Runeberginkatu café is the public face of the operation. It sits in a 1925 Art Deco corner building in Etu-Töölö, about ten minutes' walk north of Kamppi, and it's the kind of room that rewards staying for two cups: high ceilings, big windows, the murmur of a small international barista team (Spain, Chile, Portugal, the US, Finland), and the bag wall behind the counter showing every coffee they currently roast. The permanent menu runs to sixteen coffees across the full roast spectrum — including, unusually for the third-wave scene, a deliberately well-roasted organic Robusta. Ivan placed second at the 2025 Finnish Roasters Challenge, so the bar is operating at competition-roaster level even on a quiet Tuesday afternoon.",
    "Order whatever filter is brewed that morning — the line-up rotates weekly — or ask the barista to walk you through the espresso menu. Pastries and paninis are solid but secondary; the coffee is the headline, and people come specifically for it. Beans, drip bags, and brewing equipment are sold from the shelves at the back. The roasting itself happens out at their countryside roastery in Lohja on a 1970s Probat UG22 they bought used from Switzerland, but you'll see the freshly-roasted bags on display at the café within days.",
    "Open weekday daytimes (roughly Mon–Fri 08:00–18:00, hours vary slightly week to week — confirm via the website if it matters), generally closed Sundays. Coffee €4–6, pastries €4–6. Walk-in. From Lauttasaari, metro to Kamppi (~3 min), then either a 10-minute walk north up Runeberginkatu or two stops on tram 1 / 2 / 4 to Caloniuksenkatu. Cafetoria also runs a smaller café on the Aalto University campus in Otaniemi, Espoo — same beans, different room — if your day already takes you out that way.",
  ],
  thumbnailUrl:
    "https://cafetoria.fi/wp-content/uploads/2021/08/toolo-slider-1-768x432.png",
  galleryUrls: [
    "https://www.slurp.coffee/wp-content/uploads/2017/06/Cafetoria-Cafe-Team-e1498717391664-602x800.jpg",
    "https://www.slurp.coffee/wp-content/uploads/2017/06/Cafetoria-Probat-Roasting-800x800.jpg",
    "https://www.slurp.coffee/wp-content/uploads/2017/06/Cafetoria-Roasting-Team-800x533.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Roughly Mon–Fri 08:00–18:00, closed Sundays. Saturday hours vary — check cafetoria.fi/en/locations.",
    notes:
      "Year-round, weekday-leaning. Quietest mid-morning and after 14:00. Holiday breaks around Christmas/New Year and Midsummer — the locations page is the canonical schedule.",
  },
  location: {
    region: ["Helsinki", "Töölö", "Uusimaa"],
    address: "Runeberginkatu 31, 00100 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~15 min",
    notes:
      "M1/M2 metro from Lauttasaari to Kamppi (~3 min), then either a 10-min walk north up Runeberginkatu, or 2 stops on tram 1 / 2 / 4 to Caloniuksenkatu and a 2-min walk. Cafetoria sits on the corner of Runeberginkatu and Caloniuksenkatu.",
  },
  cost: {
    perPersonEur: 8,
    notes:
      "Filter coffee €4–5, espresso drinks €4–6, pastries and paninis €4–8. Whole beans €15–25 / 250g if you want to take some home.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-in. No reservations. Tables fill at lunchtime on weekdays — go before 11:30 or after 14:00 for a calm seat.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Stroller-accessible — corner café with ground-floor entry. Quiet, conversational atmosphere; older kids do fine, very young children may find a coffee-focused stop boring after a few minutes. Pastry case usually has something kid-friendly.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "<1h",
  website: "https://cafetoria.fi/en/",
  tags: ["food", "café"],
};

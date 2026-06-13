import type { Idea } from "../types";

export const sparakoff: Idea = {
  slug: "sparakoff",
  title: "SpåraKoff – Helsinki's Pub Tram",
  shortDescription:
    "A bright-red 1959 vintage tram converted into a rolling pub — order a Koff lager at the bar, take a 40-minute loop past the central sights of Helsinki, and watch the city slide by from a tram window.",
  longDescription: [
    "SpåraKoff (the name puns on \"spåra\", Helsinki slang for tram, plus the Sinebrychoff brewery's KOFF brand) launched on Walpurgis Eve 1995 to mark Sinebrychoff's 175th anniversary. It was meant to run for two summers; thirty years later it's still going. Tram number 175 — an HM V model built in 1959 — was stripped out, refitted with a small bar, dark-wood tables and bench seating for 30, and repainted vivid post-box red so it stands out against the city's standard green-and-cream livery. The destination board reads simply \"PUB\".",
    "The 40-minute loop departs from Mikonkatu, just behind Helsinki Central Station, and runs through downtown — past the Cathedral, Senate Square, Market Square, Hakaniemi, the Linnanmäki amusement park, the Opera House, and back through Töölö. You can't get off mid-route; you stay on for the loop, drink a beer, look out the window. The bar pours Koff lager and a few ciders on draft, plus wine and soft drinks; pay-as-you-go on top of the ticket, and there's an onboard toilet.",
    "Tickets €12 adult / €10 with an S-Etukortti / €6 child, paid when boarding (cash or card). Seats can't be reserved, so for a busy summer evening turn up 15 minutes early. The tram runs Fridays and Saturdays from mid-May through end of May, daily Mon–Sat from June through August, then back to Fri/Sat from late August into early September. Departures at 14:00, 15:00, 17:00, 18:00, 19:00, and 20:00 (no Midsummer service). Closed entirely outside this season.",
    "Heads up: as of 2026 the tram has been on a renovation pause and the operator hasn't confirmed a return date. Check raflaamo.fi/en/restaurant/helsinki/sparakoff before showing up. If it's still off-line, the same operator runs charter bookings on other vintage trams via Kaupunkiliikenne — pricier (~€800–1,100 for a 2-hour private tram) but a workable backup if you're set on the experience.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/SpåraKoff_pub_tram_in_Helsinki,_Finland,_2021.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/SpåraKoff_pub_tram_at_Mikonkatu_in_Kluuvi,_Helsinki,_Finland,_2024_July.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Aleksanterinkatu_with_Spårakoff_on_an_evening_in_June_2023.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Spårakoff_interior_1.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Spårakoff_interior_2.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Mannerheimintie_in_Taka-Töölö_in_December_with_Spårakoff.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Spårakoff_arriving_on_Liisankatu_in_June_2024.jpg",
  ],
  availability: {
    suitableMonths: [5, 6, 7, 8, 9],
    weeklySchedule:
      "15–31 May: Fri–Sat. 1 Jun – 30 Aug: Mon–Sat. 31 Aug – 12 Sept: Fri–Sat. Departures at 14:00, 15:00, 17:00, 18:00, 19:00, 20:00. No service during Midsummer (~18–21 Jun).",
    notes:
      "Summer-only — closed October through April. As of 2026 the tram is on a renovation pause; verify the schedule on raflaamo.fi before turning up. Charter on other vintage trams is available year-round through Kaupunkiliikenne if SpåraKoff is still down.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Mikonkatu 17 (Tilausratikan pysäkki), 00100 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~10 min",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), then a 2-min walk from the station's east exit to the dedicated charter-tram stop on Mikonkatu.",
  },
  cost: {
    perPersonEur: 12,
    notes:
      "Adults €12 / €10 with S-Etukortti, kids €6. Drinks paid separately at the onboard bar (~€7 a beer). Cash and card accepted.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "No reservations — first-come, first-served at the stop. Arrive 15 min early on a summer Friday or Saturday evening; weekday early departures are usually walk-on without a wait.",
  },
  childrenNotes:
    "Kids 6+ are technically welcome with a parent and a child ticket, but it's a working bar tram — most groups onboard are drinking, and there's nothing for a child to do for 40 minutes. Skip if you're travelling with kids.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "<1h",
  website: "https://www.raflaamo.fi/en/restaurant/helsinki/sparakoff",
  tags: ["train"],
};

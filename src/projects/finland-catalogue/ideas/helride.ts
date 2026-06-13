import type { Idea } from "../types";

export const helride: Idea = {
  slug: "helride",
  title: "Helride – Helsinki Skateboarding Weekender",
  shortDescription:
    "A free, multi-venue skate festival roving the city for one July weekend — best-trick contests, downhill cash-for-tricks, open rail sessions, and a spectator's window into Helsinki's surprisingly deep skate scene.",
  longDescription: [
    "Helride is the annual flagship of Helsinki skateboarding, organised since 2015 by the volunteer-run HELride Collective. It celebrated its 10-year anniversary in 2025 and has grown from a single-venue contest at Suvilahti DIY into a sprawling Friday-to-Sunday weekender that takes over multiple Helsinki spots — recent editions have stitched together stops at Suvilahti DIY, Ruoholahti, Lasipalatsi square, Mauno Koivisto square, Alppipuisto, and the Micropolis skate plaza in Eläintarha. The 2026 edition runs Friday 3 – Sunday 5 July.",
    "The format is a string of contests and jam sessions rather than one finals-on-Sunday show. Expect best-trick competitions on different obstacles each day, open rail sessions inspired by Suvilahti's late co-founder René, a women and gender minorities cash-for-tricks session, a Nikon-sponsored photography contest running alongside the weekend, and free skate schools (11:00–13:00, all three days) at Micropolis where any kid with a board can join in. Music, gear giveaways, and a Vans unboxing pack out the evenings; the after-parties at Hobo Hotel and Olarin Panimo are part of the programme. The companion downhill longboard race — Koffin Vauhtikisat at Sinebrychoff Park, also catalogued here — usually lands a week or two later in mid-July; many visiting riders stick around for both.",
    "If you've never paid attention to Finnish skating, the weekend doubles as a crash course. Helsinki has been a quietly serious skate city for two decades — the legendary Suvilahti DIY skatepark in Kalasatama (community-built since 2011, visited by Tony Hawk, soon to be demolished by 2026's end as the city builds the Suvilahti Event Hub on top of it) is the spiritual home, but the scene has plenty more: Micropolis Skate Plaza, designed by pro skater Janne Sarrio next to the Töölö rowing stadium and free to use; the indoor Kontula Skeittihalli (Finland's largest, €1 youth / €3.50 adult); and the spotless new Skeittikontti at Korkeasaari Zoo. Helride is the one weekend a year when the whole community converges in public.",
    "Spectating is free at every venue. The simplest plan: pick the contest schedule off helride.fi closer to the weekend, ride the metro to whichever venue is hosting that afternoon, and stay for as long as the energy holds. Suvilahti DIY (Kaasutehtaankatu 1) is a 12-minute metro hop from Lauttasaari and a 10-min walk from Kalasatama metro; Ruoholahti is the next stop along the same line. Bring your own board if you want to drop into the open sessions between contests — locals are welcoming.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/DIY_skatepark_in_Suvilahti,_Helsinki,_Finland,_2022_October.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suvilahti_DIY_Skatepark_ja_tornitalot_Kalasatamassa_2022_(202311;%2BG71901).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suvilahti_DIY_skatepark_in_Kalasatama,_Sörnäinen,_Helsinki,_Finland,_2021_June.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suvilahti_DIY_skatepark_in_Kalasatama,_Sörnäinen,_Helsinki,_Finland,_2021_June_-_2.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suvilahti_DIY_skatepark_in_Kalasatama,_Sörnäinen,_Helsinki,_Finland,_2021_June_-_3.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Skatepark_in_Suvilahti,_Helsinki,_Finland,_2018.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Spray_can_in_Suvilahti_DIY_skatepark_in_Kalasatama,_Sörnäinen,_Helsinki,_Finland,_2021_June.jpg",
  ],
  availability: {
    suitableMonths: [7],
    events: [
      {
        from: "07-03",
        to: "07-05",
        name: "Helride",
      },
    ],
    weeklySchedule:
      "Fri–Sun, contest sessions typically run 12:00–18:00 with after-parties most evenings. Schedule shifts venue by venue — check helride.fi the week of.",
    notes:
      "Annual late-June / early-July festival; exact weekend shifts a day or two each year. Outdoor only — a rainy weekend can scramble the schedule.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address:
      "Multi-venue across Helsinki. Suvilahti DIY anchor: Kaasutehtaankatu 1, 00540 Helsinki. Other recent stops include Micropolis (Eläintarha), Ruoholahti, Lasipalatsi square, and Mauno Koivisto square.",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~15–20 min to the central venues",
    notes:
      "Suvilahti DIY: metro from Lauttasaari east to Kalasatama (~12 min direct on the M1/M2 line), then a 10-min walk south past the gas tower. Ruoholahti is the next metro stop east of Lauttasaari (~3 min). Lasipalatsi/Mauno Koivisto are central — metro to Kamppi or Helsinki Central. Micropolis is a tram 9 ride from the Central Station.",
  },
  cost: {
    perPersonEur: 0,
    notes:
      "Free to watch every contest and session. After-party tickets at Hobo Hotel / Olarin Panimo €10–20 if you want the evening programme. Bring some cash if you want to enter the cash-for-tricks sessions yourself.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "No booking needed for spectating — just show up. The free skate schools at Micropolis sometimes ask for a quick on-the-day signup if numbers fill.",
  },
  suitableAgeRange: { min: 8 },
  childrenNotes:
    "Free skate schools at Micropolis run 11:00–13:00 on all three days and welcome kids who can already stand on a board. The contest sites get loud and crowded; the open jam sessions at Suvilahti DIY between contests are the gentler window for kids on their own boards.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "low",
  duration: "half-day",
  website: "https://www.helride.fi/helride-event",
  tags: [],
};

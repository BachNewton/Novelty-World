import type { Idea } from "../types";

export const loylykonttiSornainen: Idea = {
  slug: "loylykontti-sornainen",
  title: "Löylykontti Sörnäinen",
  shortDescription:
    "A two-container shipping-container sauna dropped on the Sörnäinen waterfront — book online, get a door code, let yourself in for two hours of 80–90°C löyly with floor-to-ceiling sea views and a heated ladder straight into the Baltic for the cold-plunge half of the ritual.",
  longDescription: [
    "Löylykontti (\"löyly container\") is the unstaffed-container model of public sauna that has quietly become one of Helsinki's most accessible introductions to the löyly-and-ice-water ritual. The Sörnäinen branch — opened on Christmas Eve 2024 — sits on the waterfront promenade in Suvilahti, the cultural-industrial district one metro stop east of Hakaniemi, and consists of two ten-person wooden saunas (named Meri, \"sea,\" and Suvi, \"summer\") built into modified shipping containers with floor-to-ceiling glass facing the Baltic. Electric stoves under a generous mass of stones produce the soft, humid steam Finns associate with wood-fired heat, and the door opens directly onto a heated ladder into the sea — open all year, with a maintained avanto (ice hole) through the winter for proper avantouinti.",
    "The format is the appeal. You book a 2-hour slot online (loylykontti.fi), receive a door code 10 minutes before your start time, and let yourself in. There's no reception, no membership, no waiting in line; the door code expires at the end of your slot, the next group's code starts. Inside the container is the sauna, a small dressing room, indoor showers, and the sea ladder; outside is the promenade, the gym Rautaranta, the padel courts at Pro Padel Sörnäinen, and the seafood restaurant La Terrasse. The whole complex was built into the working waterfront, not on top of it — you can walk past joggers, dog-walkers, and Suvilahti food-truck nights on the way in.",
    "Pricing depends on whether you book the whole container or a public mixed session. A private 2-hour container booking is roughly €25–35 depending on weekday vs weekend; public sessions (when offered) run €7–12 a head. Swimsuits are mandatory in mixed public sessions; private bookings run by your group's preference. The walk-in option is genuinely cheaper than Allas or Löyly by half on a weekday — the trade-off is you're getting a clean, well-built but small container, not a destination spa with a restaurant and a sun deck.",
    "Open 06:00–24:00 daily; full availability is on the booking calendar at the website. From Lauttasaari, M1 or M2 metro to Sörnäinen (~12 min) or Hakaniemi (~10 min), then a 5–8 minute walk along the seafront promenade. Bring your own swimsuit, towel, and a flip-flop or sandal for the walk to the sea ladder; everything else is provided. Pair with a meal at La Terrasse or a craft beer at one of the Suvilahti microbreweries afterwards — the Kallio district is a 10-minute walk inland and runs the densest restaurant strip in eastern Helsinki.",
  ],
  thumbnailUrl:
    "https://d4erwbryg41cq.cloudfront.net/saunaimage-89-1.jpg",
  galleryUrls: [
    "https://i.media.fi/incoming/sno9l/10553016.jpg/alternates/FREE_1440/10553016.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Suvilahti_in_Helsinki,_Finland,_2024_January.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kalasatama_high-rises_seen_from_Suvilahti_in_Helsinki,_Finland,_2020_November.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule: "Daily 06:00–24:00. Bookable in 2-hour slots via loylykontti.fi.",
    notes:
      "Year-round. Especially memorable December–March when the avanto is cut and you can do the full sauna-plunge-sauna cycle. Quietest mid-day weekdays; weekend slots book out 1–3 weeks ahead.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Sörnäisten Rantapromenadi, 00530 Helsinki (Suvilahti waterfront)",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~25 min",
    notes:
      "M1 or M2 metro from Lauttasaari to Sörnäinen (~12 min), then a 5–8 min walk south along Sörnäisten rantatie / rantapromenadi to the seafront. Alternative: get off at Hakaniemi (~10 min) for a slightly longer waterfront walk. The container is on the promenade next to Rautaranta gym and the padel courts.",
  },
  cost: {
    perPersonEur: 15,
    notes:
      "Private 2-hour container bookings €25–35 depending on weekday vs weekend (split across your group). Public mixed sessions €7–12 per person when available. No towel/swimsuit rental — bring your own.",
  },
  booking: {
    leadTime: "weeks",
    notes:
      "Online-only via loylykontti.fi. Weekday slots usually available a few days ahead; popular Friday and Saturday evening slots book out 1–3 weeks ahead in winter. Door code arrives 10 minutes before your slot.",
  },
  childrenNotes:
    "Adult-oriented unstaffed sauna without a lifeguard or attendant; the cold sea ladder and 80–90°C heat make this unsuitable for young children. Older teens comfortable with the sauna ritual are fine in a private booking with parents. Public mixed sessions: swimsuits required, no nudity, but the format still works better for adults.",
  indoorOutdoor: "mixed",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://www.loylykontti.fi/en/saunas/helsinki/sornainen",
  tags: ["sauna"],
};

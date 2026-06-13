import type { Idea } from "../types";

export const helsinkiTramMuseum: Idea = {
  slug: "helsinki-tram-museum",
  title: "Helsinki Tram Museum (Ratikkamuseo)",
  shortDescription:
    "A free museum tucked inside Helsinki's oldest tram depot — six vintage tram cars from a horse-drawn 1890s wagon to a 1941 motorman's car you can climb into and \"drive\" through four eras of city history.",
  longDescription: [
    "The Helsinki Tram Museum (Ratikkamuseo) sits inside the city's oldest surviving tram depot, a Valdemar Aspelin–designed building completed in 1900 on Töölönkatu in Töölö. Before electrification the site held the horse stables, wagon shed, and saddle workshop for the horse-drawn tram service; once the network electrified that same year the building was rebuilt as a working depot, and trams rolled in and out of those wide doors for nearly a century. The museum has been here since 1993 and the visitor experience was completely redone for a March 2022 reopening — the depot bones are untouched but everything around them is current.",
    "Inside, six historic tram cars line up under iron roof beams. The oldest is a horse-drawn car from the 1890s; the rarest is a German Kummer motorised car built in 1900–1901, from the very first generation of electric trams to run in Helsinki. There's an open-back summer car last used at the 1952 Helsinki Olympics, an American J.G. Brill, a Swedish ASEA, and an HKL workhorse from the post-war decades. The story is told from a passenger's-eye view — fares, route maps, conductors' uniforms, the slang the trams generated (the word \"spåra\" being the most enduring) — rather than as an engineering catalogue.",
    "The crowd-pleaser is the Sisulaattori, a driver's-cab simulator built inside a real motorised tram that worked Helsinki streets from 1941 to 1979. You take the controls and \"drive\" the same route through four historical eras — wartime blackout, 1950s post-war boom, late-Soviet 1970s, present day — with screens replacing the windows so the streetscape changes around you. Kids tend to do every era twice. The rest of the museum is interactive in a lighter way: walk-on platforms inside the older cars, archive photo touchscreens, hands-on bits for younger visitors.",
    "Practicalities: free entry, open Mon–Sun 11:00–17:00 year-round (closed May 1, Dec 6, Dec 24–25, and Jan 1). Allow 60–90 minutes; with kids and a couple of laps in the simulator, two hours. The depot is part of the Korjaamo Culture Factory complex (\"korjaamo\" means \"repair shop\" — a nod to the building's working past), so there's a café, bookshop, and changing programme of theatre and music in the same yard if you want to linger. Run by Helsinki City Museum, so the curation matches the standard you'd expect from a city institution rather than a fan-run hobby site.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Ratikkamuseo_2025-9-Marit_Henriksson.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_tram_museum_interior.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_tram_museum_Horse_tram.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/J.G.Brill_%26_Co_tram_in_Helsinki.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Asea_tram_19_in_Helsinki.JPG",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Ratikkamuseo_-_HKL_169_01.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Sp%C3%A5ramuseet,_Helsinki,_20250201_-_05.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule: "Mon–Sun 11:00–17:00",
    notes:
      "Closed May 1 (Vappu), Dec 6 (Independence Day), Dec 24–25, and Jan 1.",
  },
  location: {
    region: ["Helsinki", "Töölö", "Uusimaa"],
    address: "Töölönkatu 51 A, 00250 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~25 min",
    notes:
      "M1/M2 metro from Lauttasaari to Helsinki Central (~6 min), then tram 4 or 10 northbound on Mannerheimintie to Töölön halli (~5 min) and a 3-min walk west to Töölönkatu. Bus 21 from Lauttasaari into central Helsinki also passes within ~10 min walk if you'd rather skip the metro/tram transfer.",
  },
  cost: {
    perPersonEur: 0,
    notes:
      "Free entry. Korjaamo café on-site if you want a coffee or lunch (~€8–15).",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-in only. Guided tours are bookable separately via the Helsinki City Museum site.",
  },
  suitableAgeRange: { min: 2 },
  childrenNotes:
    "Strong kid appeal — the Sisulaattori simulator is the headline, and several of the trams are walk-on. Step-free access throughout, stroller-friendly, accessible toilet. No high chairs in the museum itself but the Korjaamo café in the same building has them.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://trammuseum.fi/",
  tags: ["museum", "historical", "train"],
};

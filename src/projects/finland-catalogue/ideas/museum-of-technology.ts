import type { Idea } from "../types";

export const museumOfTechnology: Idea = {
  slug: "museum-of-technology",
  title: "Museum of Technology (Tekniikan museo)",
  shortDescription:
    "Finland's only general technology museum, set in the red-brick filter halls of Helsinki's first municipal waterworks on the island where Gustav Vasa founded the city in 1550 — ESKO (the first Finnish-built computer), early Nokia handsets, telephone exchanges, and a hands-on invention lab for kids.",
  longDescription: [
    "The Museum of Technology (Tekniikan museo) is Finland's only general-purpose technology museum and sits on Kuninkaankartanonsaari (\"King's Manor Island\") in Vanhakaupunki — the riverbank spot where King Gustav Vasa founded Helsinki by royal decree in 1550 before the city was moved to its current location 90 years later. Founded in 1969 as Helsinki was decommissioning the surrounding waterworks, the museum took over a striking ensemble of decommissioned filter halls: a circular open-filter basin from 1876, the rapid-filter hall from 1909 (restored to its 1920s appearance), and the long red-brick filter halls built between 1897 and 1951. The buildings were placed under heritage protection and are themselves a major part of the visit — Finnish industrial architecture as a continuous fifty-year experiment in brick.",
    "The headline exhibition TechLand (running through 2027) traces Finland's hundred-year journey from a poor agrarian periphery to one of the most digitally connected societies on the planet. Highlights include ESKO (Electronic Stored Computing Operator), the first computer built in Finland and switched on in 1960; the original telephone exchanges that wired the country in the 1920s; early Nokia mobile handsets from the era when the company was still primarily a rubber-and-cable conglomerate; paper-mill and forestry machinery; and a teletext module that quietly defined how a generation of Finns got their news. The Ghost and the Invention Device, a parallel exhibition running through 2027, is the kids' wing — interactive flap-and-pull stations, a build-it-yourself contraption table, and small craft workshops on weekends.",
    "Two hours is the right plan for adults; three hours with curious kids who actually use the hands-on stations. A small museum café (Helsinge) sits in the old power station opposite, and the Vanhankaupunginkoski waterfall and rapids are a 5-minute walk along the riverbank — the reason the waterworks were sited here in the first place, and a worthwhile add-on in any season.",
    "Adult €15, children 7–17 €7, under-7 free, family ticket (2 adults + 3 children) €32, concessions (students/seniors/unemployed) €7. Museum Card holders free. Thursdays are Pay What You Want Day. Open Tue–Sun: Tue & Fri 11–17, Wed–Thu 11–20, Sat 11–18, Sun 11–17; closed Mondays. From Lauttasaari, take the metro to Hakaniemi (~7 min) and bus 71 north to the Annala / Vanhankaupunginkoski stop (~15 min), then walk 5 min across the bridge — about 45 min door to door.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tekniikan_museo_2017-09-30.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tekniikan_museo_2016-01-31.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tekniikan_museo,_entrance.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tekniikan_museon_punatiilihalli_2020-07-12_1.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tekniikan_museon_punatiilihalli_2020-07-12_2.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tekniikan_museo_2020-07-12_1.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tekniikan_museo_-_Marit_Henriksson.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Vanhakaupunki_-_panoramio_-_jampe_(1).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Teletext_module_Museum_of_Technology.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Tue 11:00–17:00, Wed–Thu 11:00–20:00, Fri 11:00–17:00, Sat 11:00–18:00, Sun 11:00–17:00. Closed Mondays.",
    notes:
      "Year-round. Thursdays are Pay What You Want and the busiest day; Tue/Fri mornings and Sun afternoons are the quietest. Combine with a 5-minute riverside walk to the Vanhankaupunginkoski waterfall — particularly worth the detour in spring runoff and autumn ruska.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Viikintie 1, 00560 Helsinki (Kuninkaankartanonsaari, Vanhakaupunki)",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~45 min",
    notes:
      "Metro from Lauttasaari to Hakaniemi (~7 min, M1/M2), then bus 71 north to the Annala / Vanhankaupunginkoski stop (~15 min), then a 5-minute walk across the bridge to the museum island. Alternative: any tram into the city, then bus 71 from Hakaniemi.",
  },
  cost: {
    perPersonEur: 15,
    notes:
      "Adult €15, children 7–17 €7, under-7 free, concessions €7, family (2+3) €32. Museum Card holders free. Thursdays are Pay What You Want.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "Walk-in fine. Online booking available but rarely needed except for school groups and birthday-party slots.",
  },
  suitableAgeRange: { min: 4 },
  childrenNotes:
    "The Ghost and the Invention Device exhibition is purpose-built for kids 4–12 with hands-on stations, interactive flaps, and weekend craft workshops. The main TechLand floor is more text-heavy but has enough machines and screens to keep older children (7+) engaged. Stroller-accessible throughout — lifts to all floors. Family ticket €32 makes a half-day visit cheap.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://www.tekniikanmuseo.fi/en/",
  tags: ["museum", "historical"],
};

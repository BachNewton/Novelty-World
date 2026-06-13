import type { Idea } from "../types";

export const helsinkiCathedral: Idea = {
  slug: "helsinki-cathedral",
  title: "Helsinki Cathedral",
  shortDescription:
    "The white-and-green neoclassical cathedral on Senate Square — Carl Ludvig Engel's 1852 masterpiece, free to enter, and the postcard image of Helsinki.",
  longDescription: [
    "Helsinki Cathedral (Helsingin tuomiokirkko) is the Lutheran centrepiece of Senate Square, designed by Carl Ludvig Engel as part of his master plan for the city's neoclassical centre. Construction ran from 1830 to 1852 — Engel didn't live to see it finished, and his successor Ernst Lohrmann added the four small corner domes and the rooftop statues of the Twelve Apostles, cast in zinc in Berlin in the 1840s. Until Finnish independence in 1917 it was called St Nicholas's Church, named after the Russian tsar.",
    "The exterior is the icon — chalk-white, mounted on a tall flight of granite steps, with a single soaring green dome — and is the postcard image of Helsinki. The interior, by contrast, is famously plain: white walls, a modest organ, von Neff's altarpiece of the Deposition, and statues of Martin Luther, Philipp Melanchthon, and Mikael Agricola. The austerity is deliberate Lutheran taste; if you came for gilded icons or saints' chapels, you'll prefer Uspenski Cathedral on the harbour ridge five minutes away.",
    "Entry is free — there's a suggested donation (€5 winter, €8 summer) but no ticket. The cathedral is a working church, so services and concerts can close it to tourists; check the website if your visit is tight. Climb the steps even if you skip the interior — the view back down Senate Square is one of the great urban set-pieces in Northern Europe.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Lutheran_Cathedral_Helsinki_edit.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Cathedral,_1852_(15)_(36294114320).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Cathedral_John_the_Evangelist.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Philip_the_Apostle_Helsinki_Cathedral.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Interior_of_the_Helsinki_Cathedral.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Lascar_Suurkirkko_(Helsinki_Cathedral)_(4548657637).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Senaatintori_(Helsinki_Senate_Square)_elokuussa_2018_02.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Sofiankatu_lumisateessa.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Daily ~9:00–18:00 (extended evening hours in summer). Hours vary; services and concerts can close it to visitors.",
    notes:
      "It's a working Lutheran church — Sunday morning services, weddings, and concerts close it to general entry. Check the official site if timing matters.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Unioninkatu 29, 00170 Helsinki (Senate Square)",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~15 min",
    notes:
      "Metro from Lauttasaari to Helsinki Central (~6 min), then a 5-min walk up Aleksanterinkatu to Senate Square. Walk up the granite steps from the south side of the square.",
  },
  cost: {
    perPersonEur: 0,
    notes: "Free entry. Suggested donation €5 in winter, €8 in summer.",
  },
  booking: {
    leadTime: "same-day",
    notes: "Walk-in. No tickets required.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "Stroller-accessible via the side ramp on the north side (the front steps are a workout). Quiet inside — a working church, not a play space.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "<1h",
  website: "https://www.helsingintuomiokirkko.fi/en/",
  tags: ["church", "landmark", "historical"],
};

import type { Idea } from "../types";

export const helsinkiCentralPark: Idea = {
  slug: "helsinki-central-park",
  title: "Helsinki Central Park (Keskuspuisto)",
  shortDescription:
    "A nearly ten-kilometre wedge of forest cutting straight through Helsinki from Töölönlahti bay up to Haltiala farm and the Vantaanjoki river — bike, hike, ski, mushroom-pick, or visit the Highland-style cows. Two million visits a year, all free.",
  longDescription: [
    "Keskuspuisto is the spine of green that runs nearly the whole length of Helsinki, north–south, from Töölönlahti bay just behind Parliament up to the Vantaanjoki river at the city's northern border. About ten kilometres long and a kilometre wide at its broadest, it weaves together coniferous forest, meadows, fields, lakes, ponds, and old-growth stands that survived the city growing around them. The southern third is genuinely park-like — manicured, jogger-paced, easy walking from Töölö or Pasila. The middle third (Maunula, Pirkkola, Ruskeasuo) thickens into proper forest with ski trails, the Paloheinä outdoor lodge and downhill ski slope, and the Pirkkola sports park. The northernmost third (Haltiala) is the wildest part — old-growth pine, the Pitkäkoski rapids on Vantaanjoki, and Haltiala farm with its herd of cows kept outside year-round.",
    "By bike, the park is a real ride. The City of Helsinki's marked 16 km mountain bike trail (red waymarks on the trees, open 1 May – 30 November, ridable in either direction) starts behind the Laakso riding arena, threads through the central forest, loops Pitkäkoski and Haltiala, and ends at the Paloheinä lodge. Add the urban approach and return and you have a 25–30 km half-day loop that never leaves the city limits. The trail is single-track in places, gravel and forest road in others; a regular hybrid bike handles most of it, an MTB or gravel bike is more comfortable on the technical sections. The flatter Vantaanjoki riverside path along the north end is stroller- and trailer-friendly. On foot, AllTrails catalogues a dozen-plus walking and hiking loops; the Haltiala nature trail from Paloheinä to Pitkäkoski is the picturesque short walk if you only have an hour.",
    "Haltiala farm at the north end is the family destination of the park. It's free, open daily, and run by Vihreät Sylit — a working farm with sheep, goats, hens, and a herd of cows that includes Eastern Finncattle and Highland-cross cattle, all kept outdoors year-round and visible from early morning to evening. Café Pikku-Haltiala beside it does coffee, buns, and porridge. Combine farm + Pitkäkoski rapids + a riverside picnic for an easy half-day. The southern entry, by contrast, is the urban one: Töölönlahti bay, the meadow behind Finlandia Hall, joggers and pram-pushers, an espresso cart in summer.",
    "The park is open year-round and shifts function with the season: bike, run, and forage in summer and autumn (mushroom and berry picking is permitted in the everyman's-right tradition outside the small protected zones); cross-country ski the maintained tracks in winter (Paloheinä grooms loops and rents skis); skate the Paloheinä outdoor rink on cold weeks. Lit routes are on 06:00–23:00 in winter. From Lauttasaari the easiest entry is by bike: ride east across the Lauttasaari bridge, north through Töölö, and pick up the trail at Töölönlahti — about 25 minutes to the start. By transit, M1/M2 metro to Pasila or bus 21/24 to Töölö gets you to a southern entry; bus 66 or 67 from the city centre runs up to Paloheinä for the central or northern entries.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsingin_keskuspuisto_in_Laakso_2022-09-19_09.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsingin_keskuspuisto_in_Laakso_2022-09-19_02.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsingin_keskuspuisto_in_Länsi-Pasila_2022-09-19_07.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsingin_keskuspuisto_in_Länsi-Pasila_2022-09-19_01.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tower_in_Helsingin_keskuspuisto_in_Laakso_2022-09-19_01.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Haltiala_1_Karjaa_laitumella_(2019).jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/View_over_Pitkäkoski_of_Vantaanjoki,_Haltiala,_Helsinki,_2021_September.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Always open; lit routes on 06:00–23:00 in winter. Marked mountain bike trail open 1 May – 30 November.",
    notes:
      "Year-round but the experience changes hard with the season. May–Oct is hike, run, bike, swim, mushroom-pick. Dec–Mar is cross-country ski (Paloheinä grooms tracks reliably from January through early March). Late October when the leaves turn is the photographic peak; early November mud is the worst stretch.",
  },
  location: {
    region: ["Helsinki", "Uusimaa"],
    address: "Helsinki Central Park (entries at Töölönlahti, Laakso, Pasila, Paloheinä, Haltiala)",
  },
  accessFromLauttasaari: {
    complexity: "simple",
    duration: "~20–35 min depending on entry",
    notes:
      "Easiest by bike: ride east across the Lauttasaari bridge, north through Töölö, and pick up the trail at Töölönlahti behind Finlandia Hall — ~25 min from central Lauttasaari. By transit: M1/M2 metro to Helsinki Central + 5-min walk for the southern entry; or metro to Pasila for the central entry; or bus 66 or 67 from the city centre to Paloheinä for the central/northern entries (Haltiala farm). For Haltiala farm specifically, allow ~50 min total each way.",
  },
  cost: {
    perPersonEur: 0,
    notes:
      "Free. Bike rentals (Helride, city bikes) €5–25/day if you don't bring your own. Paloheinä cross-country ski rental ~€20/day in winter. Haltiala farm café and Pikku-Haltiala café are pay-as-you-go.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "No booking — walk or ride straight in. Paloheinä ski rental in winter is first-come; show up before 11am on a sunny Saturday or expect a queue.",
  },
  suitableAgeRange: { min: 0 },
  childrenNotes:
    "The Vantaanjoki riverside path and the Haltiala farm end of the park are stroller-friendly. The mountain bike trail is single-track in places and not stroller-passable; pick the wider Kuninkaantammentie route from Pitkäkoski lodge to Haltiala farm if you have a stroller or trailer. Haltiala farm itself is a kid-magnet — cows, sheep, goats, hens, all visible from the path. Bring snacks; the farm café is small and busy on weekends.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "moderate",
  duration: "half-day",
  website: "https://www.hel.fi/en/culture-and-leisure/outdoor-activities-parks-and-nature-destinations/outdoor-recreation-areas/central-park",
  tags: ["nature"],
};

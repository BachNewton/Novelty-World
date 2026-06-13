import type { Idea } from "../types";

export const berryMushroomForaging: Idea = {
  slug: "berry-mushroom-foraging",
  title: "Berry Picking & Mushroom Foraging",
  shortDescription:
    "Walk into any Finnish forest in late summer with a bucket and walk out with blueberries, lingonberries, chanterelles, or ceps — Everyman's Right makes it free, legal, and entirely the point of August and September weekends in Finland. Nuuksio National Park is the closest practical patch from Helsinki.",
  longDescription: [
    "Foraging is, in Finland, less a hobby than a national reflex. Under jokamiehenoikeus — Everyman's Right — anyone (Finn, resident, visitor) can walk into almost any Finnish forest, regardless of who owns the land, and pick wild berries and mushrooms for their own use. No permission, no fee, no one to ask. The only places it doesn't apply are private yards, cultivated fields, and a small number of restricted nature reserves. You'll see entire Finnish families at it on August weekends, with sturdy plastic buckets, paper mushroom guides, and the slightly stained fingers of someone who has eaten a lot of bilberries already that morning.",
    "The seasons run roughly: bilberries (mustikka — the small wild blueberries that stain everything blue) from mid-July through August, lingonberries (puolukka — tart red, used fresh and preserved) from late August into October, cloudberries (lakka — orange, expensive in shops because the bogs that produce them are inaccessible) for two short weeks in late July up north. Chanterelles (kantarelli) are the easiest mushroom for beginners — bright yolk-yellow, false-gilled, no dangerous lookalikes — and run August through September. Funnel chanterelles (suppilovahvero) and ceps/porcini (herkkutatti) extend the season into October. The sweet spot is the first weekend of September: late berries and early mushrooms in one outing.",
    "From Helsinki, the closest serious patch is Nuuksio National Park (53 km², 35 minutes from the city by car), and within Nuuksio, Haukkalampi and the Korpinkierros loop are the classic starts. Sipoonkorpi National Park to the east of Helsinki is less crowded and very good for chanterelles. Luukki recreation area in Espoo is the easy-mode option — flat, well-marked, family-friendly. None of them require a guide; what you bring is a basket or paper bag (don't use plastic, mushrooms sweat and rot), a small knife for the mushrooms, sturdy boots, water, and a download of the Sieni-opas (Mushroom Guide) app or a printed mushroom book in Finnish, Swedish, or English. If you'd rather have a beginner's introduction, Feel The Nature, Finnish Friend, and Honkajoki Nature Tours all run guided 3–4 hour foraging walks in Nuuksio in season for around €70–95 per person, including a campfire-cooked snack and ID help on what you find.",
    "What to do with what you pick: blueberries go straight into porridge, pancakes, or the freezer; lingonberries get made into a quick jam (raw-stir 1 kg berries with 500 g sugar, no cooking, will keep months); chanterelles fry hot in butter with a pinch of salt and a slice of toast; ceps are dried on a string over a radiator. The unwritten rule is take what you'll use and leave the rest. Public transport from Lauttasaari: M2 metro to Helsinki Central, commuter train (Y, U, E, L, X) to Espoon Keskus, then HSL bus 245 (or 245A in summer, May–October only) to one of the Nuuksio stops — about 1h 15m end to end. The Haltia Finnish Nature Centre at the park entrance has English-language exhibits, mushroom-ID stations during the season, and is the place to start if you've never done this before.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Picking_natural_blackberries_in_Finland.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Bilberries_and_lingonberries.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Berry-picking_rake.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Chanterelle_Finland.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Mustalampi_Lake_in_Nuuksio.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Eero_Järnefelt_-_Berry_Pickers.jpg",
  ],
  availability: {
    suitableMonths: [7, 8, 9, 10],
    notes:
      "Bilberry season: mid-July through August. Lingonberry season: late August into October. Chanterelles: August–September. Funnel chanterelles and ceps: September–October. The first weekend of September is the magic overlap — late berries and early mushrooms in one outing. Outside this window the forests are still beautiful but there's nothing to pick.",
  },
  location: {
    region: ["Anywhere in Finland", "Espoo", "Uusimaa"],
    address: "Practical entry: Haltia Finnish Nature Centre, Nuuksiontie 84, 02820 Espoo (or Haukkalampi entrance to Nuuksio National Park)",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~1h 15m to Nuuksio",
    notes:
      "M2 metro from Lauttasaari to Helsinki Central (~6 min), commuter train (Y, U, E, L or X) Helsinki Central → Espoon Keskus (~25 min), then HSL bus 245 (or 245A in summer, May–October) to Haltia Nature Centre or Haukkalampi entrance (~25 min). Bus 245 runs roughly hourly so check timetables. For Sipoonkorpi: M1 metro → Mellunmäki, then HSL bus 787K or 989. Driving is faster (~35 min to Nuuksio) but the bus works.",
  },
  cost: {
    perPersonEur: 0,
    notes:
      "Free under Everyman's Right — no fees, no permits, no permission needed. HSL public transport ~€8 round-trip. A bucket, knife, and mushroom guidebook (~€20) are the only real costs. Optional guided forage tours run €70–95 per person including snacks and ID help.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "DIY foraging: walk-in, no booking. Guided tours: book a few days to a week ahead in season; weekend slots fill fastest in September. The Haltia Nature Centre also runs free mushroom-ID drop-in days in autumn — bring your basket of finds, a Finnish forest expert checks them.",
  },
  suitableAgeRange: { min: 4 },
  childrenNotes:
    "Kids 4+ love berry-picking but tire on mushroom hunts (longer walks, more squinting at the ground). Bring a carrier for under-3s — the Nuuksio trails run on roots and rock, stroller-unfriendly. Critical safety rule with kids: nothing goes in the mouth without an adult ID — Finland has a small number of dangerous lookalike mushrooms (Cortinarius rubellus, false morel) and the cautious rule is to identify everything twice.",
  indoorOutdoor: "outdoor",
  physicalIntensity: "moderate",
  duration: "half-day",
  website: "https://www.nationalparks.fi/berryandmushroompicking",
  tags: ["nature", "food"],
};

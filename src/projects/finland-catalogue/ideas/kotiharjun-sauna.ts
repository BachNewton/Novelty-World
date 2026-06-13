import type { Idea } from "../types";

export const kotiharjunSauna: Idea = {
  slug: "kotiharjun-sauna",
  title: "Kotiharjun Sauna",
  shortDescription:
    "Helsinki's only remaining traditional wood-heated public sauna — burning a cubic metre of birch every sauna day, men's bench on the ground floor, women's identical room upstairs, the same way since 1928. €16 for the no-frills, no-reservation, real-thing löyly.",
  longDescription: [
    "Kotiharjun Sauna opened in 1928 on the corner of Harjutorinkatu and Franzeninkatu in Kallio, Helsinki's bohemian district. Of the dozens of district saunas (kortteli- ja kotitaloyhtiösaunat) that once served working-class neighbourhoods before private bathrooms became common, Kotiharju is the last traditional wood-heated public sauna left in Helsinki — every other public sauna in the city now runs on electric or gas. The building, the schedule, and the experience have barely changed in a century: a 7,000 kg cast-iron and stone stove on the ground floor, a cubic metre of split birch burned to heat it, men on the ground floor, women on the second floor, both rooms the same size, and a small electric private rental sauna in the back for families and groups.",
    "The wood-heated kiuas is the reason to come. Aficionados will tell you that softer, more humid steam (löyly) comes off rocks heated by burning wood than off any electric stove, and Kotiharju's 1,500 kg of stones bedded into 1,000 kg of iron produce arguably the best traditional löyly available to anyone walking in off the street in Helsinki. The men's room has a piippuhylly (chimney shelf) — a top-tier seat closest to the rising flue, where the heat is most intense and the regulars gravitate. There's a small heated outdoor terrace facing the back yard where bathers cool off in towels, beer in hand, in winter or summer; locals come for the löyly and stay for the cold-air cool-down on the bench outside.",
    "It's a real working-class neighbourhood sauna, not a tourist spa. The interior is plain tile and wooden bench; you bathe naked (single-sex rooms), shower before entering, sit on a small towel for hygiene, ask before throwing more water on the stones. €16 adult, €13 student/senior, €4 towel rental, €7–8 birch whisk (vasta) if you want to do it the full traditional way. The owners also offer a €15 full-body washing service on Thursdays and Saturdays — a bather (kylvettäjä) scrubs you on a wooden bench, also unchanged since the 1920s. No reservations for the public sauna; walk in any time during opening hours.",
    "Open Tuesday–Sunday 14:00–20:00 (last admission; bathing until 21:30). Closed Mondays and 1 May. From Lauttasaari, M1 or M2 metro to Sörnäinen (~12 min), then a 5-minute walk west into Kallio to Harjutorinkatu 1 — the bright neon \"SAUNA\" sign on the corner is the marker. Pair with a beer at one of the Kallio bars (Sori Taproom, Bar Kuja) afterwards, the standard local sequence. UNESCO listed Finnish sauna culture as Intangible Cultural Heritage in 2020 in part because of the survival of places like this; Kotiharju is, in a real sense, the listed thing itself.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kotiharjun_sauna_neon_sign_2008.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kotiharjun_yleinen_sauna_(Kotiharju_public_sauna_in_Helsinki)_Helsingin_Torkkelinmäellä_Kalliossa_01.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kotiharjun_yleinen_sauna_(Kotiharju_public_sauna_in_Helsinki)_Helsingin_Torkkelinmäellä_Kalliossa_03.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kotiharjun_sauna_-_Marit_Henriksson.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Kotiharjun_sauna_2025-1_Marit_Henriksson.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/20140529_harjutorin_sauna.jpg",
  ],
  availability: {
    suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    weeklySchedule:
      "Tue–Sun 14:00–20:00 (last admission); bathing continues until 21:30. Closed Mondays and 1 May. Full-body washing service Thu and Sat only.",
    notes:
      "Year-round. The wood-fired heat hits differently in deep winter when you can step out onto the small terrace and let -10°C air do the cooling. Quietest weekday afternoons; busy on Friday and Saturday evenings — go before 17:00 if you want a piippuhylly seat.",
  },
  location: {
    region: ["Helsinki", "Kallio", "Uusimaa"],
    address: "Harjutorinkatu 1, 00500 Helsinki",
  },
  accessFromLauttasaari: {
    complexity: "moderate",
    duration: "~25 min",
    notes:
      "M1 or M2 metro from Lauttasaari to Sörnäinen (~12 min), then a 5-min walk west into Kallio along Hämeentie and up Harjutorinkatu. Alternative: tram 9 from the city centre stops a 3-min walk away. The neon SAUNA sign on the corner is the visual marker.",
  },
  cost: {
    perPersonEur: 16,
    notes:
      "Public sauna €16 adult, €13 student/senior/unemployed, €9 children 12–16. Towel rental €4. Birch whisk (vasta) €7–8. Optional full-body wash service (kylvettäjä) €15 — Thu and Sat only. Private electric-rental sauna in the back priced separately for groups.",
  },
  booking: {
    leadTime: "same-day",
    notes:
      "No reservations for the public sauna — walk in any time during opening hours. The private electric sauna at the back is bookable in advance via phone (+358 9 7531535) for groups and families.",
  },
  childrenNotes:
    "Children 12–16 admitted at €9 with a parent in the same-sex public sauna. Below 12 is fine on a private booking of the back electric sauna; the public rooms are nudity-required and adult-paced and not the right introduction for younger kids. Plan to be the only family in the room — bring towels, sandals, water.",
  indoorOutdoor: "indoor",
  physicalIntensity: "low",
  duration: "1-3h",
  website: "https://www.kotiharjunsauna.fi/",
  tags: ["sauna", "historical"],
};

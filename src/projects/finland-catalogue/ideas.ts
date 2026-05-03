import type { Idea } from "./types";

/**
 * Hand-curated travel ideas for Finland. Populate by running the
 * `add-finland-idea` Claude Code skill, which researches each idea on the
 * web and appends a fully-populated entry to this array.
 */
export const IDEAS: Idea[] = [
  {
    slug: "oodi",
    title: "Oodi – Helsinki Central Library",
    shortDescription:
      "A free, world-award-winning library opposite Parliament where the sweeping wooden architecture is as much the draw as the books.",
    longDescription: [
      "Oodi opened on Finland's 101st Independence Day in 2018 as Helsinki's flagship public library and the country's gift to itself for the centenary. Designed by ALA Architects (winners of an open international competition), it sits on Kansalaistori square directly across from Parliament — a deliberate civic statement that public knowledge belongs at the heart of the city. The exterior is a single sweeping curve clad in 33mm Finnish spruce planks that lifts at one end to form a sheltered canopy over the square.",
      "Inside, the three floors each have a distinct character. The ground floor is the loud, social one: a café, event stage, and Kino Regina cinema. The middle floor is for making — Urban Workshop with 3D printers, sewing machines, and laser cutters, plus bookable music studios, gaming rooms, and meeting spaces (all free). The top floor is the showpiece: a vast wave-ceilinged hall punctured by round skylights, called \"book heaven\" by locals, with the open stacks, a children's area, and a balcony that looks out over Parliament and the Helsinki rooftops. Robots ferry returned books up from the basement.",
      "Even if you don't open a single book, it's worth the half-hour visit just for the architecture and the view from the third-floor balcony. The IFLA named Oodi the world's best public library in 2019 and it remains one of the most visited buildings in Helsinki.",
      "Entry is free, no ticket needed — walk straight in. Combine it with Kiasma (modern art museum) and the Helsinki Music Centre next door, all within a five-minute radius. The café opens with the building, so it's also a perfectly good rainy-day work spot.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsingin_keskustakirjasto_Oodi_2022-09-16_08.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Central_Library_Oodi_in_Helsinki,_Finland,_2023_May.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Oodi_book_area.jpeg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/The_double_spiral_staircase_in_Helsinki_Central_Library_Oodi.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Central_Library_Oodi_at_night_in_2018_December.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Interior_of_Oodi_on_an_afternoon_in_March_2025.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Central_Library_Oodi_from_north.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Kansalaistori_square_and_the_Central_Library_in_Helsinki,_Finland,_2020_April.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Terrace,_Helsinki_Central_Library_Oodi,_2019_(01).jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule: "Mon–Fri 8:00–21:00, Sat–Sun 10:00–20:00",
      notes:
        "Especially welcome in winter as a warm, free, all-day refuge in the city centre.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Töölönlahdenkatu 4, 00100 Helsinki",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~15 min",
      notes:
        "Metro from Lauttasaari to Helsinki Central (~6 min), then a 5-min walk across Kansalaistori square. Oodi sits directly opposite the Central Station.",
    },
    cost: {
      perPersonEur: 0,
      notes: "Entry is free. Café and Kino Regina cinema tickets are extra.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "Walk-in. Recording studios, meeting rooms, and 3D-printer slots are also free but need to be reserved online in advance.",
    },
    suitableAgeRange: { min: 0 },
    childrenNotes:
      "Dedicated children's section on the third floor with picture books, play areas, and family bathrooms. Stroller-friendly elevators throughout — works for any age from babies upward.",
    indoorOutdoor: "indoor",
    physicalIntensity: "low",
    duration: "1-3h",
    website: "https://oodihelsinki.fi/en/",
    tags: ["landmark"],
  },
  {
    slug: "moomin-world",
    title: "Moomin World",
    shortDescription:
      "Tove Jansson's Moomins brought to life as a walkable summer-only theme park on a small island beside Naantali — climb through the five-storey blueberry-blue Moominhouse and meet the costumed characters.",
    longDescription: [
      "Moomin World (Muumimaailma) opened in 1993 on the island of Kailo next to Naantali's old town, designed by Dennis Livson. It's a theme park in the loose European sense — no rollercoasters or thrill rides. Instead the island is built out as Tove Jansson's storybook world: a blueberry-coloured Moominhouse, the Hemulen's house, Snufkin's camp, the Hattifatteners' cave, Moominpappa's boat, and a small open-air theatre. Costumed Moomintroll, Snork Maiden, Little My, Snufkin, and the Groke wander the paths and pose for photos.",
      "The Moominhouse is the centrepiece — five storeys, every room dressed exactly like Jansson's pen drawings, and you can walk through the lot. The park is gentle and pre-school-paced; the appeal scales hard with how much your kids already love the Moomin books. Older children who don't know the stories may find it too sedate. The whole island is small enough to circle in four to five hours, and there's a sandy swimming spot if it's warm.",
      "It's strictly a summer attraction: the 2026 season runs 9 June – 21 August. Tickets are €43 per adult booked online (€45 at the gate); under-2s are free. From Helsinki, take a VR train to Turku (~2h), then Föli local bus 6 or 6A to Naantali (~30 min). It's a long day-trip — many visitors stay a night in Naantali or Turku. Combine with Naantali's wooden old town for a half-day on either side.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Muumitalo_3.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Inside_the_Moominhouse,_Moominworld.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Hemulin_talo.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Muumimaailma_naantali_11.jpeg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Moominmamma_and_Moominpappa,_Moominworld.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Muumipapan_laiva.jpg",
    ],
    availability: {
      suitableMonths: [6, 7, 8],
      weeklySchedule:
        "9–30 Jun: 11:00–17:00; 1 Jul – 2 Aug: 10:00–17:30; 3–21 Aug: 11:00–17:00",
      notes:
        "Closed entirely outside summer. Park dates shift slightly each year — check the official site before booking transport.",
    },
    location: {
      region: ["Turku"],
      address: "Kailo Island, Naantali (next to Naantali old town, ~16 km west of Turku)",
    },
    accessFromLauttasaari: {
      complexity: "complex",
      duration: "~3h 10m each way",
      notes:
        "Metro from Lauttasaari to Helsinki Central (~6 min), VR train Helsinki – Turku (~2h, frequent), then Föli local bus 6 or 6A from Turku to Naantali (~30 min). Park is a short walk from the bus stop across a wooden bridge. Doable as a long day trip but most visitors stay overnight in Naantali or Turku.",
    },
    cost: {
      perPersonEur: 43,
      notes:
        "€43 1-day online, €45 at the gate. 2-day pass €49 online. Family tickets (3-5 people) €123-€205. Children under 2 free.",
    },
    booking: {
      leadTime: "few-days",
      notes:
        "Book online for the discount and to skip the gate queue. No need to book months ahead.",
    },
    suitableAgeRange: { min: 2, max: 10 },
    childrenNotes:
      "The whole park is built for young children — strollers fit everywhere, there are family bathrooms, and characters interact gently. Older kids who don't know the Moomins may find it too sedate.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "low",
    duration: "half-day",
    website: "https://www.moominworld.fi/",
    tags: ["theme park"],
  },
  {
    slug: "turku-castle",
    title: "Turku Castle",
    shortDescription:
      "Finland's oldest and largest medieval castle, founded c. 1280 at the mouth of the Aura River — now a sprawling museum of stone halls, chapels, and Renaissance royal apartments.",
    longDescription: [
      "Turku Castle (Turun linna) was begun around 1280 as a Swedish military stronghold guarding the mouth of the Aura River. Over the next four centuries it grew into a sprawling residence, peaking under Duke John of Finland and Catherine Jagellon in the mid-16th century, who added Renaissance halls, banqueting rooms, and a chapel. A 1614 fire gutted the upper floors; the castle was eventually restored over decades and reopened to the public in its current form in 1987. It's the most visited museum in Finland.",
      "Inside, the experience is genuinely castle-like — thick stone walls, narrow staircases, vaulted cellars, and a dozen rooms dressed to specific eras. The Renaissance section on the upper floors recreates the royal apartments with period furniture, tapestries, and costumes. The medieval bailey at the front contains the original 13th-century keep with its dungeons; the newer (16th-century) bailey holds the great halls. There's a chapel still occasionally used for services, plus rotating exhibitions on Turku city history.",
      "Allow two to three hours — the castle is bigger than it looks from outside and easy to lose track of time in. Adult entry is €18; the Museum Card covers it. Open Tue–Sun, closed Mondays and a handful of major holidays.",
      "From Helsinki, take a VR train to Turku (~2h), then bus 1 or a short walk along the river (~25 min) from the station. The castle sits right next to the harbour where the Stockholm ferries dock. Combine with Forum Marinum next door for a full day.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Turkucastle_edit.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Turku_Castle_bailey.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Castle_of_Turku,_courtyard_renaissance_part.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Castle_of_Turku,_larger_room.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Åbo_slott_1724.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Turku_Castle_from_Linnankatu.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Turku_Castle_in_September_2024.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Courtyard,_Turunlinna.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Tue–Sun 10:00–17:00 (Jun–Aug 10:00–18:00). Closed Mondays.",
      notes:
        "Closed 1 May, 19–21 Jun (Midsummer), 6 Dec (Independence Day), and 24–25 & 31 Dec. Last admission 30 min before closing.",
    },
    location: {
      region: ["Turku"],
      address: "Linnankatu 80, 20100 Turku",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~2.5h each way",
      notes:
        "Metro from Lauttasaari to Helsinki Central (~6 min), VR train Helsinki – Turku (~2h, frequent), then Föli bus 1 from Turku Central Station (~15 min) or a 25-min riverside walk. The castle is by the harbour, next to the ferry terminal.",
    },
    cost: {
      perPersonEur: 18,
      notes:
        "Adults €18. Covered by the Finnish Museum Card. Children/students discounted.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "Walk-in fine. Pre-book online to skip the counter on busy summer days.",
    },
    suitableAgeRange: { min: 5 },
    childrenNotes:
      "Older kids enjoy the dungeons, towers, and dress-up corners. Younger kids may struggle with the steep staircases — strollers are awkward; bring a carrier instead.",
    indoorOutdoor: "indoor",
    physicalIntensity: "moderate",
    duration: "1-3h",
    website: "https://turunlinna.fi/en/",
    tags: ["museum", "landmark", "historical"],
  },
  {
    slug: "forum-marinum",
    title: "Forum Marinum Maritime Centre",
    shortDescription:
      "Turku's national maritime museum on the Aura River — twelve historic vessels you can board (in summer) plus exhibition halls of shipbuilding, naval, and merchant-marine history.",
    longDescription: [
      "Forum Marinum is Finland's national maritime museum, on the Aura riverside next to Turku Castle. It was formed in 1999 by merging the Turku Maritime Museum and Åbo Akademi's older maritime collection. The indoor exhibition halls cover Finnish shipbuilding, life at sea, naval history, and the wartime navy — but the real draw is the fleet moored along the river: thirteen historic vessels including the full-rigged ship Suomen Joutsen, the wooden barque Sigyn (1887), the former steam cruiser MS Bore, gunboats, a minelayer, and motor torpedo boats.",
      "From May through September the ships are open and you can board most of them — climb below decks on Suomen Joutsen, walk the rigging gangways on Sigyn, see the cramped officers' quarters of a Cold War minelayer. Outside summer the ships are closed but the indoor exhibitions stay open year-round. Allow two to three hours in summer (longer if you really like ships); ninety minutes is enough in the off-season.",
      "Adults €12, children 5-12 €7, under-5 free; covered by the Museum Card. Open daily 11:00–19:00 in summer (May–Sept), Tue–Sun 10:00–18:00 the rest of the year. The site is right next to Turku Castle so the two pair naturally as a single day from Helsinki — VR train Helsinki–Turku ~2h, then bus 1 or a riverside walk from the station.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Forum_Marinum_Panorama.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Sigyn_docked_in_Turku.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Rautaville_Forum_Marinum.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/MKL-2103_Forum_Marinum_3.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Sulkavene_Vingett_Forum_Marinum_1.JPG",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "May–Sept daily 11:00–19:00. Off-season Tue–Sun 10:00–18:00 (closed Mondays). Last admission 30 min before closing.",
      notes:
        "The museum ships outdoors are only boardable May–September. Indoor exhibitions are open all year.",
    },
    location: {
      region: ["Turku"],
      address: "Linnankatu 72, 20100 Turku",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~2.5h each way",
      notes:
        "Metro from Lauttasaari to Helsinki Central (~6 min), VR train Helsinki – Turku (~2h), then Föli bus 1 from the station (~15 min) or a 25-min riverside walk. Right next to Turku Castle — pair them as one day.",
    },
    cost: {
      perPersonEur: 12,
      notes:
        "Adults €12, children 5–12 €7, under-5 free. Museum Card covered. Pricing applies whether or not the ships are boardable.",
    },
    booking: {
      leadTime: "same-day",
      notes: "Walk-in. No advance booking needed.",
    },
    suitableAgeRange: { min: 4 },
    childrenNotes:
      "Boarding the ships is the kid magnet — narrow ladders, ropes, and engine rooms. Steeper than a typical museum; bring sturdy shoes and skip the stroller.",
    indoorOutdoor: "mixed",
    physicalIntensity: "low",
    duration: "1-3h",
    website: "https://www.forum-marinum.fi/en/",
    tags: ["museum", "historical", "nautical"],
  },
  {
    slug: "suomen-joutsen",
    title: "Suomen Joutsen",
    shortDescription:
      "Finland's last surviving full-rigged tall ship — board her at Forum Marinum's dock and walk the deck of a 96-metre 1902 sailing vessel that served as a French merchantman, a German training ship, and a Finnish naval cadet school.",
    longDescription: [
      "Suomen Joutsen (\"Finnish Swan\") is a steel-hulled three-masted full-rigger built in 1902 at Chantiers de Penhoët in Saint-Nazaire, France. She had three lives at sea before her current one as a museum ship: as the French merchantman Laënnec on Atlantic and Pacific cargo routes; as the German Oldenburg, training a generation of merchant sailors (including U-boat ace Günther Prien); and from 1930 as a Finnish Navy training vessel that completed eight international voyages before WWII. After the war she became a stationary seamen's school in Turku, training nearly 4,000 cadets, and has been open as a museum since 1991.",
      "She's moored permanently in the Aura River at Forum Marinum's dock, and in summer visitors can go aboard. The exhibition \"The Five Lives of the Full-rigger Suomen Joutsen\" runs across the main deck and below, telling each phase of her story; you can wander the rigging, the captain's cabin, the cadet quarters, and the engine spaces. She's the last remaining full-rigger in Finland and one of only a handful of surviving steel-hulled square-rigged sail training ships anywhere.",
      "Open daily 1 Jun – 16 Aug 2026 (the precise window shifts each year). Visiting is included with Forum Marinum admission (€12 adult, Museum Card OK) — no separate ticket. Outside summer the ship is closed but a guided winter tour can be arranged through the museum.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Suomen_Joutsen_2.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Suomen_Joutsen_in_Uusikaupunki.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Suomen_Joutsen_stern.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Suomen_Joutsen_4th.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Suomen_Joutsen_1932.jpg",
    ],
    availability: {
      suitableMonths: [6, 7, 8],
      weeklySchedule:
        "Open daily 1 Jun – 16 Aug 2026, same hours as Forum Marinum (11:00–19:00).",
      notes:
        "Boarding is summer-only. The Forum Marinum indoor exhibition about the ship is open year-round, and winter guided tours can be arranged on request.",
    },
    location: {
      region: ["Turku"],
      address: "Linnankatu 72, 20100 Turku (moored at Forum Marinum dock)",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~2.5h each way",
      notes:
        "Same as Forum Marinum: metro to Helsinki Central (~6 min), VR train Helsinki – Turku (~2h), then Föli bus 1 (~15 min) or 25-min riverside walk. Right next to Turku Castle.",
    },
    cost: {
      perPersonEur: 12,
      notes:
        "Boarding is included with Forum Marinum admission (€12 adult, €7 child 5–12, under-5 free). Museum Card covered.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "Walk-in via Forum Marinum. No separate ticket. Winter guided tours need to be arranged in advance via the museum.",
    },
    suitableAgeRange: { min: 5 },
    childrenNotes:
      "Steep companionways and narrow doorways belowdecks — not stroller-friendly. Older kids who like ships will love it; toddlers will struggle with the ladders.",
    indoorOutdoor: "mixed",
    physicalIntensity: "low",
    duration: "<1h",
    website:
      "https://www.forum-marinum.fi/en/exhibitions/museum-ships/the-full-rigger-suomen-joutsen/",
    tags: ["museum", "historical", "nautical"],
  },
  {
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
    tags: ["landmark", "historical"],
  },
  {
    slug: "esplanadi",
    title: "Esplanadi",
    shortDescription:
      "Helsinki's central tree-lined park-boulevard running from the Swedish Theatre to Market Square — the city's living room, with free summer concerts on the Espa Stage and a parade of cafés, statues, and high-end shops along its flanks.",
    longDescription: [
      "Esplanadi is a long, narrow park laid out in 1818 between two streets — Pohjoisesplanadi and Eteläesplanadi — running from the Swedish Theatre at one end to Market Square and the harbour at the other. Carl Ludvig Engel (the same architect as Helsinki Cathedral) designed the surrounding plan as part of the city's neoclassical centre. The park is wider than a typical median strip and narrower than a real park; locals call it Espa and treat it as the city's open-air living room.",
      "Down the middle runs a gravel walking path with benches, statues (Runeberg the national poet, Eino Leino, the writer Zachris Topelius), and the Espa Stage — a small permanent bandstand that hosts free concerts almost every day in summer. Programming includes Jazz Espa, Etno-Espa folk weeks, Roots Espa, and one-off pop-ups around Helsinki Day and the Night of the Arts. The flanking streets are the city's flagship retail strip — Marimekko, Iittala, Stockmann, Kämp Galleria — and the south side has the historic Kappeli and Esplanade Chapel restaurants.",
      "There's nothing to book and nothing to pay for. Walk the length once to get oriented (it takes maybe ten minutes), grab an ice cream from the kiosk by the Swedish Theatre, and sit on a bench during a free concert. In winter the park is quieter but the trees get strung with lights, and the kiosks become glögg stops during the December market season.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Esplanadin_puisto_2020.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Johan_Ludvig_Runeberg_statue_in_Esplanadi_park_Helsinki_Finland.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Esplanade_Chapel_restaurant_in_Helsinki,_Finland,_2021_January.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Hotel_Kämp_(73404).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Havis_Amanda_(40026).jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      notes:
        "Best from May to September when the trees are out and the Espa Stage runs free concerts. Pleasant in winter for a short walk between cathedrals/market hall but you won't linger.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Esplanadi park, between Erottaja and Market Square, 00130 Helsinki",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~15 min",
      notes:
        "Bus 21 from Lauttasaari runs straight through downtown — get off at Erottaja or Kauppatori for either end of the park. Alternative: metro to Helsinki Central (~6 min), then a 5-min walk down Mannerheimintie.",
    },
    cost: {
      perPersonEur: 0,
      notes:
        "Free. Espa Stage concerts are free. Surrounding cafés and restaurants are mid-to-high priced.",
    },
    booking: {
      leadTime: "same-day",
      notes: "No booking. Just show up.",
    },
    suitableAgeRange: { min: 0 },
    childrenNotes:
      "Stroller-friendly flat gravel paths. Works for any age. The kiosks have ice cream all summer.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "low",
    duration: "<1h",
    website: "https://www.myhelsinki.fi/places/esplanadi/",
    tags: [],
  },
  {
    slug: "kauppatori",
    title: "Kauppatori (Market Square)",
    shortDescription:
      "Helsinki's open-air harbourside market — fresh Finnish food and crafts at orange-tarp stalls right where the Suomenlinna ferries dock, with the Cathedral, Presidential Palace, and Esplanadi all one block away.",
    longDescription: [
      "Kauppatori (Salutorget in Swedish) is Helsinki's main open-air market square, occupying the corner where Esplanadi meets the South Harbour. It has been a market spot since at least the 16th century — originally the muddy floor of a small bay where fishermen sold their catch, now a paved square anchored by Havis Amanda's fountain and ringed by the City Hall, Presidential Palace, and Swedish Embassy. The Suomenlinna ferries leave from the dock right beside it.",
      "Stalls open from spring through autumn under bright orange tarps, selling salmon soup (lohikeitto), fried vendace (muikku), Karelian pies, reindeer skewers, mustamakkara, and seasonal berries; alongside the food stands are fur hats, Lappi-themed knick-knacks, and Marimekko knock-offs (the real shop is up on Esplanadi). Late summer brings the herring market (Silakkamarkkinat), a tradition running since 1743 — fishing boats moor at the quay and sell straight from the deck. In December the square hosts the St Thomas Christmas Market.",
      "Open roughly Mon–Fri 6:30–18:00, Sat 6:30–16:00, Sun 10:00–17:00 in summer, with shorter winter hours. Free to walk through. Plan to grab lunch from a stall (€10–15 a bowl), eat at a tarp-table seat with a view of the boats, then walk straight up Unioninkatu to Senate Square or onto a Suomenlinna ferry. The official-looking gold-onion-domed building visible across the harbour is Uspenski Cathedral — five minutes' walk if you want to add it.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Kauppatori_(69913).jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Market_Square_(Helsinki,_Finland).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Kauppatori_Helsinki_from_city_ferry_2022-09-18_02.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Market_Square_in_Helsinki,_Finland,_2024_May.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Kauppatori_Helsinki1.jpg",
    ],
    availability: {
      suitableMonths: [4, 5, 6, 7, 8, 9, 10],
      events: [
        {
          from: "10-01",
          to: "10-10",
          name: "Silakkamarkkinat (Helsinki Baltic Herring Market)",
        },
      ],
      weeklySchedule:
        "Summer: Mon–Fri 6:30–18:00, Sat 6:30–16:00, Sun 10:00–17:00. Winter hours are shorter (~8:00–16:00 weekdays, limited Sundays).",
      notes:
        "Market stalls scale way back in winter — a few year-round vendors and a coffee tent rather than a full square of food. The square stays walkable but the experience is in summer.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Kauppatori, 00170 Helsinki (South Harbour)",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~15 min",
      notes:
        "Bus 21 from Lauttasaari runs straight to Kauppatori — most direct. Alternative: metro to Helsinki Central (~6 min), then a 10-min walk down Esplanadi. Ferry to Suomenlinna leaves from the same square.",
    },
    cost: {
      perPersonEur: 15,
      notes:
        "Free to walk through. Budget €10–20 for a stall meal and coffee. Souvenirs are tourist-priced — better deals in proper shops.",
    },
    booking: {
      leadTime: "same-day",
      notes: "No booking. Walk-up.",
    },
    suitableAgeRange: { min: 0 },
    childrenNotes:
      "Stroller-friendly flat paving. Watch the seagulls — they will steal lihapiirakka straight out of a child's hand.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "low",
    duration: "<1h",
    website: "https://helsingintorit.fi/en/market-squares/kauppatori-2/",
    tags: ["food"],
  },
  {
    slug: "old-market-hall",
    title: "Old Market Hall (Vanha kauppahalli)",
    shortDescription:
      "Helsinki's 1889 brick-and-cast-iron market hall on the South Harbour — over twenty stalls of fish, cheese, charcuterie, pastries, and small-plate counters tucked under a wooden-vaulted nave.",
    longDescription: [
      "Vanha kauppahalli is Helsinki's oldest market hall, built in 1889 to a design by Gustaf Nyström as the city's first roofed food market. The exterior is red brick with iron-framed windows; the interior is one long aisle under a wooden-rib ceiling, with little dark-wood stalls running down both sides like booths in a long restaurant. It was renovated 2012–2014 and has been a deliberate go-to of the food-tourism circuit since.",
      "The 20-odd vendors lean traditional and local: salmon and Baltic herring from Eriksson's fish counter, reindeer cuts and lapland charcuterie at Salaska, Karelian pies at Story, cheeses at Hopia, and chocolate from Kultainen Hetki. About a third of the stalls are sit-down counters — Story does excellent salmon soup, Soppakeittiö across from it is famous for its rotating soup-of-the-day, and there's a small bar in the middle for a beer and oysters. Lunch is the right meal here; many stalls close at six.",
      "Hours are roughly Mon–Sat 10:00–18:00, closed Sundays (individual stalls vary). It's a 30-second walk from Kauppatori — the two pair perfectly: outdoor stalls and ferry-watching at Kauppatori, then duck inside for lunch. Free to walk through; budget €15–25 for a sit-down meal.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Vanha_kauppahalli_(14092).jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Kauppahalli_-_inside,_Helsinki_FIN.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Vanha_kauppahalli_Helsinki_at_night_2022-09-18_01.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Antiguo_Mercado_de_Helsinki,_Finlandia,_2012-08-14,_DD_01.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Old_Market_Hall_-_Vanha_Kauppahalli,_Helsinki_(29282721726).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Vanha_Kauppahalli_Helsinki_04.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule: "Mon–Sat 10:00–18:00. Closed Sundays.",
      notes:
        "Individual stalls set their own hours — some close at 17:00, a few at 16:00 on Saturday. Sunday closure is firm.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Eteläranta, 00130 Helsinki (South Harbour, beside Kauppatori)",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~15 min",
      notes:
        "Bus 21 from Lauttasaari runs to Kauppatori — the hall is a 30-second walk from the stop. Alternative: metro to Helsinki Central (~6 min), then a 10-min walk down Esplanadi.",
    },
    cost: {
      perPersonEur: 20,
      notes:
        "Free to enter. Sit-down lunch ~€15–25. Browsing and snacks ~€5–10.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "Walk-in. Soppakeittiö and Story can have queues at lunch — go before noon or after 13:30 to skip them.",
    },
    suitableAgeRange: { min: 0 },
    childrenNotes:
      "Stroller-friendly aisle but it gets tight at lunchtime. High chairs are scarce; plan to share a counter seat.",
    indoorOutdoor: "indoor",
    physicalIntensity: "low",
    duration: "<1h",
    website: "https://vanhakauppahalli.fi/en/",
    tags: ["food"],
  },
  {
    slug: "suomenlinna",
    title: "Suomenlinna Sea Fortress",
    shortDescription:
      "An 18th-century star-fortress sprawling across six interlinked islands a 15-minute ferry from Market Square — UNESCO-listed bastions, tunnels, museums, a dry dock, a submarine, beaches, and a small living village all on one ticket.",
    longDescription: [
      "Suomenlinna (\"Castle of Finland\", originally Sveaborg under Swedish rule) was begun in 1748 to defend the eastern Baltic against Russia, designed by Augustin Ehrensvärd along Vauban-influenced principles. The fortress surrendered after a two-month siege in 1808, opening the door to Russia's annexation of Finland; the islands then served as a Russian naval base for a century, became Finnish in 1917, and were a military garrison until 1973. UNESCO listed the site in 1991. Around 800 people still live on the islands year-round.",
      "Six islands are connected by short bridges so you can walk the whole route on foot. The set-piece is Kustaanmiekka at the southern tip — a dramatic line of green ramparts, cannons, and the King's Gate facing open sea. On the way you pass the dry dock (still working — they restore wooden sailing ships there), Ehrensvärd's tomb in the central courtyard, the WWII-era submarine Vesikko (you can climb inside), the Suomenlinna Museum (orientation), the Toy Museum, and a brewery-restaurant. Allow at least three hours; six is closer to honest if you want the museums.",
      "The HSL public ferry leaves from Kauppatori roughly every 20 minutes in summer, every 40–60 in winter, and takes 15 minutes. A standard AB single ticket (€3.30, 90 min) covers it — the same ticket as a tram. The fortress itself is free and always open: museums charge €5–10 each (Museum Card OK), and most close in winter or run reduced hours. Year-round destination, but very different in character — summer is lush and full of picnickers; winter strips it down to icy ramparts and almost no one around.",
      "Bring layers and good shoes. The paths are gravel and uneven cobblestone. There's a café and the brewery on the islands but supplies are limited — most locals pack snacks and a thermos.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Suomenlinna_aerial.JPG",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Suomenlinna_mereltä_5.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Turisteja_Kustaanmiekassa.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Suomenlinna_Tunnels.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Suomenlinnaferry.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Viapori,_Sveaborg,_Helsinki_-_20240905_-_14.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/King's_Gate,_Kustaanmiekka,_Suomenlinna,_Helsinki,_Finland_02.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Submarine_Vesikko_on_Susisaari_Suomenlinna.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Suomenlinnan_kirkko_Iso_Mustasaari_Suomenlinna_2022-09-17_01.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Cannons_on_Kustaanmiekka_Suomenlinna_2022-09-17_01.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Islands open 24/7. Most museums and the brewery open May–Sept; the Suomenlinna Museum is the main year-round indoor stop.",
      notes:
        "Genuine year-round destination but the experience flips: summer is the postcard version, winter is empty ramparts and ice. Late spring (May) and early autumn (Sept) hit the sweet spot — open museums, no crowds.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Suomenlinna islands, 00190 Helsinki (15-min ferry from Kauppatori)",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~30 min total (~15 min bus + 15 min ferry)",
      notes:
        "Bus 21 from Lauttasaari runs straight to the Suomenlinna ferry pier at Kauppatori — the most direct route. Alternative: metro to Helsinki Central (~6 min), then a 10-min walk down Esplanadi. AB single ticket (€3.30) covers the whole trip — same ticket as the metro. Ferry departs every 20 min in summer, 40–60 min in winter. The private JT-Line waterbus also runs in summer (separate ticket, more scenic).",
    },
    cost: {
      perPersonEur: 3,
      notes:
        "Ferry €3.30 round-trip with an AB ticket. The fortress is free. Suomenlinna Museum €8, submarine Vesikko €7, Toy Museum €9 — Museum Card covers most. Brewery and cafés are extra.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "Walk-up. No tickets needed for the islands. Ferries don't sell out. Brewery restaurant takes reservations in summer if you want lunch with a view.",
    },
    suitableAgeRange: { min: 4 },
    childrenNotes:
      "Strollers work on the main paths but not on the cannon emplacements or tunnel sections. Kids love the cannons, the submarine, and the Toy Museum; rough cobblestones and unfenced ramparts mean keep an eye out near the southern bastions.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "moderate",
    duration: "half-day",
    website: "https://www.suomenlinna.fi/en/",
    tags: ["museum", "landmark", "historical", "nautical", "nature"],
  },
  {
    slug: "hame-castle",
    title: "Häme Castle",
    shortDescription:
      "A 14th-century red-brick Swedish-era castle on the shore of Lake Vanajavesi in Hämeenlinna — a tidy two-hour stop on the train line between Helsinki and Tampere.",
    longDescription: [
      "Häme Castle (Hämeen linna) sits on the south shore of Lake Vanajavesi in the town of Hämeenlinna, halfway up the Helsinki–Tampere main line. Construction probably began in the late 13th or early 14th century as a Swedish administrative stronghold over the region of Häme; the surviving granite-and-red-brick walls date mostly to the 1320s onwards. Unlike Turku Castle (sea-facing, military-merchant) Häme is squarer, more compact, and more obviously medieval — a square keep with corner turrets, encircling curtain walls, and a moat.",
      "After Finland passed to Russia the castle was converted into a prison, and it served that role from the early 1800s until 1953. Restoration ran from the 1950s through 1979, when it reopened as a museum operated by the Finnish National Board of Antiquities. Inside, you walk through the King's Hall on the upper floor (with its restored painted-rib brick vaulting), period-furnished chambers, the chapel, and the prison-era cells in the lower courses. There are interpretive exhibits on medieval Häme and a few thematic events through the year — a Renaissance fair in summer, Christmas events in December.",
      "Adult ticket €15; family ticket (2 adults + 1–4 kids) €35. Museum Card OK. The combined ticket (€28) adds the Museo Militaria military museum and the old county prison, both on the same peninsula and worth pairing if you've made the train trip.",
      "Hämeenlinna is ~1 hour from Helsinki on a VR Intercity or Pendolino — a genuine half-day excursion with no overnight needed. The castle is a 15-minute walk from the train station along the lake.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Hame_Castle_2019-08.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lake_Vanajavesi_and_Häme_Castle_from_air.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/CastleOfHame_29042006_inside3.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Roof_of_King's_Hall_in_the_Castle_of_Hame.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/CastleOfHame_29042006_inside.JPG",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Jan 2 – Apr 30: Tue–Fri 10:00–16:00, Sat–Sun 11:00–16:00, closed Mondays. May daily 10:00–16:00. Jun–Aug daily 10:00–17:00. Ticket sales close 30 min before.",
      notes:
        "Closed 1 Jan, Good Friday, Easter Monday, 1 May, Midsummer Eve, and 15 Dec – 1 Jan (Christmas closure).",
    },
    location: {
      region: ["Hämeenlinna"],
      address: "Kustaa III:n katu 6, 13100 Hämeenlinna (~100 km north of Helsinki)",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~1h 25m each way",
      notes:
        "Metro from Lauttasaari to Helsinki Central (~6 min), then VR Intercity or Pendolino to Hämeenlinna (~1h, frequent), then a 15-min walk along the lake from the station to the castle peninsula. Easy half-day from Lauttasaari — no overnight needed.",
    },
    cost: {
      perPersonEur: 15,
      notes:
        "Adults €15, children 7–17 €7, reduced €10. Family ticket (2 adults + 1–4 kids) €35. Combined ticket with Museo Militaria + Prison is €28 (May–Sept). Museum Card covered.",
    },
    booking: {
      leadTime: "same-day",
      notes: "Walk-in. Pre-book online if visiting during a Renaissance fair weekend.",
    },
    suitableAgeRange: { min: 5 },
    childrenNotes:
      "Older kids enjoy the towers and dungeons; the steep brick staircases are tough for toddlers and impossible with a stroller — bring a carrier.",
    indoorOutdoor: "indoor",
    physicalIntensity: "moderate",
    duration: "1-3h",
    website: "https://www.kansallismuseo.fi/en/haemeenlinna",
    tags: ["museum", "landmark", "historical"],
  },
  {
    slug: "uiva-flytande",
    title: "Uiva Flytande – Helsinki Boat-Afloat Show",
    shortDescription:
      "The largest in-water boat show in the Nordics — nearly 300 boats moored at HSK yacht club in Lauttasaari for four days each August, plus 3,000 m² of land-based exhibits and food trucks on the quay.",
    longDescription: [
      "Uiva Flytande (\"Floating\" in Finnish/Swedish) is the Helsinki Boat-Afloat Show, organised every August by Finnboat — the Finnish Marine Industries Federation — at the Helsingfors Segelklubb (HSK) yacht club marina on the eastern shore of Lauttasaari. HSK is one of Finland's oldest sailing clubs, founded in 1899, and the harbour has hosted the show since 1980. The 2026 edition is the 14th to use the Uiva Flytande branding and runs Thu–Sun, 13–16 August.",
      "The pitch is simple: instead of looking at boats parked on land in a convention centre, you walk the floating pontoons and step aboard nearly 300 boats actually in the water — 5–7 m motorboats (the dominant Finnish category), bigger cabin cruisers, sailboats, RIBs, fishing boats, catamarans. About 30 of those are Nordic premieres each year. On shore, 3,000 m² of land-based stands cover engines, electronics, trailers, marine clothing, and brokerage services, plus a row of food trucks, a café tent, and a small stage for product talks and family activities.",
      "Even if you have zero intention of buying a boat, it's a satisfying afternoon — the marina setting is genuinely beautiful, the boats range from approachable runabouts up to half-million-euro yachts you can climb on, and Finnish boating culture is on full display (this is a country with one of the highest boats-per-capita ratios in the world). Allow two to three hours; longer if you actually want to sea-trial something.",
      "Adults €14 online (€18 at the gate), kids 7–15 €5 online (€8 gate), under-7 free. Tickets go on sale in May. From central Lauttasaari, walk down to Vattuniemi (~25 min) or catch the free shuttle bus that runs every 20 min from outside Lauttis shopping centre — it drops you at the gate. Driving is awkward; the lot fills early and costs €10/day.",
    ],
    thumbnailUrl: "https://uiva.fi/wp-content/uploads/2025/08/Uiva36-1024x576.jpg",
    galleryUrls: [
      "https://uiva.fi/wp-content/uploads/2025/08/Uiva94-1024x576.jpg",
      "https://uiva.fi/wp-content/uploads/2025/08/Uiva42-1024x683.jpg",
      "https://uiva.fi/wp-content/uploads/2025/08/Uiva91-1024x577.jpg",
      "https://uiva.fi/wp-content/uploads/2025/08/Uiva29-1024x576.jpg",
      "https://uiva.fi/wp-content/uploads/2025/06/Uiva5-1024x576.jpg",
      "https://uiva.fi/wp-content/uploads/2025/08/Uiva6-1024x579.jpg",
    ],
    availability: {
      suitableMonths: [8],
      events: [
        {
          from: "08-13",
          to: "08-16",
          name: "Uiva Flytande – Helsinki Boat-Afloat Show",
        },
      ],
      weeklySchedule: "Thu–Sat 11:00–19:00, Sun 11:00–18:00",
      notes:
        "Four-day annual event in mid-August. Exact weekend shifts a day or two each year — check uiva.fi before locking in plans around it.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "HSK Yacht Club, Vattuniemen puistotie 1, 00210 Helsinki (Lauttasaari)",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~10–25 min",
      notes:
        "On the same island. From Lauttasaari metro station, hop on the free event shuttle bus from outside Lauttis shopping centre (~10 min, runs every 20 min while the show is open) or walk south down to Vattuniemi (~25 min). Bus 21 also serves the area.",
    },
    cost: {
      perPersonEur: 14,
      notes:
        "Adults €14 online / €18 at the gate. Kids 7–15 €5 online / €8 gate. Under-7 free with a parent. VIP ticket €50 (online only) adds a lounge tent with refreshments. E-tickets carry a small Floud delivery fee.",
    },
    booking: {
      leadTime: "few-days",
      notes:
        "Buy online for the discount and to skip the gate queue. Tickets open in May. No need to book months ahead.",
    },
    suitableAgeRange: { min: 4 },
    childrenNotes:
      "Family activities run on the land area each day — face painting, kid-sized RIB rides in past years. Pontoons are floating planks above open water; keep small kids close. Strollers fit but the gangway joints are bumpy.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "low",
    duration: "1-3h",
    website: "https://uiva.fi/en/",
    tags: ["nautical"],
  },
  {
    slug: "santa-claus-village",
    title: "Santa Claus Village",
    shortDescription:
      "Meet Santa Claus year-round at his official residence on the Arctic Circle just outside Rovaniemi — free to enter, with reindeer, the Arctic Circle crossing line, his post office, and a constellation of cabins that doubles as the start point for husky and aurora trips.",
    longDescription: [
      "Santa Claus Village (Joulupukin Pajakylä) opened in 1985, eight kilometres northeast of Rovaniemi at the spot where the Arctic Circle crosses the highway. It started as a single log cabin built for Eleanor Roosevelt's 1950 visit and grew into Finland's most-visited single attraction — a small theme park of timber lodges, reindeer pens, and gift shops, with the painted Arctic Circle line running across the central square. The village is open every day of the year and there's no admission fee.",
      "The headline experience is meeting Santa himself, who holds office at Santa Claus's Office every day from morning to evening. The meeting is free; you only pay if you want the photo or video package (from €55 for a group of up to five — paid on the spot, no booking needed, photos start at around €40). Beyond Santa's office: the official Main Post Office where you can write a letter that gets stamped with the Arctic Circle postmark and posted on Christmas Eve, Mrs. Santa Claus's Cottage at the Reindeer Resort, the Christmas House next door, a snowmobile museum, and a row of husky-, reindeer-, and snowmobile-tour operators who all dispatch from the village.",
      "It's unapologetically commercial — the gift shops outnumber the actual things to do, the queues to meet Santa run long all December — but it lands harder than expected. The Arctic Circle crossing certificate, the reindeer in the snow, the genuinely-old Santa with a thoughtful manner all hit the right notes for kids and the kid-adjacent. November through January is peak: snow on the ground, lights up everywhere, and aurora visible most clear nights. Summer keeps the village open but it loses most of the magic — the cabins look bare without snow.",
      "From Helsinki, the romance is the Santa Claus Express overnight train (departs Helsinki ~19:30 or ~22:30, arrives Rovaniemi around 08:00 — sleeper berths from €49, basic seat from €29 via VR). Once in Rovaniemi, local bus 8 runs to the village year-round (~30 min, €4 single), or it's a quick taxi from the train station. Most people pair this with a husky safari or aurora trip, since you're already up here.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Santa_Claus_Village.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Santa_Land_Rovaniemi_Arctic_Circle1.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Santa_Land_Rovaniemi_Arctic_Circle2.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Rovaniemi-SantaClausVillage.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Snowball_pyramid_at_Santa_Claus'_Village_Large.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Rovaniemi-santa's-post-office.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Rovaniemi_Santa_Claus.JPG",
    ],
    availability: {
      suitableMonths: [11, 12, 1, 2, 3],
      weeklySchedule:
        "Open 365 days a year. Peak season (mid-Nov to early Jan) ~10:00–19:00; Santa's Office runs slightly shorter morning/lunch/afternoon shifts (e.g. 10–11:30, 12–14, 15–17). Off-peak hours shorter.",
      notes:
        "Year-round but the experience is wildly seasonal. November–January is peak Christmas magic with reliable snow. December queues to meet Santa are heaviest 11:00–14:00 — go right at opening or after 16:00. Summer is open but the village looks bare without snow and most of the appeal evaporates.",
    },
    location: {
      region: ["Rovaniemi", "Lapland"],
      address: "Tähtikuja 1, 96930 Napapiiri (Arctic Circle), Rovaniemi",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~12h overnight train (incl. metro to Helsinki Central)",
      notes:
        "Metro from Lauttasaari to Helsinki Central (~6 min), then VR's Santa Claus Express overnight train: departs ~19:30 or ~22:30, arrives Rovaniemi ~07:30–08:30; sleeper berths from €49, basic seat from €29. From central Rovaniemi, local bus 8 runs to the village year-round (~30 min, ~€4), or grab a taxi. Long journey but logistically simple — one straightforward overnight train with no fragile connections. Effectively a multi-day trip — almost no one does this as a same-day return.",
    },
    cost: {
      perPersonEur: 0,
      notes:
        "Village entry and meeting Santa are free. Photo packages from ~€40 single / €55 group of 5. Reindeer rides ~€20–40, husky safaris from €130, snowmobile tours from €150. Lunch in a village restaurant ~€15–25. Easy to spend €100+ per person across the day even with free entry.",
    },
    booking: {
      leadTime: "months",
      notes:
        "The village itself doesn't need booking, but December train berths, hotels, and husky/aurora tours sell out months in advance for the Christmas-week window. Aim 4–6 months out for a December trip; 2–3 weeks is fine November or shoulder-season.",
    },
    suitableAgeRange: { min: 2, max: 12 },
    childrenNotes:
      "The whole village is built for young children. Strollers handle the main paths but get bogged down in fresh snow — a sled or carrier is better in deep winter. Bring proper outerwear; daytime temps run −15 to −25°C in midwinter and kids bail fast if they're cold.",
    indoorOutdoor: "mixed",
    physicalIntensity: "low",
    duration: "half-day",
    website: "https://santaclausvillage.info/",
    tags: ["theme park"],
  },
  {
    slug: "helsinki-coastal-bike-ride",
    title: "Helsinki & Espoo Coastal Trail",
    shortDescription:
      "Helsinki's Rantareitti and Espoo's Rantaraitti link end-to-end into one of Northern Europe's longest dedicated seaside cycling and walking routes — over 130 km of paved, car-free paths skirting beaches, embassies, rocky islets, and harbour cafés.",
    longDescription: [
      "Most capitals have a token waterfront promenade. Helsinki has 130 kilometres of them. The Rantareitti (\"shore route\") wraps the entire coastal edge of the city as a continuous, dedicated, car-separated path, then crosses into Espoo where it becomes the Rantaraitti and continues another 40+ km past Westend, Haukilahti, Matinkylä, Suomenoja, and Kivenlahti almost to Kirkkonummi. The surface flips between paved promenade, fine gravel, and timber boardwalk depending on the section, but it's almost always flat, well-marked, and shared courteously between cyclists, joggers, dog-walkers, and parents with strollers.",
      "The most photogenic stretch — the one to do if you only have an afternoon — is the southern Helsinki loop: from Kauppatori along the South Harbour, around Kaivopuisto's rocky shoreline (where the trail opens onto the open Baltic with Suomenlinna on the horizon), past the Eira and Ullanlinna embassy villas, along the Hietaniemi waterfront and beach, and over the bridge into Lauttasaari. Roughly 15 km round-trip, two hours casual, and you can stop at half a dozen seaside cafés along the way (Café Ursula on Ehrenströmintie, Cafe Birgitta at Hietaniemi, Mattolaituri).",
      "If you want a longer day, ride west into Espoo's Rantaraitti — the trail runs through nature reserves, past coastal cliffs, modern marina developments, and historic manors, with seaside cafés like Mellsten and Haukilahden Paviljonki to break up the ride. East of the city centre, the parallel Eastern Coastal Route runs ~23 km from Kalasatama out to the Uutela nature reserve through Mustikkamaa, Kulosaari, and Vuosaari pine woods.",
      "For visitors, the easiest bike option is HSL Citybikes — bright yellow Alepa-branded share bikes with 460+ stations across Helsinki and Espoo, in season 1 April – 31 October. Day pass €5, week €10, season €35; each pass gives unlimited 30-minute rides, with a small extra fee if you stay on a single bike longer (the trick on a long ride is to dock and re-rent every 30 min). Register in the HSL app with a card and a 4-digit PIN. Outside the season, several private rentals operate year-round; the trails themselves are cleared and ridable in winter but icy in patches — pick a clear day. Mid-May through mid-September is the sweet spot.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Kaivopuisto_and_Suomenlinna_2020.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Espoon_rantaraitti_Espoonlahti_190519_b.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Westendin_rantaa_250719_d.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Espoon_rantaraitti_Kaitaa_rantametsikkö_300519_b.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Espoon_rantaraitti_Haukilahden_silta_070619.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Kävelysilta_Nuottaniemi_rantaraitti_300519_b.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Kaivopuisto_Syksy_2018_01.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Hyväntoivonpuisto_park_in_Jätkäsaari,_Helsinki,_Finland,_2020_November.jpg",
    ],
    availability: {
      suitableMonths: [4, 5, 6, 7, 8, 9, 10],
      notes:
        "Citybike season runs 1 April – 31 October — bikes are removed for winter. Mid-May through mid-September is the sweet spot for warmth and dry pavement. You can also bring or rent your own bike outside the city-bike season; the paths are cleared and ridable but cold and often icy.",
    },
    location: {
      region: ["Helsinki", "Espoo", "Uusimaa"],
      address: "Coastal cycle path — easiest to start at Kauppatori (Market Square) or Kaivopuisto, both with city-bike stations.",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "Start straight from Lauttasaari",
      notes:
        "Lauttasaari is directly on the coastal route — Citybike stations are dotted across the island, and the rantareitti runs around the whole shore. Cross the Hietaniemi bridge to pick up the central Helsinki section, or head west into Espoo's Rantaraitti. Register the HSL Citybike app first (debit/credit card + 4-digit PIN), buy a day/week/season pass, then unlock any yellow bike.",
    },
    cost: {
      perPersonEur: 5,
      notes:
        "Day pass €5, week €10, season €35 (each gives unlimited 30-min rides; €1 per additional 30 min if you stay on a single bike longer). Coffee/lunch stops along the route €5–15.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "No booking needed — just register the HSL Citybikes app on the day. Season passes go on sale 16 March each year.",
    },
    suitableAgeRange: { min: 8 },
    childrenNotes:
      "Citybikes are adult-sized and the system has no children's bikes or child seats — bring kids on their own bikes from a private rental. The paths themselves are kid-friendly: separated from cars, flat, well-marked. Keep an eye on the busier sections through Kalasatama and the Lauttasaari bridge approach.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "moderate",
    duration: "half-day",
    website: "https://www.hsl.fi/en/citybikes",
    tags: ["nature", "nautical"],
  },
  {
    slug: "vapriikki-tampere",
    title: "Vapriikki Museum Centre (Hockey Hall of Fame & Finnish Museum of Games)",
    shortDescription:
      "Tampere's main museum complex packs ten exhibitions into one ticket — including the Finnish Hockey Hall of Fame and the Finnish Museum of Games, the only national gaming museum in the Nordics.",
    longDescription: [
      "Vapriikki is housed inside the converted Tampella ironworks on the Tammerkoski rapids, a hulk of red brick that's a landmark in its own right. One €16 adult ticket gets you into all ten exhibitions under the roof — natural history, the Tampere city museum, the post museum, a mineral collection, the Finnish Shoe Museum, the Doll Museum — but the two that draw most visitors are the Finnish Hockey Hall of Fame and the Finnish Museum of Games.",
      "The Hockey Hall of Fame (Suomen Jääkiekkomuseo) sits on the third floor in a 440 m² hall and traces Finnish ice hockey from the 1930s to the present. Authentic Canada Cup and World Championship trophies, a wall of induction plaques (six new ones added each year since 1985), and a row of artefacts from Selänne, Kurri, and Koivu. The interactive draw is the slap-shot and goaltender simulators — you stand in front of a sensor wall and try to score, which is more fun than it sounds.",
      "The Finnish Museum of Games (Suomen Pelimuseo) is the country's gaming museum proper — about 100 playable games on cabinets, consoles, and PCs spanning 1980 to today, plus themed period rooms (a Pong booth, a Commodore 64 setup, a NES living room, a recreated arcade with Space Invaders and pinball, a 1990s game-store recreation). Notable Finnish titles get pride of place: Afrikan Tähti (the 1951 board game), Max Payne, Angry Birds, Alan Wake, My Summer Car. You can sit down and play almost everything.",
      "Allow three to four hours to do the two flagship exhibits and a third one of your choice (Tampere 1918 — the Civil War exhibit — is the standout among the smaller ones). Open Tue–Sun 10:00–18:00, closed Mondays. Adult €16, family €38 (2 adults + up to 4 kids), kids 7–17 and students €8, under-7 free; Museum Card OK. Friday 15:00–18:00 is free entry.",
      "From Helsinki, VR Pendolino or Intercity to Tampere takes ~1h 50m and runs every 30–60 minutes throughout the day; tickets from ~€5 booked in advance. Vapriikki is a 10-minute walk from Tampere station along the rapids — easy half-day trip, comfortably done with no overnight, though Tampere's worth a longer stay if you have it.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Museum_Centre_Vapriikki.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Vapriikki_-_interior.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Vapriikki_center_hall.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Pelimuseo_overview.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Suomen_Pelimuseo_2.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Sega_Dreamcast_arcade_machine.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Magnavox_Odyssey_in_museum.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Afrikan_tähti_Suomen_Pelimuseo.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Tampere_model.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule: "Tue–Sun 10:00–18:00. Closed Mondays.",
      notes:
        "Open year-round. Free entry every Friday 15:00–18:00. A handful of public-holiday closures and a few exceptional Mondays (Tampere school holidays) — check the site if your trip lands on a Monday.",
    },
    location: {
      region: ["Tampere"],
      address: "Alaverstaanraitti 5, 33100 Tampere",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~2h 10m each way",
      notes:
        "Metro from Lauttasaari to Helsinki Central (~6 min), then VR Pendolino or Intercity train Helsinki – Tampere (~1h 50m, every 30–60 min). Vapriikki is a 10-min walk from Tampere station along the Tammerkoski rapids. Doable as a half-day with no overnight.",
    },
    cost: {
      perPersonEur: 16,
      notes:
        "Adults €16, kids 7–17 / students €8, family ticket (2 adults + 1–4 kids) €38, under-7 free. Free entry every Friday 15:00–18:00. Museum Card covered.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "Walk-in. Train tickets are cheaper booked a few days ahead via VR.",
    },
    suitableAgeRange: { min: 6 },
    childrenNotes:
      "The games museum is a magnet for ~8+ kids who recognise some of the consoles, but younger kids enjoy just sitting at the controllers. The hockey simulators and dress-up corners suit ~5+. Strollers fit on all floors via lifts.",
    indoorOutdoor: "indoor",
    physicalIntensity: "low",
    duration: "half-day",
    website: "https://www.vapriikki.fi/en/",
    tags: ["museum"],
  },
  {
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
    tags: [],
  },
  {
    slug: "porvoo",
    title: "Porvoo (by m/s J.L. Runeberg)",
    shortDescription:
      "Finland's second-oldest town — a perfectly preserved medieval old town of cobbled lanes, red wooden riverside warehouses, and the 15th-century Porvoo Cathedral — reached from Helsinki by a 3.5-hour cruise on the historic 1912 steamer m/s J.L. Runeberg.",
    longDescription: [
      "Porvoo (Borgå in Swedish) is the second-oldest town in Finland — granted town rights around 1380, eclipsed only by Turku — and its old town is the postcard-perfect bit. A grid of wooden houses on medieval foundations spilling down a hill to the Porvoonjoki river, anchored by the stone-and-brick Porvoo Cathedral (built 1410–1418, partially burnt and restored in 2008) at the top and the famous red-painted timber warehouses along the water's edge at the bottom. About two-thirds of the town burned in a 1760 fire, but it was rebuilt on the same medieval street pattern, so what you walk through today is genuinely centuries-old in plan if not in every plank.",
      "The town is small — you can do the entire old town in 90 minutes, longer if you stop. The classic loop: walk up Kirkkokatu to the cathedral, down through the Devil's Steps alleyway, along Välikatu's pastel wooden facades, finish at Brunberg's chocolate factory shop (Porvoo's other claim to fame — soft toffees and chocolate kisses since 1871). Lunch options range from Café Helmi for cardamom buns to Sicapelle for proper sit-down. There's a small Runeberg cake shop near the Runeberg House museum (the home of national poet J.L. Runeberg, after whom the boat is named).",
      "The marquee way to get there is the m/s J.L. Runeberg, a steel-hulled passenger steamer built in 1912 and still in seasonal service. She sails from Linnanlaituri at Helsinki's South Harbour at 10:00, takes 3.5 hours along the archipelago to Porvoo, gives you 2.5 hours ashore, then sails back at 16:00 and docks Helsinki at ~19:30. Round-trip €50 adult / €25 child 7–15 / under-7 free; senior €46. Optional onboard lunch (Finnish salmon soup with bread, Runeberg cake, coffee) is €16 if pre-booked, €18 onboard. Operates May–September: Tue/Wed/Fri/Sat year-round, plus Sundays in June–August. In rough weather she sometimes substitutes the smaller Queen.",
      "If you'd rather a quick out-and-back without dedicating the whole day, take the OnniBus from Kamppi terminal — €6–9, ~50 minutes, hourly through the day — and you can be back in Helsinki for dinner. The boat is the experience, but the bus is the practical answer for a short visit.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Old_Porvoo_riverside.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Porvoo_in_January.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Porvoo_Cathedral_and_old_town_Dec_2017.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Vanha_Porvoo_Kirkkokatu.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Porvoon_Tuomiokirkko.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Barns_on_the_shore_of_the_river.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Porvoo_Old_Town_Hall.jpg",
    ],
    availability: {
      suitableMonths: [5, 6, 7, 8, 9, 10, 11, 12],
      notes:
        "Old town itself is open and walkable year-round and is especially atmospheric under snow in December. The m/s J.L. Runeberg cruise runs only May–September; outside that window, take the OnniBus from Helsinki Kamppi terminal (~50 min, hourly).",
    },
    location: {
      region: ["Helsinki", "Porvoo", "Uusimaa"],
      address: "Old Porvoo, 06100 Porvoo (~50 km east of Helsinki)",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~1h 5m by bus, or ~4h cruise each way",
      notes:
        "Two routes, both starting with a short metro hop. (1) Metro to Helsinki Central (~6 min), walk to Kamppi bus terminal (~5 min), then OnniBus to Porvoo — hourly, ~50 min, €6–9, year-round. (2) Metro to Helsinki Central, walk to Linnanlaituri at the South Harbour (~10 min) for the m/s J.L. Runeberg cruise at 10:00, returning from Porvoo 16:00 — May–Sept, Tue/Wed/Fri/Sat plus Sun Jun–Aug.",
    },
    cost: {
      perPersonEur: 50,
      notes:
        "Round-trip cruise €50 adult / €46 senior / €25 child 7–15 / under-7 free. Optional lunch package €16 pre-booked / €18 onboard. Bus alternative €12–18 round-trip. Lunch in old Porvoo €15–25.",
    },
    booking: {
      leadTime: "weeks",
      notes:
        "Book the cruise online a week or two ahead in summer — Saturdays and Sundays in July sell out. Bus tickets fine same-day.",
    },
    suitableAgeRange: { min: 5 },
    childrenNotes:
      "Old town is stroller-doable on the flat riverside but the cobbled hill streets are bumpy and the Devil's Steps are stairs only — bring a carrier for under-3s. Kids enjoy the chocolate factory shop and the boat ride; the cathedral and museums skew adult.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "low",
    duration: "full-day",
    website: "https://msjlruneberg.fi/en/",
    tags: ["historical", "landmark", "nautical"],
  },
  {
    slug: "heureka",
    title: "Heureka – The Finnish Science Centre",
    shortDescription:
      "Finland's flagship hands-on science museum in Tikkurila — three floors of touch-everything exhibitions, a domed planetarium, and a summer outdoor science park, all 25 minutes from Helsinki Central by train.",
    longDescription: [
      "Heureka opened in 1989 in the Tikkurila district of Vantaa, in a striking concrete-and-steel cube designed by Heikkinen–Komonen Architects (the building has won awards for both materials separately). The brief was to popularise science the way the Exploratorium did in San Francisco — touch the exhibits, run the experiments yourself, no \"do not lean on the glass\" signs. Three decades later it pulls about 300,000 visitors a year and is the obvious rainy-day move for any Helsinki-area family with curious kids.",
      "Inside, the permanent and rotating exhibitions cover physics, biology, technology, the human mind, and Earth science — pendulums you set in motion, optical illusions, simulators, a big roomy space about probability and chance, an electricity demonstration that culminates in a live Tesla coil. The Planetarium runs digital fulldome films through the day on rotation (included with admission) — think astronomy and natural history rather than commercial blockbusters. Summer adds the outdoor Galileo Science Park: water-flow experiments, big-format puzzles, a dinosaur trail.",
      "Tickets €26 adult / €23 in advance / under-5 free with an adult; child and senior pricing slots in between. Thursday evenings 15:00–20:00 is a flat €10 for everyone, advance or door — easily the best value if you can swing a weekday late visit. Allow 3–4 hours (longer with kids who don't want to leave). Open daily; high-summer hours (1 Jun – 9 Aug 2026) are Mon–Fri 09:00–18:00, Sat–Sun 10:00–18:00; the rest of the year it follows a similar pattern with a couple of seasonal closures.",
      "From Lauttasaari, hop on the metro to Helsinki Central (~6 min) and pick up any commuter train heading north to Tikkurila — lines I, P, K, R, T, D, N, Z all stop there, about 20 minutes from Central Station. Then it's a 700-metre signposted walk to the Heureka entrance.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Science_centre_Heureka_in_Tikkurila,_Vantaa,_Finland,_2022_June.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Cubes_at_Heureka,_optical_illusion.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Smilodon_model_at_Heureka.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Heureka,_Tiedepuisto_Galilei.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Heureka_bedrock_exhibition_in_Vantaa.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Summer (1 Jun – 9 Aug 2026): Mon–Fri 09:00–18:00, Sat–Sun 10:00–18:00. Off-season: typically Tue–Fri 10:00–17:00, Sat–Sun 10:00–18:00, closed Mondays. Thursday evenings 15:00–20:00 are flat €10.",
      notes:
        "Closed a few public holidays — verify before Easter weekend or late December. Year-round indoor destination; the outdoor Galileo Science Park is summer-only.",
    },
    location: {
      region: ["Vantaa", "Uusimaa"],
      address: "Tiedepuisto 1, 01300 Vantaa (Tikkurila district)",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~45 min",
      notes:
        "Metro from Lauttasaari to Helsinki Central (~6 min), then any northbound VR commuter train (I, P, K, R, T, D, N, or Z) to Tikkurila (~20 min). 700-m signposted walk from the station. Whole trip is one HSL ABC zone ticket.",
    },
    cost: {
      perPersonEur: 26,
      notes:
        "Adults €26 (€23 advance online); seniors/students discounted; children 7–17 cheaper; under-5 free with an adult. Thursday 15:00–20:00 is €10 flat for everyone. Includes all exhibitions, planetarium films, and the summer outdoor science park.",
    },
    booking: {
      leadTime: "few-days",
      notes:
        "Book online a few days ahead for the €3 advance discount and to skip the ticket queue at peak weekends and school holidays. Thursday €10 evening doesn't sell out but does fill up.",
    },
    suitableAgeRange: { min: 4 },
    childrenNotes:
      "The whole place is built for families — strollers fit everywhere, there are family bathrooms, and most exhibits work for ages 4 up. Older kids (~10+) get the most out of the physics and probability rooms; younger ones gravitate to the rat basketball arena and the outdoor science park in summer.",
    indoorOutdoor: "mixed",
    physicalIntensity: "low",
    duration: "half-day",
    website: "https://www.heureka.fi/en",
    tags: ["museum"],
  },
  {
    slug: "skipperi",
    title: "Helsinki Archipelago by Boat (Skipperi)",
    shortDescription:
      "Skipperi runs the Nordics' biggest boat-sharing platform: a Fleet membership lets you reserve a fully-equipped motorboat from a Helsinki harbour app-and-go style, and the peer-to-peer Rent side lets you book a private owner's sailboat for the day.",
    longDescription: [
      "Helsinki sits at the head of an archipelago of more than 300 islands and 130 km of shoreline — and most of it is invisible from land. Renting or chartering a boat is the way out, but full ownership is overkill for a holiday. Skipperi (founded in Helsinki, 2015) is the practical answer: a tech-led boat-sharing platform that runs two parallel products under one app — a Fleet subscription (their own equipped motorboats) and Rent (peer-to-peer access to private owners' boats, including sailboats).",
      "Skipperi Fleet works like a car-share for boats. Pay a monthly or season subscription, then reserve any of the Fleet motorboats at any harbour through the app — show up, the boat is fueled and prepped, you take it out for the booked window, return it to the same berth. Maintenance, insurance, lifejackets, and the chartplotter are all included; you only pay for fuel. Helsinki-area Fleet harbours include Lauttasaari, Vuosaari, Hanasaari, and a handful of mainland and island bases that put you 10–30 minutes from Suomenlinna, Pihlajasaari, or the open archipelago east toward Porvoo. Pricing tiers run from a weekday-only month to a full-season pass; expect roughly €300–500 per month depending on tier (current pricing on the site — they also do trial weeks).",
      "Skipperi Rent is the Airbnb-style side: private owners list their boats — sailboats, ribs, day cruisers, the occasional bigger yacht — and you book by the day or weekend through the app, with insurance and identity verification handled by the platform. This is the route to a sailboat: Fleet doesn't include sailing yachts, but Rent has dozens listed in the Helsinki area, typically €200–400 a day for a 25–35 ft cruiser. The owner usually meets you at the boat for a handover.",
      "Finland doesn't legally require a boat licence for private craft of any size, but Skipperi requires you to pass their own boating exam (free, online + a short practical) before unlocking the Fleet. Allow an evening for the theory and book a practical session at a Helsinki harbour. Once cleared, you're in their global network — your membership also works in Sweden, Norway, Denmark, and a few overseas markets.",
      "Best months are late May through early September — the season Fleet boats are in the water. Plan for the wind: the open archipelago east of Suomenlinna can get choppy in afternoon onshore breezes; sheltered routes through Lauttasaari and Espoo's Suvisaaristo are the right call for first-time outings. Pack lifejackets-for-everyone (the Fleet boats carry them; check before leaving the dock), sunscreen, and warm layers — even a 25°C day on land is 18°C with wind on the water.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Purjehdus_Helsingin_edustalla_1.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Purjehdus_Helsingin_edustalla_2.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Nordic_folkboats_(14775215050).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Strömsinlahden_venesatama_C_IMG_2160.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Suomenlinna_mereltä_5.jpg",
    ],
    availability: {
      suitableMonths: [5, 6, 7, 8, 9],
      notes:
        "Fleet boats are in the water roughly 1 May – 30 September; the exact window shifts a week or two with the weather. Mid-June to mid-August is peak — long daylight, warm water — so popular Saturday morning slots get booked a week or two ahead. Outside the season, no boating, just Skipperi Academy theory courses.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Multiple Helsinki-area Fleet harbours (Lauttasaari, Vuosaari, Hanasaari, others). Rent boats listed at private berths across the metro area.",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "0–25 min to a harbour, then on the water",
      notes:
        "The Lauttasaari Fleet harbour is on the same island — a short walk or bus 21 ride from anywhere central in Lauttasaari. Other harbours (Vuosaari, Hanasaari) are reachable by metro or bus, ~25 min away. Once on board you're 10–30 min by boat to Suomenlinna, Pihlajasaari, or the inner archipelago.",
    },
    cost: {
      perPersonEur: 80,
      notes:
        "Highly variable. Fleet membership: ~€300–500/month for full access in season, or pro-rated trial weeks. Rent (peer-to-peer sailboats): ~€200–400/day for a 25–35 ft cruiser, plus fuel. €80 is a per-person estimate assuming 2–4 people split a typical day on a Rent sailboat or share Fleet usage.",
    },
    booking: {
      leadTime: "weeks",
      notes:
        "Book Fleet slots in the app a few days ahead — same-day works on weekdays, weekends fill 1–2 weeks out. Rent sailboats listed by individual owners; popular boats book several weeks ahead for July–August. Skipperi Academy boating exam must be completed before you can take a Fleet boat out — budget an evening plus a short practical session.",
    },
    childrenNotes:
      "Fleet boats carry kid-sized lifejackets but verify before pushing off. Pick a sheltered route (Lauttasaari, Suvisaaristo) for kids under ~8 — open archipelago waves get genuinely uncomfortable. Bring sunscreen and warm layers regardless of the air temperature on land.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "low",
    duration: "half-day",
    website: "https://www.skipperi.com/",
    tags: ["nautical"],
  },
  {
    slug: "helsinki-hop-on-hop-off",
    title: "Helsinki Hop-On Hop-Off Bus",
    shortDescription:
      "A red open-top double-decker that loops nineteen stops past every major Helsinki sight in 90 minutes — the lazy, jet-lagged-traveller way to orient yourself on day one before deciding what to come back to.",
    longDescription: [
      "There are two operators running near-identical Hop-On Hop-Off routes in Helsinki: Strömma (Strawberry Group) and Red Sightseeing (City Sightseeing affiliate). Both run open-top red double-deckers that depart from Senate Square, follow a 19-stop loop past every major central sight, and let you reboard with the same ticket as many times as you like over a 24-hour or 48-hour window. They're functionally interchangeable — pick whichever gate is in front of you when you decide.",
      "The route hits the obvious set: Senate Square / Helsinki Cathedral, Uspenski Cathedral, Market Square and the harbour, Esplanadi, Kamppi Chapel of Silence, the Sibelius Monument, the Olympic Stadium, the Temppeliaukio (Rock) Church, the National Museum, Kiasma, the Helsinki Art Museum, and the Botanic Garden. The full loop without getting off is about 90 minutes; with hop-offs at three or four favourites it's an easy day. Recorded audio commentary plays through earbuds at every seat in 8–11 languages.",
      "Tickets €36 adult / €32.40 online (24h); 48-hour and combo tickets with the canal cruise are about 30% more. Kids 7–17 are typically half-price; under-7 free with an adult. The 2026 season runs roughly 2 May – 10 October; service is daily, every 30–40 minutes, with the first bus leaving Senate Square around 10:00 and the last around 16:00. Outside the season the buses are off the road entirely — there's no winter hop-on bus.",
      "Honest take: it's not a deep dive into Helsinki, but it's exactly what it claims — the fastest way to map the city, especially if you're off a cruise ship or jet-lagged on day one. If you only have one day in Helsinki, save the bus and walk; if you have three, the bus is a worthwhile €30 and a comfortable seat for the longer cross-town transfers (e.g. Senate Square → Sibelius Monument is 25 minutes by bus and worth it once).",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Hop_On_Hop_Off_Helsinki_sightseeing-kierros_kaksikerrosbussilla_2017_(HK8048-72).jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/11-07-29-helsinki-by-RalfR-040.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki,_Neoplan_N4026_3_č._27.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki,_Neoplan_N4026_3L_č._46.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Cathedral_in_2019.08.jpg",
    ],
    availability: {
      suitableMonths: [5, 6, 7, 8, 9, 10],
      weeklySchedule:
        "Daily during season. 2026 runs ~2 May – 10 October. First departure from Senate Square around 10:00, last around 16:00, every 30–40 minutes.",
      notes:
        "Strictly summer-season — the buses are off the road from mid-October to late April. Open-top deck is closed in heavy rain; lower deck stays warm and dry.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Main boarding point: Senate Square (Senaatintori), 00170 Helsinki. Tickets also sold at Market Square and onboard.",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~15 min",
      notes:
        "Metro from Lauttasaari to Helsinki Central (~6 min), then a 5-min walk up Aleksanterinkatu to Senate Square. Buy tickets online for the discount; otherwise pay the driver in cash or card at the door.",
    },
    cost: {
      perPersonEur: 32,
      notes:
        "24h adult €32.40 online / €36 at the door. 48h adult ~€42–48. Kids 7–17 half-price; under-7 free with an adult. Combo tickets with Strömma's harbour canal cruise add ~€10–15.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "Walk-on. Buy online for a small discount or just board. Buses don't sell out.",
    },
    suitableAgeRange: { min: 4 },
    childrenNotes:
      "Open-top deck is a hit with kids; bring a hat and warm layer even in summer (sea wind is colder than it looks). Strollers fit on the lower deck. The audio commentary is too dry for under-8s — bring something for them to look at out the window.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "low",
    duration: "half-day",
    website: "https://www.stromma.com/en-fi/helsinki/sightseeing/sightseeing-by-bus/hop-on-hop-off/",
    tags: [],
  },
  {
    slug: "tallinn-ferry-day-trip",
    title: "Tallinn Day Trip by Ferry",
    shortDescription:
      "Catch a ~2-hour ferry across the Gulf of Finland to Tallinn's medieval UNESCO old town in the morning, wander cobbled lanes and Toompea Hill all day, and ferry back by evening — three operators, ~10 sailings a day, easy walk-on round-trip from €30.",
    longDescription: [
      "Helsinki and Tallinn sit only 80 km apart across the Gulf of Finland, and the ferry corridor between them is one of the busiest in Europe — three operators (Tallink Silja, Eckerö Line, Viking Line) run roughly 10–12 sailings a day in each direction, with crossings between 2h and 2h 30m. Walk-on tickets are cheap, the ferries are oversized cruise ships with restaurants, duty-free, and viewing decks, and Tallinn's UNESCO-listed old town starts a 10-minute walk from the port. It's the easy double-up day from Helsinki — leave at 07:30, back by 22:30, and you've added a country.",
      "Tallinn's Old Town is the draw: a near-fully-intact medieval merchant quarter ringed by walls and towers, with Toompea Hill rising at the western edge crowned by the onion-domed Alexander Nevsky Cathedral and the parliament building. The Lower Town below is denser and busier — Town Hall Square (Raekoja plats), the 14th-century Old Town Hall, the Niguliste Church (now a museum, with the panoramic spire view), the Three Sisters merchant houses on Pikk, and the cluster of Russian-spy-novel cellar bars off Vene. A full lap of the walls plus a Toompea viewpoint plus lunch is a comfortable day; serious museum-going needs two.",
      "Practical: the cheapest, simplest day-trip operator is Eckerö Line on M/S Finlandia from Helsinki West Terminal — round-trip walk-on tickets often €25–35 if you book a few days ahead, two daily round-trip pairings that work for a full day in Tallinn (depart Helsinki ~08:30, depart Tallinn ~17:30 for example). Tallink Silja's MyStar/Megastar are faster (~2h), more frequent (8 daily), and a notch nicer — €35–60 round-trip. Viking Line is in between. All three depart from West Terminal 2 (T2) — 5 min by tram 7 from Central Station — and arrive at Tallinn's D-Terminal, a 10-min walk from the old town gate.",
      "Bring a passport even though Finland and Estonia are both Schengen — onboard purchases (especially alcohol) want ID. The shopping ferries' famous draw for Finns is duty-free booze; Estonian alcohol is cheaper, the currency is the euro, and the ferries themselves run a tax-free shop on the half-hour stretch in international waters. If you're doing only one of the side trips described in this catalogue (Tallinn or Stockholm), Tallinn is the easier choice — same-day return, no overnight planning, and the medieval old town is tighter and more walkable than Stockholm's Gamla Stan.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Tallinn-panorama-2011.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Tallinn_old_town_roof_tops_2008.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Tallinn_Old_Town_(drone_shot)_(22377086281).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Punased_katused_Tallinna_vanalinnas.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Tallinna_vanalinn_päikesetõusu_ajal.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Vistas_panorámicas_desde_Toompea,_Tallinn,_Estonia,_2012-08-05,_DD_16.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Oleviste_kirik_ja_Raekoja_plats_Niguliste_kiriku_tornist_74.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      notes:
        "Year-round route — ferries run daily through winter. Summer (May–September) is peak: long days, warm cobbles, packed cafés. Winter trips have shorter daylight (Tallinn closes early in December/January) but the Old Town under snow is genuinely beautiful and the December Christmas Market on Raekoja plats is one of the best in Northern Europe.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Departure: West Terminal (Länsiterminaali) T2, Tyynenmerenkatu 14, 00220 Helsinki. Arrival: D-Terminal, Lootsi 13, Tallinn.",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~2h each way on the ferry; ~10 min to/from terminals",
      notes:
        "West Terminal 2 sits right across the bridge from Lauttasaari. Take bus 21V or 65A to Länsiterminaali, or hop one stop on the metro to Ruoholahti and walk ~10 min. All three ferries (Tallink Silja MyStar/Megastar, Eckerö M/S Finlandia, Viking Line XPRS) depart from T2. In Tallinn the ferries dock at D-Terminal, a 10-min walk or short bus 2 ride to the Old Town gate.",
    },
    cost: {
      perPersonEur: 35,
      notes:
        "Walk-on day-return €25–35 (Eckerö, advance), €35–60 (Tallink Silja MyStar/Megastar). Add €5–15 for an upgraded seat or lounge access. Onboard food/duty-free is extra. Lunch and sightseeing in Tallinn ~€20–40.",
    },
    booking: {
      leadTime: "few-days",
      notes:
        "Book online a few days ahead for the cheap fares — same-day works but you'll pay the door price. Saturday and Sunday round-trips in July fill up; book a week ahead in summer.",
    },
    suitableAgeRange: { min: 5 },
    childrenNotes:
      "The ferries themselves are kid-friendly — play areas, cafés, lots of windows. Tallinn's cobblestone Old Town is hard on strollers (bring a carrier). Old Town has limited public toilets — duck into a café.",
    indoorOutdoor: "mixed",
    physicalIntensity: "low",
    duration: "full-day",
    website: "https://www.tallink.com/",
    tags: ["historical", "landmark", "nautical"],
  },
  {
    slug: "stockholm-overnight-ferry",
    title: "Stockholm Overnight Ferry",
    shortDescription:
      "Board a Tallink Silja or Viking Line cruiseferry at Helsinki's Olympia Terminal at 17:00, sleep in a cabin while the ship threads the Åland archipelago, dock in central Stockholm at ~10:00 — a full day in Gamla Stan, then sail back the same way.",
    longDescription: [
      "The Helsinki–Stockholm overnight ferry is one of the great European travel rituals — Finns and Swedes have ridden it for generations as a working booze-cruise (alcohol stays duty-free as long as the route touches Åland's tax-loophole waters), and visitors take it because it's a frankly novel way to add Stockholm to a Helsinki trip. Two operators run it: Tallink Silja with the sister ships Silja Serenade (1990) and Silja Symphony (1991), and Viking Line with the new Viking Glory. All are massive 200-metre cruiseferries with 13 decks, multiple restaurants, bars, a spa, a small casino, kid play areas, and the famous central indoor promenade that runs almost the full length of the ship like a high-street.",
      "The schedule is the appeal: depart Helsinki Olympia Terminal at 17:00, sail across the Gulf of Finland and through the Åland archipelago overnight (a brief stop at Mariehamn around midnight reset the duty-free clock — most passengers sleep through it), and dock in central Stockholm's Värtahamnen at ~10:00. You have a full day in Stockholm — Gamla Stan (the medieval old town), the Vasa Museum, the Royal Palace, Skansen — and reboard at 16:00ish for the return overnight, back in Helsinki by mid-morning. Total trip: two nights aboard plus one day in Stockholm.",
      "Cabins come in tiers: a windowless C-class inside cabin (bunk beds, en-suite, ~9 m²) starts around €70–90 per person twin-share booked early; a sea-view A-class is €100–130; family cabins for four around €150 per person; suites and Commodore class are luxury territory at €250+. Foot-passenger walk-on tickets without a cabin start at €25 each way (you ride in the public lounges for 17 hours), but the cabin is most of the point. Food is à la carte or via the famous breakfast/dinner buffets (~€35 dinner, €15 breakfast, drink package extra).",
      "The ship is the experience as much as Stockholm is. Try to grab a sea-view cabin so you can see the Åland skerries at sunrise; book dinner at the buffet for the full Finnish-Swedish smörgåsbord experience; and budget at least a couple of hours for the duty-free liquor shop on the way back — half the locals onboard are doing exactly that, with carts piled high. Year-round daily service; summer (June–August) is the peak when cabins on prime weekends sell out months ahead. Winter sailings hit ice in the archipelago — quietly spectacular if you're up before sunrise.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Silja_Serenade,_Stockholm,_2019_(02).jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Silja_Serenade_promenade.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/MS_Silja_Symphony_interior_view.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Serenade_Sundeck.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Stortorget_i_Gamla_Stan_i_Stockholm-2.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Sweden._Stockholm._Gamla_stan_051.JPG",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Year-round daily service. Tallink Silja and Viking Line each run one departure per day in each direction. Helsinki → Stockholm departs ~17:00, arrives ~10:00 next day. Stockholm → Helsinki departs ~16:30, arrives ~10:00.",
      notes:
        "Daily year-round. Summer school-holiday weekends sell out cabins 2–3 months ahead. Winter sailings push through Baltic ice — atmospheric, especially around dawn through the Åland archipelago.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Departure: Olympia Terminal, Olympiaranta 1, 00140 Helsinki. Arrival: Värtahamnen, Hamnpirsvägen 10, 11556 Stockholm.",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~17h each way (overnight)",
      notes:
        "Metro from Lauttasaari to Helsinki Central (~6 min), then tram 2 to Olympia Terminal (~10 min). Whole transfer covered by one HSL AB ticket. Two-night minimum for the full Stockholm experience — sleep in a cabin both nights, full day in the city in between.",
    },
    cost: {
      perPersonEur: 200,
      notes:
        "Round-trip with a 2-person cabin twin-share: ~€140–250 per person depending on cabin tier and how far ahead you book. Foot-passenger walk-on (no cabin) from €50 round-trip but unrealistic for an overnight. Onboard buffet dinners ~€35, breakfast ~€15. Hotel in Stockholm not needed if you ferry both nights.",
    },
    booking: {
      leadTime: "weeks",
      notes:
        "Book 4–8 weeks ahead for cabin choice and decent prices; summer (Jun–Aug) and Christmas/New Year sell out 2–3 months ahead. Walk-on the day-of works in shoulder season but you'll get what's left, often an inside cabin near the engine.",
    },
    suitableAgeRange: { min: 4 },
    childrenNotes:
      "Both Silja and Viking ships are aggressively kid-friendly: dedicated play areas, kids' meals, family cabins with bunk beds. The ship itself is the experience for ~5–10 year olds — they'll happily explore decks for hours. Bring noise-cancelling headphones for the Mariehamn stop at midnight if you're a light sleeper.",
    indoorOutdoor: "indoor",
    physicalIntensity: "low",
    duration: "multi-day",
    website: "https://www.tallink.com/",
    tags: ["nautical"],
  },
  {
    slug: "savonlinna",
    title: "Savonlinna & Olavinlinna Castle",
    shortDescription:
      "A small lakeside town built on islands in the heart of Saimaa Lakeland, anchored by the 1475 Olavinlinna castle — a near-perfectly preserved three-tower medieval fortress that hosts the Savonlinna Opera Festival in its courtyard every July.",
    longDescription: [
      "Savonlinna sits on a chain of islands where the wide arms of Lake Saimaa narrow into a pair of fast-running straits — Kyrönsalmi and Haapasalmi. The town's name (\"Savo Castle\") refers to Olavinlinna, the medieval fortress founded in 1475 by Erik Axelsson Tott to defend Sweden's eastern border against Novgorod. It's the only Finnish medieval castle still standing largely as built — three round towers connected by curtain walls, perched directly on a rocky islet in the strait, with the lake lapping the foot of the bastions on both sides. The setting is the magic: from the bridge you walk across to enter, the castle reads as a stone ship moored in the lake.",
      "Inside, the museum experience is straightforward: a self-guided route through the King's Hall, the chapel, the ramparts, and the bell tower; a small permanent exhibition on the castle's history; and guided tours in English and Finnish through the day. Allow two hours. The town itself is small — a 30-minute walk takes you past the cathedral, the Riihisaari lake-and-Saimaa-seal museum, the harbour with its old steamships, and the market square (Kauppatori) for a bowl of muikku (fried whitebait). It's an easy two-day trip: castle and town one day, a Lake Saimaa cruise the next.",
      "The town's headline event is the Savonlinna Opera Festival (3 July – 1 August 2026), now in its second century. The covered courtyard becomes a 2,200-seat opera house under the medieval walls — the 2026 programme runs Madama Butterfly, Nabucco, The Marriage of Figaro, La Traviata, and concert performances of Norma with Lisette Oropesa. The acoustic and the setting (candlelit ramparts, cool lake air, the floodlit castle reflecting in Kyrönsalmi) genuinely is a one-off experience even for non-opera people. Tickets €70–230 depending on seat tier and night, on sale months ahead — premium nights sell out by spring.",
      "From Helsinki the train takes ~4h 10m via VR (transfer at Parikkala onto a Pieksämäki connection), so this is comfortably a multi-day trip rather than a day excursion. Stay at the central Hotel Original Sokos Seurahuone (next to the market), or for atmosphere splurge on the SS Heinävesi or Punkaharju Resort 30 minutes south — Punkaharju's pine-ridge esker is the most-photographed landscape in Finland and is worth the detour if you have a spare half-day.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Olavinlinna_20180811.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Olavinlinna_(3).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Olavinlinna_Olofsborg_courtyard_01.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Olavinlinna_Kingshall.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Church_tower_staircase_Olavinlinna.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Savonlinna_Opera_Festival_Canopy.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Kyrönsalmi_bridge_and_Olavinlinna.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Olofsborg_från_sjösidan.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/SS_Saimaa_at_Olavinlinna.JPG",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      events: [
        {
          from: "07-03",
          to: "08-01",
          name: "Savonlinna Opera Festival",
        },
      ],
      weeklySchedule:
        "Castle: Jan 2 – Apr 30 Tue–Fri 10:00–16:00, Sat–Sun 11:00–16:00 (closed Mondays). May daily 10:00–16:00. Jun–Sept daily 11:00–18:00. Oct 1 – Dec 15 Tue–Sun 10:00–16:00.",
      notes:
        "Year-round destination but the experience swings hard with the season. July is peak (opera festival, lake at its warmest, 19+ hours of daylight). Snowy lake-and-castle scenery in February is genuinely beautiful but most lake activities pause. Castle closed New Year, Easter, May Day, and 16–26 Dec.",
    },
    location: {
      region: ["Savonlinna", "Lakeland"],
      address: "Olavinkatu 27, 57130 Savonlinna",
    },
    accessFromLauttasaari: {
      complexity: "complex",
      duration: "~4h 20m each way by train",
      notes:
        "Metro from Lauttasaari to Helsinki Central (~6 min), then VR train Helsinki → Parikkala (~3h) with a 5–10 min transfer onto the Parikkala → Savonlinna connecting train (~1h). About 11 services a day. Effectively a multi-day trip — a same-day return is not realistic. Driving (~4h) is the alternative.",
    },
    cost: {
      perPersonEur: 15,
      notes:
        "Castle entry adults €15 (€10 advance/group/student/senior, €7 child 7–17, family ticket €35, under-7 free). Museum Card covered. Opera Festival tickets are separate: €70–230 per night, €40–60 for restricted-view seats; book months ahead via operafestival.fi.",
    },
    booking: {
      leadTime: "weeks",
      notes:
        "Castle walk-in fine. Opera Festival tickets and Savonlinna hotels for July sell out 3–6 months ahead — book by March for opening-week premium nights. Outside opera season, hotels are easy a few days ahead.",
    },
    suitableAgeRange: { min: 5 },
    childrenNotes:
      "Castle interior has steep stone staircases and uneven thresholds — bring a carrier rather than a stroller for under-3s. Older kids enjoy the towers, dungeons, and the wooden bridge that swings out for boats. Opera evenings are not a kids' activity (long, late, formal-ish).",
    indoorOutdoor: "mixed",
    physicalIntensity: "moderate",
    duration: "multi-day",
    website: "https://www.kansallismuseo.fi/en/olavinlinna",
    tags: ["museum", "landmark", "historical"],
  },
  {
    slug: "cafe-regatta",
    title: "Cafe Regatta",
    shortDescription:
      "A pocket-sized red wooden cottage on Taivallahti bay near the Sibelius Monument — order a cinnamon bun and coffee through the door, sit by the outdoor fire pit, and grill your own sausage on the always-lit grill.",
    longDescription: [
      "Cafe Regatta sits in a 1887 red-painted log cabin originally built as a fishnet shed for the Paulig coffee dynasty, on the Taivallahti bay shore a couple of minutes' walk from the Sibelius Monument. It's tiny — the inside is one cluttered room of mismatched chairs, vintage enamel signs, and old kitchen tools nailed to every available beam — so most of the seating is outside on the rocky shore, on benches around the always-burning fire pit, and at picnic tables looking out at the masts of the Töölö yacht club.",
      "The pull is twofold: the building itself, which is the postcard image of cosy Finnish coffee culture, and the cinnamon buns (korvapuusti) — denser and less sweet than the Swedish version, baked through the day, and inexpensive enough that locals bring visitors here precisely because the bill never feels touristy. The other classics on the counter are blueberry pie (mustikkapiirakka), salmon soup, and rye-bread sandwiches. Order at the hatch, take a number, the staff bring it out.",
      "The fire pit is the secret weapon — it's lit year-round, and the café sells sausages and skewers you can grill yourself over the embers. In winter you sit bundled with a hot glögi while snow lands on the lid of your cup; in summer the rocks are sunbathing-hot and the café's sub-brand SUP Regatta rents kayaks, SUPs, and rowing boats off the dock 5 metres away. There's no booking and no table service — at peak summer-Saturday hours the queue snakes back to the road, but the line moves fast.",
      "From central Helsinki, walk along the Töölö coastal path (~25 min from the train station) or take tram 4 to Töölön halli and walk five minutes down. Combine with the Sibelius Monument (3 min walk), the Hietaniemi cemetery and beach (15 min walk south), or as a stop on the coastal bike loop.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Cafe_Regatta_in_Helsinki.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Cafe_Regatta_2018-1.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Café_Regatta_in_Helsinki,_Finland,_2022_October.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Café_Regatta_feb_2015.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/2018_January_in_Helsinki_(46315531434).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Cafe_Regatta.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule: "Daily ~08:00–21:00 (slightly shorter in deepest winter).",
      notes:
        "Genuine year-round destination — the fire pit and cottage charm work just as well in February snow as in July sun. Lunchtime weekend queues in summer are heaviest 11:00–14:00.",
    },
    location: {
      region: ["Helsinki", "Töölö", "Uusimaa"],
      address: "Merikannontie 8, 00260 Helsinki",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~25 min",
      notes:
        "Metro from Lauttasaari to Ruoholahti (~3 min), then tram 4 to Töölön halli and a 5-min walk down the slope to the bay. In summer the prettier route is to bike or walk the coastal path over the Hietaniemi bridge (~30 min from northern Lauttasaari). 2-min walk from the Sibelius Monument.",
    },
    cost: {
      perPersonEur: 8,
      notes:
        "Coffee + cinnamon bun ~€7. Salmon soup ~€12. Sausage to grill ~€4. Cash and card. SUP/kayak rental from a separate counter (~€20/hour) in summer.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "No bookings — walk-up only. At peak summer-Saturday hours the queue can be 20–30 minutes; weekday mornings are wide open.",
    },
    suitableAgeRange: { min: 0 },
    childrenNotes:
      "Kid-friendly in every sense — outdoor space, the fire pit (supervised), buns big enough to share, and rocks to scramble on. Stroller-friendly approach but the actual cafe interior is too small for one inside; park outside.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "low",
    duration: "<1h",
    website: "https://www.caferegatta.fi/in-english",
    tags: ["food", "nautical"],
  },
  {
    slug: "kasinonranta",
    title: "Kasinonranta (Lauttasaari Beach)",
    shortDescription:
      "Helsinki's most central proper sand beach — a wide south-facing crescent on Lauttasaari with a beach café in a 1930s pavilion, a pier to jump off, and a children's playground, ten minutes by metro from the city centre.",
    longDescription: [
      "Kasinonranta (\"Casino Beach\", a nod to the 1930s seaside casino-restaurant that once stood here) sits on the south shore of Lauttasaari, a residential island five minutes by metro west of the city centre. It's the larger and livelier of Lauttasaari's two main beaches — a wide arc of soft sand, calm shallow water, a wooden pier with diving steps, and a backdrop of pine woods and rocky outcrops you can scramble up for a view back over the bay. Helsinki city lifeguards staff it during the official swimming season.",
      "On a warm summer Saturday it's the obvious move: families spread blankets and parasols, teenagers cannonball off the pier, kiteboarders launch from the western end (it's one of the better Helsinki spots for it), and the beach volleyball and basketball courts behind the sand run all afternoon. Facilities are unusually complete for a Finnish city beach — proper changing cabins, showers, toilets, a children's playground with a big wooden climbing ship, and a kiosk for ice cream and beach essentials.",
      "Lauttasaaren Paviljonki (also called Kahvila Kasinonranta or \"Kassari\") sits right on the sand — a wood-and-glass pavilion with a terrace facing the water and a fireplace inside for cooler days. The kitchen runs Nordic-leaning lunches and dinners, the terrace is a destination for sundowners on long July evenings, and they extend the season into autumn with covered heated outdoor seating. The Paseo café-sauna nearby serves the cold-water-swim-and-sauna ritual through winter when the beach itself is quiet.",
      "From central Lauttasaari it's a 10-minute walk south to the shore — or hop on bus 21 if you're staying further north on the island. Free entry, free everything except food and drinks at the pavilion.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaari_beach_in_September.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaari_waterfront_trail_near_the_southern_tip_of_the_island_on_an_evening_in_May_2025.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaari_waterfront_trail_on_the_western_shore_of_the_southern_part_of_the_island_on_an_evening_in_May_2025.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaaren_uimaranta_Kasinon_ranta_-_N2228_(hkm.HKMS000005-000001eb).jpg",
    ],
    availability: {
      suitableMonths: [5, 6, 7, 8, 9],
      notes:
        "Beach is at its best mid-June to mid-August, when the Baltic warms to ~18–20°C and the lifeguards are on duty. May and September are still walkable and atmospheric but too cold for most swimmers. Winter sees ice swimmers and the Paseo sauna scene; the Paviljonki café runs reduced hours.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Vattuniemenranta 4, 00210 Helsinki (Lauttasaari)",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~10 min walk",
      notes:
        "Same island. ~10-min walk south through the residential streets from Lauttasaari metro station to the beach, or shorter from the southern half of the island. Bus 21 also serves the area.",
    },
    cost: {
      perPersonEur: 0,
      notes:
        "Free beach access. Showers, changing rooms, and toilets free. Pavilion lunches ~€18–28; coffee + pastry ~€8.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "No booking for the beach. Pavilion takes reservations for dinner — useful on Friday/Saturday evenings June–August.",
    },
    suitableAgeRange: { min: 0 },
    childrenNotes:
      "Properly kid-friendly — gentle shallow water, lifeguards in season, a big wooden climbing-ship playground, and ice cream from the kiosk. Stroller-accessible on the paved approach but the sand is soft.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "low",
    duration: "half-day",
    website: "https://www.myhelsinki.fi/places/lauttasaari-beach-kasinonranta/",
    tags: ["nature"],
  },
  {
    slug: "allas-pool",
    title: "Allas Sea Pool",
    shortDescription:
      "An open-air seawater pool, a heated 27°C pool, and three Finnish saunas right on the South Harbour next to the SkyWheel — swim outdoors year-round with the Cathedral, the Suomenlinna ferries, and the Helsinki skyline as a backdrop.",
    longDescription: [
      "Allas Sea Pool opened in 2016 on the wooden quay between Kauppatori and the Katajanokka SkyWheel — three pools and three saunas built directly on the harbour deck, with the Lutheran Cathedral, the Presidential Palace, and the Stockholm ferries all visible from the loungers. The whole complex is open-air; the only indoor bits are the changing rooms and the saunas. The architectural play is the pull: you swim outside, in the harbour, with the city set-piece as your view, and you can do it through January snowfall.",
      "There are three pools. The 25-metre lap pool is heated to a comfortable 27°C year-round — the workhorse if you actually want to swim. The smaller children's pool runs warmer (~30°C). The headline pool is the Sea Pool — filtered Baltic seawater pumped in from a cleaner intake offshore, UV-treated, but otherwise unheated, so it's 18°C in August and 2°C in February. Combined with the saunas (one mixed Corner Sauna at 90°C, plus separate men's and women's panorama saunas with floor-to-ceiling windows over the water) it's the city's most accessible introduction to the Finnish löyly-and-cold-plunge ritual.",
      "Allas runs as a public pool, not a spa: tickets are €18 weekday adult, €25 weekend/peak, with reduced and child rates and 0–2 free. You bring your own swimsuit and towel (rentals available); shampoo and shower gel are stocked. There's a counter restaurant on the upper deck and a sun terrace that turns into the city's de facto sunset bar in July (separate, no pool ticket needed). Towels, robes, and bag lockers are extra paid items — budget another €10 if you turn up empty-handed.",
      "Walk from Helsinki Central Station in 10 minutes via Esplanadi and Market Square — Allas is at the harbour end of Katajanokanlaituri, right under the SkyWheel. Tram 4 stops nearby. Bookings aren't required even on busy summer Saturdays — the place handles 1,500+ guests on peak days without feeling oversold.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Allas_Sea_Pool_in_Katajanokka,_Helsinki,_Finland,_2021_June.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Allas_Sea_Pool_in_September_2019.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/SkyWheel_Helsinki_and_Allas_Sea_Pool_in_Fog_(2024).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Allas_Sea_Pool_kauppatori.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/2018_Winter_in_Helsinki,_Finland_(26611927908).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Allas_Sea_Pool_by_Petri_Sipilä_2016.jpeg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Allas_Sea_Pool_Feb_18.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Mon–Thu 06:00–22:00, Fri–Sat 06:00–01:00, Sun 09:00–21:00. Ticket sales end 1h before closing; swimming/sauna ends 20 min before closing.",
      notes:
        "Genuine year-round destination — the saunas and heated pool make it work in deep winter, and the experience flips from a sun-deck scene in July to a steaming-pool-against-snow tableau in February. Closed for an annual maintenance week (usually mid-January); check the site if your trip lands then.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Katajanokanlaituri 2a, 00160 Helsinki",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~20 min",
      notes:
        "Bus 21 from Lauttasaari to Kauppatori, then a 5-min walk along the quay to Katajanokanlaituri. Alternative: metro to Helsinki Central (~6 min), then a 10-min walk down Esplanadi and across Market Square. Right under the SkyWheel.",
    },
    cost: {
      perPersonEur: 18,
      notes:
        "Weekday adults €18, weekend/peak €25; reduced (3–17/student/senior) €13–18; under-3 free. Towel rental ~€5, robe ~€8, swimsuit ~€10, locker €2. Restaurant prices separate (~€12–22 a plate).",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "Walk-in. No reservations for the pools. Capacity-managed only on the busiest July evenings — buy online to skip the door queue.",
    },
    suitableAgeRange: { min: 3 },
    childrenNotes:
      "Dedicated heated 30°C children's pool with shallow steps. The Sea Pool itself is too cold for most under-7s most of the year. Lockers and changing rooms are stroller-friendly. Saunas are mixed in swimsuits — no nudity, fine for kids who are comfortable with the heat.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "low",
    duration: "1-3h",
    website: "https://www.allaspool.fi/en/",
    tags: [],
  },
  {
    slug: "uspenski-cathedral",
    title: "Uspenski Cathedral",
    shortDescription:
      "The largest Orthodox cathedral in Western Europe — Aleksey Gornostayev's red-brick, gold-domed 1868 Byzantine landmark on the Katajanokka cliff, a five-minute uphill walk from Market Square.",
    longDescription: [
      "Uspenski Cathedral (Uspenskin katedraali) was designed by the Russian architect Aleksey Gornostayev (he died before it was finished) and completed in 1868, when Helsinki was the capital of the autonomous Grand Duchy of Finland under the Russian Empire. It sits on a granite cliff at the southern tip of Katajanokka peninsula, deliberately raised above the harbour so its thirteen gilded onion-domes are visible from anywhere on the South Harbour. The 700,000 red bricks were salvaged from the destroyed fortress of Bomarsund in Åland — that's why the colour is so insistent against Helsinki's pale stone-and-stucco centre.",
      "Inside, the contrast with the Lutheran Helsinki Cathedral five minutes away is the point. Where Helsinki Cathedral is white, austere, and plain by Lutheran rule, Uspenski is dim, gold, and full — a tall iconostasis of saints and Marys behind the altar, candles on stands all the way down the nave, frescoes climbing the inside of the central dome. It functions as the main church of the Orthodox Diocese of Helsinki, and a service in progress means the chants drift down through the building's whole height. The crypt below sometimes hosts art exhibitions; the small shop sells icons, candles, and Orthodox liturgical books.",
      "Adult entry is €5 (introduced May 2025 after a century of free admission); under-18s are free, and the cathedral is free for everyone during divine services. Photography is allowed without flash. Open Tue–Fri 10:00–18:00, Sat 10:00–15:00, Sun 13:00–16:00 in the summer schedule (winter hours are slightly shorter); closed Mondays and during weddings and funerals — the website's weekly schedule is the place to confirm before you go.",
      "From Helsinki Central Station it's a 10-minute walk through Esplanadi and Market Square, then up the Katajanokka steps. Pair it with the Old Market Hall (3 min downhill), Allas Sea Pool (5 min along the quay), or as an early stop before the SkyWheel and a Suomenlinna ferry. The little terrace beside the cathedral is one of the better unscheduled photo spots in central Helsinki.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Uspenski_Cathedral_01.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Uspenski_Cathedral_02.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Uspenski_Cathedral_Helsinki_2012.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Front_of_Uspenski_Cathedral_In_Helsinki.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Pohjoisranta_with_Uspenski_Cathedral_and_Relandersgrund_on_a_sunny_afternoon_in_May_2024.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Orthodoxe_Kathedrale_Innen_Kuppel_1.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/06047_FIN_Helsinki_Uspenski_cathedral_chandelier_V-P.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Altarraum_uspenki-kirche.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Summer (May–Sept) Tue–Fri 10:00–18:00, Sat 10:00–15:00, Sun 13:00–16:00. Winter hours slightly shorter. Closed Mondays.",
      notes:
        "Working cathedral — Sunday morning services, weddings, and funerals close it to general visits. Check the weekly schedule on hos.fi the day before if your timing is tight.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Kanavakatu 1, 00160 Helsinki",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~20 min",
      notes:
        "Bus 21 from Lauttasaari to Kauppatori, then a 5-min walk across the Katajanokka bridge and up the granite steps. Alternative: metro to Helsinki Central (~6 min), then a 10-min walk down Esplanadi.",
    },
    cost: {
      perPersonEur: 5,
      notes:
        "Adults €5 (introduced May 2025). Under-18 free. Free for everyone during divine services. Cash and card.",
    },
    booking: {
      leadTime: "same-day",
      notes: "Walk-in. No tickets needed in advance.",
    },
    suitableAgeRange: { min: 4 },
    childrenNotes:
      "The cathedral is steep stairs up from the quay — bring a carrier for under-3s. Inside is a working church; expect a quiet, candle-lit space rather than a play environment.",
    indoorOutdoor: "indoor",
    physicalIntensity: "low",
    duration: "<1h",
    website: "https://hos.fi/en/uspenski-cathedral-main-cathedral-of-the-orthodox-parish-of-helsinki-and-the-diocese-of-helsinki/",
    tags: ["landmark", "historical"],
  },
  {
    slug: "fuji-sushi-lauttasaari",
    title: "Ravintola Fuji Sushi (Lauttasaari)",
    shortDescription:
      "An unflashy neighbourhood Japanese on Lauttasaari's Vattuniemi side — properly fresh nigiri and sashimi, omakase if you ask, ramen and tempura too, and a small children's play corner that earns it the local-family vote.",
    longDescription: [
      "Fuji Sushi sits in a quiet block of Vattuniemi at the southern end of Lauttasaari, in among the residential apartment buildings rather than on any tourist drag. It's the kind of place that doesn't show up on best-of-Helsinki lists but is on a steady rotation for half the families on the island — high-quality fish, careful preparation, and a price point in the €10–25 mains range that makes it a regular weeknight option rather than a once-a-trip splurge.",
      "The menu hits the full range of a Japanese restaurant in Helsinki: nigiri and sashimi at the heart of it (tamago €3.50 a pair, salmon and tuna nigiri in the €4–6 range), maki and uramaki rolls, big party platters that go up to a 56-piece set at €60, plus ramen, tempura, edamame, miso soup, gyoza, and poke bowls. They'll also do an omakase (chef's selection) if you ask for it — call ahead and discuss budget. Lunch sets are good value.",
      "The reason it's a parent-favourite: there's a small children's play corner — a rare commodity in central Helsinki sit-down restaurants — which means a sushi dinner with a 3-year-old is actually possible without speed-eating. The staff are unflappable about kids. Food shows up quickly enough that you can leave with the post-bedtime patience reserves still topped up. Highchairs available.",
      "From central Lauttasaari it's a 12-minute walk south down Lauttasaarentie onto Vattuniemenkatu — and the same metro line drops you at Allas Sea Pool or downtown if you want to keep the night going. Open Mon–Fri 10:30–20:30, Sat–Sun 12:00–20:30. Walk-ins fine on weeknights; book a table for Friday/Saturday evenings.",
    ],
    thumbnailUrl:
      "https://img02.restaurantguru.com/cc57-Fuji-Sushi-Helsinki-meals.jpg",
    galleryUrls: [
      "https://img02.restaurantguru.com/cc0a-Ravintola-Fuji-Sushi-Helsinki-interior.jpg",
      "https://img02.restaurantguru.com/c779-Restaurant-Ravintola-Fuji-Sushi-food.jpg",
      "https://img02.restaurantguru.com/c3a5-Restaurant-Ravintola-Fuji-Sushi-meals.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule: "Mon–Fri 10:30–20:30, Sat–Sun 12:00–20:30.",
      notes: "Open year-round. Midweek lunch is the quietest window.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Vattuniemenkatu 13, 00210 Helsinki (Lauttasaari)",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~12 min walk",
      notes:
        "Same island. ~12-min walk south from Lauttasaari metro station down Lauttasaarentie and along Vattuniemenkatu — shorter from the southern half of the island. Bus 21 also serves the area.",
    },
    cost: {
      perPersonEur: 25,
      notes:
        "À la carte sushi from €3.50 (single nigiri) up to €60 for a 56-piece party platter. Typical dinner with a few rolls and a starter ~€20–30 per person; lunch sets cheaper. Drinks extra. Cash and card.",
    },
    booking: {
      leadTime: "few-days",
      notes:
        "Walk-ins fine Mon–Thu. Book a table for Friday and Saturday dinner — the dining room is small and fills quickly. Phone +358 50 592 9990 or via Wolt/Foodora for delivery.",
    },
    suitableAgeRange: { min: 0 },
    childrenNotes:
      "Small children's play corner inside the restaurant — unusual for a Helsinki sit-down spot and the reason local families come back. Highchairs available. Stroller-accessible entrance from the street.",
    indoorOutdoor: "indoor",
    physicalIntensity: "low",
    duration: "1-3h",
    website: "https://www.sushihelsinki.fi/ravintola-fuji-sushi",
    tags: ["food"],
  },
  {
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
  },
  {
    slug: "koff-race",
    title: "Koffin Vauhtikisat (KOFF Race) – Helsinki Downhill Skate",
    shortDescription:
      "One Sunday every July, longboarders bomb a narrow asphalt path down Sinebrychoff Park's hillside in central Helsinki — Europe's most slamfest-prone urban downhill race, free to watch and casually anarchic.",
    longDescription: [
      "Koffin Vauhtikisat — \"Koff Speed Race\" in Finnish, more commonly \"the KOFF Race\" — is an annual one-day downhill skateboarding event held in Sinebrychoff Park (Koffin puisto), a small leafy hill park in Punavuori a few blocks from Hietalahti Market Hall. The park is named after the Sinebrychoff brewery that operated here from 1819, and its English-landscape topology — winding asphalt paths cutting down a steep tree-covered hillside — turns out to be a near-perfect natural downhill course. The race has been running since 2014, with the 2025 edition (Sunday 13 July) marking its 11th year. The 2026 date hadn't been announced as of mid-spring; expect a Sunday in mid-July.",
      "The format is part race, part chaos. Riders register in advance and sign liability waivers; the actual course is a thin asphalt strip winding through trees with concrete walls and railings on the edges, so wipeouts at speed are routine — Skate Sonr called it \"Europe's most dangerous downhill race\" in 2024 and that's not unfair marketing. Heats run head-to-head down the hill in a tournament bracket that runs until a winner is decided, interleaved with a best-trick contest on the steepest section (ollies, coffins, slides over obstacles). The Governor — Marius Syvanen, who runs the show — both presides and takes runs himself. International riders fly in: Kevin Baekkel, Tom Remillard, and friends from the Pocket Pistols / OJ Wheels orbit have been regulars.",
      "For spectators, it's about as good as urban skate racing gets — the park is small enough that you can hike up the hill once, find a perch on the grass with a view of two or three corners, and watch the whole bracket from one spot. Unofficially: people bring picnic blankets and beers, the hill is dotted with locals from open to close (14:00–20:00 in 2024), and the vibe is closer to a neighbourhood block party than a sanctioned sporting event. Organisers ask spectators to keep at least 5 m off the course — boards regularly fly off it at speed.",
      "Entry is free for spectators. Sinebrychoff Park is at Bulevardi 40 / Sinebrychoffinkatu 1 in Punavuori. From Lauttasaari it's a short metro hop east to Ruoholahti, then a 10–12-minute walk south, or tram 6/6T from the city centre. Bring layered clothes — Helsinki midsummer afternoons swing between 15 °C and 25 °C — and don't expect any food or drink stalls in the park itself; Hietalahti Market Hall is two minutes' walk away and stays open until 18:00 on Sundays.",
    ],
    thumbnailUrl: "https://live.staticflickr.com/65535/54655242519_8af618c558.jpg",
    galleryUrls: [
      "https://live.staticflickr.com/65535/54654175047_923b2b51da.jpg",
      "https://live.staticflickr.com/65535/54655245529_cdfecb0207.jpg",
      "https://live.staticflickr.com/65535/54655335610_d309730f9b.jpg",
      "https://live.staticflickr.com/65535/54654174997_8efafd8377.jpg",
      "https://live.staticflickr.com/65535/54655245384_5502fb69e7.jpg",
      "https://live.staticflickr.com/65535/54655245564_edee82649c.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Sinebrychoffin_taidemuseo.jpg",
    ],
    availability: {
      suitableMonths: [7],
      events: [
        {
          from: "07-12",
          to: "07-12",
          name: "Koffin Vauhtikisat (KOFF Race)",
        },
      ],
      weeklySchedule:
        "Single-day event, Sunday only. Racing typically runs 14:00–20:00.",
      notes:
        "Annual mid-July Sunday — exact date shifts year to year (2024: 14 Jul; 2025: 13 Jul). Check @koffinvauhtikisat on Instagram or fourstore.fi for the year's announcement.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Sinebrychoff Park, Bulevardi 40 / Sinebrychoffinkatu 1, 00120 Helsinki (Punavuori)",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~20 min",
      notes:
        "Metro from Lauttasaari east to Ruoholahti (~3 min), then a 10–12-min walk south down Hietalahdenkatu and Bulevardi to the park. Alternatively tram 6 from Helsinki Central to Hietalahdentori. The park itself is small — once inside, the whole course is visible from a single perch on the grass.",
    },
    cost: {
      perPersonEur: 0,
      notes:
        "Free for spectators. Racers pay a small registration fee (typically €15–25) handled by the organisers in advance via Instagram DM. No food or drink stalls in the park — pick up a meal at Hietalahti Market Hall (2 min walk) before or after.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "No tickets needed for spectating. Racers must register in advance via @koffinvauhtikisat on Instagram and sign liability waivers — slots are capped and fill weeks ahead.",
    },
    suitableAgeRange: { min: 8 },
    childrenNotes:
      "Boards routinely fly off the course at 50+ km/h. Older kids who understand to stay well back are fine; small children and strollers don't pair well with the steep, busy grass slopes here. The 5 m course-distance rule is strictly enforced.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "low",
    duration: "1-3h",
    website: "https://www.instagram.com/koffinvauhtikisat/",
    tags: [],
  },
  {
    slug: "hifk-hockey",
    title: "HIFK Hockey at Nordis (Helsinki Ice Hall)",
    shortDescription:
      "A Liiga night at the 1966-vintage Helsinki Ice Hall — 8,200 seats packed with HIFK's red-and-black faithful, no jumbotron pyrotechnics, just organ stings, organic chants, and Finland's national religion at full volume.",
    longDescription: [
      "HIFK Hockey is the men's ice hockey team of the Helsingfors IFK athletics club, founded in 1897 — Finland's oldest sports club, originally Swedish-speaking. The hockey side has played in the Liiga (Finland's top division) for decades, won seven national titles, and produced a steady stream of NHLers. They wear red and black, their crest is a stylised panther, and they take the ice at Helsinki Ice Hall on Nordenskiöldinkatu — colloquially \"Nordis\" after the address, or \"Petoluola\" (\"the Beast Cave\") after the panther logo. Built in 1966 by architects Jaakko Kontio and Kauko Räike, it's a low-slung concrete bowl that seats 8,200, and it has been HIFK's home since the puck dropped on opening night.",
      "Compared to the bigger, glassier Helsinki Halli (the renamed Hartwall Arena), Nordis is unapologetically old-school. The lighting is dim, the seats are tight, the concourses are narrow, and a few seats have obstructed views — but the soundtrack is a real organ played live, the chants are entirely fan-driven (no scoreboard prompts), and the rink is close enough to feel skates carve and pucks ring off the boards. HIFK fans treat away-team goals with a hush followed by deliberately tepid applause, then erupt at any home counter. The Stadin derby with Jokerit — Helsinki's other club, who returned to the Liiga in 2023 after a KHL detour — is back on the calendar and remains the loudest night of the year.",
      "Finnish hockey culture rewards a visit even if you don't follow the league. Hockey is the country's most-watched sport by a long way; the men's national team (Leijonat — \"the Lions\") has won three world championships and the 2022 Olympic gold, and the Liiga is where most of those players cut their teeth. The on-ice game is structured, defensive, and physically honest — sisu hockey, in the local idiom — and the in-arena rituals (the singing of the second-period intermission anthem, the pre-game player-arrival hand-shaking, the post-goal flag waving from the home end) are tight and consistent in a way you don't get at NHL games.",
      "The regular season runs September through March, with playoffs in April; HIFK plays roughly 30 home games, mostly Tuesday and Friday/Saturday evenings (face-off 18:30). Tickets are around €25 for a standard seat, €40+ for closer; buy via liiga.fi, hifk.fi, or Ticketmaster.fi. From Lauttasaari, take the metro to Helsinki Central (~6 min) and switch to tram 4 or 10 northbound to Auroran sairaala — total ~25 min door-to-door. Beer and food at the arena are pricey but plentiful (alcohol stays on the concourse — not allowed in the seating bowl). The full game runs ~2.5 hours including two 18-minute intermissions; arrive 20 min early to soak up the warm-up.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/HIFK-Tappara.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Ice_Hall_May_2022.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Ice_Hall_2018-11-01_15-17-06.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Nordis_ja_Finnair.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_Ice_Hall_(FIN)_2010.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/HIFK-Kärpät_pääty.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Nordis_Valotaulu_HIFK-HPK.jpg",
    ],
    availability: {
      suitableMonths: [9, 10, 11, 12, 1, 2, 3, 4],
      weeklySchedule:
        "Home games typically Tue and Fri or Sat, face-off 18:30. Around 30 home games per regular season + playoffs. Check liiga.fi for the schedule.",
      notes:
        "Liiga regular season runs early September to mid-March; playoffs in late March / April. The Stadin derby (HIFK vs. Jokerit) is the marquee fixture and sells out earliest. No hockey May–August.",
    },
    location: {
      region: ["Helsinki", "Töölö", "Uusimaa"],
      address: "Helsinki Ice Hall (Nordis), Nordenskiöldinkatu 11–13, 00250 Helsinki",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~25 min",
      notes:
        "Metro from Lauttasaari to Helsinki Central (~6 min), then tram 4 or 10 northbound to Auroran sairaala (~10 min) — the arena is a 3-min walk from the stop. Alternatively walk 25–30 min from Central straight up Mannerheimintie. The arena sits in the Töölö sports complex right next to the Olympic Stadium.",
    },
    cost: {
      perPersonEur: 25,
      notes:
        "Standard end-zone seats from ~€25, mid-tier ~€35, lower-bowl centre-ice ~€45+. Premium and derby fixtures higher. Beer at arena ~€8–10, hot dogs ~€6. Buy via liiga.fi, hifk.fi, or Ticketmaster.fi.",
    },
    booking: {
      leadTime: "few-days",
      notes:
        "Most regular-season Tuesdays go on sale day-of without trouble. Friday/Saturday games sell briskly — book a few days ahead. The Stadin derby vs. Jokerit and any playoff game need 2–3 weeks' notice.",
    },
    suitableAgeRange: { min: 6 },
    childrenNotes:
      "Family-friendly atmosphere; the arena is loud but no louder than a Finnish school sports day. Bring soft ear protection for under-7s. Family ticket bundles available some weeknights. Strollers fit through accessible entrances; check seat sightlines when booking.",
    indoorOutdoor: "indoor",
    physicalIntensity: "low",
    duration: "1-3h",
    website: "https://hifk.fi/",
    tags: [],
  },
  {
    slug: "lauttasaari-coastal-walk",
    title: "Lauttasaari Coastal Walking Trail",
    shortDescription:
      "A 10 km waymarked loop around the entire shore of Lauttasaari — the trip's home island — stitching together rocky outcrops, three beaches, the wooded Myllykallio ridge, and a half-dozen marinas, all without leaving the city.",
    longDescription: [
      "The Lauttasaaren rantareitti circles the whole of Lauttasaari, the wedge-shaped island in western Helsinki where the trip is based. The cycling-and-walking version is 10 km flat around the seaward edge; the walking-only version branches inland through the Myllykallio rocky-ridge nature area for 6.7 km. Both keep the open Baltic, the Lauttasaarensalmi sound, or the sheltered Hevosenkenkälahti bay in view almost the whole way, and both are ankle-comfortable: paved and gravel paths for the seafront, with one short bit of rocky scramble through Myllykallio if you take the inland branch.",
      "Highlights, going clockwise from the north bridge: the Lauttasaarensilta crossing with its view straight down the city skyline; the eastern shore past Pajalahti and the historic timber Casino building; Kasinonranta (Lauttasaari's main beach) and the Café Pärlan kiosk; the rocky southern tip at Vattuniemi where the open sea finally appears; Veijarivuori beach and its winter-swimming jetty; Vaskiniemi with the second avantouinti spot; and the western shore back up past the HSK marina, the Koirakivenniemi rocks, and the parade of cliffside saunas at Kaijonen. The Myllykallio observation tower is a 10-min detour with a view that beats the price of admission (free).",
      "It's an all-seasons walk in different ways. Late spring through September the path is dotted with picnickers, runners, and stroller-pushing parents; the southern outcrops are full of teenagers with speakers; the marinas are lively. Late autumn and winter shift it from social to atmospheric — the sea smokes off the open water on cold mornings, the light goes blue and pink for hours at a time, and the avantouinti regulars chop through the ice at Kasinonranta and Vaskiniemi. Birders pick up eider, smew, and goldeneye at Sisä-Hattu in passage seasons. Even at midwinter the city clears the path quickly after snow.",
      "Practical notes. Start anywhere — the loop is loop. Total walking time at a casual pace is 2.5–3 hours; allow 4–5 if you stop for café/sauna/ice-swim breaks. Stroller-friendly except for the Myllykallio inland section (skip it, or carry the stroller). HSL Citybikes (April–October) make it easy to cover the cycling 10 km in under an hour. Combine with Café Regatta or Cafe Birgitta on the Hietaniemi side if you want to extend across the Lauttasaarensilta into central Helsinki — the city's longer Rantareitti continues seamlessly from there.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaari_waterfront_trail_near_the_southern_tip_of_the_island_on_an_evening_in_May_2025.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaari_waterfront_trail_on_the_western_shore_of_the_southern_part_of_the_island_on_an_evening_in_May_2025.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/A_Sunset_In_Lauttasaari_Helsinki_Finland_Seascape_Photography_(153009409).jpeg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaari_At_Sunset_Helsinki_Finland_Seascape_Photography_(154382461).jpeg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaari_in_winter.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaari_Pohjoiskaari_kalliot_250508_b.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Hevosenkenkälahden_ranta_2022_(202308;%2BG71678).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Vaskiniemen_talviuintipaikka_2022_(202220;%2BG70716).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lauttasaari_beach_in_September.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      notes:
        "Year-round; the path is plowed in winter. May–September is the warm-and-busy window; October–April is quieter, often more atmospheric (sea smoke, low light, ice swimmers).",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address:
        "Lauttasaari, Helsinki — start anywhere on the shoreline. Convenient access points: Lauttasaarensilta (north end), Kasinonranta beach (east), Vattuniemi (south tip).",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "Walk straight from the door",
      notes:
        "The trail starts where the island starts. From any point on Lauttasaari, walk 5–15 minutes downhill to the nearest stretch of shore and pick up the loop. No transit needed.",
    },
    cost: {
      perPersonEur: 0,
      notes:
        "Free. Coffee/pastry stops along the way (Pärlan kiosk at Kasinonranta, Café Birgitta if you cross the bridge) ~€5–10. HSL Citybike day pass €5 if you'd rather ride than walk.",
    },
    booking: {
      leadTime: "same-day",
      notes: "No booking, no permit, no entrance — just go.",
    },
    suitableAgeRange: { min: 0 },
    childrenNotes:
      "The seafront 10 km loop is fully stroller-friendly — paved or hard gravel the whole way. The Myllykallio inland branch crosses bare rock and needs a carrier, not a stroller. Cafés and toilets at Kasinonranta and the HSK marina; not many in between, so plan accordingly with toddlers.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "moderate",
    duration: "half-day",
    website:
      "https://www.hel.fi/en/culture-and-leisure/outdoor-activities-parks-and-nature-destinations/hiking/routes-and-nature-trails",
    tags: ["nature"],
  },
  {
    slug: "linnanmaki",
    title: "Linnanmäki",
    shortDescription:
      "Finland's flagship amusement park: eight roller coasters including the brakeman-operated 1951 wooden Vuoristorata and the launched-steel Taiga (52m, 106 km/h — Finland's tallest, fastest, and longest), all run by a children's-charity foundation right inside Helsinki.",
    longDescription: [
      "Linnanmäki has been the heart of Finnish amusement-park culture since 1950. It sits on a hilltop in Alppila, 2.5 km north of Helsinki Central, and packs 42+ rides into a compact site whose layout — coasters threading between food kiosks and trees — feels nothing like a sprawling Six-Flags. Entry is free; you pay for rides via a wristband or a punch card. The whole operation is owned by the Children's Day Foundation, a non-profit, and a portion of every ticket goes to Finnish child-welfare work. Even the rides have run on wind energy since the 2010s.",
      "The headline coasters cover an unusually wide era-range for one park. Vuoristorata (1951) is the wooden classic, one of only six coasters in the world still operated by a brakeman who stands at the back of the train working the levers — it celebrates its 75th anniversary in July 2026 with special programming. Taiga (2019) is the modern thrill: a launched Intamin steel coaster that is Finland's tallest (52 m), fastest (106 km/h), and longest (1,104 m), with a launch-into-vertical-spike opening that pins riders for a full second. Kirnu, opened 2007, was the first compact 4D coaster in Europe — seats rotate freely as the train moves. Round it out with Salama (a launched roller coaster), Ukko (suspended), Linnunrata eXtra (indoor dark coaster), and the Pikajuna and Tulireki family coasters.",
      "The non-coaster lineup is just as good: Kingi (75 m drop tower), Hurjakuru rapids, the Panoraama observation tower, the classic Ferris wheel Rinkeli, and a swarm of spinners and family rides. The atmosphere shifts entirely after dark during Carnaval de Lumière in mid-October, when the park reopens for ten illuminated nights with light installations, fire performers, and the autumn theme programming — a visually distinct experience from the daytime summer park, and worth planning around if your trip lands then.",
      "Practical notes. The park is closed in winter; the 2026 main season runs April 30 to September 6, with the Carnaval de Lumière event a separate window in mid-October. Buy the Isohupi all-rides wristband (€53 adult, €43 kids' Pikkuhupi for the under-120cm rides) online in advance — same-day buys are fine off-peak but lines slow to a crawl in July. Single ride tickets exist if you only want a few rides. Height limits matter: most thrill coasters require 140 cm; Taiga is 130 cm; the kids' rides start at 90 cm. Plan a full day if you intend to ride everything, and bring a rain layer — the park stays open in showers.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Linnanmäki_ilmasta_27.5.2017.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Linnanmäki_Vuoristorata.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Linnanmäki_Roller_Coaster_1.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Linnanmäki_roller_coaster.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Suomi100_Linnanmäki.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinkipyörä_Linnanmäki.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Linnanmäki_360°_2020-03-16.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Illuminated_rows_of_lights_at_Linnanmäki_Lights_Carnival_2015.jpg",
    ],
    availability: {
      suitableMonths: [4, 5, 6, 7, 8, 9, 10],
      events: [
        {
          from: "10-09",
          to: "10-18",
          name: "Carnaval de Lumière (Carnival of Light)",
        },
      ],
      notes:
        "Main season runs late April through early September (2026: Apr 30 – Sep 6); Carnaval de Lumière reopens the park for ~10 evenings in mid-October. Closed entirely Nov–Mar. July is busiest; weekday afternoons in May/June and late August are calmest.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Tivolikuja 1, 00510 Helsinki (Alppila)",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~25 min",
      notes:
        "Metro M1/M2 to Kamppi (~10 min), then bus 23 from Kamppi bus terminal to the Linnanmäki stop right at the main gate (~15 min). Alternative: metro to Helsinki Central, then tram 3 or 8 to Alppila — slightly longer but a more scenic walk-up to the South Gate.",
    },
    cost: {
      perPersonEur: 53,
      notes:
        "Entry is free; the €53 Isohupi wristband covers all rides for one day. Kids' Pikkuhupi wristband €43 (height-limited rides only). €5 Area Entrance ticket if you don't ride at all (covers six small kids' rides + activity zones). Buy online for a small discount. Food/drinks add ~€10–20 per person.",
    },
    booking: {
      leadTime: "few-days",
      notes:
        "Wristbands rarely sell out, but online purchase skips the gate ticket queue. Carnaval de Lumière evenings are timed-entry — book those a week or two ahead.",
    },
    suitableAgeRange: { min: 3, max: 16 },
    childrenNotes:
      "Excellent for kids 4–14 — the Pikkuhupi wristband covers a full day of family rides for the under-120cm crowd. Under-3s enter free but most rides have a 90 cm minimum; the activity zones and area-entrance areas have plenty for them. Strollers fine throughout. Heights matter: bring a measuring stick mentality — 90 cm, 120 cm, 130 cm, and 140 cm are the thresholds that gate which rides each child can do.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "moderate",
    duration: "full-day",
    website: "https://www.linnanmaki.fi/en/",
    tags: ["theme park", "landmark"],
  },
  {
    slug: "sarkanniemi",
    title: "Särkänniemi",
    shortDescription:
      "Tampere's lakeside theme park: five roller coasters (the Intamin inverted Tornado, the Sky Rocket II Hype, and a brand-new 2026 Vekoma family coaster Konect), an aquarium, planetarium, and the 168m Näsinneula tower with a revolving restaurant — all on one wristband.",
    longDescription: [
      "Särkänniemi sits on a wooded peninsula on Lake Näsijärvi, a 15-minute walk west of central Tampere. It opened as an amusement park in 1975 alongside the already-iconic Näsinneula tower (1971), and has grown into Finland's second-biggest park behind Linnanmäki. The strength of Särkänniemi is breadth: a single wristband covers rides, the Doghill Fairytale Farm petting zoo, an aquarium with a tropical-fish hall, a planetarium, and an elevator ride up the 168m Näsinneula observation tower with its revolving restaurant on top — so a day here delivers a much wider mix than a pure-coaster park.",
      "The coaster lineup is small but well-curated. Tornado (Intamin inverted, 2001) is the headline thrill — six inversions, feet dangling, still the only inverted coaster in Finland. Hype (Premier Rides Sky Rocket II, 2017) is the launched-steel one: 0–100 km/h punch into a vertical spike, then airtime over a top hat. MotoGee (Zamperla, 2010) launches motorcycle-style trains for a punchy family ride. Vauhtimato (Zierer, 1984) is the kids' starter coaster. New for summer 2026: Konect, a custom Vekoma family coaster — 525m of track, ~27m peak, ~68 km/h — designed so kids as small as 100cm can ride it with an adult, and threaded along the lake shore for the views. It's the park's biggest investment of the decade and the main reason coaster fans plan a 2026 trip.",
      "Beyond the rides: Näsinneula's observation deck and revolving Näsinneula Restaurant are both worth queuing for — the deck rotates one full turn every 50 minutes, taking in Lake Näsijärvi, the Pyhäjärvi-Näsijärvi rapids, and a clear view of the Lapland-direction skyline. The aquarium and planetarium are old-school but solid for a rainy day or for younger children needing a break from rides. Doghill Fairytale Farm is genuinely charming for under-8s — animals based on a Finnish children's-book series.",
      "Practical notes. The park's main season runs early May through mid-September (Sep 13 closing for 2026); the tower, aquarium, and planetarium stay open year-round. The all-inclusive Wristband is ~€33 online, €37 at the gate, covers everything (rides, Doghill, aquarium, planetarium, Näsinneula). Buy online with a date — that version doubles as a day pass on Tampere's Nysse trams and buses, so transit from your hotel is bundled in. Heights cap who rides what (most thrill coasters need 130cm; Konect 100cm with adult; Tornado 140cm). From Helsinki this is a long-day or overnight trip — the ride-heavy crowd usually does an overnight in Tampere to hit Vapriikki the next morning.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Näsinneula_ja_särkänniemi.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Särkänniemi_20150804.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Särkänniemi_collage.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Särkänniemen_sisäänkäynti.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Särkänniemi_Park_Tampere_01.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Näsinneula_view_8.jpg",
    ],
    availability: {
      suitableMonths: [5, 6, 7, 8, 9],
      notes:
        "Ride park is May–mid-September (2026: opens early May, closes Sep 13). Näsinneula tower, aquarium, and planetarium stay open year-round. July is busiest; weekday afternoons in May and late August are the calmest ride days.",
    },
    location: {
      region: ["Tampere"],
      address: "Laiturikatu 1, 33230 Tampere",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~3 hours one-way",
      notes:
        "Metro M1/M2 to Helsinki Central (~10 min), then VR InterCity train Helsinki–Tampere (~1h 30m, hourly), then Tampere tram line 1 from the train station to the Särkänniemi stop right at the gate (~15 min). Realistically a long day trip or overnight; the Tampere wristband (online version) doubles as a Nysse tram/bus pass once you arrive.",
    },
    cost: {
      perPersonEur: 37,
      notes:
        "Wristband ~€33 online (cheaper, dated), €37 at the gate. Children under 100cm free. Add-ons: Näsinneula-only ticket ~€10 if you skip the rides. Train tickets Helsinki–Tampere round-trip ~€30–60 depending on advance-purchase tier.",
    },
    booking: {
      leadTime: "few-days",
      notes:
        "Wristbands rarely sell out, but online dated tickets are cheaper and skip the gate queue. Book the VR train a week or two ahead for the best fares.",
    },
    suitableAgeRange: { min: 3, max: 16 },
    childrenNotes:
      "Strong all-ages park: Doghill Fairytale Farm and the aquarium suit toddlers, Vauhtimato and the new Konect (100cm with adult) handle the 4–8 cohort, and the bigger coasters open up at 130–140cm. Strollers fine throughout the park. The revolving restaurant atop Näsinneula is a memorable mid-day reset for kids, but reservations needed.",
    indoorOutdoor: "mixed",
    physicalIntensity: "moderate",
    duration: "full-day",
    website: "https://sarkanniemi.fi/en",
    tags: ["theme park", "landmark"],
  },
  {
    slug: "powerpark",
    title: "Huvivaltio PowerPark",
    shortDescription:
      "Finland's biggest amusement park by ride count — 40+ rides including six roller coasters (the GCI wooden Thunderbird, the Gerstlauer Junker, and Pitts Special), plus an FIA-grade karting circuit designed by Mika Salo, all parked in the middle of South Ostrobothnia farmland.",
    longDescription: [
      "PowerPark is Finland's largest amusement park by ride count, sat improbably in flat South Ostrobothnia farmland along Highway 19, halfway between Vaasa and Seinäjoki. The rides area opened in 2002 and has grown into a 40-ride compound with six roller coasters, a karting empire, a hotel, cottages, and a campground — closer in feel to a North-American resort park than to the city-bound Linnanmäki and Särkänniemi. For a coaster enthusiast, this is the only park in Finland that warrants a dedicated trip in its own right.",
      "The coaster lineup is the best in Finland. Thunderbird (GCI, 2006) is the wooden out-and-back — 31m drop, lots of airtime, the only modern wooden coaster in Finland. Junker (Gerstlauer Infinity, 2015) is the modern thrill: 32m vertical lift, ~92 km/h, three inversions including a beyond-vertical drop. Pitts Special (Gerstlauer Infinity Custom, 2020) is the launched newcomer — a low-to-the-ground custom layout themed around a stunt biplane, surprisingly intense. Cobra (Vekoma Boomerang, 2005) is the classic shuttle. Joyride is a smaller family-launch coaster. Neo's Twister is a Fabbri spinning mouse. Add the giga-pendulum Typhoon, the Booster (a 60m sky-flip), the Kwai River water-coaster, and a sprawling kids' area, and a full coaster-focused day actually fills.",
      "The karting deserves its own callout. The outdoor Mika Salo Circuit was designed by the Finnish ex-F1 driver and has hosted the Karting World and European Championships; the indoor PowerPark Arena is one of the largest indoor karting halls in Europe. Sessions are bookable separately from the wristband and are absolutely the move for an adult-leaning group. The on-site hotel and cottages let you split rides one day and karting the next without commuting; the harness-racing track and trotting events occasionally take over weekends in summer.",
      "Practical notes. The 2026 ride season is mid-May through August, with daily operations through June and July and weekend-only operations on the shoulders; the season opener is Sat May 9. Standard MAXI wristband (over 130 cm) is ~€46 at the gate, often discounted to ~€32 for early-summer dated tickets bought online. MINI wristband (under 130 cm) is cheaper. The free PowerPark shuttle bus meets every train at Härmä station and runs straight to the gates — no rental car needed. Plan two nights minimum from Helsinki: this is a ~3h train ride each way, and the resort genuinely earns the overnight.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/PowerPark.JPG",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/PowerPark2.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Thunderbird.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Cobra_Powerpark.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/PowerPark_Typhoon.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Booster_in_PowerPark.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/PowerPark_Karting_Track_20200822.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/PowerPark_area.JPG",
    ],
    availability: {
      suitableMonths: [5, 6, 7, 8],
      notes:
        "Rides open mid-May through August (2026 season opener: Sat May 9). Daily operations June–July; weekend-only on the May/August shoulders. Karting and the hotel run year-round. The park is closed entirely in autumn and winter for the rides side.",
    },
    location: {
      region: ["Ostrobothnia"],
      address: "Jorma Lillbackantie 1, 62300 Härmä (Alahärmä, Kauhava)",
    },
    accessFromLauttasaari: {
      complexity: "moderate",
      duration: "~3h 30m one-way",
      notes:
        "Metro M1/M2 to Helsinki Central (~10 min), then VR InterCity train Helsinki–Härmä (~3h, 2 direct trains/day). PowerPark runs a free dedicated shuttle bus from Härmä station straight to the gates that meets every arriving train — no rental car needed. Realistically a 2-night trip from Helsinki given the journey length.",
    },
    cost: {
      perPersonEur: 46,
      notes:
        "MAXI wristband (over 130 cm) ~€46 at the gate, often ~€32 with online dated early-summer tickets. MINI wristband (under 130 cm) cheaper. Karting sessions (Mika Salo outdoor circuit or indoor arena) are extra and bookable separately. Hotel/cottages on-site if you stay overnight. Train Helsinki–Härmä round-trip ~€60–100 depending on advance booking.",
    },
    booking: {
      leadTime: "weeks",
      notes:
        "Wristbands themselves rarely sell out — book online for the discount. The trip needs more advance planning: the Härmä-direct train runs only twice a day, the hotel sells out on big-event weekends, and karting sessions especially during championships need weeks of lead time.",
    },
    suitableAgeRange: { min: 4, max: 16 },
    childrenNotes:
      "Wikipedia notes PowerPark has the largest selection of children's rides of any Finnish park; the under-130cm MINI wristband is cheaper and covers the family rides. Doghill-style attractions and a kids' farm round out the day for the very young. Stroller-friendly across the whole site. Older kids/teens get the most out of the karting circuits — book in advance.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "moderate",
    duration: "multi-day",
    website: "https://www.powerpark.fi/en/",
    tags: ["theme park"],
  },
  {
    slug: "kieppi-second-hand",
    title: "Kieppi Second-Hand Market at Iso Omena",
    shortDescription:
      "Five of Finland's biggest charity thrift chains — Fida, UFF, iCare, Kierrätyskeskus, and Lillipop — lined up along a single second-floor corridor of the Matinkylä mall, the easiest one-stop secondhand crawl in the metro area.",
    longDescription: [
      "Kieppi is Iso Omena's dedicated second-hand corridor, opened in stages from 2023 as the mall's bet on the Finnish thrift boom. Five of the country's biggest charity-run secondhand operators share the same stretch of the second floor: UFF (vintage-leaning clothing, climate-focused charity), Fida (clothing, hobby supplies, and home goods funding international development), iCare (the Salvation Army's shop, 130-plus years in Finland), Kierrätyskeskus — the Recycling Centre — (clothes, tableware, decor, supports environmental work), and Lillipop (children's clothing on consignment). Add Ompun Ompelimo nearby for alterations and you can buy a coat and have it taken in without leaving the floor.",
      "The appeal is the density. Each shop is its own door, but the layout is a single linear browse — you pop in, find nothing, walk five paces, try the next one. A successful visit can land you a Marimekko dress at UFF, a stack of Iittala ramekins at Kierrätyskeskus, a wool sweater at Fida, and an outgrown ski jacket at Lillipop, in under an hour. Pricing is the genuinely-cheap kind, not curated-vintage-cheap: clothing mostly €3–15, housewares €1–10. Inventory turns over fast and the regulars treat it as a weekly stop — go in the morning if you want first crack at fresh donations.",
      "Iso Omena itself is the western terminus of the Helsinki metro: the Matinkylä station sits directly under the mall, the M1 line runs there from Lauttasaari in about fifteen minutes with no transfers. Take the escalator up two floors, follow the Kieppi signs, and the five shops are in a row. Combine with Kirjasto Omena (the Espoo public library on the same floor) for a half-day, or with a coffee at one of the food-court counters. Sundays are the quietest browsing day; mid-morning Saturday is the busiest.",
    ],
    thumbnailUrl:
      "https://www.isoomena.fi/app/uploads/sites/13/2026/03/Kieppi_www_desktop-hero_1920x800px.png",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Iso_Omena_shopping_centre,_Matinkylä,_Espoo_(March_2019).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Ison_Omenan_vanha_puoli.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Entrance_to_Iso_Omena_on_an_afternoon_in_October_2024.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Iso_Omena_christmas_2025.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Piispansilta_near_Iso_Omena_on_an_evening_in_October_2023.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Mall is open daily 06:00–24:00; individual Kieppi shops generally Mon–Fri 10:00–20:00, Sat 10:00–18:00, Sun 12:00–18:00 (each store sets its own hours within that window).",
      notes:
        "Inventory turns fast — go mid-morning on a weekday for the freshest racks. Sunday afternoon is the quietest browsing window; mid-morning Saturday is the busiest.",
    },
    location: {
      region: ["Espoo", "Uusimaa"],
      address:
        "Iso Omena, 2nd floor (Kieppi corridor), Piispansilta 11, 02230 Espoo",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~20 min",
      notes:
        "M1 metro west from Lauttasaari direct to Matinkylä (~15 min, no transfer). The metro station is built into the south end of Iso Omena — exit, take the escalators up two floors, follow the Kieppi signage along the corridor.",
    },
    cost: {
      perPersonEur: 0,
      notes:
        "Free to browse. Budget €10–40 for typical finds: clothing mostly €3–15, housewares €1–10. Lillipop's consignment items can run higher than the charity-shop prices next door.",
    },
    booking: {
      leadTime: "same-day",
      notes: "Walk-in. No reservations for any of the shops.",
    },
    suitableAgeRange: { min: 0 },
    childrenNotes:
      "Stroller-friendly throughout, family bathrooms on the same floor, and Lillipop is purpose-built for kids' clothing if you're shopping for them. Older kids who like sorting through racks tend to enjoy it; toddlers will get bored fast — pair with a swing through Kirjasto Omena's children's section as a reset.",
    indoorOutdoor: "indoor",
    physicalIntensity: "low",
    duration: "1-3h",
    website: "https://www.isoomena.fi/en/kieppi-second-hand-market/",
    tags: [],
  },
  {
    slug: "tapiola-ice-garden",
    title: "Tapiola Ice Garden",
    shortDescription:
      "A free 330-metre artificial ice loop circling Tapiola's central fountain pool — lit at night, hockey sticks banned, and the easiest place west of Helsinki to lace up skates and just glide for an hour.",
    longDescription: [
      "Tapiolan Jääpuutarha — the \"Ice Garden\" — is a 330-metre artificial ice track that loops around the central fountain pool in Tapiola's cultural square, with a 1,700m² rink in the middle. The site is professionally maintained, free to use, and turns the centrepiece of Aarne Ervi's 1950s modernist town plan into an open-air winter living room from mid-November through early March. Hockey sticks are banned, which keeps the loop civil and family-paced — this is a place for laps, not pickup games.",
      "The 330m loop is long enough to actually get a rhythm going. Half a dozen laps and you're warm; twenty and you've earned a coffee. Floodlights stay on after dark, which matters in December when the sun sets at 15:15 and most of your skating happens under the lights. Ice condition is noticeably best the morning after a fresh resurface, and the crowd thins out after dinner. Warm changing rooms and toilets sit alongside the rink, but the on-site café and skate rental (Café Hile) are closed indefinitely — bring your own skates and a thermos.",
      "Season runs roughly 17 November through 8 March, with cold-snap exceptions at either end; Espoo posts live conditions on ulkoliikunta.fi if you want to check before going. Take the M2 metro from Lauttasaari direct to Tapiola (~10 minutes, no transfer); the Ice Garden is a three-minute walk from the metro exit at Tapionaukio, sitting between the Ainoa shopping centre, the Tapiola swimming hall, and the cultural centre. Combine with the Espoo Museum of Modern Art (EMMA) at the WeeGee complex one stop further west if your legs are ready to be done.",
    ],
    thumbnailUrl:
      "https://static.espoo.fi/cdn/ff/jSa55ugnin12iEjGyJxfMoNbXm9efSV8vxK39BFbFyQ/1690272439/public/2023-07/Tapiolan%20j%C3%A4%C3%A4puutarha.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Fountain_pool_in_Tapiola.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Illuminated_fountain_jets_in_Tapiola_on_New_Year's_Eve_2023.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Illuminated_tree_in_Tapiola.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Mini-Tapiola_in_December.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Kulttuuriaukio_Kulturplatsen_Espoo_Esbo_2023-10-06.jpg",
    ],
    availability: {
      suitableMonths: [11, 12, 1, 2, 3],
      notes:
        "Season runs ~17 November to ~8 March, with weather-dependent shifts at either end. Lit until late evening; no formal open/close hours within the season. Café and skate rental are closed indefinitely — bring your own skates.",
    },
    location: {
      region: ["Espoo", "Uusimaa"],
      address: "Tapionaukio 3, 02100 Espoo",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~15 min",
      notes:
        "M2 metro from Lauttasaari direct to Tapiola (~10 min, no transfer — Tapiola is the M2 western terminus). The Ice Garden is a 3-minute walk from the metro exit at Tapionaukio, between the Ainoa shopping centre and the cultural centre.",
    },
    cost: {
      perPersonEur: 0,
      notes:
        "Free to skate. Bring your own skates — the on-site rental (Café Hile) is closed indefinitely. No ticket, no entry fee.",
    },
    booking: {
      leadTime: "same-day",
      notes: "Walk-in. No reservations, no time slots.",
    },
    suitableAgeRange: { min: 4 },
    childrenNotes:
      "Kids who can stand on skates will enjoy the loop — the no-hockey-stick rule keeps the pace gentle. Strollers stay off the ice but can park alongside the warm changing rooms. Toddlers and unsteady first-timers will tire fast; an hour is plenty.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "moderate",
    duration: "1-3h",
    website: "https://www.espoo.fi/en/units/tapiola-ice-garden",
    tags: [],
  },
  {
    slug: "kaffeli-puuro",
    title: "Puuro at Kaffeli torikahvila",
    shortDescription:
      "A bowl of rice puuro with butter and lingonberry jam at one of Hakaniementori's tiny outdoor torikahvilas — Kaffeli, on the open market square in front of the hall, where porridge is on the menu all day every day the square is open.",
    longDescription: [
      "Puuro — slow-cooked porridge eaten with a knob of butter melting in the middle and a spoonful of lingonberry jam (puolukkahillo) — isn't a breakfast dish in Finland the way it is elsewhere. It's a meal of its own, eaten any time of day, and the rice version (riisipuuro) in particular is what gets ladled at outdoor market squares from spring through Christmas. Hakaniementori, the open market square in front of Hakaniemi Market Hall, is the easiest place in Helsinki to find one. Kaffeli torikahvila — one of the small wooden cafés that set up tables right on the square — keeps puuro on the menu every day they're open.",
      "Kaffeli is a torikahvila in the original sense: a little café tent and counter on the cobblestones, a handful of outdoor tables, and a menu that doesn't try to be more than the square deserves. Coffee, pulla, vanilla croissants, sandwiches, and a bowl of puuro for under five euros. Rice porridge runs daily, with a second rotating variety (oat, four-grain, sometimes barley) alongside it; demand peaks at Christmas and Midsummer when the seasonal cinnamon-and-prune crowd shows up. Sister café Kahvisiskot has been working the same square for over fifty years and pours from a similar template — both are worth a stop, both let you sit outside and watch the square's traders set up.",
      "Hakaniementori itself was filled in from a strait in 1897 and has been a market spot ever since, with a daily produce-and-flowers market, monthly farmers' market on the first Sunday, and the occasional political demonstration spilling over from the labour movement's deep ties to the Kallio district. The square is right outside the renovated 1914 market hall, so a puuro at Kaffeli pairs naturally with a wander through the hall's stalls afterwards.",
      "Practical: M1 or M2 metro from Lauttasaari direct east to Hakaniemi (~10 min, no transfer), then thirty seconds out the metro exit to the square. Kaffeli runs daytime hours roughly Mon–Sat (closed Sundays); the square's torikahvilas operate from early spring through December and shut down for the deepest winter weeks. Bring cash or card — both work.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Hakaniementori_in_August.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Kahvi_Siskot_Hakaniementori_-_panoramio.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Hakaniementori_on_a_July_morning.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Hakaniementori_in_July.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Riisipuuro.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Finnish_Christmas_rice_porridge.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Hakaniementori,_Helsinki_1907.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Hakaniemen_kauppahalli2008b.jpg",
    ],
    availability: {
      suitableMonths: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Approximately Mon–Sat daytime (early morning through early afternoon). Closed Sundays. Hours vary by season — confirm via Kaffeli's Instagram (@kahvilakaffeli) before a long detour.",
      notes:
        "The torikahvilas run early spring through December and shut for the deepest winter weeks. Kahvisiskot's owner works daily \"early spring through December\" — Kaffeli's window is similar. Demand for puuro peaks at Christmas and around Midsummer.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Hakaniementori, 00530 Helsinki",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~15 min",
      notes:
        "M1 or M2 metro from Lauttasaari direct east to Hakaniemi (~10 min, no transfer — five stops via Ruoholahti, Kamppi, Rautatientori, and Helsingin yliopisto). Kaffeli is on the open square 30 seconds from the metro exit, in front of the market hall.",
    },
    cost: {
      perPersonEur: 5,
      notes:
        "Bowl of puuro €4–5, coffee €2–3, pulla or vanilla croissant under €5. A full sit-down stop is €5–10. Card and cash both fine.",
    },
    booking: {
      leadTime: "same-day",
      notes: "Walk-up counter service. No reservations.",
    },
    suitableAgeRange: { min: 0 },
    childrenNotes:
      "Outdoor seating only — a few tables on the cobblestones. Stroller-friendly across the square. Puuro is mild and toddler-friendly; high chairs are scarce, so plan to share a bench.",
    indoorOutdoor: "outdoor",
    physicalIntensity: "low",
    duration: "<1h",
    website: "https://www.instagram.com/kahvilakaffeli/",
    tags: ["food"],
  },
  {
    slug: "lapinlahden-lahde",
    title: "Lapinlahden Lähde",
    shortDescription:
      "Helsinki's former 1841 mental hospital — designed by Carl Ludvig Engel and one of Europe's oldest psychiatric institutions — reborn as a free, lived-in centre for arts, culture, and mental wellbeing, with a Mental Museum, lakeside park, sauna, and one of the city's quietest seaside cafés.",
    longDescription: [
      "Lapinlahti Hospital opened in 1841 to a design by Carl Ludvig Engel — the same architect behind Helsinki Cathedral and the Senate Square neoclassical core — and was, at its founding, one of the most progressive psychiatric institutions in Europe. The pale-yellow classicist main building sits on a peninsula at the head of Lapinlahti Bay, surrounded by a ten-hectare park shaped by nearly two centuries of patient gardens and old-growth woodland. The hospital ran continuously until 2007. After a long campaign by Pro Lapinlahti and the Lapinlahti Foundation to save the site from sale and demolition, it reopened as Lapinlahden Lähde — \"Lapinlahti's Spring\" — a centre for arts, culture, and mental wellbeing.",
      "Roughly 200 small organisations now share the building: artists' studios, therapists' rooms, mental-health NGOs, a community gallery, a flower shop staffed by people in mental-health rehabilitation, a sauna (Lähde Sauna), and Café Lähde, whose €9.90 weekday lunch is one of the better cheap meals in central Helsinki. Over 300 cultural events a year run through the old wards — concerts in the Aleksis Kivi Ballroom, exhibitions in the old chapel ruin, urban-allotment gardens out the back. The site is a registered social enterprise, so visitor spending directly funds mental-health programming.",
      "The free Mental Museum, run by Pro Lapinlahti, threads through the ground-floor lobby of Café Lähde, the first floor of the old Ward 5 corridor, and the second-floor Aleksis Kivi corridor — Aleksis Kivi, Finland's national writer, was a patient here in the 1860s, and his preserved cell-room is the emotional centrepiece of the visit. The exhibits cover the building's architecture, the long arc of treatment history (restraints, insulin shock, lobotomies, modern care), and the patients themselves through letters and photographs. It's small, careful, and moving: half an hour to read everything, more if you let yourself sit in the period rooms.",
      "Free entry to the grounds, park, and museum. Café Lähde lunch ~€10–12; sauna evenings and ticketed concerts are bookable separately on the website. The site is open every day, with the buildings running daytime hours and occasional evening events. From Lauttasaari it's one M1 or M2 metro stop east to Ruoholahti (~3 min), then a 10-minute walk north along Hietalahdenranta — the white hospital is visible across the bay. Pair the visit with a wander back south to Hietalahti Market Hall for an afternoon, or stretch into a longer seashore walk along the coastal route to the city centre.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lapinlahti_hospital_seen_from_the_bay.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lapinlahden_sairaala.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Corridor_at_Lapinlahden_Lähde.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lapinlahden_sairaalan_sisäpiha.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lapinlahden_kappelin_raunio.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lapinlahden_kaivo.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Lapinlahden_viljelyspalstat.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Colourful_circles_at_Lapinlahti_Hospital_at_Lux_Helsinki_2020.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Grounds open daily, all hours. Café Lähde and Mental Museum run daytime hours (roughly 10:00–17:00 weekdays, with weekend variation). Sauna and concerts are evenings.",
      notes:
        "Park and grounds are loveliest May–September when the gardens are in. The buildings stay open year-round; cultural programming is concentrated in the autumn–spring season. Lux Helsinki light festival (early January) lights up the façade and is worth a dedicated evening visit.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Lapinlahdenpolku 8, 00180 Helsinki",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~20 min",
      notes:
        "M1 or M2 metro one stop from Lauttasaari to Ruoholahti (~3 min), then a 10–15 min walk north along Hietalahdenranta — the white classicist hospital is visible across the bay the whole way. Alternative for a walking-day: cross the Lauttasaari bridge and follow the seashore (~30 min total).",
    },
    cost: {
      perPersonEur: 0,
      notes:
        "Free entry to the grounds, park, and Mental Museum. Café Lähde lunch ~€9.90 weekday / €11.90 weekend. Sauna sessions and concert tickets priced separately and bookable online.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "Walk-in for the museum, café, and grounds. Sauna sessions and ticketed events need advance booking via lapinlahdenlahde.fi — sauna in particular books out on weekends.",
    },
    suitableAgeRange: { min: 8 },
    childrenNotes:
      "Park and grounds work for any age — open lawns, allotment gardens, the chapel ruin to scramble around, and a small beach across the road. The Mental Museum's content is gentle but genuinely about psychiatric history (including restraints and historical treatments), so it lands better with older kids who are ready to read about it than with under-eights. Stroller-friendly outdoors; the 19th-century corridors have a few steps and uneven thresholds.",
    indoorOutdoor: "mixed",
    physicalIntensity: "low",
    duration: "1-3h",
    website: "https://lapinlahdenlahde.fi/en/",
    tags: ["museum", "historical"],
  },
  {
    slug: "helsinki-city-museum",
    title: "Helsinki City Museum",
    shortDescription:
      "Finland's second most visited museum, free every day, threaded across five connected old buildings off Senate Square — including Sederholm House (1757, the oldest building in Helsinki) and its hands-on Children's Town.",
    longDescription: [
      "Helsinki City Museum (Helsingin kaupunginmuseo) tells the story of the city itself — how a fishing town founded in 1550 became a Russian-empire capital, an industrial port, and the modern Finnish capital — through five connected historic buildings on Aleksanterinkatu just off Senate Square. The main entrance is at Aleksanterinkatu 16 in a pair of stitched-together 19th-century merchant houses; the complex extends west into Sederholm House, the oldest building in Helsinki, completed in 1757 by merchant Johan Sederholm and the only stone civilian building to survive the fires that repeatedly swept through wooden Helsinki.",
      "The permanent exhibitions rotate but always sit in the same register: scale models of vanished neighbourhoods, photographs of street corners then-and-now, recreated 1930s shop interiors, and personal objects donated by Helsinkians. Exhibitions running through 2026 include \"The Unknown Suburb\" (the post-war ring of concrete-slab estates that house most of the city's population) and \"In the Quarters of Kruununhaka\" (the patrician district immediately around the museum). A new main exhibition opens in summer 2026.",
      "The unmissable piece if you're visiting with kids is Children's Town inside Sederholm House — a hands-on indoor playground threaded through the 18th-century rooms. Children climb into a horse-drawn carriage, steer a wooden ship, play shopkeeper in a recreated Sederholm-era store, sit at desks in a 1930s schoolroom while a stern schoolmaster looms in projection, and explore Grandma's 1970s flat with the period TV running cartoons of the day. It's calibrated for roughly ages 3–10 and works in any weather.",
      "Free entry to everything, all the time, no ticket needed. From Lauttasaari, take the metro to Helsinki Central (~6 min), then walk 8–10 minutes east through Senate Square — the museum is on the north side of Aleksanterinkatu. Pair it naturally with the Cathedral, the Old Market Hall (10 min walk south), or Uspenski (10 min east). Allow 1–2 hours, more with kids in Children's Town.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Kaupunginmuseo2.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/New_Helsinki_City_Museum,_enter.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Kaupunginmuseo_sisäpiha.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Aleksanterinkatu_near_Helsinki_City_Museum_on_a_sunny_evening_in_July_2023.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Sederholmin_talo.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Sederholm_House_-_Sederholmin_talo_2008_C_HPIM0721.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Sederholmin_talon_seinä.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule: "Mon–Fri 11:00–19:00, Sat–Sun 11:00–17:00. Closed on most public holidays — check the site before holiday-week visits.",
      notes:
        "Year-round, indoor, weather-proof. Especially welcome on a cold or rainy day, and a natural pair with other Senate Square sights that are also walkable in any season.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Aleksanterinkatu 16, 00170 Helsinki",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~20 min",
      notes:
        "Metro from Lauttasaari east to Helsinki Central (~6 min), then 8–10 min walk east via Aleksanterinkatu through Senate Square. Sederholm House is two doors further east at no. 18.",
    },
    cost: {
      perPersonEur: 0,
      notes: "Always free entry to all five museum buildings.",
    },
    booking: {
      leadTime: "same-day",
      notes: "Walk-in. No reservations needed.",
    },
    suitableAgeRange: { min: 0 },
    childrenNotes:
      "Children's Town in Sederholm House is the headline draw for kids — calibrated for roughly ages 3–10, hands-on and interactive throughout. Stroller-friendly entrances and lifts in the main museum; the 18th-century Sederholm House has a few uneven thresholds but accommodates buggies. Free family bathrooms and a quiet baby-feeding nook.",
    indoorOutdoor: "indoor",
    physicalIntensity: "low",
    duration: "1-3h",
    website: "https://www.helsinginkaupunginmuseo.fi/en/",
    tags: ["museum", "historical"],
  },
  {
    slug: "designkaverit-christmas-pop-up",
    title: "Designkaverit Christmas Pop-Up at Forum",
    shortDescription:
      "Six weeks each winter, the second floor of Forum shopping centre fills with 140+ Finnish design brands selling under one roof — homewares, prints, jewellery, kids' clothes, ceramics, chocolate — at Designkaverit's annual Iloinen Joulukauppa.",
    longDescription: [
      "Designkaverit (\"design buddies\") is a Finnish design community that runs pop-up shops, fairs, and design events around the country. Their flagship event is Iloinen Joulukauppa — the \"Happy Christmas Shop\" — a six-week pop-up that takes over the second floor of Forum, the shopping centre on Mannerheimintie at the heart of Helsinki. Over 140 small Finnish design brands and independent makers share the space: ceramics studios, textile-printers, jewellers, illustration brands, candle-makers, soap-makers, small-batch chocolatiers, and clothing labels you wouldn't otherwise find under one roof. The pop-up celebrated its 10th edition in 2025.",
      "The format is what makes it work as a Christmas-shopping experience rather than a craft fair you grind through. Every brand has a tidy curated shelf or stand; the staff at the central till handle payment for everything in one transaction; and the ratio of \"actually want this\" to \"polite glance and move on\" is unusually high because Designkaverit has been refining the brand list for ten years. Price points run from €5 postcards to €200+ ceramics, with a sweet spot around €20–60 — the gift bracket. If you're shopping for someone who already has a kitchen full of Iittala, this is the place to find the up-and-coming makers Iittala will be partnering with in five years.",
      "It runs roughly mid-November through 23 December every year. Mall hours apply: Mon–Fri 10:00–20:00, Sat 10:00–18:00 or 19:00, Sun 12:00–18:00. Free to browse — you only pay if you find something. Take the metro from Lauttasaari one stop east to Kamppi (~3 min), then walk underground through the Kamppi mall and surface inside Forum, or walk up Mannerheimintie. Plan an hour minimum; you'll spend two if you start picking things up. There are cafés on the same floor of Forum if you need to regroup.",
      "Outside the November–December window there is no Designkaverit pop-up at Forum — the rest of the year that floor is regular tenanted retail. Forum itself is fine to wander through (140 mainstream shops, food court, the Amos Anderson art museum upstairs) but it's not why this entry exists. Come for the Christmas pop-up, or skip it.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Forum_shopping_center,_Helsinki.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Forum_interior_-_Helsinki_-_DSC03803.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Forum_Helsinki.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Mannerheimintie_-_panoramio_(11).jpg",
    ],
    availability: {
      suitableMonths: [11, 12],
      events: [{ from: "11-15", to: "12-23", name: "Iloinen Joulukauppa" }],
      weeklySchedule: "Mon–Fri 10:00–20:00, Sat 10:00–19:00, Sun 12:00–18:00",
      notes:
        "Date-locked: only runs roughly 15 November through 23 December each year. Exact dates shift slightly — confirm via designkaverit.fi before planning a special trip. Outside this window the second-floor space reverts to ordinary mall retail.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Forum, 2nd floor, Mannerheimintie 20, 00100 Helsinki",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~10 min",
      notes:
        "Metro one stop east from Lauttasaari to Kamppi (~3 min), then 3-min walk surfacing into Forum via the underground passage from Kamppi mall, or a 5-min walk above ground up Mannerheimintie. The pop-up is on the 2nd floor — escalators or lifts from any entrance.",
    },
    cost: {
      perPersonEur: 0,
      notes:
        "Free to browse. You'll spend if you buy — typical gift-bracket prices €20–60, with a long tail of postcards and prints under €10 and statement ceramics above €100.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "Walk-in. Busiest on the last two weekends before Christmas; weekday mornings and Sunday afternoons are quietest.",
    },
    suitableAgeRange: { min: 0 },
    childrenNotes:
      "Stroller-friendly throughout the mall — wide aisles, lifts on every floor, family bathrooms in Forum. Several kids' brands among the vendors so the under-10 crowd has something to look at, but it's still a shopping pop-up and small kids will lose interest after 30–40 minutes.",
    indoorOutdoor: "indoor",
    physicalIntensity: "low",
    duration: "1-3h",
    website: "https://www.designkaverit.fi/",
    tags: ["design"],
  },
  {
    slug: "muji-kamppi-community-market",
    title: "MUJI Kamppi — Local Design Village & Community Market",
    shortDescription:
      "Inside the largest MUJI in Europe (the entire 4th floor of Kamppi mall), a permanent Finnish-makers shop-in-shop runs year-round and a bi-weekly community market expands it into a Friday–Saturday craft-fair drop-in.",
    longDescription: [
      "MUJI's Kamppi flagship is unusual for the chain: rather than a clean grid of MUJI's own household goods, a meaningful slice of the floor is given over to local Finnish makers. The whole top floor of the Kamppi shopping centre — about 3,500 m², the largest MUJI store in Europe — has been split into a Japanese-house aesthetic surrounding a Finnish-design pocket. Two pieces of that pocket are why this entry exists: the year-round Local Design Village shop-in-shop, and the bi-weekly MUJI Community Market that turns Fridays and Saturdays into a small craft fair inside the store.",
      "The Local Design Village is a permanent counter and shelving area on the 4th floor that rotates dozens of small Finnish brands. It's a way to find the maker-scale ceramics, illustration prints, jewellery, candles, kids' clothes, wooden goods, and small-batch food that would otherwise mean tracking down ten different studios in the Design District. Sits alongside a Local Food Store with products from over 100 small Finnish producers — coffee, rye bread, jams, beverages, Karelian pastries — and a Small Gallery that hosts rotating exhibitions by Finnish artists.",
      "The Community Market is the every-other-Friday-and-Saturday version: independent makers physically come into the store with their tables and their goods, and you can talk to them while you shop. Schedule is published on the MUJI Kamppi Instagram (@mujikamppi); roughly two weekends a month, daytime hours. If you've ever walked through a craft fair and wished you could fold it into a bigger shopping run rather than committing to a Saturday on the cobblestones, this is that.",
      "Free to browse all of it. Mall hours: Mon–Fri 10:00–20:00, Sat 10:00–19:00, Sun 12:00–18:00 (Sundays the Community Market itself isn't running; the Local Design Village stays open). MUJI Ravintola — the on-site restaurant, also Europe's first MUJI restaurant — does Japanese-leaning lunches and deli food daily, plus authentic dinner service Thu–Sat evenings. From Lauttasaari, the metro stops directly at Kamppi (~3 min, no walk needed); take the lift to the 4th floor.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Diagonal_view_of_Narinkkatori_with_Kamppi_Center_on_a_sunny_afternoon_in_May_2024.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Entrance_to_Kamppi_Center_on_an_evening_in_February_2025.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_KamppiCenter_01.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Kamppi_shopping_centre_on_an_August_evening.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Narinkkatori_in_June_2024.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Mall: Mon–Fri 10:00–20:00, Sat 10:00–19:00, Sun 12:00–18:00. Community Market: every other Fri–Sat — confirm the next dates via @mujikamppi on Instagram.",
      notes:
        "Local Design Village runs year-round during mall hours. Community Market is bi-weekly Fri–Sat — pick a market weekend if you want the maker-fair experience, otherwise the Local Design Village still gives you the curated Finnish-design selection.",
    },
    location: {
      region: ["Helsinki", "Uusimaa"],
      address: "Kamppi Shopping Centre, 4th floor, Urho Kekkosen katu 1, 00100 Helsinki",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~10 min",
      notes:
        "M1 or M2 metro one stop east from Lauttasaari direct to Kamppi (~3 min). The Kamppi metro station opens directly into the shopping centre — take the lift or escalators to the 4th floor for MUJI.",
    },
    cost: {
      perPersonEur: 0,
      notes:
        "Free to browse. Local Design Village price points vary — postcards and small prints under €10, ceramics and jewellery typically €30–150. Community Market vendors set their own prices, often slightly cheaper than at retail.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "Walk-in. No reservations for the market or the store. MUJI Ravintola dinner service Thu–Sat evenings benefits from a same-day reservation.",
    },
    suitableAgeRange: { min: 0 },
    childrenNotes:
      "Stroller-friendly throughout — wide aisles, lifts directly to the 4th floor. MUJI's children's section and a few kids' brands at Local Design Village give younger visitors something to look at, but a craft-shopping pop-up still lands better with under-10s for ~30 minutes than for a full hour.",
    indoorOutdoor: "indoor",
    physicalIntensity: "low",
    duration: "1-3h",
    website: "https://www.muji.com/flagship/kamppi-helsinki/en/",
    tags: ["design"],
  },
  {
    slug: "andante",
    title: "Andante",
    shortDescription:
      "A florist-turned-specialty-café on Fredrikinkatu in Punavuori, named for the musical \"moderately, slow\" — a rotating list of Nordic and European award-winning roasters, hand-brew filter, scones and Basque cheesecake, and exposed-brick light all afternoon.",
    longDescription: [
      "Andante opened in a former Punavuori flower shop that had been on the same Fredrikinkatu block since 1990, and the bones of the old place — exposed red brick, reclaimed wood, plants still tucked along the windows — became the bones of the café. The name is musical: andante, \"moderately, slow.\" That's the pace of the room and the philosophy of the bar; nothing is rushed, hand-brews are pulled at filter temperature, conversation runs long, and the staff are happy to talk you through the day's beans without making it feel like a quiz.",
      "The coffee programme is rotational rather than house-roast. On any given visit there are two or three filter options and one or two espressos drawn from a list of European award-winning roasters that has included Kawa (Paris), La Cabra (Copenhagen), Manhattan Coffee (Rotterdam), Dak (Amsterdam), and Helsinki's own Samples — the kind of line-up that Helsinki coffee-people rotate through over a weekend and Andante curates into a single bar. Filter is the move; if you order one drink, make it the V60.",
      "Pastry is the other reason to stay. Daily-baked scones, matcha tiramisu, Basque cheesecake, and a strong carrot cake — all baked in-house, all available until they sell out (which happens earlier than you'd expect on weekends). The kitchen also runs raw and vegan options, a holdover from the early concept. House-made granola and drip-bag coffee are sold to take home; merchandise is light but tasteful.",
      "Open Mon–Fri 09:00–18:00 and Sat 11:00–18:00, closed Sundays. Coffee €4–6, pastries €5–8, the typical sit-down stop is €10–12. Walk-in only — no reservations, and no hot food beyond pastry, so it's a coffee-and-cake stop rather than a meal. From Lauttasaari, the easiest route is bus 21 to Erottaja or the metro to Kamppi and a 10-minute walk south through the Design District. Pair naturally with a wander through Punavuori's small design shops on the same afternoon.",
    ],
    thumbnailUrl:
      "https://andantecoffee.com/cdn/shop/files/IMG_6108.jpg",
    galleryUrls: [
      "https://andantecoffee.com/cdn/shop/files/IMG_4967.jpg",
      "https://andantecoffee.com/cdn/shop/files/IMG_5142.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Fredrikinkatu_on_an_afternoon_in_August_2024.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Fredrikinkatu_from_Ratakatu.JPG",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule: "Mon–Fri 09:00–18:00, Sat 11:00–18:00, closed Sundays",
      notes:
        "Year-round. Especially welcome on a winter afternoon — the room is bright, the brick walls absorb the cold, and the brew time matches the pace you'd want anyway.",
    },
    location: {
      region: ["Helsinki", "Punavuori", "Uusimaa"],
      address: "Fredrikinkatu 20, 00120 Helsinki",
    },
    accessFromLauttasaari: {
      complexity: "simple",
      duration: "~15 min",
      notes:
        "Bus 21 from Lauttasaari to Erottaja stop (~12 min) puts you a 3-min walk away. Alternative: M1/M2 metro to Kamppi (~3 min), then a 10-min walk south through the Design District along Fredrikinkatu.",
    },
    cost: {
      perPersonEur: 8,
      notes:
        "Filter coffee €4–5, espresso drinks €4–6, pastries €5–8. A typical sit-down coffee-and-cake stop is €10–12.",
    },
    booking: {
      leadTime: "same-day",
      notes:
        "Walk-in only, no reservations. Busiest weekend afternoons — go before 11:00 on Saturday or any weekday morning to be sure of a table and the full pastry case.",
    },
    suitableAgeRange: { min: 0 },
    childrenNotes:
      "Stroller-accessible — single ground-floor room, no steps. Quiet, conversational atmosphere; older kids do fine, toddlers may find the slow pace boring. No high chairs guaranteed but a low bench seat works for sharing.",
    indoorOutdoor: "indoor",
    physicalIntensity: "low",
    duration: "<1h",
    website: "https://andantecoffee.com/",
    tags: ["food"],
  },
  {
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
    tags: ["food"],
  },
];

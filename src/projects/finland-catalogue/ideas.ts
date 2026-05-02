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
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule: "Mon–Fri 8:00–21:00, Sat–Sun 10:00–20:00",
      notes:
        "Especially welcome in winter as a warm, free, all-day refuge in the city centre.",
    },
    location: {
      region: "Helsinki",
      address: "Töölönlahdenkatu 4, 00100 Helsinki",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "~5 min walk",
      notes:
        "Directly opposite Helsinki Central Station across Kansalaistori square. Trams 1, 2, 4, 10 (Lasipalatsi) and 3, 5, 6, 7, 9 (Kaivokatu) also stop within a block.",
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
      region: "Turku",
      address: "Kailo Island, Naantali (next to Naantali old town, ~16 km west of Turku)",
    },
    accessFromHelsinki: {
      complexity: "complex",
      duration: "~3h each way",
      notes:
        "VR train Helsinki – Turku (~2h, frequent), then Föli local bus 6 or 6A from Turku to Naantali (~30 min). Park is a short walk from the bus stop across a wooden bridge. Doable as a long day trip but most visitors stay overnight in Naantali or Turku.",
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
    tags: [],
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
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Tue–Sun 10:00–17:00 (Jun–Aug 10:00–18:00). Closed Mondays.",
      notes:
        "Closed 1 May, 19–21 Jun (Midsummer), 6 Dec (Independence Day), and 24–25 & 31 Dec. Last admission 30 min before closing.",
    },
    location: {
      region: "Turku",
      address: "Linnankatu 80, 20100 Turku",
    },
    accessFromHelsinki: {
      complexity: "moderate",
      duration: "~2.5h each way",
      notes:
        "VR train Helsinki – Turku (~2h, frequent), then Föli bus 1 from Turku Central Station (~15 min) or a 25-min riverside walk. The castle is by the harbour, next to the ferry terminal.",
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
      region: "Turku",
      address: "Linnankatu 72, 20100 Turku",
    },
    accessFromHelsinki: {
      complexity: "moderate",
      duration: "~2.5h each way",
      notes:
        "VR train Helsinki – Turku (~2h), then Föli bus 1 from the station (~15 min) or a 25-min riverside walk. Right next to Turku Castle — pair them as one day.",
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
    tags: ["museum", "historical"],
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
      region: "Turku",
      address: "Linnankatu 72, 20100 Turku (moored at Forum Marinum dock)",
    },
    accessFromHelsinki: {
      complexity: "moderate",
      duration: "~2.5h each way",
      notes:
        "Same as Forum Marinum: VR train Helsinki – Turku (~2h), then Föli bus 1 (~15 min) or 25-min riverside walk. Right next to Turku Castle.",
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
    tags: ["museum", "historical"],
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
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Daily ~9:00–18:00 (extended evening hours in summer). Hours vary; services and concerts can close it to visitors.",
      notes:
        "It's a working Lutheran church — Sunday morning services, weddings, and concerts close it to general entry. Check the official site if timing matters.",
    },
    location: {
      region: "Helsinki",
      address: "Unioninkatu 29, 00170 Helsinki (Senate Square)",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "~5 min walk",
      notes:
        "Senate Square is a 5-min walk from Helsinki Central Station. Trams 2 and 4–7 stop on Aleksanterinkatu a block away. Walk up the granite steps from the south side of the square.",
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
      region: "Helsinki",
      address: "Esplanadi park, between Erottaja and Market Square, 00130 Helsinki",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "~5 min walk",
      notes:
        "5–10 min walk from Helsinki Central Station. Trams 2, 4, 5 stop at Ylioppilastalo or Senaatintori within a block.",
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
      region: "Helsinki",
      address: "Kauppatori, 00170 Helsinki (South Harbour)",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "~10 min walk",
      notes:
        "10-min walk from Helsinki Central Station along Esplanadi. Trams 2 and 5 stop at Kauppatori; ferry to Suomenlinna leaves from the same square.",
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
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule: "Mon–Sat 10:00–18:00. Closed Sundays.",
      notes:
        "Individual stalls set their own hours — some close at 17:00, a few at 16:00 on Saturday. Sunday closure is firm.",
    },
    location: {
      region: "Helsinki",
      address: "Eteläranta, 00130 Helsinki (South Harbour, beside Kauppatori)",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "~10 min walk",
      notes:
        "10-min walk from Helsinki Central Station along Esplanadi, then turn right at Market Square. Trams 2 and 5 stop at Kauppatori.",
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
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Islands open 24/7. Most museums and the brewery open May–Sept; the Suomenlinna Museum is the main year-round indoor stop.",
      notes:
        "Genuine year-round destination but the experience flips: summer is the postcard version, winter is empty ramparts and ice. Late spring (May) and early autumn (Sept) hit the sweet spot — open museums, no crowds.",
    },
    location: {
      region: "Helsinki",
      address: "Suomenlinna islands, 00190 Helsinki (15-min ferry from Kauppatori)",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "~25 min total (10 min walk + 15 min ferry)",
      notes:
        "HSL public ferry from Kauppatori (Market Square). Buy an AB single ticket (€3.30) at the dock or in the HSL app — same ticket as the trams. Departs every 20 min in summer, 40–60 min in winter. The private JT-Line waterbus also runs in summer (separate ticket, more scenic).",
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
    tags: ["museum", "landmark", "historical"],
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
      region: "Hämeenlinna",
      address: "Kustaa III:n katu 6, 13100 Hämeenlinna (~100 km north of Helsinki)",
    },
    accessFromHelsinki: {
      complexity: "moderate",
      duration: "~1h 15 min each way",
      notes:
        "VR Intercity or Pendolino train Helsinki – Hämeenlinna (~1h, frequent), then a 15-min walk along the lake from the station to the castle peninsula. Easy half-day from Helsinki — no overnight needed.",
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
];

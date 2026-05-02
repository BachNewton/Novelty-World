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
  {
    slug: "uiva-flytande",
    title: "Uiva Flytande – Helsinki Boat-Afloat Show",
    shortDescription:
      "The largest in-water boat show in the Nordics — nearly 300 boats moored at HSK yacht club in Lauttasaari for four days each August, plus 3,000 m² of land-based exhibits and food trucks on the quay.",
    longDescription: [
      "Uiva Flytande (\"Floating\" in Finnish/Swedish) is the Helsinki Boat-Afloat Show, organised every August by Finnboat — the Finnish Marine Industries Federation — at the Helsingfors Segelklubb (HSK) yacht club marina on the eastern shore of Lauttasaari. HSK is one of Finland's oldest sailing clubs, founded in 1899, and the harbour has hosted the show since 1980. The 2026 edition is the 14th to use the Uiva Flytande branding and runs Thu–Sun, 13–16 August.",
      "The pitch is simple: instead of looking at boats parked on land in a convention centre, you walk the floating pontoons and step aboard nearly 300 boats actually in the water — 5–7 m motorboats (the dominant Finnish category), bigger cabin cruisers, sailboats, RIBs, fishing boats, catamarans. About 30 of those are Nordic premieres each year. On shore, 3,000 m² of land-based stands cover engines, electronics, trailers, marine clothing, and brokerage services, plus a row of food trucks, a café tent, and a small stage for product talks and family activities.",
      "Even if you have zero intention of buying a boat, it's a satisfying afternoon — the marina setting is genuinely beautiful, the boats range from approachable runabouts up to half-million-euro yachts you can climb on, and Finnish boating culture is on full display (this is a country with one of the highest boats-per-capita ratios in the world). Allow two to three hours; longer if you actually want to sea-trial something.",
      "Adults €14 online (€18 at the gate), kids 7–15 €5 online (€8 gate), under-7 free. Tickets go on sale in May. Take the metro to Lauttasaari station, then the free shuttle bus that runs every 20 min from outside Lauttis shopping centre — it drops you at the gate. Driving is awkward; the lot fills early and costs €10/day.",
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
        "Four-day annual event in mid-August. Exact weekend shifts a day or two each year — check uiva.fi before booking flights around it.",
    },
    location: {
      region: "Helsinki",
      address: "HSK Yacht Club, Vattuniemen puistotie 1, 00210 Helsinki (Lauttasaari)",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "~25 min",
      notes:
        "Metro from Helsinki Central Station to Lauttasaari (~6 min), then the free event shuttle bus from outside Lauttis shopping centre — runs every 20 min while the show is open. Driving not recommended; small paid lot (€10/day) fills early.",
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
    tags: [],
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
      "From Helsinki, the romance is the Santa Claus Express overnight train (departs Helsinki ~19:30 or ~22:30, arrives Rovaniemi around 08:00 — sleeper berths from €49, basic seat from €29 via VR). Faster: a 1h 20m Finnair or Norwegian flight to Rovaniemi Airport, which sits 3 km from the village (a 5-min taxi or hotel shuttle). From central Rovaniemi, local bus 8 runs to the village year-round (~30 min, €4 single). Most people pair this with a husky safari or aurora trip, since you're already up here.",
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
      region: "Lapland",
      address: "Tähtikuja 1, 96930 Napapiiri (Arctic Circle), Rovaniemi",
    },
    accessFromHelsinki: {
      complexity: "complex",
      duration: "Overnight train ~12h, or flight ~1h 20m + 5-min taxi",
      notes:
        "Two routes from Helsinki. (1) VR's Santa Claus Express overnight train: departs ~19:30 or ~22:30, arrives Rovaniemi ~07:30–08:30; sleeper berths from €49, basic seat from €29. (2) Finnair or Norwegian flight to Rovaniemi Airport (~1h 20m); the airport is only 3 km from the village — taxi or hotel shuttle. From central Rovaniemi, local bus 8 runs to the village year-round (~30 min, ~€4). Effectively a multi-day trip — almost no one does this as a same-day return.",
    },
    cost: {
      perPersonEur: 0,
      notes:
        "Village entry and meeting Santa are free. Photo packages from ~€40 single / €55 group of 5. Reindeer rides ~€20–40, husky safaris from €130, snowmobile tours from €150. Lunch in a village restaurant ~€15–25. Easy to spend €100+ per person across the day even with free entry.",
    },
    booking: {
      leadTime: "months",
      notes:
        "The village itself doesn't need booking, but the December train berths, flights, hotels, and husky/aurora tours sell out months in advance for the Christmas-week window. Aim 4–6 months out for a December trip; 2–3 weeks is fine November or shoulder-season.",
    },
    suitableAgeRange: { min: 2, max: 12 },
    childrenNotes:
      "The whole village is built for young children. Strollers handle the main paths but get bogged down in fresh snow — a sled or carrier is better in deep winter. Bring proper outerwear; daytime temps run −15 to −25°C in midwinter and kids bail fast if they're cold.",
    indoorOutdoor: "mixed",
    physicalIntensity: "low",
    duration: "half-day",
    website: "https://santaclausvillage.info/",
    tags: [],
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
      region: "Helsinki",
      address: "Coastal cycle path — easiest to start at Kauppatori (Market Square) or Kaivopuisto, both with city-bike stations.",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "Start anywhere along the southern coast",
      notes:
        "Citybike stations are at Kauppatori, Kaivopuisto, Hietaranta, and dozens of other points along the route. Register the HSL Citybike app first (debit/credit card + 4-digit PIN), buy a day/week/season pass, then unlock any yellow bike. Trams 2/3/6 reach the coastal start points.",
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
    tags: [],
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
      region: "Tampere",
      address: "Alaverstaanraitti 5, 33100 Tampere",
    },
    accessFromHelsinki: {
      complexity: "moderate",
      duration: "~2h each way",
      notes:
        "VR Pendolino or Intercity train Helsinki – Tampere (~1h 50m, every 30–60 min). Vapriikki is a 10-min walk from Tampere station along the Tammerkoski rapids. Doable as a half-day from Helsinki with no overnight.",
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
      region: "Helsinki",
      address: "Mikonkatu 17 (Tilausratikan pysäkki), 00100 Helsinki",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "~2 min walk",
      notes:
        "Departs from a dedicated charter-tram stop on Mikonkatu, ~2-min walk from Helsinki Central Station's east exit. Just walk up.",
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
      region: "Helsinki",
      address: "Old Porvoo, 06100 Porvoo (~50 km east of Helsinki)",
    },
    accessFromHelsinki: {
      complexity: "moderate",
      duration: "~50 min by bus, or 3.5h cruise each way",
      notes:
        "Two routes. (1) m/s J.L. Runeberg from Linnanlaituri (South Harbour, next to Market Square) at 10:00, returning from Porvoo 16:00 — May–Sept, Tue/Wed/Fri/Sat plus Sun Jun–Aug. (2) OnniBus from Kamppi bus terminal — hourly, ~50 min, €6–9, year-round.",
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
    tags: ["historical", "landmark"],
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
      "From Helsinki, take any commuter train heading north to Tikkurila — lines I, P, K, R, T, D, N, Z all stop there, about 20 minutes from Central Station. Then it's a 700-metre signposted walk to the Heureka entrance. The same airport-bound P train means you can fit a Heureka stop on the way to or from Helsinki–Vantaa Airport, if you've planned a long layover.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Science_centre_Heureka_in_Tikkurila,_Vantaa,_Finland,_2022_June.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Heureka_(8001).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Smilodon_model_at_Heureka.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Heureka_Tiedekeskus.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Heureka_planetarium_2.jpg",
    ],
    availability: {
      suitableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      weeklySchedule:
        "Summer (1 Jun – 9 Aug 2026): Mon–Fri 09:00–18:00, Sat–Sun 10:00–18:00. Off-season: typically Tue–Fri 10:00–17:00, Sat–Sun 10:00–18:00, closed Mondays. Thursday evenings 15:00–20:00 are flat €10.",
      notes:
        "Closed a few public holidays — verify before Easter weekend or late December. Year-round indoor destination; the outdoor Galileo Science Park is summer-only.",
    },
    location: {
      region: "Helsinki",
      address: "Tiedepuisto 1, 01300 Vantaa (Tikkurila district)",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "~30 min",
      notes:
        "VR commuter trains I, P, K, R, T, D, N, or Z from Helsinki Central Station to Tikkurila (~20 min, included in HSL ABC zone ticket). 700-m signposted walk from the station. Conveniently near Helsinki–Vantaa Airport — easy stopover on the airport-bound P train.",
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
      region: "Helsinki",
      address: "Multiple Helsinki-area Fleet harbours (Lauttasaari, Vuosaari, Hanasaari, others). Rent boats listed at private berths across the metro area.",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "10–30 min by tram/metro to the harbour, then on the water",
      notes:
        "Each Fleet harbour is reachable by tram, metro, or HSL bus. Lauttasaari (~12 min metro) and Vuosaari (~25 min metro) are the most central. Once on board you're 10–30 min by boat to Suomenlinna, Pihlajasaari, or the inner archipelago.",
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
    tags: [],
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
      region: "Helsinki",
      address: "Main boarding point: Senate Square (Senaatintori), 00170 Helsinki. Tickets also sold at Market Square and onboard.",
    },
    accessFromHelsinki: {
      complexity: "simple",
      duration: "~5 min walk from Central Station",
      notes:
        "5-min walk from Helsinki Central Station to Senate Square. Trams 2/4/5/7 stop a block away. Buy tickets online for the discount; otherwise pay the driver in cash or card at the door.",
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
      region: "Helsinki",
      address: "Departure: West Terminal (Länsiterminaali) T2, Tyynenmerenkatu 14, 00220 Helsinki. Arrival: D-Terminal, Lootsi 13, Tallinn.",
    },
    accessFromHelsinki: {
      complexity: "moderate",
      duration: "~2h each way on the ferry; 5–10 min to/from terminals",
      notes:
        "Tram 7 from Helsinki Central Station to West Terminal 2 (~10 min). All three ferries (Tallink Silja MyStar/Megastar, Eckerö M/S Finlandia, Viking Line XPRS) depart from T2. In Tallinn the ferries dock at D-Terminal, a 10-min walk or short bus 2 ride to the Old Town gate.",
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
    tags: ["historical", "landmark"],
  },
  {
    slug: "stockholm-overnight-ferry",
    title: "Stockholm Overnight Ferry",
    shortDescription:
      "Board a Tallink Silja or Viking Line cruiseferry at Helsinki's Olympia Terminal at 17:00, sleep in a cabin while the ship threads the Åland archipelago, dock in central Stockholm at ~10:00 — a full day in Gamla Stan, then sail back the same way.",
    longDescription: [
      "The Helsinki–Stockholm overnight ferry is one of the great European travel rituals — Finns and Swedes have ridden it for generations as a working booze-cruise (alcohol stays duty-free as long as the route touches Åland's tax-loophole waters), and visitors take it because it's a frankly novel way to add Stockholm to a Helsinki trip without flying. Two operators run it: Tallink Silja with the sister ships Silja Serenade (1990) and Silja Symphony (1991), and Viking Line with the new Viking Glory. All are massive 200-metre cruiseferries with 13 decks, multiple restaurants, bars, a spa, a small casino, kid play areas, and the famous central indoor promenade that runs almost the full length of the ship like a high-street.",
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
      region: "Helsinki",
      address: "Departure: Olympia Terminal, Olympiaranta 1, 00140 Helsinki. Arrival: Värtahamnen, Hamnpirsvägen 10, 11556 Stockholm.",
    },
    accessFromHelsinki: {
      complexity: "moderate",
      duration: "~17h each way (overnight)",
      notes:
        "Tram 2 from Helsinki Central Station to Olympia Terminal (~10 min, included in HSL ticket). Two-night minimum for the full Stockholm experience — sleep in a cabin both nights, full day in the city in between.",
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
    tags: [],
  },
];

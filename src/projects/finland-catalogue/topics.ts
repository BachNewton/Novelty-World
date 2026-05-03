import type { Topic } from "./types";

/**
 * Hand-curated cultural & educational Topics about Finland. Populate by
 * running the `add-finland-topic` Claude Code skill, which researches
 * each topic on the web and appends a fully-populated entry to this
 * array.
 */
export const TOPICS: Topic[] = [
  {
    slug: "sauna",
    title: "Sauna",
    aliases: ["sauna", "saunas", "sauna culture", "löyly"],
    shortDescription:
      "Finland has more saunas than cars — roughly three million for five and a half million people, and most still get used every week.",
    longDescription: [
      "The sauna is a wood-lined room with benches and a stone-topped stove (kiuas), heated to 80–100°C. You sit naked, throw water onto the stones to release löyly — the spirit of steam that rises and stings the skin — and cycle between the heat, a cooling break, and back in. In Finland this isn't a wellness amenity or a spa upsell; it's a weekly ritual older than the country itself.",
      "For centuries the sauna was the most sterile space in any homestead. Babies were born in them through the 1950s, the dead were washed there before burial, meat was cured in them, injuries were treated in them. Finns called it a \"church of nature\", and that reverence carries through today. UNESCO added Finnish sauna culture to its Intangible Cultural Heritage list in 2020 — the country's first entry on it.",
      "You'll encounter three kinds. Electric saunas are the everyday default — most apartments have one, and most apartment blocks have a shared one with bookable time slots. Wood-fired saunas at lakeside cottages (mökki) give a softer steam and the smell of burning birch. Smoke saunas (savusauna) are the original form: no chimney, the room fills with smoke for hours while the stones heat, then is vented before bathing; the walls blacken to a deep char and most Finns will tell you the smoke sauna is the real thing.",
      "As a visitor the easiest entry points are hotel saunas, public swim halls, and Helsinki's design saunas (Löyly, Allas, Kulttuurisauna). Etiquette is simpler than the mythology suggests: naked is normal in single-sex saunas, swimsuits are fine in the modern mixed ones, you sit on a small towel for hygiene, and you ask before throwing more water on the stones. Take a beer for after, jump in a lake or the sea between rounds if there's one nearby, and don't try to outlast the locals.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Traditional_Finnish_sauna_whisking_and_löyly.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Smoke_sauna.JPG",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Finnish_Vasta_(Vihta).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Sauna_ladle_and_bucket_2016_(cropped).jpg",
    ],
  },
  {
    slug: "winter-swimming",
    title: "Winter Swimming",
    aliases: [
      "winter swimming",
      "winter-swimming",
      "winter swimmer",
      "winter swimmers",
      "ice swimming",
      "ice-swimming",
      "ice swimmer",
      "ice swimmers",
      "avantouinti",
      "avanto",
      "ice hole",
    ],
    shortDescription:
      "After the sauna, Finns climb out, walk to a hole cut in the lake ice, and lower themselves in — it's the part of sauna culture nobody warns you about.",
    longDescription: [
      "Avantouinti — winter swimming through an avanto, a hole cut in the lake or sea ice — is the cold-water other half of Finnish sauna culture. The pattern is sauna, plunge, sauna, plunge, repeat: 80°C of dry heat for fifteen minutes, then a deliberate walk to a ladder set into the ice, then ten or twenty seconds in water that's actively freezing. The shock is real, the endorphin rush afterwards is enormous, and most people who try it once want to do it again.",
      "The practice goes back at least to the 1600s, but the modern club scene began with Finland's first registered winter-swimming society in 1923. Today over 720,000 Finns swim regularly through the winter — close to one in seven adults — and most major clubs have waitlists. The official Finnish winter-swimming season runs October through May.",
      "The hole stays open through the coldest months because most clubs run a small electric pump that circulates surface water; without it the avanto would refreeze overnight. There's a ladder into the water, a railing for the climb out, and a heated changing room and sauna a short shuffle away. Wool socks and gloves are normal — the extremities feel the cold worst — and most regulars stay in for ten to thirty seconds, not minutes.",
      "As a visitor, the easiest entry points are Allas Sea Pool, Löyly, and Kulttuurisauna in Helsinki — all keep an avanto open through the winter and rent towels if you didn't bring one. Sauna first to warm the body, breathe slowly going in, and skip it if you have heart conditions or untreated high blood pressure.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Ice_swimming_at_summer_cottage_Finland.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Ispoinen_ice_swimming.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/2018_Winter_in_Helsinki,_Finland_(26611927908).jpg",
    ],
  },
  {
    slug: "sisu",
    title: "Sisu",
    aliases: ["sisu"],
    shortDescription:
      "Finland's untranslatable word for quiet, action-driven grit — what gets you through an impossible situation without complaining about it.",
    longDescription: [
      "Sisu is the Finnish word for the quality of pushing on through long odds when by all reasonable measures you should give up. The closest English words — grit, tenacity, resilience, hardihood — each capture a piece of it, but Finns will tell you they all miss something. Sisu isn't a personality trait or a cheerful attitude; it's behaviour. It's what you do, quietly and without drama, after the point at which a sensible person would stop.",
      "The word comes from sisus, an old Finnish noun for \"interior, entrails, guts\" — the same metaphor English uses for inner courage, but considerably older. Sisu appears in Finnish written records from the 17th century and in spoken use long before that. It enters the wider world's vocabulary in the Winter War of 1939–40, when Finland — outnumbered roughly three to one in troops and effectively without tanks — held off the Soviet invasion for 105 days. Time magazine ran a feature on sisu in January 1940, and it has been Finland's calling card ever since.",
      "In modern usage, sisu is invoked less for war and more for everyday weather. It's what gets a Finn out the door for a 5am winter run when it's -20°C and dark. It's the unflappable competence of the cross-country skier who's been at it for eight hours and isn't tired yet. It's also visible in negative space: Finns are not effusive, do not boast about effort, and tend to view loud determination with suspicion. The point of sisu is that you don't talk about it; you just keep going.",
      "You'll see sisu reflected in the design language (the spare, durable aesthetic of Aalto and Iittala), the food (rye bread fermented over multiple days), the sauna culture, the silence around small talk, and the way Finns react to weather that would shut down a lesser country. If a Finn says of someone \"hänellä on sisua\" — they have sisu — it is a serious compliment. Don't expect to hear it about yourself, and don't claim it; that misses the point entirely.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Monument_to_the_Finnish_sisu.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Finnish_soldiers_marching.jpg",
    ],
  },
  {
    slug: "finnish-design",
    title: "Finnish Design",
    aliases: [
      "Finnish design",
      "Iittala",
      "Marimekko",
      "Artek",
      "Tapio Wirkkala",
      "Alvar Aalto",
      "Aino Aalto",
    ],
    shortDescription:
      "A small country produces an unreasonable number of household objects you already own — bent-plywood stools, ridged glass tumblers, poppy-print dresses — because Finland decided in the 1930s that good design was a public service.",
    longDescription: [
      "What people mean by \"Finnish design\" is a particular thread of 20th-century Nordic functionalism: clean lines, natural materials (birch, glass, ceramic, wool), forms drawn from the Finnish landscape, and the conviction that a chair you can afford to own should be as well-made as one you can't. The brand names are the ones travellers recognise — Alvar and Aino Aalto's Artek (founded 1935), the glassworks Iittala (1881), Marimekko (1951), Arabia (ceramics, 1873), Fiskars (orange-handled scissors, founded 1649) — but the philosophy is what holds them together. Functional, durable, beautiful, democratic, in that order.",
      "The pivotal moment was Milan, 1951. At the IX Triennale di Milano, Tapio Wirkkala won three Grand Prix on his own; Rut Bryk and Dora Jung also took Grand Prix; Toini Muona, Ilmari Tapiovaara, and Kaj Franck won gold medals. Three years later at the X Triennale, Wirkkala did it again. The international design press, expecting the established Italian and Scandinavian masters, found themselves writing about a country that had been independent for thirty-three years and a language nobody else spoke. By the late 1950s \"Finnish design\" was a recognisable category in American department stores, and Wirkkala's plywood Leaf dish had been named the world's most beautiful object by House Beautiful magazine.",
      "The icons stack up quickly. Alvar Aalto's three-legged Stool 60 (1933) is the most-copied stool in design history — Artek still makes it from steam-bent Finnish birch using the original L-leg patent. The Aalto Vase (a.k.a. Savoy Vase, 1936) gave glassware permission to have wavy edges. Marimekko's Unikko poppy print, designed by Maija Isola in 1964 against founder Armi Ratia's express ban on flower prints, is now on Finnair planes. Iittala's Aalto-designed pressed-glass tumblers, Kaj Franck's Teema dinnerware, the iconic Fiskars scissors — these are not museum pieces in Finland; they are what people put on their tables.",
      "As a visitor, the easiest way in is the Design Museum on Korkeavuorenkatu (the world's third-oldest design museum), the surrounding Design District (25 streets and ~200 shops, galleries, and studios across Punavuori, Ullanlinna, Kaartinkaupunki, and Kamppi), and the flagship stores along Esplanadi (Iittala, Marimekko, Artek). For something more casual, second-hand shops are awash in Iittala glassware and old Marimekko at fraction-of-retail prices — Finnish design's democratic ambitions paying off two generations later.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Marimekko_Unikko.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Alvar_Aalto._Stool_60.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Tapio_Wirkkala_Iittalan_lasitehtaalla.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Iittala_shop,_Helsinki_FIN.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Finnair,_Airbus_A340-300_OH-LQD_'Marimekko_Unikko'_NRT_(18172611334).jpg",
    ],
  },
  {
    slug: "winter-war",
    title: "Winter War",
    aliases: ["Winter War", "Talvisota"],
    shortDescription:
      "Outnumbered three to one and with effectively no tanks, Finland held off a Soviet invasion for 105 days — losing eleven percent of its territory but keeping its independence.",
    longDescription: [
      "The Winter War was the Soviet Union's invasion of Finland, from 30 November 1939 to 13 March 1940. Stalin had demanded Finnish border territory north of Leningrad, citing security; Finland refused; the Soviets attacked anyway with roughly 450,000 troops, 2,200 tanks, and overwhelming air superiority. Finland fielded around 300,000 troops and effectively no armour. The war was supposed to last two weeks. It lasted 105 days.",
      "Finnish defenders fought from white-camouflaged skis and entrenched positions in dense forest, in temperatures that dropped below -40°C. Soviet columns advancing along narrow forest roads were cut into pieces by mobile Finnish patrols — the so-called motti tactic — and Soviet casualties swelled past 300,000, more than ten times Finland's. The sniper Simo Häyhä, operating in the forests of Karelia, holds the record for the most confirmed kills in any war (around 505). The international press, watching a small democracy fight off a totalitarian giant, made the war front-page news worldwide.",
      "In February 1940, after weeks of grinding artillery, the Soviets finally breached the Mannerheim Line on the Karelian Isthmus and pushed toward Viipuri. Finland signed the Moscow Peace Treaty on 13 March, ceding about eleven percent of its territory — including most of Karelia, the country's industrial heartland, and its second-largest city — to the Soviet Union. Roughly 420,000 Karelian Finns lost their homes and were resettled across the rest of Finland. The country kept its independence, and the Red Army's poor performance contributed to Hitler's belief that the Soviet Union could be beaten quickly — a miscalculation that shaped Operation Barbarossa the following year.",
      "The Winter War sits at the centre of Finnish national identity in a way that is hard to overstate. It is the country's heroic founding myth and also a quieter trauma about lost land and lost neighbours; Finnish historians describe it as \"trauma portrayed as heroism.\" Memorials to Winter War veterans stand in nearly every Finnish town, and the Mannerheim Museum in Helsinki along with the eastern battleground sites (Suomussalmi, Raate Road, Kollaa) are where visitors most often encounter it physically.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/A_Finnish_Maxim_M-32_machine_gun_nest_during_the_Winter_War.jpg",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Finnish-lightmachinegun-skis-winterwar.png",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Evacuation_at_the_end_of_Winter_War.jpg",
    ],
  },
  {
    slug: "koff-and-karhu",
    title: "Koff and Karhu",
    aliases: ["Koff", "Karhu"],
    shortDescription:
      "The two beers Finns mean when they say \"a beer\" — Koff, the country's oldest brand, and Karhu, the brown bear on every supermarket shelf. Both poured by Sinebrychoff.",
    longDescription: [
      "Koff and Karhu are Finland's two best-selling lagers and the default pour at almost every bar and kiosk. Both are made by Sinebrychoff in Kerava, north of Helsinki, both come in the same Roman-numeral strength tiers (III is the standard 4.6%, IVA and IVB step up to ~5.2% and 7%+), and both are honest Continental pale lagers — clean, pale gold, lightly hopped, designed to be drunk cold by the litre. Finns rarely call either of them by name in a bar; you order an olut (\"beer\") and you get whatever is on tap, which is usually one of these two.",
      "Sinebrychoff is the older story. The brewery was founded in 1819 in Helsinki by Nikolai Sinebrychoff, a Russian merchant operating in what was then the autonomous Grand Duchy of Finland under the Russian Empire. It is the oldest still-operating brewery in the Nordic countries, and the Koff brand traces back to 1821 — making it about a year younger than the brewery itself. The original Bulevardi site in Punavuori is now Sinebrychoff Park (where the KOFF Race runs every July) and the Sinebrychoff Art Museum; production moved to Kerava in 1992. Carlsberg has owned the company outright since 1999.",
      "Karhu is the louder brand. The name is the Finnish word for bear, chosen because the beer originated in Pori — historically Björneborg in Swedish, \"bear castle.\" Brewing began in 1929, paused, then resumed continuously from 1958; Sinebrychoff bought the Pori brewery in 1972 and consolidated production in Kerava in 2006. The bear on the label has been redrawn several times but stays muscular and a bit menacing on purpose — Sinebrychoff claims the Karhu bear is the most-tattooed brand mark in Finland. The 2010s campaigns leaned hard into a stoic Finnish-male archetype, the slogan being \"Jokainen Karhu on täyttä olutta\" — \"every Karhu is a beer through and through.\"",
      "For a visitor: a 0.5 L pint of Karhu III or Koff III runs around €8 in a Helsinki bar, a six-pack of cans is roughly €13–15 at a K-market or S-market (groceries can sell up to 5.5% by law — anything stronger is Alko-only). The SpåraKoff pub tram and the KOFF downhill skate race in Sinebrychoff Park are both catalogued here under Ideas; both lean on the Koff name as the marketing engine. Don't expect either beer to be exciting on the palate — these are working lagers, not craft. The point is that they're cold, plentiful, and Finnish.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Karhu,_Lapin_Kulta,_Koff.JPG",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Koff_kerava.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Sinebrychoff_horses_at_St._Lucia's_Day_parade_2024.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Glass_of_Karhu_at_restaurant_Hemingway's.jpg",
    ],
  },
  {
    slug: "lonkero",
    title: "Lonkero (Long Drink)",
    aliases: ["lonkero", "long drink", "long drinks"],
    shortDescription:
      "Gin and grapefruit soda in a blue-and-white can — invented by Alko in 1952 to feed Olympic visitors something a Finnish bartender couldn't mess up. By 2007 it was the best-selling product in the country's state liquor stores.",
    longDescription: [
      "Lonkero — the Finnish pronunciation of \"long drink,\" and also, by happy coincidence, the Finnish word for tentacle — is a pre-mixed gin and grapefruit-soda drink, typically 5.5% ABV, sold in a 0.33 L can. Hartwall's blue-and-white Original Long Drink is the canonical version, but every brewery and distillery in the country now makes one (Olvi, Sinebrychoff's Otto, Helsinki Distilling Co., Kyrö, plus dozens of smaller labels), and the format extends to cranberry, lime, citrus, and a rotating cast of seasonal flavours. It is the default order at a Finnish kiosk, festival, or summer cottage when beer feels boring.",
      "The origin is exact: the 1952 Summer Olympics. Helsinki was hosting its first Games, post-war Finland was still rationing alcohol, and Alko — the state monopoly that had run liquor distribution since prohibition ended in 1932 — was bracing for a flood of foreign visitors and a small number of trained bartenders. Alko's solution was to commission Hartwall to bottle two ready-to-drink mixers: a brandy-with-fruit-soda version (which quietly died) and a gin-with-grapefruit version (which did not). Bars sold them straight from the bottle. The visitors went home; the Finns kept drinking it.",
      "Lonkero is now a fixture of Finnish drinking culture in a way that's hard to overstate. Hartwall Original Long Drink has been Alko's single best-selling product since 2007, beating out Koskenkorva (the national vodka) and every beer on the shelf. It's on tap at almost every bar, in every supermarket fridge in the legal up-to-5.5% alcohol-by-volume tier, and in every cooler bag at the cottage. In the late 2010s a Finnish-American startup called The Finnish Long Drink launched a near-identical product in the US to genuine success — a small expat-led export of a drink most Americans had never heard of.",
      "If you're trying it for the first time, the original gin-grapefruit version is the one to start with — slightly bitter, slightly sweet, more refreshing than it has any right to be at 5.5%. It travels well; pick up a six-pack at any K-market or S-market, or order it on tap (\"yksi lonkero, kiitos\") at any bar. The Olympic origin story is the one Finns will tell you within five minutes of you ordering one.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Hartwall_Original_Long_Drink.png",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Long_drink_in_Finland.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Long_drink_cans_in_fridge.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Glass_of_lonkero_at_Hotel_Hanasaari.jpg",
    ],
  },
  {
    slug: "drinking-in-finland",
    title: "Drinking in Finland",
    aliases: ["Alko", "kalsarikännit", "pantsdrunk"],
    shortDescription:
      "Finland tried prohibition in 1919, ran it for thirteen years, and has spent the century since slowly walking it back — from rationing books to last year's law that finally let supermarkets sell something stronger than weak beer.",
    longDescription: [
      "Finland's relationship with alcohol is best read as a hundred-year argument between an intoxication-focused folk tradition and a state apparatus that has tried, with mixed results, to manage it. The folk side is real: per capita pure-alcohol consumption was 8.7 litres in 2023, the highest in the Nordics, and Finnish drinking has historically been weekend-loaded and intoxication-oriented rather than the mealtime pour you'd find in France. The state side is also real: alcohol stronger than 8% is sold only at Alko, the state monopoly, in 364 stores nationwide that close at 21:00 on weekdays, 18:00 on Saturdays, and not at all on Sundays.",
      "Prohibition arrived in 1919 — Finland was the fifth country in the world to try it — and lasted until 1932, when a referendum killed it. Smuggling boomed in between (\"pirtu\" — spirit-grade ethanol — came in by motorboat from Estonia and Germany, and Helsinki's Rautatientori square became a half-open pirtu market). The 1932 successor was Alko, the state monopoly that has run distribution ever since. From 1944 to 1956 every legal purchase was stamped into a personal booklet (the viinakortti); rationing in some form continued until 1970. The generation that came of age right after rationing ended drank more than any Finnish generation before or since, and a lot of the country's contemporary drinking habits were set then.",
      "The legal frame has been thawing for thirty years. EU accession in 1995 broke Alko's production and import monopolies. The 2018 Alcohol Act let supermarkets sell up to 5.5% ABV (which is what put canned lonkero, gin-based mixers, and stronger beers next to the milk). In 2024 the limit rose again, this time to 8% — Alko's lower-alcohol wines moved into K-Markets and Prismas almost overnight. Each step took a national argument; each step happened anyway. Alko itself, often cast as the villain of the story, runs a remarkably good wine and spirits retail operation — the staff are well-trained, the selection is broad, and prices are roughly what they'd be in any EU country once tax is in.",
      "The cultural picture is shifting at least as fast as the law. The 2010s saw the craft-brewing scene rocket from under ten breweries to over a hundred, and \"intoxication for its own sake\" started giving way to \"experience drinking\" — better beer, less of it. Younger Finns drink considerably less than their parents did at the same age; non-drinking is no longer a social oddity. The internet's favourite recent contribution to all this is kalsarikännit — literally \"underwear-drunkenness,\" loosely \"pantsdrunk\" — the very Finnish concept of staying home alone, in your underwear, with a drink and a streaming service, with no intention whatsoever of going out. It briefly went viral in 2018 as Finland's answer to hygge. Both things are true: the binge tradition is loosening, and the introvert tradition is doing better than ever.",
    ],
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Alko_helsinki_rautatientori.png",
    galleryUrls: [
      "https://commons.wikimedia.org/wiki/Special:FilePath/Confiscated_bootleggers'_motorboats_at_the_Oulu_harbour.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Pirtukanistereiden_myyntiä_Rautatientorilla_kieltolain_aikana_-_N2256_(hkm.HKMS000005-000001fd).jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Alko_interior_20190202.jpg",
    ],
  },
];

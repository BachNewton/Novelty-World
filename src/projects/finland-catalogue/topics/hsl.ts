import type { Topic } from "../types";

export const hsl: Topic = {
  slug: "hsl",
  title: "HSL (Helsinki Region Transport)",
  aliases: ["HSL"],
  shortDescription:
    "One ticket, every mode of public transport in greater Helsinki — metro, tram, bus, commuter train, the Suomenlinna ferry, and the citybikes. Buy it on the app, hold it up to the reader, done.",
  longDescription: [
    "HSL — Helsingin seudun liikenne, \"Helsinki Region Transport\" — is the joint authority that runs every form of public transport across the capital area: the M1 and M2 metro lines, every tram, every blue bus, the commuter rail network out to the suburbs, the Suomenlinna ferry, and the yellow seasonal Citybikes. It was founded on 17 June 2009 by six member municipalities (Helsinki, Espoo, Vantaa, Kauniainen, Kerava, Kirkkonummi) and went operational on 1 January 2010; Sipoo, Tuusula, and Siuntio joined later, bringing the membership to nine municipalities. The unified branding — the same logo, the same fare structure, the same app — replaced what used to be a scrum of separate operators.",
    "The fare system is the part visitors should learn first. The region is divided into four concentric zones: A (the Helsinki peninsula and inner core), B (most of the rest of Helsinki plus inner Espoo and Vantaa), C (the outer suburbs including the airport), and D (towns like Kerava and Kirkkonummi). A new zone E launches 2 June 2026 covering Järvenpää and northern Tuusula. A single ticket is sold for a contiguous run of zones — AB, BC, ABC, ABCD, etc. — and is valid on every mode of transport for a fixed window (80 to 110 minutes depending on how many zones the ticket covers). A single AB ticket gets you almost anywhere most visitors actually go.",
    "The easiest way to use it is the HSL app (iOS / Android). Register a card, pick your zones, buy a single, a day pass, or a longer pass; show the screen to a conductor or just tap it against the reader at metro gates. Day passes for ABCD run about €11 for one day and scale down per day for longer windows; the AB single is roughly €3. There's no turnstile-and-paper-ticket rigmarole on most modes — Helsinki runs an honour system with random inspectors, and getting caught without a ticket is an €80 fine. The HSL Citybike system (operated separately within the same brand) runs roughly May to October, with a €5 day pass, a €10 week pass, or a €35 season pass and thirty-minute rides on top.",
    "Two practical notes. First, the Suomenlinna ferry is a standard HSL boat — your AB ticket covers it, so the fortress-island day-trip costs nothing extra beyond the basic fare. Second, the HSL Journey Planner (reittiopas.hsl.fi, integrated into the app) is by some margin the most accurate transport router in the country; locals use it for everything, and it works in English. Helsinki Cards and other tourist passes include HSL travel by default, but for trips of a few days the HSL day pass alone is usually cheaper than a tourist card unless you're really stacking museum entries.",
  ],
  thumbnailUrl:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Helsinki_tram_on_line_13_arriving_at_Pasilansilta_on_a_sunny_evening_in_August_2024.jpg",
  galleryUrls: [
    "https://commons.wikimedia.org/wiki/Special:FilePath/Ferry_to_Suomenlinna.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Vuosaari_in_Helsinki,_Finland,_2021_August.jpg",
    "https://commons.wikimedia.org/wiki/Special:FilePath/Tram_stop_on_Hämeentie_on_an_early_morning_in_August_2024.jpg",
  ],
};

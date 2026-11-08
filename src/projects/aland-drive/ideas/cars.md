# Cars

The plan for the cars a player owns, once cars are bought: the classes and tiers they're sorted into, how many there are, how each one reaches the island, who makes them and where they're sold. The owner has decided the shape (see "The owner's decisions"); the car list itself, slot by slot, is still to be drafted. Nothing here is attached to what exists: any of today's fourteen cars, the three makers and the dealer art may be kept, changed or dropped to fit. The events these cars are entered in are `ideas/races.md`, section 9.

## Classes and tiers

Test Drive Unlimited 2's scheme, with each tier's performance moved to today's cars: TDU2's car list is from 2011, and today's Golf GTI is about as quick as an A4 car was then. An event asks for a class and tier, and any car in it may enter.

| Class | Tiers | What it is | Today's counterparts |
|---|---|---|---|
| **A: Asphalt** | A1–A7, A1 fastest | Road and sports cars | A1 hypercars (0–100 km/h under 2.8 s, 350+ km/h), A2 supercars (about 2.8–3.2 s), A3 grand tourers and fast coupés (3.2–3.8 s), A4 and A5 sports cars and fast saloons (3.5–5 s), A6 hot coupés and quick hatches (4.5–5.5 s), A7 hot hatches (5.5–7 s) |
| **B: Gravel** | B1–B4, B1 fastest | Cars built for gravel: rally cars, fast everyday cars on loose roads, four-by-fours | B1 the rally specials, down to B4 the slow four-by-fours |
| **C: Classic** | C1–C4, C1 fastest | Older cars, today's cut-off taking in the 1990s and early 2000s | From a homage to the F40 down to a 2CV |

**B is gravel, not only off-road.** TDU2's B was its smallest class, four-by-fours for dirt tracks. On Åland gravel is ordinary public road, and most of it: of the 2,072 km a race can use in the game's OpenStreetMap data, 716 km is tagged paved, 526 km gravel or dirt and 830 km untagged, which laid by the game's rule for untagged roads is 37–47% paved, against about two thirds asphalt on TDU2's islands. The main roads are nearly all asphalt; the country lanes, the largest part of the network, mostly gravel. So B covers the cars that drive it, and gets back the B1 tier TDU2 dropped after its beta.

**Today's cars on today's tiers** sit in the middle and below, measured from their limits table on dry asphalt: Sund A4; Ankar, the Skerry GT and Ström A5; Fjärd, Sten and Bris A6; Grus B2, Holm B3, Berg B4; Vik C3 and Sälta C4. Ljus and Kobb are slower than any A tier.

## How many

**About 38 cars: two to three per tier**, so about 18 in A, 12 in B and 8 in C. The count follows from the events: a tier with about four events needs enough cars that entering one is a choice between driving styles. Most of the cars to add are in A1–A3 and B1–B2, where today there are none.

## How the list is built

From the tiers down, not from today's cars up:

1. **Slots.** Each tier's two or three places, each with target figures (0–100 km/h, top speed, weight, drive) and a role in its tier, so a tier offers different ways to drive: a front-engined grand tourer, a mid-engined sports car and a light track car in one tier, say.
2. **The best fit for each slot.** A car of today's close to a slot is retuned into it, a slot with nothing close gets a new car, and a car that fits no slot leaves the list. Ljus and Kobb are cut unless they keep a job outside the events: a bucket-list challenge, or a first car before a player can afford anything.
3. **Each slot's cost written beside it**, so the cheap choices show next to the dear ones. The challenges, the races, the player's start (Grus) and the tools and tests (the Skerry GT) name cars by id, so a removed car means repointing them; a retuned car's limits are measured again and the challenges' targets set again from them; reusing a car's art is cheap, a new body isn't.

Each slot also says how its car reaches the island and who makes it.

## How cars reach the island

TDU2's intent is a dream garage: a range from hot hatches to hypercars, and the pleasure of choosing, buying and owning them. A supercar dealer on every holiday island was only how it did that. Åland, a town of about 12,000 on an island of 30,000, has no supercar dealer, so each kind of car reaches the island as it would in life:

| Tiers | Where it comes from | Why it fits |
|---|---|---|
| A5–A7, the everyday B cars | **Dealers and the used lot**, at the real car businesses' places, at the island's own scale | What a small town has |
| A1–A4 | **The harbour**: ordered at a showroom by the water and brought in by ship, collected at the quay | Åland lives by its ferries, which already call in the game's nights. A hypercar here is bought in Stockholm or Helsinki and shipped |
| C classics | **Found, not bought**, in barns and outbuildings, as TDU2's wrecks and Forza's barn finds | A farming island of old outbuildings, and finding them rewards exploring |
| B1–B2 rally cars | **The motor club**, from the folkrace scene at Vessingsboda | The folkrace's claim rule lets anyone buy a winning car at a capped price (`docs/DRIVING-CULTURE.md`) |

So the number of dealerships follows Åland's own scale, not TDU2's density, and the variety comes from the harbour, the barns and the club instead of more showrooms. The harbour's showroom only takes orders, which keeps a permanent supercar store, implausible here, out of the town.

## Makers

The makers are a separate decision from the buildings. TDU2 had 32 car makers across about 89 base-game cars, very unevenly: Ferrari 11, Audi 9 and Mercedes-Benz 8 carried the list, Aston Martin, Pagani, RUF and Spyker had four to six each, and a long tail of a dozen makers, Koenigsegg, McLaren and TVR among them, had one car each. A few big makers and a long tail is the pattern to follow, with invented makers, since the game's cars carry no real brands. A small maker needs no building of its own when its car comes by ship or turns up in a barn. How many makers, and which of the three of today (Tärna, Västan, Klippa) stay, comes with the car list.

## Dealers

TDU2 sold through 11 dealerships, most of them grouping makers: three single-brand (Audi, Ferrari, Mercedes-Benz), five by country (Italian, British, European, U.S. and Asian cars) and three of classics; some cars came only as wrecks, prizes or club rewards. Åland's count comes from the island's scale instead, as above.

`art/dealers/` has five sites drawn, each at a real car business on the map: the strip on Mariehamn's north edge with a used lot and a tyre shop, a village garage in Sund and a showroom on Västerhamn's waterfront. The owner hasn't reviewed that art: the sites, exteriors and interiors are a first draft, kept or redrawn as the plan above needs.

## The owner's decisions

- **Classes and tiers are TDU2's, with today's cars in each tier**: A1–A7 asphalt, B1–B4 gravel (widened from off-road, with B1 back), C1–C4 classic.
- **About 38 cars, two to three per tier**, built from the tiers down: today's cars, makers and dealer art are candidates, kept, changed or dropped to fit.
- **Each kind of car reaches the island as it would in life**: dealers at Åland's own scale for the everyday tiers, the harbour for the fastest, barns for the classics and the motor club for the rally cars.
- **Makers follow TDU2's pattern** of a few big ones and a long tail, all invented; their number comes with the car list.

## Sources

- TDU2's classes, tiers, cars, makers and dealerships: [the Test Drive wiki's vehicle list](https://testdrive.fandom.com/wiki/Test_Drive_Unlimited_2/Vehicles), counted by hand; its road surfaces: [Wikipedia, Test Drive Unlimited 2](https://en.wikipedia.org/wiki/Test_Drive_Unlimited_2).
- Today's cars' figures for each tier are factory numbers as commonly quoted, not checked one by one.
- Åland's road surfaces: measured from the game's OpenStreetMap data (© OpenStreetMap contributors, ODbL). Its car culture: `docs/DRIVING-CULTURE.md`, which carries its own sources.

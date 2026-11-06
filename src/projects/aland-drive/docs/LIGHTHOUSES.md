# Lighthouses of Åland: research for Åland Drive

Web research behind Åland's landmark lighthouses: the ten models in `art/lighthouses` were built from it and from the photos it links, and their places to find's notes (`map/places.ts`, `docs/HISTORY.md`) come from §5. Where the game's own data says otherwise, the official register's mark wins for a lighthouse's place and height (`render/lighthouses.ts`). **[uncertain]** marks anything the sources don't settle.

## Sources and short names used below

| Short name | Source |
|---|---|
| **Rowlett** | Russ Rowlett, *Lighthouse Directory*, "Lighthouses of Finland: Åland", UNC Chapel Hill, revised 17 Dec 2025. https://www.ibiblio.org/lighthouse/ala.htm (53 entries. The most complete single source: year, focal height, characteristic, tower height, shape and colour for each light.) |
| **enWP-list** | English Wikipedia, "List of lighthouses in Åland" (50 rows: coordinates, characteristic, focal height). https://en.wikipedia.org/wiki/List_of_lighthouses_in_%C3%85land |
| **svWP-list** | Swedish Wikipedia, "Lista över fyrar i Ålands skärgård" (≈90 lights with positions, characteristic, Admiralty no. and what each marks). https://sv.wikipedia.org/wiki/Lista_%C3%B6ver_fyrar_i_%C3%85lands_sk%C3%A4rg%C3%A5rd |
| **fyr.org** | Svenska Fyrsällskapet (Swedish Lighthouse Society) wiki, a page per lighthouse with history and WGS-84 position. https://fyr.org/wiki/index.php/ + name |
| **svWP / fiWP / enWP** | Individual Wikipedia articles (sv/fi/en), named per fact |
| **OSM** | OpenStreetMap seamark data, queried with Overpass (positions and light tags) |
| **Photo** | My own reading of a Wikimedia Commons photo (file named alongside). Proportions read off a photo are estimates. |

Light characteristics: `Fl` = flash, `Fl(2)` = group of two flashes, `Q` = quick (about 1/s), `VQ` = very quick, `Iso` = equal on and off, `LFl` = long flash, `W/R/G/Y` = colour; `WRG` means a sector light that shows white, red or green by bearing. The number at the end is the period in seconds.

---

## 1. Checks against the fairway register and the game's data

| Name | Your figure | What the sources say | Verdict |
|---|---|---|---|
| **Sandbäck** (sea lighthouse 1963/1979) | in "our area" | fiWP "Sandbäckin majakka": a reinforced-concrete caisson light standing on the sea bed **off Uusikaupunki, west of Isokari**, at 60°45′55.6″N 20°44′24.9″E. Built 1963, raised in 1979 because winter ice piled round it, given a helipad in the early 1980s. Light height 12.8 m (12.5 in the infobox). OSM tags it Fl(3) 10s. fyr.org lists it among the Bothnian Sea's caisson lights. | **Not Åland.** It is in the Bothnian Sea about 40 km north of Åland's northern skerries, in Uusikaupunki's waters (Southwest Finland). |
| **Enskär** 36.6 m (1833/1966/1986) | possibly mainland | fiWP "Isokarin majakka" (Swedish name *Enskärs fyr*): on Isokari, in Kustavi municipality, ~24 km SW of Uusikaupunki. Tower 1833 by pilot major Gustaf Brodd, drawings checked by C. L. Engel. Light height 49.4 m. OSM: 60.7183, 21.0115. | **Not Åland**: Finnish mainland coast (Kustavi). Åland does have small lights called Enskär (Sottunga, 60°07′23″N 20°34′54″E) and Enskär Kobben (Signilskär), both minor sector lights, unrelated. |
| **Flötjan** 21.6 m | | Rowlett ≈22 m; svWP 22 m above ground, 26 m above water; fyr.org 22 m | Agrees. |
| **Sälskär** 32 m | | fiWP 32 m (light 44.5 m); Rowlett 31 m; svWP "just over 30 m"; fyr.org 39 m, base diameter 6 m, 164 steps | 30–32 m from three sources. fyr.org's 39 m is the outlier **[uncertain]**; possibly it counts the lantern and mast. Use 32 m. |
| **Märket** 14 m | | Rowlett and enWP 14 m; svWP 14.3 m above ground, 16.8 m above water (Rowlett focal plane 17 m); fiWP: house roof at about 12 m, short tower above | Agrees. |
| **Lågskär** 33 m | | svWP 33 m (focal plane 42.3 m), and fyr.org 33 m, 175 steps; **Rowlett and enWP say 23 m** | Use 33 m. A 23 m tower would put a 42 m focal plane 19 m up in the air on a low island. The 23 m looks like a copying error, perhaps from the 23 m wooden daymark of 1794. |
| **Högsten Båk** 15.9 m | | Rowlett 16 m, hexagonal pyramidal wooden daymark | Agrees. |
| **Ledskär** 12 m | | Rowlett "approx. 10 m" | Close. Rowlett's figure is approximate; take 12 m. |
| **Flatu** 5.3 m, **Blekungen** 6.2 m, **Bläskär** 6.6 m | | Not in Rowlett, either Wikipedia list or OSM by those names | **[uncertain]** Couldn't locate. They are small unlit daymarks and need not be modelled. |
| **Salkobb** | south of Mariehamn | svWP-list 59°54′14″N 20°04′43″E, Fl WRG 5s; Rowlett: 9 m tower, focal plane 11 m, off the south end of Lemland; OSM 59.9037, 20.0791 | Exists as a minor sector light. It is **south of Lemland** (≈23 km SE of Mariehamn town), not close to Mariehamn. Not notable; no photo found. |
| **Nygrynnan** | | Only in OSM: 59.9635, 20.0583, `VQ(2) W 5s`, light 12 m, range 6 M, radar reflector. Not in Rowlett or either Wikipedia list. | A minor light on a shoal in the southern approach (≈4 km E of Lilla Båtskär). No description or photo found. Not notable. |

Other errors found in the sources:
- **enWP-list, Mariehamn/Sjökvarteret**: longitude printed as 16°56′41.4″E. It should be **19°56′41.4″E** (svWP-list and OSM agree).
- **enWP-list, Gisslan**: its coordinate (60°11′19.9″N 19°27′01.6″E) is Töllingbådan's position. Gisslan is at **60°09′35″N 19°18′00″E** (svWP-list; OSM 60.1600, 19.3002).
- **enWP article "Bogskär Lighthouse"**: the page-title coordinate 59°30′03″N 20°02′13″E is wrong (≈18 km west of the rock). OSM carries a duplicate "Bogskär" node there (59.50083, 20.03694) that should be ignored. The real position is 59°30′16.2″N 20°20′48.1″E.
- **Bogskär characteristic**: Rowlett, enWP and the NGA list say `Fl(3) W 20s` (in a 2+1 pattern); svWP says `LFl(2+1) WRG 8s` **[uncertain]**. The NGA figure is the more official one.
- **Märket automation**: Rowlett and enWP say 1979. fiWP gives the detail: acetylene light lit 25 July 1976, last keeper left 3 Jan 1977; fyr.org says unmanned 1976. Use **1976–77**.
- **Märket border change**: the treaty was agreed around 1981, the border marked out in 1982 and ratified in 1985 (sources quote different years for different steps).

---

## 2. Full list of Åland's lights

### 2a. Proper lighthouses and historic sea marks (towers worth knowing)

Position = the light (decimal degrees, WGS-84). Ht = tower height above ground; Focal = light above sea.

| Name (sv / fi) | Position | Built | Status, characteristic | Ht / Focal | Form, material, colour today | Also on site | Source |
|---|---|---|---|---|---|---|---|
| **Märket** / Märketin majakka | 60.30101, 19.13143 | 1885 (Georg Schreck) | Active, `Fl W 5s`, 8.5 M | 14 / 17 | Lighthouse-house: granite base, 2 brick storeys + attic, square plan ≈10 m; red-and-white horizontal bands; red hipped roof; short tower with lantern | 1889 stone storehouse, 1955 machine house over boat shed, 40 m breakwater wall, fog-siren base, solar panels and wind generators | Rowlett, fiWP, fyr.org, Photo |
| **Bogskär** | 59.50450, 20.34669 | 1882 (iron tower by Heidenstam); rebuilt 1922; refitted 1981 | Active, `Fl(3) W 20s` (svWP: LFl(2+1) WRG 8s **[uncertain]**), racon | ≈22 / 28 | Tapered round concrete drum, white below and blue above; hexagonal steel upper stage, white, with solar panels; helipad on top | Nothing else: bare rock | Rowlett, enWP, svWP, fyr.org, Photo |
| **Lågskär** | 59.84117, 19.91219 | 1840 / 1859 / present 1920 | Active, `Fl W 12s`, 11 M | 33 / 42 | Reinforced concrete truncated square pyramid, brick red; white lantern | 1½-storey keeper's house (log, 1920), outbuildings; now Åland's bird-protection society's ornithological station | svWP, fyr.org, Rowlett, Photo |
| **Sälskär** | 60.41172, 19.59256 | 1868 (Axel Hampus Dalström) | Active, `Fl(2) W 12s`, 12 M | 32 / 44 | Tall round whitewashed brick tower with 4 iron bands; black lantern, red dome | Keepers' houses demolished after 1949, stone foundations remain; 2 old buildings said to be 1700s | fiWP, fyr.org, Rowlett, Photo |
| **Flötjan** | 59.80842, 19.78211 | cairn 1901, light 1908, tower 1953 | Active, `Fl(2) W 20s`, 10 M, racon T | 22 / 26 | Round slip-formed concrete column, red with one white band; double gallery; small white lantern | Nothing | svWP, Rowlett, fyr.org, Photo |
| **Nyhamn** (Lilla Båtskär) | 59.95933, 19.95500 | 1751 stone tower (destroyed 1808–09); mine-shaft tower 1958 | **Inactive since 11 July 2007** (focal height was 43 m) | ≈34 (Rowlett) | Concrete iron-mine headframe tower with a wider top section, weathered grey | Former pilot station; 5 wind turbines (2007, 100 m to tip) | fiWP, svWP, fyr.org, Rowlett, Photo |
| **Marhällan** | 60.03092, 19.87175 | 1938 | Active, `Q(3) WRG 6s`, 9.7 M | 12 / 14–15 | Round concrete tower, red with black bands; lantern removed | Nothing (Kobba Klintar is next door) | Rowlett, svWP, fyr.org, Photo |
| **Kobba Klintar** (pilot and fog-signal station) | 60.0297, 19.8833 | pilot station 1861; fog-signal house 1910; daymark replica 2012 | Pilot station closed Jan 1972; not a light | — | White 2½-storey wooden Jugend pilot house, with the foghorn in its attic; white four-sided pyramid daymark | Café, harbour, breakwater, sculptures | svWP, Rowlett, Photo |
| **Kökarsören** (Kökars Ören) | 59.76761, 21.01831 | 1906; current tower 1983 | Active, `Fl W 5s`, 9 M | 11 / 24 | Triangular steel lattice tower with red slatted daymark (Rowlett) **[uncertain: a 2026 Commons photo shows a black lattice mast with instruments]** | Small equipment hut | Rowlett, fyr.org |
| **Gustaf Dalén** (Rödakon) | 60.08533, 20.98353 | 1947 | Active, `Q(2) WRG 6s`, 6.5 M | 12 / 12 | Concrete caisson in open water: red round concrete drum, then an open steel frame with gallery and lantern; name in big white letters | Its fog bell is now displayed in Mariehamn harbour | fyr.org, Rowlett, Photo |
| **Gisslan** | 60.15972, 19.30000 | 1910 | Active, `Fl W 5s` | ≈10 / 16 | "Red tower" (Admiralty, via Rowlett); originally a square lattice tower | — | Rowlett, svWP-list |
| **Rannö** | 60.52878, 20.19867 | 1962 | Active, `Q(2) W 5s` | 6 / 20 | Small square pyramidal lattice tower, red-brown, slatted daymarks | — | Rowlett |
| **Koxnan** (Koksnan) | 60.46733, 19.93794 | ? | Active, `Fl W 5s` | 15 / 17 | Triangular lattice tower with red-and-white banded daymark | — | Rowlett |
| **Solovjeva** | 60.18667, 19.17167 | late 1980s | **Inactive since 2019** ("temporarily") | 20 | Steel tower, white with a red band, big topmark | — | Rowlett |
| **Suomen Leijona** (Finska Lejonet) | 59.47267, 20.81315 (OSM) | 1987; rebuilt 2005 | Active, `Fl(2) W 12s` | 13 / 13 | Steel post, white with an orange band; Finland's southernmost light | — | Rowlett |
| **Armbågen** (gone) | ≈59.6306, 19.9611 | mid-1980s | Destroyed Feb 2008 (rammed by the *Dintelborg*); now a buoy | (was 20) | Was a red/white banded steel tower with helipad | — | Rowlett, svWP-list |
| **Tröskeln Östra** | ≈59.6611, 19.9194 | 1980s; rebuilt 2008 | Active, `VQ(2) W 4s` | 13 / 13 | Robust post, orange and white bands | — | Rowlett |

### 2b. Historic daymarks (*båk*: unlit or later given a small light)

| Name | Position | Built | Status | Ht | Form, colour | Source |
|---|---|---|---|---|---|---|
| **Ledskär båk** (Lemland) | 59.96356, 20.16997 (the light, just N of the båk) | båk 1748 (Rowlett 1746), raised 1866, striped 1899; light 1904 | Light active, `Q(2) WRG 5s` (svWP Fl(2)), focal 9 m | ≈10–12 | Two-stage tapering masonry tower, red and white vertical stripes, green copper pyramid roof | svWP, Rowlett, Photo |
| **Högsten båk** (Eckerö) | island ≈60.3531, 19.4522 (island centroid, not the tower **[uncertain]**) | station 1740; present 1845; restored 1981 | Unlit | 16 | Hexagonal pyramidal wooden tower, brick red | Rowlett |
| **Fästorna** (Västergrundet, Föglö) | 59.85625, 20.34283 | 1856 (light since 1951) | Active, `Fl WRG 5s`, focal 19 m | 16 | Square wooden tower, red, capped, with a short light mast on top | Rowlett, OSM |
| **Bogskär båk** (Husö, Sottunga; ≠ Bogskär lighthouse) | 60.07572, 20.92514 | daymark 1798, building 1824, restored 1980 | Active, `Fl WRG 5s`, focal 17 m | 10 | Square wooden building with pyramid roof, light at the peak; a tiny keeper's room inside | Rowlett |
| **Hamnö (Kökar) range rear** | 59.94789, 20.87714 | church founded 1784 | Active, `LFl W 6s`, focal 18 m | ≈8 | St Anna's church bell tower: square wood, red stain, white trim | Rowlett |

### 2c. Minor sector and range lights

These are small fairway lights, mostly 4–12 m concrete or lattice towers. They're listed for completeness, not as candidates for models. Data from Rowlett unless noted.

| Name | Position | Char. | Ht / Focal | Look |
|---|---|---|---|---|
| Salkobb (Lemland) | 59.90389, 20.07861 | Fl WRG 5s | 9 / 11 | "tower", no photo |
| Nygrynnan | 59.9635, 20.0583 (OSM) | VQ(2) W 5s | ? / 12 | unknown |
| Storgrund | 59.96919, 20.19633 | Fl WRG 5s | 9 / 9 | red round concrete on old caisson |
| Rågrund | 59.96472, 20.19156 | Iso WRG 2s | 11 / 10 | black and white bands |
| Stora Lökskär | 59.98369, 20.02717 | Fl WRG 5s | 7 / 7 | white octagonal, one black band |
| Koklubb (exactly 60°N 20°E) | 60.00022, 20.00100 | (inactive per Rowlett; svWP VQ(5) WRG 6s) | 7 | red round concrete |
| Fjärdhällan | 60.00711, 19.97664 | (inactive per Rowlett) | 6 | white round concrete |
| Granö | 60.05761, 19.92514 | Q(2) WRG 5s | 6 / 6 | orange, white lantern |
| Sjökvarteret (Mariehamn, moved from Stegskär) | 60.10478, 19.94483 | Q(2) W 6s | 6 / 8 | white lattice stand with round white lantern (1898) |
| Lotsberget range front / rear (Mariehamn) | 60.08356, 19.93372 (front) | Iso W 2s / Iso W 6s | ≈28 / 34 and ≈18 / 56 | lattice towers with red daymarks, yellow vertical stripe |
| Lumparudd | 60.16814, 20.23006 | VQ(2) WRG 6s | 7 / 6 | white, one black band |
| Fagarvik range (Långnäs) | ≈60.116, 20.301 (OSM, unnamed) | LFl 6s | 6 / 6–9 | white, one red band |
| Brändökobben | 60.02456, 20.31169 | Fl WRG 3s | 6 / 7 | red round concrete |
| Kalkgrund range front / Skötskär rear | 60.05283, 20.33483 | Q WRG / LFl W 6s | 9 / 11 and ≈20 / 25 | white tower with red-yellow daymark / lattice |
| Brändö Föglö range rear, Granboda range front | — | LFl W 6s / Q Y | ≈30 / 37, ≈20 / 21 | lattice with red-yellow daymarks |
| Flisörännan, Flisösund | ≈60.006, 20.299 / 60.017, 20.331 | Fl WRGY 3s / Q(2) WRG 6s | 10 / 10, 4 / 4 | white with black top band / rubble stone |
| Kihti (Skiftet) | 60.07603, 21.13758 | Q(3) WRG 10s | 11 / 11 | black, white lantern |
| Sälsö, Sottunga Rödgrund, Tjurgrund, Sånökubb, Trännskär | Sottunga, ≈60.0–60.1, 20.7–20.8 | various WRG | 6–12 | small concrete or lattice towers |
| Söderkobb (Kökar) | 59.93444, 21.23333 | Fl W RGY 6s / Q(3) WRG 6s | 6 / 8 | white with red stripe |
| Mellanklubb (Vårdö), Långören (Kumlinge), Båden, Torsholmakobben, Bärökobben, Notö (Brändö) | 60.25–60.50, 20.55–21.15 | Fl WRG 3s etc. | 4–8 | white/orange/black small towers |
| Kallan (Geta) | 60.44961, 19.73944 | Fl WRG 3s | 6 / 8 | white round concrete |

svWP-list has ≈40 further very small sector lights (Hertronklubb, Tvibenan, Yttre Korsö, Utbådan, Töllingbådan, Kärringsundet, Signilskär and others), each with its position.

---

## 3. Which are recognizable, ranked

1. **Märket**: the lighthouse that moved a national border. Built in 1885 on what turned out to be the Swedish half of a skerry shared with Sweden, it led Finland and Sweden to redraw the border round it in a zigzag. It is Finland's westernmost land, the smallest sea island shared by two countries, and a famous "country" among radio amateurs. Its red-and-white striped house is instantly recognizable. *(enWP, svWP, fiWP)*
2. **Bogskär**: Finland's southernmost point, a bare rock far out at sea. It carries a dramatic story: an 1889 storm marooned its keepers for weeks, and a German warship destroyed the tower in 1915. Painted white and blue, it is the first Finnish lighthouse many ships see. *(svWP, fyr.org, Rowlett)*
3. **Sälskär**: Åland's tallest and most "classic" lighthouse: a slender white brick tower from 1868, braced with iron bands after storms cracked it. It can be seen from Geta on the main island, and summer boat trips run to it. *(fiWP, fyr.org, Rowlett, aland.com)*
4. **Lågskär**: a striking brick-red concrete truncated pyramid from 1920 on the main shipping approach. It carried one of the first automatically rotating gas lights in the world, and the island is now a bird station. *(svWP, enWP)*
5. **Kobba Klintar and Marhällan**: the pair every ferry passenger sees on arrival at Mariehamn. They are a white wooden pilot and foghorn station with a white pyramid daymark, and a red-and-black striped tower across the channel. Kobba Klintar is a popular summer café island, and its foghorn was Finland's last fog signal in use. *(svWP, fyr.org, Visit Åland)*
6. **Nyhamn (Lilla Båtskär)**: the oldest lighthouse site in Åland (a Swedish stone tower of 1751). Its later light sat on a concrete iron-mine tower in waters known for driving compasses wrong. Its odd tower and wind turbines are visible on the southern horizon. *(svWP, fiWP, fyr.org)*
7. **Ledskär båk**: a 1748 red-and-white striped stone daymark on a skerry 600 m off the southern tip of the main island (Herröskatan, Lemland). Peter the Great is said to have carved his monogram in its rock in 1719. It is the most "drivable" historic mark: the road ends within sight of it. *(svWP)*
8. **Flötjan**: the modern red-and-white tower (1953) that replaced Lågskär as the main landfall light. The skerry was named as one of the corner points of Finland's border in 1811. *(svWP)*
9. **Högsten båk**: a tall red hexagonal wooden daymark (1845) off Eckerö, among the last of its kind. *(Rowlett)*
10. **Gustaf Dalén**: a caisson lighthouse named for the Swedish Nobel laureate who invented the automatic gas light. It was given to Finland in 1946–47 for the 250th anniversary of the Finnish pilot and lighthouse service, and its fog bell now stands in Mariehamn harbour. *(fyr.org, Rowlett)*
11. **Sjökvarteret harbour light**: a little 1898 lantern from Stegskär, now in Mariehamn's Maritime Quarter. It is the one lighthouse on the main island's road network. *(Rowlett)*

Honourable mentions: Fästorna (wooden 1856 daymark), Kökarsören (Åland's SE corner), Bogskär båk in Sottunga (a house with the light on its roof, 1824).

**For a game on Fasta Åland** (my inference, not from a source): only Sjökvarteret, the Lotsberget range towers (Mariehamn) and the Ledskär viewpoint (Herröskatan) are reachable by car. The others can be seen from the shore at best: Marhällan and Kobba Klintar from Mariehamn's west harbour side, Sälskär from Geta's heights. Märket, Bogskär and Flötjan are out of sight from land.

---

## 4. Appearance for a 3D artist

### Märket
**Overall:** one combined lighthouse and keeper's house, not a free-standing tower. It is a squat, fortress-like building about 10 m square in plan, with a hipped roof whose eaves are at about 12 m. A short lighthouse tower rises out of the roof at the south end, reaching 14 m above ground. The whole thing sits on bare, smooth grey diabase rock only about 2 m above sea level. *(fiWP; height Rowlett/svWP)*
- **Base:** the lowest storey is rough-dressed **granite blocks**, left unpainted, grey-brown with orange lichen, and forming a slightly wider plinth. The cellar for fuel and food is inside. *(fyr.org, fiWP, Photo: File:Märket_Lighthouse,_Finland_IMG_3374.jpg)*
- **Walls:** two upper storeys of **rendered brick** painted in broad **horizontal bands of brick red and white**, alternating, each roughly 0.8–1 m tall. About three red and three white bands show between the granite and the eaves *(Photo)*. Windows are tall rectangles with segmental (slightly arched) heads, white frames, 2 per face per floor, sitting in the white bands *(Photo)*. Under the tower the wall projects about one foot (≈0.3 m) *(fiWP)*.
- **Roof:** low **hipped roof of red-painted sheet metal**, with a white fascia and cornice *(Photo)*.
- **Tower:** above the roof, a short **white-painted masonry stage** (Rowlett: octagonal), then a **round cast-iron watch-room drum painted terracotta/rust red** *(Photo)*. On that sits a gallery with a white tubular railing, a **cylindrical glazed lantern** with white astragals (glazing bars), and a **white or pale grey dome** with a ball vent. A thin modern antenna mast sticks up beside it *(Photo)*. Total tower above roof ≈ 4–5 m *(estimate from photo)*.
- **Neighbours** (left to right in the 2008 Commons photo looking from the east, **[uncertain]** which is which):
  - a two-storey white building with a red roof and chimney on a grey concrete base with openings (the 1955 machine house over the boat shed);
  - a lower grey rendered block with exposed brick at its foot, carrying solar panels, a white radome and small wind turbines (the 1889 stone storehouse, ≈12 × 9 m and ≈4 m high, with a sauna added on top in 2014);
  - an elevated walkway with railings joining them to the lighthouse;
  - a low **angled stone breakwater wall** (≈40 m long, 1.75–2 m high, 1886–87) on the north side. *(fiWP, Photo)*
- **Interior hint (if used):** two keepers' flats, one per floor, and an attic room. *(fiWP)*
- **References:** Commons category https://commons.wikimedia.org/wiki/Category:M%C3%A4rket_lighthouse. Best views:
  - https://commons.wikimedia.org/wiki/File:M%C3%A4rket_Lighthouse,_Finland_IMG_3374.jpg (from the sea, close)
  - https://commons.wikimedia.org/wiki/File:M%C3%A4rket_lighthouse.jpg (whole island, with outbuildings)
  - https://commons.wikimedia.org/wiki/File:Victor_Westerholm_-_M%C3%A4rket_lighthouse_-_1887.jpg (1887 painting)
  - fiWP has the 1884 elevation and section and floor plans (Commons: "Architectural drawing of the Märket lighthouse cropped 1/2.jpg", "Floor plan of the Märket lighthouse, *.jpg").

### Bogskär
**Overall:** a lone tapered tower on a low, rounded pink-grey granite skerry with nothing else on it. About 22 m tall; light at 28 m. *(Rowlett, enWP)*
- **Lower stage** (≈13 m, **[estimate]**): a **round concrete drum tapering slightly upward**. It is the 1880s granite foundation and 1894 concrete core, with the iron skin stripped in 1922 *(fyr.org)*. It is painted **white on the lower ~45% and blue (mid "Finnish" blue) above** *(Rowlett, enWP, Photo: File:Bogskar.jpg)*. Base diameter roughly 6–7 m **[estimate]**.
- **Upper stage** (≈6 m): a narrower **hexagonal steel skeletal frame painted white**, its faces largely covered with **dark blue solar panels** *(Rowlett, Photo)*.
- **Top:** a flat **helipad platform** wider than the upper stage, with railings, plus the light, racon and radar reflectors *(enWP, fyr.org, Photo)*.
- **Historic version** (for a flashback or plaque): 1882–1915, a 25–26 m, 7-storey riveted iron tower on a 3 m granite plinth, painted red. Photographed c. 1920 as a scorched iron drum topped by an open frame and small lantern. *(enWP, fyr.org; Commons File:Bogskär;_majakka_mereltä_n._100_m_päästä_kuvattuna.jpg)*
- **References:** https://commons.wikimedia.org/wiki/Category:Bogsk%C3%A4r_Lighthouse; https://commons.wikimedia.org/wiki/File:Bogskar.jpg

### Sälskär
**Overall:** a tall, slender, round **brick tower, whitewashed**, about 32 m tall, with the light at 44 m. It is roughly 5–6 times taller than its base is wide, and tapers gently. The island is flat, rocky and partly wooded, with a pond. *(fiWP, Rowlett, fyr.org, Photo: File:Sälskär.JPG)*
- **Base:** a slightly wider **plinth drum about 1/7 of the height**, ending at a thin projecting ledge. It has a round-arched entrance door. The base diameter is 6 m *(fyr.org, Photo)*.
- **Shaft:** whitewash worn thin, so pink-red brick shows through in patches. **Four thin horizontal iron bands** at regular intervals were added in 1904 to bind the cracked tower *(fyr.org, Photo: File:Sälskär_lighthouse_upper_part.jpg)*. Small square windows run in a single vertical line, one per landing, about 5 in all *(Photo)*. Inside, a spiral stair of 164 steps with no landings *(fyr.org)*.
- **Top:** a **corbelled, flared cornice** carrying a round gallery with a black railing. Above it, a short **dark green or black watch-room** ring, then a **polygonal glazed lantern wrapped in a wire storm cage**. On top, a **red hemispherical dome** with a red ball finial and a lightning rod. A small solar panel is on the gallery *(Photo; Rowlett: "lantern black with a red dome")*.
- **Gone:** the keepers' houses (removed after 1949; foundations remain); the 8 bracing cables (removed 1980s). *(fiWP, fyr.org)*
- **References:** https://commons.wikimedia.org/wiki/Category:S%C3%A4lsk%C3%A4r_Lighthouse; https://commons.wikimedia.org/wiki/File:S%C3%A4lsk%C3%A4r.JPG; https://commons.wikimedia.org/wiki/File:S%C3%A4lsk%C3%A4r_lighthouse_upper_part.jpg

### Lågskär
**Overall:** a **truncated square pyramid of reinforced concrete**, 33 m tall, painted a flat **brick red**, on the NW tip of a low, partly wooded island. *(svWP, fyr.org, Photo: File:Lagskar.jpg)*
- **Proportions:** the base is about 1/5 of the height wide, and the top about half the base width **[estimate from photo]**. The **lowest ~1/6 is a slightly bolder plinth stage** ending at a horizontal moulding, with a round-headed opening on its face *(Photo)*.
- **Walls:** plain, with narrow slit windows in a vertical line on each face. The stair (175 steps) runs inside a double wall *(svWP)*.
- **Top:** a projecting **cornice and gallery with railing**, and a small **white lantern** with a shallow dome, small for the tower because the 1961 apparatus replaced the 1.7 m lens *(Rowlett, svWP, Photo)*.
- **Beside it:** a **1½-storey keeper's house painted pale yellow with white trim and a brown pitched roof** with chimneys, plus smaller red outbuildings *(Rowlett, Photo)*.
- **References:** https://commons.wikimedia.org/wiki/Category:L%C3%A5gsk%C3%A4r_Lighthouse; https://commons.wikimedia.org/wiki/File:Lagskar.jpg. The 1919–20 construction photos are in the same category.

### Kobba Klintar and Marhällan
- **Kobba Klintar pilot house:** a **2½-storey white-painted wooden building** in Jugend (Art Nouveau) style. The engine room was on the ground floor, a flat above, and the foghorn in the attic, with double doors in the gable facing the sea *(svWP)*. The roof is **grey standing-seam metal, gambrel-like with a small dormer**, with a chimney and green-painted trim. There are two-over-two white windows and a balcony outside the foghorn doors, where a wooden sculpture of a pilot with a telescope and a gull now stands *(svWP, Photo: File:Kobba_klintar_2015.jpg)*. Smaller white and grey wooden sheds sit around it, and the Åland flag flies on a pole.
- **The daymark:** a **white, steep, four-sided pyramid** (roughly as tall as the house, with a base about 2/3 of its height **[estimate]**) on a low stone base, with a **red ball on top** *(Photo)*. It is a 2012 replica of the 1861 original, with the same outer dimensions; inside is an event room with panoramic windows *(svWP)*. Note: Rowlett describes the 1910 fog-signal beacon as red; svWP says the original was painted white **[uncertain for the historic colour]**. The replica is white.
- **Marhällan:** a round concrete tower, 12 m, on a tiny low rock across the channel *(Rowlett)*. From the base up: a flared concrete footing, then **alternating black and red horizontal bands**, about 3 of each, with **black at the bottom**. The top is red, with a **solid red parapet gallery** (it reads almost like a crenellated cap) and a small light on top. The lantern has been removed *(Rowlett, svWP, Photo: File:Marhällan.jpg)*.
- **References:** https://commons.wikimedia.org/wiki/Category:Kobba_Klintar; https://commons.wikimedia.org/wiki/File:Kobba_klintar_2015.jpg; https://commons.wikimedia.org/wiki/Category:Marh%C3%A4llan; https://commons.wikimedia.org/wiki/File:Marh%C3%A4llan.jpg

### Flötjan
- **Overall:** a **round concrete column**, 22 m, on a bare 4 m-high skerry *(svWP, fyr.org)*. It is slender, about 7:1 height to width **[estimate]**.
- **Colours:** **red**, with **one white band about 2/3 of the way up** *(Rowlett, Photo: File:Flotjan.jpg)*. The band lies between a **lower gallery** (at its base) and the top gallery, and carries solar panels.
- **Top:** a gallery with railing, a **small white cylindrical lantern with a domed roof**, and a lattice mast with racon and antennas. There are no internal stairs: a steel ladder climbs it *(svWP)*.
- **Reference:** https://sv.wikipedia.org/wiki/Fl%C3%B6tjan (image Flotjan.jpg on Commons)

### Nyhamn (Lilla Båtskär)
- **Overall:** a concrete **mine headframe tower** (Rowlett ≈34 m; light was 43 m above sea). The shaft is narrower and the top section wider and boxy, which reads like a stubby water tower *(Rowlett, Photo: File:Lilla_Båtskär.jpg)*. Rowlett calls it round with a large round "watch room" on top; the distant photo looks rectangular **[uncertain]**. It is weathered unpainted or grey-brown concrete with an antenna on top.
- **Around it:** a low island with small red and green-roofed sheds, a white former pilot house with a red roof, and **5 large wind turbines** (2007). *(svWP, OSM)*
- **Reference:** https://commons.wikimedia.org/wiki/File:Lilla_B%C3%A5tsk%C3%A4r.jpg. Rowlett also lists aerial photos at marinas.com.

### Ledskär båk
- **Overall:** a **two-stage tapering masonry tower** about 10–12 m tall, standing on a grassy rocky knoll *(svWP, Rowlett, Väylä; Photo: File:Ledskärs_båk.jpg)*.
- **Form:** the lower stage is about 2/3 of the height, the upper about 1/3, set back at a small ledge. The plan looks **polygonal (octagonal)** in the photo; Rowlett says "round" **[uncertain]**.
- **Colours:** the faces are painted in **alternating vertical stripes of salmon/brick red and white**, a stripe per face *(svWP, Photo)*. The roof is a low **pyramid of green-patinated copper** with a small finial.
- **Light:** a separate small white octagonal lantern stands just to the north (1904) *(Rowlett, svWP)*.

### Gustaf Dalén
- **Overall:** a **concrete caisson** standing straight out of open water *(fyr.org, Photo: sv-wiki image Gustaf Dalen.jpg / Commons File:Gustaf_Dalen.jpg)*. A dark, wider ring foundation sits at the waterline. Above it, a **round concrete drum painted red** (faded orange-red), then a gallery with a railing carrying **"GUSTAF DALÉN" in large white letters**. Above that, an **open frame of four red steel legs** holding a second small gallery and a **small red octagonal lantern with a pointed roof**. 12 m overall.

### Sjökvarteret harbour light (Mariehamn)
- About 6 m high. A **white four-legged steel lattice stand**, splayed and X-braced, carries a round platform with a railing. On it stands a **white riveted cylindrical lantern house** with a band of windows, a sloping conical roof and a **chimney vent** on top *(Rowlett, Photo: File:Sjökvarteret,_fyr.jpg)*. It stands on grass beside the Maritime Quarter's red board-clad sheds.

### Högsten båk
- A 16 m **hexagonal wooden pyramid** (tapering to a point), **painted brick red**, unlit *(Rowlett, Väylä 15.9 m)*. No photo was checked here. Rowlett points to user photos on Google Maps; fyr.org's travel report (*Blänket* 2016:2, "Märket – Högstens båk – Sälskär") also covers it.

---

## 5. Historical notes for the player (2–3 sentences each)

**Märket.** When this lighthouse was built in 1885, its builders chose the skerry's highest point, which turned out to be on the Swedish half of an island split down the middle by the 1809 border. A century later Finland and Sweden redrew the line in a zigzag, swapping equal patches of rock so the lighthouse stood in Finland and neither country lost any coastline. It is the smallest sea island shared by two countries, and Finland's westernmost land. *(enWP "Märket", svWP "Märket", Rowlett)*

**Bogskär.** On a bare rock 70 km out to sea, Finland's southernmost lighthouse was first a seven-storey iron tower, lit in 1882. In February 1889 a storm tore off its iron plates and put out the light, and ice kept rescuers away until April, by which time the keepers were feared dead; all had survived. A German warship shelled the tower in 1915, and today's white-and-blue tower was built on its stump in 1922. *(svWP "Bogskär", fyr.org "Bogskär")*

**Sälskär.** Lit on 15 September 1868, this brick tower guards the reefs off Åland's northwest corner, where sailors once had only the Geta hills to steer by in daylight. Autumn storms in the 1890s cracked its walls and threw down the lantern, so in 1904 it was bound with four iron hoops and held up by eight steel cables. Its keepers left in 1949, when a gas light made it automatic. *(fyr.org "Sälskär", fiWP; svWP says 1948)*

**Lågskär.** A wooden beacon stood here from 1794, and a light from 1840, but Russian troops blew up the brick lighthouse in 1915. The concrete pyramid that replaced it in 1920 carried AGA's biggest lens yet, 1.7 m across, which turned on its own using the pressure of the acetylene that fed its flame. Since the keepers left in 1961, the island has been a bird-ringing station. *(svWP "Lågskär", fyr.org)*

**Kobba Klintar.** From 1861 Mariehamn's pilots rowed out from this rock to guide sailing ships into harbour, under a white pyramid seamark. The 1910 house hid a diesel-driven foghorn in its attic, which blew through doors in the gable. The station closed in 1972; the pyramid you see is a 2012 copy of the original, which was pulled down in 1954. *(svWP "Kobba Klintar")*

**Marhällan.** After the barques *Virgo* (1928) and *Plus* and *Fred* (1933) were wrecked here at the harbour mouth, this striped concrete light was put up in 1938 with an automatic fog bell. The fog signal that later replaced the bell was switched off in 1985, the last one working in Finland. *(svWP "Kobba Klintar", fyr.org "Marhällan")*. Note: fyr.org says that last fog signal was Marhällan's own nautophone, while svWP says Marhällan's siren replaced Kobba Klintar's in 1972. Both agree it was this pair.

**Nyhamn (Lilla Båtskär).** Swedish King Adolf Frederick had a stone lighthouse built here in 1751, because rocks under the sea made ships' compasses lie. Russian forces destroyed it in 1808–09. In 1958 a company sank a 360 m iron-ore mine shaft on the island; the mine failed within two years, but the light lived on at the top of the shaft tower until 2007. *(fyr.org "Nyhamn", fiWP "Nyhamnin majakka")*

**Ledskär.** This striped stone beacon was finished in 1748 to mark the narrow Ledsund passage, which the Swedish fleet sailed through in 1720 to attack the Russian galleys. A year earlier the Russian galley fleet had anchored here, and Tsar Peter the Great is said to have had his monogram cut into the rock. The red and white stripes were added in 1899. *(svWP "Ledskär")*

**Flötjan.** In 1811 this tiny skerry was written into the treaty map as one of the corner points of Finland's new border with Sweden. A concrete cairn with a gas light came in 1901–08, and the tower in 1953. It was cast in one continuous pour and has no stairs, only a ladder. *(svWP "Flötjan")*

**Gustaf Dalén.** When Finland's pilot and lighthouse service turned 250 in 1946, the Swedish firm AGA gave it a complete automatic lighthouse. Finland named it after AGA's founder Gustaf Dalén, the blind Nobel laureate whose sun valve switched lights on at dusk. Its old fog bell now stands in Mariehamn harbour. *(fyr.org "Gustaf Dalén")*. Note: "blind" is from general knowledge of Dalén (he lost his sight in a 1912 explosion), not from the sources above. Drop it if you want every word sourced.

**Högsten båk.** A sea mark has stood on this Eckerö island since 1740. The first was destroyed in the war between Russia and Sweden in 1808–09; the red wooden pyramid of 1845 was restored in 1981. *(Rowlett)*

**Sjökvarteret.** This little lantern guided ships at Stegskär from 1898 before it was moved to Mariehamn's Maritime Quarter, where it still shines as a harbour light. *(Rowlett)*

---

## 6. Open questions

- **Kökarsören's present form**: Rowlett (red-daymarked lattice) and a 2026 Commons photo (black lattice mast with instruments) disagree. It may be a different structure on the same island.
- **Nyhamn tower plan**: round (Rowlett) or square/rectangular (my reading of a distant photo).
- **Ledskär båk plan**: round (Rowlett) or octagonal (photo).
- **Bogskär characteristic**: `Fl(3) W 20s` (NGA, Rowlett) or `LFl(2+1) WRG 8s` (svWP).
- **Högsten båk's exact position**: only the island centroid was found. Check the Finnish nautical chart or OSM by hand.
- **Väylävirasto's Flatu, Blekungen, Bläskär**: not located.
- The current official characteristics are in Traficom's Finnish List of Lights (PDF, https://www.traficom.fi/en/services/list-lights-marine), which I didn't open. It is the authority if the game shows flash patterns.

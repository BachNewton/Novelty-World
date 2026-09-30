// The verified art of each heritage symbol (ideas/heritage-through-time.md,
// "Symbols"): published art checked against its official design, or, only as
// a last resort, our own drawing from documented sources. A symbol with a
// record here has a file in `symbol-art/`, named by its symbol id, pinned by
// its SHA-1; a symbol without one has no verified art and isn't shown. The
// `heritage-symbol-art` skill is how records get here. Nothing renders this
// art yet.

import type { SymbolId } from "./symbol-timelines";

// The licences art may carry. Public domain and CC0 need no credit; the CC BY
// licences need the record's attribution shown wherever the art is.
export const ART_LICENSES = {
  "public-domain": { name: "Public domain", url: null, attribution: false },
  "cc0-1.0": { name: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: false },
  "cc-by-4.0": { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/", attribution: true },
  "cc-by-sa-3.0": { name: "CC BY-SA 3.0", url: "https://creativecommons.org/licenses/by-sa/3.0/", attribution: true },
  "cc-by-sa-4.0": { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/", attribution: true },
} as const satisfies Record<string, { name: string; url: string | null; attribution: boolean }>;

export type ArtLicenseId = keyof typeof ART_LICENSES;

interface ArtRecord {
  // SVG wherever a faithful one exists; a raster only when the source is one:
  // PNG, or JPEG for a scan of a period specimen, stored as published.
  format: "svg" | "png" | "jpg";
  // The file's SHA-1, so a test can prove the stored file was never edited:
  // for published art, the source's own (Commons gives each upload's).
  sha1: string;
  author: string;
  license: ArtLicenseId;
  // The credit line the licence requires, or empty when it requires none.
  attribution: string;
  // The symbol's official proportions, width to height, from the
  // specification; for a symbol with none (most coats of arms), those of the
  // reference image it was checked against. A test holds the file to them.
  proportions: { width: number; height: number };
  // What was checked, and what was found: proportions, colours, details.
  checked: string;
  // A scan's paper made transparent, so the symbol shows in its own shape;
  // absent when the file itself is the symbol alone.
  display?: DisplayArt;
}

// The display file beside a scan: `<symbol-id>.display.png`, the scan with
// only its paper background made transparent by
// `tools/transparent-background.py` and trimmed to the symbol. The symbol's
// own pixels are untouched, and the scan stays the record.
export interface DisplayArt {
  sha1: string;
  // The trimmed symbol's pixel size.
  width: number;
  height: number;
}

// Art as an official source or a faithful existing file published it,
// stored byte for byte.
export interface PublishedArt extends ArtRecord {
  kind: "published";
  // Where the file came from: its Wikimedia Commons file page, or the
  // official page it was downloaded from.
  source: string;
  // Why that licence applies, as the source states it: the Commons licence
  // templates, or the official terms of use.
  licenseBasis: string;
  // The specification or historical sources the art was checked against,
  // most authoritative first. URLs are welcome.
  checkedAgainst: readonly string[];
}

// Our own drawing, the last resort: allowed only once the official and
// existing-file avenues are exhausted, from sources that document every
// element, at high confidence. Replaced as soon as verifiable published art
// turns up.
export interface DrawnArt extends ArtRecord {
  kind: "drawn";
  format: "svg";
  license: "cc0-1.0";
  // The official and existing-file avenues searched without a faithful
  // result, and why each fell short.
  searched: readonly string[];
  // Each element of the design (the field, a charge, a colour, the
  // proportions) and the sources that document it.
  elements: readonly { element: string; sources: readonly string[] }[];
}

export type SymbolArt = PublishedArt | DrawnArt;

export const SYMBOL_ART: Partial<Record<SymbolId, SymbolArt>> = {
  "england-flag": {
    kind: "published",
    format: "svg",
    sha1: "e775153a8f921d9c6010a8b4181fa8835e5006f2",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_England.svg",
    author: "Traditional design; vectorized by Nicholas Shanks (Wikimedia Commons)",
    license: "public-domain",
    licenseBasis: "Commons: PD-shape, Insignia",
    attribution: "",
    proportions: { width: 5, height: 3 },
    checkedAgainst: [
      "Flag Institute, UK Flag Registry, \"England\" (UNKG0100): aspect ratio 3:5, Pantone white and red 186: https://www.flaginstitute.org/wp/flags/england/",
      "Flags of the World, \"England\": the national flag at 3:5, the cross 1/5 of the flag's height wide: https://www.crwflags.com/fotw/flags/gb-eng.html",
    ],
    checked:
      "A red cross on white, the cross one fifth of the flag's height wide, centred, at 3:5: the file is 800 by 480 with both arms of the cross stroked 96 wide through the centre. " +
      "Red #C8102E is Pantone's sRGB value for 186 C, the Flag Institute's red; white #FFFFFF. " +
      "No statute sets the flag's ratio or shade: it was established by custom, and 3:5 is the ratio the Flag Institute's registry and Flags of the World give. " +
      "The file history's only changes since 2011 are code clean-ups and a 2020-21 revert pair; the talk page has no design dispute. " +
      "It represents the English people: England's own flag, as distinct from the Union flag of the United Kingdom state, flown by the English as their national flag since the 16th century.",
  },
  "finland-flag": {
    kind: "published",
    format: "svg",
    sha1: "4ba6e5300c3ddd64f581df014e3aea3ad7254882",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_Finland.svg",
    author: "Unknown (design of the Act on the Flag of Finland, 1918)",
    license: "public-domain",
    licenseBasis: "Commons: PD-shape, PD-FinlandGov",
    attribution: "",
    proportions: { width: 18, height: 11 },
    checkedAgainst: [
      "Act on the Flag of Finland, 29 May 1918 (Suomen asetuskokoelma 40/1918), section 2",
      "Act on the Flag of Finland (380/1978), section 1",
      "Government decision 827/1993 on the flag's colours",
      "https://intermin.fi/en/flag-and-arms/about-the-flag",
    ],
    checked:
      "Proportions 11:18, cross arms 3, fields 4:3:4 high and 5:3:10 long: the file draws exactly that (viewBox 18 by 11), as the 1918 act already set them. " +
      "Blue #002F6C is Pantone's sRGB value for PMS 294 C, the blue of decision 827/1993; white #FFFFFF. " +
      "The 1918 act's blue was an unspecified ultramarine until 1993, so earlier flags varied in shade.",
  },
  "finland-lion-arms": {
    kind: "published",
    format: "jpg",
    sha1: "e3da7d37fbcfecefc3003e7c9911f1d11f283bd2",
    source: "https://commons.wikimedia.org/wiki/File:Coat_of_arms_of_Finland_1889.jpg",
    author: "Karl August Bomansson (scan: National Archives of Finland)",
    license: "public-domain",
    licenseBasis: "Commons: PD-Kansallisarkisto",
    attribution: "",
    proportions: { width: 852, height: 1578 },
    display: { sha1: "f55eb63972dcad285125bc22afdb15fa4345c5f9", width: 822, height: 1559 },
    checkedAgainst: [
      "Itsenäisyys 100, \"Historiallinen leijonavaakuna on kestänyt kaikki Suomen valtiolliset vaiheet\": State Archivist K. A. Bomansson's arms of the Grand Duchy, printed by Ferdinand Tilgmann in 1886; \"this lion figure at once became general in Finnish-made arms and lion flags\"; the crown removed in 1920",
      "\"Suomen suuriruhtinaskunnan vaakuna v. 1886\" (Storfurstendömet Finlands vapen), Bomansson and Tilgmann, Historiallinen Arkisto IX (1886), Finnish Heritage Agency HK10000:6738: https://www.finna.fi/Record/museovirasto.01CC071AA040A211DCA317AA4BEDA83C",
      "Finnish Government, \"The Finnish flag turns 100\": the arms flown on white in 1848, blue and white as popular colours from the 1860s, the red-and-yellow lion flag with the arms' lion raised on 6 December 1917: https://valtioneuvosto.fi/en/-/1410869/suomen-lippu-tayttaa-sata-vuotta",
      "Suomen lipun historia, \"Flags of the Grand Duchy of Finland\" and \"Finnish Flags During the Years of Oppression, 1890-1917\": Topelius's blue-and-white flag of 1862 bore the lion arms; the red lion flag spread in 1899-1917 and was banned: https://www.leijonalippu.fi/en/sortokaudet.html",
      "Finnish Ministry of the Interior, \"Coat of arms of Finland\": https://intermin.fi/en/flag-and-arms/arms-of-finland",
    ],
    checked:
      "Represent people, not governments: Finns of 1809-1918 identified with the Grand Duchy of Finland, their own state with its own Senate, Diet and constitution, but not with the Russian Empire. " +
      "The lion arms were Finland's own, and the one symbol every side shared: Topelius's blue-and-white flag of 1862 bore them, the red lion flag of the national movement is their lion, and Finns kept to the lion stamps until Russia stopped them in 1901. " +
      "The flags were factional (blue and white for the Finnish-speaking side, red and yellow for the Swedish-speaking side and the Young Finns), so the arms, not a flag, are the symbol that represents them all. " +
      "The era's arms came in two forms: the Russian Empire's official 1882 drawing (a bare arm, a Russian double eagle in the crown) and the form Finland's own State Archivist Bomansson drew in 1886, which at once became general in Finnish-made arms and lion flags (Itsenäisyys 100). " +
      "By the rule that the form a people used for themselves wins over one they would have seen as imposed, this is the Finnish form. " +
      "The file is the National Archives of Finland's scan of Bomansson's own colour plate, the historical record itself, stored unedited: a crowned gold lion on red, an armoured arm brandishing a sword, a sabre under its hind paws, nine silver roses, and a closed red-capped crown with no eagle. " +
      "Compared element by element with the Finnish Heritage Agency's scan of the 1886 printed plate (HK10000:6738): the same design. The scan's cream paper is the original's; no ratio was set, so the proportions are the scan's own (852 by 1578). " +
      "A JPEG scan, because no faithful SVG of the Finnish form exists (the Commons SVGs follow the 1882 Russian drawing or carry the eagle crown). Finnish-American usage was searched without a direct source, so the choice rests on usage in Finland.",
  },
  "german-empire-flag": {
    kind: "published",
    format: "svg",
    sha1: "59fe0e22197ef0fa883aeb99f3122f686633d350",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_Germany_(1867%E2%80%931918).svg",
    author: "Vectorized by B1mbo and Madden (Wikimedia Commons)",
    license: "public-domain",
    licenseBasis: "Commons: PD-shape",
    attribution: "",
    proportions: { width: 3, height: 2 },
    checkedAgainst: [
      "Constitution of the German Empire, 16 April 1871, article 55 (the flag of the navy and merchant fleet is black-white-red)",
      "Ordinance on the federal flag for merchant ships, 25 October 1867 (Bundesgesetzblatt des Norddeutschen Bundes 1867, no. 5, p. 39): three equal horizontal stripes, black, white, red, height to length 2:3",
      "Flags of the World, \"German Empire 1871-1918\": https://www.fotw.info/flags/de1871.html",
    ],
    checked:
      "Three equal horizontal bands, black over white over red, at 2:3, as the 1867 ordinance sets them and the Empire kept them: the file is 900 by 600 with bands of 200. " +
      "Neither law gives shades, so any true black, white and red is faithful; the file's red is #DD0000. " +
      "The Commons page's colour table says crimson #DC143C, which is not what the file draws; the file itself was checked. " +
      "The plain tricolour was the merchant flag from 1867 and the national flag from 8 November 1892.",
  },
  "germany-black-red-gold": {
    kind: "published",
    format: "svg",
    sha1: "69aeb30e7468ad611bbbcc12400cc2345c7608c7",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_Germany_(RGB).svg",
    author: "Kamran.nef and Colohisto (Wikimedia Commons), after the federal government's colour specification",
    license: "public-domain",
    licenseBasis: "Commons: PD-simple, PD-Flag-Germany, insignia",
    attribution: "",
    proportions: { width: 5, height: 3 },
    checkedAgainst: [
      "Basic Law for the Federal Republic of Germany (1949), article 22: the federal flag is black-red-gold",
      "Anordnung über die deutschen Flaggen, 13 November 1996 (BGBl. I S. 1729): three equal horizontal stripes, black over red over gold, height to length 3:5",
      "Federal Government corporate design styleguide, \"Die Nationalfarben\": black #000000, red #FF0000 (Pantone 485), gold #FFCC00 (Pantone 7405): https://styleguide.bundesregierung.gov.de/sg-de/die-nationalfarben-2023492",
      "Bundesbeschluss über Wappen und Farben des Deutschen Bundes, 9 March 1848: https://www.verfassungen.de/de06-66/bundesfarben48.htm",
      "Flags of the World, \"Weimar Republic 1919-1933\" and \"Regulation on Flags of 11th April 1921\": https://www.fotw.info/flags/de1919.html",
    ],
    checked:
      "Three equal horizontal stripes, black over red over gold, at 3:5 as the 1996 flag order sets them: the file is 1000 by 600 with stripes of 200. " +
      "Black #000000, red #FF0000 and gold #FFCC00 are exactly the federal government's published RGB values for the national colours, which the styleguide gives for screen use (its CMYK and Pantone values are for print). " +
      "The better-known Commons file Flag_of_Germany.svg draws #DD0000 and #FFCE00, shades chosen on its talk page in 2006, so it was not used. " +
      "The same colours represent the German people in every era the timeline gives them: the national movement's colours from the Burschenschaft of 1815 and the Hambach Festival of 1832, " +
      "declared the German Confederation's colours on 9 March 1848 as \"the colours of the former imperial banner\", the Reich's colours under the Weimar constitution (article 3), and the federal flag since 1949; " +
      "Germans born 1933-1945 show them too, as the people's own colours rather than the regime's flags. " +
      "Only the ratio varied: the Weimar flag flew at 2:3 (Flags of the World), and 3:5 dates from the federal flag order of 1950, kept in 1996.",
  },
  "hungary-flag": {
    kind: "published",
    format: "svg",
    sha1: "a7f7e6bcf8b6a00cbd3f26459f97a83105a5579b",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_Hungary.svg",
    author: "SKopp (Wikimedia Commons)",
    license: "public-domain",
    licenseBasis: "Commons: PD-Coa-Hungary, PD-ineligible",
    attribution: "",
    proportions: { width: 2, height: 1 },
    checkedAgainst: [
      "Fundamental Law of Hungary (2011), article I: red, white and green horizontal stripes of equal width",
      "Government decree 132/2000 (VII. 14.): the national flag at 1:2",
      "Hungarian standard MSZ 1361:2009 on the national flag: red Pantone 18-1660 TCX, green Pantone 18-6320 TCX",
      "Act XXI of 1848 on the national colours and the arms of the country",
      "Flags of the World, \"Hungary\" and \"Hungary - Historical flags (1867-1918)\": https://www.fotw.info/flags/hu.html",
    ],
    checked:
      "Three equal horizontal stripes, red over white over green, at 1:2: the file is 1200 by 600 with stripes of 200. " +
      "Red #CE2939 and green #477050 are Pantone's sRGB values for 18-1660 TCX and 18-6320 TCX, the colours of MSZ 1361:2009; white #FFFFFF. " +
      "The file's history has a 2022 colour edit war, reverted each time to these colours; the talk page's only dispute (2009) was the ratio, 1:2 against 2:3, which decree 132/2000 settles for the national flag. " +
      "The same tricolour was Hungary's national flag from 1848 (Act XXI of 1848 named only the colours), plain and without the arms from 1882 to 1918 by Flags of the World; " +
      "before 2000 no act set its ratio or shades, and Flags of the World gives 1:2 as the tricolour's ratio from 1848, while 2:3 was also flown.",
  },
  "ireland-flag": {
    kind: "published",
    format: "svg",
    sha1: "ee4b5ae8d97783e6510494ee44fe0d8ac3b851d8",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_Ireland_(Pantone).svg",
    author: "Marcus365 (Wikimedia Commons), from the Department of the Taoiseach's specification",
    license: "public-domain",
    licenseBasis: "Commons: PD-IrishGov, Insignia",
    attribution: "",
    proportions: { width: 2, height: 1 },
    checkedAgainst: [
      "Bunreacht na hÉireann (1937), article 7: \"The national flag is the tricolour of green, white and orange\"",
      "Department of the Taoiseach, \"The National Flag - Guidelines\" (September 2025), technical data: proportion 2:1, each colour 1/3 of the width, green PMS 347, orange PMS 151: https://assets.gov.ie/static/documents/9d76c655/The_National_Flag_-_Guidelines_September_2025.pdf",
      "Flags of the World, \"Ireland\": https://www.crwflags.com/fotw/flags/ie.html",
    ],
    checked:
      "Three equal vertical pales, green at the hoist, white, orange, at 1:2: the file is 1200 by 600 with pales of 400. " +
      "Green #009A44 and orange #FF8200 are Pantone's sRGB values for 347 C and 151 C, the colours of the Taoiseach's guidelines; white #FFFFFF. " +
      "The better-known File:Flag_of_Ireland.svg was rejected: its #169B62 and #FF883E are no published Pantone value for 347 or 151 (its talk page shows them chosen by editors from an uncoated reading). " +
      "This file has a single upload (2026) and no talk page. " +
      "It represents the Irish people: the flag of the independence movement from 1916, adopted by the Irish Republic in 1919 and the Free State in 1922, and confirmed as the national flag by the people's own constitution of 1937.",
  },
  "ireland-harp-flag": {
    kind: "published",
    format: "svg",
    sha1: "ee07bfa4a3819e1bf941811fd247e2a7019454b0",
    source: "https://commons.wikimedia.org/wiki/File:Green_harp_flag_of_Ireland.svg",
    author: "Raymond1922A, with the harp redrawn by Sodacan (Wikimedia Commons)",
    license: "cc-by-sa-3.0",
    licenseBasis: "Commons: self, cc-by-sa-3.0",
    attribution:
      "Green harp flag of Ireland by Raymond1922A and Sodacan, Wikimedia Commons, CC BY-SA 3.0: https://commons.wikimedia.org/wiki/File:Green_harp_flag_of_Ireland.svg",
    proportions: { width: 3, height: 2 },
    checkedAgainst: [
      "G. A. Hayes-McCoy, A History of Irish Flags from Earliest Times (Dublin, 1979), as quoted by Flags of the World: the green flag from 1798; the 18th- and 19th-century harp a winged maiden, one wing forming its neck",
      "Flags of the World, \"Ireland: Green Flag\": https://www.fotw.info/flags/ie-green.html",
      "\"Ireland\", Flags of All Nations, series 1 (N9), Allen & Ginter cigarette cards, 1887, Metropolitan Museum of Art",
      "\"Charles Parnell, Member of Parliament, Ireland\", Rulers, Flags, and Coats of Arms (N126), W. Duke, Sons & Co., 1888, Metropolitan Museum of Art: the \"Flag of Ireland\"",
      "The Irish Transvaal Brigade's uninscribed green flag of 1899 with a winged-maiden harp, National Museum of Ireland (Hayes-McCoy, plate iv)",
    ],
    checked:
      "The green harp flag never had an official design and flew in many variants: a plain or winged-maiden harp, with or without a crown, a wreath of shamrocks or an inscription such as \"Erin go Bragh\". " +
      "This is its most iconic design, a gold winged-maiden harp with silver strings, centred on a plain green field: the form Hayes-McCoy gives the harp of the 18th and 19th centuries, " +
      "and the one the period's own flag references show as the flag of Ireland (the 1887 Allen & Ginter and 1888 Duke cards) and the surviving 1899 Transvaal Brigade flag carries. " +
      "The file draws exactly that: field #009A49, the harp in golds #FFDB43 and #DBBA2E, strings #DFDFDF, no crown or inscription. " +
      "No ratio or shade was ever set; the file is 450 by 300 (2:3), within the period's variety (Flags of the World draws it 1:2). The file has no talk page; its one later upload (2017) redrew the harp, and the stored file is that version, checked as above.",
  },
  "italy-savoy-flag": {
    kind: "published",
    format: "svg",
    sha1: "ff060347b1116848ade2b000e617fb1f13ffa279",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_Italy_(1861%E2%80%931946).svg",
    author: "F l a n k e r, with the Savoy arms redrawn by Fry1989 (Wikimedia Commons)",
    license: "public-domain",
    licenseBasis: "Commons: PD-user (F l a n k e r), Insignia",
    attribution: "",
    proportions: { width: 3, height: 2 },
    checkedAgainst: [
      "Royal decree-law of 24 September 1923, no. 2072, converted with amendments by law of 24 December 1925, no. 2264, \"Norme per l'uso della bandiera nazionale\", article 1: the national flag is green, white and red in equal vertical thirds, green at the hoist, the white charged with the royal arms bordered azure, two-thirds as high as it is long; the state flag, for the sovereign's residences, Parliament, diplomatic missions and government offices, adds the royal crown; article 3: local public bodies fly the arms without the crown",
      "Proclamation of King Charles Albert, 23 March 1848: the troops to carry the Savoy shield on the Italian tricolour",
      "Presidency of the Council of Ministers, Ufficio del Cerimoniale di Stato, \"La Bandiera - Cenni storici e norme per l'esposizione\": the tricolour became the flag of the Kingdom of Sardinia in 1848 and of the Italian state in 1861",
      "Flags of the World, \"Kingdom of Italy (1848-1946)\": https://www.fotw.info/flags/it-king.html (green-white-red with the Savoy arms; the tricolour was and is 2:3)",
    ],
    checked:
      "The Kingdom had two forms: the national flag, with the Savoy shield uncrowned and bordered azure, and the state flag, which added the royal crown for the sovereign's residences, Parliament, diplomatic missions and government offices (law 2264 of 1925, articles 1 and 3). " +
      "Italians identified with the united Kingdom their Risorgimento had made, and the national flag is the one they flew themselves, from 1848 the Risorgimento's tricolour and from 1861 united Italy's; the crown marked the monarchy's own buildings. So the symbol that represents the people is the uncrowned national flag, recorded here. " +
      "The file draws it: 1500 by 1000 (2:3) with equal thirds of 500, green #009246 at the hoist, white #FFFFFF, red #CE2B37; on the white a red shield (#D2232C) with a white cross throughout, bordered blue (#4B61D1), no crown. " +
      "The law named the colours only, so any true green, white, red and azure is faithful. The file's history is a revert war between two uploads with identical geometry and colours (an Inkscape version and a minified one, over file size), not a design dispute; the talk page discusses only the shield's centring, since fixed.",
  },
  "italy-tricolour": {
    kind: "drawn",
    format: "svg",
    sha1: "531a1b9bde7562638b9233ba4f09b7aeec61bd8d",
    author: "Novelty World (our own drawing)",
    license: "cc0-1.0",
    attribution: "",
    proportions: { width: 3, height: 2 },
    searched: [
      "Official artwork: none published. The Presidency of the Council of Ministers gives the flag only as Pantone textile codes (its \"La Bandiera\" pages and PDF, and article 31 of the decree of 14 April 2006)",
      "Commons File:Flag_of_Italy.svg: draws green #009246 and red #CE2B37, Pantone's older conversions, which its own page's colour table no longer gives; all three colours differ from the specification's",
      "Commons File:Flag_of_Italy_(Pantone).svg: green #008C45 and red #CD212A are right, but the white is #FFFFFF where Pantone 11-0601 TCX converts to #F4F5F0",
      "Commons' national-flag category for Italy (the variant, printable, WFB and construction-sheet files): none draws the specification's white",
    ],
    elements: [
      {
        element: "Three vertical bands of equal size, green at the hoist, then white, then red",
        sources: [
          "Constitution of the Italian Republic (1948), article 12",
          "Presidency of the Council of Ministers, Ufficio del Cerimoniale di Stato, \"La Bandiera\": https://presidenza.governo.it/ufficio_cerimoniale/cerimoniale/bandiera.html",
        ],
      },
      {
        element: "Proportions 2:3",
        sources: [
          "Presidency of the Council of Ministers, \"La Bandiera - Cenni storici e norme per l'esposizione\" (flags made 300 by 200 or 450 by 300 cm)",
          "Flags of the World, \"Italy\": https://www.fotw.info/flags/it.html",
        ],
      },
      {
        element: "Colours: green #008C45, white #F4F5F0, red #CD212A",
        sources: [
          "Decree of the President of the Council of Ministers, 14 April 2006 (Gazzetta Ufficiale no. 174, 28 July 2006), article 31: green Pantone textile 17-6153 TCX, white 11-0601 TCX, red 18-1662 TCX",
          "Pantone's sRGB values for those codes (Fern Green 0,140,69; Bright White 244,245,240; Flame Scarlet 205,33,42), as the Pantone colour finder gives them and Commons' File:Flag_of_Italy.svg colour table quotes it",
        ],
      },
    ],
    checked:
      "The Republic's flag, chosen with the Republic by the referendum of 1946 and written into its Constitution: Italians identify with it and fly it as theirs, so the state's symbol represents the people. " +
      "Drawn as a viewBox of 3 by 2 with three bands of 1, in the decree's colours as Pantone converts them, and rendered to check the bands and colours. " +
      "Drawn because no published file draws all three colours of the specification.",
  },
  "lebanon-cedar": {
    kind: "published",
    format: "svg",
    sha1: "1500d0cb2b60c7837ea29946c10e787525dc2f6d",
    source: "https://commons.wikimedia.org/wiki/File:Cedar_flag.svg",
    author: "RblxFunkyGamer (2023 redrawing), after Mysid and Lokal Profil (Wikimedia Commons)",
    license: "public-domain",
    licenseBasis: "Commons: PD-retouched-user, insignia",
    attribution: "",
    proportions: { width: 3, height: 2 },
    checkedAgainst: [
      "Roman Klimeš, \"The Cedar Tree – The Symbol of a Country\", Proceedings of the 25th International Congress of Vexillology, Rotterdam 2013 (https://fiav.org/wp-content/uploads/2021/06/ICV2525-Roman-Klimes-The-Cedar-Tree-%E2%80%93-The-Symbol-of-a-Country.pdf): by 1848 the unofficial flag of Lebanon, white with a green cedar in the centre; proposed by Shukri el-Khoury in 1913 and adopted by Lebanese emigrants in America; hoisted at Baabda from 2 November 1918 to May 1919",
      "Flags of the World, \"Lebanon: Cedar Flag 1918\" (https://www.fotw.info/flags/lb_cedar.html), after Joseph Nehmé, \"The Flag of Lebanon\", Crux Australis 50 (1996): a white cloth with a green cedar in the centre, 2:3, first attested October 1848",
      "Flags of the World, \"French Mandate of Greater Lebanon 1920-1943\" (https://www.fotw.info/flags/lb-frm20.html): the mandate's tricolour with a cedar, for comparison",
    ],
    checked:
      "The cedar flag had no official design and survives in no dated drawing: its sources describe a white flag with a green cedar in the centre (one 1918 account puts the cedar in the lower part), at 2:3. " +
      "This is that design in its most widely recognized form, one variant of several, the cedar as the Lebanese flag draws it: all green, centred, as high as half the flag and a third of its length wide. The file is 1773 by 1182 (3:2), white #FFFFFF with the cedar in green #00A850 (edges traced in #80D4A8, the blend of the two), the cedar centred within 0.3% (rendered and measured). " +
      "The shade and the cedar's drawing were never specified. The file's 2023 re-upload (no reason given) redrew the 2006 cedar and brightened its green without changing the design. " +
      "Why it represents the people: for births under the Mutasarrifate and the French Mandate, the Lebanese flag is the one they used for themselves: the Maronites' cedar on white from 1848, the emigrant communities' flag in America from 1913, and the flag hoisted at Baabda in 1918. " +
      "The mandate's tricolour with a cedar (1920-1943) is not used: Lebanese emigrants designed it and some Lebanese asked for it, but it set the people's cedar on France's colours, which the Lebanese deputies dropped at independence in 1943 as the sign of it. Asked how they would want to be remembered, these Lebanese would most likely choose their own cedar on white.",
  },
  "lebanon-flag": {
    kind: "published",
    format: "svg",
    sha1: "9a84bbac85fa8a4f4b66c1320c4f814786b07292",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_Lebanon.svg",
    author: "Henri Pharaon (design, 1943); drawn by Arctic Levantine and optimized by SVG flag maker (Wikimedia Commons)",
    license: "public-domain",
    licenseBasis: "Commons: PD-Lebanon, PD-USGov-CIA-WF, PD-ineligible, insignia",
    attribution: "",
    proportions: { width: 3, height: 2 },
    checkedAgainst: [
      "Constitution of Lebanon, article 5, as amended by the Constitutional Law of 7 December 1943 (Arabic text, Presidency of the Republic: https://www.presidency.gov.lb/lebanon-system/aldstwr-allbnany): red, white, red horizontal; the white as high as both reds together; a green cedar in the centre, its top touching the upper red and its base the lower, its size a third of the white (French text: \"dont la largeur occupe le tiers de celle-ci\")",
      "Roman Klimeš, \"The Cedar Tree – The Symbol of a Country\", Proceedings of the 25th International Congress of Vexillology, Rotterdam 2013: the 1943 text, no ratio set",
      "Flags of the World, \"Lebanon\" (https://www.fotw.info/flags/lb.html): 2:3; Album des Pavillons 2023 colours, red Pantone 1788 C, green Pantone 355 C",
      "Flags of the World, \"Lebanon: Flag Variants\" (https://www.fotw.info/Flags/lb!.html): an all-green cedar is correct, brown-trunk flags are not",
    ],
    checked:
      "Red, white and red stripes of 1:2:1, the cedar all green, centred, as wide as a third of the flag's length and exactly as high as the white stripe, touching both reds: the file is 2880 by 1920 with stripes of 480, 960 and 480 and the cedar from x 960 to 1920 (rendered and measured). " +
      "The constitution names the colours only, so the shades are unspecified; the file draws red #D31624, white #FFFFFF, green #008C3E, true renderings of the named colours (Album des Pavillons 2023, a French naval reference, gives Pantone 1788 C and 355 C). " +
      "No act sets a ratio; 2:3 is the ratio Flags of the World and the flag's users give. The cedar's drawing isn't specified either: the file's history has a 2024 revert war over which drawing to use, settled since January 2025 on this one, and every version met article 5. " +
      "The talk page's old threads on a brown trunk are settled by article 5's \"green cedar\": the 1943 original drawing and the 1967 WIPO filing show a brown trunk, but Flags of the World calls brown-trunk flags wrong. " +
      "Why it represents the people: the flag the Lebanese deputies themselves adopted at independence in November 1943, keeping the cedar and dropping the French colours (Klimeš), and flown by independent Lebanon ever since.",
  },
  "poland-flag": {
    kind: "published",
    format: "svg",
    sha1: "9d863c46f09d040344d9ccae1c29231995ae1f5d",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_Poland_(normative).svg",
    author: "Mareklug (Wikimedia Commons), colours converted by DeJotPe from the act's CIE values",
    license: "public-domain",
    licenseBasis: "Commons: PD-self, Polishsymbol",
    attribution: "",
    proportions: { width: 8, height: 5 },
    checkedAgainst: [
      "Act of 31 January 1980 on the arms, colours and anthem of the Republic of Poland and on state seals (Dz. U. 1980 nr 7 poz. 18), with its annexes: two equal horizontal stripes, white over red; the flag at 5:8; the colours as CIE 1976 coordinates, white x 0.315, y 0.320, Y 82.0 (ΔE 4.0), red x 0.570, y 0.305, Y 16.0 (ΔE 8.0), illuminant C",
      "Resolution of the joined chambers of the Sejm of the Kingdom of Poland, 7 February 1831, on the national cockade (white with red, the colours of the arms of the Kingdom of Poland and the Grand Duchy of Lithuania), Polish State Archives: https://pamiecpolski.archiwa.gov.pl/uchwala-sejmu-krolestwa-polskiego-z-7-lutego-1831-r/",
    ],
    checked:
      "White over red in equal halves at 5:8: the file is 1280 by 800 with bands of 400. " +
      "The act gives its colours only as CIE coordinates with a permitted deviation, and no official sRGB value is published; the file's white #E9E8E7 and red #D4213D are a conversion of those coordinates to sRGB, " +
      "and were re-checked here: converted back, they lie ΔE*uv 3.0 and 2.4 from the act's colours, inside its tolerances of 4.0 and 8.0 (a direct conversion gives #EDE9E5 and #D7213E). " +
      "The common Commons file Flag_of_Poland.svg draws pure white and crimson #DC143C, whose white falls outside the act's tolerance, so it was not used. " +
      "Why it represents the people: white and red are the Poles' own colours from the Sejm's resolution of 1831, carried through the partitions and the uprisings of 1830 and 1863 when Poland had no state, never the partitioning powers', and the national flag from 1919; the colours were unspecified before 1980.",
  },
  "scotland-flag": {
    kind: "published",
    format: "svg",
    sha1: "c1cbff0b38aab01c2b93e1f2ccea8e70ed27722b",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_Scotland.svg",
    author: "Traditional design; author of the drawing unknown (Wikimedia Commons)",
    license: "public-domain",
    licenseBasis: "Commons: PD-flag, Insignia",
    attribution: "",
    proportions: { width: 5, height: 3 },
    checkedAgainst: [
      "Lord Lyon's register (1672): \"Azure a cross of St Andrew Argent\", as quoted by the Flag Institute",
      "Flag Institute, UK Flag Registry, \"Scotland\" (UNKG0101): aspect ratio 3:5, Pantone blue 300 and white: https://www.flaginstitute.org/wp/flags/scotland/",
      "Scottish Parliament Education, Culture and Sport Committee recommendation (2003): Pantone 300 as the optimum blue",
      "Flags of the World, \"Colour and Design of the Scottish Flag\": the saltire one fifth of the flag's hoist wide; no fixed ratio (3:5, 1:2, and 4:5 by the Lord Lyon's office): https://www.crwflags.com/fotw/flags/gb-s-des.html",
    ],
    checked:
      "A white saltire from corner to corner on blue, its arms one fifth of the hoist wide: the file is 1000 by 600 with both diagonals stroked 120 wide. " +
      "Blue #005EB8 is Pantone's sRGB value for 300 C, the 2003 recommendation; white #FFFFFF. " +
      "No ratio is fixed: 3:5 is the Flag Institute's and the Ministry of Defence's, while 1:2 is common and the Lord Lyon's office suggests 4:5. The talk page's only design question (2009) was the ratio, left open for that reason. " +
      "The shade was unspecified before 2003: flags of the 1870s-1900s were often navy, and tradition called for a lighter azure, so Pantone 300 is the flag's one specified shade. " +
      "It represents the Scottish people: Scotland's own emblem from the 13th century, as distinct from the Union flag of the United Kingdom state.",
  },
  "slovene-tricolour": {
    kind: "published",
    format: "svg",
    sha1: "d02998807d65f0749a0fbe7183e73321ed54ef9a",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_the_Slovene_Nation.svg",
    author: "Makaristos (Wikimedia Commons)",
    license: "public-domain",
    licenseBasis: "Commons: PD-ineligible",
    attribution: "",
    proportions: { width: 2, height: 1 },
    checkedAgainst: [
      "Act on the Coat of Arms, Flag and Anthem of the Republic of Slovenia and on the Slovene National Flag (Uradni list RS 67/1994, 27 October 1994), article 3 and the colour annex",
      "Constitutional Amendment C, 24 June 1991 (Uradni list RS 1/1991), point 2: the state flag is the white-blue-red Slovene national flag with the arms",
      "National Assembly of Slovenia, \"Državni simboli\": https://www.dz-rs.si/wps/portal/Home/odz/ureditev/drzavniSimboli",
      "Government of Slovenia, \"Državni simboli\", with its flag artwork and CMYK values: https://www.gov.si/teme/drzavni-simboli/",
    ],
    checked:
      "The act's national flag: white, blue, red in equal horizontal thirds at 1:2. The file is 1200 by 600 (viewBox 6 by 3) with bands of 1, white over blue over red. " +
      "The act names its colours only in SCOTDIC textile codes and the government page adds CMYK; the government's own flag artwork on that page draws them as #FFFFFF, #0000FF and #FF0000, " +
      "and the file renders exactly those (its blue band's style #0000ff overrides the #005CE5 fill attribute; rendered and measured). " +
      "The flag had no statutory design before 1991: from 1848 it was the white-blue-red of the Carniolan arms with no set ratio or shade, so the 1994 act's form of it is the one recorded.",
  },
  "slovenia-flag": {
    kind: "published",
    format: "svg",
    sha1: "e303bd704bf87d97b874f4c34e1877aafa7eda33",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_Slovenia.svg",
    author: "Marko Pogačnik (design); vectorized by Achim1999 (Wikimedia Commons)",
    license: "public-domain",
    licenseBasis: "Commons: PD-Slovenia, insignia",
    attribution: "",
    proportions: { width: 2, height: 1 },
    checkedAgainst: [
      "Constitutional Amendment C, 24 June 1991 (Uradni list RS 1/1991), points 1 and 2",
      "Act on the Coat of Arms, Flag and Anthem of the Republic of Slovenia and on the Slovene National Flag (Uradni list RS 67/1994, 27 October 1994), with its geometric and colour rules for the arms and the flag",
      "Government of Slovenia, \"Državni simboli\", and its official flag artwork (Zastava-Republike-Slovenije.pdf and .png): https://www.gov.si/teme/drzavni-simboli/",
    ],
    checked:
      "Ratio 1:2, white, blue and red thirds; the arms centred at a quarter of the length on the white-blue line, half in each field, as high as one stripe: the file is viewBox 240 by 120 with the arms centred at (60, 40) and 40 high. " +
      "The arms: a shield with white Triglav on blue, two wavy blue lines beneath, three gold six-pointed stars in a downward triangle, red borders on the sides. " +
      "Rendered at the size of the government's official PNG and compared pixel by pixel: identical but for 769 anti-aliased edge pixels of 2.8 million, and the same colours, #FFFFFF, #0000FF, #FF0000 and #FFFF00, as the official vector. " +
      "The act gives colours only as SCOTDIC codes and the government page adds CMYK; the Commons talk page's long shade dispute settled in 2022 on the official vector's colours, which the file uses.",
  },
  "sweden-flag": {
    kind: "published",
    format: "svg",
    sha1: "e2717718a2b2089843c6fc487d65cbe6fdceb9c3",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_Sweden.svg",
    author: "Jon Harald Søby and others (Wikimedia Commons)",
    license: "public-domain",
    licenseBasis: "Commons: PD-shape, insignia",
    attribution: "",
    proportions: { width: 8, height: 5 },
    checkedAgainst: [
      "Lag (1982:269) om Sveriges flagga: a yellow cross on a blue field, fields 5:2:9 lengthwise and 4:2:4 in height",
      "Lag angående rikets flagga, 22 June 1906, and its bill (Proposition 1906:115): the same proportions, 16 to 10, first set in 1906",
      "Förordning (1983:826) med riktlinjer för färgnyanserna i Sveriges flagga: blue NCS 4055-R95B, yellow NCS 0580-Y10R",
      "Swedish Institute, Sweden brand visual identity, \"Colour\": Sweden Blue Standard #005293 (NCS 4055-R95B, PMS 301 C) and Sweden Yellow Standard #FECB00 (NCS 0580-Y10R, PMS 116 C), the flag's colours: https://sharingsweden.se/the-sweden-brand/brand-visual-identity/colour",
    ],
    checked:
      "A yellow cross on blue at 10:16, the cross one fifth of the height, its vertical arm after 5 of 16 parts: the file is viewBox 8 by 5 with the cross 1 wide, centred at x = 3 (2.5 to 3.5) and y = 2.5, i.e. 5:2:9 and 4:2:4. " +
      "Blue #005293 and yellow #FECB00 are exactly the sRGB values the Swedish Institute publishes for the flag's colours, with the ordinance's NCS codes. " +
      "The shades were set only in 1906 (\"light middle blue\" and \"golden yellow\") and in NCS from 1983; earlier flags varied. " +
      "Why it represents the people: Swedes identified with their own kingdom and its flag. From 1844 to 1905 the naval and merchant flags carried the union mark in the canton, but the flag Swedes flew as their own, restored as the only national flag in 1905-1906 and honoured on Sweden's flag day since 1916, is this plain cross flag.",
  },
  "wales-flag": {
    kind: "published",
    format: "svg",
    sha1: "c8eb8725ff8271995beff985be8f6d4c9ba26d78",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_Wales.svg",
    author: "Tobias Jakobs (Open Clipart), revised by Wikimedia Commons contributors",
    license: "public-domain",
    licenseBasis: "Commons: PD-OpenClipart, PD-UK-Gov, Insignia",
    attribution: "",
    proportions: { width: 5, height: 3 },
    checkedAgainst: [
      "The Queen's command of February 1959 that only the red dragon on a green and white flag be flown on government buildings in Wales, as quoted by Flags of the World",
      "Flag Institute, UK Flag Registry, \"Wales\" (UNKG0102): aspect ratio 3:5, Pantone white, green 354, red 186, and its image of the flag: https://www.flaginstitute.org/wp/flags/wales-flag/",
      "Flags of the World, \"Wales\" and \"Wales: History of Welsh Flags\": https://www.crwflags.com/fotw/flags/gb-wales.html, https://www.crwflags.com/fotw/flags/gb-wa-hs.html",
    ],
    checked:
      "A red dragon passant, dexter forepaw raised, tail raised, on white over green halves, at 3:5: the file is 800 by 480, white over green at 240. " +
      "Red #C8102E and green #00B140 are Pantone's sRGB values for 186 C and 354 C, the Flag Institute's colours; white #FFFFFF; the dragon has black outlines. " +
      "The 1959 command set no drawing, so the dragon exists in many drawings. This is one variant of several: the Open Clipart dragon Commons uses, chosen because it is the most widely reproduced and the one the Flag Institute's registry image draws. " +
      "Rendered and compared with the registry image, it is the same drawing, placed a little smaller on the field. " +
      "The file history has edit wars (2019-2022, 2026) over other drawings, one of them the 2005 original; each was reverted to this lineage, and the 2023 deletion request was kept. The talk page (2006) records that the dragon's form is not standardised. " +
      "It represents the Welsh people: the red dragon has been Wales's emblem since the Historia Brittonum (c. 829). " +
      "Where the forms differed, this is the one the Welsh chose for themselves: the green-and-white flag flown at eisteddfodau from 1858 and campaigned for from 1893. " +
      "In 1958 the Gorsedd of Bards asked for this flag in place of the government's augmented badge of 1953, and the 1959 command adopted it.",
  },
};

// The art's file name inside `symbol-art/`.
export function symbolArtFile(symbol: SymbolId, art: SymbolArt): string {
  return `${symbol}.${art.format}`;
}

// The file to show: the display file where a scan has one, else the art.
export function symbolDisplayFile(symbol: SymbolId, art: SymbolArt): string {
  return art.display === undefined ? symbolArtFile(symbol, art) : `${symbol}.display.png`;
}

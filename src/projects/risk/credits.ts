import { LICENSES, type Credit } from "@/shared/lib/credits";

export const RISK_CREDITS: readonly Credit[] = [
  {
    work: "World map borders: admin-0 countries and admin-1 provinces, redrawn as the board",
    author: "Natural Earth",
    license: LICENSES["public-domain"],
    source: "https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/",
    attribution: "",
  },
  {
    work: "Cinzel typeface",
    author: "Natanael Gama",
    license: LICENSES["ofl-1.1"],
    source: "https://fonts.google.com/specimen/Cinzel",
    attribution: "",
  },
];

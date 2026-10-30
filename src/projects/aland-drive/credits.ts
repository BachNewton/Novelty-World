import { LICENSES, type Credit } from "@/shared/lib/credits";

export const ALAND_DRIVE_CREDITS: readonly Credit[] = [
  {
    work: "Elevation model 2 m (terrain heights and baked shading of Åland)",
    author: "National Land Survey of Finland",
    license: LICENSES["cc-by-4.0"],
    source: "https://www.maanmittauslaitos.fi/en/maps-and-spatial-data/datasets-and-interfaces/product-descriptions/elevation-model-2-m",
    attribution: "Contains data from the National Land Survey of Finland Elevation model 2 m, licensed under CC BY 4.0",
  },
  {
    work: "Roads and building footprints of Åland, reprojected and clipped to the game's tiles; those tiles' road and building files are offered under the same licence",
    author: "OpenStreetMap contributors",
    license: LICENSES["odbl-1.0"],
    source: "https://www.openstreetmap.org/copyright",
    attribution: "© OpenStreetMap contributors",
  },
];

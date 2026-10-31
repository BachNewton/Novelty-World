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
    work: "Orthophotos of Åland (the colour of the land and of roofs)",
    author: "National Land Survey of Finland",
    license: LICENSES["cc-by-4.0"],
    source: "https://www.maanmittauslaitos.fi/en/maps-and-spatial-data/datasets-and-interfaces/product-descriptions/orthophotos",
    attribution: "Contains data from the National Land Survey of Finland Orthophotos, licensed under CC BY 4.0",
  },
  {
    work: "Laser scanning data of Åland (where trees stand, how tall, and the height of generated buildings)",
    author: "National Land Survey of Finland",
    license: LICENSES["cc-by-4.0"],
    source: "https://www.maanmittauslaitos.fi/en/maps-and-spatial-data/datasets-and-interfaces/product-descriptions/laser-scanning-data",
    attribution: "Contains data from the National Land Survey of Finland Laser scanning data, licensed under CC BY 4.0",
  },
  {
    work: "Buildings 3D of Åland (real building shapes)",
    author: "National Land Survey of Finland",
    license: LICENSES["cc-by-4.0"],
    source: "https://www.maanmittauslaitos.fi/en/maps-and-spatial-data/expert-users/product-descriptions/buildings-3d",
    attribution: "Contains data from the National Land Survey of Finland Buildings 3D, licensed under CC BY 4.0",
  },
  {
    work: "Topographic Database of Åland (building footprints and classes)",
    author: "National Land Survey of Finland",
    license: LICENSES["cc-by-4.0"],
    source: "https://www.maanmittauslaitos.fi/en/maps-and-spatial-data/datasets-and-interfaces/product-descriptions/topographic-database",
    attribution: "Contains data from the National Land Survey of Finland Topographic Database, licensed under CC BY 4.0",
  },
  {
    work: "Roads of Åland and building outlines kept beside them, reprojected and clipped to the game's tiles; those tiles' road and building files are offered under the same licence",
    author: "OpenStreetMap contributors",
    license: LICENSES["odbl-1.0"],
    source: "https://www.openstreetmap.org/copyright",
    attribution: "© OpenStreetMap contributors",
  },
  {
    work: "Finnish road sign designs (the shapes, symbols and colours of the road signs)",
    author: "Finnish Transport Infrastructure Agency and Traficom",
    license: LICENSES["public-domain"],
    source: "https://commons.wikimedia.org/wiki/File:Finland_road_sign_A20.1.svg",
    attribution: "",
  },
  {
    work: "Finnish road sign lettering (the letters and digits on the road signs)",
    author: "Traficom",
    license: LICENSES["all-rights-reserved"],
    source: "https://www.traficom.fi/files/media/regulation/LIITE_11_Liikenne-_ja_viestint%C3%A4viraston_tieliikennemerkkien_kirjasintyypin_mitoitus_11.pdf",
    attribution: "",
  },
];

// Writes `art/landmarks/sites.json`, the pipeline's copy of where the churches and landmarks stand and what they replace,
// from the art (`art/landmarks/sites.ts`). Run it after moving a site or changing a far version; a test fails until then.
//
//   npx tsx src/projects/aland-drive/tools/landmark-sites.ts   (from the repo root)

import { writeFileSync } from "node:fs";
import { siteRecords } from "../art/landmarks/sites";

const records = siteRecords();
writeFileSync("src/projects/aland-drive/art/landmarks/sites.json", `[\n${records.map((record) => JSON.stringify(record)).join(",\n")}\n]\n`);
console.log(`${records.length} sites`);

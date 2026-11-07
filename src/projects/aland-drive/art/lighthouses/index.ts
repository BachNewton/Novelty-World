export type { LighthouseArt } from "./kit";
import { FLOTJAN } from "./flotjan";
import { HOGSTEN } from "./hogsten";
import { KOBBA_KLINTAR } from "./kobba-klintar";
import { LAGSKAR } from "./lagskar";
import { LEDSKAR } from "./ledskar";
import { MARHALLAN } from "./marhallan";
import { MARKET } from "./market";
import { NYHAMN } from "./nyhamn";
import { SALSKAR } from "./salskar";
import { SJOKVARTERET } from "./sjokvarteret";

/** Every landmark lighthouse, by the id the game places it by. */
export const LIGHTHOUSES = {
  market: MARKET,
  salskar: SALSKAR,
  lagskar: LAGSKAR,
  flotjan: FLOTJAN,
  nyhamn: NYHAMN,
  marhallan: MARHALLAN,
  "kobba-klintar": KOBBA_KLINTAR,
  ledskar: LEDSKAR,
  hogsten: HOGSTEN,
  sjokvarteret: SJOKVARTERET,
} as const;

export type LighthouseId = keyof typeof LIGHTHOUSES;

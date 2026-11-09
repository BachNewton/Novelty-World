import type { ExteriorId } from "../art/dealers";
import type { DealerInterior } from "./interior";

/*
 * Every place that sells cars, by its site in `DEALER_SITES` (`art/dealers/index.ts`): the site puts its door on the
 * island, and `load` builds its interior, fetched only on entering so no room is in the first download. A new
 * dealership is a line here, its site, and its art returning a `DealerInterior`.
 */

export interface Dealership {
  site: ExteriorId;
  load: () => Promise<DealerInterior>;
}

// Today's rooms are the first drafts in `art/dealers/interiors.ts`, read into the definition by `drafts.ts` until
// their art is rebuilt to it.
const draft = (site: Parameters<typeof import("./drafts").draftInterior>[0]) => async () => (await import("./drafts")).draftInterior(site);

export const DEALERSHIPS: readonly Dealership[] = [
  { site: "waterfront-showroom", load: draft("waterfront-showroom") },
  { site: "town-dealer", load: draft("town-dealer") },
  { site: "village-garage", load: draft("village-garage") },
  { site: "used-lot", load: draft("used-lot") },
];

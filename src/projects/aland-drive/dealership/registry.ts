import { loadInterior, type ExteriorId } from "../art/dealers";
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

export const DEALERSHIPS: readonly Dealership[] = [
  { site: "premium-showroom", load: () => loadInterior("premium-showroom") },
  { site: "town-dealer", load: () => loadInterior("town-dealer") },
  { site: "village-garage", load: () => loadInterior("village-garage") },
  { site: "used-lot", load: () => loadInterior("used-lot") },
];

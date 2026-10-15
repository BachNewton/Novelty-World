import type { TerritoryId } from "../map";
import { territoryName } from "./describe";

/** A territory's name as the board prints it under its marker: short enough that neighbours'
 *  names never meet. The full name is the marker's accessible name and tooltip. */
const SHORT_NAMES: Partial<Record<TerritoryId, string>> = {
  "northwest-territory": "NW Terr.",
  "western-united-states": "W. US",
  "eastern-united-states": "E. US",
  "central-america": "C. Amer.",
  "great-britain": "Britain",
  "scandinavia": "Scandin.",
  "northern-europe": "N. Europe",
  "western-europe": "W. Europe",
  "southern-europe": "S. Europe",
  "north-africa": "N. Africa",
  "east-africa": "E. Africa",
  "south-africa": "S. Africa",
  "afghanistan": "Afghan.",
  "middle-east": "Mid. East",
  "new-guinea": "N. Guinea",
  "western-australia": "W. Aus.",
  "eastern-australia": "E. Aus.",
};

export function shortName(id: TerritoryId): string {
  return SHORT_NAMES[id] ?? territoryName(id);
}

import { COTTAGE } from "./cottage";
import { FARMHOUSE } from "./farmhouse";
import type { Home } from "./home";

export { carSize, carSizes, fitCars, parkedState, type CarSize, type CarSlot, type GarageFit } from "./garage";
export { trianglesOf, type Home, type HomeSite } from "./home";
export { interiorMaterial, type InteriorMaterial, type RoomLights } from "./material";
export type { Room, RoomCamera } from "./rooms";

/** The ladder, cheapest first. */
export const HOMES: readonly Home[] = [COTTAGE, FARMHOUSE];

import { nearFar, type ArtModel } from "../catalogue";
import { HOMES } from "./index";

/** Every home the gallery shows: its outside at both details, and each of its rooms. */
export const artModels = (): ArtModel[] =>
  HOMES.flatMap((home) => [
    nearFar(home.id, home.exterior()),
    ...home.interior().map((room): ArtModel => ({ name: `${home.id} ${room.id}`, geometries: { room: room.geometry }, groundY: null })),
  ]);

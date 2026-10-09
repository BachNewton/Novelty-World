import type { RoomDefinition } from "../room";
import { CHAPEL } from "./chapel";
import { DRAWING_ROOM } from "./drawing-room";
import { ENTRANCE_HALL } from "./entrance-hall";
import { FOYER } from "./foyer";
import { GRAND_STAIRCASE } from "./grand-staircase";
import { LIBRARY } from "./library";
import { UPPER_LANDING } from "./upper-landing";

/** Every room the art bench can show, in the order it lists them. */
export const BENCH_ROOMS: readonly RoomDefinition[] = [DRAWING_ROOM, CHAPEL, LIBRARY, GRAND_STAIRCASE, FOYER, ENTRANCE_HALL, UPPER_LANDING];

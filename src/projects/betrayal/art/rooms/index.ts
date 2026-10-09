import type { RoomDefinition } from "../room";
import { CHAPEL } from "./chapel";
import { CHASM } from "./chasm";
import { DRAWING_ROOM } from "./drawing-room";
import { ENTRANCE_HALL } from "./entrance-hall";
import { FOYER } from "./foyer";
import { FURNACE_ROOM } from "./furnace-room";
import { GRAND_STAIRCASE } from "./grand-staircase";
import { GRAVEYARD } from "./graveyard";
import { KITCHEN } from "./kitchen";
import { LIBRARY } from "./library";
import { MASTER_BEDROOM } from "./master-bedroom";
import { MYSTIC_ELEVATOR } from "./mystic-elevator";
import { UNDERGROUND_LAKE } from "./underground-lake";
import { UPPER_LANDING } from "./upper-landing";

/** Every room the art bench can show, in the order it lists them. */
export const BENCH_ROOMS: readonly RoomDefinition[] = [DRAWING_ROOM, CHAPEL, LIBRARY, GRAND_STAIRCASE, FOYER, ENTRANCE_HALL, UPPER_LANDING, MASTER_BEDROOM, CHASM, MYSTIC_ELEVATOR, FURNACE_ROOM, KITCHEN, GRAVEYARD, UNDERGROUND_LAKE];

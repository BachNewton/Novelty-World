import type { RoomDefinition } from "../room";
import { BASEMENT_LANDING } from "./basement-landing";
import { CATACOMBS } from "./catacombs";
import { CHAPEL } from "./chapel";
import { CHASM } from "./chasm";
import { CREAKY_HALLWAY } from "./creaky-hallway";
import { DRAWING_ROOM } from "./drawing-room";
import { DUSTY_HALLWAY } from "./dusty-hallway";
import { ENTRANCE_HALL } from "./entrance-hall";
import { FOYER } from "./foyer";
import { FURNACE_ROOM } from "./furnace-room";
import { GRAND_STAIRCASE } from "./grand-staircase";
import { GRAVEYARD } from "./graveyard";
import { KITCHEN } from "./kitchen";
import { LIBRARY } from "./library";
import { MASTER_BEDROOM } from "./master-bedroom";
import { MYSTIC_ELEVATOR } from "./mystic-elevator";
import { STAIRS_FROM_BASEMENT } from "./stairs-from-basement";
import { STATUARY_CORRIDOR } from "./statuary-corridor";
import { UNDERGROUND_LAKE } from "./underground-lake";
import { UPPER_LANDING } from "./upper-landing";
import { WINE_CELLAR } from "./wine-cellar";
import { TOWER } from "./tower";
import { PENTAGRAM_CHAMBER } from "./pentagram-chamber";
import { JUNK_ROOM } from "./junk-room";
import { ATTIC } from "./attic";

/** Every room the art bench can show, in the order it lists them. */
export const BENCH_ROOMS: readonly RoomDefinition[] = [DRAWING_ROOM, CHAPEL, LIBRARY, GRAND_STAIRCASE, FOYER, ENTRANCE_HALL, UPPER_LANDING, MASTER_BEDROOM, CHASM, MYSTIC_ELEVATOR, FURNACE_ROOM, KITCHEN, GRAVEYARD, UNDERGROUND_LAKE, BASEMENT_LANDING, STAIRS_FROM_BASEMENT, WINE_CELLAR, CATACOMBS, CREAKY_HALLWAY, TOWER, PENTAGRAM_CHAMBER, DUSTY_HALLWAY, JUNK_ROOM, STATUARY_CORRIDOR, ATTIC];

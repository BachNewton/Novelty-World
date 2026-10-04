import type { RoomDefinition } from "../room";
import { CHAPEL } from "./chapel";
import { DRAWING_ROOM } from "./drawing-room";
import { LIBRARY } from "./library";

/** Every room the art bench can show, in the order it lists them. */
export const BENCH_ROOMS: readonly RoomDefinition[] = [DRAWING_ROOM, CHAPEL, LIBRARY];

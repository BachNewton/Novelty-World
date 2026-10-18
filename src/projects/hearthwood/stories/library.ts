import { A_CHILL } from "./a-chill";
import { ACHING_HANDS } from "./aching-hands";
import { BELL_EWE } from "./bell-ewe";
import { CANDLE_KEEPER } from "./candle-keeper";
import { CAT_WHO_CHOSE } from "./cat-who-chose";
import { EINOS_SOUP } from "./einos-soup";
import { FAR_SHORE } from "./far-shore";
import { HONEY_THIEF } from "./honey-thief";
import { LONG_ROAD } from "./long-road";
import { OLD_REINDEER } from "./old-reindeer";
import { ON_THE_SHORE } from "./on-the-shore";
import { PRESERVES } from "./preserves";
import { SAUNA_ELF } from "./sauna-elf";
import { SNOW_LIGHT } from "./snow-light";
import { SORE_HOOF } from "./sore-hoof";
import { STILL_BELL } from "./still-bell";
import type { Story } from "./story";
import { THE_PUP } from "./the-pup";
import { TRAIL_FOOD } from "./trail-food";
import { TURNED_AROUND } from "./turned-around";
import { WINKING_PIKE } from "./winking-pike";
import { WINTER_TEA } from "./winter-tea";

/*
 * Every story there is: a new one joins the world by being written in a file
 * of its own and added here. Who carries which is the people's generation
 * (`engine/people.ts`), by who they are and where they stand.
 */

export const STORIES: readonly Story[] = [
  BELL_EWE,
  THE_PUP,
  PRESERVES,
  WINKING_PIKE,
  SAUNA_ELF,
  CAT_WHO_CHOSE,
  EINOS_SOUP,
  LONG_ROAD,
  CANDLE_KEEPER,
  SNOW_LIGHT,
  TURNED_AROUND,
  ON_THE_SHORE,
  TRAIL_FOOD,
  HONEY_THIEF,
  STILL_BELL,
  FAR_SHORE,
  SORE_HOOF,
  OLD_REINDEER,
  A_CHILL,
  WINTER_TEA,
  ACHING_HANDS,
];

/** The story the person nearest camp carries, so Elliott meets someone early with help they can give at once. */
export const FIRST_STORY = CAT_WHO_CHOSE.id;

export function storyOf(id: string): Story {
  const story = STORIES.find((s) => s.id === id);
  if (!story) throw new Error(`No story ${id}`);
  return story;
}

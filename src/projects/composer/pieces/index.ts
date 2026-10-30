import { ANALYSIS as BACH_ANALYSIS } from "./bach-rising-sixth.analysis";
import { ANALYSIS as CHOPIN_ANALYSIS } from "./chopin-undertow.analysis";
import { ANALYSIS as DEBUSSY_ANALYSIS } from "./debussy-tide-left.analysis";
import { ANALYSIS as BALLOON_ANALYSIS } from "./kirkhope-patchwork-balloon.analysis";
import { ANALYSIS as SPOON_ANALYSIS } from "./kirkhope-spoon-thief.analysis";
import { ANALYSIS as TURNIP_ANALYSIS } from "./kirkhope-turnip-fair.analysis";
import { ANALYSIS as LISZT_ANALYSIS } from "./liszt-drowned-bell.analysis";
import { ANALYSIS as CEDARBELL_ANALYSIS } from "./pokemon-cedarbell-town.analysis";
import { ANALYSIS as PINWHEEL_ANALYSIS } from "./pokemon-pinwheel-ridge.analysis";
import { ANALYSIS as TIDEWHEEL_ANALYSIS } from "./pokemon-tidewheel-gym.analysis";
import { ANALYSIS as RIVER_ANALYSIS } from "./rachmaninoff-river-under-ice.analysis";
import { eventsScore } from "../formats/events";
import { RISING_SIXTH_BAND } from "./bach-rising-sixth.band";
import { TURNIP_FAIR_BAND } from "./kirkhope-turnip-fair.band";
import { SPOON_THIEF_BAND } from "./kirkhope-spoon-thief.band";
import { PATCHWORK_BALLOON_BAND } from "./kirkhope-patchwork-balloon.band";
import { CEDARBELL_TOWN_BAND } from "./pokemon-cedarbell-town.band";
import { PINWHEEL_RIDGE_BAND } from "./pokemon-pinwheel-ridge.band";
import { TIDEWHEEL_GYM_BAND } from "./pokemon-tidewheel-gym.band";
import { TIDEWHEEL_GYM_SKETCHBOOK_BAND } from "./pokemon-tidewheel-gym.sketchbook.band";
import type { Band } from "../synth/band";
import type { Analysis } from "../analysis";
import type { Piece } from "../types";
import { BACH_RISING_SIXTH_SOURCE } from "./bach-rising-sixth";
import { CHOPIN_UNDERTOW_SOURCE } from "./chopin-undertow";
import { UNDERTOW_BAND } from "./chopin-undertow.band";
import { DEBUSSY_TIDE_LEFT_SOURCE } from "./debussy-tide-left";
import { TIDE_LEFT_BAND } from "./debussy-tide-left.band";
import { KIRKHOPE_PATCHWORK_BALLOON_SOURCE } from "./kirkhope-patchwork-balloon";
import { KIRKHOPE_SPOON_THIEF_SOURCE } from "./kirkhope-spoon-thief";
import { KIRKHOPE_TURNIP_FAIR_SOURCE } from "./kirkhope-turnip-fair";
import { LISZT_DROWNED_BELL_SOURCE } from "./liszt-drowned-bell";
import { DROWNED_BELL_BAND } from "./liszt-drowned-bell.band";
import { POKEMON_CEDARBELL_TOWN_SOURCE } from "./pokemon-cedarbell-town";
import { POKEMON_PINWHEEL_RIDGE_SOURCE } from "./pokemon-pinwheel-ridge";
import { POKEMON_TIDEWHEEL_GYM_SOURCE } from "./pokemon-tidewheel-gym";
import { RACHMANINOFF_RIVER_UNDER_ICE_SOURCE } from "./rachmaninoff-river-under-ice";
import { RIVER_BAND } from "./rachmaninoff-river-under-ice.band";
import { RIVER_SKETCHBOOK_BAND } from "./rachmaninoff-river-under-ice.sketchbook.band";

function titleOf(source: string): string {
  const match = /^title:\s*(.+)$/m.exec(source);
  if (match === null) throw new Error("Composer: a piece with no title");
  return match[1].trim();
}

function piece(id: string, shelf: { genre: string; style: string; after: string }, source: string, band: Band, analysis: Analysis, otherBands?: readonly Band[]): Piece {
  return { id, ...shelf, title: titleOf(source), score: () => eventsScore(source), band, otherBands, analysis };
}

const KIRKHOPE = { genre: "Video game", style: "Grant Kirkhope" };
const POKEMON = { genre: "Video game", style: "Pokémon" };
const ROMANTIC_PIANO = { genre: "Classical", style: "Romantic piano" };

export const PIECES: readonly Piece[] = [
  piece("kirkhope-turnip-fair", { ...KIRKHOPE, after: "Grant Kirkhope" }, KIRKHOPE_TURNIP_FAIR_SOURCE, TURNIP_FAIR_BAND, TURNIP_ANALYSIS),
  piece("kirkhope-spoon-thief", { ...KIRKHOPE, after: "Grant Kirkhope" }, KIRKHOPE_SPOON_THIEF_SOURCE, SPOON_THIEF_BAND, SPOON_ANALYSIS),
  piece("kirkhope-patchwork-balloon", { ...KIRKHOPE, after: "Grant Kirkhope" }, KIRKHOPE_PATCHWORK_BALLOON_SOURCE, PATCHWORK_BALLOON_BAND, BALLOON_ANALYSIS),
  piece("debussy-tide-left", { genre: "Classical", style: "Impressionist", after: "Debussy" }, DEBUSSY_TIDE_LEFT_SOURCE, TIDE_LEFT_BAND, DEBUSSY_ANALYSIS),
  piece("bach-rising-sixth", { genre: "Classical", style: "Baroque", after: "Bach" }, BACH_RISING_SIXTH_SOURCE, RISING_SIXTH_BAND, BACH_ANALYSIS),
  piece("liszt-drowned-bell", { ...ROMANTIC_PIANO, after: "Liszt" }, LISZT_DROWNED_BELL_SOURCE, DROWNED_BELL_BAND, LISZT_ANALYSIS),
  piece("rachmaninoff-river-under-ice", { genre: "Classical", style: "Romantic concerto", after: "Rachmaninoff" }, RACHMANINOFF_RIVER_UNDER_ICE_SOURCE, RIVER_BAND, RIVER_ANALYSIS, [RIVER_SKETCHBOOK_BAND]),
  piece("chopin-undertow", { ...ROMANTIC_PIANO, after: "Chopin" }, CHOPIN_UNDERTOW_SOURCE, UNDERTOW_BAND, CHOPIN_ANALYSIS),
  piece("pokemon-pinwheel-ridge", { ...POKEMON, after: "Pokémon Gen I" }, POKEMON_PINWHEEL_RIDGE_SOURCE, PINWHEEL_RIDGE_BAND, PINWHEEL_ANALYSIS),
  piece("pokemon-cedarbell-town", { ...POKEMON, after: "Pokémon Gen II" }, POKEMON_CEDARBELL_TOWN_SOURCE, CEDARBELL_TOWN_BAND, CEDARBELL_ANALYSIS),
  piece("pokemon-tidewheel-gym", { ...POKEMON, after: "Pokémon Gen III" }, POKEMON_TIDEWHEEL_GYM_SOURCE, TIDEWHEEL_GYM_BAND, TIDEWHEEL_ANALYSIS, [TIDEWHEEL_GYM_SKETCHBOOK_BAND]),
];

export interface Shelf {
  name: string;
  pieces: Piece[];
}

// The pieces in shelves by genre and style, each in alphabetical order.
export function shelve(pieces: readonly Piece[]): Shelf[] {
  const shelves = new Map<string, Piece[]>();
  for (const piece of pieces) {
    const name = `${piece.genre} · ${piece.style}`;
    shelves.set(name, [...(shelves.get(name) ?? []), piece]);
  }
  return [...shelves]
    .map(([name, shelf]) => ({ name, pieces: shelf.sort((a, b) => a.title.localeCompare(b.title)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

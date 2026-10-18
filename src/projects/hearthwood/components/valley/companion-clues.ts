import { animalGround, ofSpecies } from "../../gameplay/behaviour";
import type { Leader } from "../../gameplay/companions";
import { companionBy, finishSniff, noseDown, noticing, stepNoticing, stepSniff, type ClueAt, type Helper, type Noticing } from "../../gameplay/noticing";
import { offTheGround } from "../../gameplay/riding";
import { pitchedSite } from "./camping";
import { followingAnimals, type Companionship, type Help } from "./companionship";
import { examinable, type Mysteries } from "./mysteries";

/*
 * The companions helping with the mysteries, between the animals, the clues
 * and the probe: the clues there are to examine round Elliott, read from the
 * mysteries, and the companions following them, read from the animals, put
 * through the noticing rules with the animals' steps, so a companion off to
 * a clue is stepped by them instead of following; a dog's nose eased down
 * as it goes. Nothing is noticed while Elliott is by camp's fire, where the
 * companions settle.
 */

export interface CompanionClues {
  mysteries: Mysteries;
  companionship: Companionship;
  state: Noticing;
  /** Elliott as the animals last stepped. */
  leader: Leader | null;
}

/** Elliott within this of a pitched fire, in metres, and the companions keep to it. */
const BY_THE_FIRE = 10;
/** How quickly a dog's nose goes down to a scent and comes up again, per second. */
const NOSE_EASE = 5;

export function createCompanionClues(mysteries: Mysteries, companionship: Companionship): CompanionClues {
  return { mysteries, companionship, state: noticing(companionship.time), leader: null };
}

/** The clues there are to examine round Elliott: none while they are by the fire. */
function cluesAround(clues: CompanionClues, leader: Leader): ClueAt[] {
  const fire = pitchedSite(clues.companionship.hearth.camping);
  if (fire && Math.hypot(fire.x - leader.x, fire.z - leader.z) < BY_THE_FIRE) return [];
  return [...clues.mysteries.live.values()].filter((live) => examinable(clues.mysteries, live)).map((live) => ({ key: live.key, x: live.placed.x, z: live.placed.z }));
}

/** The companions helping join the animals' steps, until the returned function takes them out again: the scene's to call once it is up. */
export function joinCompanionClues(clues: CompanionClues): () => void {
  const { companionship, state } = clues;
  const help: Help = {
    step: (time, seconds, leader) => {
      clues.leader = leader;
      const following = followingAnimals(companionship);
      const helpers: Helper[] = following.map((a) => ({ key: a.key, nature: ofSpecies(a.nature), body: a.body, free: !(a.ride && offTheGround(a.ride)) && a.fetch === null }));
      stepNoticing(state, cluesAround(clues, leader), helpers, leader, (species) => animalGround(companionship.world, species), time);
      const k = 1 - Math.exp(-NOSE_EASE * seconds);
      for (const animal of following) {
        if (animal.look.species !== "dog") continue;
        const nose = animal.look.nose;
        nose.current += (noseDown(state.sniffs.get(animal.key), "dog") - nose.current) * k;
      }
    },
    animal: (animal, step) => {
      const sniff = state.sniffs.get(animal.key);
      if (!sniff || !clues.leader) return false;
      if (stepSniff(animal.body, sniff, ofSpecies(animal.nature), clues.leader, step.ground, step.obstacles, step.time, step.seconds) !== "done") return true;
      finishSniff(state, animal.key, step.time);
      return false;
    },
  };
  companionship.help = help;
  return () => {
    if (companionship.help === help) companionship.help = null;
  };
}

/** Whether a companion waits by a clue now, for its glints to brighten. */
export const companionByClue = (clues: CompanionClues, key: string) => companionBy(clues.state, key);

/** Each companion off to a clue: which, and whether going or by it. */
export function helping(clues: CompanionClues): { animal: string; clue: string; phase: "going" | "by" }[] {
  return [...clues.state.sniffs].map(([animal, sniff]) => ({ animal, clue: sniff.clue, phase: sniff.phase }));
}

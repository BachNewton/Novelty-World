/** Every shape of damaging weapon ability a player can hold in For The King
 *  II: how many slots it rolls, and its min and max shares of the attack
 *  value, in hundredths. Read from the game's weapon data (StreamingAssets/
 *  Assets/Configs/JSON~/Things/Weapons.json, each ability's Rolls, MinValue
 *  and MaxValue), for the weapons a player can get: the droppable ones, those
 *  tagged for players or as quest rewards, the classes' starting weapons
 *  (Characters.json) and unarmed.
 *
 *  Left out on purpose: the Zodiac Tome's stun (3 slots) and the Saxum
 *  Sphere's area attack (4 slots), both 25% to 50%. That is a basic attack's
 *  ratio, so nearly every 3- or 4-slot basic attack would also fit them, and
 *  their lower floor would show every such attack's weakest rolls 1-2 low. The
 *  owner chose to read those numbers as the ordinary attack. */
const SHAPES_BY_ROLLS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0, 20], [0, 50], [0, 85], [0, 100], [50, 100]],
  2: [[0, 20], [0, 40], [0, 45], [0, 50], [0, 60], [0, 75], [0, 100], [0, 110], [0, 115], [0, 125], [50, 100]],
  3: [[0, 15], [0, 20], [0, 25], [0, 35], [0, 40], [0, 50], [0, 60], [0, 65], [0, 70], [0, 75], [0, 80], [0, 85], [0, 100], [0, 120], [0, 125], [0, 135], [25, 80], [50, 100]],
  4: [[0, 25], [0, 35], [0, 45], [0, 50], [0, 55], [0, 60], [0, 75], [0, 85], [0, 100], [0, 115], [0, 120], [0, 125], [0, 140], [0, 150], [0, 170], [25, 75], [25, 80], [50, 100]],
  5: [[0, 50], [0, 70], [0, 75], [0, 90], [0, 100], [0, 110], [0, 125], [0, 140], [0, 150], [0, 160], [0, 170], [50, 100]],
  6: [[0, 100], [0, 110], [0, 140], [0, 150]],
};

export interface AttackShape {
  rolls: number;
  min: number;
  max: number;
}

export const ATTACK_SHAPES: readonly AttackShape[] = Object.entries(SHAPES_BY_ROLLS).flatMap(([rolls, shapes]) =>
  shapes.map(([min, max]) => ({ rolls: Number(rolls), min, max })),
);

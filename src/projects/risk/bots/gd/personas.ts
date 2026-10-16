// GD's persona weights (its `DAIStats`, 0 to 100), as compiled into the game for the four personas
// it deals at Expert. Only the weights a classic game reads are kept: the claim, capital and
// objective weights belong to modes our rules don't have.

export type PersonaName = "defensive" | "continental" | "aggressive" | "stacker";

export interface Weights {
  risky: number;
  continentBonus: number;
  cardBonus: number;
  eliminatePlayer: number;
  focusLeadingPlayer: number;
  deployContinentOwnership: number;
  deployBorderWeakness: number;
  deployEnemyStrength: number;
  attackFromContinentOwnership: number;
  attackToContinentOwnership: number;
  attackContinentLoss: number;
  attackEnemyStrength: number;
  attackSuccessThreshold: number;
  attackSuccessDesperateThreshold: number;
  fortifyNoEnemiesPower: number;
  fortifyBorderWeakness: number;
  fortifyContinentOwnership: number;
  fortifyHumanRatio: number;
  fortifyEnemyStrength: number;
  fortifyUnitCount: number;
}

export const WEIGHTS: Readonly<Record<PersonaName, Readonly<Weights>>> = {
  defensive: {
    risky: 50,
    continentBonus: 25,
    cardBonus: 30,
    eliminatePlayer: 35,
    focusLeadingPlayer: 30,
    deployContinentOwnership: 30,
    deployBorderWeakness: 70,
    deployEnemyStrength: 45,
    attackFromContinentOwnership: 20,
    attackToContinentOwnership: 45,
    attackContinentLoss: 40,
    attackEnemyStrength: 95,
    attackSuccessThreshold: 80,
    attackSuccessDesperateThreshold: 40,
    fortifyNoEnemiesPower: 80,
    fortifyBorderWeakness: 50,
    fortifyContinentOwnership: 40,
    fortifyHumanRatio: 0,
    fortifyEnemyStrength: 70,
    fortifyUnitCount: 30,
  },
  continental: {
    risky: 60,
    continentBonus: 65,
    cardBonus: 25,
    eliminatePlayer: 45,
    focusLeadingPlayer: 65,
    deployContinentOwnership: 35,
    deployBorderWeakness: 60,
    deployEnemyStrength: 75,
    attackFromContinentOwnership: 30,
    attackToContinentOwnership: 60,
    attackContinentLoss: 45,
    attackEnemyStrength: 60,
    attackSuccessThreshold: 55,
    attackSuccessDesperateThreshold: 25,
    fortifyNoEnemiesPower: 80,
    fortifyBorderWeakness: 60,
    fortifyContinentOwnership: 60,
    fortifyHumanRatio: 0,
    fortifyEnemyStrength: 50,
    fortifyUnitCount: 40,
  },
  aggressive: {
    risky: 70,
    continentBonus: 45,
    cardBonus: 55,
    eliminatePlayer: 70,
    focusLeadingPlayer: 70,
    deployContinentOwnership: 15,
    deployBorderWeakness: 40,
    deployEnemyStrength: 95,
    attackFromContinentOwnership: 5,
    attackToContinentOwnership: 50,
    attackContinentLoss: 25,
    attackEnemyStrength: 30,
    attackSuccessThreshold: 45,
    attackSuccessDesperateThreshold: 10,
    fortifyNoEnemiesPower: 60,
    fortifyBorderWeakness: 35,
    fortifyContinentOwnership: 15,
    fortifyHumanRatio: 0,
    fortifyEnemyStrength: 30,
    fortifyUnitCount: 45,
  },
  stacker: {
    risky: 40,
    continentBonus: 50,
    cardBonus: 50,
    eliminatePlayer: 30,
    focusLeadingPlayer: 10,
    deployContinentOwnership: 0,
    deployBorderWeakness: 0,
    deployEnemyStrength: 0,
    attackFromContinentOwnership: 20,
    attackToContinentOwnership: 75,
    attackContinentLoss: 40,
    attackEnemyStrength: 60,
    attackSuccessThreshold: 99,
    attackSuccessDesperateThreshold: 45,
    fortifyNoEnemiesPower: 0,
    fortifyBorderWeakness: 0,
    fortifyContinentOwnership: 0,
    fortifyHumanRatio: 0,
    fortifyEnemyStrength: 0,
    fortifyUnitCount: 0,
  },
};

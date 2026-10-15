import type { RiskEngine } from "./contract";
import { referenceEngine } from "./engine";

/** The engine every real game plays on: online on the server and on a phone ahead of it, and a
 *  game on one device. It is the reference engine, obviously correct (`RULES.md`); the fast
 *  engine is for bot simulation only. */
export const ENGINE: RiskEngine = referenceEngine;

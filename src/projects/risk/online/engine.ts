import type { RiskEngine } from "../contract";
import { stubEngine } from "./stub-engine";

/** The engine online play runs on. The stand-in until the reference engine lands: swap this line. */
export const ENGINE: RiskEngine = stubEngine;

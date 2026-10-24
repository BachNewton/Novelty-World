import { ABSORPTION_STEP } from "./absorption";
import { ICE_STEP } from "./ice";
import { RIPPLES_STEP } from "./ripples";
import { SHORE_STEP } from "./shore";
import { SKY_REFLECTION_STEP } from "./sky-reflection";
import type { WaterStep } from "./surface";

/**
 * The water features' steps in the water's own material, in the order they
 * build the surface: the ripples bend it first; the colour from depth looks
 * through it to the bed; the sky's mirror is laid on; the shore's foam
 * goes over that; and ice covers everything under it.
 */
export const WATER_STEPS: readonly WaterStep[] = [RIPPLES_STEP, ABSORPTION_STEP, SKY_REFLECTION_STEP, SHORE_STEP, ICE_STEP];

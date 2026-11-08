import { describe, it } from "vitest";

// The art checks are tools for while a figure's or a room's art is being made, not tests every run needs, so they are
// opt-in: the explorers' and monsters' overlap, gait, clipping and cloth checks, and each room's overlap, room for the
// explorers and draw budget. Run them all with
//   BETRAYAL_ART_CHECKS=1 npx vitest run --config vitest.slow.config.ts src/projects/betrayal/art
export const artChecks = describe.runIf(process.env.BETRAYAL_ART_CHECKS);
export const artCheck = it.runIf(process.env.BETRAYAL_ART_CHECKS);

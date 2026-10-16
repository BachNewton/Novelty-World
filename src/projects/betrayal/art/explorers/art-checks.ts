import { describe, it } from "vitest";

// The explorer art checks (overlap, gait, clipping and the cloth checks) are tools for while a figure's art is
// being made, not tests every run needs, so they are opt-in:
//   BETRAYAL_ART_CHECKS=1 npx vitest run --config vitest.slow.config.ts src/projects/betrayal/art/explorers
export const artChecks = describe.runIf(process.env.BETRAYAL_ART_CHECKS);
export const artCheck = it.runIf(process.env.BETRAYAL_ART_CHECKS);

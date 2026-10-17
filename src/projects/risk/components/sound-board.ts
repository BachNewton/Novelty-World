import { createSoundBoard, createSoundSettings } from "@/shared/lib/sound";
import { RISK_SOUNDS } from "../ui/sounds";

/** Risk's mute and volume, kept in this browser. */
export const useRiskSoundSettings = createSoundSettings("risk");

/** Risk's sounds in the browser (the shared `sound/board.ts`), played at the settings of the
 *  moment. */
export const riskSounds = createSoundBoard(RISK_SOUNDS, () => useRiskSoundSettings.getState().settings);

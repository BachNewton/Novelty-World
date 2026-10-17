import { CALENDAR_SECTION } from "./calendar";
import { FEATURES_SECTION } from "./features";
import { QUALITY_SECTION } from "./quality";
import type { DebugSection } from "./section";
import { TIME_SECTION } from "./time";
import { WEATHER_INPUT_SECTION } from "./weather-input";

/** The ~ panel's sections, top to bottom. A section is added by writing its own file and listing it here. */
export const DEBUG_SECTIONS: readonly DebugSection[] = [TIME_SECTION, CALENDAR_SECTION, WEATHER_INPUT_SECTION, FEATURES_SECTION, QUALITY_SECTION];

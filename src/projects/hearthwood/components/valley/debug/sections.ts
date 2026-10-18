import { CALENDAR_SECTION } from "./calendar";
import { CAMERA_SECTION } from "./camera";
import { FEATURES_SECTION } from "./features";
import { QUALITY_SECTION } from "./quality";
import type { DebugSection } from "./section";
import { SKY_SECTION } from "./sky";
import { TIME_SECTION } from "./time";
import { WEATHER_SECTION } from "./weather";
import { WEATHER_INPUT_SECTION } from "./weather-input";

/** The ~ panel's sections, top to bottom. A section is added by writing its own file and listing it here. */
export const DEBUG_SECTIONS: readonly DebugSection[] = [CAMERA_SECTION, TIME_SECTION, CALENDAR_SECTION, SKY_SECTION, WEATHER_SECTION, WEATHER_INPUT_SECTION, FEATURES_SECTION, QUALITY_SECTION];

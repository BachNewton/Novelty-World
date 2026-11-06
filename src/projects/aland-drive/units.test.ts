import { describe, expect, it } from "vitest";
import { clockText, distanceText, speedNumber, speedText, temperatureText } from "./units";

describe("units the player reads", () => {
  it("turns a distance to tens of metres, then tenths of a kilometre", () => {
    expect(distanceText(437, "metric")).toBe("440 m");
    expect(distanceText(2460, "metric")).toBe("2.5 km");
  });

  it("turns a distance to fifty feet near, then tenths of a mile from a tenth of a mile", () => {
    expect(distanceText(100, "imperial")).toBe("350 ft");
    expect(distanceText(160, "imperial")).toBe("500 ft");
    expect(distanceText(161, "imperial")).toBe("0.1 mi");
    expect(distanceText(4000, "imperial")).toBe("2.5 mi");
  });

  it("gives speed in mph, and never flatters a speed trap's result", () => {
    expect(speedNumber(100, "imperial")).toBe(62);
    expect(speedText(160.9, "imperial")).toBe("99 mph");
    expect(speedText(119.9, "metric")).toBe("119 km/h");
  });

  it("gives temperature in Fahrenheit with a true minus below zero", () => {
    expect(temperatureText(-3, "metric")).toBe("−3°");
    expect(temperatureText(-3, "imperial")).toBe("27°");
    expect(temperatureText(-25, "imperial")).toBe("−13°");
  });

  it("gives a 12-hour clock with imperial, midnight and noon as 12", () => {
    expect(clockText(14.09, "metric")).toBe("14:05");
    expect(clockText(0.5, "imperial")).toBe("12:30 AM");
    expect(clockText(12, "imperial")).toBe("12:00 PM");
    expect(clockText(23.99, "imperial")).toBe("11:59 PM");
  });
});

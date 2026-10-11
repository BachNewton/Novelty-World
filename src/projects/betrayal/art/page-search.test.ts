import { afterEach, describe, expect, it } from "vitest";
import { stubCanvas } from "./headless";
import { pageSearch } from "./page-search";

describe("pageSearch", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("is empty where there is no page, even with the headless canvas's stand-in document, as in a worker", () => {
    stubCanvas();
    expect(pageSearch()).toBe("");
  });

  it("reads the page's query string", () => {
    Object.assign(globalThis, { window: { location: { search: "?water=shader" } } });
    expect(pageSearch()).toBe("?water=shader");
  });
});

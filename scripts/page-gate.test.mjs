import { describe, expect, it } from "vitest";
import { createGate, holdPages, startPageGate } from "./page-gate.mjs";

/** A gate of `size` and the order its requests were granted in. */
function gateOf(size) {
  const gate = createGate(size);
  const granted = [];
  const ask = (name, pages) => gate.ask(pages, () => granted.push(name));
  return { gate, granted, ask };
}

describe("the page gate", () => {
  it("never grants more pages than it holds", () => {
    const { gate, granted, ask } = gateOf(4);
    const two = ask("two", 2);
    ask("other two", 2);
    ask("four", 4);
    expect(granted).toEqual(["two", "other two"]);
    gate.leave(two);
    expect(granted).toEqual(["two", "other two"]);
  });

  // Otherwise the two-page tests on the other workers could take turns for ever.
  it("lets no later request pass one that is waiting", () => {
    const { gate, granted, ask } = gateOf(4);
    const first = ask("first", 2);
    const second = ask("second", 2);
    ask("four", 4);
    ask("one", 1);
    gate.leave(first);
    expect(granted).toEqual(["first", "second"]);
    gate.leave(second);
    expect(granted).toEqual(["first", "second", "four"]);
  });

  it("forgets a request that leaves before its turn", () => {
    const { gate, granted, ask } = gateOf(4);
    const holder = ask("holder", 3);
    gate.leave(ask("gone", 4));
    ask("one", 1);
    expect(granted).toEqual(["holder", "one"]);
    gate.leave(holder);
    ask("three", 3);
    expect(granted).toEqual(["holder", "one", "three"]);
  });

  it("refuses a test bigger than the whole gate", () => {
    expect(() => gateOf(2).ask("four", 4)).toThrow(/1 to 2 pages/);
  });

  // A worker that dies mid-test gives its pages back with its socket.
  it("takes pages back when the holder's connection closes", async () => {
    const server = await startPageGate(4);
    const { port } = server.address();
    try {
      const release = await holdPages(port, 4);
      const waiting = holdPages(port, 1);
      release();
      (await waiting)();
      await expect(holdPages(port, 5)).rejects.toThrow(/refused/);
    } finally {
      server.close();
    }
  });
});

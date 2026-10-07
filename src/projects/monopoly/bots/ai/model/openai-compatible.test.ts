import { describe, expect, it, vi } from "vitest";
import type { ModelRequest } from "./adapter";
import { openAiCompatible } from "./openai-compatible";

const REQUEST: ModelRequest = {
  system: "rules",
  user: "view",
  schemaName: "buy",
  schema: { type: "object" },
  think: false,
};

function reply(content: string, reasoning = ""): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content, reasoning_content: reasoning } }] }),
    { status: 200 },
  );
}

function adapter(fetchImpl: typeof fetch, timeoutMs = 1000) {
  return openAiCompatible({
    baseUrl: "http://model/v1",
    model: "local",
    apiKey: "secret",
    timeoutMs,
    thinkTokens: 100,
    fetch: fetchImpl,
  });
}

describe("openAiCompatible", () => {
  it("asks for the schema-constrained answer and parses it", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(reply('{"choice":"buy"}')));
    const result = await adapter(fetchImpl).complete(REQUEST);
    expect(result).toMatchObject({ ok: true, answer: { choice: "buy" }, thoughts: "" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://model/v1/chat/completions");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.model).toBe("local");
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "buy", schema: { type: "object" } },
    });
    expect(init?.headers).toMatchObject({ Authorization: "Bearer secret" });
  });

  it("reasons first, then answers with that reasoning in context, when thinking", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply("", "Boardwalk is worth it."))
      .mockResolvedValueOnce(reply('{"choice":"buy"}'));
    const result = await adapter(fetchImpl).complete({ ...REQUEST, think: true });
    expect(result).toMatchObject({ ok: true, thoughts: "Boardwalk is worth it." });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const second = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body)) as { messages: { content: string }[] };
    expect(second.messages.map((m) => m.content)).toContain("My reasoning so far:\nBoardwalk is worth it.");
  });

  it("reports an unreachable server", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("fetch failed")));
    expect(await adapter(fetchImpl).complete(REQUEST)).toMatchObject({ ok: false, kind: "unreachable" });
  });

  it("reports a server that doesn't answer before the deadline as a timeout", async () => {
    // Never answers: settles only when the adapter's deadline aborts it.
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    expect(await adapter(fetchImpl, 1).complete(REQUEST)).toMatchObject({ ok: false, kind: "timeout" });
  });

  it("reports a server error status as unreachable", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response("loading model", { status: 503 })));
    expect(await adapter(fetchImpl).complete(REQUEST)).toMatchObject({ ok: false, kind: "unreachable" });
  });

  it("reports an answer that isn't JSON as the model's fault", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(reply("I'd buy it")));
    expect(await adapter(fetchImpl).complete(REQUEST)).toMatchObject({ ok: false, kind: "bad-answer" });
  });
});

import { describe, expect, it, vi } from "vitest";
import type { ModelRequest } from "./adapter";
import { openAiCompatible } from "./openai-compatible";

const REQUEST: ModelRequest = {
  system: "rules",
  user: "view",
  schemaName: "buy",
  schema: { type: "object" },
  think: false,
  thinkTokens: 100,
  sampling: null,
};

function reply(
  content: string,
  reasoning = "",
  extra: { finish_reason?: string; usage?: { prompt_tokens: number; completion_tokens: number } } = {},
): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content, reasoning_content: reasoning }, finish_reason: extra.finish_reason ?? "stop" }],
      usage: extra.usage,
    }),
    { status: 200 },
  );
}

function adapter(fetchImpl: typeof fetch, timeoutMs = 1000) {
  return openAiCompatible({
    baseUrl: "http://model/v1",
    model: "local",
    apiKey: "secret",
    timeoutMs,
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

  it("thinks and answers in one call on a server that can", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(reply('{"choice":"buy"}', "(300 thinking tokens)")));
    const oneCall = openAiCompatible({ baseUrl: "http://model/v1", model: "m", apiKey: null, timeoutMs: 1000, thinksWithAnswer: true, fetch: fetchImpl });
    const result = await oneCall.complete({ ...REQUEST, think: true });
    expect(result).toMatchObject({ ok: true, answer: { choice: "buy" }, thoughts: "(300 thinking tokens)" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true });
    expect(body.response_format).toBeDefined();
    expect(result.metrics.thinkMs).toBeNull();
  });

  it("measures each pass, sums the tokens and notes a thinking pass that ran out of budget", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        reply("", "On and on", { finish_reason: "length", usage: { prompt_tokens: 900, completion_tokens: 100 } }),
      )
      .mockResolvedValueOnce(reply('{"choice":"buy"}', "", { usage: { prompt_tokens: 1000, completion_tokens: 40 } }));
    const result = await adapter(fetchImpl).complete({ ...REQUEST, think: true });
    expect(result.metrics).toMatchObject({ promptTokens: 1900, completionTokens: 140, thinkHitBudget: true });
    expect(result.metrics.thinkMs).not.toBeNull();
    expect(result.metrics.answerMs).not.toBeNull();
  });

  it("sends a version's sampling on both passes, and the thinking budget", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply("", "hm"))
      .mockResolvedValueOnce(reply('{"choice":"buy"}'));
    await adapter(fetchImpl).complete({ ...REQUEST, think: true, sampling: { temperature: 0.3 } });
    const bodies = fetchImpl.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    expect(bodies.map((b) => b.temperature)).toEqual([0.3, 0.3]);
    expect(bodies[0].max_tokens).toBe(100);
  });

  it("names the model from a llama.cpp server's props", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ model_path: "C:/Users/kyle/models/Qwen3.5-9B-Q6_K.gguf" }))),
    );
    expect(await adapter(fetchImpl).identify()).toBe("Qwen3.5-9B-Q6_K.gguf");
    expect(fetchImpl.mock.calls[0][0]).toBe("http://model/props");
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
